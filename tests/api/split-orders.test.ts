import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as register from "../../app/api/auth/register/route";
import * as claim from "../../app/api/orders/claim/route";
import * as orders from "../../app/api/orders/route";
import { seedProducts, withDerived, type Product } from "../../app/components/catalog-data";
import { insertProduct, loadCatalog } from "../../app/lib/server/catalog";
import { call, dbQuery, sessionCookie, uniqueEmail } from "./helpers";

/*
 * Кожен постачальник — окремий склад. Товари з різних складів — окремі замовлення.
 * Склад без накладеного платежу (Atlantmarket) — лише оплата на рахунок і лише Нова пошта
 */

const PHONE = "+380 67 765 43 21";
let ipSeq = 0;
const freshIp = () => `10.40.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;

/** Власний товар магазину (без постачальника) з великим залишком */
const own = seedProducts.map(withDerived).filter((p) => !p.hidden).sort((a, b) => b.stock - a.stock)[0];

const ids = { codSupplier: "", prepaySupplier: "", codItem: "split-ranger-item", prepayItem: "split-atlant-item", prepayItem2: "split-atlant-item-2" };

async function addSupplier(name: string, terms: { cod: boolean; np: boolean; days: number }) {
  const [row] = await dbQuery(
    "insert into suppliers (name, feed_url, cod_allowed, np_only, dispatch_days) values ($1, $2, $3, $4, $5) returning id",
    [name, `https://${name.toLowerCase()}.example/feed.xml`, terms.cod, terms.np, terms.days],
  );
  return row.id as string;
}

async function addProduct(id: string, supplierId: string, price: number) {
  const p: Product = withDerived({ ...own, id, name: `Товар ${id}`, price, stock: 10, inStock: true, popularity: 900 });
  await insertProduct({ query: (text: string, params?: unknown[]) => dbQuery(text, params) } as never, p);
  await dbQuery("update products set supplier_id = $2, supplier_sku = $1 where id = $1", [id, supplierId]);
}

beforeAll(async () => {
  await loadCatalog(); // вбудований каталог (власні товари)
  ids.codSupplier = await addSupplier("Ranger", { cod: true, np: false, days: 0 });
  ids.prepaySupplier = await addSupplier("Atlantmarket", { cod: false, np: true, days: 3 });
  await addProduct(ids.codItem, ids.codSupplier, 500);
  await addProduct(ids.prepayItem, ids.prepaySupplier, 1200);
  await addProduct(ids.prepayItem2, ids.prepaySupplier, 300);
});
beforeEach(() => {
  process.env.MAIL_TRANSPORT = "log";
});
afterEach(() => {
  delete process.env.MAIL_TRANSPORT;
});

const order = (lines: { id: string; qty: number }[], over: Record<string, unknown> = {}) => ({
  lines,
  contact: { firstName: "Галина", lastName: "Гостьова", phone: PHONE, email: "galyna@example.com" },
  delivery: { method: "np-branch", city: "Полтава", branch: "3" },
  payment: "invoice",
  agreed: true,
  ...over,
});
const place = (lines: { id: string; qty: number }[], over?: Record<string, unknown>, cookie?: string) =>
  call(orders.POST, { body: order(lines, over), ip: freshIp(), cookie });

describe("умови складу в каталозі", () => {
  it("товар знає свій склад, передоплату, Нову пошту й строк відправки", async () => {
    const catalog = await loadCatalog();
    const atlant = catalog.find((p) => p.id === ids.prepayItem)!;
    expect(atlant).toMatchObject({ shipFrom: ids.prepaySupplier, prepayOnly: true, novaPoshtaOnly: true, dispatchDays: 3 });
    const ranger = catalog.find((p) => p.id === ids.codItem)!;
    expect(ranger.shipFrom).toBe(ids.codSupplier);
    expect(ranger.prepayOnly).toBeUndefined();
    expect(ranger.novaPoshtaOnly).toBeUndefined();
    expect(ranger.dispatchDays).toBeUndefined();
    expect(catalog.find((p) => p.id === own.id)!.shipFrom).toBeUndefined();
  });
});

