import type { NextRequest } from "next/server";
import { error, json } from "../../../lib/server/auth";
import { copySupplierPhotos } from "../../../lib/server/supplier-photos";
import { listSuppliers, syncAllSuppliers, syncSupplier, type SyncResult } from "../../../lib/server/suppliers";

export const maxDuration = 60;

/**
 * Щогодинне оновлення цін і залишків постачальників (у постачальників часто
 * лишається 1–2 шт. — раз на добу замало). Викликає pg_cron у Supabase
 * (supabase/manual/cron-suppliers.sql) і, запасним, GitHub Actions — з CRON_SECRET.
 *
 * Хостинг Netlify обриває запит за ~10 с, тож оновлення розбите на короткі виклики:
 * - ?supplier=Ranger  — лише один постачальник (ціни, залишки, нові товари; ~5 с);
 * - ?photos=1         — лише порція фото постачальників у наше сховище (до ?budget= мс, за замовч. 7 с);
 * - без параметрів    — усе разом (усі постачальники + фото до 50 с), як на Vercel.
 * Помилка хоч одного постачальника → 502, щоб запуск став червоним і прийшло сповіщення.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return error("Unauthorized", 401);
  const started = Date.now();
  const sp = req.nextUrl.searchParams;

  if (sp.get("photos") === "1") {
    const budget = Math.min(MAX_PHOTO_BUDGET_MS, Math.max(1_000, Number(sp.get("budget")) || SHORT_PHOTO_BUDGET_MS));
    const photos = await copySupplierPhotos(started + budget).catch((e) => ({ error: (e as Error).message }));
    return json({ ok: !("error" in photos), photos }, "error" in photos ? 502 : 200);
  }

  const name = sp.get("supplier");
  let suppliers: Record<string, SyncResult | { error: string }>;
  if (name) {
    const matching = (await listSuppliers()).filter((s) => s.name.toLowerCase() === name.toLowerCase());
    if (!matching.length) return error(`Постачальника «${name}» не знайдено`, 404);
    suppliers = {};
    for (const s of matching) suppliers[s.name] = await syncSupplier(s.id).catch((e) => ({ error: (e as Error).message }));
  } else {
    suppliers = await syncAllSuppliers();
  }
  const failed = Object.values(suppliers).some((r) => "error" in r);
  // Окремий постачальник — без фото (вони — окремими викликами ?photos=1)
  const photos = name ? undefined : await copySupplierPhotos(started + MAX_PHOTO_BUDGET_MS).catch((e) => ({ error: (e as Error).message }));
  return json({ ok: !failed, suppliers, photos }, failed ? 502 : 200);
}

/** До 50 с від початку запиту (ліміт функції на Vercel — 60 с) */
const MAX_PHOTO_BUDGET_MS = 50_000;
/** Порція фото для короткого виклику (Netlify обриває запит за ~10 с) */
const SHORT_PHOTO_BUDGET_MS = 7_000;
