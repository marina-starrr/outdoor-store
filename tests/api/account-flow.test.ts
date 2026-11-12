import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import * as account from "../../app/api/account/route";
import * as login from "../../app/api/auth/login/route";
import * as logout from "../../app/api/auth/logout/route";
import * as me from "../../app/api/auth/me/route";
import * as register from "../../app/api/auth/register/route";
import * as cart from "../../app/api/cart/route";
import * as favorites from "../../app/api/favorites/route";
import * as orders from "../../app/api/orders/route";
import { seedProducts, withDerived } from "../../app/components/catalog-data";

const products = seedProducts.map(withDerived);
import { MAX_QTY } from "../../app/components/cart-logic";
import { call, sessionCookie, uniqueEmail } from "./helpers";

const inStock = products.filter((p) => p.inStock);
const tent = inStock.find((p) => p.category === "tents")!;
const cheap = [...inStock].sort((a, b) => a.price - b.price)[0];
const outOfStock = products.find((p) => !p.inStock);

const PASSWORD = "camping2026";
const validOrder = (lines: { id: string; qty: number }[]) => ({
  lines,
  contact: { firstName: "Тарас", lastName: "Шевченко", phone: "+380 50 111 22 33", email: "" },
  delivery: { method: "np-branch", city: "Львів", branch: "12" },
  payment: "card",
  agreed: true,
});

it("тести працюють з тимчасовою базою, а не зі справжньою .data", () => {
  expect(process.env.FC_DATA_DIR).toBeTruthy();
  expect(process.env.FC_DATA_DIR).not.toContain(join("outdoor-store", ".data"));
});

describe("реєстрація", () => {
  it("відхиляє некоректні дані", async () => {
    const base = { firstName: "Тарас", email: uniqueEmail(), phone: "", password: PASSWORD };
    expect((await call(register.POST, { body: { ...base, firstName: "Т" } })).status).toBe(400);
    expect((await call(register.POST, { body: { ...base, email: "bad" } })).status).toBe(400);
    expect((await call(register.POST, { body: { ...base, phone: "+380 50" } })).status).toBe(400);
    expect((await call(register.POST, { body: { ...base, password: "short" } })).status).toBe(400);
  });

  it("захищена від запитів з чужого сайту (CSRF)", async () => {
    const r = await call(register.POST, { origin: "http://evil.example", body: {} });
    expect(r.status).toBe(403);
  });

  it("створює акаунт, ставить httpOnly-cookie і не повертає хеш пароля", async () => {
    const email = uniqueEmail();
    const r = await call(register.POST, {
      body: { firstName: "Тарас", lastName: "Шевченко", email, phone: "+380 50 111 22 33", password: PASSWORD, cart: [{ id: cheap.id, qty: 2 }] },
    });
    expect(r.status).toBe(200);
    expect(r.data.user.email).toBe(email);
    expect(JSON.stringify(r.data)).not.toContain("scrypt");
    expect(r.data.cart).toEqual([{ id: cheap.id, qty: 2 }]);
    const setCookie = r.res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/fc_session=/);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
  });

  it("не дозволяє двічі зареєструвати той самий email (без урахування регістру)", async () => {
    const email = uniqueEmail();
    const body = { firstName: "Тарас", email, phone: "", password: PASSWORD };
    expect((await call(register.POST, { body })).status).toBe(200);
    const again = await call(register.POST, { body: { ...body, email: email.toUpperCase() } });
    expect(again.status).toBe(409);
  });
});

