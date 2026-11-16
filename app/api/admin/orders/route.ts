import type { NextRequest } from "next/server";
import { json, requireAdmin } from "../../../lib/server/auth";
import { read } from "../../../lib/server/db";
import { allOrders, withoutClaim } from "../../../lib/server/orders";

/** Усі замовлення: покупців з акаунтом і гостей, найновіші першими */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const orders = await read((db) =>
    allOrders(db)
      .map(({ order, owner }) => ({
        ...withoutClaim(order),
        customer: owner
          ? { id: owner.id, email: owner.email, name: `${owner.firstName} ${owner.lastName}`.trim(), guest: false }
          : { id: "", email: order.contact.email ?? "", name: `${order.contact.firstName} ${order.contact.lastName}`.trim(), guest: true },
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
  return json({ orders });
}
