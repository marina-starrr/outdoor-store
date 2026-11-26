import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  cartTotals,
  deliveryOptions,
  paymentOptions,
  promoCodes,
  resolveLines,
  shipmentPayment,
  shipments,
  type DeliveryId,
  type PaymentId,
} from "../../components/cart-logic";
import {
  cleanText,
  clientIp,
  error,
  getUser,
  isEmail,
  isPhone,
  isSameOrigin,
  json,
  knownProductIds,
  rateLimiter,
  sanitizeCart,
  sha256,
} from "../../lib/server/auth";
import { invalidateCatalog, loadCatalog } from "../../lib/server/catalog";
import { tx, type StoredOrder } from "../../lib/server/db";
import { setCart } from "../../lib/server/lists";
import { sendMail } from "../../lib/server/mail";
import { checkCity, cityStreets, cityWarehouses, findWarehouse } from "../../lib/server/novaposhta";
import { expireUnpaidOrders } from "../../lib/server/order-flow";
import { insertOrder, orderPlacedMail, userOrders } from "../../lib/server/orders";
import { newOrderText, notifyAdmin } from "../../lib/server/telegram";

/** Гостьові замовлення: не більше 5 за 30 хвилин з однієї IP-адреси */
const guestOrdersLimited = rateLimiter("guest-order", 5, 30 * 60_000);

/** Історія замовлень поточного користувача */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return error("Потрібно увійти", 401);
  // Покупець одразу бачить, що неоплачене вчасно замовлення скасовано
  await expireUnpaidOrders();
  return json({ orders: await userOrders(user.id) });
}

class StockError extends Error {}

