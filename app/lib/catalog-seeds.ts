import { categories, selectShowcase, type CategorySlug, type Product } from "../components/catalog-data";
import { relatedProducts } from "../components/product-details";
import { variantGroups } from "../components/product-variants";

/*
 * Товари, які сторінка отримує разом із HTML (решту каталогу браузер довантажує
 * окремо з /api/catalog — див. Catalog.tsx).
 *
 * Навіщо: раніше КОЖНА сторінка несла в собі весь каталог (2200 товарів, мегабайти).
 * Пошукові роботи обходять тисячі сторінок — і Vercel вимкнув сайт за перевищення
 * Fast Origin Transfer (27,6 ГБ за місяць при ліміті Hobby). Тепер сторінка несе лише
 * те, що показує: Google бачить ті самі товари, а важить вона в десятки разів менше.
 *
 * Спільне для сервера (сторінки) і браузера (константи вітрин).
 */

/** Скільки товарів у вітрині на головній */
export const SHOWCASE_SIZE = 4;
/** Скільки товарів щонайменше показує сторінка «Хіти», поки справжніх хітів мало */
export const HITS_PAGE_MIN = 12;
/** Готовий набір із хітів для першої сімейної ночівлі (сторінка «Хіти») */
export const HITS_BUNDLE: { id: string; qty: number }[] = [
  { id: "ch3", qty: 1 },
  { id: "sb-alpine", qty: 2 },
  { id: "ck-set", qty: 1 },
  { id: "fu-chair", qty: 2 },
  { id: "li-head", qty: 1 },
];
/** Скільки товарів кожної категорії показує сторінка «Каталог» одразу (решта — після завантаження) */
const OVERVIEW_PER_CATEGORY = 12;

/** Без фото-галереї: у картках вона не потрібна (галерея — лише на сторінці товару) */
export function slimProduct(p: Product): Product {
  const { images: _gallery, ...rest } = p;
  void _gallery;
  return rest;
}

/** Товари + інші кольори й розміри тих самих моделей (картки показують «3 кольори»), без повторів */
function withVariants(all: Product[], picked: Product[]): Product[] {
  const groups = variantGroups(all);
  const out = new Map<string, Product>();
  for (const p of picked) {
    out.set(p.id, p);
    for (const m of groups.get(p.id)?.members ?? []) out.set(m.id, m);
  }
  return [...out.values()].map(slimProduct);
}

/** Головна: вітрина + найдешевший товар у наявності з кожної категорії («від … ₴») */
export function homeSeed(all: Product[]): Product[] {
  const cheapest = new Map<CategorySlug, Product>();
  for (const p of all) {
    if (!p.inStock) continue;
    const current = cheapest.get(p.category);
    if (!current || p.price < current.price) cheapest.set(p.category, p);
  }
  return withVariants(all, [...selectShowcase(all, SHOWCASE_SIZE), ...cheapest.values()]);
}

/** «Хіти»: хіти, товари набору й товари з відгуків */
export function hitsSeed(all: Product[], extraIds: string[] = []): Product[] {
  const ids = new Set([...HITS_BUNDLE.map((b) => b.id), ...extraIds]);
  return withVariants(all, [...selectShowcase(all, HITS_PAGE_MIN), ...all.filter((p) => ids.has(p.id))]);
}

/** «Каталог»: найпопулярніші товари кожної категорії */
export function overviewSeed(all: Product[]): Product[] {
  const picked = categories.flatMap((c) =>
    all
      .filter((p) => p.category === c.slug)
      .sort((a, b) => a.popularity - b.popularity)
      .slice(0, OVERVIEW_PER_CATEGORY),
  );
  return withVariants(all, picked);
}

/** Сторінка категорії: усі її товари (фільтри, сортування, лічильники — з них) */
export const categorySeed = (all: Product[], slug: CategorySlug): Product[] =>
  all.filter((p) => p.category === slug).map(slimProduct);

/** Сторінка товару: його кольори й розміри + «Схожі товари» (ті самі, що вибере сторінка) */
export function productSeed(all: Product[], product: Product): Product[] {
  const groups = variantGroups(all);
  const own = groups.get(product.id);
  const candidates = all.filter((p) => !own || groups.get(p.id) !== own);
  return withVariants(all, [product, ...relatedProducts(candidates, product, 12)]);
}
