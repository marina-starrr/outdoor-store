import type { CategorySlug, Product } from "./catalog-data";

/*
 * Додаткові фільтри каталогу: тип товару, колір, розмір, об'єм, місткість намету.
 * Постачальники не дають структурованих характеристик, тож значення беруться
 * з назви (і рядка «Колір: …» в описі) — нові товари потрапляють у фільтри самі.
 * Фільтр показується лише там, де в категорії є хоча б два різні значення.
 */

export type FacetId = "type" | "color" | "size" | "volume";

export type FacetInfo = { id: FacetId; title: string; param: string };

export const facetList: FacetInfo[] = [
  { id: "type", title: "Тип товару", param: "type" },
  { id: "color", title: "Колір", param: "color" },
  { id: "size", title: "Розмір", param: "size" },
  { id: "volume", title: "Об'єм", param: "vol" },
];

export const OTHER_TYPE = "Інше";

type Rule = [label: string, test: RegExp];

/** Тип товару за назвою: перше правило, що підійшло (порядок важливий) */
const typeRules: Partial<Record<CategorySlug, Rule[]>> = {
  tents: [
    ["Зимові покриття", /^зимове покриття/],
    ["Душ і туалет", /душ|туалет/],
    ["Коропові намети", /^намет коропов|bivvy/],
    ["Намети", /намет|шатро/],
    ["Тенти", /тент/],
  ],
  backpacks: [
    ["Рюкзаки", /рюкзак/],
    ["Гермомішки", /гермомішок|гермомішк/],
    ["Чохли", /^чохол/],
  ],
  "sleeping-bags": [
    ["Спальні мішки", /спальн/],
    ["Сидушки", /сидушк/],
    ["Карімати й килимки", /карема|карима|килим/],
  ],
  cookware: [
    ["Сковорідки", /сковор|садж/],
    ["Казани", /казан/],
    ["Каструлі", /каструл/],
    ["Кришки", /^кришк/],
    ["Чайники", /чайник/],
    ["Пальники", /пальник/],
    ["Набори посуду", /^набір/],
    ["Кухлі й чашки", /кухл|чашк|кружк/],
  ],
  furniture: [
    ["Чохли й аксесуари", /^чохол|^тримач|ніжка/],
    ["Шезлонги", /шезлонг/],
    ["Розкладачки й ліжка", /розкладачк|ліжк/],
    ["Крісла", /^кр[іi]сло/],
    ["Стільці", /^стіл[еє]ць|табурет/],
    ["Столи", /^стіл(?![еє]ць)/],
    ["Комплекти меблів", /^комплект|^набір меблів/],
  ],
  lighting: [
    ["Налобні ліхтарі", /налобн/],
    ["Кемпінгові лампи", /ламп/],
    ["Гірлянди", /гірлянд/],
    ["Ліхтарі", /ліхтар/],
  ],
  grills: [
    ["Мангали", /мангал/],
    ["Грилі", /гриль/],
    ["Шампури", /шампур/],
    ["Решітки", /решітк/],
  ],
  hammocks: [
    ["Гамаки", /гамак/],
    ["Павільйони", /павільйон/],
    ["Гойдалки", /гойдалк/],
  ],
  accessories: [
    ["Захист від комарів", /комар|репелент/],
    ["Ліхтарі", /ліхтар/],
  ],
  picnic: [
    ["Термосумки", /термосумк/],
    ["Автохолодильники", /холодильник/],
    ["Набори для пікніка", /набір для пікні/],
    ["Акумулятори холоду", /акумулятор холоду/],
    ["Чайники", /чайник/],
  ],
  thermos: [
    ["Термоси", /^термос(?!умк)/],
    ["Термокухлі", /термокру|термокух|термочаш/],
    ["Чохли", /^чохол/],
  ],
  clothing: [
    ["Термобілизна", /термобілизн/],
    ["Шкарпетки", /шкарпет/],
  ],
  tactical: [
    ["Підсумки", /^підсумок/],
    ["Плитоноски й розвантаження", /плитоноск|розвантаж/],
    ["Головні убори", /шапк|панам|кепк|балаклав|бафф|^комплект \(шапка/],
    ["Кавери", /^кавер/],
    ["Рукавички", /перчатк|рукавич/],
    ["Одяг", /кофт|футболк|штан|шорт|пончо/],
    ["Медицина й евакуація", /аптечк|евакуац/],
    ["Платформи й кобури", /платформ|кобур/],
    ["Сидушки й карімати", /сидушк|карема|карима/],
  ],
  fishing: [
    ["Котушки", /^котушк/],
    ["Спінінги", /^[сc]пінінг/],
    ["Вудки", /^вудка/],
    ["Вудилища", /вудилищ/],
    ["Підставки й род-поди", /^підставк|^род-под|^буз-бар/],
    ["Сигналізатори", /сигналізатор/],
  ],
  electronics: [
    ["Рації", /раці/],
    ["Павербанки", /power ?bank|павербанк|повербанк/],
    ["Зарядні станції", /зарядн\p{L}* станц/u],
    ["Акумулятори й батарейки", /акумулятор|батаре/],
    ["Зарядні пристрої", /зарядн\p{L}* пристр|зарядк/u],
  ],
  knives: [
    ["Чохли й аксесуари", /^чохол|^піхв|темляк|^кліпс|^аксесуар|^органайзер|затискач|бусин|^гвинт/],
    ["Ножі з фіксованим клинком", /фіксован/],
    ["Складані ножі", /складан|кишеньков|флі?пер/],
    // «Нiж» трапляється з латинською i
    ["Ножі", /н[іi]ж|нож/],
  ],
  sharpeners: [
    ["Електричні точила", /електричн|электричн/],
    ["Абразиви й змінні частини", /абразив|диск|стрижен|стрічк|ремін|ремен|пластин|паст|набір для оновлення|змінн/],
    ["Точильні камені й мусати", /камін|брусок|камен|мусат/],
    ["Ручні точила", /точил|точильн/],
  ],
  multitools: [
    ["Змінні інструменти й аксесуари", /^змінн|^набір змінн|^біт|^чохол|^адаптер/],
    ["Мультитули", /мультитул|multi-?tool/],
  ],
  tools: [
    ["Лопати", /лопат/],
    ["Сокири й мачете", /сокир|мачет/],
    ["Акумуляторні інструменти", /акумуляторн|litheli/],
  ],
  lubricants: [
    ["Для зброї", /зброї|gun/],
    ["Для велосипеда", /вело|bike|ланцюг/],
    ["Від іржі й корозії", /іржі|корозі/],
    ["Універсальні мастила", /мастил|масло|спрей/],
  ],
  burners: [
    ["Газові балони", /балон|картридж/],
    ["Системи приготування їжі", /систем\p{L}* (для )?приготування/u],
    ["Плитки й плити", /плитк|плита/],
    ["Газові лампи", /ламп/],
    ["Обігрівачі", /обігрівач/],
    ["Вітрозахист і аксесуари", /вітрозахист|підставк|адаптер|шланг|перехідник/],
    ["Пальники", /пальник|піч/],
  ],
};

/** Кольори: назва → шаблон (у назві може бути кілька, напр. «червоно-жовта») */
const colorRules: Rule[] = [
  ["Мультикам", /мульт[иі]кам|multicam/],
  ["Піксель", /піксел|pixel/],
  ["Олива", /олив|olive/],
  ["Хакі", /хак[іи]|khaki/],
  ["Койот", /койот|coyote/],
  ["Чорний", /чорн|black/],
  ["Сірий", /(?<!\p{L})сір|grey|gray|антрацит/u],
  ["Зелений", /зелен|green/],
  ["Синій", /(?<!\p{L})син[іья]|blue/u],
  ["Червоний", /червон|(?<!\p{L})red(?!\p{L})/u],
  ["Коричневий", /коричнев|brown/],
  ["Жовтий", /жовт|yellow/],
  ["Бежевий", /(?<!\p{L})беж|beige/u],
  ["Помаранчевий", /помаранч|оранж|orange/],
  ["Білий", /(?<!\p{L})біл[ийаі]|white/u],
];

/** Для варіантів товару: назви кольорів (у порядку фільтра) і їхні шаблони */
export const colorLabels = colorRules.map(([label]) => label);
export const colorPatterns = colorRules.map(([, re]) => re);

/** Розмір шукаємо лише там, де він справді є (одяг, головні убори) */
export const SIZE_CATEGORIES = new Set<CategorySlug>(["clothing", "tactical"]);
const LETTER_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL"];

/** Без артикулів у дужках — щоб «KI4239XL» не став розміром XL */
export const stripCodes = (name: string) =>
  name
    .replace(/\(\s*(?:арт|art)[^)]*\)?/gi, " ")
    .replace(/\(\s*[A-Z]{1,3}\s?\d[\w\-]*\s*\)\s*$/i, " ")
    .replace(/\(\s*\d+-[\d\-]+\s*\)\s*$/, " ");

