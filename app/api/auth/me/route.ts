import type { NextRequest } from "next/server";
import { getUser, json, publicUser } from "../../../lib/server/auth";
import { getCart, getFavorites } from "../../../lib/server/lists";

/** Поточний користувач і його кошик (null — гість) */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return json({ user: null, cart: null, favorites: null });
  const [cart, favorites] = await Promise.all([getCart(user.id), getFavorites(user.id)]);
  return json({ user: publicUser(user), cart, favorites });
}
