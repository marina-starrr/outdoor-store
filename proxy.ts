import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { categories, seedProducts, type Product } from "./app/components/catalog-data";

/*
 * Справжній статус 404 для неіснуючих категорій і товарів.
 * Сторінки товарів передаються потоком (streaming), а потік завжди
 * починається зі статусу 200 — тому перевірку робимо тут, ДО рендеру,
 * як радить документація Next.js. Перевірка швидка: лише список адрес.
 */

const categorySlugs = new Set<string>(categories.map((c) => c.slug));

let cached: { mtime: number; urls: Set<string> } | null = null;

/** Адреси видимих товарів «категорія/код» з бази (або початкового каталогу) */
function productUrls(): Set<string> {
  const file = join(process.env.FC_DATA_DIR || join(process.cwd(), ".data"), "db.json");
  let mtime = 0;
  try {
    mtime = statSync(file).mtimeMs;
  } catch {
    /* бази ще немає — працює початковий каталог */
  }
  if (cached && cached.mtime === mtime) return cached.urls;
  let products: Product[] = seedProducts;
  if (mtime) {
    try {
      products = JSON.parse(readFileSync(file, "utf8")).products ?? seedProducts;
    } catch {
      /* файл саме перезаписується — використаємо попередній список, якщо є */
      if (cached) return cached.urls;
    }
  }
  const urls = new Set(products.filter((p) => !p.hidden).map((p) => `${p.category}/${p.id}`));
  cached = { mtime, urls };
  return urls;
}

export function proxy(req: NextRequest) {
  const [, , slug, id, ...rest] = req.nextUrl.pathname.split("/");
  const exists =
    !rest.length &&
    categorySlugs.has(slug) &&
    (id === undefined || id === "" || productUrls().has(`${slug}/${decodeURIComponent(id)}`));
  if (exists) return NextResponse.next();
  // Шлях, якого немає в застосунку — Next віддає сторінку not-found зі статусом 404
  return NextResponse.rewrite(new URL("/__not-found", req.url));
}

export const config = {
  matcher: ["/catalog/:slug", "/catalog/:slug/:path*"],
};