const lower = (s: string) => s.toLocaleLowerCase("uk");

function typeOf(p: Product): string | undefined {
  const rules = typeRules[p.category];
  if (!rules) return undefined;
  const name = lower(p.name).trim();
  return rules.find(([, re]) => re.test(name))?.[0] ?? OTHER_TYPE;
}

function colorsOf(p: Product): string[] {
  const name = lower(p.name);
  // У назві кольору немає — пробуємо рядок «Колір: …» з опису
  const fromDescription = lower(p.description ?? "").match(/колір\s*:\s*([^\n;.,]{1,40})/)?.[1] ?? "";
  for (const text of [name, fromDescription]) {
    const found = colorRules.filter(([, re]) => re.test(text)).map(([label]) => label);
    if (found.length) return found;
  }
  return [];
}

function sizesOf(p: Product): string[] {
  if (!SIZE_CATEGORIES.has(p.category)) return [];
  // Кирилиця, схожа на латиницю (М(48), XXХL), — до латиниці
  const name = stripCodes(p.name).replace(/[МмХхСс]/g, (ch) => ({ М: "M", м: "m", Х: "X", х: "x", С: "C", с: "c" })[ch]!).toUpperCase();
  const sizes = new Set<string>();
  for (const m of name.matchAll(/(?<![\p{L}/])(XS|XXXL|XXL|XL|[3-5]XL|S|M|L)(?![\p{L}/])/gu))
    sizes.add(m[1] === "3XL" ? "XXXL" : m[1]);
  // Обхват голови / розмір взуття: 55-57, 58-61, р.39-41
  for (const m of name.matchAll(/(?<![\d,]|\d\.)(\d{2})\s*-\s*(\d{2})(?![\d.,])/g)) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a >= 35 && b <= 64 && b > a && b - a <= 4) sizes.add(`${a}–${b}`);
  }
  // Розмір одягу: 46, 48 … 62 (не грамовка «320г/м» і не «20 мм»)
  for (const m of name.matchAll(/(?<![\d.,\-–])(4[4-9]|5\d|6[0-2])(?![\d.,\-–]|\s*(?:ММ|СМ|CM|MM|Г|G|Л|КГ|%))/g))
    if (Number(m[1]) % 2 === 0) sizes.add(m[1]);
  return [...sizes];
}

