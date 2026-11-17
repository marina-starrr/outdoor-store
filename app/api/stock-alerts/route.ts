import type { NextRequest } from "next/server";
import { error, getUser, isSameOrigin, json, knownProductIds } from "../../lib/server/auth";
import { tx } from "../../lib/server/db";
import { getStockAlerts } from "../../lib/server/lists";

/** Скільки товарів одночасно можна чекати */
const ALERTS_LIMIT = 50;

async function change(req: NextRequest, subscribe: boolean) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const user = await getUser(req);
  if (!user) return error("Увійдіть, щоб отримати сповіщення про наявність", 401);
  const body = await req.json().catch(() => ({}));
  const id = typeof body.productId === "string" ? body.productId : "";
  if (subscribe && !(await knownProductIds()).has(id)) return error("Товар не знайдено", 404);

  const stockAlerts = await tx(async (q) => {
    await q.query("select 1 from users where id = $1 for update", [user.id]);
    // Повторна підписка переносить товар у кінець списку
    await q.query("delete from stock_alerts where user_id = $1 and product_id = $2", [user.id, id]);
    if (subscribe) {
      await q.query("insert into stock_alerts (user_id, product_id, created_at) values ($1, $2, clock_timestamp())", [user.id, id]);
      // Понад ліміт — прибираємо найстаріші
      await q.query(
        `delete from stock_alerts where user_id = $1 and product_id not in (
           select product_id from stock_alerts where user_id = $1 order by created_at desc, product_id limit $2)`,
        [user.id, ALERTS_LIMIT],
      );
    }
    return getStockAlerts(user.id, q);
  });
  return json({ stockAlerts });
}

/** «Повідомити про наявність» — підписатися на товар */
export const POST = (req: NextRequest) => change(req, true);
/** Скасувати підписку */
export const DELETE = (req: NextRequest) => change(req, false);
