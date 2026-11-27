import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataDir, isTestDatabase } from "./db";

/*
 * Сховище фото товарів і сертифікатів на ножі, завантажених в адмін-панелі.
 *
 * - На сайті — Supabase Storage, публічні кошики product-photos і certificates (1 ГБ безкоштовно на все).
 *   Потрібні змінні у Vercel (їх додає інтеграція Vercel ↔ Supabase):
 *     SUPABASE_URL                                    — https://<проєкт>.supabase.co
 *     SUPABASE_SECRET_KEY або SUPABASE_SERVICE_ROLE_KEY — серверний ключ (не публікувати)
 *   Кошики створюються самі під час першого завантаження.
 * - Розробка й тести — тека uploads у теці даних, файли віддає /api/uploads/<назва>.
 *   Тести (FC_DATA_DIR) завжди пишуть лише сюди — ніколи у справжнє сховище.
 */

export const BUCKET = "product-photos";
/** Сертифікати (PDF чи скан) — окремий кошик: кошик фото PDF не приймає */
export const CERT_BUCKET = "certificates";
/** Обмеження одного файлу (зменшене фото 1600 px зазвичай важить 150–500 КБ) */
export const MAX_FILE_BYTES = 2_500_000;

export type PhotoType = "webp" | "jpg";
const FILE_MIME: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", png: "image/png", pdf: "application/pdf", gz: "application/gzip" };
const extOf = (name: string) => name.slice(name.lastIndexOf(".") + 1);

type BucketConfig = { id: string; sizeLimit: number; mimes: string[] };
const PHOTO_BUCKET: BucketConfig = { id: BUCKET, sizeLimit: MAX_FILE_BYTES, mimes: [FILE_MIME.webp, FILE_MIME.jpg] };

const supabaseUrl = () => (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseKey = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

type Mode = "supabase" | "local" | null;

function mode(): Mode {
  if (isTestDatabase()) return "local";
  if (supabaseUrl() && supabaseKey()) return "supabase";
  // На Vercel диск не зберігається — без Supabase завантаження вимкнене
  return process.env.VERCEL ? null : "local";
}

/** Чи можна завантажувати файли (інакше адмінка пропонує посилання) */
export const uploadsEnabled = () => mode() !== null;

/** Тип файлу за вмістом (а не за назвою чи заголовком браузера) */
export function detectPhotoType(bytes: Uint8Array): PhotoType | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}

const PHOTO_NAME = /^[a-z0-9-]{8,80}\.(webp|jpg)$/;
const CERT_NAME = /^cert-[a-z0-9-]{8,80}\.(pdf|jpg|png)$/;
const CATALOG_NAME = /^catalog-v\d{1,15}-[a-f0-9]{12}\.json\.gz$/;

/** Назва файлу, яку приймає сховище і /api/uploads: фото, сертифікат (cert-…) або знімок каталогу */
export const isStoredName = (name: string) => PHOTO_NAME.test(name) || CERT_NAME.test(name) || CATALOG_NAME.test(name);

/** Знімки каталогу (стиснутий JSON) — окремий публічний кошик */
export const CATALOG_BUCKET = "catalog";
const CATALOG_STORE: BucketConfig = { id: CATALOG_BUCKET, sizeLimit: 20_000_000, mimes: ["application/gzip"] };

/** Зберігає знімок каталогу; повертає адресу */
export function saveCatalogFile(name: string, bytes: Uint8Array): Promise<string> {
  if (!CATALOG_NAME.test(name)) throw new Error(`Недопустима назва файлу: ${name}`);
  return saveFile(CATALOG_STORE, name, bytes);
}

