import "server-only";
import { randomInt } from "node:crypto";
import { deliveryOptions } from "../../components/cart-logic";
import { formatPrice } from "../../components/catalog-data";
import { sha256 } from "./auth";
import type { Data, StoredOrder, StoredUser } from "./db";
import type { Mail } from "./mail";

/*
 * Замовлення живуть у двох місцях: в акаунтах (user.orders) і серед
 * гостьових (db.guestOrders). Ці функції дають єдиний доступ до обох.
 */

export type OrderRef = { order: StoredOrder; owner: StoredUser | null };

/** Усі замовлення: покупців з акаунтом і гостей */
export function allOrders(db: Data): OrderRef[] {
  return [
    ...db.users.flatMap((owner) => owner.orders.map((order) => ({ order, owner }))),
    ...(db.guestOrders ?? []).map((order) => ({ order: order as StoredOrder, owner: null })),
  ];
}

export const findOrder = (db: Data, number: string) => allOrders(db).find((r) => r.order.number === number);

/** Унікальний номер «FC-» + 7 цифр */
export function newOrderNumber(db: Data) {
  const taken = new Set(allOrders(db).map((r) => r.order.number));
  for (;;) {
    const number = `FC-${String(Date.now()).slice(-5)}${randomInt(10, 100)}`;
    if (!taken.has(number)) return number;
  }
}

/** Гостьове замовлення без службового claimHash — для відповіді в браузер */
export function withoutClaim<T extends StoredOrder>(order: T): StoredOrder {
  const copy: StoredOrder & { claimHash?: string } = { ...order };
  delete copy.claimHash;
  return copy;
}

/**
 * Переносить у акаунт гостьові замовлення, токени яких зберіг браузер
 * покупця. Повертає кількість перенесених
 */
export function claimGuestOrders(db: Data, user: StoredUser, tokens: unknown): number {
  if (!Array.isArray(tokens) || !db.guestOrders?.length) return 0;
  const hashes = new Set(
    tokens.filter((t): t is string => typeof t === "string" && t.length >= 20 && t.length <= 100).slice(0, 50).map(sha256),
  );
  const claimed = db.guestOrders.filter((o) => hashes.has(o.claimHash));
  if (!claimed.length) return 0;
  db.guestOrders = db.guestOrders.filter((o) => !hashes.has(o.claimHash));
  user.orders.push(...claimed.map(withoutClaim));
  user.orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!user.phone) user.phone = claimed[claimed.length - 1].contact.phone;
  return claimed.length;
}

/** Цифри телефону без форматування */
export const phoneDigits = (p: string) => p.replace(/\D/g, "");

/** Що показуємо на сторінці відстеження: без адреси, телефону й email */
export function trackingView(order: StoredOrder) {
  return {
    number: order.number,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    status: order.status,
    lines: order.lines,
    shipping: order.shipping,
    promoDiscount: order.promoDiscount,
    total: order.total,
    delivery: { method: order.delivery.method, city: order.delivery.city },
    payment: order.payment,
  };
}

export const trackHref = (number: string) => `/orders/track?number=${encodeURIComponent(number)}`;

/** Лист-підтвердження нового замовлення */
export function orderPlacedMail(order: StoredOrder, to: string, guest: boolean): Mail {
  const items = order.lines.map((l) => `• ${l.name} × ${l.qty} — ${formatPrice(l.price * l.qty)}`).join("\n");
  const delivery = deliveryOptions.find((o) => o.id === order.delivery.method)?.title ?? "";
  const where = [order.delivery.city, order.delivery.branch && `№ ${order.delivery.branch}`, order.delivery.address].filter(Boolean).join(", ");
  return {
    to,
    subject: `Замовлення ${order.number} прийнято`,
    text:
      `${order.contact.firstName}, дякуємо за замовлення!\n\n${items}\n\n` +
      `Доставка: ${delivery}${where ? `, ${where}` : ""} — ${order.shipping ? formatPrice(order.shipping) : "безкоштовно"}\n` +
      (order.promoDiscount ? `Знижка за промокодом: −${formatPrice(order.promoDiscount)}\n` : "") +
      `Разом: ${formatPrice(order.total)}\n\n` +
      (guest
        ? `Статус замовлення можна перевірити на сайті за номером ${order.number} і вашим телефоном.`
        : "Статус замовлення — у вашому профілі на сайті."),
    href: guest ? trackHref(order.number) : "/account",
  };
}
