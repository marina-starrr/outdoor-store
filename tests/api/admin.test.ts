import { beforeAll, describe, expect, it } from "vitest";
import * as messagesItem from "../../app/api/admin/messages/[id]/route";
import * as messages from "../../app/api/admin/messages/route";
import * as ordersItem from "../../app/api/admin/orders/[number]/route";
import * as adminOrders from "../../app/api/admin/orders/route";
import * as productItem from "../../app/api/admin/products/[id]/route";
import * as adminProducts from "../../app/api/admin/products/route";
import * as summary from "../../app/api/admin/summary/route";
import * as me from "../../app/api/auth/me/route";
import * as register from "../../app/api/auth/register/route";
import * as cart from "../../app/api/cart/route";
import * as contact from "../../app/api/contact/route";
import * as orders from "../../app/api/orders/route";
import { call, sessionCookie, uniqueEmail } from "./helpers";

const ADMIN_EMAIL = "owner@example.com";
process.env.ADMIN_EMAILS = `someone-else@example.com, ${ADMIN_EMAIL.toUpperCase()}`;

/** Виклик маршруту з параметром ([id], [number]) */
const withParams = <P extends Record<string, string>>(
  handler: (req: never, ctx: { params: Promise<P> }) => Promise<Response>,
  params: P,
) => ((req: never) => handler(req, { params: Promise.resolve(params) })) as Parameters<typeof call>[0];

const newProduct = {
  name: "Намет Тестовий Сімейний 5",
  brand: "Tramp",
  category: "tents",
  price: 7777,
  oldPrice: 8888,
  stock: 3,
  specs: "5 місць · 6 кг",
  capacity: 5,
  photo: "meadow",
  attrs: [["Вага", "6 кг"]],
};

let admin = "";
let customer = "";

beforeAll(async () => {
  admin = sessionCookie((await call(register.POST, { body: { firstName: "Власник", email: ADMIN_EMAIL, phone: "", password: "camping2026" } })).res);
  customer = sessionCookie((await call(register.POST, { body: { firstName: "Покупець", email: uniqueEmail(), phone: "", password: "camping2026" } })).res);
});

describe("доступ до адмін-панелі", () => {
  const routes = [
    () => call(adminProducts.GET, { method: "GET" }),
    () => call(adminOrders.GET, { method: "GET" }),
    () => call(messages.GET, { method: "GET" }),
    () => call(summary.GET, { method: "GET" }),
  ];

  it("гість отримує 401", async () => {
    for (const r of routes) expect((await r()).status).toBe(401);
  });

  it("звичайний покупець отримує 403", async () => {
    for (const path of [adminProducts.GET, adminOrders.GET, messages.GET, summary.GET])
      expect((await call(path, { method: "GET", cookie: customer })).status).toBe(403);
    expect((await call(adminProducts.POST, { cookie: customer, body: newProduct })).status).toBe(403);
  });

  it("адміністратор визначається за ADMIN_EMAILS (без урахування регістру)", async () => {
    const who = await call(me.GET, { method: "GET", cookie: admin });
    expect(who.data.user.isAdmin).toBe(true);
    const cust = await call(me.GET, { method: "GET", cookie: customer });
    expect(cust.data.user.isAdmin).toBe(false);
  });

  it("запити з чужого сайту відхиляються навіть для адміністратора", async () => {
    expect((await call(adminProducts.POST, { cookie: admin, body: newProduct, origin: "http://evil.example" })).status).toBe(403);
  });
});

describe("товари", () => {
  let createdId = "";

  it("список містить увесь каталог", async () => {
    const r = await call(adminProducts.GET, { method: "GET", cookie: admin });
    expect(r.status).toBe(200);
    expect(r.data.products.length).toBeGreaterThan(50);
  });

  it("створення з перевіркою полів", async () => {
    const bad = await call(adminProducts.POST, { cookie: admin, body: { ...newProduct, price: 0, name: "" } });
    expect(bad.status).toBe(400);
    expect(bad.data.errors).toHaveProperty("price");
    expect(bad.data.errors).toHaveProperty("name");

    const r = await call(adminProducts.POST, { cookie: admin, body: newProduct });
    expect(r.status).toBe(201);
    createdId = r.data.product.id;
    expect(createdId).toBe("namet-testovyi-simeinyi-5");
    expect(r.data.product).toMatchObject({ price: 7777, oldPrice: 8888, stock: 3, inStock: true, rating: 0, reviews: 0 });
    expect(r.data.product.attrs[0]).toEqual(["Бренд", "Tramp"]);
  });

  it("однакова назва — новий унікальний код; зайнятий код — 409", async () => {
    const again = await call(adminProducts.POST, { cookie: admin, body: newProduct });
    expect(again.data.product.id).toBe("namet-testovyi-simeinyi-5-2");
    const taken = await call(adminProducts.POST, { cookie: admin, body: { ...newProduct, id: "np3" } });
    expect(taken.status).toBe(409);
  });

  it("новий товар одразу доступний покупцям (кошик його приймає)", async () => {
    const r = await call(cart.PUT, { method: "PUT", cookie: customer, body: { lines: [{ id: createdId, qty: 1 }] } });
    expect(r.data.cart).toEqual([{ id: createdId, qty: 1 }]);
  });

  it("швидкі зміни зі списку: залишок, ціна (знижка зникає, якщо ціна ≥ старої)", async () => {
    const patch = (body: object) => call(withParams(productItem.PATCH, { id: createdId }), { method: "PATCH", cookie: admin, body });
    expect((await patch({ stock: 12 })).data.product.stock).toBe(12);
    const price = await patch({ price: 9000 });
    expect(price.data.product.price).toBe(9000);
    expect(price.data.product.oldPrice).toBeUndefined();
    expect((await patch({ stock: -1 })).status).toBe(400);
  });

  it("повне редагування і 404 для неіснуючого товару", async () => {
    const r = await call(withParams(productItem.PATCH, { id: createdId }), {
      method: "PATCH",
      cookie: admin,
      body: { ...newProduct, name: "Намет Оновлений 5", price: 6500, oldPrice: 7000, description: "Абзац 1.\n\nАбзац 2." },
    });
    expect(r.status).toBe(200);
    expect(r.data.product).toMatchObject({ name: "Намет Оновлений 5", price: 6500, oldPrice: 7000, id: createdId });
    const missing = await call(withParams(productItem.PATCH, { id: "no-such" }), { method: "PATCH", cookie: admin, body: { stock: 1 } });
    expect(missing.status).toBe(404);
  });

  it("прихований товар не можна покласти в кошик", async () => {
    await call(withParams(productItem.PATCH, { id: createdId }), { method: "PATCH", cookie: admin, body: { hidden: true } });
    const r = await call(cart.PUT, { method: "PUT", cookie: customer, body: { lines: [{ id: createdId, qty: 1 }] } });
    expect(r.data.cart).toEqual([]);
    await call(withParams(productItem.PATCH, { id: createdId }), { method: "PATCH", cookie: admin, body: { hidden: false } });
  });
});

