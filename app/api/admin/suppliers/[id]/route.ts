import type { NextRequest } from "next/server";
import { cleanText, error, json, requireAdmin } from "../../../../lib/server/auth";
import { deleteSupplier, getSupplier, updateSupplier } from "../../../../lib/server/suppliers";

/** Зміна назви, посилання або відповідності категорій */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/admin/suppliers/[id]">) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (!(await getSupplier(id))) return error("Постачальника не знайдено", 404);
  const body = await req.json().catch(() => ({}));
  const name = body.name === undefined ? undefined : cleanText(body.name, 80);
  const feedUrl = body.feedUrl === undefined ? undefined : cleanText(body.feedUrl, 500);
  if (name !== undefined && name.length < 2) return error("Вкажіть назву постачальника");
  if (feedUrl !== undefined && !/^https:\/\/[^\s"'<>]+$/i.test(feedUrl)) return error("Посилання на файл має починатися з https://");
  const categoryMap = body.categoryMap && typeof body.categoryMap === "object" ? (body.categoryMap as Record<string, string>) : undefined;
  await updateSupplier(id, { name, feedUrl, categoryMap });
  return json({ supplier: await getSupplier(id) });
}

/** Видалити постачальника (товари лишаються на сайті, але більше не оновлюються) */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/admin/suppliers/[id]">) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (!(await getSupplier(id))) return error("Постачальника не знайдено", 404);
  await deleteSupplier(id);
  return json({ ok: true });
}
