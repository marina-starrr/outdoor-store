import type { NextRequest } from "next/server";
import { error, getUser, isSameOrigin, json, knownProductIds, sanitizeCart } from "../../lib/server/auth";
import { write } from "../../lib/server/db";

/** Зберігає кошик в акаунті (викликається браузером при кожній зміні кошика) */
export async function PUT(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const user = await getUser(req);
  if (!user) return error("Потрібно увійти", 401);

  const body = await req.json().catch(() => ({}));
  const cart = sanitizeCart(body.lines, await knownProductIds());
  await write((db) => {
    db.users.find((u) => u.id === user.id)!.cart = cart;
  });
  return json({ cart });
}
