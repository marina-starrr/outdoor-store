import "server-only";
import { readFile } from "node:fs/promises";
import { buildIndex, cityLabel, normalizeCity, searchCities, type City, type CityIndex } from "../city-search";
import type { DeliveryId } from "../../components/cart-logic";
import { sql, tx } from "./db";

/*
 * Довідник населених пунктів Нової пошти (api.novaposhta.ua).
 *
 * - Повний список міст, куди доставляє Нова пошта (~11 тис.), зберігається
 *   в базі (таблиця np_cities) і оновлюється раз на тиждень: Vercel Cron
 *   викликає /api/cron/np-cities. Кожен екземпляр сайту читає довідник з бази
 *   один раз (це швидко — Нову пошту на кожен запуск не питаємо), а пошук і
 *   виправлення одруківок працюють у пам'яті, без запиту на кожну літеру.
 * - Якщо база ще порожня (перший запуск) — довідник завантажується з Нової
 *   пошти одразу і зберігається.
 * - Для Укрпошти, яка возить і туди, де Нової пошти немає, — додатковий
 *   живий пошук по всіх населених пунктах України (searchSettlements).
 * - API працює і без ключа; якщо Нова пошта вимагатиме ключ — задайте
 *   NOVA_POSHTA_API_KEY у .env.local.
 * - Тести: NP_CITIES_FIXTURE=<шлях до JSON-масиву City> — без мережі.
 */

const API = "https://api.novaposhta.ua/v2.0/json/";
/** Cron оновлює щотижня; якщо довідник старший — оновлюємо самі, у фоні */
const MAX_AGE = 10 * 86_400_000;
/** Як часто екземпляр перевіряє, чи не з'явився в базі новіший довідник */
const RECHECK = 60 * 60_000;

type NpCity = {
  Ref: string;
  Description: string;
  SettlementTypeDescription: string;
  AreaDescription: string;
};

async function npCall<T>(calledMethod: string, methodProperties: object, modelName = "Address", timeoutMs = 30_000): Promise<T[]> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: process.env.NOVA_POSHTA_API_KEY ?? "", modelName, calledMethod, methodProperties }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json()) as { success: boolean; data: T[]; errors: string[] };
  if (!json.success) throw new Error(`Nova Poshta ${calledMethod}: ${json.errors.join("; ")}`);
  return json.data;
}

/** «Абазівка (Полтавський р-н, Полтавська обл)» → назва + уточнення */
export function fromNp(c: NpCity): City {
  const m = c.Description.match(/^(.*?)\s*\((.+)\)\s*$/);
  return {
    ref: c.Ref,
    name: (m ? m[1] : c.Description).trim(),
    type: c.SettlementTypeDescription,
    area: c.AreaDescription,
    ...(m ? { note: m[2] } : {}),
  };
}

let index: CityIndex | null = null;
let byRef = new Map<string, City>();
/** Коли завантажено довідник, що зараз у пам'яті (fetched_at з бази) */
let loadedAt = 0;
/** Коли екземпляр востаннє звіряв свій довідник з базою */
let checkedAt = 0;
let syncing: Promise<void> | null = null;
let refreshing: Promise<unknown> | null = null;

function setCities(cities: City[], at: number) {
  index = buildIndex(cities);
  byRef = new Map(cities.map((c) => [c.ref, c]));
  loadedAt = at;
}

/** Зберігає довідник у базі: старий замінюється новим в одній транзакції */
async function saveCities(cities: City[], at: number) {
  await tx(async (q) => {
    await q.query("delete from np_cities");
    // Частинами — щоб не впертися в розмір одного запиту
    for (let i = 0; i < cities.length; i += 2000) {
      const part = cities.slice(i, i + 2000);
      await q.query(
        `insert into np_cities (ref, name, type, area, note)
         select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
         on conflict (ref) do nothing`,
        [part.map((c) => c.ref), part.map((c) => c.name), part.map((c) => c.type), part.map((c) => c.area), part.map((c) => c.note ?? null)],
      );
    }
    await q.query(
      `insert into np_cities_meta (id, fetched_at, count) values (1, $1, $2)
       on conflict (id) do update set fetched_at = excluded.fetched_at, count = excluded.count`,
      [new Date(at), cities.length],
    );
  });
}

