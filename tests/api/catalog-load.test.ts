import { beforeAll, describe, expect, it } from "vitest";
import { facetValues } from "../../app/components/catalog-facets";
import { seedProducts, withDerived, type Product } from "../../app/components/catalog-data";
import { knownProductIds } from "../../app/lib/server/auth";
import { insertProduct, loadCatalog, loadProducts } from "../../app/lib/server/catalog";
import { dbQuery } from "./helpers";

/*
 * Трафік бази (Supabase Free — 5 ГБ на місяць): каталог для сторінок читається
 * без описів (дві третини розміру), а перевірки кошика, відгуків, чату —
 * лише потрібних товарів, а не всього каталогу
 */

const base = seedProducts.map(withDerived).filter((p) => !p.hidden)[0];
const ID = "load-test-red-jacket";
const DESCRIPTION = "Тепла куртка для походів.\n\nКолір: червоний; розмір M.";

beforeAll(async () => {
  await loadCatalog();
  const p: Product = withDerived({ ...base, id: ID, name: "Куртка Тест Похідна", category: "clothing", description: DESCRIPTION, popularity: 990 });
  await insertProduct({ query: (text: string, params?: unknown[]) => dbQuery(text, params) } as never, p);
});

describe("каталог без описів", () => {
  it("у каталозі опису немає, але колір з опису для фільтра — є", async () => {
    const p = (await loadCatalog()).find((x) => x.id === ID)!;
    expect(p.description).toBeUndefined();
    expect(p.colorHint).toMatch(/^Колір: червоний/);
    expect(facetValues(p).color).toContain("Червоний");
  });

  it("адмінка й окремі товари — з описом", async () => {
    expect((await loadCatalog(undefined, { descriptions: true })).find((x) => x.id === ID)!.description).toBe(DESCRIPTION);
    const [one] = await loadProducts([ID], { descriptions: true });
    expect(one.description).toBe(DESCRIPTION);
    expect(await loadProducts([])).toEqual([]);
  });

  it("loadProducts повертає лише запитані товари", async () => {
    const list = await loadProducts([ID, base.id, "nemaie-takoho"]);
    expect(list.map((p) => p.id).sort()).toEqual([ID, base.id].sort());
  });
});

describe("перевірка товарів з браузера", () => {
  it("лише передані id, рядки кошика теж; невідомі й приховані — відкидаються", async () => {
    const hidden = seedProducts.find((p) => p.hidden)?.id ?? "nemaie-takoho";
    const known = await knownProductIds([{ id: ID, qty: 1 }, { id: "nemaie-takoho", qty: 1 }], [base.id, hidden, 42]);
    expect([...known].sort()).toEqual([ID, base.id].sort());
    expect((await knownProductIds()).size).toBe(0);
    expect((await knownProductIds(ID)).has(ID)).toBe(true);
  });
});
