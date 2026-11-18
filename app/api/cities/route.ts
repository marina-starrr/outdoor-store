import type { NextRequest } from "next/server";
import { isDeliveryId } from "../../components/cart-logic";
import { clientIp, error, json, rateLimiter } from "../../lib/server/auth";
import { suggestCities } from "../../lib/server/novaposhta";

/** Підказки — на кожну введену літеру, тож ліміт щедрий: 120 запитів за хвилину */
const limited = rateLimiter("cities", 120, 60_000);

/** Підказки для поля «Місто» при оформленні: /api/cities?q=полт&method=np-branch */
export async function GET(req: NextRequest) {
  if (await limited(clientIp(req))) return error("Забагато запитів. Спробуйте за хвилину.", 429);
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 60);
  const m = req.nextUrl.searchParams.get("method");
  return json(await suggestCities(q, isDeliveryId(m) ? m : undefined));
}
