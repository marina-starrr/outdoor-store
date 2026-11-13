import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as messageReply from "../../app/api/admin/messages/[id]/reply/route";
import * as messages from "../../app/api/admin/messages/route";
import * as ordersItem from "../../app/api/admin/orders/[number]/route";
import * as productItem from "../../app/api/admin/products/[id]/route";
import * as register from "../../app/api/auth/register/route";
import * as contact from "../../app/api/contact/route";
import * as favorites from "../../app/api/favorites/route";
import * as notifications from "../../app/api/notifications/route";
import * as orders from "../../app/api/orders/route";
import * as stockAlerts from "../../app/api/stock-alerts/route";
import { call, sessionCookie, uniqueEmail } from "./helpers";

const ADMIN_EMAIL = "owner-notify@example.com";
process.env.ADMIN_EMAILS = ADMIN_EMAIL;

/** Виклик маршруту з параметром ([id], [number]) */
const withParams = <P extends Record<string, string>>(
  handler: (req: never, ctx: { params: Promise<P> }) => Promise<Response>,
  params: P,
) => ((req: never) => handler(req, { params: Promise.resolve(params) })) as Parameters<typeof call>[0];

/** Листи, «надіслані» в режимі MAIL_TRANSPORT=log */
const outbox = (): { to: string; subject: string; text: string; href?: string }[] => {
  const file = join(process.env.FC_DATA_DIR!, "outbox.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
};

let admin = "";
let customer = "";
let customerEmail = "";
let other = "";

const newUser = async (firstName: string, email = uniqueEmail()) =>
  sessionCookie((await call(register.POST, { body: { firstName, email, phone: "", password: "camping2026" } })).res);

const inbox = async (cookie: string) => (await call(notifications.GET, { method: "GET", cookie })).data;
const patchProduct = (id: string, body: object) => call(withParams(productItem.PATCH, { id }), { method: "PATCH", cookie: admin, body });

beforeAll(async () => {
  admin = await newUser("Власник", ADMIN_EMAIL);
  customerEmail = uniqueEmail();
  customer = await newUser("Оксана", customerEmail);
  other = await newUser("Іван");
});

beforeEach(() => {
  process.env.MAIL_TRANSPORT = "log";
});
afterEach(() => {
  delete process.env.MAIL_TRANSPORT;
});

describe("API сповіщень", () => {
  it("лише для авторизованих", async () => {
    expect((await call(notifications.GET, { method: "GET" })).status).toBe(401);
    expect((await call(stockAlerts.POST, { body: { productId: "np3" } })).status).toBe(401);
  });

  it("новий покупець — без сповіщень, листи увімкнені", async () => {
    const d = await inbox(other);
    expect(d).toMatchObject({ notifications: [], unread: 0, stockAlerts: [], emailNotifications: true, mailEnabled: true });
  });

  it("захищене від CSRF", async () => {
    const r = await call(notifications.PATCH, { method: "PATCH", cookie: customer, body: { read: "all" }, origin: "http://evil.example" });
    expect(r.status).toBe(403);
  });
});

describe("«Повідомити про наявність»", () => {
  it("підписка, відписка, невідомий товар", async () => {
    expect((await call(stockAlerts.POST, { cookie: customer, body: { productId: "no-such" } })).status).toBe(404);
    expect((await call(stockAlerts.POST, { cookie: customer, body: { productId: "np2" } })).data.stockAlerts).toEqual(["np2"]);
    // Повторна підписка не дублює
    expect((await call(stockAlerts.POST, { cookie: customer, body: { productId: "np2" } })).data.stockAlerts).toEqual(["np2"]);
    expect((await call(stockAlerts.DELETE, { method: "DELETE", cookie: customer, body: { productId: "np2" } })).data.stockAlerts).toEqual([]);
  });

  it("товар з'явився — сповіщення підписнику (і лист), підписка знімається; інших не чіпає", async () => {
    await patchProduct("np3", { stock: 0 });
    await call(stockAlerts.POST, { cookie: customer, body: { productId: "np3" } });

    // Зміна, що не повертає товар на склад, — без сповіщень
    await patchProduct("np3", { stock: 0 });
    expect((await inbox(customer)).unread).toBe(0);

    await patchProduct("np3", { stock: 5 });
    const d = await inbox(customer);
    expect(d.unread).toBe(1);
    expect(d.notifications[0]).toMatchObject({ kind: "stock", href: "/catalog/tents/np3" });
    expect(d.notifications[0].title).toMatch(/знову в наявності/);
    expect(d.stockAlerts).toEqual([]);
    expect(outbox().at(-1)).toMatchObject({ to: customerEmail, href: "/catalog/tents/np3" });

    expect((await inbox(other)).unread).toBe(0);
  });

  it("позначити прочитаними", async () => {
    const d = (await call(notifications.PATCH, { method: "PATCH", cookie: customer, body: { read: "all" } })).data;
    expect(d.unread).toBe(0);
    expect(d.notifications.every((n: { read?: boolean }) => n.read)).toBe(true);
  });
});

describe("знижка на обране", () => {
  it("подешевшання — тим, у кого товар в обраному; подорожчання — ні", async () => {
    await call(favorites.PUT, { method: "PUT", cookie: other, body: { ids: ["bp-trail45"] } });
    const before = (await inbox(other)).notifications.length;

    await patchProduct("bp-trail45", { price: 9999 });
    expect((await inbox(other)).notifications.length).toBe(before);

    await patchProduct("bp-trail45", { price: 1990 });
    const d = await inbox(other);
    expect(d.notifications.length).toBe(before + 1);
    expect(d.notifications[0]).toMatchObject({ kind: "price" });
    expect(d.notifications[0].text).toMatch(/9\s?999 ₴ → 1\s?990 ₴/);
  });

  it("покупець може вимкнути листи — сповіщення на сайті лишаються", async () => {
    await call(notifications.PATCH, { method: "PATCH", cookie: other, body: { emailNotifications: false } });
    const sent = outbox().length;
    await patchProduct("bp-trail45", { price: 1890 });
    expect(outbox().length).toBe(sent);
    expect((await inbox(other)).notifications[0].kind).toBe("price");
    expect((await inbox(other)).emailNotifications).toBe(false);
  });
});

describe("статус замовлення", () => {
  it("кожна зміна статусу — сповіщення власнику", async () => {
    await patchProduct("ch3", { stock: 10 });
    const r = await call(orders.POST, {
      cookie: customer,
      body: {
        lines: [{ id: "ch3", qty: 1 }],
        contact: { firstName: "Оксана", lastName: "Тест", phone: "+380 50 111 22 33" },
        delivery: { method: "np-branch", city: "Київ", branch: "1" },
        payment: "card",
        agreed: true,
      },
    });
    const number = r.data.order.number as string;
    const setStatus = (status: string) =>
      call(withParams(ordersItem.PATCH, { number }), { method: "PATCH", cookie: admin, body: { status } });

    await setStatus("confirmed");
    await setStatus("shipped");
    const d = await inbox(customer);
    expect(d.notifications.slice(0, 2).map((n: { kind: string; title: string }) => [n.kind, n.title])).toEqual([
      ["order", `Замовлення ${number}: відправлене`],
      ["order", `Замовлення ${number}: підтверджене`],
    ]);
    expect(d.notifications[0].href).toBe("/account");
  });
});

describe("відповідь на звернення", () => {
  const send = async (cookie: string | undefined, email: string, ip: string) => {
    await call(contact.POST, {
      cookie,
      ip,
      body: { topic: "advice", name: "Оксана", email, phone: "+380 ", message: "Який намет обрати для родини?" },
    });
    const list = (await call(messages.GET, { method: "GET", cookie: admin })).data.messages;
    return list[0] as { id: string; hasAccount: boolean };
  };
  const reply = (id: string, text: string) =>
    call(withParams(messageReply.POST, { id }), { cookie: admin, body: { text } });

  it("лише адміністратор", async () => {
    const m = await send(customer, customerEmail, "3.3.3.1");
    expect((await call(withParams(messageReply.POST, { id: m.id }), { cookie: customer, body: { text: "Привіт" } })).status).toBe(403);
    expect((await reply(m.id, "")).status).toBe(400);
    expect((await reply("no-such", "Привіт")).status).toBe(404);
  });

  it("покупцю з акаунтом — на сайт і на email; звернення стає опрацьованим", async () => {
    const m = await send(customer, customerEmail, "3.3.3.2");
    expect(m.hasAccount).toBe(true);
    const r = await reply(m.id, "Радимо Nature Peak 3 — легкий і просторий.");
    expect(r.status).toBe(200);
    expect(r.data.reply).toMatchObject({ onSite: true, emailed: true });
    expect(r.data.message.done).toBe(true);
    expect(r.data.message.replies).toHaveLength(1);

    const n = (await inbox(customer)).notifications[0];
    expect(n).toMatchObject({ kind: "reply", text: "Радимо Nature Peak 3 — легкий і просторий." });
    expect(outbox().at(-1)).toMatchObject({ to: customerEmail, subject: "Re: Допомога з вибором — Family Camping" });
  });

  it("гість з email зареєстрованого покупця — теж отримує на сайті", async () => {
    const m = await send(undefined, customerEmail.toUpperCase(), "3.3.3.3");
    expect(m.hasAccount).toBe(true);
    expect((await reply(m.id, "Відповідь")).data.reply.onSite).toBe(true);
  });

  it("гість без акаунта і без налаштованої пошти — відповідь зберігається, але не доставляється", async () => {
    delete process.env.MAIL_TRANSPORT;
    const m = await send(undefined, "guest-no-account@example.com", "3.3.3.4");
    expect(m.hasAccount).toBe(false);
    expect((await call(messages.GET, { method: "GET", cookie: admin })).data.mailEnabled).toBe(false);
    const r = await reply(m.id, "Відповідь");
    expect(r.data.reply).toMatchObject({ onSite: false, emailed: false });
  });
});
