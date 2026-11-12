import { describe, expect, it } from "vitest";
import {
  FREE_SHIPPING_FROM,
  cartRecommendations,
  cartTotals,
  deliveryOptions,
  deliveryPrice,
  isDeliveryId,
  paymentOptions,
  promoCodes,
  resolveLines,
} from "../../app/components/cart-logic";
import { seedProducts, withDerived } from "../../app/components/catalog-data";

const products = seedProducts.map(withDerived);
const catalog = new Map(products.map((p) => [p.id, p]));

const byId = (id: string) => products.find((p) => p.id === id)!;
const cheap = products.filter((p) => p.inStock).sort((a, b) => a.price - b.price)[0];
const expensive = products.filter((p) => p.inStock && p.price >= FREE_SHIPPING_FROM)[0];

describe("resolveLines", () => {
  it("додає дані товару і відкидає невідомі id", () => {
    const lines = resolveLines([{ id: cheap.id, qty: 2 }, { id: "deleted-product", qty: 1 }], catalog);
    expect(lines).toHaveLength(1);
    expect(lines[0].product.name).toBe(cheap.name);
    expect(lines[0].qty).toBe(2);
  });
});

describe("доставка", () => {
  it("у кошику немає самовивозу — магазин працює лише онлайн", () => {
    expect(deliveryOptions.map((o) => o.id)).toEqual(["np-branch", "np-courier", "ukrposhta"]);
    expect(isDeliveryId("pickup")).toBe(false);
    expect(isDeliveryId("np-branch")).toBe(true);
  });

  it("ціни доставки збігаються з опублікованими на сторінці «Доставка і оплата»", () => {
    expect(deliveryPrice("np-branch", 100)).toBe(70);
    expect(deliveryPrice("np-courier", 100)).toBe(120);
    expect(deliveryPrice("ukrposhta", 100)).toBe(45);
  });

  it("безкоштовна доставка від 3000 ₴ — для відділень, але не для кур'єра", () => {
    expect(deliveryPrice("np-branch", FREE_SHIPPING_FROM - 1)).toBe(70);
    expect(deliveryPrice("np-branch", FREE_SHIPPING_FROM)).toBe(0);
    expect(deliveryPrice("ukrposhta", FREE_SHIPPING_FROM)).toBe(0);
    expect(deliveryPrice("np-courier", 50_000)).toBe(120);
  });
});

describe("cartTotals", () => {
  it("порожній кошик — усе нулі, доставка безкоштовна", () => {
    const t = cartTotals([]);
    expect(t).toMatchObject({ count: 0, subtotal: 0, shipping: 0, total: 0 });
  });

  it("рахує суму, кількість і доставку", () => {
    const t = cartTotals(resolveLines([{ id: cheap.id, qty: 2 }], catalog), "np-branch");
    expect(t.count).toBe(2);
    expect(t.subtotal).toBe(cheap.price * 2);
    expect(t.shipping).toBe(cheap.price * 2 >= FREE_SHIPPING_FROM ? 0 : 70);
    expect(t.total).toBe(t.subtotal + t.shipping);
    expect(t.leftForFreeShipping).toBe(Math.max(0, FREE_SHIPPING_FROM - t.subtotal));
  });

  it("враховує економію за акційними цінами", () => {
    const sale = products.find((p) => p.oldPrice)!;
    const t = cartTotals(resolveLines([{ id: sale.id, qty: 3 }], catalog));
    expect(t.savings).toBe((sale.oldPrice! - sale.price) * 3);
  });

  it("застосовує промокод і ігнорує неіснуючий", () => {
    const lines = resolveLines([{ id: expensive.id, qty: 1 }], catalog);
    const withPromo = cartTotals(lines, "np-branch", "FAMILY10");
    expect(withPromo.promoDiscount).toBe(Math.round(expensive.price * 0.1));
    expect(withPromo.total).toBe(expensive.price - withPromo.promoDiscount);
    expect(cartTotals(lines, "np-branch", "FAKE").promoDiscount).toBe(0);
  });

  it("усі промокоди мають адекватний відсоток", () => {
    for (const p of Object.values(promoCodes)) {
      expect(p.percent).toBeGreaterThan(0);
      expect(p.percent).toBeLessThan(50);
    }
  });
});

describe("оплата", () => {
  it("оплата частинами доступна від 3000 ₴", () => {
    expect(paymentOptions.find((p) => p.id === "parts")?.minTotal).toBe(3000);
  });
});

describe("cartRecommendations", () => {
  it("не пропонує товари, які вже в кошику, і товари без наявності", () => {
    const tent = byId(cheap.id);
    const recs = cartRecommendations(products, resolveLines([{ id: tent.id, qty: 1 }], catalog));
    expect(recs).toHaveLength(4);
    expect(recs.some((p) => p.id === tent.id)).toBe(false);
    expect(recs.every((p) => p.inStock)).toBe(true);
  });

  it("спершу пропонує товари з інших категорій", () => {
    const tent = products.find((p) => p.category === "tents")!;
    const recs = cartRecommendations(products, resolveLines([{ id: tent.id, qty: 1 }], catalog));
    expect(recs[0].category).not.toBe("tents");
  });
});
