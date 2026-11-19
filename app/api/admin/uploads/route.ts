import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { UPLOAD_FULL, UPLOAD_SMALL } from "../../../components/photo";
import { error, json, rateLimiter, requireAdmin } from "../../../lib/server/auth";
import { MAX_FILE_BYTES, detectPhotoType, savePhoto, uploadsEnabled } from "../../../lib/server/photo-storage";

/** Не більше 300 фото на годину — захист від випадкового циклу, а не від адміна */
const limited = rateLimiter("photo-upload", 300, 60 * 60_000);

/** Чи увімкнене завантаження (адмінка показує кнопку або підказку) */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  return json({ enabled: uploadsEnabled() });
}

/**
 * Фото товару. Браузер адміністратора сам зменшує знімок і надсилає два файли:
 * full (до 1600 px) і small (до 800 px). Повертає адресу full — її зберігають у товарі
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  if (!uploadsEnabled()) return error("Завантаження фото не налаштоване: додайте ключі Supabase у Vercel", 503);
  if (await limited(auth.user.id)) return error("Забагато завантажень. Спробуйте за годину.", 429);

  const form = await req.formData().catch(() => null);
  const files = [form?.get("full"), form?.get("small")];
  if (!files.every((f): f is File => f instanceof File)) return error("Надішліть фото");

  const [full, small] = await Promise.all(files.map(async (f) => new Uint8Array(await (f as File).arrayBuffer())));
  if (full.length > MAX_FILE_BYTES || small.length > MAX_FILE_BYTES) return error("Фото завелике — до 2,5 МБ після стиснення");
  const type = detectPhotoType(full);
  if (!type || detectPhotoType(small) !== type) return error("Підтримуються фото JPG і WebP");

  const base = `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
  try {
    await savePhoto(`${base}-${UPLOAD_SMALL}.${type}`, small, type);
    const url = await savePhoto(`${base}-${UPLOAD_FULL}.${type}`, full, type);
    return json({ url });
  } catch (e) {
    console.error("[uploads] не вдалося зберегти фото", e);
    return error("Не вдалося зберегти фото. Спробуйте ще раз.", 502);
  }
}
