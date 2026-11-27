import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import * as certificates from "../../app/api/admin/certificates/route";
import * as register from "../../app/api/auth/register/route";
import * as orders from "../../app/api/orders/route";
import * as served from "../../app/api/uploads/[name]/route";
import { seedProducts, withDerived, type Product } from "../../app/components/catalog-data";
import { isListed } from "../../app/lib/certificates";
import { knownProductIds } from "../../app/lib/server/auth";
import { insertProduct, loadCatalog } from "../../app/lib/server/catalog";
import { productUrls, resetProductUrls } from "../../app/lib/server/product-urls";
import { ORIGIN, call, dbQuery, markEmailVerified, sessionCookie, uniqueEmail } from "./helpers";

/*
 * Сертифікати на ножі: ніж без висновку експерта («не є холодною зброєю») покупці
 * не бачать і купити не можуть; документ завантажує адміністратор
 */

const ADMIN_EMAIL = "cert-owner@example.com";
process.env.ADMIN_EMAILS = ADMIN_EMAIL;

const pdf = (n = 64) => new Uint8Array([...Buffer.from("%PDF-1.7\n"), ...new Array(n).fill(32)]);
const webp = () => new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8 "), ...new Array(64).fill(7)]);

const base = seedProducts.map(withDerived).filter((p) => !p.hidden)[0];
const knives = {
  green: "cert-ganzo-g618-gr",
  black: "cert-ganzo-g618-bk",
  other: "cert-firebird-fh925",
  sheath: "cert-chokhol-ganzo",
  stone: "cert-kamin",
};

async function addKnife(id: string, name: string) {
  const p: Product = withDerived({ ...base, id, name, category: "knives", stock: 5, inStock: true, popularity: 950, attrs: [["Бренд", "Ganzo"]] });
  await insertProduct({ query: (text: string, params?: unknown[]) => dbQuery(text, params) } as never, p);
}

function upload(file: Uint8Array | null, ids: string[], cookie?: string) {
  const form = new FormData();
  if (file) form.append("file", new Blob([new Uint8Array(file)]), "Ganzo G618.pdf");
  for (const id of ids) form.append("id", id);
  const headers = new Headers({ host: new URL(ORIGIN).host, origin: ORIGIN });
  if (cookie) headers.set("cookie", cookie);
  return certificates.POST(new NextRequest(`${ORIGIN}/api/admin/certificates`, { method: "POST", headers, body: form }));
}

const patch = (body: unknown, cookie: string) => call(certificates.PATCH, { method: "PATCH", body, cookie });
const serve = (name: string) => served.GET(new NextRequest(`${ORIGIN}/api/uploads/${name}`), { params: Promise.resolve({ name }) });
const ALL = [...Object.values(knives), base.id];
const product = async (id: string) => (await loadCatalog()).find((p) => p.id === id)!;
const visibleUrl = async (id: string) => {
  resetProductUrls();
  return (await productUrls())!.has(`knives/${id}`);
};

let admin = "";
let customer = "";

beforeAll(async () => {
  await loadCatalog();
  await addKnife(knives.green, "Ніж складаний Ganzo G618-GR зелений");
  await addKnife(knives.black, "Ніж складаний Ganzo G618-BK чорний");
  await addKnife(knives.other, "Ніж складаний Firebird FH925-BK");
  await addKnife(knives.sheath, "Чохол для ножа Ganzo нейлоновий");
  await addKnife(knives.stone, "Точильний камінь Ganzo 400/1000");
  admin = sessionCookie((await call(register.POST, { body: { firstName: "Власник", email: ADMIN_EMAIL, phone: "", password: "camping2026" } })).res);
  await markEmailVerified(ADMIN_EMAIL);
  customer = sessionCookie((await call(register.POST, { body: { firstName: "Покупець", email: uniqueEmail(), phone: "", password: "camping2026" } })).res);
});

