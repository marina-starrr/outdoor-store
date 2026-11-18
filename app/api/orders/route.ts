import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  cartTotals,
  deliveryOptions,
  paymentOptions,
  promoCodes,
  resolveLines,
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
import { checkCity } from "../../lib/server/novaposhta";
import { insertOrder, orderPlacedMail, userOrders } from "../../lib/server/orders";
import { newOrderText, notifyAdmin } from "../../lib/server/telegram";

/** Гостьові замовлення: не більше 5 за 30 хвилин з однієї IP-адреси */
const guestOrdersLimited = rateLimiter("guest-order", 5, 30 * 60_000);

/** Історія замовлень поточного користувача */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return error("Потрібно увійти", 401);
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
    return error("Підтвердьте згоду з умовами доставки, повернення та політикою конфіденційності");

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

  const promo = cleanText(body.promo, 20).toUpperCase() || undefined;
  const totals = cartTotals(lines, method, promo && promoCodes[promo] ? promo : undefined);
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
  if (method === "np-branch" || method === "ukrposhta") {
    delivery.branch = cleanText(body.delivery?.branch, 20);
    if (!delivery.branch) return error("Вкажіть відділення");
  }
  if (method === "np-courier") {
    delivery.address = cleanText(body.delivery?.address, 150);
    if (delivery.address.length < 5) return error("Вкажіть адресу");
  }

  // Ліміт рахуємо лише для замовлень, що пройшли перевірку
  if (!user && (await guestOrdersLimited(clientIp(req))))
    return error("Забагато замовлень за короткий час. Спробуйте пізніше або зателефонуйте нам.", 429);

  const claimToken = user ? undefined : randomBytes(24).toString("base64url");
  let order: StoredOrder;
  try {
    // Перевірка залишків і списання — в одній транзакції: списання з умовою
    // stock >= qty атомарне, тож два покупці не куплять одну й ту саму останню одиницю
    order = await tx(async (q) => {
      // Однаковий порядок блокування рядків у всіх транзакціях — без взаємних блокувань
      for (const l of [...lines].sort((a, b) => a.id.localeCompare(b.id))) {
        const [taken] = await q.query(
          "update products set stock = stock - $2 where id = $1 and not hidden and stock >= $2 returning id",
          [l.id, l.qty],
        );
        if (taken) continue;
        const [p] = await q.query("select stock, hidden from products where id = $1", [l.id]);
        const stock = p && !p.hidden ? Number(p.stock) : 0;
        // Помилка відкочує всю транзакцію — уже списані рядки повертаються
        throw new StockError(
          stock > 0
            ? `«${l.product.name}»: на складі залишилось лише ${stock} шт. Зменште кількість у кошику.`
            : `«${l.product.name}» щойно закінчився. Приберіть його з кошика.`,
        );
      }

      const created: Omit<StoredOrder, "number"> = {
        createdAt: new Date().toISOString(),
        status: "new",
        lines: lines.map((l) => ({ id: l.id, name: l.product.name, price: l.product.price, qty: l.qty })),
        subtotal: totals.subtotal,
        promo: totals.promoDiscount ? promo : undefined,
        promoDiscount: totals.promoDiscount,
        shipping: totals.shipping,
        total: totals.total,
        delivery,
        payment,
        contact,
        comment: cleanText(body.comment, 500) || undefined,
        noCall: !!body.noCall,
      };
      if (!user) return insertOrder(q, created, { claimHash: sha256(claimToken!) });

      const saved = await insertOrder(q, created, { userId: user.id });
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

  // Залишки змінились — оновлюємо сторінки каталогу
  invalidateCatalog();
  const mailTo = contact.email || user?.email;
  await Promise.all([
    // Адміністратор дізнається про замовлення одразу
    notifyAdmin(newOrderText(order, !user)),
    mailTo ? sendMail(orderPlacedMail(order, mailTo, !user)) : null,
  ]);
  return json(claimToken ? { order, claimToken } : { order });
}
