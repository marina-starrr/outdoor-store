import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cartTotals } from "../../app/components/cart-logic";
import { productSortOptions, seedProducts, visibleSortOptions, withDerived } from "../../app/components/catalog-data";
import { discountsEnabled } from "../../app/components/shop-config";

/* Режим сайту зараз: знижок немає (NEXT_PUBLIC_DISCOUNTS не задано) */

describe("знижки вимкнено", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.NEXT_PUBLIC_DISCOUNTS;
    delete process.env.NEXT_PUBLIC_DISCOUNTS;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_DISCOUNTS;
    else process.env.NEXT_PUBLIC_DISCOUNTS = saved;
  });

  it("за замовчуванням вимкнено", () => {
    expect(discountsEnabled()).toBe(false);
  });

  it("стара (перекреслена) ціна не показується, навіть якщо є в базі", () => {
    const withOld = seedProducts.find((p) => p.oldPrice)!;
    expect(withDerived(withOld).oldPrice).toBeUndefined();
    expect(withDerived(withOld).price).toBe(withOld.price);
  });

  it("промокод не діє", () => {
    const product = withDerived(seedProducts.find((p) => p.price > 1000)!);
    const totals = cartTotals([{ id: product.id, product, qty: 1 }], "np-branch", "FAMILY10");
    expect(totals.promoDiscount).toBe(0);
    expect(totals.savings).toBe(0);
    expect(totals.total).toBe(product.price);
  });

  it("сортування «Найбільша знижка» сховане", () => {
    expect(visibleSortOptions(productSortOptions).map((o) => o.id)).not.toContain("discount");
    process.env.NEXT_PUBLIC_DISCOUNTS = "1";
    expect(visibleSortOptions(productSortOptions).map((o) => o.id)).toContain("discount");
  });
});
