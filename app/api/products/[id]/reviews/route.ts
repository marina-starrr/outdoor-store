import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { cleanText, error, getUser, isSameOrigin, json, knownProductIds, rateLimiter } from "../../../../lib/server/auth";
import { invalidateCatalog } from "../../../../lib/server/catalog";
import { read, write } from "../../../../lib/server/db";
import { REVIEW_MAX, REVIEW_MIN, approvedReviews, hasBought, reviewAuthor } from "../../../../lib/server/reviews";
import { newReviewText, notifyAdmin } from "../../../../lib/server/telegram";

/** Не більше 10 відгуків на годину з одного акаунта */
const limited = rateLimiter(10, 60 * 60_000);

/**
 * Відгуки товару: схвалені + стан для поточного покупця
 * (чи може писати, чи купував, його власний відгук і статус модерації)
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/products/[id]/reviews">) {
  const { id } = await ctx.params;
  if (!(await knownProductIds()).has(id)) return error("Товар не знайдено", 404);
  const user = await getUser(req);
  const data = await read((db) => {
    const own = user && (db.reviews ?? []).find((r) => r.productId === id && r.userId === user.id);
    return {
      reviews: approvedReviews(db, id),
      mine: own ? { rating: own.rating, text: own.text, status: own.status } : null,
      verifiedBuyer: !!user && hasBought(user, id),
      loggedIn: !!user,
    };
  });
  return json(data);
}

/** Новий відгук (або зміна свого) — потрапляє на модерацію */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/products/[id]/reviews">) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const { id } = await ctx.params;
  if (!(await knownProductIds()).has(id)) return error("Товар не знайдено", 404);
  const user = await getUser(req);
  if (!user) return error("Увійдіть, щоб залишити відгук", 401);

  const body = await req.json().catch(() => ({}));
  const rating = Number(body.rating);
  const text = cleanText(body.text, REVIEW_MAX);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return error("Поставте оцінку від 1 до 5");
  if (text.length < REVIEW_MIN) return error(`Відгук має містити щонайменше ${REVIEW_MIN} символів`);
  if (limited(user.id)) return error("Забагато відгуків за короткий час. Спробуйте пізніше.", 429);

  const review = await write((db) => {
    const list = (db.reviews ??= []);
    const u = db.users.find((x) => x.id === user.id)!;
    const existing = list.find((r) => r.productId === id && r.userId === user.id);
    const fields = {
      author: reviewAuthor(u),
      rating,
      text,
      createdAt: new Date().toISOString(),
      // Змінений відгук знову проходить модерацію
      status: "pending" as const,
      verified: hasBought(u, id),
    };
    if (existing) return Object.assign(existing, fields);
    const created = { id: randomUUID(), productId: id, userId: user.id, ...fields };
    list.push(created);
    return created;
  });
  // Якщо змінили вже схвалений відгук — він знову на модерації, рейтинг товару зміниться
  invalidateCatalog();
  await notifyAdmin(newReviewText(review));
  return json({ mine: { rating: review.rating, text: review.text, status: review.status } });
}
