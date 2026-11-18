import type { NextRequest } from "next/server";
import { error, json } from "../../../lib/server/auth";
import { refreshCities } from "../../../lib/server/novaposhta";

/** Довідник Нової пошти завантажується до хвилини */
export const maxDuration = 120;

/**
 * Щотижневе оновлення довідника міст Нової пошти (розклад — у vercel.json).
 * Vercel Cron надсилає заголовок Authorization: Bearer <CRON_SECRET>;
 * без змінної CRON_SECRET у Vercel маршрут не працює взагалі
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return error("Unauthorized", 401);
  try {
    return json({ ok: true, cities: await refreshCities() });
  } catch (e) {
    console.error("[cron np-cities]", e);
    return error("Не вдалося оновити довідник міст", 502);
  }
}
