import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataDir, isTestDatabase } from "./db";

/*
 * Сховище фото товарів, завантажених в адмін-панелі.
 *
 * - На сайті — Supabase Storage, публічний кошик product-photos (1 ГБ безкоштовно).
 *   Потрібні змінні у Vercel (їх додає інтеграція Vercel ↔ Supabase):
 *     SUPABASE_URL                                    — https://<проєкт>.supabase.co
 *     SUPABASE_SECRET_KEY або SUPABASE_SERVICE_ROLE_KEY — серверний ключ (не публікувати)
 *   Кошик створюється сам під час першого завантаження.
 * - Розробка й тести — тека uploads у теці даних, файли віддає /api/uploads/<назва>.
 *   Тести (FC_DATA_DIR) завжди пишуть лише сюди — ніколи у справжнє сховище.
 */

export const BUCKET = "product-photos";
/** Обмеження одного файлу (зменшене фото 1600 px зазвичай важить 150–500 КБ) */
export const MAX_FILE_BYTES = 2_500_000;

export type PhotoType = "webp" | "jpg";
const MIME: Record<PhotoType, string> = { webp: "image/webp", jpg: "image/jpeg" };

const supabaseUrl = () => (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseKey = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

type Mode = "supabase" | "local" | null;

function mode(): Mode {
  if (isTestDatabase()) return "local";
  if (supabaseUrl() && supabaseKey()) return "supabase";
  // На Vercel диск не зберігається — без Supabase завантаження вимкнене
  return process.env.VERCEL ? null : "local";
}

/** Чи можна завантажувати фото (інакше адмінка пропонує посилання) */
export const uploadsEnabled = () => mode() !== null;

/** Тип файлу за вмістом (а не за назвою чи заголовком браузера) */
export function detectPhotoType(bytes: Uint8Array): PhotoType | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}

/** Назва файлу, яку приймає сховище і /api/uploads */
export const isStoredName = (name: string) => /^[a-z0-9-]{8,80}\.(webp|jpg)$/.test(name);

const localDir = () => join(dataDir(), "uploads");

/** Зберігає файл і повертає його публічну адресу */
export async function savePhoto(name: string, bytes: Uint8Array, type: PhotoType): Promise<string> {
  if (!isStoredName(name)) throw new Error(`Недопустима назва файлу: ${name}`);
  const m = mode();
  if (m === "local") {
    await mkdir(localDir(), { recursive: true });
    await writeFile(join(localDir(), name), bytes);
    return `/api/uploads/${name}`;
  }
  if (m !== "supabase") throw new Error("Сховище фото не налаштоване");

  const upload = () =>
    fetch(`${supabaseUrl()}/storage/v1/object/${BUCKET}/${name}`, {
      method: "POST",
      headers: {
        apikey: supabaseKey(),
        Authorization: `Bearer ${supabaseKey()}`,
        "Content-Type": MIME[type],
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
    await createBucket();
    res = await upload();
    if (!res.ok) throw new Error(`Supabase Storage ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  return `${supabaseUrl()}/storage/v1/object/public/${BUCKET}/${name}`;
}

/** Публічний кошик лише для фото (webp/jpeg, до 2,5 МБ) */
async function createBucket() {
  const res = await fetch(`${supabaseUrl()}/storage/v1/bucket`, {
    method: "POST",
    headers: { apikey: supabaseKey(), Authorization: `Bearer ${supabaseKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: MAX_FILE_BYTES,
      allowed_mime_types: Object.values(MIME),
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
    return { bytes, type: MIME[name.endsWith(".webp") ? "webp" : "jpg"] };
  } catch {
    return null;
  }
}
