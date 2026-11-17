import type { NextRequest } from "next/server";
import { error, getUser, isSameOrigin, json, knownProductIds, sanitizeIds } from "../../lib/server/auth";
import { tx } from "../../lib/server/db";
import { setFavorites } from "../../lib/server/lists";

/** Зберігає список обраних товарів в акаунті */
export async function PUT(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const user = await getUser(req);
  if (!user) return error("Потрібно увійти", 401);

  const body = await req.json().catch(() => ({}));
  const favorites = sanitizeIds(body.ids, await knownProductIds());
  await tx((q) => setFavorites(user.id, favorites, q));
  return json({ favorites });
}
