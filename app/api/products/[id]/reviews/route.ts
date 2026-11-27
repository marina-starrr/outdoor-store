import type { NextRequest } from "next/server";
import { cleanText, error, getUser, isSameOrigin, json, knownProductIds, rateLimiter } from "../../../../lib/server/auth";
import { invalidateCatalog } from "../../../../lib/server/catalog";
import { reviewFromRow, sql } from "../../../../lib/server/db";
import { REVIEW_MAX, REVIEW_MIN, approvedReviews, hasBought, ownReview, reviewAuthor } from "../../../../lib/server/reviews";
import { newReviewText, notifyAdmin } from "../../../../lib/server/telegram";

/** Не більше 10 відгуків на годину з одного акаунта */
const limited = rateLimiter("review", 10, 60 * 60_000);

/**
 * Відгуки товару: схвалені + стан для поточного покупця
 * (чи може писати, чи купував, його власний відгук і статус модерації)
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/products/[id]/reviews">) {
  const { id } = await ctx.params;
  if (!(await knownProductIds(id)).has(id)) return error("Товар не знайдено", 404);
  const user = await getUser(req);
  const [reviews, own, bought] = await Promise.all([
    approvedReviews(id),
    user ? ownReview(user.id, id) : null,
    user ? hasBought(user.id, id) : false,
  ]);
  return json({
    reviews,
    mine: own ? { rating: own.rating, text: own.text, status: own.status } : null,
    verifiedBuyer: bought,
    loggedIn: !!user,
  });
}

/** Новий відгук (або зміна свого) — потрапляє на модерацію */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/products/[id]/reviews">) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const { id } = await ctx.params;
  if (!(await knownProductIds(id)).has(id)) return error("Товар не знайдено", 404);
  const user = await getUser(req);
  if (!user) return error("Увійдіть, щоб залишити відгук", 401);

  const body = await req.json().catch(() => ({}));
  const rating = Number(body.rating);
  const text = cleanText(body.text, REVIEW_MAX);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return error("Поставте оцінку від 1 до 5");
  if (text.length < REVIEW_MIN) return error(`Відгук має містити щонайменше ${REVIEW_MIN} символів`);
  if (await limited(user.id)) return error("Забагато відгуків за короткий час. Спробуйте пізніше.", 429);

  // Один відгук на товар: повторний замінює попередній і знову йде на модерацію
  const [row] = await sql(
    `insert into reviews (product_id, user_id, author, rating, text, created_at, status, verified)
     values ($1, $2, $3, $4, $5, now(), 'pending', $6)
     on conflict (product_id, user_id) do update set
       author = excluded.author, rating = excluded.rating, text = excluded.text,
       created_at = excluded.created_at, status = 'pending', verified = excluded.verified
     returning *`,
    [id, user.id, reviewAuthor(user), rating, text, await hasBought(user.id, id)],
  );
  const review = reviewFromRow(row);
  // Якщо змінили вже схвалений відгук — він знову на модерації, рейтинг товару зміниться
  await invalidateCatalog();
  await notifyAdmin(newReviewText(review));
  return json({ mine: { rating: review.rating, text: review.text, status: review.status } });
}
