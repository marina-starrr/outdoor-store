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
import {
  cleanText,
  error,
  getUser,
  isEmail,
  isPhone,
  isSameOrigin,
  json,
  sanitizeCart,
} from "../../lib/server/auth";
import { write, type StoredOrder } from "../../lib/server/db";

/** Історія замовлень поточного користувача */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return error("Потрібно увійти", 401);
  return json({ orders: [...user.orders].reverse() });
}

/** Оформлення замовлення — лише для авторизованих користувачів */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const user = await getUser(req);
  if (!user) return error("Увійдіть, щоб оформити замовлення", 401);

  const body = await req.json().catch(() => ({}));

  // Ціни та суми рахуються лише на сервері — дані з браузера не довіряємо
  const lines = resolveLines(sanitizeCart(body.lines));
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

  const delivery: StoredOrder["delivery"] = { method };
  if (method !== "pickup") {
    delivery.city = cleanText(body.delivery?.city, 60);
    if (delivery.city.length < 2) return error("Вкажіть місто");
  }
  if (method === "np-branch" || method === "ukrposhta") {
    delivery.branch = cleanText(body.delivery?.branch, 20);
    if (!delivery.branch) return error("Вкажіть відділення");
  }
  if (method === "np-courier") {
    delivery.address = cleanText(body.delivery?.address, 150);
    if (delivery.address.length < 5) return error("Вкажіть адресу");
  }

  const order = await write((db) => {
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

  return json({ order });
}
