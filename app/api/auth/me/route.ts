import type { NextRequest } from "next/server";
import { getUser, json, publicUser } from "../../../lib/server/auth";

/** Поточний користувач і його кошик (null — гість) */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  return json(
    user
      ? { user: publicUser(user), cart: user.cart, favorites: user.favorites ?? [] }
      : { user: null, cart: null, favorites: null },
  );
}