function volumesOf(p: Product): string[] {
  const m = stripCodes(p.name).match(/(?<![\d.,])(\d{1,3}(?:[.,]\d{1,3})?)\s*(?:л|l|літр)(?!\p{L})/iu);
  if (!m) return [];
  const value = Number(m[1].replace(",", "."));
  return value > 0 ? [`${String(value).replace(".", ",")} л`] : [];
}

/** Місткість намету: з бази (початковий каталог) або з назви («Ascent 4», «3-mann», «2 MAN») */
export function placesOf(p: Product): number | undefined {
  if (p.capacity !== undefined) return p.capacity;
  if (p.category !== "tents" || /^зимове покриття|душ|туалет/i.test(p.name)) return undefined;
  const name = stripCodes(p.name);
  const m = name.match(/(?<!\d)([1-8])\s*-?\s*(?:mann|man|місн)/i) ?? name.match(/\s([1-8])\s*(?:\(|$)/);
  return m ? Number(m[1]) : undefined;
}

const cache = new WeakMap<Product, Record<FacetId, string[]>>();

/** Значення всіх фільтрів товару (кешується на об'єкт товару) */
export function facetValues(p: Product): Record<FacetId, string[]> {
  let v = cache.get(p);
  if (!v) {
    const type = typeOf(p);
    v = { type: type ? [type] : [], color: colorsOf(p), size: sizesOf(p), volume: volumesOf(p) };
    cache.set(p, v);
  }
  return v;
}

const sizeRank = (s: string) => {
  const letter = LETTER_SIZES.indexOf(s);
  if (letter >= 0) return letter;
  return 100 + Number.parseInt(s, 10) + (s.includes("–") ? 1000 : 0);
};

/** Порядок значень у списку фільтра */
function sortValues(id: FacetId, values: string[], category?: CategorySlug): string[] {
  if (id === "type") {
    const order = (typeRules[category!] ?? []).map(([label]) => label);
    const rank = (v: string) => (v === OTHER_TYPE ? 999 : order.indexOf(v));
    return values.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "uk"));
  }
  if (id === "color") {
    const order = colorRules.map(([label]) => label);
    return values.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  if (id === "size") return values.sort((a, b) => sizeRank(a) - sizeRank(b));
  return values.sort((a, b) => Number.parseFloat(a.replace(",", ".")) - Number.parseFloat(b.replace(",", ".")));
}

/** Фільтри, які має сенс показати для цього списку товарів, з їхніми значеннями */
export function availableFacets(items: Product[], category?: CategorySlug, only?: FacetId[]) {
  return facetList
    .filter((f) => !only || only.includes(f.id))
    .map((f) => {
      const values = new Set<string>();
      for (const p of items) for (const v of facetValues(p)[f.id]) values.add(v);
      return { ...f, values: sortValues(f.id, [...values], category) };
    })
    .filter((f) => f.values.length >= 2);
}

export type FacetSelection = Partial<Record<FacetId, string[]>>;

/** Чи підходить товар під обрані значення (у межах фільтра — «або», між фільтрами — «і») */
export function matchesFacets(p: Product, selection: FacetSelection, skip?: FacetId) {
  const values = facetValues(p);
  for (const [id, chosen] of Object.entries(selection) as [FacetId, string[]][]) {
    if (id === skip || !chosen?.length) continue;
    if (!values[id].some((v) => chosen.includes(v))) return false;
  }
  return true;
}

/** Готовий до відправки сьогодні: є на складі й не «під замовлення» */
export const shipsToday = (p: Product) => p.inStock && !p.onRequest;
