import { NextResponse, type NextRequest } from "next/server";
import { categories, seedProducts } from "./app/components/catalog-data";
import { productUrls } from "./app/lib/server/product-urls";

/*
 * Справжній статус 404 для неіснуючих категорій і товарів.
 * Сторінки товарів передаються потоком (streaming), а потік завжди
 * починається зі статусу 200 — тому перевірку робимо тут, ДО рендеру,
 * як радить документація Next.js. Перевірка швидка: список адрес кешується.
 */

const categorySlugs = new Set<string>(categories.map((c) => c.slug));
/** Поки таблиця товарів порожня — працює початковий каталог */
const seedUrls = new Set(seedProducts.filter((p) => !p.hidden).map((p) => `${p.category}/${p.id}`));

export async function proxy(req: NextRequest) {
  const [, , slug, id, ...rest] = req.nextUrl.pathname.split("/");
  let exists = !rest.length && categorySlugs.has(slug);
  if (exists && id) {
    try {
      exists = ((await productUrls()) ?? seedUrls).has(`${slug}/${decodeURIComponent(id)}`);
    } catch (e) {
      // База недоступна — не ховаємо товар за 404, сторінка сама покаже помилку
      console.error("[proxy] не вдалося перевірити товар", e);
    }
  }
  if (exists) return NextResponse.next();
  // Шлях, якого немає в застосунку — Next віддає сторінку not-found зі статусом 404
  return NextResponse.rewrite(new URL("/__not-found", req.url));
}

export const config = {
  matcher: ["/catalog/:slug", "/catalog/:slug/:path*"],
};
