import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { PLACEHOLDER_PHOTO, UPLOAD_FULL, UPLOAD_SMALL, isUploadedPhoto } from "../../components/photo";
import { invalidateCatalog } from "./catalog";
import { jsonb, sql } from "./db";
import { savePhoto, uploadsEnabled } from "./photo-storage";

/*
 * Фото товарів постачальників — у наше сховище (Supabase Storage).
 *
 * Навіщо: фото з ranger.ua важать 0,5 МБ і більше, і якщо постачальник
 * заборонить показ на чужих сайтах або змінить адреси — фото зникнуть.
 * Копія зменшується до 1600 px (і 800 px для карток), як фото, завантажені в адмінці.
 *
 * Копіюється потроху під час щогодинного оновлення (обмеження за часом),
 * тож усі ~2000 фото переїдуть за кілька днів без ризику для оновлення цін.
 * Фото, які не вдалося скопіювати, лишаються з адресою постачальника.
 */

const FETCH_TIMEOUT = 15_000;
const MAX_SOURCE_BYTES = 15_000_000;

export type PhotoCopyResult = { products: number; photos: number; failed: number; left: number };

/** Ще не наше фото (адреса постачальника) */
const isForeign = (src: string) => /^https?:\/\//i.test(src) && !isUploadedPhoto(src) && src !== PLACEHOLDER_PHOTO;

/** Назва файлу — з адреси джерела: те саме фото не копіюється двічі */
const fileBase = (url: string) => `sp-${createHash("sha256").update(url).digest("hex").slice(0, 24)}`;

async function copyOne(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT), headers: { "User-Agent": "FamilyCampingImport/1.0" } });
  if (!res.ok) throw new Error(`${res.status}`);
  const source = Buffer.from(await res.arrayBuffer());
  if (source.length > MAX_SOURCE_BYTES) throw new Error("завелике");
  const image = sharp(source, { failOn: "error" }).rotate();
  const [full, small] = await Promise.all([
    image.clone().resize({ width: UPLOAD_FULL, height: UPLOAD_FULL, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
    image.clone().resize({ width: UPLOAD_SMALL, height: UPLOAD_SMALL, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
  ]);
  const base = fileBase(url);
  // Спершу мала копія: сайт бере її за адресою великої (…-800 поруч з …-1600)
  await saveOrKeep(`${base}-${UPLOAD_SMALL}.webp`, small);
  return saveOrKeep(`${base}-${UPLOAD_FULL}.webp`, full);
}

/** Файл уже є (попередній запуск обірвався після завантаження) — це не помилка */
async function saveOrKeep(name: string, bytes: Buffer): Promise<string> {
  try {
    return await savePhoto(name, bytes, "webp");
  } catch (e) {
    const message = (e as Error).message;
    if (!/duplicate|already exists|409/i.test(message)) throw e;
    const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
    return `${base}/storage/v1/object/public/product-photos/${name}`;
  }
}

/**
 * Копіює фото товарів постачальників, доки не вичерпано час (deadline — мітка часу).
 * Найпопулярніші товари — першими
 */
export async function copySupplierPhotos(deadline: number): Promise<PhotoCopyResult> {
  const result: PhotoCopyResult = { products: 0, photos: 0, failed: 0, left: 0 };
  if (!uploadsEnabled()) return result;

  const rows = await sql<{ id: string; images: string[] | null; image: string | null }>(
    `select id, images, image from products where supplier_id is not null order by popularity desc`,
  );
  const pending = rows.filter((r) => (r.images ?? []).some(isForeign));
  const failedUrls = new Set<string>();

  for (const row of pending) {
    if (Date.now() > deadline) break;
    const before = row.images ?? [];
    const after: string[] = [];
    for (const src of before) {
      if (!isForeign(src) || Date.now() > deadline) {
        after.push(src);
        continue;
      }
      try {
        after.push(await copyOne(src));
        result.photos++;
      } catch (e) {
        console.error(`[фото постачальника] ${src}: ${(e as Error).message}`);
        failedUrls.add(src);
        result.failed++;
        after.push(src);
      }
    }
    if (after.every((src, i) => src === before[i])) continue;
    // Лише якщо фото за цей час ніхто не змінив в адмінці
    const main = row.image && before.includes(row.image) ? after[before.indexOf(row.image)] : row.image;
    await sql(
      "update products set images = $2::jsonb, image = $3, updated_at = now() where id = $1 and images = $4::jsonb",
      [row.id, jsonb(after), main ?? "", jsonb(before)],
    );
    result.products++;
  }
  // Скільки товарів ще чекають (без тих, де фото не скопіювалось у цьому запуску)
  result.left = pending.filter((r) => (r.images ?? []).some((src) => isForeign(src) && !failedUrls.has(src))).length - result.products;
  if (result.left < 0) result.left = 0;
  if (result.products) invalidateCatalog();
  return result;
}
