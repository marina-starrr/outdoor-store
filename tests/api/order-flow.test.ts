import type { NextRequest } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import * as ordersItem from "../../app/api/admin/orders/[number]/route";
import * as adminOrders from "../../app/api/admin/orders/route";
import * as register from "../../app/api/auth/register/route";
import * as cronOrders from "../../app/api/cron/orders/route";
import * as orders from "../../app/api/orders/route";
import * as track from "../../app/api/orders/track/route";
import { loadCatalog } from "../../app/lib/server/catalog";
import { call, dbQuery, markEmailVerified, sessionCookie } from "./helpers";

/*
 * Оплата лише на рахунок:
 * нове → підтверджене (товар заброньовано, 3 дні на оплату) → оплачене → відправлене → виконане.
 * Не оплачене вчасно скасовується автоматично, товар повертається на склад.
 */

const ADMIN_EMAIL = "flow-admin@example.com";
process.env.ADMIN_EMAILS = ADMIN_EMAIL;
process.env.MAIL_TRANSPORT = "log";
process.env.CRON_SECRET = "flow-secret";

const PRODUCT = "np3";
const PHONE = "+380 67 111 22 33";
const EMAIL = "flow-guest@example.com";

let admin = "";
let ipSeq = 0;

const place = (over: Record<string, unknown> = {}) =>
  call(orders.POST, {
    ip: `10.90.0.${++ipSeq}`,
    body: {
      lines: [{ id: PRODUCT, qty: 2 }],
      contact: { firstName: "Тарас", lastName: "Оплатний", phone: PHONE, email: EMAIL },
      delivery: { method: "np-branch", city: "Київ", branch: "1" },
      payment: "invoice",
      agreed: true,
      ...over,
    },
  });

const setStatus = (number: string, status: string) =>
  call((req: NextRequest) => ordersItem.PATCH(req, { params: Promise.resolve({ number }) }), {
    method: "PATCH",
    cookie: admin,
    body: { status },
  });

const stock = async () => Number((await dbQuery("select stock from products where id = $1", [PRODUCT]))[0].stock);
const setStock = (n: number) => dbQuery("update products set stock = $2 where id = $1", [PRODUCT, n]);

