import "server-only";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { seedProducts, withDerived, type Product } from "../../components/catalog-data";
import { read, write, type Data } from "./db";

/*
 * Каталог товарів у базі даних.
 * - loadCatalog() — свіжі дані (API, оформлення замовлення, адмін-панель)
 * - getCatalog()  — кешована версія для сторінок ('use cache' + тег 'catalog');
 *   після будь-якої зміни товарів викликається invalidateCatalog()
 */

export const CATALOG_TAG = "catalog";

/** Товари з бази; до першої зміни в адмін-панелі — початковий каталог */
const rawProducts = (db: Data) => db.products ?? seedProducts;

export async function loadCatalog(): Promise<Product[]> {
  return read((db) => rawProducts(db).map(withDerived));
}

/** Кешований каталог для сторінок (усі товари, разом із прихованими) */
export async function getCatalog(): Promise<Product[]> {
  "use cache";
  cacheTag(CATALOG_TAG);
  cacheLife("max");
  return loadCatalog();
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
