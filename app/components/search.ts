import { categoryBySlug, type Product } from "./catalog-data";

/*
 * Пошук товарів — спільний для підказок у шапці та сторінки каталогу.
 * Шукає за назвою, брендом, категорією й характеристиками; розуміє запит,
 * набраний в англійській розкладці («yfvtn» → «намет»).
 */

/** Нормалізація: регістр, різні апострофи, ё/ъ, зайві пробіли */
export function normalize(s: string) {
  return s
    .toLocaleLowerCase("uk")
    .replace(/[’ʼ`´]/g, "'")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}'.,+−-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";
const UK = "йцукенгшщзхїфівапролджєячсмитьбю";
const layoutMap = new Map([...EN].map((ch, i) => [ch, UK[i]]));

/** Запит, набраний латиницею в англійській розкладці → кирилиця */
export function fromEnglishLayout(q: string) {
  return [...q.toLowerCase()].map((ch) => layoutMap.get(ch) ?? ch).join("");
}

const haystack = (p: Product) =>
  normalize(`${p.name} ${p.brand} ${categoryBySlug[p.category]?.name ?? ""} ${p.specs}`);

/** Чи підходить товар під запит (усі слова запиту мають знайтися) */
export function matchesSearch(p: Product, query: string) {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (!tokens.length) return true;
  const hay = haystack(p);
  return tokens.every((t) => hay.includes(t));
}

function score(p: Product, q: string) {
  const name = normalize(p.name);
  const tokens = q.split(" ");
  let s = 0;
  if (name.startsWith(q)) s += 100;
  else if (name.includes(q)) s += 60;
  for (const t of tokens) {
    if (name.split(" ").some((w) => w.startsWith(t))) s += 12;
    if (normalize(p.brand).startsWith(t)) s += 6;
    if (normalize(categoryBySlug[p.category]?.name ?? "").includes(t)) s += 4;
  }
  if (p.inStock) s += 3;
  return s;
}

export type SearchResult = {
  items: Product[];
  total: number;
  /** Якщо запит розпізнано як набраний не в тій розкладці — виправлений варіант */
  corrected?: string;
};

function run(products: Product[], q: string) {
  return products
    .filter((p) => !p.hidden && matchesSearch(p, q))
    .map((p) => ({ p, s: score(p, q) }))
    .sort((a, b) => b.s - a.s || b.p.reviews - a.p.reviews)
    .map((x) => x.p);
}

/** Найрелевантніші товари першими; total — скільки знайдено всього */
export function searchProducts(products: Product[], query: string, limit = 6): SearchResult {
  const q = normalize(query);
  if (q.length < 2) return { items: [], total: 0 };
  let found = run(products, q);
  let corrected: string | undefined;
  if (!found.length && /[a-z]/i.test(q)) {
    const alt = normalize(fromEnglishLayout(q));
    const altFound = run(products, alt);
    if (altFound.length) {
      found = altFound;
      corrected = alt;
    }
  }
  return { items: found.slice(0, limit), total: found.length, corrected };
}
