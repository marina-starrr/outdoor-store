import type { NextRequest } from "next/server";
import { error, json } from "../../../lib/server/auth";
import { invalidateCatalog } from "../../../lib/server/catalog";
import { isTestDatabase, sql } from "../../../lib/server/db";

/**
 * ЛИШЕ ДЛЯ НАСКРІЗНИХ ТЕСТІВ: «склад постачальника» з умовами відправки для
 * наявних товарів (без завантаження XML-файлу з чужого сайту).
 * Працює, тільки якщо сервер запущено з FC_E2E=1 і з окремою тимчасовою
 * базою (FC_DATA_DIR). На хостингу ця умова неможлива — там маршрут відповідає 404.
 */
export async function POST(req: NextRequest) {
  if (process.env.FC_E2E !== "1" || !isTestDatabase()) return error("Not found", 404);
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "");
  const products = Array.isArray(body.products) ? body.products.map(String) : [];
  let [row] = await sql("select id from suppliers where name = $1", [name]);
  if (!row)
    [row] = await sql(
      "insert into suppliers (name, feed_url, cod_allowed, np_only, dispatch_days) values ($1, $2, $3, $4, $5) returning id",
      [name, `https://${encodeURIComponent(name)}.example/feed.xml`, body.codAllowed !== false, body.novaPoshtaOnly === true, Number(body.dispatchDays ?? 0)],
    );
  await sql("update products set supplier_id = $1, supplier_sku = id where id = any($2::text[])", [row.id, products]);
  invalidateCatalog();
  return json({ id: row.id });
}
