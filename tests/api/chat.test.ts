import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import * as chatItem from "../../app/api/admin/chats/[id]/route";
import * as adminChats from "../../app/api/admin/chats/route";
import * as register from "../../app/api/auth/register/route";
import * as chat from "../../app/api/chat/route";
import * as read from "../../app/api/chat/read/route";
import { call, dbDump, dbQuery, markEmailVerified, sessionCookie } from "./helpers";

/*
 * Чат з консультантом: гість пише без реєстрації (ім'я + телефон або email),
 * розмова прив'язується до cookie браузера; з акаунтом — до акаунта.
 * Адміністратор відповідає з адмінки; якщо покупця немає в чаті — дублюємо листом.
 */

const ADMIN_EMAIL = "chat-admin@example.com";
process.env.ADMIN_EMAILS = ADMIN_EMAIL;
process.env.MAIL_TRANSPORT = "log";

let admin = "";
let ipSeq = 0;
const ip = () => `10.97.0.${++ipSeq}`;

const chatCookie = (res: Response) => {
  const m = (res.headers.get("set-cookie") ?? "").match(/fc_chat=([^;]*)/);
  return m ? `fc_chat=${m[1]}` : "";
};
const say = (body: Record<string, unknown>, cookie?: string) => call(chat.POST, { body, cookie, ip: ip() });
const history = (cookie?: string, open = false) => call(chat.GET, { method: "GET", path: `/api/chat${open ? "?open=1" : ""}`, cookie });
const thread = (id: string, method: "GET" | "POST" = "GET", body?: unknown, cookie = admin) =>
  call((req: NextRequest) => (method === "GET" ? chatItem.GET : chatItem.POST)(req, { params: Promise.resolve({ id }) }), {
    method,
    body,
    cookie,
  });