/**
 * Завантажує свіжий довідник з Нової пошти і зберігає в базі.
 * Викликається з Vercel Cron (/api/cron/np-cities) і при першому запуску
 */
export async function refreshCities(): Promise<number> {
  const cities = (await npCall<NpCity>("getCities", {}, "Address", 60_000)).map(fromNp);
  if (cities.length < 1000) throw new Error(`Nova Poshta getCities: підозріло мало міст (${cities.length})`);
  const at = Date.now();
  await saveCities(cities, at);
  setCities(cities, at);
  checkedAt = Date.now();
  return cities.length;
}

/** Читає довідник з бази, якщо там новіший, ніж у пам'яті */
async function syncFromDb() {
  const [meta] = await sql("select fetched_at from np_cities_meta where id = 1");
  checkedAt = Date.now();
  if (!meta) return;
  const at = new Date(meta.fetched_at).getTime();
  if (index && at <= loadedAt) return;
  const rows = await sql("select ref, name, type, area, note from np_cities");
  if (!rows.length) return;
  setCities(
    rows.map((r) => ({ ref: r.ref, name: r.name, type: r.type, area: r.area, ...(r.note ? { note: r.note } : {}) })),
    at,
  );
}

function refreshInBackground() {
  refreshing ??= refreshCities()
    .catch((e) => console.error("[novaposhta] не вдалося оновити довідник міст", e))
    .finally(() => (refreshing = null));
  return refreshing;
}

/**
 * Довідник міст або null, якщо його ще не вдалося отримати (немає мережі).
 * Застарілий довідник використовується, поки у фоні завантажується новий
 */
export async function cityIndex(): Promise<CityIndex | null> {
  const fixture = process.env.NP_CITIES_FIXTURE;
  if (fixture) {
    if (!index) setCities(JSON.parse(await readFile(fixture, "utf8")), Date.now());
    return index;
  }
  if (!index || Date.now() - checkedAt > RECHECK) {
    syncing ??= syncFromDb()
      .catch((e) => console.error("[novaposhta] не вдалося прочитати довідник міст з бази", e))
      .finally(() => (syncing = null));
    // Без жодного довідника — чекаємо; інакше звіряємось у фоні
    if (!index) await syncing;
  }
  if (!index) await refreshInBackground();
  else if (Date.now() - loadedAt > MAX_AGE) void refreshInBackground();
  return index;
}

export const cityByRef = async (ref: string) => ((await cityIndex()) ? byRef.get(ref) ?? null : null);

/* ---------- Живий пошук по всіх населених пунктах (для Укрпошти) ---------- */

type NpSettlement = {
  Present: string;
  MainDescription: string;
  Area: string;
  SettlementTypeCode: string;
  Ref: string;
  Region: string;
};

const settlementTypes: Record<string, string> = { "м.": "місто", "с.": "село", "смт": "селище міського типу", "с-ще": "селище" };

const liveCache = new Map<string, { at: number; cities: City[] }>();

/** Ref живого пошуку позначаємо префіксом, щоб не плутати з довідником Нової пошти */
export const SETTLEMENT_PREFIX = "s:";

export async function searchSettlementsLive(query: string, limit = 8): Promise<City[]> {
  if (process.env.NP_CITIES_FIXTURE) return [];
  const q = normalizeCity(query);
  if (q.length < 2) return [];
  const hit = liveCache.get(q);
  if (hit && Date.now() - hit.at < 86_400_000) return hit.cities;
  try {
    const [first] = await npCall<{ Addresses: NpSettlement[] }>("searchSettlements", { CityName: q, Limit: String(limit), Page: "1" }, "Address", 5000);
    const cities = (first?.Addresses ?? []).map((a) => ({
      ref: SETTLEMENT_PREFIX + a.Ref,
      name: a.MainDescription,
      type: settlementTypes[a.SettlementTypeCode] ?? a.SettlementTypeCode,
      area: a.Area,
      ...(a.Region ? { note: `${a.Region} р-н, ${a.Area} обл` } : {}),
    }));
    if (liveCache.size > 2000) liveCache.clear();
    liveCache.set(q, { at: Date.now(), cities });
    return cities;
  } catch (e) {
    console.error("[novaposhta] searchSettlements", e);
    return [];
  }
}

