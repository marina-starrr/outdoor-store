import { describe, expect, it } from "vitest";
import type { CategorySlug, Product } from "../../app/components/catalog-data";
import {
  availableFacets,
  facetValues,
  matchesFacets,
  OTHER_TYPE,
  placesOf,
  shipsToday,
} from "../../app/components/catalog-facets";

const make = (category: CategorySlug, name: string, extra: Partial<Product> = {}): Product => ({
  id: name,
  name,
  category,
  brand: "Ranger",
  price: 100,
  rating: 0,
  reviews: 0,
  inStock: true,
  stock: 3,
  popularity: 1,
  specs: "",
  image: "",
  photo: "meadow",
  attrs: [],
  ...extra,
});

describe("тип товару з назви", () => {
  it.each([
    ["fishing", "Котушка GLADIATOR AGIX 1000 5+1 (GL7160)", "Котушки"],
    ["fishing", "Cпінінг GLADIATOR Black Warrior 2.10 (10-30g) (GL8150)", "Спінінги"],
    ["fishing", "Род-под GLADIATOR RP153 (GL8168)", "Підставки й род-поди"],
    ["tactical", "Підсумок під рацію кордура Kirasa піксель (Арт KI289)", "Підсумки"],
    ["tactical", "Комплект (шапка, бафф, перчатки) Ranger, піксель 55-57 (RA8958)", "Головні убори"],
    ["tactical", "Адаптивна кофта при травмуванні, двунитка Kirasa зелена 48 (Арт KI4280-0)", "Одяг"],
    ["furniture", "Стіл складаний Ranger Compact Hike 212 (Арт. RA 1120)", "Столи"],
    ["furniture", "Стілець складаний Ranger Oril (Арт. RA 4403)", "Стільці"],
    ["furniture", "Крісло-ліжко коропове Ranger Carp SL-116 (Арт. RA 2259)", "Розкладачки й ліжка"],
    ["furniture", "Чохол для коропового ліжка Ranger (Арт. RA 8871)", "Чохли й аксесуари"],
    ["tents", "Намет короповий RANGER EXPERT 2 MAN 175+зимове покриття (Арт. RA 6645)", "Коропові намети"],
    ["tents", "Зимове покриття для RANGER EXP 2-mann Bivvy(Арт. RA 6646)", "Зимові покриття"],
    ["thermos", "Термокружка Ranger Lux 0,48 L Green (Арт. RA 9928)", "Термокухлі"],
    ["cookware", "Казан чавунний туристичний з кришкою 6 л", "Казани"],
  ] as const)("%s: %s → %s", (category, name, type) => {
    expect(facetValues(make(category, name)).type).toEqual([type]);
  });

  it("нерозпізнане — «Інше»", () => {
    expect(facetValues(make("accessories", "Відро складане Ranger 10Л")).type).toEqual([OTHER_TYPE]);
  });
});

describe("колір, розмір, об'єм", () => {
  it("колір з назви, кілька кольорів, і з опису", () => {
    expect(facetValues(make("tactical", "Шапка флісова Ranger мультикам 58-61 (RA89511)")).color).toEqual(["Мультикам"]);
    expect(facetValues(make("fishing", "Підставка телескопічна GLADIATOR ZJ01-120 червоно-жовта")).color).toEqual(["Червоний", "Жовтий"]);
    expect(facetValues(make("tents", "Намет Ranger Scout 4", { description: "Колір: олива; Вага: 4 кг" })).color).toEqual(["Олива"]);
  });

  it("розмір: літерний, числовий, обхват голови, взуття — без артикулів", () => {
    expect(facetValues(make("clothing", "Термобілизна Ranger Active (XXХL) (Арт. RA 8843XХXL)")).size).toEqual(["XXXL"]);
    expect(facetValues(make("tactical", "Адаптивні шорти-труси Kirasa беж М(48) (Арт KI4239M)")).size.sort()).toEqual(["48", "M"]);
    expect(facetValues(make("tactical", "Кофта флісова Kirasa 320г/м хакі (46) (Арт KI413-0)")).size).toEqual(["46"]);
    expect(facetValues(make("tactical", "Шапка флісова Ranger піксель 55-57 (RA8952)")).size).toEqual(["55–57"]);
    expect(facetValues(make("clothing", "Шкарпетки термо FR (бамбук) р.39-41 (59-39-41)")).size).toEqual(["39–41"]);
    expect(facetValues(make("tactical", "Підсумок під гранату кордура Kirasa чорна (Арт KI253)")).size).toEqual([]);
    // Поза одягом розмір не шукаємо (L — це літри)
    expect(facetValues(make("thermos", "Термокружка Ranger Lux 0,48 L Green")).size).toEqual([]);
  });

  it("об'єм", () => {
    expect(facetValues(make("thermos", "Термос Ranger Expert 1.6 L (Арт. RA 9922)")).volume).toEqual(["1,6 л"]);
    expect(facetValues(make("picnic", "Термосумка Ranger 30L Brown (Арт. RA 9955)")).volume).toEqual(["30 л"]);
    expect(facetValues(make("furniture", "Крісло складане Ranger Tourist")).volume).toEqual([]);
  });

  it("місткість намету з назви", () => {
    expect(placesOf(make("tents", "Намет Ranger Ascent 4 (Арт. RA 6620)"))).toBe(4);
    expect(placesOf(make("tents", "Намет короповий RANGER EXP 3-mann Bivvy (Арт. RA 6608)"))).toBe(3);
    expect(placesOf(make("tents", "Зимове покриття для RANGER EXP 2-mann Bivvy"))).toBeUndefined();
    expect(placesOf(make("tents", "Намет", { capacity: 6 }))).toBe(6);
  });
});

describe("набір фільтрів і відбір", () => {
  const items = [
    make("tactical", "Шапка флісова Ranger мультикам 55-57"),
    make("tactical", "Шапка флісова Ranger піксель 58-61"),
    make("tactical", "Підсумок під рацію кордура Kirasa піксель"),
  ];

  it("показує лише фільтри з двома й більше значеннями, у правильному порядку", () => {
    const facets = availableFacets(items, "tactical");
    expect(facets.map((f) => f.id)).toEqual(["type", "color", "size"]);
    expect(facets[0].values).toEqual(["Підсумки", "Головні убори"]);
    expect(facets[1].values).toEqual(["Мультикам", "Піксель"]);
  });

  it("всередині фільтра — «або», між фільтрами — «і»", () => {
    expect(items.filter((p) => matchesFacets(p, { color: ["Піксель", "Мультикам"] }))).toHaveLength(3);
    expect(items.filter((p) => matchesFacets(p, { color: ["Піксель"], type: ["Головні убори"] }))).toHaveLength(1);
    expect(items.filter((p) => matchesFacets(p, { color: ["Піксель"], type: ["Головні убори"] }, "type"))).toHaveLength(2);
  });

  it("«Відправимо сьогодні» — без «під замовлення» і без відсутніх", () => {
    expect(shipsToday(make("tactical", "a"))).toBe(true);
    expect(shipsToday(make("tactical", "b", { onRequest: true }))).toBe(false);
    expect(shipsToday(make("tactical", "c", { inStock: false, stock: 0 }))).toBe(false);
  });
});
