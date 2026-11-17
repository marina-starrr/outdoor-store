import { beforeAll, describe, expect, it } from "vitest";
import * as orders from "../../app/api/orders/route";
import { seedProducts } from "../../app/components/catalog-data";
import { loadCatalog } from "../../app/lib/server/catalog";
import { call, dbQuery } from "./helpers";

/*
 * Залишки на складі списуються в транзакції з умовою «stock >= qty»:
 * одночасні замовлення не продадуть більше, ніж є, а невдале замовлення
 * не списує нічого (усі рядки відкочуються разом).
 */

const [a, b] = seedProducts.filter((p) => !p.hidden && p.category === "lighting");

const order = (lines: { id: string; qty: number }[]) => ({
  lines,
  contact: { firstName: "Олег", lastName: "Паралельний", phone: "+380 50 111 22 33", email: "oleh@example.com" },
  delivery: { method: "np-branch", city: "Київ", branch: "1" },
  payment: "cod",
  agreed: true,
});

const stock = async (id: string) => (await dbQuery("select stock from products where id = $1", [id]))[0].stock;
const setStock = (id: string, n: number) => dbQuery("update products set stock = $2 where id = $1", [id, n]);

beforeAll(async () => {
  await loadCatalog(); // заповнює порожню базу початковим каталогом
});

describe("склад у базі даних", () => {
  it("останню одиницю купує лише один з кількох одночасних покупців", async () => {
    await setStock(a.id, 1);
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => call(orders.POST, { body: order([{ id: a.id, qty: 1 }]), ip: `10.70.0.${i + 1}` })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await stock(a.id)).toBe(0);
  });

  it("якщо одного з товарів не вистачає — не списується жоден", async () => {
    await setStock(a.id, 5);
    await setStock(b.id, 1);
    const r = await call(orders.POST, { body: order([{ id: a.id, qty: 2 }, { id: b.id, qty: 3 }]), ip: "10.70.1.1" });
    expect(r.status).toBe(409);
    expect(r.data.error).toMatch(/залишилось лише 1/);
    expect(await stock(a.id)).toBe(5);
    expect(await stock(b.id)).toBe(1);
  });

  it("замовлення з кількох товарів зберігає рядки в тому ж порядку", async () => {
    const r = await call(orders.POST, { body: order([{ id: b.id, qty: 1 }, { id: a.id, qty: 2 }]), ip: "10.70.2.1" });
    expect(r.status).toBe(200);
    const items = await dbQuery("select product_id, qty from order_items where order_number = $1 order by position", [r.data.order.number]);
    expect(items).toEqual([{ product_id: b.id, qty: 1 }, { product_id: a.id, qty: 2 }]);
  });
});