/* ---------- Підказки та перевірка при оформленні ---------- */

export type CitySuggestion = { ref: string; label: string };

/** Підказки для поля «Місто»; available=false — довідник недоступний, приймаємо вільний текст */
export async function suggestCities(query: string, method: DeliveryId | undefined, limit = 8) {
  const idx = await cityIndex();
  if (!idx) return { available: false, fuzzy: false, cities: [] as CitySuggestion[] };
  let { cities, fuzzy } = searchCities(idx, query, limit);
  // Укрпошта возить і туди, де Нової пошти немає
  if (method === "ukrposhta" && (fuzzy || cities.length < limit)) {
    const live = await searchSettlementsLive(query, limit);
    if (live.length) {
      const base = fuzzy ? [] : cities;
      const seen = new Set(base.map(cityLabel));
      cities = [...base, ...live.filter((c) => !seen.has(cityLabel(c)))].slice(0, limit);
      fuzzy = false;
    }
  }
  return { available: true, fuzzy, cities: cities.map((c) => ({ ref: c.ref, label: cityLabel(c) })) };
}

const isNovaPoshta = (m: DeliveryId) => m === "np-branch" || m === "np-courier";

export type CityCheck =
  | { ok: true; ref?: string; label: string }
  | { ok: false; error: string };

/**
 * Перевірка міста із замовлення: існує, і обраним способом туди можна доставити.
 * Якщо довідник недоступний (немає зв'язку з Новою поштою) — продаж не блокуємо
 */
export async function checkCity(method: DeliveryId, ref: string, text: string): Promise<CityCheck> {
  const idx = await cityIndex();
  if (!idx) return text.length >= 2 ? { ok: true, label: text } : { ok: false, error: "Вкажіть місто" };

  if (ref && !ref.startsWith(SETTLEMENT_PREFIX)) {
    const c = byRef.get(ref);
    if (c) return { ok: true, ref, label: cityLabel(c) };
  }
  if (ref.startsWith(SETTLEMENT_PREFIX)) {
    if (isNovaPoshta(method))
      return { ok: false, error: "Нова пошта не доставляє в цей населений пункт — оберіть Укрпошту або інше місто" };
    const name = text.split(",")[0];
    const live = await searchSettlementsLive(name, 20);
    const c = live.find((x) => x.ref === ref);
    if (c) return { ok: true, ref, label: cityLabel(c) };
    // Пошук Нової пошти тимчасово не відповів — не блокуємо продаж
    if (!live.length && text.length >= 2) return { ok: true, label: text };
  }

  // Місто введене текстом, без вибору з підказок
  const q = normalizeCity(text.split(",")[0] ?? "");
  if (q.length < 2) return { ok: false, error: "Вкажіть місто" };
  const exact = idx.cities.filter((_, i) => idx.norm[i] === q);
  if (exact.length === 1) return { ok: true, ref: exact[0].ref, label: cityLabel(exact[0]) };
  if (exact.length > 1)
    return { ok: false, error: `Є кілька населених пунктів «${exact[0].name}» — оберіть потрібний зі списку` };
  if (method === "ukrposhta") {
    const live = (await searchSettlementsLive(q, 20)).filter((c) => normalizeCity(c.name) === q);
    if (live.length === 1) return { ok: true, ref: live[0].ref, label: cityLabel(live[0]) };
    if (live.length > 1) return { ok: false, error: `Є кілька населених пунктів «${live[0].name}» — оберіть потрібний зі списку` };
  }
  const { cities, fuzzy } = searchCities(idx, q, 1);
  if (fuzzy && cities[0]) return { ok: false, error: `Не знайшли «${text.trim()}». Можливо, ви мали на увазі «${cities[0].name}»?` };
  return { ok: false, error: "Не знайшли такого населеного пункту — перевірте написання і оберіть зі списку" };
}

/* ---------- Відділення й поштомати міста ---------- */

export type Warehouse = {
  ref: string;
  /** Номер відділення / поштомату */
  number: string;
  kind: "branch" | "postomat" | "point";
  /** «Відділення №3 (до 30 кг на одне місце): вул. Просвіти, 13» */
  label: string;
};

type NpWarehouse = {
  Ref: string;
  Number: string;
  Description: string;
  CategoryOfWarehouse: string;
  WarehouseStatus: string;
  DenyToSelect: string;
};

