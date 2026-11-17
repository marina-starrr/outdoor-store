import type { NextRequest } from "next/server";
import { canTransition, orderStatusInfo, type OrderStatusId } from "../../../../lib/order-status";
import { error, json, requireAdmin } from "../../../../lib/server/auth";
import { invalidateCatalog, productFromRow } from "../../../../lib/server/catalog";
import { tx } from "../../../../lib/server/db";
import { sendMails, type Mail } from "../../../../lib/server/mail";
import { guestOrderEvent, orderEvent, productEvents } from "../../../../lib/server/notifications";
import { findOrder } from "../../../../lib/server/orders";

/** Зміна статусу замовлення. Скасування повертає товари на склад */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/admin/orders/[number]">) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const { number } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const status = body.status as OrderStatusId;
  if (!(status in orderStatusInfo)) return error("Невідомий статус");

  const mails: Mail[] = [];
  const result = await tx(async (q) => {
    // Блокуємо замовлення — два одночасні скасування не повернуть товар на склад двічі
    const found = await findOrder(number, q, true);
    if (!found) return { notFound: true as const };
    const { order, owner } = found;
    if (!canTransition(order.status, status))
      return { invalid: `Не можна змінити статус «${orderStatusInfo[order.status].label}» на «${orderStatusInfo[status].label}»` };

    if (status === "cancelled") {
      for (const line of [...order.lines].sort((a, b) => a.id.localeCompare(b.id))) {
        const [row] = await q.query(
          "update products set stock = stock + $2 where id = $1 returning *, stock - $2 as stock_before",
          [line.id, line.qty],
        );
        if (!row) continue;
        const p = productFromRow(row);
        // Товар повернувся на склад — це теж «з'явився в наявності»
        await productEvents(q, p, { inStock: Number(row.stock_before) > 0, price: p.price }, mails);
      }
    }
    const updatedAt = new Date().toISOString();
    await q.query("update orders set status = $2, updated_at = $3 where number = $1", [number, status, updatedAt]);
    if (owner) await orderEvent(q, owner, order.number, status, mails);
    else guestOrderEvent(order, status, mails);
    return { order: { ...order, status, updatedAt } };
  });

  if ("notFound" in result) return error("Замовлення не знайдено", 404);
  if ("invalid" in result) return error(result.invalid!, 409);
  if (status === "cancelled") invalidateCatalog();
  await sendMails(mails);
  return json({ order: result.order });
}
