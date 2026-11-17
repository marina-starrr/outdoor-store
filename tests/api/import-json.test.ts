import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import * as login from "../../app/api/auth/login/route";
import * as orders from "../../app/api/orders/route";
import { hashPassword } from "../../app/lib/server/auth";
import { seedProducts } from "../../app/components/catalog-data";
import { loadCatalog } from "../../app/lib/server/catalog";
import { closeDatabase } from "../../app/lib/server/db";
import { call, dbQuery, sessionCookie } from "./helpers";

// Команда — окремий процес, тож база має бути на диску (у тимчасовій теці)
delete process.env.FC_DB_MEMORY;

const [tent, lamp] = seedProducts;
const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMAIL = "old-customer@example.com";
const PASSWORD = "camping2026";
const file = join(process.env.FC_DATA_DIR!, "old-db.json");

const order = (number: string, createdAt: string, status: string) => ({
  number,
  createdAt,
  status,
  lines: [{ id: lamp.id, name: lamp.name, price: lamp.price, qty: 2 }, { id: tent.id, name: tent.name, price: tent.price, qty: 1 }],
  subtotal: lamp.price * 2 + tent.price,
  promoDiscount: 0,
  shipping: 0,
  total: lamp.price * 2 + tent.price,
  delivery: { method: "np-branch", city: "м. Львів, Львівська обл.", cityRef: "ref-lviv", branch: "12" },
  payment: "cod",
  contact: { firstName: "Олена", lastName: "Коваль", phone: "+380 50 111 22 33" },
  noCall: false,
});

/** Знеособлений файл у форматі старого сховища */
const oldDb = async () => ({
  users: [
    {
      id: USER_ID,
      email: EMAIL,
      firstName: "Олена",
      lastName: "Коваль",
      phone: "+380 50 111 22 33",
      passwordHash: await hashPassword(PASSWORD),
      createdAt: "2026-01-02T10:00:00.000Z",
      emailVerifiedAt: "2026-01-02T10:05:00.000Z",
      cart: [{ id: tent.id, qty: 1 }, { id: lamp.id, qty: 3 }, { id: "deleted-product", qty: 1 }],
      favorites: [lamp.id, tent.id],
      lastDelivery: { method: "np-branch", city: "м. Львів, Львівська обл.", branch: "12" },
      orders: [order("FC-1000001", "2026-01-03T10:00:00.000Z", "shipped"), order("FC-1000002", "2026-01-04T10:00:00.000Z", "new")],
      notifications: [
        { id: "22222222-2222-4222-8222-222222222222", createdAt: "2026-01-05T10:00:00.000Z", kind: "order", title: "Перше", text: "…", read: true },
        { id: "33333333-3333-4333-8333-333333333333", createdAt: "2026-01-06T10:00:00.000Z", kind: "order", title: "Друге", text: "…" },
      ],
    },
  ],
  sessions: { abc: { userId: USER_ID, expiresAt: Date.now() + 1e9 } },
  products: [{ ...tent, price: 1234, stock: 7, description: "Змінено в адмінці" }],
  guestOrders: [{ ...order("FC-1000003", "2026-01-05T10:00:00.000Z", "confirmed"), contact: { firstName: "Гість", lastName: "Гостьовий", phone: "+380 67 000 00 00", email: "guest@example.com" }, claimHash: "hash-of-token" }],
  messages: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      createdAt: "2026-01-07T10:00:00.000Z",
      topic: "Порада",
      name: "Олена",
      email: EMAIL,
      message: "Підкажіть намет на чотирьох",
      userId: USER_ID,
      done: true,
      replies: [{ id: "55555555-5555-4555-8555-555555555555", createdAt: "2026-01-07T11:00:00.000Z", text: "Радимо…", onSite: true, emailed: false }],
    },
  ],
  reviews: [{ id: "66666666-6666-4666-8666-666666666666", productId: tent.id, userId: USER_ID, author: "Олена К.", rating: 5, text: "Чудовий намет для родини", createdAt: "2026-01-08T10:00:00.000Z", status: "approved", verified: true }],
});

