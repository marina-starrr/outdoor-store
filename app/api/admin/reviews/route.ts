import type { NextRequest } from "next/server";
import { json, requireAdmin } from "../../../lib/server/auth";
import { loadCatalog } from "../../../lib/server/catalog";
import { read } from "../../../lib/server/db";

/** Усі відгуки для модерації, найновіші першими */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const names = new Map((await loadCatalog()).map((p) => [p.id, { name: p.name, category: p.category }]));
  const reviews = await read((db) =>
    (db.reviews ?? [])
      .map((r) => ({
        ...r,
        product: names.get(r.productId) ?? { name: r.productId, category: "" },
        email: db.users.find((u) => u.id === r.userId)?.email ?? "",
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
  return json({ reviews });
}
