import type { NextRequest } from "next/server";
import { json, requireAdmin } from "../../../lib/server/auth";
import { reviewFromRow, sql } from "../../../lib/server/db";

/** Усі відгуки для модерації, найновіші першими */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const rows = await sql(
    `select r.*, p.name as product_name, p.category as product_category, u.email as user_email
     from reviews r
     left join products p on p.id = r.product_id
     left join users u on u.id = r.user_id
     order by r.created_at desc`,
  );
  const reviews = rows.map((r) => ({
    ...reviewFromRow(r),
    product: { name: r.product_name ?? r.product_id, category: r.product_category ?? "" },
    email: r.user_email ?? "",
  }));
  return json({ reviews });
}