const outbox = (): { to: string; subject: string; text: string }[] => {
  const file = join(process.env.FC_DATA_DIR!, "outbox.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
};
const lastMailFor = (number: string) => outbox().filter((m) => m.subject.includes(number)).at(-1);

const cron = (auth?: string) =>
  cronOrders.GET(
    new Request("http://localhost:3000/api/cron/orders", { headers: auth ? { authorization: auth } : {} }) as never,
  );

beforeAll(async () => {
  await loadCatalog();
  const r = await call(register.POST, { body: { email: ADMIN_EMAIL, password: "secret123", firstName: "Адмін" } });
  await markEmailVerified(ADMIN_EMAIL);
  admin = sessionCookie(r.res);
});

describe("оплата лише на рахунок", () => {
  it("накладений платіж більше не приймається", async () => {
    const r = await place({ payment: "cod" });
    expect(r.status).toBe(400);
    expect(r.data.error).toMatch(/спосіб оплати/);
  });

  it("нове замовлення: товар не списано, покупець бачить «очікує підтвердження»", async () => {
    await setStock(5);
    const r = await place();
    expect(r.status).toBe(200);
    expect(r.data.order.status).toBe("new");
    expect(await stock()).toBe(5);
  });
});

describe("підтвердження, оплата, відправлення", () => {
  let number = "";

  it("підтвердження бронює товар і надсилає покупцю суму, строк і як оплатити", async () => {
    await setStock(5);
    number = (await place()).data.order.number;
    const r = await setStatus(number, "confirmed");
    expect(r.status).toBe(200);
    expect(r.data.order.confirmedAt).toBeTruthy();
    expect(await stock()).toBe(3);

    const mail = lastMailFor(number)!;
    expect(mail.to).toBe(EMAIL);
    expect(mail.subject).toBe(`Замовлення ${number}: очікує оплату`);
    expect(mail.text).toMatch(/товар заброньовано за вами/);
    // Поки IBAN продавця не заповнено — реквізити надішле менеджер
    expect(mail.text).toContain(`Реквізити для оплати надішле менеджер`);
    expect(mail.text).toContain(`«Оплата замовлення ${number}»`);

    // Сторінка відстеження показує строк оплати
    const t = await call(track.POST, { body: { number, phone: PHONE }, ip: "10.91.0.1" });
    expect(t.data.order).toMatchObject({ status: "confirmed", confirmedAt: r.data.order.confirmedAt });
  });

  it("без оплати відправити не можна", async () => {
    const r = await setStatus(number, "shipped");
    expect(r.status).toBe(409);
  });

  it("оплату отримано → можна відправляти; повторно товар не списується", async () => {
    const paid = await setStatus(number, "paid");
    expect(paid.status).toBe(200);
    expect(paid.data.order.paidAt).toBeTruthy();
    expect(lastMailFor(number)!.subject).toBe(`Замовлення ${number}: оплачено`);
    expect((await setStatus(number, "shipped")).status).toBe(200);
    expect((await setStatus(number, "done")).status).toBe(200);
    expect(await stock()).toBe(3);
  });

  it("скасування оплаченого повертає товар на склад", async () => {
    await setStock(5);
    const n = (await place()).data.order.number;
    await setStatus(n, "confirmed");
    await setStatus(n, "paid");
    expect(await stock()).toBe(3);
    expect((await setStatus(n, "cancelled")).status).toBe(200);
    expect(await stock()).toBe(5);
  });

  it("скасування нового (ще не заброньованого) склад не змінює", async () => {
    await setStock(5);
    const n = (await place()).data.order.number;
    expect((await setStatus(n, "cancelled")).status).toBe(200);
    expect(await stock()).toBe(5);
  });
});

describe("автоскасування неоплачених", () => {
  it("cron лише із секретом", async () => {
    expect((await cron()).status).toBe(401);
    expect((await cron("Bearer wrong")).status).toBe(401);
  });

  it("через 3 дні без оплати — скасовано, товар повернено, покупцю лист", async () => {
    await setStock(5);
    const fresh = (await place()).data.order.number;
    const old = (await place()).data.order.number;
    await setStatus(fresh, "confirmed");
    await setStatus(old, "confirmed");
    expect(await stock()).toBe(1);
    await dbQuery("update orders set confirmed_at = now() - interval '3 days 1 hour' where number = $1", [old]);

    const res = await cron("Bearer flow-secret");
    expect(res.status).toBe(200);
    expect((await res.json()).cancelled).toEqual([old]);
    expect(await stock()).toBe(3);
    const [row] = await dbQuery("select status, stock_reserved from orders where number = $1", [old]);
    expect(row).toEqual({ status: "cancelled", stock_reserved: false });
    expect(lastMailFor(old)!.text).toMatch(/оплата не надійшла протягом 3 днів/);
    // Свіже підтверджене не зачеплено
    expect((await dbQuery("select status from orders where number = $1", [fresh]))[0].status).toBe("confirmed");
  });

  it("адмінка скасовує прострочені одразу, не чекаючи cron", async () => {
    await setStock(5);
    const n = (await place()).data.order.number;
    await setStatus(n, "confirmed");
    await dbQuery("update orders set confirmed_at = now() - interval '4 days' where number = $1", [n]);
    const list = await call(adminOrders.GET, { method: "GET", cookie: admin });
    expect(list.data.orders.find((o: { number: string }) => o.number === n).status).toBe("cancelled");
    expect(await stock()).toBe(5);
  });
});

describe("замовлення, оформлені до зміни (товар уже списано при оформленні)", () => {
  it("підтвердження не списує вдруге, скасування повертає", async () => {
    await setStock(5);
    const n = (await place()).data.order.number;
    // Так виглядає старе замовлення після міграції: товар списаний, stock_reserved = true
    await setStock(3);
    await dbQuery("update orders set stock_reserved = true where number = $1", [n]);
    await setStatus(n, "confirmed");
    expect(await stock()).toBe(3);
    await setStatus(n, "cancelled");
    expect(await stock()).toBe(5);
  });

  it("накладений платіж: відправляється без етапу «оплачено» і не скасовується автоматично", async () => {
    await setStock(5);
    const n = (await place()).data.order.number;
    await dbQuery("update orders set payment = 'cod' where number = $1", [n]);
    await setStatus(n, "confirmed");
    await dbQuery("update orders set confirmed_at = now() - interval '10 days' where number = $1", [n]);
    await cron("Bearer flow-secret");
    expect((await setStatus(n, "shipped")).status).toBe(200);
  });
});
