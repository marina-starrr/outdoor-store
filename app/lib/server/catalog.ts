import "server-only";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { seedProducts, selectHits, withDerived, type Product } from "../../components/catalog-data";
import { db, isoOpt, jsonb, num, opt, sql, type Queryable, type Row } from "./db";
import { resetProductUrls } from "./product-urls";
import { approvedReviews, type PublicReview } from "./reviews";

/*
 * Каталог товарів у базі даних.
 * - loadCatalog() — свіжі дані (API, оформлення замовлення, адмін-панель)
 * - getCatalog()  — кешована версія для сторінок ('use cache' + тег 'catalog');
 *   після будь-якої зміни товарів викликається invalidateCatalog()
 */

export const CATALOG_TAG = "catalog";

const PRODUCT_COLUMNS =
  "id, name, category, brand, price, old_price, hit, is_new, stock, hidden, description, custom_image, popularity, specs, capacity, image, photo, attrs, updated_at";

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
];

const VALUES = "$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19";

/** Новий товар (id уже перевірено на унікальність) */
export async function insertProduct(q: Queryable, p: Product) {
  await q.query(`insert into products (${PRODUCT_COLUMNS}) values (${VALUES})`, productParams(p));
}

/** Зберігає всі поля товару */
export async function updateProduct(q: Queryable, p: Product) {
  const sets = PRODUCT_COLUMNS.split(", ")
    .slice(1)
    .map((c, i) => `${c} = $${i + 2}${c === "attrs" ? "::jsonb" : ""}`)
    .join(", ");
  await q.query(`update products set ${sets} where id = $1`, productParams(p));
}

/** Товар для зміни: рядок блокується до кінця транзакції */
export async function lockProduct(q: Queryable, id: string): Promise<Product | null> {
  const [row] = await q.query(`select ${PRODUCT_COLUMNS} from products where id = $1 for update`, [id]);
  return row ? productFromRow(row) : null;
}

/*
 * Порожня таблиця товарів (щойно створена база) заповнюється початковим каталогом.
 * on conflict — щоб паралельні запити не заважали один одному
 */
const g = globalThis as { __fcSeeded?: Set<string> };
const seeded = (g.__fcSeeded ??= new Set());

export async function ensureCatalog() {
  const key = process.env.FC_DATA_DIR || process.env.DATABASE_URL || process.env.POSTGRES_URL || "local";
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
  } catch {
    /* поза запитом Next (напр. у модульних тестах) кешу немає */
  }
}
