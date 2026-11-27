import type { NextRequest } from "next/server";
import { error, getUser, isSameOrigin, json, knownProductIds, sanitizeCart } from "../../lib/server/auth";
import { tx } from "../../lib/server/db";
import { setCart } from "../../lib/server/lists";

/** Зберігає кошик в акаунті (викликається браузером при кожній зміні кошика) */
export async function PUT(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const user = await getUser(req);
  if (!user) return error("Потрібно увійти", 401);

  const body = await req.json().catch(() => ({}));
  const cart = sanitizeCart(body.lines, await knownProductIds(body.lines));
  await tx((q) => setCart(user.id, cart, q));
  return json({ cart });
}
