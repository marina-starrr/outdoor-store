import type { NextRequest } from "next/server";
import { canTransition, orderStatusInfo, type OrderStatusId } from "../../../../lib/order-status";
import { error, json, requireAdmin } from "../../../../lib/server/auth";
import { invalidateCatalog, writeCatalog } from "../../../../lib/server/catalog";
import { sendMails, type Mail } from "../../../../lib/server/mail";
import { orderEvent, productEvents, snapshot } from "../../../../lib/server/notifications";

/** Зміна статусу замовлення. Скасування повертає товари на склад */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/admin/orders/[number]">) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const { number } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const status = body.status as OrderStatusId;
  if (!(status in orderStatusInfo)) return error("Невідомий статус");

  const mails: Mail[] = [];
  const result = await writeCatalog((products, db) => {
    const owner = db.users.find((u) => u.orders.some((o) => o.number === number));
    const order = owner?.orders.find((o) => o.number === number);
    if (!owner || !order) return { notFound: true as const };
    if (!canTransition(order.status, status))
      return { invalid: `Не можна змінити статус «${orderStatusInfo[order.status].label}» на «${orderStatusInfo[status].label}»` };

    if (status === "cancelled") {
      for (const line of order.lines) {
        const p = products.find((x) => x.id === line.id);
        if (p) {
          const before = snapshot(p);
          p.stock += line.qty;
          p.inStock = p.stock > 0;
          // Товар повернувся на склад — це теж «з'явився в наявності»
          productEvents(db, p, before, mails);
        }
      }
    }
    order.status = status;
    order.updatedAt = new Date().toISOString();
    orderEvent(owner, order.number, status, mails);
    return { order };
  });

  if ("notFound" in result) return error("Замовлення не знайдено", 404);
  if ("invalid" in result) return error(result.invalid!, 409);
  if (status === "cancelled") invalidateCatalog();
  await sendMails(mails);
  return json({ order: result.order });
}
