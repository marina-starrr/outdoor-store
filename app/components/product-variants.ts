import type { Product } from "./catalog-data";
import { SIZE_CATEGORIES, colorLabels, colorPatterns, facetValues, stripCodes } from "./catalog-facets";

/*
 * Варіанти товару: один товар у кількох кольорах і/або розмірах.
 *
 * Постачальники дають кожен розмір окремим товаром («Термобілизна Ranger Active (S)»,
 * «… (M)»…), і так вони й лишаються в базі — кожен зі своїм залишком, ціною й
 * адресою. Тут вони лише групуються: у каталозі — одна картка, на сторінці
 * товару — вибір кольору й розміру.
 *
 * Група — товари однієї категорії й бренду, назви яких збігаються, якщо прибрати
 * колір, розмір і артикул. Групуємо лише «чисті» випадки: у кожного товару є
 * значення кожної ознаки, що змінюється, і жодні два товари не мають однакового
 * набору (інакше не зрозуміло, що обирає покупець).
 */

export type VariantDim = "color" | "size";
export const variantDimTitle: Record<VariantDim, string> = { color: "Колір", size: "Розмір" };

export type VariantGroup = {
  key: string;
  /** Назва без кольору й розміру — для картки в каталозі */
  title: string;
  /** Ознаки, що змінюються в межах групи (порядок: колір, розмір) */
  dims: VariantDim[];
  members: Product[];
};

/* Розміри (лише одяг і тактичне): літерні — великими літерами, кирилицю-«двійника» теж */
const LETTER_SIZE = /(?<![\p{L}/])(?:[XХ]{0,3}[SС]|[MМ]|[XХ]{0,3}L|[3-5][XХ]L)(?![\p{L}/])/gu;
const RANGE_SIZE = /(?:(?<!\p{L})р\.?\s*)?(?<![\d,]|\d\.)(\d{2})\s*-\s*(\d{2})(?![\d.,])/giu;
const NUMERIC_SIZE = /(?<![\d.,\-–])(4[4-9]|5\d|6[0-2])(?![\d.,\-–]|\s*(?:мм|см|cm|mm|г|g|л|кг|%))/giu;
const COLOR_WORDS = colorPatterns.map((re) => new RegExp(`(?:${re.source})[\\p{L}]*`, "giu"));