/**
 * Оформлення замовлення — і з акаунтом, і без нього (гість).
 * Гість отримує claimToken: за ним браузер пізніше перенесе замовлення в акаунт
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const user = await getUser(req);

  const body = await req.json().catch(() => ({}));
  // Пастка для ботів: приховане поле, яке людина не заповнює
  if (!user && cleanText(body.website, 100)) return error("Не вдалося оформити замовлення");
  if (body.agreed !== true)
    return error("Підтвердьте згоду з умовами доставки й оплати та політикою конфіденційності");

  // Ціни та суми рахуються лише на сервері — дані з браузера не довіряємо
  const catalog = await loadCatalog();
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const lines = resolveLines(sanitizeCart(body.lines, await knownProductIds()), byId);
  if (!lines.length) return error("Кошик порожній");
  if (lines.some((l) => !l.product.inStock))
    return error("Деяких товарів немає в наявності — приберіть їх з кошика");

  const method = body.delivery?.method as DeliveryId;
  if (!deliveryOptions.some((o) => o.id === method)) return error("Оберіть спосіб доставки");
  const payment = body.payment as PaymentId;
  const paymentOption = paymentOptions.find((o) => o.id === payment);
  if (!paymentOption) return error("Оберіть спосіб оплати");

  // Кожен склад (постачальник) — окреме замовлення й окрема посилка
  const parts = shipments(lines);
  if (method === "ukrposhta" && parts.some((s) => s.novaPoshtaOnly))
    return error("Частина товарів відправляється лише Новою поштою — оберіть відділення чи кур'єра Нової пошти");
  if (payment === "cod" && parts.every((s) => s.prepayOnly))
    return error("Ці товари відправляємо лише після передоплати — оберіть «Оплата на рахунок»");

  const promo = cleanText(body.promo, 20).toUpperCase() || undefined;
  const validPromo = promo && promoCodes[promo] ? promo : undefined;
  const totals = cartTotals(lines, method, validPromo);
  if (paymentOption.minTotal && totals.total < paymentOption.minTotal)
    return error(`«${paymentOption.title}» доступна від ${paymentOption.minTotal} ₴`);

  const contact = {
    firstName: cleanText(body.contact?.firstName, 50),
    lastName: cleanText(body.contact?.lastName, 50),
    phone: cleanText(body.contact?.phone, 20),
    email: cleanText(body.contact?.email, 254) || undefined,
  };
  if (contact.firstName.length < 2 || contact.lastName.length < 2) return error("Вкажіть ім'я та прізвище");
  if (!contact.phone || !isPhone(contact.phone)) return error("Перевірте номер телефону");
  // Гостю email потрібен для підтвердження і листів про статус
  if (!user && !contact.email) return error("Вкажіть email — надішлемо на нього підтвердження");
  if (contact.email && !isEmail(contact.email)) return error("Перевірте email");

  // Місто: існує в довіднику Нової пошти, і обраним способом туди можна доставити
  const city = await checkCity(method, cleanText(body.delivery?.cityRef, 60), cleanText(body.delivery?.city, 120));
  // field — щоб браузер показав помилку під полем «Місто»
  if (!city.ok) return json({ error: city.error, field: "city" }, 400);
  const delivery: StoredOrder["delivery"] = { method, city: city.label, ...(city.ref ? { cityRef: city.ref } : {}) };
  const npCity = city.ref && !city.ref.startsWith("s:") ? city.ref : "";
  const fieldError = (field: string, message: string) => json({ error: message, field }, 400);

  if (method === "np-branch") {
    // Відділення — лише зі списку цього міста (якщо Нова пошта відповідає)
    const list = npCity ? await cityWarehouses(npCity) : null;
    if (list) {
      const w = findWarehouse(list, cleanText(body.delivery?.branchRef, 60), cleanText(body.delivery?.branch, 200));
      if (!w) return fieldError("branch", "Оберіть відділення або поштомат зі списку");
      delivery.branch = w.label;
      delivery.branchRef = w.ref;
    } else {
      delivery.branch = cleanText(body.delivery?.branch, 200);
      if (!delivery.branch) return fieldError("branch", "Вкажіть номер відділення");
    }
  }
  if (method === "ukrposhta") {
    delivery.branch = cleanText(body.delivery?.branch, 20).replace(/\s/g, "");
    if (!/^\d{5}$/.test(delivery.branch)) return fieldError("branch", "Вкажіть індекс відділення Укрпошти — 5 цифр");
  }
  if (method === "np-courier") {
    const street = cleanText(body.delivery?.street, 120);
    const streetRef = cleanText(body.delivery?.streetRef, 60);
    const house = cleanText(body.delivery?.house, 20);
    const flat = cleanText(body.delivery?.flat, 20);
    if (street) {
      if (street.length < 2) return fieldError("street", "Вкажіть вулицю");
      // Вулицю обрано зі списку — перевіряємо, що вона справді в цьому місті
      if (npCity && streetRef) {
        const all = await cityStreets(npCity);
        if (all && !all.some((s) => s.ref === streetRef)) return fieldError("street", "Оберіть вулицю зі списку");
      }
      if (!house) return fieldError("house", "Вкажіть номер будинку");
      delivery.street = street;
      if (streetRef) delivery.streetRef = streetRef;
      delivery.house = house;
      if (flat) delivery.flat = flat;
      delivery.address = [street, `буд. ${house}`, flat && `кв. ${flat}`].filter(Boolean).join(", ");
    } else {
      // Старий формат — адреса одним рядком
      delivery.address = cleanText(body.delivery?.address, 150);
      if (delivery.address.length < 5) return fieldError("street", "Вкажіть вулицю і номер будинку");
    }
  }

  // Ліміт рахуємо лише для замовлень, що пройшли перевірку
  if (!user && (await guestOrdersLimited(clientIp(req))))
    return error("Забагато замовлень за короткий час. Спробуйте пізніше або зателефонуйте нам.", 429);

  // Гостю — окремий токен на кожне замовлення (claim_hash унікальний)
  const claimTokens = user ? [] : parts.map(() => randomBytes(24).toString("base64url"));
  let orders: StoredOrder[];
  /** Постачальник і його артикул — для сповіщення в Telegram (щоб одразу замовити в постачальника) */
  const supplierSkus = new Map<string, string>();
  try {
    // Товар лише перевіряється — списується (бронюється) він, коли адміністратор
    // підтверджує замовлення (див. order-flow.ts)
    orders = await tx(async (q) => {
      const onRequest = new Set<string>();
      for (const l of lines) {
        const [p] = await q.query(
          `select p.stock, p.hidden, p.on_request, p.supplier_sku, s.name as supplier
           from products p left join suppliers s on s.id = p.supplier_id where p.id = $1`,
          [l.id],
        );
        if (p?.supplier_sku) supplierSkus.set(l.id, `${p.supplier ?? "постачальник"}, арт. ${p.supplier_sku}`);
        const stock = p && !p.hidden ? Number(p.stock) : 0;
        // «Під замовлення» — кількість уточнить адміністратор у постачальника перед підтвердженням
        if (p?.on_request && stock > 0) {
          onRequest.add(l.id);
          continue;
        }
        if (stock >= l.qty) continue;
        throw new StockError(
          stock > 0
            ? `«${l.product.name}»: на складі залишилось лише ${stock} шт. Зменште кількість у кошику.`
            : `«${l.product.name}» щойно закінчився. Приберіть його з кошика.`,
        );
      }

      const createdAt = new Date().toISOString();
      const comment = cleanText(body.comment, 500) || undefined;
      const saved: StoredOrder[] = [];
      for (const [i, part] of parts.entries()) {
        const t = cartTotals(part.lines, method, validPromo);
        const created: Omit<StoredOrder, "number"> = {
          createdAt,
          status: "new",
          lines: part.lines.map((l) => ({ id: l.id, name: l.product.name, price: l.product.price, qty: l.qty, ...(onRequest.has(l.id) ? { onRequest: true } : {}) })),
          subtotal: t.subtotal,
          promo: t.promoDiscount ? promo : undefined,
          promoDiscount: t.promoDiscount,
          shipping: t.shipping,
          total: t.total,
          delivery,
          // Склад без накладеного платежу — оплата на рахунок, хоч покупець і обрав накладений для решти
          payment: shipmentPayment(part, payment),
          contact,
          comment,
          noCall: !!body.noCall,
        };
        saved.push(await insertOrder(q, created, user ? { userId: user.id } : { claimHash: sha256(claimTokens[i]) }));
      }
      if (!user) return saved;

      await setCart(user.id, [], q);
      // Останні дані доставки; якщо телефону в профілі ще немає — запам'ятовуємо з замовлення
      await q.query(
        "update users set last_delivery = $2::jsonb, phone = case when phone = '' then $3 else phone end where id = $1",
        [user.id, JSON.stringify(delivery), contact.phone],
      );
      return saved;
    });
  } catch (e) {
    if (e instanceof StockError) return error(e.message, 409);
    throw e;
  }

  // Змінилась кількість продажів у каталозі — оновлюємо сторінки
  invalidateCatalog();
  const mailTo = contact.email || user?.email;
  const numbers = orders.map((o) => o.number);
  const related = (o: StoredOrder) => numbers.filter((n) => n !== o.number);
  await Promise.all(
    orders.flatMap((o) => [
      // Адміністратор дізнається про замовлення одразу
      notifyAdmin(newOrderText(o, !user, supplierSkus, related(o))),
      mailTo ? sendMail(orderPlacedMail(o, mailTo, !user, related(o))) : null,
    ]),
  );
  // order / claimToken — перше замовлення (як раніше); orders / claimTokens — усі
  return json({
    order: orders[0],
    orders,
    ...(claimTokens.length ? { claimToken: claimTokens[0], claimTokens } : {}),
  });
}