describe("товари з різних складів — окремі замовлення", () => {
  it("один склад — одне замовлення, як раніше", async () => {
    const r = await place([{ id: ids.prepayItem, qty: 1 }, { id: ids.prepayItem2, qty: 2 }]);
    expect(r.status).toBe(200);
    expect(r.data.orders).toHaveLength(1);
    expect(r.data.order.total).toBe(1800);
  });

  it("Ranger + Atlantmarket + власний склад — три замовлення з власними сумами; гість отримує токен на кожне", async () => {
    const r = await place([
      { id: ids.codItem, qty: 2 },
      { id: ids.prepayItem, qty: 1 },
      { id: own.id, qty: 1 },
      { id: ids.prepayItem2, qty: 1 },
    ]);
    expect(r.status).toBe(200);
    const placed = r.data.orders as { number: string; total: number; lines: { id: string }[] }[];
    expect(placed).toHaveLength(3);
    expect(placed.map((o) => o.lines.map((l) => l.id))).toEqual([[ids.codItem], [ids.prepayItem, ids.prepayItem2], [own.id]]);
    expect(placed.map((o) => o.total)).toEqual([1000, 1500, own.price]);
    expect(new Set(placed.map((o) => o.number)).size).toBe(3);
    expect(r.data.order.number).toBe(placed[0].number);
    expect(r.data.claimTokens).toHaveLength(3);
    expect(r.data.claimToken).toBe(r.data.claimTokens[0]);

    // Лист про кожне замовлення згадує інші
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const mails = JSON.parse(readFileSync(join(process.env.FC_DATA_DIR!, "outbox.json"), "utf8")) as { subject: string; text: string }[];
    const mail = mails.find((m) => m.subject.includes(placed[1].number))!;
    expect(mail.text).toContain("різних складах");
    expect(mail.text).toContain(placed[0].number);

    // Після реєстрації всі три замовлення переходять в акаунт
    const cookie = sessionCookie((await call(register.POST, { body: { firstName: "Галина", email: uniqueEmail(), phone: "", password: "camping2026" } })).res);
    const claimed = await call(claim.POST, { cookie, body: { tokens: r.data.claimTokens } });
    expect(claimed.status).toBe(200);
    expect(claimed.data.claimed).toBe(3);
  });

  it("накладений платіж: склад без нього отримує оплату на рахунок, решта — накладений", async () => {
    const r = await place([{ id: ids.codItem, qty: 1 }, { id: ids.prepayItem, qty: 1 }], { payment: "cod" });
    expect(r.status).toBe(200);
    const byFirstLine = Object.fromEntries((r.data.orders as { payment: string; lines: { id: string }[] }[]).map((o) => [o.lines[0].id, o.payment]));
    expect(byFirstLine).toEqual({ [ids.codItem]: "cod", [ids.prepayItem]: "invoice" });
  });

  it("лише товари без накладеного платежу — накладений платіж не приймається", async () => {
    const r = await place([{ id: ids.prepayItem, qty: 1 }], { payment: "cod" });
    expect(r.status).toBe(400);
    expect(r.data.error).toContain("передоплати");
  });

  it("Укрпошта недоступна, якщо є товар «лише Нова пошта»", async () => {
    const r = await place([{ id: ids.codItem, qty: 1 }, { id: ids.prepayItem, qty: 1 }], { delivery: { method: "ukrposhta", city: "Полтава", branch: "36000" } });
    expect(r.status).toBe(400);
    expect(r.data.error).toContain("Новою поштою");
    // Без таких товарів — Укрпошта працює
    const ok = await place([{ id: ids.codItem, qty: 1 }], { delivery: { method: "ukrposhta", city: "Полтава", branch: "36000" } });
    expect(ok.status).toBe(200);
  });

  it("покупець з акаунтом: обидва замовлення в його історії, кошик очищено", async () => {
    const email = uniqueEmail();
    const cookie = sessionCookie((await call(register.POST, { body: { firstName: "Олег", email, phone: "", password: "camping2026" } })).res);
    const r = await place([{ id: ids.codItem, qty: 1 }, { id: ids.prepayItem, qty: 1 }], {}, cookie);
    expect(r.status).toBe(200);
    expect(r.data.claimTokens).toBeUndefined();
    const [user] = await dbQuery("select id from users where email = $1", [email]);
    const saved = await dbQuery("select number from orders where user_id = $1", [user.id]);
    expect(saved.map((o) => o.number).sort()).toEqual((r.data.orders as { number: string }[]).map((o) => o.number).sort());
  });
});
