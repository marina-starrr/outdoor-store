import type { NextRequest } from "next/server";
import { error, json, requireAdmin } from "../../../../lib/server/auth";
import { invalidateCatalog } from "../../../../lib/server/catalog";
import { reviewFromRow, sql } from "../../../../lib/server/db";
import { isUuid } from "../../../../lib/server/messages";

/** Схвалити або відхилити відгук. Рейтинг товару на сайті оновлюється одразу */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/admin/reviews/[id]">) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const status = body.status;
  if (status !== "approved" && status !== "rejected" && status !== "pending") return error("Невідомий статус");
  const [row] = isUuid(id) ? await sql("update reviews set status = $2 where id = $1 returning *", [id, status]) : [];
  if (!row) return error("Відгук не знайдено", 404);
  invalidateCatalog();
  return json({ review: reviewFromRow(row) });
}

/** Видалити відгук назавжди (напр. спам) */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/admin/reviews/[id]">) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const deleted = isUuid(id) ? await sql("delete from reviews where id = $1 returning id", [id]) : [];
  if (!deleted.length) return error("Відгук не знайдено", 404);
  invalidateCatalog();
  return json({ ok: true });
}
