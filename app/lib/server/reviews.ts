import "server-only";
import type { Data, StoredReview, StoredUser } from "./db";
import { allOrders } from "./orders";

/*
 * Справжні відгуки покупців. Пише лише покупець з акаунтом (один відгук на
 * товар), на сайті з'являється після схвалення адміністратором. Позначка
 * «Підтверджена покупка» — лише якщо автор справді купував товар.
 * Рейтинг товару рахується тільки зі схвалених відгуків.
 */

export const REVIEW_MIN = 10;
export const REVIEW_MAX = 2000;

/** «Олена Коваль» → «Олена К.» — повне прізвище на сайті не показуємо */
export const reviewAuthor = (u: Pick<StoredUser, "firstName" | "lastName">) =>
  [u.firstName.trim(), u.lastName.trim() ? `${u.lastName.trim()[0]}.` : ""].filter(Boolean).join(" ");

/** Купував товар: є відправлене або виконане замовлення з ним */
export const hasBought = (u: StoredUser, productId: string) =>
  u.orders.some((o) => (o.status === "shipped" || o.status === "done") && o.lines.some((l) => l.id === productId));

/** Середня оцінка і кількість схвалених відгуків по товарах */
export function reviewStats(db: Data) {
  const sums = new Map<string, { sum: number; count: number }>();
  for (const r of db.reviews ?? []) {
    if (r.status !== "approved") continue;
    const s = sums.get(r.productId) ?? { sum: 0, count: 0 };
    s.sum += r.rating;
    s.count++;
    sums.set(r.productId, s);
  }
  return new Map([...sums].map(([id, s]) => [id, { rating: Math.round((s.sum / s.count) * 10) / 10, reviews: s.count }]));
}

/** Продано штук кожного товару (замовлення без скасованих) */
export function soldCounts(db: Data) {
  const sold = new Map<string, number>();
  for (const { order } of allOrders(db)) {
    if (order.status === "cancelled") continue;
    for (const l of order.lines) sold.set(l.id, (sold.get(l.id) ?? 0) + l.qty);
  }
  return sold;
}

/** Що бачать відвідувачі сайту */
export const publicReview = (r: StoredReview) => ({
  id: r.id,
  author: r.author,
  rating: r.rating,
  text: r.text,
  createdAt: r.createdAt,
  verified: r.verified,
});

export type PublicReview = ReturnType<typeof publicReview>;

/** Схвалені відгуки товару, найновіші першими */
export const approvedReviews = (db: Data, productId: string) =>
  (db.reviews ?? [])
    .filter((r) => r.productId === productId && r.status === "approved")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(publicReview);
