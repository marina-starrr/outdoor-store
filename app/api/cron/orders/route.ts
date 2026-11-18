import type { NextRequest } from "next/server";
import { error, json } from "../../../lib/server/auth";
import { expireUnpaidOrders } from "../../../lib/server/order-flow";

/**
 * Щоденно (розклад — у vercel.json): скасовує підтверджені замовлення, не оплачені
 * за 3 дні, і повертає товар на склад. Vercel Cron надсилає Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return error("Unauthorized", 401);
  return json({ ok: true, cancelled: await expireUnpaidOrders() });
}
