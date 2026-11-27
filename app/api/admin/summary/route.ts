import type { NextRequest } from "next/server";
import { LOW_STOCK } from "../../../components/catalog-data";
import { isListed, missingCertificate } from "../../../lib/certificates";
import { json, requireAdmin } from "../../../lib/server/auth";
import { loadCatalog } from "../../../lib/server/catalog";
import { chatsWaiting } from "../../../lib/server/chat";
import { ORDER_STATUSES, num, sql } from "../../../lib/server/db";

/** Зведення для головної сторінки адмін-панелі */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  const [products, statusRows, [revenue], [counts], waiting] = await Promise.all([
    loadCatalog(),
    sql("select status, count(*) as n from orders group by status"),
    sql(
      `select coalesce(sum(total), 0) as total,
              coalesce(sum(total) filter (where created_at >= now() - interval '30 days'), 0) as last30,
              count(*) filter (where created_at >= now() - interval '30 days') as count30
       from orders where status <> 'cancelled'`,
    ),
    sql(
      `select (select count(*) from users) as customers,
              (select count(*) from messages where not done) as unread,
              (select count(*) from reviews where status = 'pending') as pending,
              (select count(*) from messages) as messages_total`,
    ),
    chatsWaiting(),
  ]);

  const byStatus = Object.fromEntries(
    ORDER_STATUSES.map((s) => [s, num(statusRows.find((r) => r.status === s)?.n)]),
  );
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

  return json({
    orders: { total, byStatus },
    revenue: { total: num(revenue.total), last30: num(revenue.last30), count30: num(revenue.count30) },
    products: {
      total: products.length,
      visible: products.filter(isListed).length,
      outOfStock: products.filter((p) => isListed(p) && p.stock === 0).length,
      // Ножі, які не показуються, бо немає сертифіката
      noCertificate: products.filter((p) => !p.hidden && missingCertificate(p)).length,
      lowStock: products
        .filter((p) => isListed(p) && p.stock > 0 && p.stock <= LOW_STOCK)
        .sort((a, b) => a.stock - b.stock)
        .map((p) => ({ id: p.id, name: p.name, stock: p.stock, category: p.category })),
    },
    messages: { unread: num(counts.unread), total: num(counts.messages_total) },
    chats: { waiting },
    reviews: { pending: num(counts.pending) },
    customers: num(counts.customers),
  });
}
