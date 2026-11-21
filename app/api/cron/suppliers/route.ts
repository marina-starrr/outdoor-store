import type { NextRequest } from "next/server";
import { error, json } from "../../../lib/server/auth";
import { syncAllSuppliers } from "../../../lib/server/suppliers";

export const maxDuration = 60;

/**
 * Щогодинне оновлення цін і залишків постачальників (у постачальників часто
 * лишається 1–2 шт. — раз на добу замало). Vercel Hobby дозволяє cron лише раз
 * на добу, тож щогодини цей маршрут викликає GitHub Actions
 * (.github/workflows/suppliers-sync.yml) з тим самим CRON_SECRET.
 * Помилка хоч одного постачальника → 502, щоб запуск став червоним і прийшло сповіщення.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return error("Unauthorized", 401);
  const suppliers = await syncAllSuppliers();
  const failed = Object.entries(suppliers).filter(([, r]) => "error" in r);
  return json({ ok: failed.length === 0, suppliers }, failed.length ? 502 : 200);
}
