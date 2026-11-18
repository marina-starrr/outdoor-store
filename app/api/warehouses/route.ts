import type { NextRequest } from "next/server";
import { clientIp, error, json, rateLimiter } from "../../lib/server/auth";
import { cityWarehouses, filterWarehouses } from "../../lib/server/novaposhta";

/** Список відкривається й фільтрується на кожну літеру — ліміт щедрий */
const limited = rateLimiter("warehouses", 120, 60_000);

/**
 * Відділення й поштомати Нової пошти в обраному місті:
 * /api/warehouses?cityRef=…&q=12 (номер) або q=Соборна (вулиця)
 * available=false — Нова пошта не відповідає, номер вводиться вручну
 */
export async function GET(req: NextRequest) {
  if (await limited(clientIp(req))) return error("Забагато запитів. Спробуйте за хвилину.", 429);
  const cityRef = (req.nextUrl.searchParams.get("cityRef") ?? "").slice(0, 60);
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 60);
  if (!cityRef || cityRef.startsWith("s:")) return json({ available: false, total: 0, items: [] });
  const list = await cityWarehouses(cityRef);
  if (!list) return json({ available: false, total: 0, items: [] });
  const items = filterWarehouses(list, q);
  return json({ available: true, total: list.length, items: items.map(({ ref, label }) => ({ ref, label })) });
}
