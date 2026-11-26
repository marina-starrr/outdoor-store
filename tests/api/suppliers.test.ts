import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as productItem from "../../app/api/admin/products/[id]/route";
import * as supplierItem from "../../app/api/admin/suppliers/[id]/route";
import * as supplierSync from "../../app/api/admin/suppliers/[id]/sync/route";
import * as suppliers from "../../app/api/admin/suppliers/route";
import * as register from "../../app/api/auth/register/route";
import * as cron from "../../app/api/cron/orders/route";
import * as suppliersCron from "../../app/api/cron/suppliers/route";
import { NextRequest } from "next/server";
import { cartTotals } from "../../app/components/cart-logic";
import { loadCatalog } from "../../app/lib/server/catalog";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { brandFromName, categoryFromName, cleanDescription, parseFeed, suggestCategory } from "../../app/lib/server/suppliers";
import { copySupplierPhotos } from "../../app/lib/server/supplier-photos";
import { call, dbQuery, markEmailVerified, sessionCookie, uniqueEmail } from "./helpers";

/* Імпорт з YML-файлів постачальників. Сайт постачальника в тестах не викликається — fetch підмінено */

process.env.FC_NO_SEED = "1";
const OWNER = "suppliers-owner@example.com";
process.env.ADMIN_EMAILS = OWNER;
const FEED_URL = "https://supplier.example/feed.xml";

type Offer = { id: string; name?: string; nameUa?: string; price: number; stock: number; available?: boolean; cat: string; pics?: number; desc?: string; vendor?: string };
const yml = (offers: Offer[]) => `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="2026-11-20 08:28"><shop><name>Ranger</name>
<categories>
  <category id="1">Складані крісла</category>
  <category id="7">Намети та парасолі</category>
  <category id="18">Військове спорядження</category>
  <category id="999">Ranger</category>
</categories>
<offers>${offers.map((o) => `
  <offer id="${o.id}" available="${o.available ?? o.stock > 0}">
    <barcode>${o.id}</barcode><stock_quantity>${o.stock}</stock_quantity><price>${o.price}</price>
    <currencyId>UAH</currencyId><categoryId>${o.cat}</categoryId>
    ${Array.from({ length: o.pics ?? 2 }, (_, i) => `<picture>https://supplier.example/img/${o.id}-${i}.jpeg</picture>`).join("")}
    <vendor>${o.vendor ?? "Ranger"}</vendor>
    <name>${o.name ?? `Палатка ${o.id}`}</name>
    <name_ua>${o.nameUa ?? `Намет ${o.id}`}</name_ua>
    <description><![CDATA[Русское описание]]></description>
    <description_ua><![CDATA[${o.desc ?? "Опис українською."}]]></description_ua>
  </offer>`).join("")}
</offers></shop></yml_catalog>`;

let feed = "";
function serveFeed(xml: string | null, status = 200) {
  feed = xml ?? "";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url !== FEED_URL) throw new Error(`неочікуваний запит ${url}`);
    if (xml === null) throw new Error("network");
    return new Response(feed, { status });
  }));
}
afterEach(() => vi.unstubAllGlobals());

const withId = <P extends Record<string, string>>(handler: (req: never, ctx: { params: Promise<P> }) => Promise<Response>, params: P) =>
  ((req: never) => handler(req, { params: Promise.resolve(params) })) as Parameters<typeof call>[0];

let admin = "";
beforeAll(async () => {
  admin = sessionCookie((await call(register.POST, { body: { firstName: "Власниця", email: OWNER, phone: "", password: "camping2026" } })).res);
  await markEmailVerified(OWNER);
});

const create = async (offers: Offer[]) => {
  serveFeed(yml(offers));
  const r = await call(suppliers.POST, { cookie: admin, body: { name: "Ranger", feedUrl: FEED_URL } });
  expect(r.status).toBe(201);
  return r.data.supplier as { id: string; categoryMap: Record<string, string>; feedCategories: { id: string; inStock: number }[] };
};
const sync = (id: string) => call(withId(supplierSync.POST, { id }), { cookie: admin });
const bySku = async (sku: string) => (await dbQuery("select * from products where supplier_sku = $1", [sku]))[0];

