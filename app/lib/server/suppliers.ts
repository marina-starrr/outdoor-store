import "server-only";
import { XMLParser } from "fast-xml-parser";
import { categoryPhotos, isCategorySlug, withDerived, type Product } from "../../components/catalog-data";
import { PLACEHOLDER_PHOTO } from "../../components/photo";
import { MAX_IMAGES, slugify } from "../admin-product";
import { AUTO_CATEGORY, PATH_SEPARATOR, categoryFromName, suggestCategory, type MappedCategory } from "../supplier-categories";
import { LIST_COLUMNS, invalidateCatalog, productFromRow } from "./catalog";
import { db, iso, jsonb, sql, tx, type Queryable, type Row } from "./db";
import { sendMails, type Mail } from "./mail";
import { productEvents, snapshot } from "./notifications";

/*
 * Постачальники та імпорт товарів з їхніх XML-файлів (формат YML — той самий,
 * що для Prom і Rozetka: <categories>, <offers><offer>…).
 *
 * Правила (погоджено власником):
 * - ціна на сайті = <price> з файлу (РРЦ постачальника);
 * - нові товари додаються лише ті, що є в наявності, мають фото й категорію,
 *   яку власник зіставив з нашою;
 * - уже додані товари щодня оновлюють лише ціну й залишок. Назву, опис,
 *   фото й категорію не чіпаємо — власник міг їх поправити в адмінці;
 * - товара немає у файлі або «немає в наявності» — залишок 0 («Очікується»).
 */

export type FeedCategory = { id: string; name: string; inStock: number };
export type FeedOffer = {
  sku: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  categoryId: string;
  vendor: string;
  pictures: string[];
};
export type Feed = { categories: FeedCategory[]; offers: FeedOffer[] };

export type Supplier = {
  id: string;
  name: string;
  feedUrl: string;
  createdAt: string;
  categoryMap: Record<string, MappedCategory>;
  feedCategories: FeedCategory[];
  lastSyncAt?: string;
  lastSyncOk?: boolean;
  lastSyncMessage?: string;
  /** Товар не бренду постачальника з залишком 1 — «під замовлення» (правило Ranger) */
  otherBrandsOnRequest: boolean;
  /** Постачальник відправляє накладеним платежем (Atlantmarket — ні, лише після 100% передоплати) */
  codAllowed: boolean;
  /** Відправляє лише Новою поштою */
  novaPoshtaOnly: boolean;
  /** За скільки робочих днів відправляє після оплати / підтвердження (0 — у день замовлення до 14:00) */
  dispatchDays: number;
  /** Скільки товарів від постачальника є на сайті */
  products: number;
};

/** Найбільший строк відправки, який можна вказати в адмінці */
export const MAX_DISPATCH_DAYS = 10;

export type SyncResult = {
  created: number;
  updated: number;
  outOfStock: number;
  /** Нові товари без жодного фото — додані із заглушкою «Фото скоро» */
  noPhoto: number;
  skippedUnmapped: number;
  /** Нові товари без наявності — не додаються */
  skippedNotInStock: number;
};

const MAX_FEED_BYTES = 40_000_000;
const MISSING_NAME = /не знайдено|not found/i;

/* ---------- Читання файлу ---------- */

const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") return text((v as Record<string, unknown>)["#text"]);
  return String(v).trim();
};
const asArray = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Опис з файлу — звичайний текст: без HTML-тегів, абзаци через порожній рядок */
export function cleanDescription(raw: string): string {
  return raw
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 4000);
}

