import type { NextRequest } from "next/server";
import { error, json } from "../../../lib/server/auth";
import { expireUnpaidOrders } from "../../../lib/server/order-flow";
import { syncAllSuppliers } from "../../../lib/server/suppliers";

export const maxDuration = 60;

/**
 * Щоденно (розклад — у vercel.json):
 * - скасовує підтверджені замовлення, не оплачені за 3 дні, і повертає товар на склад;
 * - оновлює ціни й залишки з файлів постачальників і додає нові товари в наявності.
 * Vercel Cron надсилає Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return error("Unauthorized", 401);
  const cancelled = await expireUnpaidOrders();
  const suppliers = await syncAllSuppliers();
  return json({ ok: true, cancelled, suppliers });
}
