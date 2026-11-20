import type { NextRequest } from "next/server";
import { cleanText, error, json, requireAdmin } from "../../../lib/server/auth";
import { createSupplier, listSuppliers } from "../../../lib/server/suppliers";

/** Перевірка файлу постачальника може тривати (файл на кілька мегабайт) */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  return json({ suppliers: await listSuppliers() });
}

/** Новий постачальник: { name, feedUrl } — файл одразу перевіряється, товари ще не додаються */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => ({}));
  const name = cleanText(body.name, 80);
  const feedUrl = cleanText(body.feedUrl, 500);
  if (name.length < 2) return error("Вкажіть назву постачальника");
  if (!/^https:\/\/[^\s"'<>]+$/i.test(feedUrl)) return error("Посилання на файл має починатися з https://");
  try {
    return json({ supplier: await createSupplier(name, feedUrl) }, 201);
  } catch (e) {
    return error((e as Error).message, 400);
  }
}
