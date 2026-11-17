import type { NextRequest } from "next/server";
import { withDerived, type Product } from "../../../components/catalog-data";
import { applyProductInput, slugify, validateProduct } from "../../../lib/admin-product";
import { json, requireAdmin } from "../../../lib/server/auth";
import { ensureCatalog, insertProduct, invalidateCatalog, loadCatalog } from "../../../lib/server/catalog";
import { tx } from "../../../lib/server/db";

/** Усі товари, разом із прихованими */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  return json({ products: await loadCatalog() });
}

/** Новий товар */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const { data, errors } = validateProduct(body);
  if (!data) return json({ error: "Перевірте поля форми", errors }, 400);

  await ensureCatalog();
  const result = await tx(async (q) => {
    // Один новий товар за раз — щоб два одночасні не отримали однаковий код
    await q.query("lock table products in share row exclusive mode");
    const existing = await q.query("select id, category, popularity from products");
    const taken = new Set(existing.map((p) => p.id as string));

    // Код товару (частина адреси): заданий або з назви; має бути унікальним
    let id = data.id || slugify(data.name) || "product";
    if (data.id && taken.has(id)) return { conflict: true as const };
    for (let n = 2; taken.has(id); n++) id = `${slugify(data.name).slice(0, 36)}-${n}`;

    const product = {
      id,
      rating: 0,
      reviews: 0,
      popularity:
        Math.max(0, ...existing.filter((p) => p.category === data.category).map((p) => Number(p.popularity))) + 1,
      image: "",
    } as Partial<Product>;
    applyProductInput(product, data);
    const created = withDerived(product as Product);
    await insertProduct(q, created);
    return { product: created };
  });
  if ("conflict" in result) return json({ error: "Товар з таким кодом уже існує", errors: { id: "Код зайнятий" } }, 409);

  invalidateCatalog();
  return json({ product: result.product }, 201);
}
