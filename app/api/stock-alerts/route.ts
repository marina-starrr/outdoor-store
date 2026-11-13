import type { NextRequest } from "next/server";
import { error, getUser, isSameOrigin, json, knownProductIds } from "../../lib/server/auth";
import { write } from "../../lib/server/db";

/** Скільки товарів одночасно можна чекати */
const ALERTS_LIMIT = 50;

async function change(req: NextRequest, subscribe: boolean) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const user = await getUser(req);
  if (!user) return error("Увійдіть, щоб отримати сповіщення про наявність", 401);
  const body = await req.json().catch(() => ({}));
  const id = typeof body.productId === "string" ? body.productId : "";
  if (subscribe && !(await knownProductIds()).has(id)) return error("Товар не знайдено", 404);

  const stockAlerts = await write((db) => {
    const u = db.users.find((x) => x.id === user.id)!;
    const list = (u.stockAlerts ?? []).filter((x) => x !== id);
    if (subscribe) list.push(id);
    u.stockAlerts = list.slice(-ALERTS_LIMIT);
    return u.stockAlerts;
  });
  return json({ stockAlerts });
}

/** «Повідомити про наявність» — підписатися на товар */
export const POST = (req: NextRequest) => change(req, true);
/** Скасувати підписку */
export const DELETE = (req: NextRequest) => change(req, false);