describe("склад і замовлення", () => {
  let productId = "";
  let orderNumber = "";
  const order = (qty: number) => ({
    lines: [{ id: productId, qty }],
    contact: { firstName: "Покупець", lastName: "Тестовий", phone: "+380 50 111 22 33" },
    delivery: { method: "np-branch", city: "Київ", branch: "1" },
    payment: "card",
    agreed: true,
  });
  const stockOf = async () =>
    (await call(adminProducts.GET, { method: "GET", cookie: admin })).data.products.find((p: { id: string }) => p.id === productId).stock;

  beforeAll(async () => {
    const r = await call(adminProducts.POST, { cookie: admin, body: { ...newProduct, name: "Ліхтар Складський", category: "lighting", capacity: null, stock: 2, oldPrice: null } });
    productId = r.data.product.id;
  });

  it("не можна замовити більше, ніж є на складі", async () => {
    const r = await call(orders.POST, { cookie: customer, body: order(3) });
    expect(r.status).toBe(409);
    expect(r.data.error).toMatch(/залишилось лише 2/);
  });

  it("замовлення списує залишок", async () => {
    const r = await call(orders.POST, { cookie: customer, body: order(2) });
    expect(r.status).toBe(200);
    orderNumber = r.data.order.number;
    expect(await stockOf()).toBe(0);
    // Товар закінчився — наступне замовлення відхиляється
    expect((await call(orders.POST, { cookie: customer, body: order(1) })).status).toBe(400);
  });

  it("адміністратор бачить замовлення з даними покупця", async () => {
    const r = await call(adminOrders.GET, { method: "GET", cookie: admin });
    const found = r.data.orders.find((o: { number: string }) => o.number === orderNumber);
    expect(found).toMatchObject({ status: "new", total: expect.any(Number) });
    expect(found.customer.email).toContain("@example.com");
  });

  it("зміна статусу: лише дозволені переходи", async () => {
    const set = (status: string) => call(withParams(ordersItem.PATCH, { number: orderNumber }), { method: "PATCH", cookie: admin, body: { status } });
    expect((await set("done")).status).toBe(409); // через крок
    expect((await set("bogus")).status).toBe(400);
    expect((await set("confirmed")).data.order.status).toBe("confirmed");
    // Покупець бачить новий статус у профілі
    const history = await call(orders.GET, { method: "GET", cookie: customer });
    expect(history.data.orders.find((o: { number: string }) => o.number === orderNumber).status).toBe("confirmed");
  });

  it("скасування повертає товари на склад; скасоване змінити не можна", async () => {
    const set = (status: string) => call(withParams(ordersItem.PATCH, { number: orderNumber }), { method: "PATCH", cookie: admin, body: { status } });
    expect((await set("cancelled")).status).toBe(200);
    expect(await stockOf()).toBe(2);
    expect((await set("confirmed")).status).toBe(409);
    const missing = await call(withParams(ordersItem.PATCH, { number: "FC-0000000" }), { method: "PATCH", cookie: admin, body: { status: "confirmed" } });
    expect(missing.status).toBe(404);
  });
});

describe("звернення і зведення", () => {
  it("звернення з форми контактів з'являються в адмін-панелі й позначаються опрацьованими", async () => {
    await call(contact.POST, { body: { topic: "advice", name: "Ірина", email: "iryna@example.com", message: "Допоможіть обрати спальник" }, ip: "9.9.9.9" });
    const list = await call(messages.GET, { method: "GET", cookie: admin });
    const m = list.data.messages[0];
    expect(m).toMatchObject({ name: "Ірина", topic: "Допомога з вибором" });

    const done = await call(withParams(messagesItem.PATCH, { id: m.id }), { method: "PATCH", cookie: admin, body: { done: true } });
    expect(done.data.message.done).toBe(true);
    expect((await call(withParams(messagesItem.PATCH, { id: m.id }), { method: "PATCH", cookie: admin, body: {} })).status).toBe(400);
  });

  it("зведення рахує замовлення, товари та звернення", async () => {
    const r = await call(summary.GET, { method: "GET", cookie: admin });
    expect(r.status).toBe(200);
    expect(r.data.orders.byStatus.cancelled).toBeGreaterThanOrEqual(1);
    expect(r.data.products.visible).toBeGreaterThan(50);
    expect(r.data.messages.unread).toBe(0);
    expect(r.data.customers).toBeGreaterThanOrEqual(2);
  });
});