/** Розбирає YML-файл постачальника. Кидає зрозумілу помилку, якщо формат не той */
export function parseFeed(xml: string): Feed {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    isArray: (name) => ["offer", "picture", "category"].includes(name),
    // Артикули й назви — рядками («007» не має стати 7)
    parseTagValue: false,
    processEntities: true,
  });
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new Error("Файл не схожий на XML");
  }
  const shop = (doc.yml_catalog as Record<string, unknown> | undefined)?.shop as Record<string, unknown> | undefined;
  if (!shop) throw new Error("Це не YML-файл: немає <yml_catalog><shop>. Попросіть у постачальника вивантаження «для Prom / Rozetka» у форматі XML");

  const offersRaw = asArray((shop.offers as Record<string, unknown> | undefined)?.offer) as Record<string, unknown>[];
  const offers: FeedOffer[] = offersRaw.flatMap((o) => {
    const sku = text(o["@id"]) || text(o.vendorCode) || text(o.barcode);
    const nameUa = text(o.name_ua);
    const name = (nameUa && !MISSING_NAME.test(nameUa) ? nameUa : text(o.name)).slice(0, 120);
    const descUa = text(o.description_ua);
    const description = cleanDescription(descUa && !MISSING_NAME.test(descUa) ? descUa : text(o.description));
    // Точно як у постачальника, з копійками (РРЦ 1236.90 — не 1237)
    const price = Math.round(Number(text(o.price).replace(",", ".")) * 100) / 100;
    const available = text(o["@available"]) !== "false";
    const qtyRaw = text(o.stock_quantity) || text(o.quantity_in_stock);
    const qty = qtyRaw === "" ? (available ? 10 : 0) : Math.max(0, Math.floor(Number(qtyRaw)) || 0);
    // Ціна-заглушка (Ranger ставить 0.01 товарам, яких немає) — як товару немає у файлі
    if (!sku || !name || !Number.isFinite(price) || price < 1) return [];
    return [{
      sku: sku.slice(0, 100),
      name,
      description,
      price,
      stock: available ? qty : 0,
      categoryId: text(o.categoryId),
      vendor: text(o.vendor).slice(0, 60),
      // Пробіли в назвах файлів (Atlantmarket: «ganzo g203.jpg») — кодуємо, а не відкидаємо фото
      pictures: asArray(o.picture).map((p) => text(p).replace(/ /g, "%20")).filter((u) => /^https:\/\/[^\s"'<>]+$/i.test(u)).slice(0, MAX_IMAGES),
    }];
  });

  const inStock = new Map<string, number>();
  for (const o of offers) if (o.stock > 0) inStock.set(o.categoryId, (inStock.get(o.categoryId) ?? 0) + 1);
  const rawCategories = asArray((shop.categories as Record<string, unknown> | undefined)?.category).map((c) => ({
    id: text((c as Record<string, unknown>)["@id"]),
    parentId: text((c as Record<string, unknown>)["@parentId"]),
    name: text(c),
  }));
  const byId = new Map(rawCategories.map((c) => [c.id, c]));
  /*
   * Назва з шляхом від кореня: «Намети > Naturehike намети > Двомісні». Без батьків
   * у постачальників із деревом категорій однакові «Двомісні» чи «Аксесуари» не розрізнити
   */
  const pathName = (id: string) => {
    const parts: string[] = [];
    const seen = new Set<string>();
    // seen — від петель у файлі («категорія сама собі батько»)
    for (let c = byId.get(id); c && !seen.has(c.id) && seen.size < 10; c = byId.get(c.parentId)) {
      seen.add(c.id);
      parts.unshift(c.name);
    }
    return parts.join(PATH_SEPARATOR).slice(0, 200);
  };
  const categories = rawCategories.filter((c) => c.id).map((c) => ({ id: c.id, name: pathName(c.id), inStock: inStock.get(c.id) ?? 0 }));
  if (!offers.length) throw new Error("У файлі немає жодного товару");
  return { categories, offers };
}

/** Завантажує файл постачальника (лише https, до 40 МБ, до 60 с) */
export async function fetchFeed(url: string): Promise<Feed> {
  if (!/^https:\/\//i.test(url)) throw new Error("Посилання має починатися з https://");
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { "User-Agent": "FamilyCampingImport/1.0" } });
  } catch {
    throw new Error("Не вдалося завантажити файл постачальника (немає відповіді)");
  }
  if (!res.ok) throw new Error(`Сайт постачальника відповів ${res.status}`);
  const size = Number(res.headers.get("content-length") ?? 0);
  if (size > MAX_FEED_BYTES) throw new Error("Файл завеликий (понад 40 МБ)");
  const xml = await res.text();
  if (xml.length > MAX_FEED_BYTES) throw new Error("Файл завеликий (понад 40 МБ)");
  return parseFeed(xml);
}

/* ---------- Відповідність категорій (правила — у supplier-categories.ts) ---------- */