describe("читання файлу постачальника", () => {
  it("українська назва, а якщо її немає — з основної; опис без HTML; ціна й залишок", () => {
    const f = parseFeed(yml([
      { id: "A1", nameUa: "Назва товару (укр) не знайдено", name: "Стул Ranger", price: 599, stock: 30, cat: "1", desc: "<p>Перший&nbsp;абзац.</p><p>Другий<br>рядок</p>" },
      { id: "A2", price: 1099, stock: 0, available: false, cat: "7" },
      { id: "A3", price: 100, stock: 5, available: false, cat: "7" },
    ]));
    expect(f.offers[0]).toMatchObject({ sku: "A1", name: "Стул Ranger", price: 599, stock: 30, categoryId: "1", vendor: "Ranger" });
    expect(f.offers[0].description).toBe("Перший абзац.\n\nДругий\nрядок");
    expect(f.offers[0].pictures).toHaveLength(2);
    expect(f.offers[2].stock).toBe(0); // available="false" — немає, хоч і стоїть кількість
    expect(f.categories.find((c) => c.id === "1")).toEqual({ id: "1", name: "Складані крісла", inStock: 1 });
  });

  it("ціна точно як РРЦ, з копійками; заглушка 0.01 — як товару немає", () => {
    const f = parseFeed(yml([
      { id: "GL8156", price: 1236.9, stock: 3, cat: "1" },
      { id: "RA8822", price: 437.5, stock: 0, available: false, cat: "1" },
      { id: "KI953", price: 0.01, stock: 0, available: false, cat: "1" },
    ]));
    expect(f.offers.map((o) => [o.sku, o.price])).toEqual([["GL8156", 1236.9], ["RA8822", 437.5]]);
  });

  it("не YML або без товарів — зрозуміла помилка", () => {
    expect(() => parseFeed("<html><body>hi</body></html>")).toThrow(/YML/);
    expect(() => parseFeed(yml([]))).toThrow(/немає жодного товару/);
    expect(cleanDescription("  a  <b>b</b>  ")).toBe("a b");
  });

  it("підказки категорій за назвою", () => {
    expect(suggestCategory("Складані крісла")).toBe("furniture");
    expect(suggestCategory("Намети та парасолі")).toBe("tents");
    expect(suggestCategory("Військове спорядження")).toBe("tactical");
    expect(suggestCategory("Термоси та термокухлі")).toBe("thermos");
    expect(suggestCategory("Набори для пікніка та термосумки")).toBe("picnic");
    expect(suggestCategory("Спальні мішки та коврики")).toBe("sleeping-bags");
    expect(suggestCategory("Складані столи")).toBe("furniture");
    expect(suggestCategory("Гойдалки садові тенти, гамаки")).toBe("hammocks");
    expect(suggestCategory("Ranger")).toBe("");
    // Збірна категорія з назвою самого постачальника — за назвою товару
    expect(suggestCategory("Ranger", "Ranger")).toBe("auto");
  });

  it("категорії з деревом: назва — шлях від кореня; фото з пробілом у назві файлу не губиться", () => {
    const f = parseFeed(`<?xml version="1.0" encoding="utf-8"?><yml_catalog><shop><categories>
      <category id="10">Намети</category>
      <category id="11" parentId="10">Naturehike намети</category>
      <category id="12" parentId="11">Двомісні</category>
      <category id="13" parentId="13">Сам собі батько</category>
    </categories><offers>
      <offer id="NH1" available="true"><price>4250</price><categoryId>12</categoryId>
        <picture>https://atlantmarket.example/upload/ganzo g203.jpg</picture><name>Намет Naturehike Cloud Up 2</name></offer>
    </offers></shop></yml_catalog>`);
    expect(f.categories.find((c) => c.id === "12")).toEqual({ id: "12", name: "Намети > Naturehike намети > Двомісні", inStock: 1 });
    expect(f.categories.find((c) => c.id === "13")!.name).toBe("Сам собі батько");
    expect(f.offers[0].pictures).toEqual(["https://atlantmarket.example/upload/ganzo%20g203.jpg"]);
    // Без кількості у файлі, але в наявності — є
    expect(f.offers[0].stock).toBeGreaterThan(0);
  });

  it("підказки для категорій з шляхом (Atlantmarket): потрібне — у наші, ножі й решта — не імпортувати", () => {
    expect(suggestCategory("Намети > Naturehike намети > Двомісні")).toBe("tents");
    // Кілки, стійки, підстилки — у «Туристичні аксесуари»
    expect(suggestCategory("Намети > Naturehike намети > Аксесуари")).toBe("accessories");
    expect(suggestCategory("Туристичне спорядження > Naturehike спальні мішки > Зимові")).toBe("sleeping-bags");
    expect(suggestCategory("Туристичне спорядження > Naturehike матраци")).toBe("sleeping-bags");
    expect(suggestCategory("Туристичне спорядження > Naturehike трекінгові палиці")).toBe("accessories");
    expect(suggestCategory("Ліхтарі > Fenix ліхтарі > Тактичні ліхтарі Fenix")).toBe("lighting");
    expect(suggestCategory("Пальники та обладнання > Газові лампи > BRS газові лампи")).toBe("lighting");
    expect(suggestCategory("Пальники та обладнання > Газові пальники > BRS газові пальники")).toBe("cookware");
    expect(suggestCategory("Термопродукція > Акумулятори холоду > Quest акумулятори холоду")).toBe("picnic");
    expect(suggestCategory("Зарядні пристрої > Повербанки Litheli")).toBe("electronics");
    expect(suggestCategory("Меблі > Naturehike меблі > Столи")).toBe("furniture");
    expect(suggestCategory("Одяг > DexShell шкарпетки")).toBe("clothing");
    expect(suggestCategory("Мультитули > Ganzo мультитули")).toBe("accessories");
    for (const skip of [
      "Ножі > Ruike ножі > Класичні ножі Ruike",
      "Ножі > Civivi аксесуари до ножів",
      "Перцеві балончики > Терен перцеві балончики",
      "Масла і мастила Brunox > Мастила для зброї Brunox",
      "Точильні системи > Ganzo точила і каміння",
      "Техніка > Садові інструменти",
      "Ліхтарі > Ел живлення та зарядні пристрої",
      "Ліхтарі > Fenix аксесуари",
      "Ліхтарі > Fenix ліхтарі > Велофари Fenix",
      "Тактичне спорядження > Nextorch аксесуари",
    ])
      expect(suggestCategory(skip), skip).toBe("");
    // Одна категорія без шляху — як раніше
    expect(suggestCategory("Рації")).toBe("electronics");
    expect(suggestCategory("Тактичні аксесуари")).toBe("tactical");
  });

  it("категорія за назвою товару (для збірних категорій)", () => {
    expect(categoryFromName("Котушка GLADIATOR AGIX 2000 5+1 (GL6781)")).toBe("fishing");
    expect(categoryFromName("Вудка карбонова Mikado Princess без кілець 4м Carbon (GL5835)")).toBe("fishing");
    expect(categoryFromName("Плитоноска з швидкоскидом кордура Kirasa піксель (Арт.KI1043)")).toBe("tactical");
    expect(categoryFromName("Кобура на стегно для ПМ кордура Kirasa чорна(Арт.KI282)")).toBe("tactical");
    expect(categoryFromName("М'яка підкладка на плече під ремінь АК, Cordura 500, олива (LE3095)")).toBe("tactical");
    expect(categoryFromName("Power Bank Aspor A381 Magnetic Wireless 5000mAh (Type-C/20W)- синій (900153)")).toBe("electronics");
    expect(categoryFromName("Коропова розкладачка Ranger BED 84")).toBe("furniture");
    expect(categoryFromName("Термосумка Ranger 15L Brown")).toBe("picnic");
    expect(categoryFromName("Щось зовсім незрозуміле")).toBeUndefined();
  });

  it("бренд з назви, коли постачальник вказав себе", () => {
    expect(brandFromName("Котушка GLADIATOR AGIX 2000 5+1", "Ranger", "Ranger")).toBe("Gladiator");
    expect(brandFromName("Вудка карбонова Mikado Princess без кілець 4м", "Ranger", "Ranger")).toBe("Mikado");
    expect(brandFromName("Вудка River Sport Storm без кілець 4м", "Ranger", "Ranger")).toBe("River Sport");
    expect(brandFromName("Термосумка YODO 8L Brown", "Ranger", "Ranger")).toBe("YODO");
    // Ranger у назві — його бренд; бренду немає — лишається постачальник; vendor інший — vendor
    expect(brandFromName("Термосумка Ranger 15L Brown", "Ranger", "Ranger")).toBe("Ranger");
    expect(brandFromName("Котушка 801", "Ranger", "Ranger")).toBe("Ranger");
    expect(brandFromName("Плитоноска Kirasa", "Kirasa", "Ranger")).toBe("Kirasa");
  });
});

