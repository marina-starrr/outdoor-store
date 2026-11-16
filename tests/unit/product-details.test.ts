import { describe, expect, it } from "vitest";
import { seedProducts, withDerived } from "../../app/components/catalog-data";

const products = seedProducts.map(withDerived);
import {
  findProduct,
  productDescription,
  productGallery,
  productHighlights,
  productUrl,
  relatedProducts,
} from "../../app/components/product-details";

const tent = products.find((p) => p.category === "tents")!;

describe("сторінка товару", () => {
  it("productUrl / findProduct — взаємно обернені для кожного товару", () => {
    for (const p of products) {
      const [, , category, id] = productUrl(p).split("/");
      expect(findProduct(products, category, id)).toBe(p);
    }
    expect(findProduct(products, "tents", "nope")).toBeUndefined();
    expect(findProduct(products, "backpacks", tent.id)).toBeUndefined();
  });

  it("у кожного товару є опис і галерея з 1–4 фото", () => {
    for (const p of products) {
      expect(productDescription(p).length, p.id).toBeGreaterThan(0);
      const g = productGallery(p);
      expect(g.length, p.id).toBeGreaterThanOrEqual(1);
      expect(g.length, p.id).toBeLessThanOrEqual(4);
    }
  });

  it("ключові характеристики — до 4, без бренду і гарантії", () => {
    const h = productHighlights(tent);
    expect(h.length).toBeLessThanOrEqual(4);
    expect(h.some(([k]) => k === "Бренд" || k === "Гарантія")).toBe(false);
  });

  it("у початковому каталозі немає вигаданих рейтингів і відгуків", () => {
    for (const p of products) {
      expect(p.rating, p.id).toBe(0);
      expect(p.reviews, p.id).toBe(0);
    }
  });

  it("схожі товари — з тієї ж категорії, без самого товару", () => {
    const rel = relatedProducts(products, tent);
    expect(rel.length).toBeGreaterThan(0);
    expect(rel.every((p) => p.category === tent.category && p.id !== tent.id)).toBe(true);
  });
});
