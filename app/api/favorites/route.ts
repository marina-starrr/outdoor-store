import type { NextRequest } from "next/server";
import { error, getUser, isSameOrigin, json, knownProductIds, sanitizeIds } from "../../lib/server/auth";
import { write } from "../../lib/server/db";

/** Зберігає список обраних товарів в акаунті */
export async function PUT(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const user = await getUser(req);
  if (!user) return error("Потрібно увійти", 401);

  const body = await req.json().catch(() => ({}));
  const favorites = sanitizeIds(body.ids, await knownProductIds());
  await write((db) => {
    db.users.find((u) => u.id === user.id)!.favorites = favorites;
  });
  return json({ favorites });
}