describe("постачальники в адмін-панелі", () => {
  it("лише адміністратор; невірне посилання чи недоступний файл — помилка без запису", async () => {
    const customer = sessionCookie((await call(register.POST, { body: { firstName: "Покупець", email: uniqueEmail(), phone: "", password: "camping2026" } })).res);
    expect((await call(suppliers.GET, { method: "GET", cookie: customer })).status).toBe(403);
    expect((await call(suppliers.POST, { cookie: admin, body: { name: "X", feedUrl: "http://insecure.example/feed.xml" } })).status).toBe(400);
    serveFeed(null);
    const r = await call(suppliers.POST, { cookie: admin, body: { name: "Офлайн", feedUrl: FEED_URL } });
    expect(r.status).toBe(400);
    expect(r.data.error).toContain("Не вдалося завантажити");
    expect((await call(suppliers.GET, { method: "GET", cookie: admin })).data.suppliers.some((s: { name: string }) => s.name === "Офлайн")).toBe(false);
  });

  it("імпорт: лише в наявності, з фото й зіставленою категорією; ціна — з файлу (РРЦ)", async () => {
    const s = await create([
      { id: "RA2256", nameUa: "Крісло складане Ranger Tourist (Арт. RA 2256)", price: 399, stock: 30, cat: "1" },
      { id: "RA6667", price: 1099, stock: 0, cat: "7" },
      { id: "RA7001", price: 2999, stock: 4, cat: "7", pics: 0 },
      { id: "RA7002", price: 4999, stock: 2, cat: "7" },
      { id: "GL9374", price: 1299, stock: 4, cat: "999" },
    ]);
    // Підказки: крісла → меблі, намети → намети; збірна «Ranger» (назва постачальника) — за назвою товару
    expect(s.categoryMap).toMatchObject({ "1": "furniture", "7": "tents", "18": "tactical", "999": "auto" });

    const r = await sync(s.id);
    expect(r.status).toBe(200);
    // GL9374 зі збірної категорії — «Намет GL9374» → намети
    expect(r.data.result).toEqual({ created: 4, updated: 0, outOfStock: 0, noPhoto: 1, skippedUnmapped: 0, skippedNotInStock: 1 });
    expect(r.data.supplier.products).toBe(4);
    expect((await bySku("GL9374")).category).toBe("tents");
    // Без фото — заглушка «Фото скоро», а не чуже стокове фото
    expect((await bySku("RA7001")).images).toEqual(["/photo-soon.svg"]);
    expect(r.data.supplier.lastSyncOk).toBe(true);

    const chair = (await loadCatalog()).find((p) => p.name.startsWith("Крісло складане Ranger Tourist"))!;
    // Код в адресі — з назви (до 40 символів)
    expect(chair.id).toMatch(/^krislo-skladane-ranger-tourist/);
    expect(chair.id.length).toBeLessThanOrEqual(40);
    expect(chair).toMatchObject({ category: "furniture", price: 399, stock: 30, brand: "Ranger", description: "Опис українською." });
    expect(chair.images).toEqual(["https://supplier.example/img/RA2256-0.jpeg", "https://supplier.example/img/RA2256-1.jpeg"]);
    expect(chair.image).toBe(chair.images![0]);
    expect(chair.attrs).toContainEqual(["Артикул", "RA2256"]);
  });

  it("щоденне оновлення змінює лише ціну й залишок; правки власника лишаються", async () => {
    const s = await create([
      { id: "UP1", price: 500, stock: 10, cat: "7" },
      { id: "UP2", price: 800, stock: 3, cat: "7" },
      { id: "UP3", price: 900, stock: 2, cat: "7" },
    ]);
    await sync(s.id);
    const up1 = await bySku("UP1");
    // Власниця перейменувала товар в адмінці
    const renamed = await call(withId(productItem.PATCH, { id: up1.id }), {
      method: "PATCH",
      cookie: admin,
      body: { name: "Намет для всієї родини", brand: "Ranger", category: "tents", price: 500, stock: 10, specs: "4 місця", photo: "meadow", images: up1.images, attrs: [] },
    });
    expect(renamed.status).toBe(200);

    // Новий файл: UP1 подорожчав, UP2 закінчився, UP3 зник, UP4 з'явився
    serveFeed(yml([
      { id: "UP1", price: 550, stock: 7, cat: "7" },
      { id: "UP2", price: 800, stock: 0, cat: "7" },
      { id: "UP4", price: 300, stock: 1, cat: "7" },
    ]));
    const r = await sync(s.id);
    expect(r.data.result).toMatchObject({ created: 1, updated: 1, outOfStock: 2 });
    expect(await bySku("UP1")).toMatchObject({ name: "Намет для всієї родини", stock: 7 });
    expect(Number((await bySku("UP1")).price)).toBe(550);
    expect((await bySku("UP2")).stock).toBe(0);
    expect((await bySku("UP3")).stock).toBe(0);
    expect((await bySku("UP4")).stock).toBe(1);

    // Повторне оновлення без змін — нічого не робить
    expect((await sync(s.id)).data.result).toMatchObject({ created: 0, updated: 0, outOfStock: 0 });
  });

  it("заглушку замінюють фото, щойно постачальник їх додав; власні фото власника не чіпаються", async () => {
    const s = await create([{ id: "PH1", price: 100, stock: 3, cat: "7", pics: 0 }, { id: "PH2", price: 100, stock: 3, cat: "7", pics: 0 }]);
    await sync(s.id);
    // Власниця сама завантажила фото для PH2
    await dbQuery("update products set images = $2::jsonb where supplier_sku = $1", ["PH2", JSON.stringify(["/api/uploads/own-photo-1600.webp"])]);
    serveFeed(yml([{ id: "PH1", price: 100, stock: 3, cat: "7", pics: 2 }, { id: "PH2", price: 100, stock: 3, cat: "7", pics: 2 }]));
    expect((await sync(s.id)).data.supplier.lastSyncMessage).toContain("з'явились фото — 1");
    const ph1 = await bySku("PH1");
    expect(ph1.images).toEqual(["https://supplier.example/img/PH1-0.jpeg", "https://supplier.example/img/PH1-1.jpeg"]);
    expect(ph1.image).toBe("https://supplier.example/img/PH1-0.jpeg");
    expect((await bySku("PH2")).images).toEqual(["/api/uploads/own-photo-1600.webp"]);
  });

  it("правило Ranger: чужий бренд і залишок 1 — «під замовлення» (лише коли увімкнено)", async () => {
    const offers: Offer[] = [
      { id: "KI1", price: 2900, stock: 1, cat: "18", vendor: "Kirasa" },
      { id: "RA1", price: 500, stock: 1, cat: "18", vendor: "Ranger" },
      { id: "KI2", price: 300, stock: 5, cat: "18", vendor: "Kirasa" },
    ];
    const s = await create(offers);
    expect(s).toMatchObject({ otherBrandsOnRequest: false });
    await sync(s.id);
    expect((await bySku("KI1")).on_request).toBe(false);

    const r = await call(withId(supplierItem.PATCH, { id: s.id }), { method: "PATCH", cookie: admin, body: { otherBrandsOnRequest: true } });
    expect(r.data.supplier.otherBrandsOnRequest).toBe(true);
    await sync(s.id);
    expect((await bySku("KI1")).on_request).toBe(true); // чужий бренд, 1 шт.
    expect((await bySku("RA1")).on_request).toBe(false); // свій бренд — 1 шт. справді одна
    expect((await bySku("KI2")).on_request).toBe(false); // реальний залишок 5

    // Постачальник показав точну кількість — позначка знімається
    serveFeed(yml([{ ...offers[0], stock: 4 }, offers[1], offers[2]]));
    await sync(s.id);
    expect((await bySku("KI1"))).toMatchObject({ on_request: false, stock: 4 });
  });

  it("умови відправки: за замовчуванням як раніше; змінюються в адмінці; Atlantmarket — одразу з договору", async () => {
    const s = await create([{ id: "TERM1", price: 100, stock: 1, cat: "7" }]);
    expect(s).toMatchObject({ codAllowed: true, novaPoshtaOnly: false, dispatchDays: 0 });
    const patch = (body: unknown) => call(withId(supplierItem.PATCH, { id: s.id }), { method: "PATCH", cookie: admin, body });
    const r = await patch({ codAllowed: false, novaPoshtaOnly: true, dispatchDays: 2 });
    expect(r.data.supplier).toMatchObject({ codAllowed: false, novaPoshtaOnly: true, dispatchDays: 2 });
    expect((await patch({ dispatchDays: 99 })).status).toBe(400);
    expect((await patch({ dispatchDays: 1.5 })).status).toBe(400);
    // Зміна категорій не чіпає умов
    expect((await patch({ categoryMap: { "7": "tents" } })).data.supplier).toMatchObject({ codAllowed: false, dispatchDays: 2 });

    const atlantUrl = "https://atlantmarket.com.ua/price1/prom/atlantmarketprom(false).xml";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(yml([{ id: "AT1", price: 100, stock: 1, cat: "7" }]))));
    const created = await call(suppliers.POST, { cookie: admin, body: { name: "Atlantmarket", feedUrl: atlantUrl } });
    expect(created.status).toBe(201);
    expect(created.data.supplier).toMatchObject({ codAllowed: false, novaPoshtaOnly: true, dispatchDays: 3 });
    // Прибираємо: щогодинні тести нижче оновлюють усіх постачальників з тестового FEED_URL
    await call(withId(supplierItem.DELETE, { id: created.data.supplier.id }), { method: "DELETE", cookie: admin });
  });

  it("товар знову в наявності — сповіщення підписникам", async () => {
    const s = await create([{ id: "BACK1", price: 700, stock: 5, cat: "7" }]);
    await sync(s.id);
    serveFeed(yml([{ id: "BACK1", price: 700, stock: 0, cat: "7" }]));
    await sync(s.id);
    const product = await bySku("BACK1");
    const [user] = await dbQuery("select id from users where email = $1", [OWNER]);
    await dbQuery("insert into stock_alerts (user_id, product_id) values ($1, $2)", [user.id, product.id]);
    serveFeed(yml([{ id: "BACK1", price: 700, stock: 3, cat: "7" }]));
    await sync(s.id);
    const notes = await dbQuery("select title from notifications where user_id = $1 and kind = 'stock'", [user.id]);
    expect(notes.map((n) => n.title)).toContainEqual(expect.stringContaining("знову в наявності"));
  });

  it("категорії: зберігаються лише наші справжні; нова відповідність діє для нових товарів", async () => {
    const s = await create([{ id: "F1", price: 1299, stock: 4, cat: "999" }]);
    const r = await call(withId(supplierItem.PATCH, { id: s.id }), { method: "PATCH", cookie: admin, body: { categoryMap: { "999": "fishing", "7": "не-категорія" } } });
    expect(r.data.supplier.categoryMap["999"]).toBe("fishing");
    expect(r.data.supplier.categoryMap["7"]).toBeUndefined();
    expect((await sync(s.id)).data.result.created).toBe(1);
    expect((await bySku("F1")).category).toBe("fishing");
  });

  it("бренд з назви: новим — одразу, доданим раніше — при оновленні (якщо власник не міняв бренд)", async () => {
    const s = await create([
      { id: "GLB1", nameUa: "Котушка GLADIATOR AGIX 2000 5+1 (GLB1)", price: 900, stock: 3, cat: "1" },
      { id: "GLB2", nameUa: "Котушка SADEI HO3000 BLUE (GLB2)", price: 700, stock: 3, cat: "1" },
      { id: "GLB3", nameUa: "Вудка Mikado Princess 5м (GLB3)", price: 800, stock: 3, cat: "1" },
    ]);
    await sync(s.id);
    expect(await bySku("GLB1")).toMatchObject({ brand: "Gladiator", specs: "Gladiator · арт. GLB1" });
    expect((await bySku("GLB1")).attrs).toContainEqual(["Бренд", "Gladiator"]);

    // Як було до виправлення: бренд Ranger; у GLB3 власниця сама вказала бренд
    await dbQuery("update products set brand = 'Ranger', specs = 'Ranger · арт. GLB2', attrs = '[[\"Бренд\",\"Ranger\"],[\"Артикул\",\"GLB2\"]]'::jsonb where supplier_sku = 'GLB2'");
    await dbQuery("update products set brand = 'Mikado Japan' where supplier_sku = 'GLB3'");
    const r = await sync(s.id);
    expect(r.data.supplier.lastSyncMessage).toContain("бренд з назви — 1");
    expect(await bySku("GLB2")).toMatchObject({ brand: "Sadei", specs: "Sadei · арт. GLB2" });
    expect((await bySku("GLB2")).attrs).toContainEqual(["Бренд", "Sadei"]);
    expect((await bySku("GLB3")).brand).toBe("Mikado Japan");
  });

  it("збірна категорія «за назвою товару»: нерозпізнані не імпортуються", async () => {
    const s = await create([
      { id: "AU1", nameUa: "Котушка GLADIATOR DINGO 3000 (AU1)", price: 600, stock: 2, cat: "999" },
      { id: "AU2", nameUa: "Плитоноска тактична кордура Kirasa піксель (AU2)", price: 3000, stock: 2, cat: "999", vendor: "Kirasa" },
      { id: "AU3", nameUa: "Щось незрозуміле (AU3)", price: 100, stock: 2, cat: "999" },
    ]);
    expect(s.categoryMap["999"]).toBe("auto");
    expect((await sync(s.id)).data.result).toMatchObject({ created: 2, skippedUnmapped: 1 });
    expect((await bySku("AU1")).category).toBe("fishing");
    expect((await bySku("AU2")).category).toBe("tactical");
    // У адмінці «За назвою товару» можна обрати вручну
    const r = await call(withId(supplierItem.PATCH, { id: s.id }), { method: "PATCH", cookie: admin, body: { categoryMap: { "7": "auto" } } });
    expect(r.data.supplier.categoryMap["7"]).toBe("auto");
  });

  it("фото постачальника копіюються в наше сховище (1600 і 800 px), власні фото не чіпаються", async () => {
    const jpeg = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#3a6" } }).jpeg().toBuffer();
    const s = await create([{ id: "CP1", price: 100, stock: 3, cat: "7", pics: 2 }, { id: "CP2", price: 100, stock: 3, cat: "7", pics: 1 }]);
    await sync(s.id);
    await dbQuery("update products set images = $2::jsonb where supplier_sku = $1", ["CP2", JSON.stringify(["/api/uploads/own-photo-1600.webp"])]);
    // Друге фото CP1 недоступне — лишається з адресою постачальника
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.endsWith("CP1-1.jpeg") ? new Response("no", { status: 404 }) : new Response(jpeg))));
    const result = await copySupplierPhotos(Date.now() + 30_000);
    expect(result.photos).toBeGreaterThanOrEqual(1);
    const cp1 = await bySku("CP1");
    expect(cp1.images[0]).toMatch(/^\/api\/uploads\/sp-[0-9a-f]{24}-1600\.webp$/);
    expect(cp1.images[1]).toBe("https://supplier.example/img/CP1-1.jpeg");
    expect((await bySku("CP2")).images).toEqual(["/api/uploads/own-photo-1600.webp"]);

    // Файли справді є: велика копія 1600 px, мала — 800 px
    const uploaded = (name: string) => readFileSync(join(process.env.FC_DATA_DIR!, "uploads", name));
    const file = cp1.images[0].split("/").pop()!;
    const big = await sharp(uploaded(file)).metadata();
    expect([big.width, big.format]).toEqual([1600, "webp"]);
    const small = await sharp(uploaded(file.replace("-1600", "-800"))).metadata();
    expect(small.width).toBe(800);

    // Повторний запуск нічого не ламає (уже скопійоване не копіюється)
    const again = await copySupplierPhotos(Date.now() + 30_000);
    expect((await bySku("CP1")).images[0]).toBe(cp1.images[0]);
    expect(again.photos).toBe(0);
  });

  it("файл недоступний — помилка видна в адмінці, товари не змінюються", async () => {
    const s = await create([{ id: "ERR1", price: 100, stock: 1, cat: "7" }]);
    await sync(s.id);
    serveFeed("oops", 500);
    const r = await sync(s.id);
    expect(r.status).toBe(502);
    expect(r.data.error).toContain("500");
    expect(r.data.supplier).toMatchObject({ lastSyncOk: false, lastSyncMessage: expect.stringContaining("500") });
    expect((await bySku("ERR1")).stock).toBe(1);
  });

  it("видалення постачальника лишає товари на сайті", async () => {
    const s = await create([{ id: "DEL1", price: 100, stock: 1, cat: "7" }]);
    await sync(s.id);
    expect((await call(withId(supplierItem.DELETE, { id: s.id }), { method: "DELETE", cookie: admin })).status).toBe(200);
    expect(await bySku("DEL1")).toMatchObject({ supplier_id: null, stock: 1 });
  });

  it("щоденний cron оновлює всіх постачальників (лише з секретом)", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    serveFeed(yml([{ id: "CRON1", price: 100, stock: 1, cat: "7" }]));
    expect((await call(cron.GET, { method: "GET" })).status).toBe(401);
    const res = await cron.GET(new (await import("next/server")).NextRequest("http://localhost/api/cron/orders", { headers: { authorization: "Bearer test-cron-secret" } }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.suppliers.Ranger).toBeDefined();
    delete process.env.CRON_SECRET;
  });

  it("щогодинний маршрут: лише з секретом, оновлює ціни й залишки, збій постачальника → 502", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const s = await create([{ id: "HOUR1", price: 100, stock: 3, cat: "7" }]);
    await sync(s.id);
    const hourly = (auth?: string) =>
      suppliersCron.GET(new NextRequest("http://localhost/api/cron/suppliers", { headers: auth ? { authorization: auth } : {} }));
    expect((await hourly()).status).toBe(401);
    expect((await hourly("Bearer wrong")).status).toBe(401);

    serveFeed(yml([{ id: "HOUR1", price: 120, stock: 1, cat: "7" }]));
    const ok = await hourly("Bearer test-cron-secret");
    expect(ok.status).toBe(200);
    expect(await bySku("HOUR1")).toMatchObject({ stock: 1 });
    expect(Number((await bySku("HOUR1")).price)).toBe(120);

    serveFeed("oops", 500);
    const bad = await hourly("Bearer test-cron-secret");
    expect(bad.status).toBe(502);
    expect((await bad.json()).ok).toBe(false);
    delete process.env.CRON_SECRET;
  });

  it("ціна товару постачальника — РРЦ: в адмінці не змінити, промокод на неї не діє", async () => {
    const s = await create([{ id: "RRP1", price: 1000, stock: 5, cat: "7" }]);
    await sync(s.id);
    const row = await bySku("RRP1");
    const patch = (body: unknown) =>
      call(withId(productItem.PATCH, { id: row.id as string }), { method: "PATCH", cookie: admin, body });
    const lower = await patch({ price: 900 });
    expect(lower.status).toBe(400);
    expect(lower.data.errors.price).toContain("РРЦ");
    expect(Number((await bySku("RRP1")).price)).toBe(1000);
    // Залишок і інші поля — можна
    expect((await patch({ stock: 4 })).status).toBe(200);

    const product = (await loadCatalog()).find((p) => p.id === row.id)!;
    expect(product.fixedPrice).toBe(true);
    const totals = cartTotals([{ id: product.id, product, qty: 2 }], "np-branch", "FAMILY10");
    expect(totals.promoDiscount).toBe(0);
    expect(totals.promoExcluded).toBe(true);
    expect(totals.total).toBe(2000);
  });
});
