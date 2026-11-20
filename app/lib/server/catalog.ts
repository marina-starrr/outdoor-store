import "server-only";
import { cacheLife, cacheTag, revalidatePath, revalidateTag } from "next/cache";
import { seedProducts, selectHits, withDerived, type Product } from "../../components/catalog-data";
import { db, isoOpt, jsonb, num, opt, seedsCatalog, sql, type Queryable, type Row } from "./db";
import { resetProductUrls } from "./product-urls";
import { approvedReviews, type PublicReview } from "./reviews";

/*
 * Каталог товарів у базі даних.
 * - loadCatalog() — свіжі дані (API, оформлення замовлення, адмін-панель)
 * - getCatalog()  — кешована версія для сторінок ('use cache' + тег 'catalog');
 *   після будь-якої зміни товарів викликається invalidateCatalog()
 */

export const CATALOG_TAG = "catalog";

/**
 * Скільки живе кешований каталог. Не "max": на Vercel кеш 'use cache' тримається
 * в пам'яті кожного серверного екземпляра окремо, і revalidateTag з іншого
 * екземпляра (синхронізація постачальника, адмінка) до нього не доходить —
 * сторінки лишалися зі старими даними до наступної збірки. Тож не довше ніж
 * кілька хвилин дані оновлюються самі (expire ≥ 5 хв, щоб сторінки й далі
 * збиралися статично)
 */
const CATALOG_LIFE = { stale: 60, revalidate: 120, expire: 86_400 };

const PRODUCT_COLUMNS =
  "id, name, category, brand, price, old_price, hit, is_new, stock, hidden, description, custom_image, popularity, specs, capacity, image, photo, attrs, updated_at, images, on_request";

const JSONB_COLUMNS = new Set(["attrs", "images"]);

/** Рядок таблиці products → товар (без рейтингу й продажів) */
export const productFromRow = (r: Row): Product =>
  withDerived({
    id: r.id,
    name: r.name,
    category: r.category,
    brand: r.brand,
    price: num(r.price),
    oldPrice: r.old_price == null ? undefined : num(r.old_price),
    hit: r.hit || undefined,
    isNew: r.is_new || undefined,
    rating: num(r.rating),
    reviews: num(r.reviews),
    sold: num(r.sold),
    inStock: num(r.stock) > 0,
    stock: num(r.stock),
    hidden: r.hidden || undefined,
    description: opt(r.description),
    customImage: opt(r.custom_image),
    images: Array.isArray(r.images) && r.images.length ? r.images : undefined,
    onRequest: r.on_request || undefined,
    updatedAt: isoOpt(r.updated_at),
    popularity: num(r.popularity),
    specs: r.specs,
    capacity: r.capacity == null ? undefined : num(r.capacity),
    image: r.image,
    photo: r.photo,
    attrs: r.attrs ?? [],
  });

const productParams = (p: Product) => [
  p.id,
  p.name,
  p.category,
  p.brand,
  p.price,
  p.oldPrice ?? null,
  !!p.hit,
  !!p.isNew,
  p.stock,
  !!p.hidden,
  p.description ?? null,
  p.customImage ?? null,
  p.popularity,
  p.specs,
  p.capacity ?? null,
  p.image ?? "",
  p.photo,
  jsonb(p.attrs ?? []),
  p.updatedAt ?? null,
  jsonb(p.images ?? []),
  !!p.onRequest,
];

const VALUES = "$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20::jsonb,$21";

/** Новий товар (id уже перевірено на унікальність) */
export async function insertProduct(q: Queryable, p: Product) {
  await q.query(`insert into products (${PRODUCT_COLUMNS}) values (${VALUES})`, productParams(p));
}

/** Зберігає всі поля товару */
export async function updateProduct(q: Queryable, p: Product) {
  const sets = PRODUCT_COLUMNS.split(", ")
    .slice(1)
    .map((c, i) => `${c} = $${i + 2}${JSONB_COLUMNS.has(c) ? "::jsonb" : ""}`)
    .join(", ");
  await q.query(`update products set ${sets} where id = $1`, productParams(p));
}