describe("ніж без сертифіката", () => {
  it("не показується покупцям: ні в каталозі, ні за адресою, ні в кошику", async () => {
    const known = await knownProductIds(ALL);
    expect(known.has(knives.green)).toBe(false);
    expect(isListed(await product(knives.green))).toBe(false);
    expect(await visibleUrl(knives.green)).toBe(false);
    // Інші товари — як раніше
    expect(known.has(base.id)).toBe(true);
  });

  it("аксесуар у «Ножах» (чохол) документа не потребує", async () => {
    expect((await knownProductIds(ALL)).has(knives.sheath)).toBe(true);
    expect(await visibleUrl(knives.sheath)).toBe(true);
  });

  it("оформити замовлення на нього не можна", async () => {
    const r = await call(orders.POST, {
      ip: "10.77.0.1",
      body: {
        lines: [{ id: knives.other, qty: 1 }],
        contact: { firstName: "Галина", lastName: "Гостьова", phone: "+380 67 765 43 21", email: "galyna@example.com" },
        delivery: { method: "np-branch", city: "Полтава", branch: "3" },
        payment: "invoice",
        agreed: true,
      },
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});

describe("завантаження сертифіката", () => {
  it("лише адміністратор", async () => {
    expect((await upload(pdf(), [knives.green])).status).toBe(401);
    expect((await upload(pdf(), [knives.green], customer)).status).toBe(403);
    expect((await patch({ id: knives.green, certificate: null }, customer)).status).toBe(403);
  });

  it("один PDF — для кількох кольорів моделі; ножі з'являються на сайті", async () => {
    const res = await upload(pdf(300), [knives.green, knives.black], admin);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.url).toMatch(/^\/api\/uploads\/cert-[a-z0-9]+-[a-f0-9]{12}\.pdf$/);
    expect(data.products.map((p: Product) => p.certificate)).toEqual([data.url, data.url]);

    const file = await serve(data.url.split("/").pop());
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("application/pdf");

    const known = await knownProductIds(ALL);
    expect(known.has(knives.green)).toBe(true);
    expect(known.has(knives.black)).toBe(true);
    expect(known.has(knives.other)).toBe(false);
    expect(await visibleUrl(knives.green)).toBe(true);
    expect((await product(knives.green)).certificate).toBe(data.url);
  });

  it("JPG-скан теж приймається", async () => {
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(64).fill(1)]);
    const res = await upload(jpg, [knives.other], admin);
    expect(res.status).toBe(200);
    expect((await res.json()).url).toMatch(/\.jpg$/);
  });

  it("не PDF/фото, завеликий файл, без товарів чи з чужим товаром — відхиляються", async () => {
    expect((await upload(webp(), [knives.green], admin)).status).toBe(400);
    expect((await upload(pdf(4_100_000), [knives.green], admin)).status).toBe(400);
    expect((await upload(pdf(), [], admin)).status).toBe(400);
    expect((await upload(null, [knives.green], admin)).status).toBe(400);
    expect((await upload(pdf(), ["nemaie-takoho"], admin)).status).toBe(404);
  });

  it("документ можна прибрати — ніж знову не показується", async () => {
    const r = await patch({ id: knives.black, certificate: null }, admin);
    expect(r.status).toBe(200);
    expect(r.data.products[0].certificate).toBeUndefined();
    expect((await knownProductIds(ALL)).has(knives.black)).toBe(false);
    expect((await patch({ id: "nemaie-takoho", certificate: null }, admin)).status).toBe(404);
    expect((await patch({ id: knives.black }, admin)).status).toBe(400);
  });

  it("«документ не потрібен» — для не-ножа в категорії «Ножі»", async () => {
    expect((await knownProductIds(ALL)).has(knives.stone)).toBe(false);
    const r = await patch({ id: knives.stone, exempt: true }, admin);
    expect(r.status).toBe(200);
    expect(r.data.products[0].certificateExempt).toBe(true);
    expect((await knownProductIds(ALL)).has(knives.stone)).toBe(true);
    await patch({ id: knives.stone, exempt: false }, admin);
    expect((await knownProductIds(ALL)).has(knives.stone)).toBe(false);
  });

  it("редагування товару в адмінці не стирає сертифікат", async () => {
    const { PATCH } = await import("../../app/api/admin/products/[id]/route");
    const r = await call((req) => PATCH(req, { params: Promise.resolve({ id: knives.green }) }), { method: "PATCH", body: { stock: 7 }, cookie: admin });
    expect(r.status).toBe(200);
    expect(r.data.product.certificate).toMatch(/\.pdf$/);
  });
});
