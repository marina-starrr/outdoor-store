import type { NextRequest } from "next/server";
import { error, json, requireAdmin } from "../../../../lib/server/auth";
import { sql } from "../../../../lib/server/db";
import { findMessage, isUuid } from "../../../../lib/server/messages";

/** Позначити звернення опрацьованим (або повернути в нові) */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/admin/messages/[id]">) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  if (typeof body.done !== "boolean") return error("Вкажіть done: true/false");

  if (isUuid(id)) await sql("update messages set done = $2 where id = $1", [id, body.done]);
  const message = await findMessage(id);
  if (!message) return error("Звернення не знайдено", 404);
  return json({ message });
}