/** Запуск команди: вбудовану базу відкриває лише один процес — закриваємо її на час команди */
const runImport = async (...args: string[]) => {
  await closeDatabase();
  return execFileSync(process.execPath, ["scripts/import-json.mjs", ...args, file], { env: process.env, encoding: "utf8" });
};

beforeAll(async () => {
  writeFileSync(file, JSON.stringify(await oldDb()));
  await loadCatalog(); // база вже існує з початковим каталогом — як після першого відкриття сайту
});

describe("yarn db:import — перенесення з db.json", () => {
  it("без --apply лише показує, що буде перенесено", async () => {
    const out = await runImport();
    expect(out).toContain("акаунтів: 1");
    expect(out).toContain("замовлень: 3");
    expect(out).toContain("нічого не змінено");
    expect(await dbQuery("select * from users")).toEqual([]);
  });

  it("переносить акаунт: старий пароль працює, кошик і обране на місці", async () => {
    await runImport("--apply");
    const r = await call(login.POST, { body: { email: EMAIL, password: PASSWORD }, ip: "10.80.0.1" });
    expect(r.status).toBe(200);
    expect(r.data.user).toMatchObject({ id: USER_ID, emailVerified: true, lastDelivery: { branch: "12" } });
    // Неіснуючий товар з кошика відкинуто, порядок збережено
    expect(r.data.cart).toEqual([{ id: tent.id, qty: 1 }, { id: lamp.id, qty: 3 }]);
    expect(r.data.favorites).toEqual([lamp.id, tent.id]);

    const history = await call(orders.GET, { method: "GET", cookie: sessionCookie(r.res) });
    expect(history.data.orders.map((o: { number: string }) => o.number)).toEqual(["FC-1000002", "FC-1000001"]);
    expect(history.data.orders[1].lines.map((l: { id: string }) => l.id)).toEqual([lamp.id, tent.id]);
  });

  it("переносить гостьові замовлення, звернення з відповідями, відгуки, сповіщення і зміни товарів", async () => {
    expect(await dbQuery("select user_id, claim_hash from orders where number = 'FC-1000003'")).toEqual([{ user_id: null, claim_hash: "hash-of-token" }]);
    expect(await dbQuery("select done from messages")).toEqual([{ done: true }]);
    expect(await dbQuery("select text from message_replies")).toEqual([{ text: "Радимо…" }]);
    expect(await dbQuery("select status from reviews")).toEqual([{ status: "approved" }]);
    expect((await dbQuery("select title, read from notifications order by seq")).map((n) => [n.title, n.read])).toEqual([["Перше", true], ["Друге", false]]);
    const p = (await loadCatalog()).find((x) => x.id === tent.id)!;
    expect(p).toMatchObject({ price: 1234, stock: 7, description: "Змінено в адмінці", rating: 5, reviews: 1 });
    // Сесії не переносяться
    expect(await dbQuery("select * from sessions where user_id = $1 and token_hash = 'abc'", [USER_ID])).toEqual([]);
  });

  it("повторний запуск нічого не дублює", async () => {
    const out = await runImport("--apply");
    expect(out).not.toContain("акаунти:");
    expect(await dbQuery("select count(*)::int as n from orders")).toEqual([{ n: 3 }]);
    expect(await dbQuery("select count(*)::int as n from order_items")).toEqual([{ n: 6 }]);
    expect(await dbQuery("select count(*)::int as n from notifications")).toEqual([{ n: 2 }]);
  });

  it("акаунт з тим самим email, що вже є в базі, не перезаписується", async () => {
    const data = await oldDb();
    data.users[0].id = "77777777-7777-4777-8777-777777777777";
    data.users[0].orders = [order("FC-1000009", "2026-02-01T10:00:00.000Z", "new")];
    writeFileSync(file, JSON.stringify(data));
    const out = await runImport("--apply");
    expect(out).toContain("акаунт уже є в базі");
    expect(await dbQuery("select id from users")).toEqual([{ id: USER_ID }]);
    expect(await dbQuery("select number from orders where number = 'FC-1000009'")).toEqual([]);
  });

  it("невідомий файл — зрозуміла помилка", () => {
    expect(() => execFileSync(process.execPath, ["scripts/import-json.mjs", "немає.json"], { stdio: "pipe" })).toThrow();
  });
});