const outbox = (): { to: string; subject: string; text: string }[] => {
  const file = join(process.env.FC_DATA_DIR!, "outbox.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
};

beforeAll(async () => {
  const r = await call(register.POST, { body: { email: ADMIN_EMAIL, password: "secret123", firstName: "Адмін" } });
  await markEmailVerified(ADMIN_EMAIL);
  admin = sessionCookie(r.res);
});

describe("гість пише в чат", () => {
  let guest = "";
  let chatId = "";

  it("перше повідомлення — з ім'ям і телефоном або email", async () => {
    expect((await say({ text: "Привіт" })).data).toMatchObject({ field: "name" });
    expect((await say({ text: "Привіт", name: "Оля" })).data).toMatchObject({ field: "phone" });
    expect((await say({ text: "Привіт", name: "Оля", phone: "+380 50 1" })).data).toMatchObject({ field: "phone" });
    expect((await say({ text: "", name: "Оля", email: "olya@example.com" })).status).toBe(400);
  });

  it("розмова прив'язується до браузера (cookie); інший відвідувач її не бачить", async () => {
    const r = await say({ text: "Який намет для 4 людей?", name: "Оля", email: "olya@example.com", productId: "ov4" });
    expect(r.status).toBe(200);
    expect(r.data.message).toMatchObject({ author: "customer", text: "Який намет для 4 людей?", productId: "ov4" });
    guest = chatCookie(r.res);
    expect(guest).toMatch(/^fc_chat=.{20,}/);

    const mine = await history(guest);
    expect(mine.data.messages.map((m: { text: string }) => m.text)).toEqual(["Який намет для 4 людей?"]);
    expect((await history()).data).toEqual({ chat: null, messages: [], unread: 0 });
    // У базі — лише хеш токена, не сам токен
    expect(await dbDump()).not.toContain(guest.split("=")[1]);
  });

  it("невідомий товар не прикріплюється; наступні повідомлення — без контактів", async () => {
    const r = await say({ text: "І ще питання", productId: "no-such" }, guest);
    expect(r.status).toBe(200);
    expect(r.data.message.productId).toBeUndefined();
  });

  it("адміністратор бачить розмову з непрочитаними; відкриття позначає прочитаними", async () => {
    const list = await call(adminChats.GET, { method: "GET", cookie: admin });
    const c = list.data.chats.find((x: { name: string }) => x.name === "Оля");
    expect(c).toMatchObject({ guest: true, email: "olya@example.com", unread: 2, last: { text: "І ще питання" } });
    chatId = c.id;
    const t = await thread(chatId);
    expect(t.data.messages).toHaveLength(2);
    const again = await call(adminChats.GET, { method: "GET", cookie: admin });
    expect(again.data.chats.find((x: { id: string }) => x.id === chatId).unread).toBe(0);
  });

  it("покупця немає в чаті — відповідь дублюється листом; є — лише в чаті", async () => {
    const before = outbox().length;
    const r = await thread(chatId, "POST", { text: "Радимо Outventure 4 — просторий і легкий." });
    expect(r.status).toBe(200);
    expect(r.data.notified).toBe(true);
    expect(outbox().at(-1)).toMatchObject({ to: "olya@example.com", subject: "Відповідь у чаті Family Camping" });
    expect(outbox().length).toBe(before + 1);

    // Покупець відкрив чат — бачить відповідь і значок непрочитаних
    const h = await history(guest, true);
    expect(h.data.unread).toBe(1);
    expect(h.data.messages.at(-1)).toMatchObject({ author: "admin", text: "Радимо Outventure 4 — просторий і легкий." });
    await call(read.POST, { cookie: guest });
    expect((await history(guest)).data.unread).toBe(0);

    // Тепер покупець «у чаті» — наступна відповідь листом не дублюється
    const live = await thread(chatId, "POST", { text: "Є в наявності, відправимо сьогодні" });
    expect(live.data.notified).toBe(false);
    expect(outbox().length).toBe(before + 1);
  });

  it("лише для адміністратора", async () => {
    expect((await call(adminChats.GET, { method: "GET", cookie: guest })).status).toBe(401);
    expect((await thread(chatId, "POST", { text: "Хак" }, guest)).status).toBe(401);
    expect((await thread("not-a-uuid")).status).toBe(404);
  });
});

describe("покупець з акаунтом", () => {
  it("пише без контактів — ім'я й email з акаунта; гостьова розмова переходить в акаунт", async () => {
    // Спершу як гість
    const g = await say({ text: "Питаю як гість", name: "Тарас", phone: "+380 67 111 22 33" });
    const guest = chatCookie(g.res);
    // Потім реєструється в тому ж браузері
    const reg = await call(register.POST, { body: { email: "taras-chat@example.com", password: "secret123", firstName: "Тарас", lastName: "Чатовий" } });
    const both = `${sessionCookie(reg.res)}; ${guest}`;

    const h = await history(both);
    expect(h.data.messages.map((m: { text: string }) => m.text)).toEqual(["Питаю як гість"]);
    const r = await say({ text: "Тепер з акаунта" }, both);
    expect(r.status).toBe(200);
    const [row] = await dbQuery(
      "select c.email, c.phone, u.email as owner from chats c join users u on u.id = c.user_id where u.email = 'taras-chat@example.com'",
    );
    expect(row).toMatchObject({ owner: "taras-chat@example.com", email: "taras-chat@example.com", phone: "+380 67 111 22 33" });
    // Після виходу з акаунта (лише сесія) — та сама розмова
    expect((await history(sessionCookie(reg.res))).data.messages).toHaveLength(2);
  });

  it("відповідь покупцю з акаунтом, якого немає в чаті, — сповіщення на сайті", async () => {
    const reg = await call(register.POST, { body: { email: "ira-chat@example.com", password: "secret123", firstName: "Іра" } });
    const ira = sessionCookie(reg.res);
    await say({ text: "Коли відправите?" }, ira);
    const list = await call(adminChats.GET, { method: "GET", cookie: admin });
    const id = list.data.chats.find((x: { name: string }) => x.name === "Іра").id;
    expect((await thread(id, "POST", { text: "Завтра зранку" })).data.notified).toBe(true);
    const [n] = await dbQuery(
      "select n.kind, n.title, n.href from notifications n join users u on u.id = n.user_id where u.email = 'ira-chat@example.com'",
    );
    expect(n).toEqual({ kind: "reply", title: "Відповідь у чаті Family Camping", href: "/?chat=1" });
  });
});

describe("захист від спаму", () => {
  it("пастка для ботів і ліміт повідомлень", async () => {
    const bot = await say({ text: "spam", name: "Bot", email: "bot@example.com", website: "http://spam" });
    expect(bot.data).toEqual({ ok: true });
    expect(chatCookie(bot.res)).toBe("");

    const first = await call(chat.POST, { ip: "10.98.0.1", body: { text: "1", name: "Ліміт", email: "limit@example.com" } });
    const cookie = chatCookie(first.res);
    let status = 200;
    for (let i = 0; i < 20 && status === 200; i++)
      status = (await call(chat.POST, { ip: "10.98.0.1", cookie, body: { text: `msg ${i}` } })).status;
    expect(status).toBe(429);
  });
});
