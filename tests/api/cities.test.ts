import { describe, expect, it } from "vitest";
import * as cities from "../../app/api/cities/route";
import * as orders from "../../app/api/orders/route";
import { call } from "./helpers";

/** GET /api/cities?q=…&method=… */
const suggest = (q: string, method = "np-branch") =>
  call(cities.GET, { method: "GET", path: `/api/cities?q=${encodeURIComponent(q)}&method=${method}` });

let ipSeq = 0;
/** Замовлення гостя з потрібним містом (кожне — з окремої IP через ліміт гостьових замовлень) */
const order = (delivery: Record<string, string>) =>
  call(orders.POST, {
    ip: `10.30.0.${++ipSeq}`,
    body: {
      lines: [{ id: "np3", qty: 1 }],
      contact: { firstName: "Ірина", lastName: "Місто", phone: "+380 50 222 33 44", email: "city@example.com" },
      delivery: { method: "np-branch", branch: "5", ...delivery },
      payment: "invoice",
      agreed: true,
    },
  });

describe("підказки міст", () => {
  it("за початком назви, з типом і областю", async () => {
    const r = await suggest("полт");
    expect(r.status).toBe(200);
    expect(r.data.available).toBe(true);
    expect(r.data.fuzzy).toBe(false);
    expect(r.data.cities[0]).toEqual({ ref: "ref-poltava", label: "м. Полтава, Полтавська обл." });
    expect(r.data.cities.map((c: { label: string }) => c.label)).toContain("с. Полтавка, Первомайський р-н, Миколаївська обл.");
  });

  it("одруківка — варіанти виправлення", async () => {
    const r = await suggest("Палтава");
    expect(r.data.fuzzy).toBe(true);
    expect(r.data.cities[0].label).toBe("м. Полтава, Полтавська обл.");
  });

  it("неіснуюча назва — порожній список", async () => {
    expect((await suggest("Абракадабрськ")).data.cities).toEqual([]);
  });
});

describe("місто при оформленні замовлення", () => {
  it("обране з підказок — зберігається з підписом і Ref", async () => {
    const r = await order({ city: "м. Полтава, Полтавська обл.", cityRef: "ref-poltava" });
    expect(r.status).toBe(200);
    expect(r.data.order.delivery).toMatchObject({ city: "м. Полтава, Полтавська обл.", cityRef: "ref-poltava" });
  });

  it("введене вручну без помилок — розпізнається, якщо таке місто одне", async () => {
    const r = await order({ city: "  львів " });
    expect(r.status).toBe(200);
    expect(r.data.order.delivery).toMatchObject({ city: "м. Львів, Львівська обл.", cityRef: "ref-lviv" });
  });

  it("з одруківкою — помилка з підказкою під полем «Місто»", async () => {
    const r = await order({ city: "Палтава" });
    expect(r.status).toBe(400);
    expect(r.data.field).toBe("city");
    expect(r.data.error).toBe("Не знайшли «Палтава». Можливо, ви мали на увазі «Полтава»?");
  });

  it("неіснуюче місто — відхиляється", async () => {
    const r = await order({ city: "Абракадабрськ" });
    expect(r.status).toBe(400);
    expect(r.data.error).toMatch(/Не знайшли такого населеного пункту/);
  });

  it("кілька населених пунктів з такою назвою — треба обрати зі списку", async () => {
    const r = await order({ city: "Полтавка" });
    expect(r.status).toBe(400);
    expect(r.data.error).toMatch(/Є кілька населених пунктів «Полтавка»/);
    // Конкретний вибір — приймається
    expect((await order({ city: "Полтавка", cityRef: "ref-poltavka-2" })).status).toBe(200);
  });

  it("підроблений Ref не приймається, якщо назва не існує", async () => {
    const r = await order({ city: "Неіснуючеграде", cityRef: "fake-ref" });
    expect(r.status).toBe(400);
    expect(r.data.field).toBe("city");
  });

  it("населений пункт без Нової пошти не можна обрати для доставки Новою поштою", async () => {
    const r = await order({ city: "с. Десь", cityRef: "s:some-settlement" });
    expect(r.status).toBe(400);
    expect(r.data.error).toMatch(/Нова пошта не доставляє/);
  });
});
