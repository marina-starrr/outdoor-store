import type { NextRequest } from "next/server";
import { LOW_STOCK } from "../../../components/catalog-data";
import { json, requireAdmin } from "../../../lib/server/auth";
import { loadCatalog } from "../../../lib/server/catalog";
import { read } from "../../../lib/server/db";

/** Зведення для головної сторінки адмін-панелі */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  const products = await loadCatalog();
  const { orders, messages, customers } = await read((db) => ({
    orders: db.users.flatMap((u) => u.orders),
    messages: db.messages ?? [],
    customers: db.users.length,
  }));

  const active = orders.filter((o) => o.status !== "cancelled");
  const since = Date.now() - 30 * 86_400_000;
  const recent = active.filter((o) => Date.parse(o.createdAt) >= since);
  const byStatus = Object.fromEntries(
    ["new", "confirmed", "shipped", "done", "cancelled"].map((s) => [s, orders.filter((o) => o.status === s).length]),
  );

  return json({
    orders: { total: orders.length, byStatus },
    revenue: { total: active.reduce((s, o) => s + o.total, 0), last30: recent.reduce((s, o) => s + o.total, 0), count30: recent.length },
    products: {
      total: products.length,
      visible: products.filter((p) => !p.hidden).length,
      outOfStock: products.filter((p) => !p.hidden && p.stock === 0).length,
      lowStock: products
        .filter((p) => !p.hidden && p.stock > 0 && p.stock <= LOW_STOCK)
        .sort((a, b) => a.stock - b.stock)
        .map((p) => ({ id: p.id, name: p.name, stock: p.stock, category: p.category })),
    },
    messages: { unread: messages.filter((m) => !m.done).length },
    customers,
  });
}
