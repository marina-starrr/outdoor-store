import type { NextRequest } from "next/server";
import { error, json, requireAdmin } from "../../../../lib/server/auth";
import { write } from "../../../../lib/server/db";

/** Позначити звернення опрацьованим (або повернути в нові) */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/admin/messages/[id]">) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  if (typeof body.done !== "boolean") return error("Вкажіть done: true/false");

  const message = await write((db) => {
    const m = db.messages?.find((x) => x.id === id);
    if (m) m.done = body.done;
    return m;
  });
  if (!message) return error("Звернення не знайдено", 404);
  return json({ message });
}