/** Товар для зміни: рядок блокується до кінця транзакції */
export async function lockProduct(q: Queryable, id: string): Promise<Product | null> {
  const [row] = await q.query(`select ${PRODUCT_COLUMNS} from products where id = $1 for update`, [id]);
  return row ? productFromRow(row) : null;
}

/*
 * Тести й локальна розробка: порожня вбудована база заповнюється початковим
 * (демонстраційним) каталогом. Справжня база (Supabase) — НІКОЛИ: там товари
 * лише ті, що додав власник, і порожній магазин лишається порожнім.
 * on conflict — щоб паралельні запити не заважали один одному
 */
const g = globalThis as { __fcSeeded?: Set<string> };
const seeded = (g.__fcSeeded ??= new Set());

export async function ensureCatalog() {
  if (!seedsCatalog()) return;
  const key = process.env.FC_DATA_DIR || "local";
  if (seeded.has(key)) return;
  const [{ any }] = await sql("select exists(select 1 from products) as any");
  if (!any) {
    for (const p of seedProducts)
      await sql(`insert into products (${PRODUCT_COLUMNS}) values (${VALUES}) on conflict (id) do nothing`, productParams(p));
  }
  seeded.add(key);
}

/**
 * Рейтинг, кількість відгуків і продажі завжди рахуються з бази:
 * рейтинг — лише зі схвалених відгуків, продажі — без скасованих замовлень
 */
export async function loadCatalog(q: Queryable = db): Promise<Product[]> {
  await ensureCatalog();
  const rows = await q.query(
    `select p.*, coalesce(r.rating, 0) as rating, coalesce(r.cnt, 0) as reviews, coalesce(s.sold, 0) as sold
     from products p
     left join (
       select product_id, round(avg(rating)::numeric, 1) as rating, count(*) as cnt
       from reviews where status = 'approved' group by product_id
     ) r on r.product_id = p.id
     left join (
       select i.product_id, sum(i.qty) as sold
       from order_items i join orders o on o.number = i.order_number
       where o.status <> 'cancelled' group by i.product_id
     ) s on s.product_id = p.id
     order by p.seq`,
  );
  return rows.map(productFromRow);
}

/** Кешований каталог для сторінок (усі товари, разом із прихованими) */
export async function getCatalog(): Promise<Product[]> {
  "use cache";
  cacheTag(CATALOG_TAG);
  cacheLife(CATALOG_LIFE);
  return loadCatalog();
}

/**
 * Справжні відгуки на 5 зірок до трьох перших хітів — для сторінки «Хіти».
 * Кешується разом з каталогом (оновлюється при модерації відгуків)
 */
export async function getHitTestimonials(): Promise<{ productId: string; review: PublicReview }[]> {
  "use cache";
  cacheTag(CATALOG_TAG);
  cacheLife(CATALOG_LIFE);
  const hits = selectHits(await getPublicCatalog()).slice(0, 3);
  const result: { productId: string; review: PublicReview }[] = [];
  for (const p of hits) {
    const review = (await approvedReviews(p.id)).find((r) => r.rating === 5 && r.text.length >= 40);
    if (review) result.push({ productId: p.id, review });
  }
  return result;
}

/** Лише ті, що показуються покупцям */
export async function getPublicCatalog(): Promise<Product[]> {
  return (await getCatalog()).filter((p) => !p.hidden);
}

/** Скидає кеш сторінок з каталогом (ціни, залишки, нові товари) і список адрес для proxy */
export function invalidateCatalog() {
  resetProductUrls();
  try {
    revalidateTag(CATALOG_TAG, { expire: 0 });
    // Готові сторінки в кеші Vercel (ISR) — скидаються для всіх екземплярів одразу
    revalidatePath("/", "layout");
  } catch {
    /* поза запитом Next (напр. у модульних тестах) кешу немає */
  }
}
