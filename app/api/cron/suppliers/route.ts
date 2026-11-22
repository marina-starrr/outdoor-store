import type { NextRequest } from "next/server";
import { error, json } from "../../../lib/server/auth";
import { copySupplierPhotos } from "../../../lib/server/supplier-photos";
import { syncAllSuppliers } from "../../../lib/server/suppliers";

export const maxDuration = 60;

/**
 * Щогодинне оновлення цін і залишків постачальників (у постачальників часто
 * лишається 1–2 шт. — раз на добу замало). Vercel Hobby дозволяє cron лише раз
 * на добу, тож щогодини цей маршрут викликає pg_cron у Supabase
 * (supabase/manual/cron-suppliers.sql) і, запасним, GitHub Actions
 * (.github/workflows/suppliers-sync.yml; GitHub запускає розклад нерегулярно) — з тим самим CRON_SECRET.
 * Помилка хоч одного постачальника → 502, щоб запуск став червоним і прийшло сповіщення.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return error("Unauthorized", 401);
  const started = Date.now();
  const suppliers = await syncAllSuppliers();
  const failed = Object.entries(suppliers).filter(([, r]) => "error" in r);
  // Залишок часу — на копіювання фото постачальників у наше сховище (потроху щогодини)
  const photos = await copySupplierPhotos(started + PHOTO_BUDGET_MS).catch((e) => ({ error: (e as Error).message }));
  return json({ ok: failed.length === 0, suppliers, photos }, failed.length ? 502 : 200);
}

/** До 50 с від початку запиту (ліміт функції — 60 с) */
const PHOTO_BUDGET_MS = 50_000;