/** Назва без артикула, кольору й розміру: «Термобілизна Ranger Active (S)» → «Термобілизна Ranger Active» */
export function baseTitle(p: Pick<Product, "name" | "category">): string {
  let s = stripCodes(p.name);
  for (const re of COLOR_WORDS) s = s.replace(re, " ");
  if (SIZE_CATEGORIES.has(p.category)) {
    s = s
      .replace(RANGE_SIZE, (all, a, b) => (Number(a) >= 35 && Number(b) <= 64 && Number(b) > Number(a) ? " " : all))
      .replace(NUMERIC_SIZE, (all, n) => (Number(n) % 2 === 0 ? " " : all))
      .replace(LETTER_SIZE, " ");
  }
  return s
    .replace(/\(\s*[,.\-–]*\s*\)/g, " ")
    .replace(/\s+([,.)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/[\s,.\-–]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const normalize = (s: string) => s.toLocaleLowerCase("uk").replace(/[^\p{L}\d]+/gu, " ").trim();

/** Значення ознаки варіанта: «Мультикам», «XL», «M / 48» */
export function variantValue(p: Product, dim: VariantDim): string {
  return facetValues(p)[dim].join(" / ");
}

const cache = new WeakMap<readonly Product[], Map<string, VariantGroup>>();

/** Групи варіантів каталогу: id товару → його група (товари без групи відсутні) */
export function variantGroups(products: readonly Product[]): Map<string, VariantGroup> {
  const hit = cache.get(products);
  if (hit) return hit;

  const byKey = new Map<string, Product[]>();
  for (const p of products) {
    if (p.hidden) continue;
    const key = `${p.category}|${normalize(p.brand ?? "")}|${normalize(baseTitle(p))}`;
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }

  const groups = new Map<string, VariantGroup>();
  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    const dims = (["color", "size"] as VariantDim[]).filter((d) => new Set(members.map((m) => variantValue(m, d))).size > 1);
    if (!dims.length) continue;
    // У кожного є значення кожної ознаки, і набори не повторюються
    if (members.some((m) => dims.some((d) => !variantValue(m, d)))) continue;
    const combos = new Set(members.map((m) => dims.map((d) => variantValue(m, d)).join("|")));
    if (combos.size !== members.length) continue;
    const group: VariantGroup = { key, title: baseTitle(members[0]), dims, members };
    for (const m of members) groups.set(m.id, group);
  }
  cache.set(products, groups);
  return groups;
}

export type CardItem = { product: Product; group?: VariantGroup };

/**
 * Одна картка на групу: на місці першого з групи в уже відсортованому й
 * відфільтрованому списку. Показуємо той варіант, що є в наявності
 */
export function collapseVariants(list: readonly Product[], groups: Map<string, VariantGroup>): CardItem[] {
  const seen = new Set<string>();
  const out: CardItem[] = [];
  for (const p of list) {
    const group = groups.get(p.id);
    if (!group) {
      out.push({ product: p });
      continue;
    }
    if (seen.has(group.key)) continue;
    seen.add(group.key);
    const inList = list.filter((x) => groups.get(x.id) === group);
    const product = inList.find((x) => x.inStock && !x.onRequest) ?? inList.find((x) => x.inStock) ?? p;
    out.push({ product, group });
  }
  return out;
}

/** «3 кольори · 6 розмірів» для картки */
export function variantSummary(group: VariantGroup): string {
  const words: Record<VariantDim, [string, string, string]> = {
    color: ["колір", "кольори", "кольорів"],
    size: ["розмір", "розміри", "розмірів"],
  };
  return group.dims
    .map((d) => {
      const n = new Set(group.members.map((m) => variantValue(m, d))).size;
      const [one, few, many] = words[d];
      const mod10 = n % 10, mod100 = n % 100;
      const word = mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
      return `${n} ${word}`;
    })
    .join(" · ");
}

/** Варіанти ознаки на сторінці товару: значення, куди веде вибір, чи є в наявності */
export function variantOptions(current: Product, group: VariantGroup, dim: VariantDim) {
  const values = facetSortedValues(group, dim);
  return values.map((value) => {
    const withValue = group.members.filter((m) => variantValue(m, dim) === value);
    // Інші ознаки — як у поточного товару; якщо такого поєднання немає — будь-який з цим значенням
    const exact = withValue.find((m) => group.dims.every((d) => d === dim || variantValue(m, d) === variantValue(current, d)));
    const target = exact ?? withValue.find((m) => m.inStock) ?? withValue[0];
    return {
      value,
      product: target,
      selected: variantValue(current, dim) === value,
      /** Поєднання з поточним вибором існує і є в наявності */
      available: !!exact && exact.inStock,
    };
  });
}

/**
 * Основний варіант групи — для пошукових систем (canonical і sitemap): сторінки
 * розмірів і кольорів майже однакові, тож Google показуватиме одну. Перший за
 * порядком кольору й розміру — не залежить від продажів і залишків, тож не «стрибає»
 */
export function primaryVariant(group: VariantGroup): Product {
  const rank = (p: Product) => group.dims.map((d) => facetSortedValues(group, d).indexOf(variantValue(p, d)));
  return [...group.members].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return a.id.localeCompare(b.id);
  })[0];
}

const LETTER_ORDER =["XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL"];
function facetSortedValues(group: VariantGroup, dim: VariantDim): string[] {
  const values = [...new Set(group.members.map((m) => variantValue(m, dim)))];
  if (dim === "color") {
    const rank = (v: string) => colorLabels.indexOf(v.split(" / ")[0]);
    return values.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "uk"));
  }
  const rank = (v: string) => {
    const first = v.split(" / ")[0];
    const letter = LETTER_ORDER.indexOf(first);
    return letter >= 0 ? letter : 100 + Number.parseInt(first, 10);
  };
  return values.sort((a, b) => rank(a) - rank(b));
}