describe("вхід і вихід", () => {
  const email = uniqueEmail();
  beforeAll(async () => {
    await call(register.POST, { body: { firstName: "Олена", email, phone: "", password: PASSWORD, cart: [{ id: tent.id, qty: 1 }] } });
  });

  it("невірний пароль і неіснуючий email дають однакову відповідь", async () => {
    const wrong = await call(login.POST, { body: { email, password: "wrong-password" }, ip: "10.0.0.1" });
    const unknown = await call(login.POST, { body: { email: uniqueEmail(), password: PASSWORD }, ip: "10.0.0.1" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.data.error).toBe(unknown.data.error);
  });

  it("після 5 невдалих спроб вхід блокується", async () => {
    const victim = uniqueEmail();
    await call(register.POST, { body: { firstName: "Ігор", email: victim, phone: "", password: PASSWORD } });
    for (let i = 0; i < 5; i++) await call(login.POST, { body: { email: victim, password: "nope-nope" }, ip: "10.0.0.2" });
    const blocked = await call(login.POST, { body: { email: victim, password: PASSWORD }, ip: "10.0.0.2" });
    expect(blocked.status).toBe(429);
  });

  it("вхід об'єднує гостьовий кошик з кошиком акаунта", async () => {
    const r = await call(login.POST, { body: { email, password: PASSWORD, cart: [{ id: tent.id, qty: 2 }, { id: cheap.id, qty: 1 }] } });
    expect(r.status).toBe(200);
    expect(r.data.cart).toEqual(expect.arrayContaining([{ id: tent.id, qty: 3 }, { id: cheap.id, qty: 1 }]));
  });

  it("/me повертає користувача за cookie, а після виходу — гостя", async () => {
    const r = await call(login.POST, { body: { email, password: PASSWORD } });
    const cookie = sessionCookie(r.res);
    const who = await call(me.GET, { method: "GET", cookie });
    expect(who.data.user.email).toBe(email);
    expect(who.data.user.passwordHash).toBeUndefined();

    await call(logout.POST, { cookie });
    const after = await call(me.GET, { method: "GET", cookie });
    expect(after.data.user).toBeNull();
  });

  it("підроблена cookie не дає доступу", async () => {
    const r = await call(me.GET, { method: "GET", cookie: "fc_session=forged-token" });
    expect(r.data.user).toBeNull();
  });
});

describe("кошик, обране, профіль", () => {
  let cookie = "";
  beforeAll(async () => {
    const r = await call(register.POST, { body: { firstName: "Марія", email: uniqueEmail(), phone: "", password: PASSWORD } });
    cookie = sessionCookie(r.res);
  });

  it("гість не може зберегти кошик в акаунті", async () => {
    expect((await call(cart.PUT, { method: "PUT", body: { lines: [] } })).status).toBe(401);
  });

  it("кошик очищується: невідомі товари, від'ємна кількість, дублікати, ліміт кількості", async () => {
    const r = await call(cart.PUT, {
      method: "PUT",
      cookie,
      body: { lines: [{ id: "hacked", qty: 1 }, { id: tent.id, qty: -5 }, { id: cheap.id, qty: 15 }, { id: cheap.id, qty: 15 }] },
    });
    expect(r.data.cart).toEqual([{ id: cheap.id, qty: MAX_QTY }]);
    const who = await call(me.GET, { method: "GET", cookie });
    expect(who.data.cart).toEqual([{ id: cheap.id, qty: MAX_QTY }]);
  });

  it("обране зберігається лише з існуючими товарами без повторів", async () => {
    const r = await call(favorites.PUT, { method: "PUT", cookie, body: { ids: [tent.id, tent.id, "nope", cheap.id] } });
    expect(r.data.favorites).toEqual([tent.id, cheap.id]);
  });

  it("оновлення профілю і зміна пароля", async () => {
    const bad = await call(account.PATCH, { method: "PATCH", cookie, body: { firstName: "М", phone: "" } });
    expect(bad.status).toBe(400);

    const wrongPass = await call(account.PATCH, {
      method: "PATCH", cookie,
      body: { firstName: "Марія", lastName: "Коваль", phone: "", currentPassword: "wrong", newPassword: "newpassword1" },
    });
    expect(wrongPass.status).toBe(400);

    const ok = await call(account.PATCH, {
      method: "PATCH", cookie,
      body: { firstName: "Марія", lastName: "Коваль", phone: "+380 67 123 45 67", currentPassword: PASSWORD, newPassword: "newpassword1" },
    });
    expect(ok.status).toBe(200);
    expect(ok.data.user.lastName).toBe("Коваль");
  });
});

describe("оформлення замовлення", () => {
  let cookie = "";
  beforeAll(async () => {
    const r = await call(register.POST, { body: { firstName: "Тарас", email: uniqueEmail(), phone: "", password: PASSWORD } });
    cookie = sessionCookie(r.res);
  });

  it("гість не може оформити замовлення", async () => {
    const r = await call(orders.POST, { body: validOrder([{ id: tent.id, qty: 1 }]) });
    expect(r.status).toBe(401);
  });

  it("без згоди з умовами замовлення не приймається", async () => {
    const r = await call(orders.POST, { cookie, body: { ...validOrder([{ id: tent.id, qty: 1 }]), agreed: false } });
    expect(r.status).toBe(400);
    expect(r.data.error).toMatch(/згоду/);
  });

  it("перевіряє дані доставки і контакти", async () => {
    const base = validOrder([{ id: tent.id, qty: 1 }]);
    const cases = [
      { ...base, lines: [] },
      { ...base, delivery: { method: "pickup", city: "Київ" } },
      { ...base, delivery: { method: "np-branch", city: "", branch: "1" } },
      { ...base, delivery: { method: "np-branch", city: "Львів", branch: "" } },
      { ...base, delivery: { method: "np-courier", city: "Львів", address: "" } },
      { ...base, payment: "bitcoin" },
      { ...base, contact: { ...base.contact, phone: "123" } },
      { ...base, contact: { ...base.contact, lastName: "" } },
    ];
    for (const body of cases) {
      const r = await call(orders.POST, { cookie, body });
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
  });

  if (outOfStock) {
    it("не дозволяє замовити товар, якого немає в наявності", async () => {
      const r = await call(orders.POST, { cookie, body: validOrder([{ id: outOfStock.id, qty: 1 }]) });
      expect(r.status).toBe(400);
    });
  }

  it("оплата частинами — лише від 3000 ₴", async () => {
    const r = await call(orders.POST, { cookie, body: { ...validOrder([{ id: cheap.id, qty: 1 }]), payment: "parts" } });
    if (cheap.price + 70 < 3000) expect(r.status).toBe(400);
  });

  it("ціни рахує сервер — підробити суму з браузера неможливо", async () => {
    const body = { ...validOrder([{ id: tent.id, qty: 2 }]), promo: "family10", total: 1, subtotal: 1 };
    const r = await call(orders.POST, { cookie, body });
    expect(r.status).toBe(200);
    const o = r.data.order;
    expect(o.subtotal).toBe(tent.price * 2);
    expect(o.promoDiscount).toBe(Math.round(tent.price * 2 * 0.1));
    expect(o.total).toBe(o.subtotal - o.promoDiscount + o.shipping);
    expect(o.number).toMatch(/^FC-\d{7}$/);
  });

  it("після замовлення кошик порожній, адреса запам'ятована, замовлення в історії", async () => {
    const who = await call(me.GET, { method: "GET", cookie });
    expect(who.data.cart).toEqual([]);
    expect(who.data.user.lastDelivery).toMatchObject({ method: "np-branch", city: "Львів", branch: "12" });
    expect(who.data.user.phone).toBe("+380 50 111 22 33");

    const history = await call(orders.GET, { method: "GET", cookie });
    expect(history.data.orders).toHaveLength(1);
  });

  it("дані справді записані у файл тимчасової бази", () => {
    const file = join(process.env.FC_DATA_DIR!, "db.json");
    expect(existsSync(file)).toBe(true);
    const db = JSON.parse(readFileSync(file, "utf8"));
    expect(db.users.length).toBeGreaterThan(0);
    // Пароль ніде не зберігається у відкритому вигляді
    expect(readFileSync(file, "utf8")).not.toContain(PASSWORD);
  });
});
