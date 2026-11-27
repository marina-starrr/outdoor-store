import type { NextRequest } from "next/server";
import { error, json } from "../../../lib/server/auth";
import { expireUnpaidOrders } from "../../../lib/server/order-flow";

export const maxDuration = 60;

/**
 * Щоденно (pg_cron у Supabase — supabase/manual/cron-suppliers.sql): скасовує
 * підтверджені замовлення, не оплачені за 3 дні, і повертає товар на склад.
 * Постачальників оновлює окремий щогодинний виклик (/api/cron/suppliers).
 * Запит — з Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return error("Unauthorized", 401);
  const cancelled = await expireUnpaidOrders();
  return json({ ok: true, cancelled });
}