export { AUTO_CATEGORY, categoryFromName, suggestCategory, type MappedCategory };

/*
 * Бренд з назви. Ranger у файлі ставить vendor=Ranger і чужим брендам, які
 * продає (Gladiator, Mikado…), тож коли vendor — сам постачальник, шукаємо
 * відомий бренд у назві
 */
const KNOWN_BRANDS = [
  "Gladiator", "Mikado", "GoodLuck", "River Sport", "Sadei", "Yumoshi", "Keeplit", "YODO", "Adventure Outdoors",
  "Navigators", "Cobra King", "New Hunter", "Kirasa", "LeRoy", "Fishing ROI", "Hytera", "Aspor", "Kibas", "Vulkan",
  // Atlantmarket: у частини товарів порожній vendor. «Adimanti by Ganzo», «Firebird by Ganzo» — раніше за Ganzo
  "Naturehike", "Fenix", "Adimanti", "Firebird", "Ganzo", "Civivi", "Roxon", "NexTool", "Nextorch", "Ruike", "Sencut",
  "SRM", "Weknife", "Work Sharp", "Ruixin", "Brunox", "Dexshell", "Helikon-Tex", "Wacaco", "Flextail", "BRS", "Quest",
  "Litheli", "LiitoKala", "Olight", "Armytek", "Only Hot",
];
const brandPattern = (b: string) => new RegExp(`(?<![\\p{L}\\d])${b.replace(/\s+/g, "[\\s-]*")}(?![\\p{L}\\d])`, "iu");
const BRAND_PATTERNS = KNOWN_BRANDS.map((b) => [b, brandPattern(b)] as const);

export function brandFromName(name: string, vendor: string, supplierName: string): string {
  const own = supplierName.trim();
  if (vendor && vendor.trim().toLowerCase() !== own.toLowerCase()) return vendor.trim();
  // У назві є сам постачальник («Намет Ranger …») — це його бренд
  if (brandPattern(own).test(name)) return vendor || own;
  return BRAND_PATTERNS.find(([, re]) => re.test(name))?.[0] ?? (vendor || own);
}

/* ---------- Збереження ---------- */

const supplierFromRow = (r: Row): Supplier => ({
  id: r.id,
  name: r.name,
  feedUrl: r.feed_url,
  createdAt: iso(r.created_at),
  categoryMap: r.category_map ?? {},
  feedCategories: r.feed_categories ?? [],
  lastSyncAt: r.last_sync_at ? iso(r.last_sync_at) : undefined,
  lastSyncOk: r.last_sync_ok ?? undefined,
  lastSyncMessage: r.last_sync_message ?? undefined,
  otherBrandsOnRequest: r.other_brands_on_request === true,
  // До міграції 20261126000000 колонок ще немає — як було: усе дозволено, відправка в день
  codAllowed: r.cod_allowed !== false,
  novaPoshtaOnly: r.np_only === true,
  dispatchDays: Number(r.dispatch_days ?? 0),
  products: Number(r.products ?? 0),
});

const SELECT = `select s.*, (select count(*) from products p where p.supplier_id = s.id) as products from suppliers s`;

export async function listSuppliers(): Promise<Supplier[]> {
  return (await sql(`${SELECT} order by s.created_at`)).map(supplierFromRow);
}

export async function getSupplier(id: string, q: Queryable = db): Promise<Supplier | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await q.query(`${SELECT} where s.id = $1`, [id]);
  return row ? supplierFromRow(row) : null;
}

/** Новий постачальник: файл перевіряється одразу, категорії отримують підказки */
export async function createSupplier(name: string, feedUrl: string): Promise<Supplier> {
  const feed = await fetchFeed(feedUrl);
  const map = Object.fromEntries(feed.categories.map((c) => [c.id, suggestCategory(c.name, name)]));
  const [row] = await sql(
    "insert into suppliers (name, feed_url, category_map, feed_categories) values ($1, $2, $3::jsonb, $4::jsonb) returning id",
    [name, feedUrl, jsonb(map), jsonb(feed.categories)],
  );
  const terms = KNOWN_TERMS.find(([re]) => re.test(feedUrl))?.[1];
  if (terms) await updateSupplier(row.id, terms);
  return (await getSupplier(row.id))!;
}

