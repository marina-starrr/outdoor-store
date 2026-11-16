import "server-only";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { seedProducts, selectHits, withDerived, type Product } from "../../components/catalog-data";
import { read, write, type Data } from "./db";
import { approvedReviews, reviewStats, soldCounts, type PublicReview } from "./reviews";

/*
 * Каталог товарів у базі даних.
 * - loadCatalog() — свіжі дані (API, оформлення замовлення, адмін-панель)
 * - getCatalog()  — кешована версія для сторінок ('use cache' + тег 'catalog');
 *   після будь-якої зміни товарів викликається invalidateCatalog()
 */

export const CATALOG_TAG = "catalog";

/** Товари з бази; до першої зміни в адмін-панелі — початковий каталог */
const rawProducts = (db: Data) => db.products ?? seedProducts;

/**
 * Рейтинг, кількість відгуків і продажі завжди рахуються з бази — значення,
 * збережені в самих товарах (у старих базах там були вигадані цифри), ігноруються
 */
export async function loadCatalog(): Promise<Product[]> {
  return read((db) => {
    const stats = reviewStats(db);
    const sold = soldCounts(db);
    return rawProducts(db).map((p) => ({
      ...withDerived(p),
      rating: stats.get(p.id)?.rating ?? 0,
      reviews: stats.get(p.id)?.reviews ?? 0,
      sold: sold.get(p.id) ?? 0,
    }));
  });
}

/** Кешований каталог для сторінок (усі товари, разом із прихованими) */
export async function getCatalog(): Promise<Product[]> {
  "use cache";
  cacheTag(CATALOG_TAG);
  cacheLife("max");
  return loadCatalog();
}

/**
 * Справжні відгуки на 5 зірок до трьох перших хітів — для сторінки «Хіти».
 * Кешується разом з каталогом (оновлюється при модерації відгуків)
 */
export async function getHitTestimonials(): Promise<{ productId: string; review: PublicReview }[]> {
  "use cache";
  cacheTag(CATALOG_TAG);
  cacheLife("max");
  const hits = selectHits(await getPublicCatalog()).slice(0, 3);
  return read((db) =>
    hits.flatMap((p) => {
      const review = approvedReviews(db, p.id).find((r) => r.rating === 5 && r.text.length >= 40);
      return review ? [{ productId: p.id, review }] : [];
    }),
  );
}

/** Лише ті, що показуються покупцям */
export async function getPublicCatalog(): Promise<Product[]> {
  return (await getCatalog()).filter((p) => !p.hidden);
}

/**
 * Зміна каталогу. Початковий каталог копіюється в базу при першій зміні,
 * тож далі всі товари живуть у db.json
 */
export function writeCatalog<T>(fn: (products: Product[], db: Data) => T): Promise<T> {
  return write((db) => {
    db.products ??= structuredClone(seedProducts);
    return fn(db.products, db);
  });
}

/** Скидає кеш сторінок з каталогом (ціни, залишки, нові товари) */
export function invalidateCatalog() {
  try {
    revalidateTag(CATALOG_TAG, { expire: 0 });
  } catch {
    /* поза запитом Next (напр. у модульних тестах) кешу немає */
  }
}
