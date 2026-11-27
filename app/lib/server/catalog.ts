import "server-only";
import { cacheLife, cacheTag, revalidatePath, revalidateTag } from "next/cache";
import { seedProducts, selectHits, withDerived, type Product } from "../../components/catalog-data";
import { isListed } from "../certificates";
import { bumpCatalogVersion, catalogVersion, loadCatalogViaSnapshot } from "./catalog-snapshot";
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
 * збиралися статично).
 * revalidate — 10 хв, а не 2: кожне перечитування — ~2 МБ трафіку Supabase на кожен
 * екземпляр (Free: 5 ГБ на місяць). Ціни постачальників і так оновлюються щогодини,
 * а замовлення завжди перевіряє ціни й залишки свіжим запитом (loadProducts)
 */
const CATALOG_LIFE = { stale: 60, revalidate: 600, expire: 86_400 };

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
    colorHint: opt(r.color_hint),
    customImage: opt(r.custom_image),
    images: Array.isArray(r.images) && r.images.length ? r.images : undefined,
    onRequest: r.on_request || undefined,
    // Товари постачальників продаються за їхньою РРЦ (антидемпінгова політика)
    fixedPrice: r.supplier_id ? true : undefined,
    // Умови складу постачальника (r.sup — рядок suppliers з loadCatalog)
    shipFrom: r.supplier_id || undefined,
    prepayOnly: r.sup?.cod_allowed === false || undefined,
    novaPoshtaOnly: r.sup?.np_only === true || undefined,
    dispatchDays: Number(r.sup?.dispatch_days) > 0 ? Number(r.sup.dispatch_days) : undefined,
    // Колонки з міграції 20261127000000; до неї їх немає — ножі просто не показуються
    certificate: opt(r.certificate),
    certificateExempt: r.certificate_exempt === true || undefined,
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
  const [row] = await q.query(`select ${LIST_COLUMNS}, p.description from products p where p.id = $1 for update`, [id]);
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

/*
 * Колонки товару для списків — БЕЗ опису. Опис — це дві третини розміру каталогу
 * (2200 товарів: 3,6 МБ з 5,6 МБ), а потрібен лише на сторінці товару
 * (getProductDescription). Кожен зайвий мегабайт з бази — це трафік Supabase
 * (Free: 5 ГБ на місяць; у листопаді 2026 через повний каталог на кожен запит
 * набігло 12 ГБ). З опису беремо лише рядок «Колір: …» — для фільтра кольору.
 * Сертифікат — через to_jsonb, щоб запит працював і до міграції з цими колонками
 */
export const LIST_COLUMNS = [
  ...PRODUCT_COLUMNS.split(", ").filter((c) => c !== "description").map((c) => `p.${c}`),
  "p.supplier_id",
  "p.supplier_sku",
  String.raw`substring(p.description from '[Кк]олір\s*:\s*[^\n;.,]{1,40}') as color_hint`,
  "to_jsonb(p)->>'certificate' as certificate",
  "(to_jsonb(p)->>'certificate_exempt')::boolean as certificate_exempt",
].join(", ");

type LoadOptions = {
  /** Лише ці товари (замовлення, адмінка) — замість усього каталогу */
  ids?: string[];
  /** З описом — для адмін-панелі (редактор товару) */
  descriptions?: boolean;
};

/** Умови складів постачальників (рядків — кілька, а не по одному на кожен товар) */
async function supplierTerms(q: Queryable): Promise<Map<string, Row>> {
  const rows = await q.query(
    // Через to_jsonb — запит працює і до міграції з новими колонками; великі поля прибираємо
    "select id, to_jsonb(x) - 'category_map' - 'feed_categories' - 'last_sync_message' as sup from suppliers x",
  );
  return new Map(rows.map((r) => [r.id as string, r.sup as Row]));
}

/**
 * Рейтинг, кількість відгуків і продажі завжди рахуються з бази:
 * рейтинг — лише зі схвалених відгуків, продажі — без скасованих замовлень
 */
export async function loadCatalog(q: Queryable = db, opts: LoadOptions = {}): Promise<Product[]> {
  await ensureCatalog();
  if (opts.ids && !opts.ids.length) return [];
  const [terms, rows] = await Promise.all([
    supplierTerms(q),
    q.query(
      `select ${LIST_COLUMNS}${opts.descriptions ? ", p.description" : ""},
              coalesce(r.rating, 0) as rating, coalesce(r.cnt, 0) as reviews, coalesce(s.sold, 0) as sold
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
     ${opts.ids ? "where p.id = any($1::text[])" : ""}
     order by p.seq`,
      opts.ids ? [opts.ids] : undefined,
    ),
  ]);
  return rows.map((r) => productFromRow({ ...r, sup: r.supplier_id ? terms.get(r.supplier_id) : undefined }));
}