/*
 * Умови відправки відомих постачальників (з їхніх договорів) — ставляться
 * при додаванні; власник може змінити їх у адмінці
 */
const KNOWN_TERMS: [RegExp, { codAllowed: boolean; novaPoshtaOnly: boolean; dispatchDays: number }][] = [
  // Договір поставки Atlantmarket: лише 100% передоплата, Нова пошта, відправка за 3 робочі дні після оплати
  [/^https:\/\/([^/]+\.)?atlantmarket\.com\.ua\//i, { codAllowed: false, novaPoshtaOnly: true, dispatchDays: 3 }],
];

export async function updateSupplier(
  id: string,
  patch: {
    name?: string;
    feedUrl?: string;
    categoryMap?: Record<string, string>;
    otherBrandsOnRequest?: boolean;
    codAllowed?: boolean;
    novaPoshtaOnly?: boolean;
    dispatchDays?: number;
  },
) {
  const map = patch.categoryMap
    ? Object.fromEntries(Object.entries(patch.categoryMap).filter(([k, v]) => k.length <= 60 && (v === "" || v === AUTO_CATEGORY || isCategorySlug(v))))
    : undefined;
  await sql(
    `update suppliers set name = coalesce($2, name), feed_url = coalesce($3, feed_url),
            category_map = coalesce($4::jsonb, category_map),
            other_brands_on_request = coalesce($5, other_brands_on_request) where id = $1`,
    [id, patch.name ?? null, patch.feedUrl ?? null, map ? jsonb(map) : null, patch.otherBrandsOnRequest ?? null],
  );
  // Окремим запитом: до міграції цих колонок немає, і зміна категорій не має від цього ламатися
  if (patch.codAllowed !== undefined || patch.novaPoshtaOnly !== undefined || patch.dispatchDays !== undefined) {
    const days = patch.dispatchDays === undefined ? null : Math.max(0, Math.min(MAX_DISPATCH_DAYS, Math.floor(patch.dispatchDays)));
    await sql(
      `update suppliers set cod_allowed = coalesce($2, cod_allowed), np_only = coalesce($3, np_only),
              dispatch_days = coalesce($4, dispatch_days) where id = $1`,
      [id, patch.codAllowed ?? null, patch.novaPoshtaOnly ?? null, days],
    );
    // Умови показуються на сторінках товарів і в кошику
    invalidateCatalog();
  }
}

/** Видаляє постачальника. Його товари лишаються на сайті, але більше не оновлюються */
export async function deleteSupplier(id: string) {
  await sql("delete from suppliers where id = $1", [id]);
}

/* ---------- Оновлення товарів ---------- */

/** Код товару в адресі сторінки з назви: «Намет Ranger Adventure» → namet-ranger-adventure */
function uniqueId(name: string, sku: string, taken: Set<string>): string {
  const base = slugify(name) || slugify(sku) || "tovar";
  let id = base.length >= 2 ? base : `${base}-1`;
  for (let i = 2; taken.has(id); i++) id = `${base.slice(0, 36)}-${i}`;
  taken.add(id);
  return id;
}

/**
 * Оновлює товари постачальника з його файлу. Усе — однією транзакцією:
 * при будь-якій помилці на сайті нічого не змінюється
 */
export async function syncSupplier(id: string, feedOverride?: Feed): Promise<SyncResult> {
  const supplier = await getSupplier(id);
  if (!supplier) throw new Error("Постачальника не знайдено");
  let feed: Feed;
  try {
    feed = feedOverride ?? (await fetchFeed(supplier.feedUrl));
  } catch (e) {
    await sql("update suppliers set last_sync_at = now(), last_sync_ok = false, last_sync_message = $2 where id = $1", [id, (e as Error).message]);
    throw e;
  }

  const result: SyncResult = { created: 0, updated: 0, outOfStock: 0, noPhoto: 0, skippedUnmapped: 0, skippedNotInStock: 0 };
  const mails: Mail[] = [];

  /*
   * Пакетами: сервер сайту й база можуть бути на різних континентах, тож
   * кількість запитів не залежить від кількості товарів (сотні товарів — кілька запитів)
   */
  await tx(async (q) => {
    // Рядки постачальника блокуються до кінця транзакції (паралельне замовлення чекає)
    // Без описів (LIST_COLUMNS): щогодини ~1800 рядків — описи дали б мегабайти трафіку бази щоразу
    const current = (await q.query(`select ${LIST_COLUMNS} from products p where p.supplier_id = $1 for update`, [id])).map((r) => ({
      sku: r.supplier_sku as string,
      product: productFromRow(r),
    }));
    const existing = new Map(current.map((c) => [c.sku, c.product]));
    const taken = new Set((await q.query("select id from products")).map((r) => r.id as string));
    const [{ max }] = await q.query("select coalesce(max(popularity), 0) as max from products");
    let popularity = Number(max);
    const seen = new Set<string>();
    const changes: { id: string; price: number; stock: number; on_request: boolean }[] = [];
    /** Бренд з назви для вже доданих товарів, у яких досі бренд за замовчуванням */
    const brandFixes: { id: string; brand: string; attrs: [string, string][]; specs: string }[] = [];
    const photoUpdates: { id: string; images: string[]; image: string }[] = [];
    const events: { after: Product; before: Product }[] = [];
    const created: (Product & { sku: string })[] = [];
    /** Ranger: товар не їхнього бренду з залишком «1» можна замовити в будь-якій кількості — «під замовлення» */
    const onRequestOf = (o: FeedOffer) =>
      supplier.otherBrandsOnRequest && o.stock === 1 && !!o.vendor && o.vendor.toLowerCase() !== supplier.name.toLowerCase();

    for (const o of feed.offers) {
      if (seen.has(o.sku)) continue;
      seen.add(o.sku);
      const before = existing.get(o.sku);
      const onRequest = onRequestOf(o);
      const brand = brandFromName(o.name, o.vendor, supplier.name);

      if (before) {
        // Бренд виправляємо, лише якщо він той, що поставив імпорт (власник міг змінити його в адмінці)
        if (before.brand !== brand && before.brand === (o.vendor || supplier.name)) {
          const swap = (s: string) => s.split(before.brand).join(brand);
          brandFixes.push({
            id: before.id,
            brand,
            attrs: before.attrs.map(([k, v]) => [k, k === "Бренд" && v === before.brand ? brand : v] as [string, string]),
            specs: swap(before.specs ?? ""),
          });
        }
        // Заглушку «Фото скоро» замінюємо фото, щойно постачальник їх додав (власні фото власника не чіпаємо)
        const placeholderOnly = before.images?.length === 1 && before.images[0] === PLACEHOLDER_PHOTO;
        if (placeholderOnly && o.pictures.length) photoUpdates.push({ id: before.id, images: o.pictures, image: o.pictures[0] });
        // Уже на сайті — лише ціна, залишок і «під замовлення»
        if (before.price === o.price && before.stock === o.stock && !!before.onRequest === onRequest) continue;
        changes.push({ id: before.id, price: o.price, stock: o.stock, on_request: onRequest });
        const after = withDerived({ ...before, price: o.price, stock: o.stock, onRequest: onRequest || undefined });
        // Сповіщення: «знову в наявності» підписникам, «ціна знизилась» — тим, у кого в обраному
        if ((before.stock === 0 && o.stock > 0) || o.price < before.price) events.push({ after, before });
        if (o.stock === 0 && before.stock > 0) result.outOfStock++;
        else result.updated++;
        continue;
      }

      // Новий товар
      // Спершу наявність: «пропущено без категорії» — лише серед тих, що є в наявності
      if (o.stock <= 0) { result.skippedNotInStock++; continue; }
      const mapped = supplier.categoryMap[o.categoryId];
      // «За назвою товару» — для збірних категорій постачальника
      const category = mapped === AUTO_CATEGORY ? categoryFromName(o.name) : mapped || undefined;
      if (!category) { result.skippedUnmapped++; continue; }
      // Без жодного фото — нейтральна заглушка «Фото скоро», а не чуже стокове фото
      if (!o.pictures.length) result.noPhoto++;
      created.push({
        ...withDerived({
          id: uniqueId(o.name, o.sku, taken),
          name: o.name,
          category,
          brand,
          price: o.price,
          rating: 0,
          reviews: 0,
          inStock: true,
          stock: o.stock,
          description: o.description || undefined,
          images: o.pictures.length ? o.pictures : [PLACEHOLDER_PHOTO],
          onRequest: onRequest || undefined,
          popularity: ++popularity,
          specs: `${brand} · арт. ${o.sku}`,
          image: "",
          photo: categoryPhotos[category][0],
          attrs: [["Бренд", brand], ["Артикул", o.sku]],
        } satisfies Product),
        sku: o.sku,
      });
      result.created++;
    }

    // Зникли з файлу — немає в наявності
    for (const [sku, p] of existing) {
      if (seen.has(sku) || p.stock === 0) continue;
      changes.push({ id: p.id, price: p.price, stock: 0, on_request: false });
      result.outOfStock++;
    }

    if (changes.length)
      await q.query(
        `update products p set price = v.price, stock = v.stock, on_request = v.on_request, updated_at = now(),
                old_price = case when p.old_price <= v.price then null else p.old_price end
         from jsonb_to_recordset($1::jsonb) as v(id text, price numeric, stock int, on_request boolean) where p.id = v.id`,
        [jsonb(changes)],
      );
    if (brandFixes.length)
      await q.query(
        `update products p set brand = v.brand, attrs = v.attrs, specs = v.specs, updated_at = now()
         from jsonb_to_recordset($1::jsonb) as v(id text, brand text, attrs jsonb, specs text) where p.id = v.id`,
        [jsonb(brandFixes)],
      );
    if (photoUpdates.length)
      await q.query(
        `update products p set images = v.images, image = v.image, updated_at = now()
         from jsonb_to_recordset($1::jsonb) as v(id text, images jsonb, image text) where p.id = v.id`,
        [jsonb(photoUpdates)],
      );
    if (created.length)
      await q.query(
        `insert into products (id, name, category, brand, price, stock, description, popularity, specs, image, photo,
                               attrs, images, on_request, updated_at, supplier_id, supplier_sku)
         select id, name, category, brand, price, stock, description, popularity, specs, image, photo,
                attrs, images, coalesce(on_request, false), now(), $2, sku
         from jsonb_to_recordset($1::jsonb) as x(id text, name text, category text, brand text, price numeric, stock int,
              description text, popularity int, specs text, image text, photo text, attrs jsonb, images jsonb,
              on_request boolean, sku text)`,
        [jsonb(created.map((p) => ({ ...p, description: p.description ?? null, on_request: !!p.onRequest }))), id],
      );
    for (const e of events) await productEvents(q, e.after, snapshot(e.before), mails);

    const message =
      `Додано ${result.created}, оновлено ${result.updated}, закінчилось ${result.outOfStock}` +
      (result.skippedUnmapped ? `; пропущено без категорії — ${result.skippedUnmapped}` : "") +
      (result.noPhoto ? `; без фото (із заглушкою) — ${result.noPhoto}` : "") +
      (photoUpdates.length ? `; з'явились фото — ${photoUpdates.length}` : "") +
      (brandFixes.length ? `; бренд з назви — ${brandFixes.length}` : "");
    const map = Object.fromEntries(feed.categories.map((c) => [c.id, supplier.categoryMap[c.id] ?? suggestCategory(c.name, supplier.name)]));
    await q.query(
      `update suppliers set last_sync_at = now(), last_sync_ok = true, last_sync_message = $2,
              feed_categories = $3::jsonb, category_map = $4::jsonb where id = $1`,
      [id, message, jsonb(feed.categories), jsonb(map)],
    );
  });

  invalidateCatalog();
  await sendMails(mails);
  return result;
}

/** Щоденне оновлення всіх постачальників (помилка одного не зупиняє інших) */
export async function syncAllSuppliers(): Promise<Record<string, SyncResult | { error: string }>> {
  const out: Record<string, SyncResult | { error: string }> = {};
  for (const s of await listSuppliers()) {
    try {
      out[s.name] = await syncSupplier(s.id);
    } catch (e) {
      out[s.name] = { error: (e as Error).message };
    }
  }
  return out;
}

/** Товари постачальника, як їх бачить адмінка (для тестів і підсумків) */
export async function supplierProducts(id: string): Promise<Product[]> {
  return (await sql("select * from products where supplier_id = $1 order by popularity", [id])).map(productFromRow);
}
