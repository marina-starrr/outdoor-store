import { randomInt } from "node:crypto";
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
import { withDerived } from "../../components/catalog-data";
import {
  cleanText,
  error,
  getUser,
  isEmail,
  isPhone,
  isSameOrigin,
  json,
  knownProductIds,
  sanitizeCart,
} from "../../lib/server/auth";
import { invalidateCatalog, loadCatalog, writeCatalog } from "../../lib/server/catalog";
import type { StoredOrder } from "../../lib/server/db";

/** Історія замовлень поточного користувача */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return error("Потрібно увійти", 401);
  return json({ orders: [...user.orders].reverse() });
}

class StockError extends Error {}

/** Оформлення замовлення — лише для авторизованих користувачів */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const user = await getUser(req);
  if (!user) return error("Увійдіть, щоб оформити замовлення", 401);

  const body = await req.json().catch(() => ({}));
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
    return error("Оплата частинами доступна від 3 000 ₴");

  const contact = {
    firstName: cleanText(body.contact?.firstName, 50),
    lastName: cleanText(body.contact?.lastName, 50),
    phone: cleanText(body.contact?.phone, 20),
    email: cleanText(body.contact?.email, 254) || undefined,
  };
  if (contact.firstName.length < 2 || contact.lastName.length < 2) return error("Вкажіть ім'я та прізвище");
  if (!contact.phone || !isPhone(contact.phone)) return error("Перевірте номер телефону");
  if (contact.email && !isEmail(contact.email)) return error("Перевірте email");

  const delivery: StoredOrder["delivery"] = { method, city: cleanText(body.delivery?.city, 60) };
  if (delivery.city!.length < 2) return error("Вкажіть місто");
  if (method === "np-branch" || method === "ukrposhta") {
    delivery.branch = cleanText(body.delivery?.branch, 20);
    if (!delivery.branch) return error("Вкажіть відділення");
  }
  if (method === "np-courier") {
    delivery.address = cleanText(body.delivery?.address, 150);
    if (delivery.address.length < 5) return error("Вкажіть адресу");
  }

  let order: StoredOrder;
  try {
    // Перевірка залишків і списання — в одному записі, щоб два покупці
    // не купили одну й ту саму останню одиницю
    order = await writeCatalog((products, db) => {
      for (const l of lines) {
        const p = products.find((x) => x.id === l.id);
        const stock = p && !p.hidden ? withDerived(p).stock : 0;
        if (stock < l.qty)
          throw new StockError(
            stock > 0
              ? `«${l.product.name}»: на складі залишилось лише ${stock} шт. Зменште кількість у кошику.`
              : `«${l.product.name}» щойно закінчився. Приберіть його з кошика.`,
          );
      }
      for (const l of lines) {
        const p = products.find((x) => x.id === l.id)!;
        p.stock -= l.qty;
        p.inStock = p.stock > 0;
      }

      const u = db.users.find((x) => x.id === user.id)!;
      const created: StoredOrder = {
        number: `FC-${String(Date.now()).slice(-5)}${randomInt(10, 99)}`,
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
      u.orders.push(created);
      u.cart = [];
      u.lastDelivery = delivery;
      // Якщо телефону в профілі ще немає — запам'ятовуємо з замовлення
      if (!u.phone) u.phone = contact.phone;
      return created;
    });
  } catch (e) {
    if (e instanceof StockError) return error(e.message, 409);
    throw e;
  }

  // Залишки змінились — оновлюємо сторінки каталогу
  invalidateCatalog();
  return json({ order });
}
