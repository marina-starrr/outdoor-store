import type { NextRequest } from "next/server";
import { json, requireAdmin } from "../../../lib/server/auth";
import { expireUnpaidOrders } from "../../../lib/server/order-flow";
import { loadOrders } from "../../../lib/server/orders";

/** Усі замовлення: покупців з акаунтом і гостей, найновіші першими */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  // Прострочені неоплачені скасовуємо одразу, не чекаючи щоденного cron
  await expireUnpaidOrders();
  const orders = (await loadOrders("true")).map(({ order, owner }) => ({
    ...order,
    customer: owner
      ? { id: owner.id, email: owner.email, name: `${owner.firstName} ${owner.lastName}`.trim(), guest: false }
      : { id: "", email: order.contact.email ?? "", name: `${order.contact.firstName} ${order.contact.lastName}`.trim(), guest: true },
  }));
  return json({ orders });
}
