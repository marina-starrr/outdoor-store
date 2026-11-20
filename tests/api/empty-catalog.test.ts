import { describe, expect, it } from "vitest";
import * as productItem from "../../app/api/admin/products/[id]/route";
import * as adminProducts from "../../app/api/admin/products/route";
import * as login from "../../app/api/auth/login/route";
import * as register from "../../app/api/auth/register/route";
import { loadCatalog } from "../../app/lib/server/catalog";
import { productUrls } from "../../app/lib/server/product-urls";
import { call, dbQuery, markEmailVerified, sessionCookie, uniqueEmail } from "./helpers";

const withId = (handler: (req: never, ctx: { params: Promise<{ id: string }> }) => Promise<Response>, id: string) =>
  ((req: never) => handler(req, { params: Promise.resolve({ id }) })) as Parameters<typeof call>[0];

/*
 * Справжня база (Supabase) поводиться як вбудована з FC_NO_SEED=1: порожня
 * таблиця товарів НЕ заповнюється демонстраційним каталогом — власник видалив
 * тестові товари, і вони не повинні повернутись самі.
 */
process.env.FC_NO_SEED = "1";
const OWNER = "empty-owner@example.com";
process.env.ADMIN_EMAILS = OWNER;

describe("порожній магазин", () => {
  it("каталог лишається порожнім, демонстраційні товари не з'являються", async () => {
    expect(await loadCatalog()).toEqual([]);
    expect(await loadCatalog()).toEqual([]);
  });

  it("адреси товарів — порожній список, а не початковий каталог (справжній 404)", async () => {
    const urls = await productUrls();
    expect(urls).not.toBeNull();
    expect(urls!.size).toBe(0);
  });

  it("адмінка показує порожній список і дозволяє додати перший товар", async () => {
    const cookie = sessionCookie((await call(register.POST, { body: { firstName: "Власниця", email: OWNER, phone: "", password: "camping2026" } })).res);
    await markEmailVerified(OWNER);
    expect((await call(adminProducts.GET, { method: "GET", cookie })).data.products).toEqual([]);
    const created = await call(adminProducts.POST, {
      cookie,
      body: { name: "Намет Справжній 4", brand: "Ranger", category: "tents", price: 5000, stock: 3, specs: "4 місця", photo: "meadow", attrs: [] },
    });
    expect(created.status).toBe(201);
    expect((await loadCatalog()).map((p) => p.name)).toEqual(["Намет Справжній 4"]);
  });

  it("видалення товару: лише адміністратор, і не якщо він уже є в замовленнях", async () => {
    const cookie = sessionCookie((await call(login.POST, { body: { email: OWNER, password: "camping2026" } })).res);
    const customer = sessionCookie((await call(register.POST, { body: { firstName: "Покупець", email: uniqueEmail(), phone: "", password: "camping2026" } })).res);
    const make = async (name: string) =>
      (await call(adminProducts.POST, { cookie, body: { name, brand: "Ranger", category: "tents", price: 4000, stock: 2, specs: "2 місця", photo: "meadow", attrs: [] } })).data.product.id as string;
    const del = (id: string, c = cookie) => call(withId(productItem.DELETE, id), { method: "DELETE", cookie: c });

    const id = await make("Намет Видалити 2");
    expect((await del(id, customer)).status).toBe(403);
    expect((await del(id)).status).toBe(200);
    expect((await loadCatalog()).some((p) => p.id === id)).toBe(false);
    expect((await del(id)).status).toBe(404);

    const ordered = await make("Намет Замовлений 3");
    await dbQuery(
      `insert into orders (number, subtotal, total, delivery_method, payment, first_name, last_name, phone)
       values ('FC-0000001', 4000, 4000, 'np-branch', 'invoice', 'Тест', 'Тест', '+380000000000')`,
    );
    await dbQuery("insert into order_items (order_number, product_id, name, price, qty) values ('FC-0000001', $1, 'Намет', 4000, 1)", [ordered]);
    const r = await del(ordered);
    expect(r.status).toBe(409);
    expect(r.data.error).toContain("приховати");
  });
});
