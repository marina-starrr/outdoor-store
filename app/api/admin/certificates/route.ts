import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { MAX_CERTIFICATE_BYTES, detectCertificateType } from "../../../lib/certificates";
import { error, json, rateLimiter, requireAdmin } from "../../../lib/server/auth";
import { invalidateCatalog, loadProducts, setCertificate, setCertificateExempt } from "../../../lib/server/catalog";
import { sql, tx } from "../../../lib/server/db";
import { saveCertificateFile, uploadsEnabled } from "../../../lib/server/photo-storage";

/*
 * Сертифікати на ножі (висновок експерта «не є холодною зброєю»).
 * - POST (форма): file + id (один чи кілька товарів — кольори однієї моделі мають спільний документ);
 * - PATCH { id, certificate: null } — прибрати документ; { id, exempt } — «документ не потрібен».
 * Відповідь — оновлені товари, як у списку адмін-панелі.
 */

const limited = rateLimiter("certificate-upload", 300, 60 * 60_000);
const MAX_PRODUCTS = 50;

/** Колонок ще немає — міграцію не запущено */
const MIGRATION_HINT = "Спершу запустіть міграцію supabase/migrations/20261127000000_certificates.sql у Supabase → SQL Editor";
const isMissingColumn = (e: unknown) => (e as { code?: string })?.code === "42703";

/** Оновлені товари для списку адмінки (з описами — їх редагують у картці) */
const productsByIds = (ids: string[]) => loadProducts(ids, { descriptions: true });

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  if (!uploadsEnabled()) return error("Завантаження файлів не налаштоване: додайте ключі Supabase у Vercel", 503);
  if (await limited(auth.user.id)) return error("Забагато завантажень. Спробуйте за годину.", 429);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const ids = [...new Set((form?.getAll("id") ?? []).map(String).filter((s) => /^[a-z0-9-]{1,60}$/.test(s)))];
  if (!(file instanceof File)) return error("Надішліть файл сертифіката");
  if (!ids.length || ids.length > MAX_PRODUCTS) return error("Оберіть товари для сертифіката");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > MAX_CERTIFICATE_BYTES) return error(`«${file.name}» завеликий — до 4 МБ. Стисніть PDF (напр., ilovepdf.com) і спробуйте ще раз.`);
  const type = detectCertificateType(bytes);
  if (!type) return error(`«${file.name}»: підтримуються PDF, JPG і PNG`);

  const [{ n }] = await sql("select count(*)::int as n from products where id = any($1::text[])", [ids]);
  if (n !== ids.length) return error("Товар не знайдено — оновіть сторінку", 404);

  let url: string;
  try {
    url = await saveCertificateFile(`cert-${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${type}`, bytes, MAX_CERTIFICATE_BYTES);
  } catch (e) {
    console.error("[certificates] не вдалося зберегти файл", e);
    return error("Не вдалося зберегти файл. Спробуйте ще раз.", 502);
  }
  try {
    await tx((q) => setCertificate(q, ids, url));
  } catch (e) {
    if (isMissingColumn(e)) return error(MIGRATION_HINT, 409);
    throw e;
  }
  await invalidateCatalog();
  return json({ url, products: await productsByIds(ids) });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; certificate?: unknown; exempt?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return error("Не вказано товар");
  if (!("certificate" in body && body.certificate === null) && typeof body.exempt !== "boolean") return error("Нічого змінювати");

  try {
    const found = await tx(async (q) => {
      if ("certificate" in body && body.certificate === null) {
        if (!(await setCertificate(q, [id], null)).length) return false;
      }
      if (typeof body.exempt === "boolean" && !(await setCertificateExempt(q, id, body.exempt))) return false;
      return true;
    });
    if (!found) return error("Товар не знайдено", 404);
  } catch (e) {
    if (isMissingColumn(e)) return error(MIGRATION_HINT, 409);
    throw e;
  }
  await invalidateCatalog();
  return json({ products: await productsByIds([id]) });
}
