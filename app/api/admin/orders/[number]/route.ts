import type { NextRequest } from "next/server";
import { orderStatusInfo, type OrderStatusId } from "../../../../lib/order-status";
import { error, json, requireAdmin } from "../../../../lib/server/auth";
import { changeOrderStatus } from "../../../../lib/server/order-flow";

/**
 * Зміна статусу замовлення. Підтвердження бронює товар (списує зі складу),
 * скасування повертає заброньований товар на склад
 */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/admin/orders/[number]">) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const { number } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const status = body.status as OrderStatusId;
  if (!(status in orderStatusInfo)) return error("Невідомий статус");

  const result = await changeOrderStatus(number, status);
  if ("notFound" in result) return error("Замовлення не знайдено", 404);
  if ("error" in result) return error(result.error, 409);
  return json({ order: result.order });
}
