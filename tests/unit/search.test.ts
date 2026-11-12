import { describe, expect, it } from "vitest";
import { seedProducts, withDerived } from "../../app/components/catalog-data";
import { fromEnglishLayout, matchesSearch, normalize, searchProducts } from "../../app/components/search";

const products = seedProducts.map(withDerived);
const np3 = products.find((p) => p.id === "np3")!;

describe("пошук", () => {
  it("normalize: регістр, апострофи, зайві пробіли", () => {
    expect(normalize("  Об’єм   45 Л ")).toBe("об'єм 45 л");
    expect(normalize("Намет!!!")).toBe("намет");
  });

  it("знаходить за назвою, брендом, категорією й характеристиками", () => {
    expect(matchesSearch(np3, "nature peak")).toBe(true);
    expect(matchesSearch(np3, "намет 3")).toBe(true);
    expect(matchesSearch(np3, "Намети")).toBe(true); // назва категорії
    expect(matchesSearch(np3, "3,1 кг")).toBe(true); // характеристики
    expect(matchesSearch(np3, "рюкзак")).toBe(false);
  });

  it("усі слова запиту мають знайтися", () => {
    expect(matchesSearch(np3, "намет coleman")).toBe(false);
  });

  it("найрелевантніші — першими: назва, що починається із запиту", () => {
    const { items, total } = searchProducts(products, "намет", 50);
    expect(total).toBeGreaterThan(5);
    expect(items[0].name.toLowerCase().startsWith("намет")).toBe(true);
    // Обмеження кількості підказок
    expect(searchProducts(products, "намет", 6).items).toHaveLength(6);
    expect(searchProducts(products, "намет", 6).total).toBe(total);
  });

  it("розуміє запит у неправильній розкладці", () => {
    expect(fromEnglishLayout("yfvtn")).toBe("намет");
    const r = searchProducts(products, "yfvtn");
    expect(r.corrected).toBe("намет");
    expect(r.items.length).toBeGreaterThan(0);
  });

  it("короткий запит і порожній результат", () => {
    expect(searchProducts(products, "н")).toEqual({ items: [], total: 0 });
    expect(searchProducts(products, "телевізор").total).toBe(0);
  });

  it("приховані товари не знаходяться", () => {
    const hidden = products.map((p) => (p.id === "np3" ? { ...p, hidden: true } : p));
    expect(searchProducts(hidden, "Nature Peak 3", 50).items.some((p) => p.id === "np3")).toBe(false);
  });
});
