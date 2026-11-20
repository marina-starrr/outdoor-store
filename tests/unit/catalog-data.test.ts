import { describe, expect, it } from "vitest";
import {
  HIT_SOLD,
  selectHits,
  brandsOf,
  categories,
  categoryBySlug,
  discountPercent,
  formatPrice,
  plural,
  priceBounds,
  seedProducts,
  productsWord,
  withDerived,
  roundBounds,
} from "../../app/components/catalog-data";
import { navLinks } from "../../app/components/data";

const products = seedProducts.map(withDerived);
const brands = brandsOf(products);

/* Цілісність даних каталогу — щоб помилка в даних не потрапила на сайт */
describe("дані каталогу", () => {
  it("id товарів унікальні", () => {
    const ids = products.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("кожен товар належить до існуючої категорії і кожна категорія не порожня", () => {
    for (const p of products) expect(categoryBySlug[p.category], p.id).toBeDefined();
    for (const c of categories) expect(products.some((p) => p.category === c.slug), c.slug).toBe(true);
  });

  it("ціни додатні цілі, стара ціна більша за нову", () => {
    for (const p of products) {
      expect(Number.isInteger(p.price) && p.price > 0, p.id).toBe(true);
      if (p.oldPrice) expect(p.oldPrice, p.id).toBeGreaterThan(p.price);
    }
  });

  it("рейтинг і відгуки не задаються вручну — лише справжні, з бази", () => {
    for (const p of products) {
      expect(p.rating, p.id).toBe(0);
      expect(p.reviews, p.id).toBe(0);
    }
  });

  it("хіти: позначка «Хіт» або від HIT_SOLD продажів; порядок — за продажами", () => {
    const list = products.map((p, i) => ({ ...p, hit: i === 0, sold: i === 1 ? HIT_SOLD : i === 2 ? HIT_SOLD - 1 : 0 }));
    const hits = selectHits(list);
    expect(hits.map((p) => p.id)).toEqual([list[1].id, list[0].id]);
  });

  it("у наметів вказана місткість", () => {
    for (const p of products.filter((x) => x.category === "tents"))
      expect(p.capacity, p.id).toBeGreaterThan(0);
  });

  it("бренди — відсортований список без повторів", () => {
    expect(brands).toEqual([...new Set(brands)].sort());
  });

  it("пункти меню ведуть на реальні сторінки", () => {
    expect(navLinks.map((l) => l.href)).toEqual(["/catalog", "/hits", "/delivery", "/about", "/contacts"]);
  });
});

describe("форматування", () => {
  it("formatPrice розділяє тисячі пробілом", () => {
    expect(formatPrice(390)).toBe("390 ₴");
    expect(formatPrice(4890)).toBe("4 890 ₴");
    expect(formatPrice(1234567)).toBe("1 234 567 ₴");
  });

  it("plural — правильні українські форми", () => {
    const forms: [string, string, string] = ["товар", "товари", "товарів"];
    expect(plural(1, forms)).toBe("товар");
    expect(plural(2, forms)).toBe("товари");
    expect(plural(5, forms)).toBe("товарів");
    expect(plural(11, forms)).toBe("товарів");
    expect(plural(21, forms)).toBe("товар");
    expect(plural(24, forms)).toBe("товари");
    expect(productsWord(112)).toBe("товарів");
  });

  it("discountPercent округлює знижку", () => {
    const p = { ...products[0], price: 85, oldPrice: 100 };
    expect(discountPercent(p)).toBe(15);
    expect(discountPercent({ ...p, oldPrice: undefined })).toBe(0);
  });

  it("priceBounds і roundBounds", () => {
    const [min, max] = priceBounds(products);
    expect(min).toBe(Math.min(...products.map((p) => p.price)));
    expect(max).toBe(Math.max(...products.map((p) => p.price)));
    expect(roundBounds([1290, 15490])).toEqual([1200, 16000]);
  });
});