const warehouseKinds: Record<string, Warehouse["kind"]> = { Branch: "branch", Postomat: "postomat", OtherOperating: "point" };
const WAREHOUSES_TTL = 12 * 3_600_000;
const warehousesCache = new Map<string, { at: number; list: Promise<Warehouse[] | null> }>();

async function loadWarehouses(cityRef: string): Promise<Warehouse[] | null> {
  try {
    const all: NpWarehouse[] = [];
    // Великі міста — тисячі відділень і поштоматів (Київ — понад 8 тис.), тому сторінками
    for (let page = 1; page <= 40; page++) {
      const part = await npCall<NpWarehouse>("getWarehouses", { CityRef: cityRef, Limit: "500", Page: String(page), Language: "UA" }, "Address", 15_000);
      all.push(...part);
      if (part.length < 500) break;
    }
    return all
      .filter((w) => w.WarehouseStatus === "Working" && w.DenyToSelect !== "1" && warehouseKinds[w.CategoryOfWarehouse])
      .map((w) => ({ ref: w.Ref, number: w.Number, kind: warehouseKinds[w.CategoryOfWarehouse], label: w.Description }))
      .sort((a, b) => Number(a.number) - Number(b.number) || a.label.localeCompare(b.label, "uk"));
  } catch (e) {
    console.error("[novaposhta] getWarehouses", e);
    return null;
  }
}

const testWarehouses = (cityRef: string): Warehouse[] => [
  ...[1, 2, 3, 5, 12].map((n) => ({ ref: `${cityRef}-wh-${n}`, number: String(n), kind: "branch" as const, label: `Відділення №${n}: вул. Тестова, ${n}` })),
  { ref: `${cityRef}-pm-9001`, number: "9001", kind: "postomat", label: "Поштомат №9001: вул. Соборності, 1 (у магазині)" },
];

/**
 * Відділення за тим, що прислав покупець: Ref зі списку або просто номер
 * («12», «№ 12») — якщо ввів вручну, не обираючи
 */
export function findWarehouse(list: Warehouse[], ref: string, text: string) {
  // Обрано зі списку, але такого в цьому місті немає (напр. з іншого міста) — не вгадуємо
  if (ref) return list.find((w) => w.ref === ref);
  const n = text.replace(/^(відділення|поштомат)?\s*№?\s*/i, "").trim();
  return /^\d+$/.test(n) ? list.find((w) => w.number === n) : undefined;
}

/** Усі робочі відділення, поштомати й пункти міста; null — Нова пошта не відповіла */
export async function cityWarehouses(cityRef: string): Promise<Warehouse[] | null> {
  // Тести (NP_CITIES_FIXTURE): однаковий набір відділень у кожному місті, без мережі
  if (process.env.NP_CITIES_FIXTURE) return testWarehouses(cityRef);
  const hit = warehousesCache.get(cityRef);
  if (hit && Date.now() - hit.at < WAREHOUSES_TTL) return hit.list;
  const list = loadWarehouses(cityRef);
  warehousesCache.set(cityRef, { at: Date.now(), list });
  // Помилку не кешуємо — наступний запит спробує знову
  list.then((l) => l === null && warehousesCache.delete(cityRef));
  if (warehousesCache.size > 500) warehousesCache.delete(warehousesCache.keys().next().value!);
  return list;
}

