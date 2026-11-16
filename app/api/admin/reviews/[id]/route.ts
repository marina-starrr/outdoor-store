import type { NextRequest } from "next/server";
import { error, json, requireAdmin } from "../../../../lib/server/auth";
import { invalidateCatalog } from "../../../../lib/server/catalog";
import { write } from "../../../../lib/server/db";

/** Схвалити або відхилити відгук. Рейтинг товару на сайті оновлюється одразу */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/admin/reviews/[id]">) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const status = body.status;
  if (status !== "approved" && status !== "rejected" && status !== "pending") return error("Невідомий статус");
  const review = await write((db) => {
    const r = (db.reviews ?? []).find((x) => x.id === id);
    if (r) r.status = status;
    return r ?? null;
  });
  if (!review) return error("Відгук не знайдено", 404);
  invalidateCatalog();
  return json({ review });
}

/** Видалити відгук назавжди (напр. спам) */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/admin/reviews/[id]">) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const found = await write((db) => {
    const before = db.reviews?.length ?? 0;
    db.reviews = (db.reviews ?? []).filter((r) => r.id !== id);
    return db.reviews.length < before;
  });
  if (!found) return error("Відгук не знайдено", 404);
  invalidateCatalog();
  return json({ ok: true });
}
