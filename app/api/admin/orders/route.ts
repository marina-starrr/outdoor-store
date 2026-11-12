import type { NextRequest } from "next/server";
import { json, requireAdmin } from "../../../lib/server/auth";
import { read } from "../../../lib/server/db";

/** Усі замовлення всіх покупців, найновіші першими */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const orders = await read((db) =>
    db.users
      .flatMap((u) =>
        u.orders.map((o) => ({
          ...o,
          customer: { id: u.id, email: u.email, name: `${u.firstName} ${u.lastName}`.trim() },
        })),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
  return json({ orders });
}