/** Лише потрібні товари (з рейтингом і умовами складу), а не весь каталог */
export const loadProducts = (ids: string[], opts: Omit<LoadOptions, "ids"> = {}, q: Queryable = db) =>
  loadCatalog(q, { ...opts, ids: [...new Set(ids)].slice(0, 500) });

/**
 * Які з цих товарів показуються покупцям (не приховані; ножі — із сертифікатом).
 * Лише вказані рядки й кілька колонок — не весь каталог (кошик, обране, відгуки, чат)
 */
export async function listedProductIds(candidates: unknown[], q: Queryable = db): Promise<Set<string>> {
  const ids = [...new Set(candidates.filter((x): x is string => typeof x === "string" && x.length <= 80))].slice(0, 500);
  if (!ids.length) return new Set();
  await ensureCatalog();
  const rows = await q.query(
    `select id, category, name, hidden, to_jsonb(p)->>'certificate' as certificate,
            (to_jsonb(p)->>'certificate_exempt')::boolean as certificate_exempt
     from products p where id = any($1::text[])`,
    [ids],
  );
  return new Set(
    rows
      .filter((r) => isListed({ hidden: r.hidden, category: r.category, name: r.name, certificate: r.certificate ?? undefined, certificateExempt: r.certificate_exempt === true }))
      .map((r) => r.id as string),
  );
}

/**
 * Опис товару для його сторінки (у каталозі описів немає — див. LIST_COLUMNS).
 * Кешується разом з каталогом
 */
export async function getProductDescription(id: string): Promise<string | undefined> {
  "use cache";
  cacheTag(CATALOG_TAG);
  cacheLife(CATALOG_LIFE);
  const [row] = await sql("select description from products where id = $1", [id]);
  return opt(row?.description) ?? undefined;
}

/** Кешований каталог для сторінок (усі товари, разом із прихованими) */
export async function getCatalog(): Promise<Product[]> {
  "use cache";
  cacheTag(CATALOG_TAG);
  cacheLife(CATALOG_LIFE);
  // Зі знімка у сховищі (~250 КБ через CDN), а не з бази (~2 МБ) — див. catalog-snapshot.ts
  return loadCatalogViaSnapshot();
}

/** Версія каталогу для адреси /api/catalog/<версія> (кешується разом з каталогом) */
export async function getCatalogVersion(): Promise<number> {
  "use cache";
  cacheTag(CATALOG_TAG);
  cacheLife(CATALOG_LIFE);
  return catalogVersion();
}

/**
 * Каталог для браузера за версією. Версія — частина ключа кешу: сервер, у якого
 * в пам'яті ще старий каталог, на нову версію однаково прочитає свіжий (зі знімка)
 */
export async function getCatalogAtVersion(version: number): Promise<Product[]> {
  "use cache";
  cacheTag(CATALOG_TAG);
  cacheLife(CATALOG_LIFE);
  void version;
  return (await loadCatalogViaSnapshot()).filter(isListed);
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

/** Лише ті, що показуються покупцям (ножі — лише із сертифікатом) */
export async function getPublicCatalog(): Promise<Product[]> {
  return (await getCatalog()).filter(isListed);
}

/**
 * Сертифікат товару і позначка «документ не потрібен». Окремо від updateProduct:
 * так редагування товарів працює й до міграції з цими колонками
 */
export async function setCertificate(q: Queryable, ids: string[], url: string | null) {
  return (await q.query("update products set certificate = $2, updated_at = now() where id = any($1::text[]) returning id", [ids, url])).map((r) => r.id as string);
}

export async function setCertificateExempt(q: Queryable, id: string, exempt: boolean) {
  return (await q.query("update products set certificate_exempt = $2, updated_at = now() where id = $1 returning id", [id, exempt])).length > 0;
}

/**
 * Скидає кеш сторінок з каталогом (ціни, залишки, нові товари) і список адрес для proxy.
 * Спершу — нова версія знімка каталогу, щоб перебудовані сторінки не взяли старий знімок
 */
export async function invalidateCatalog() {
  await bumpCatalogVersion();
  resetProductUrls();
  try {
    revalidateTag(CATALOG_TAG, { expire: 0 });
    // Готові сторінки в кеші Vercel (ISR) — скидаються для всіх екземплярів одразу
    revalidatePath("/", "layout");
  } catch {
    /* поза запитом Next (напр. у модульних тестах) кешу немає */
  }
}
