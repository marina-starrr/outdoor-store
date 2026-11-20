import type { NextRequest } from "next/server";
import { error, json, requireAdmin } from "../../../../../lib/server/auth";
import { getSupplier, syncSupplier } from "../../../../../lib/server/suppliers";

export const maxDuration = 60;

/** «Оновити зараз»: додати нові товари в наявності, оновити ціни й залишки */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/suppliers/[id]/sync">) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (!(await getSupplier(id))) return error("Постачальника не знайдено", 404);
  try {
    const result = await syncSupplier(id);
    return json({ result, supplier: await getSupplier(id) });
  } catch (e) {
    return json({ error: (e as Error).message, supplier: await getSupplier(id) }, 502);
  }
}
