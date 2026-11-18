import type { NextRequest } from "next/server";
import { clientIp, error, json, rateLimiter } from "../../lib/server/auth";
import { searchStreets } from "../../lib/server/novaposhta";

const limited = rateLimiter("streets", 120, 60_000);

/** Вулиці для кур'єрської доставки Нової пошти: /api/streets?cityRef=…&q=Собор */
export async function GET(req: NextRequest) {
  if (await limited(clientIp(req))) return error("Забагато запитів. Спробуйте за хвилину.", 429);
  const cityRef = (req.nextUrl.searchParams.get("cityRef") ?? "").slice(0, 60);
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 60);
  if (!cityRef || cityRef.startsWith("s:")) return json({ available: false, items: [] });
  const items = await searchStreets(cityRef, q);
  return json(items ? { available: true, items } : { available: false, items: [] });
}