/** Пошук серед відділень міста: за номером («12») або за вулицею / словом («поштомат», «Соборна») */
export function filterWarehouses(list: Warehouse[], query: string, limit = 100) {
  const q = query.trim().toLowerCase().replace(/[№#]/g, "").trim();
  if (!q) return list.slice(0, limit);
  if (/^\d+$/.test(q)) {
    const exact = list.filter((w) => w.number === q);
    return [...exact, ...list.filter((w) => w.number !== q && w.number.startsWith(q))].slice(0, limit);
  }
  const words = q.split(/\s+/);
  return list.filter((w) => words.every((word) => w.label.toLowerCase().includes(word))).slice(0, limit);
}

/* ---------- Вулиці (кур'єрська доставка) ---------- */

export type Street = { ref: string; label: string };

/*
 * Пошук Нової пошти (getStreet) знаходить вулицю лише за початком назви в її
 * записі: «вул. Шевченка», «Івана Мазепи» (у довіднику — «Мазепи Івана»),
 * стара назва «Жовтнева» чи друге слово «Сотні» — не знаходяться. Тому
 * завантажуємо всі вулиці міста (Полтава — ~1 тис.) і шукаємо самі:
 * за будь-яким словом назви, без «вул.», «просп.» тощо, і за старою назвою в дужках.
 */

/** Слова-типи вулиць, які люди вводять, але в назві їх немає */
const STREET_TYPE_WORDS = new Set(
  "вул вулиця вулиці просп проспект пров провулок бульв бульвар пл площа майдан узвіз шосе наб набережна туп тупик проїзд пр алея лінія мкр мікрорайон ст спуск в'їзд".split(" "),
);

const latinLookalikes: Record<string, string> = { a: "а", b: "в", c: "с", e: "е", h: "н", i: "і", k: "к", m: "м", o: "о", p: "р", t: "т", x: "х", y: "у" };

/** Слова для порівняння: нижній регістр, однакові апострофи, латинські «двійники» → кирилиця */
export function streetWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’'ʼ`´]/g, "'")
    .replace(/[a-z]/g, (ch) => latinLookalikes[ch] ?? ch)
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean);
}

/** Вулиці, у назві яких кожне введене слово є початком якогось слова; спершу — збіг з початку назви */
export function filterStreets(list: Street[], query: string, limit = 20): Street[] {
  const words = streetWords(query).filter((w) => !STREET_TYPE_WORDS.has(w.replace(/\.$/, "")));
  if (!words.length || words.join("").length < 2) return [];
  const scored: { s: Street; rank: number }[] = [];
  for (const s of list) {
    const own = streetWords(s.label).filter((w) => !STREET_TYPE_WORDS.has(w));
    if (!words.every((w) => own.some((o) => o.startsWith(w)))) continue;
    scored.push({ s, rank: own[0]?.startsWith(words[0]) ? 0 : 1 });
  }
  scored.sort((a, b) => a.rank - b.rank || a.s.label.localeCompare(b.s.label, "uk"));
  return scored.slice(0, limit).map((x) => x.s);
}

const testStreets: Street[] = [
  { ref: "street-sobornosti", label: "вул. Соборності (Жовтнева)" },
  { ref: "street-sadova", label: "вул. Садова" },
  { ref: "street-mazepy", label: "вул. Мазепи Івана (Калініна)" },
  { ref: "street-myru", label: "просп. Миру" },
];

const STREETS_TTL = 24 * 3_600_000;
const streetsCache = new Map<string, { at: number; list: Promise<Street[] | null> }>();

async function loadStreets(cityRef: string): Promise<Street[] | null> {
  try {
    const all: Street[] = [];
    for (let page = 1; page <= 40; page++) {
      const part = await npCall<{ Ref: string; Description: string; StreetsType: string }>(
        "getStreet",
        { CityRef: cityRef, FindByString: "", Page: String(page), Limit: "500" },
        "Address",
        15_000,
      );
      all.push(...part.map((x) => ({ ref: x.Ref, label: `${x.StreetsType} ${x.Description}`.trim() })));
      if (part.length < 500) break;
    }
    return all;
  } catch (e) {
    console.error("[novaposhta] getStreet", e);
    return null;
  }
}

/** Усі вулиці міста з довідника Нової пошти; null — Нова пошта не відповіла */
export async function cityStreets(cityRef: string): Promise<Street[] | null> {
  if (process.env.NP_CITIES_FIXTURE) return testStreets;
  const hit = streetsCache.get(cityRef);
  if (hit && Date.now() - hit.at < STREETS_TTL) return hit.list;
  const list = loadStreets(cityRef);
  streetsCache.set(cityRef, { at: Date.now(), list });
  list.then((l) => l === null && streetsCache.delete(cityRef));
  if (streetsCache.size > 300) streetsCache.delete(streetsCache.keys().next().value!);
  return list;
}

/** Вулиці міста за введеним текстом; null — довідник недоступний */
export async function searchStreets(cityRef: string, query: string, limit = 20): Promise<Street[] | null> {
  const list = await cityStreets(cityRef);
  return list ? filterStreets(list, query.slice(0, 60), limit) : null;
}