/** Читає знімок каталогу за адресою (на сайті — через CDN Supabase, у тестах — з теки) */
export async function readCatalogFile(url: string): Promise<Uint8Array> {
  const name = url.split("/").pop() ?? "";
  if (!CATALOG_NAME.test(name)) throw new Error(`Недопустима адреса знімка: ${url}`);
  if (mode() === "local") {
    const file = await readLocalPhoto(name);
    if (!file) throw new Error(`Знімка немає: ${name}`);
    return new Uint8Array(file.bytes);
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Знімок каталогу: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Видаляє старий знімок (без помилки, якщо його вже немає) */
export async function deleteCatalogFile(url: string): Promise<void> {
  const name = url.split("/").pop() ?? "";
  if (!CATALOG_NAME.test(name)) return;
  if (mode() === "local") {
    await rm(join(localDir(), name), { force: true });
    return;
  }
  if (mode() !== "supabase") return;
  await fetch(`${supabaseUrl()}/storage/v1/object/${CATALOG_BUCKET}/${name}`, {
    method: "DELETE",
    headers: { apikey: supabaseKey(), Authorization: `Bearer ${supabaseKey()}` },
  });
}

const localDir = () => join(dataDir(), "uploads");

/** Зберігає фото і повертає його публічну адресу */
export function savePhoto(name: string, bytes: Uint8Array, type: PhotoType): Promise<string> {
  if (!PHOTO_NAME.test(name) || extOf(name) !== type) throw new Error(`Недопустима назва файлу: ${name}`);
  return saveFile(PHOTO_BUCKET, name, bytes);
}

/** Зберігає сертифікат (PDF, JPG чи PNG) і повертає його публічну адресу */
export function saveCertificateFile(name: string, bytes: Uint8Array, sizeLimit: number): Promise<string> {
  if (!CERT_NAME.test(name)) throw new Error(`Недопустима назва файлу: ${name}`);
  return saveFile({ id: CERT_BUCKET, sizeLimit, mimes: [FILE_MIME.pdf, FILE_MIME.jpg, FILE_MIME.png] }, name, bytes);
}

async function saveFile(bucket: BucketConfig, name: string, bytes: Uint8Array): Promise<string> {
  const m = mode();
  if (m === "local") {
    await mkdir(localDir(), { recursive: true });
    await writeFile(join(localDir(), name), bytes);
    return `/api/uploads/${name}`;
  }
  if (m !== "supabase") throw new Error("Сховище файлів не налаштоване");

  const upload = () =>
    fetch(`${supabaseUrl()}/storage/v1/object/${bucket.id}/${name}`, {
      method: "POST",
      headers: {
        apikey: supabaseKey(),
        Authorization: `Bearer ${supabaseKey()}`,
        "Content-Type": FILE_MIME[extOf(name)],
        // Назва файлу унікальна й не змінюється — браузер і CDN кешують його на рік
        "Cache-Control": "max-age=31536000, immutable",
        "x-upsert": "false",
      },
      body: Buffer.from(bytes),
    });

  let res = await upload();
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (!/bucket not found/i.test(text)) throw new Error(`Supabase Storage ${res.status}: ${text.slice(0, 200)}`);
    await createBucket(bucket);
    res = await upload();
    if (!res.ok) throw new Error(`Supabase Storage ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  return `${supabaseUrl()}/storage/v1/object/public/${bucket.id}/${name}`;
}

/** Публічний кошик лише для потрібних типів файлів і розміру */
async function createBucket(bucket: BucketConfig) {
  const res = await fetch(`${supabaseUrl()}/storage/v1/bucket`, {
    method: "POST",
    headers: { apikey: supabaseKey(), Authorization: `Bearer ${supabaseKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: bucket.id,
      name: bucket.id,
      public: true,
      file_size_limit: bucket.sizeLimit,
      allowed_mime_types: bucket.mimes,
    }),
  });
  // 409 / «already exists» — кошик створив паралельний запит
  if (!res.ok && res.status !== 409) {
    const text = await res.text().catch(() => "");
    if (!/already exists/i.test(text)) throw new Error(`Supabase Storage: не вдалося створити кошик (${res.status}) ${text.slice(0, 200)}`);
  }
}

/** Локальний файл для /api/uploads (лише в розробці й тестах) */
export async function readLocalPhoto(name: string): Promise<{ bytes: Buffer; type: string } | null> {
  if (mode() !== "local" || !isStoredName(name)) return null;
  try {
    const bytes = await readFile(join(localDir(), name));
    return { bytes, type: FILE_MIME[extOf(name)] };
  } catch {
    return null;
  }
}
