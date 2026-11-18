import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as ordersItem from "../../app/api/admin/orders/[number]/route";
import * as adminOrders from "../../app/api/admin/orders/route";
import * as summary from "../../app/api/admin/summary/route";
import * as register from "../../app/api/auth/register/route";
import * as claim from "../../app/api/orders/claim/route";
import * as orders from "../../app/api/orders/route";
import * as track from "../../app/api/orders/track/route";
import { seedProducts, withDerived } from "../../app/components/catalog-data";
import { call, dbDump, markEmailVerified, sessionCookie, uniqueEmail } from "./helpers";

const ADMIN_EMAIL = "guest-admin@example.com";
process.env.ADMIN_EMAILS = ADMIN_EMAIL;

/** Товар з найбільшим залишком — тестові замовлення його списують */
const product = seedProducts.map(withDerived).filter((p) => !p.hidden).sort((a, b) => b.stock - a.stock)[0];
const PHONE = "+380 67 765 43 21";

let ipSeq = 0;
/** Кожен тест — з «власної» IP-адреси, щоб ліміт гостьових замовлень не заважав */
const freshIp = () => `10.20.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;

const guestOrder = (over: Record<string, unknown> = {}) => ({
  lines: [{ id: product.id, qty: 1 }],
  contact: { firstName: "Галина", lastName: "Гостьова", phone: PHONE, email: "galyna@example.com" },
  delivery: { method: "np-branch", city: "Полтава", branch: "3" },
  payment: "invoice",
  agreed: true,
  ...over,
});

const placeGuest = (over?: Record<string, unknown>, ip = freshIp()) => call(orders.POST, { body: guestOrder(over), ip });

const withParams = <P extends Record<string, string>>(
  handler: (req: never, ctx: { params: Promise<P> }) => Promise<Response>,
  params: P,
) => ((req: never) => handler(req, { params: Promise.resolve(params) })) as Parameters<typeof call>[0];

const outbox = (): { to: string; subject: string; text: string; href?: string }[] => {
  const file = join(process.env.FC_DATA_DIR!, "outbox.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
};

const newUser = async (email = uniqueEmail()) =>
  sessionCookie((await call(register.POST, { body: { firstName: "Галина", email, phone: "", password: "camping2026" } })).res);

let admin = "";
beforeAll(async () => {
  admin = await newUser(ADMIN_EMAIL);
  await markEmailVerified(ADMIN_EMAIL);
});
beforeEach(() => {
  process.env.MAIL_TRANSPORT = "log";
});
afterEach(() => {
  delete process.env.MAIL_TRANSPORT;
});

describe("оформлення без акаунта", () => {
  it("приймає замовлення гостя і видає токен для перенесення в акаунт", async () => {
    const r = await placeGuest();
    expect(r.status).toBe(200);
    expect(r.data.order.number).toMatch(/^FC-\d{7}$/);
    expect(r.data.order.total).toBe(r.data.order.subtotal + r.data.order.shipping);
    expect(r.data.claimToken).toMatch(/^[\w-]{30,}$/);
    // Сам токен у базі не зберігається — лише його хеш
    expect(await dbDump()).not.toContain(r.data.claimToken);
    expect(JSON.stringify(r.data)).not.toContain("claimHash");
  });

  it("гостю email обов'язковий", async () => {
    const r = await placeGuest({ contact: { firstName: "Галина", lastName: "Гостьова", phone: PHONE } });
    expect(r.status).toBe(400);
    expect(r.data.error).toMatch(/email/);
  });

  it("перевірки ті самі, що й для покупця з акаунтом", async () => {
    expect((await placeGuest({ agreed: false })).status).toBe(400);
    expect((await placeGuest({ delivery: { method: "np-branch", city: "Полтава", branch: "" } })).status).toBe(400);
    expect((await placeGuest({ contact: { firstName: "Г", lastName: "Г", phone: "1", email: "x@example.com" } })).status).toBe(400);
  });

  it("пастка для ботів і захист від CSRF", async () => {
    expect((await placeGuest({ website: "http://spam.example" })).status).toBe(400);
    expect((await call(orders.POST, { body: guestOrder(), origin: "http://evil.example" })).status).toBe(403);
  });

  it("не більше 5 гостьових замовлень за пів години з однієї IP", async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) expect((await placeGuest({}, ip)).status).toBe(200);
    expect((await placeGuest({}, ip)).status).toBe(429);
    // Інша адреса — працює
    expect((await placeGuest()).status).toBe(200);
  });

  it("гість отримує лист-підтвердження з посиланням на відстеження", async () => {
    const r = await placeGuest();
    const mail = outbox().at(-1)!;
    expect(mail).toMatchObject({ to: "galyna@example.com", subject: `Замовлення ${r.data.order.number} прийнято` });
    expect(mail.href).toBe(`/orders/track?number=${r.data.order.number}`);
    expect(mail.text).toContain(product.name);
  });

  it("номери замовлень не повторюються", async () => {
    const numbers = new Set<string>();
    for (let i = 0; i < 4; i++) numbers.add((await placeGuest()).data.order.number);
    expect(numbers.size).toBe(4);
  });
});

describe("«Де моє замовлення?»", () => {
  let number = "";
  beforeAll(async () => {
    number = (await placeGuest()).data.order.number;
  });

  it("за номером і телефоном показує статус без особистих даних", async () => {
    const r = await call(track.POST, { body: { number, phone: "380677654321" }, ip: freshIp() });
    expect(r.status).toBe(200);
    expect(r.data.order).toMatchObject({ number, status: "new", delivery: { method: "np-branch", city: "м. Полтава, Полтавська обл." } });
    const text = JSON.stringify(r.data);
    for (const secret of ["galyna@example.com", "Гостьова", "380677654321", "67 765", '"contact"', '"branch"']) expect(text).not.toContain(secret);
  });

  it("номер можна ввести малими літерами", async () => {
    const r = await call(track.POST, { body: { number: number.toLowerCase(), phone: PHONE }, ip: freshIp() });
    expect(r.status).toBe(200);
  });

  it("чужий телефон і неіснуючий номер — однакова відповідь", async () => {
    const wrong = await call(track.POST, { body: { number, phone: "+380 50 000 00 00" }, ip: freshIp() });
    const missing = await call(track.POST, { body: { number: "FC-0000000", phone: PHONE }, ip: freshIp() });
    expect(wrong.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(wrong.data.error).toBe(missing.data.error);
  });

  it("некоректні дані та перебір номерів", async () => {
    expect((await call(track.POST, { body: { number: "123", phone: PHONE }, ip: freshIp() })).status).toBe(400);
    const ip = freshIp();
    for (let i = 0; i < 10; i++) await call(track.POST, { body: { number: `FC-000000${i}`, phone: PHONE }, ip });
    expect((await call(track.POST, { body: { number, phone: PHONE }, ip })).status).toBe(429);
  });
});

describe("перенесення в акаунт", () => {
  it("лише для того, хто увійшов", async () => {
    expect((await call(claim.POST, { body: { tokens: ["x".repeat(32)] } })).status).toBe(401);
  });

  it("за токеном замовлення переходить в акаунт, повторно — ні", async () => {
    const placed = await placeGuest();
    const cookie = await newUser();
    expect((await call(claim.POST, { cookie, body: { tokens: ["невірний-токен-невірний-токен"] } })).data.claimed).toBe(0);

    const r = await call(claim.POST, { cookie, body: { tokens: [placed.data.claimToken] } });
    expect(r.data.claimed).toBe(1);
    const history = await call(orders.GET, { method: "GET", cookie });
    expect(history.data.orders.map((o: { number: string }) => o.number)).toEqual([placed.data.order.number]);
    expect(JSON.stringify(history.data)).not.toContain("claimHash");

    // Хтось інший з тим самим токеном уже нічого не отримає
    const thief = await newUser();
    expect((await call(claim.POST, { cookie: thief, body: { tokens: [placed.data.claimToken] } })).data.claimed).toBe(0);
  });

  it("однаковий email не дає доступу до чужих гостьових замовлень", async () => {
    const email = uniqueEmail();
    await placeGuest({ contact: { firstName: "Галина", lastName: "Гостьова", phone: PHONE, email } });
    const cookie = await newUser(email);
    expect((await call(claim.POST, { cookie, body: { tokens: [] } })).data.claimed).toBe(0);
    expect((await call(orders.GET, { method: "GET", cookie })).data.orders).toEqual([]);
  });
});

describe("адмін-панель", () => {
  it("бачить гостьові замовлення з позначкою і змінює їх статус; гість отримує лист", async () => {
    const placed = await placeGuest();
    const number = placed.data.order.number as string;

    const list = await call(adminOrders.GET, { method: "GET", cookie: admin });
    const found = list.data.orders.find((o: { number: string }) => o.number === number);
    expect(found.customer).toMatchObject({ guest: true, email: "galyna@example.com", name: "Галина Гостьова" });
    expect(JSON.stringify(list.data)).not.toContain("claimHash");

    const r = await call(withParams(ordersItem.PATCH, { number }), { method: "PATCH", cookie: admin, body: { status: "confirmed" } });
    expect(r.status).toBe(200);
    expect(r.data.order.status).toBe("confirmed");
    expect(outbox().at(-1)).toMatchObject({ to: "galyna@example.com", href: `/orders/track?number=${number}` });

    const tracked = await call(track.POST, { body: { number, phone: PHONE }, ip: freshIp() });
    expect(tracked.data.order.status).toBe("confirmed");
  });

  it("скасування гостьового замовлення повертає товар на склад", async () => {
    const before = (await call(adminOrders.GET, { method: "GET", cookie: admin })).data.orders.length;
    const number = (await placeGuest({ lines: [{ id: product.id, qty: 2 }] })).data.order.number;
    const r = await call(withParams(ordersItem.PATCH, { number }), { method: "PATCH", cookie: admin, body: { status: "cancelled" } });
    expect(r.status).toBe(200);
    expect((await call(adminOrders.GET, { method: "GET", cookie: admin })).data.orders.length).toBe(before + 1);
  });

  it("зведення рахує й гостьові замовлення", async () => {
    const s = await call(summary.GET, { method: "GET", cookie: admin });
    const list = await call(adminOrders.GET, { method: "GET", cookie: admin });
    expect(s.data.orders.total).toBe(list.data.orders.length);
    expect(s.data.orders.total).toBeGreaterThan(0);
  });
});
