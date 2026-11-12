import type { NextRequest } from "next/server";
import { canTransition, orderStatusInfo, type OrderStatusId } from "../../../../lib/order-status";
import { error, json, requireAdmin } from "../../../../lib/server/auth";
import { invalidateCatalog, writeCatalog } from "../../../../lib/server/catalog";

/** Зміна статусу замовлення. Скасування повертає товари на склад */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/admin/orders/[number]">) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const { number } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const status = body.status as OrderStatusId;
  if (!(status in orderStatusInfo)) return error("Невідомий статус");

  const result = await writeCatalog((products, db) => {
    const order = db.users.flatMap((u) => u.orders).find((o) => o.number === number);
    if (!order) return { notFound: true as const };
    if (!canTransition(order.status, status))
      return { invalid: `Не можна змінити статус «${orderStatusInfo[order.status].label}» на «${orderStatusInfo[status].label}»` };

    if (status === "cancelled") {
      for (const line of order.lines) {
        const p = products.find((x) => x.id === line.id);
        if (p) {
          p.stock += line.qty;
          p.inStock = p.stock > 0;
        }
      }
    }
    order.status = status;
    order.updatedAt = new Date().toISOString();
    return { order };
  });

  if ("notFound" in result) return error("Замовлення не знайдено", 404);
  if ("invalid" in result) return error(result.invalid!, 409);
  if (status === "cancelled") invalidateCatalog();
  return json({ order: result.order });
}
