import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex, cityLabel, editDistance, normalizeCity, searchCities, type City } from "../../app/lib/city-search";

const cities: City[] = JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "np-cities.json"), "utf8"));
const index = buildIndex(cities);
const names = (q: string) => searchCities(index, q).cities.map((c) => c.name);

describe("нормалізація назви", () => {
  it("регістр, пробіли, префікси типу", () => {
    expect(normalizeCity("  м. ПОЛТАВА ")).toBe("полтава");
    expect(normalizeCity("с.Абазівка")).toBe("абазівка");
    expect(normalizeCity("смт Славське")).toBe("славське");
  });

  it("різні апострофи й дефіси вважаються однаковими", () => {
    expect(normalizeCity("Кам’янець - Подільський")).toBe(normalizeCity("Кам'янець-Подільський"));
    expect(normalizeCity("Камʼянець-Подільський")).toBe("кам'янець-подільський");
  });

  it("латинські літери, схожі на кириличні, замінюються", () => {
    // «i» і «o» латинські — типова помилка розкладки
    expect(normalizeCity("Kиїв")).toBe("київ"); // латинська K
    expect(normalizeCity("Вiнниця")).toBe("вінниця");
    expect(normalizeCity("Пoлтава")).toBe("полтава");
  });
});

describe("відстань Левенштейна", () => {
  it("рахує вставки, видалення, заміни", () => {
    expect(editDistance("полтава", "полтава", 2)).toBe(0);
    expect(editDistance("палтава", "полтава", 2)).toBe(1);
    expect(editDistance("полтва", "полтава", 2)).toBe(1);
    expect(editDistance("харків", "херсон", 2)).toBeGreaterThan(2);
  });
});

describe("пошук міст", () => {
  it("за початком назви, місто вище за села", () => {
    expect(names("полт")).toEqual(["Полтава", "Полтавка", "Полтавка"]);
    expect(searchCities(index, "полт").fuzzy).toBe(false);
  });

  it("точний збіг — першим", () => {
    expect(names("Олександрія")[0]).toBe("Олександрія");
    expect(searchCities(index, "Олександрія").cities[0].type).toBe("місто");
  });

  it("одруківки — варіанти «можливо, ви мали на увазі»", () => {
    const r = searchCities(index, "Палтава");
    expect(r.fuzzy).toBe(true);
    expect(r.cities[0].name).toBe("Полтава");
    expect(names("Харкив")).toEqual(["Харків"]);
    expect(names("Ужгрод")).toEqual(["Ужгород"]);
  });

  it("неіснуюча назва — порожньо", () => {
    expect(searchCities(index, "Абракадабрськ")).toEqual({ cities: [], fuzzy: false });
  });

  it("менше 2 літер — без підказок", () => {
    expect(names("п")).toEqual([]);
  });
});

describe("підпис населеного пункту", () => {
  it("тип, назва, область або уточнення з довідника", () => {
    const byRef = (ref: string) => cities.find((c) => c.ref === ref)!;
    expect(cityLabel(byRef("ref-poltava"))).toBe("м. Полтава, Полтавська обл.");
    expect(cityLabel(byRef("ref-poltavka-1"))).toBe("с. Полтавка, Первомайський р-н, Миколаївська обл.");
    expect(cityLabel(byRef("ref-slavske"))).toBe("смт Славське, Львівська обл.");
  });
});
