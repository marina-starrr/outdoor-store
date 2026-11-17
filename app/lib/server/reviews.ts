import "server-only";
import { db, reviewFromRow, type Queryable, type StoredReview, type StoredUser } from "./db";

/*
 * Справжні відгуки покупців. Пише лише покупець з акаунтом (один відгук на
 * товар), на сайті з'являється після схвалення адміністратором. Позначка
 * «Підтверджена покупка» — лише якщо автор справді купував товар.
 * Рейтинг товару рахується тільки зі схвалених відгуків (див. loadCatalog).
 */

export const REVIEW_MIN = 10;
export const REVIEW_MAX = 2000;

/** «Олена Коваль» → «Олена К.» — повне прізвище на сайті не показуємо */
export const reviewAuthor = (u: Pick<StoredUser, "firstName" | "lastName">) =>
  [u.firstName.trim(), u.lastName.trim() ? `${u.lastName.trim()[0]}.` : ""].filter(Boolean).join(" ");

/** Купував товар: є відправлене або виконане замовлення з ним */
export async function hasBought(userId: string, productId: string, q: Queryable = db): Promise<boolean> {
  const [row] = await q.query(
    `select exists(
       select 1 from orders o join order_items i on i.order_number = o.number
       where o.user_id = $1 and i.product_id = $2 and o.status in ('shipped', 'done')
     ) as bought`,
    [userId, productId],
  );
  return !!row?.bought;
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
export async function approvedReviews(productId: string, q: Queryable = db): Promise<PublicReview[]> {
  const rows = await q.query(
    "select * from reviews where product_id = $1 and status = 'approved' order by created_at desc",
    [productId],
  );
  return rows.map((r) => publicReview(reviewFromRow(r)));
}

/** Власний відгук покупця на товар */
export async function ownReview(userId: string, productId: string, q: Queryable = db): Promise<StoredReview | null> {
  const [row] = await q.query("select * from reviews where user_id = $1 and product_id = $2", [userId, productId]);
  return row ? reviewFromRow(row) : null;
}
