/*
 * Пошук населених пунктів: нормалізація введеного, збіг за початком назви
 * і виправлення одруківок (відстань Левенштейна). Чисті функції без мережі —
 * використовуються на сервері, покриті модульними тестами.
 */

export type City = {
  /** Ref Нової пошти */
  ref: string;
  /** Назва без уточнень: «Полтава» */
  name: string;
  /** Тип: «місто», «село», «селище міського типу», … */
  type: string;
  /** Область без слова «обл.»: «Полтавська» */
  area: string;
  /** Уточнення з довідника для однакових назв: «Полтавський р-н, Полтавська обл» */
  note?: string;
};

const typeShort: Record<string, string> = {
  "місто": "м.",
  "село": "с.",
  "селище міського типу": "смт",
  "селище": "с-ще",
};

/** Підпис для покупця і для замовлення: «м. Полтава, Полтавська обл.» */
export function cityLabel(c: City) {
  const prefix = typeShort[c.type] ?? "";
  const where = c.note ? c.note.replace(/ обл$/, " обл.") : c.area && c.area !== c.name ? `${c.area} обл.` : "";
  return [prefix && `${prefix} ${c.name}`, !prefix && c.name, where].filter(Boolean).join(", ");
}

/** Латинські літери, схожі на кириличні, — часта помилка при наборі */
const lookalikes: Record<string, string> = {
  a: "а", b: "в", c: "с", e: "е", h: "н", i: "і", k: "к", m: "м", o: "о", p: "р", t: "т", x: "х", y: "у",
};

/** Нормалізація для порівняння: регістр, апострофи, схожі латинські літери, префікси «м.», «с.» */
export function normalizeCity(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[’'ʼ`´]/g, "'")
    .replace(/[a-z]/g, (ch) => lookalikes[ch] ?? ch)
    .replace(/ё/g, "е")
    .replace(/^(м\.|с\.|смт\.?|с-ще|селище|село|місто)\s*/u, "")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Відстань Левенштейна з раннім виходом, коли вона вже більша за max */
export function editDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Міста вище за села; коротші назви (точніший збіг) — вище */
const typeRank = (c: City) => (c.type === "місто" ? 0 : c.type === "селище міського типу" ? 1 : 2);

export type CityIndex = { cities: City[]; norm: string[] };

export const buildIndex = (cities: City[]): CityIndex => ({ cities, norm: cities.map((c) => normalizeCity(c.name)) });

/**
 * Підказки за введеним текстом. fuzzy=true — точних збігів немає,
 * це варіанти виправлення одруківки («Можливо, ви мали на увазі…»)
 */
export function searchCities(index: CityIndex, query: string, limit = 8): { cities: City[]; fuzzy: boolean } {
  const q = normalizeCity(query);
  if (q.length < 2) return { cities: [], fuzzy: false };

  const prefix: City[] = [];
  index.norm.forEach((n, i) => {
    if (n.startsWith(q)) prefix.push(index.cities[i]);
  });
  if (prefix.length) {
    prefix.sort((a, b) => {
      const exactA = normalizeCity(a.name) === q ? 0 : 1;
      const exactB = normalizeCity(b.name) === q ? 0 : 1;
      return exactA - exactB || typeRank(a) - typeRank(b) || a.name.length - b.name.length || a.name.localeCompare(b.name, "uk");
    });
    return { cities: prefix.slice(0, limit), fuzzy: false };
  }

  // Одруківки: до 1 помилки в коротких назвах, до 2 — у довших
  const max = q.length <= 4 ? 1 : 2;
  const scored: { c: City; d: number }[] = [];
  index.norm.forEach((n, i) => {
    const d = editDistance(q, n, max);
    if (d <= max) scored.push({ c: index.cities[i], d });
  });
  scored.sort((a, b) => a.d - b.d || typeRank(a.c) - typeRank(b.c) || a.c.name.localeCompare(b.c.name, "uk"));
  return { cities: scored.slice(0, limit).map((s) => s.c), fuzzy: scored.length > 0 };
}
