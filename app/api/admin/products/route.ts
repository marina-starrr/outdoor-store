import type { NextRequest } from "next/server";
import { withDerived, type Product } from "../../../components/catalog-data";
import { applyProductInput, slugify, validateProduct } from "../../../lib/admin-product";
import { json, requireAdmin } from "../../../lib/server/auth";
import { invalidateCatalog, loadCatalog, writeCatalog } from "../../../lib/server/catalog";

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

  const result = await writeCatalog((products) => {
    // Код товару (частина адреси): заданий або з назви; має бути унікальним
    let id = data.id || slugify(data.name) || "product";
    if (data.id && products.some((p) => p.id === id)) return { conflict: true as const };
    for (let n = 2; products.some((p) => p.id === id); n++) id = `${slugify(data.name).slice(0, 36)}-${n}`;

    const product = {
      id,
      rating: 0,
      reviews: 0,
      popularity: Math.max(0, ...products.filter((p) => p.category === data.category).map((p) => p.popularity)) + 1,
      image: "",
    } as Partial<Product>;
    applyProductInput(product, data);
    products.push(product as Product);
    return { product: withDerived(product as Product) };
  });
  if ("conflict" in result) return json({ error: "Товар з таким кодом уже існує", errors: { id: "Код зайнятий" } }, 409);

  invalidateCatalog();
  return json({ product: result.product }, 201);
}
