import type { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import * as ordersItem from "../../app/api/admin/orders/[number]/route";
import * as register from "../../app/api/auth/register/route";
import * as orders from "../../app/api/orders/route";
import { seedProducts } from "../../app/components/catalog-data";
import { loadCatalog } from "../../app/lib/server/catalog";
import { call, dbQuery, markEmailVerified, sessionCookie } from "./helpers";

/*
 * Оформлення лише перевіряє залишок, а списує (бронює) товар підтвердження
 * адміністратором — у транзакції з умовою «stock >= qty»: одночасні
 * підтвердження не забронюють більше, ніж є, а невдале не списує нічого.
 */

const ADMIN_EMAIL = "stock-admin@example.com";
process.env.ADMIN_EMAILS = ADMIN_EMAIL;

const [a, b] = seedProducts.filter((p) => !p.hidden && p.category === "lighting");

const order = (lines: { id: string; qty: number }[]) => ({
  lines,
  contact: { firstName: "Олег", lastName: "Паралельний", phone: "+380 50 111 22 33", email: "oleh@example.com" },
  delivery: { method: "np-branch", city: "Київ", branch: "1" },
  payment: "invoice",
  agreed: true,
});

const stock = async (id: string) => (await dbQuery("select stock from products where id = $1", [id]))[0].stock;
const setStock = (id: string, n: number) => dbQuery("update products set stock = $2 where id = $1", [id, n]);

let admin = "";
const confirm = (number: string) =>
  call((req: NextRequest) => ordersItem.PATCH(req, { params: Promise.resolve({ number }) }), {
    method: "PATCH",
    cookie: admin,
    body: { status: "confirmed" },
  });

beforeAll(async () => {
  await loadCatalog(); // заповнює порожню базу початковим каталогом
  const r = await call(register.POST, { body: { email: ADMIN_EMAIL, password: "secret123", firstName: "Адмін" } });
  await markEmailVerified(ADMIN_EMAIL);
  admin = sessionCookie(r.res);
});

describe("склад у базі даних", () => {
  it("останню одиницю бронює лише одне з кількох одночасних підтверджень", async () => {
    await setStock(a.id, 1);
    const placed = await Promise.all(
      Array.from({ length: 5 }, (_, i) => call(orders.POST, { body: order([{ id: a.id, qty: 1 }]), ip: `10.70.0.${i + 1}` })),
    );
    // Оформити можуть усі — товар ще не списано
    expect(placed.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await stock(a.id)).toBe(1);
    const confirmed = await Promise.all(placed.map((r) => confirm(r.data.order.number)));
    expect(confirmed.filter((r) => r.status === 200)).toHaveLength(1);
    const refused = confirmed.filter((r) => r.status === 409);
    expect(refused).toHaveLength(4);
    expect(refused[0].data.error).toMatch(/на складі 0/);
    expect(await stock(a.id)).toBe(0);
  });

  it("якщо одного з товарів не вистачає — не бронюється жоден", async () => {
    await setStock(a.id, 5);
    await setStock(b.id, 3);
    const r = await call(orders.POST, { body: order([{ id: a.id, qty: 2 }, { id: b.id, qty: 3 }]), ip: "10.70.1.1" });
    expect(r.status).toBe(200);
    await setStock(b.id, 1); // поки замовлення чекало, товар купили інші
    const c = await confirm(r.data.order.number);
    expect(c.status).toBe(409);
    expect(c.data.error).toMatch(/потрібно 3 шт\., на складі 1/);
    expect(await stock(a.id)).toBe(5);
    expect(await stock(b.id)).toBe(1);
    // Замовлення лишилось новим — його можна підтвердити пізніше або скасувати
    const [row] = await dbQuery("select status, stock_reserved from orders where number = $1", [r.data.order.number]);
    expect(row).toEqual({ status: "new", stock_reserved: false });
  });

  it("більше, ніж є на складі, оформити не можна", async () => {
    await setStock(b.id, 1);
    const r = await call(orders.POST, { body: order([{ id: b.id, qty: 3 }]), ip: "10.70.3.1" });
    expect(r.status).toBe(409);
    expect(r.data.error).toMatch(/залишилось лише 1/);
  });

  it("замовлення з кількох товарів зберігає рядки в тому ж порядку", async () => {
    await setStock(b.id, 5);
    const r = await call(orders.POST, { body: order([{ id: b.id, qty: 1 }, { id: a.id, qty: 2 }]), ip: "10.70.2.1" });
    expect(r.status).toBe(200);
    const items = await dbQuery("select product_id, qty from order_items where order_number = $1 order by position", [r.data.order.number]);
    expect(items).toEqual([{ product_id: b.id, qty: 1 }, { product_id: a.id, qty: 2 }]);
  });
});
