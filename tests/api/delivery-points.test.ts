import { describe, expect, it } from "vitest";
import * as orders from "../../app/api/orders/route";
import * as streets from "../../app/api/streets/route";
import * as warehouses from "../../app/api/warehouses/route";
import { filterWarehouses, type Warehouse } from "../../app/lib/server/novaposhta";
import { call } from "./helpers";

/*
 * Відділення Нової пошти — зі списку міста, кур'єр — вулиця зі списку + будинок,
 * Укрпошта — індекс. У тестах довідник Нової пошти підмінений (NP_CITIES_FIXTURE):
 * у кожному місті відділення №1, 2, 3, 5, 12 і поштомат №9001.
 */

const get = (handler: typeof warehouses.GET, path: string) => call(handler, { method: "GET", path, ip: "10.95.0.1" });

let ipSeq = 0;
const order = (delivery: Record<string, string>) =>
  call(orders.POST, {
    ip: `10.96.0.${++ipSeq}`,
    body: {
      lines: [{ id: "np3", qty: 1 }],
      contact: { firstName: "Ольга", lastName: "Доставка", phone: "+380 50 222 33 44", email: "olga@example.com" },
      delivery: { city: "м. Полтава, Полтавська обл.", cityRef: "ref-poltava", ...delivery },
      payment: "invoice",
      agreed: true,
    },
  });

describe("відділення Нової пошти в місті", () => {
  it("увесь список міста, від меншого номера", async () => {
    const r = await get(warehouses.GET, "/api/warehouses?cityRef=ref-poltava");
    expect(r.data.available).toBe(true);
    expect(r.data.total).toBe(6);
    expect(r.data.items.map((w: { label: string }) => w.label.split(":")[0])).toEqual([
      "Відділення №1",
      "Відділення №2",
      "Відділення №3",
      "Відділення №5",
      "Відділення №12",
      "Поштомат №9001",
    ]);
  });

  it("пошук за номером і за словом", async () => {
    const byNumber = await get(warehouses.GET, "/api/warehouses?cityRef=ref-poltava&q=%E2%84%9612");
    expect(byNumber.data.items).toEqual([{ ref: "ref-poltava-wh-12", label: "Відділення №12: вул. Тестова, 12" }]);
    const byWord = await get(warehouses.GET, `/api/warehouses?cityRef=ref-poltava&q=${encodeURIComponent("поштомат соборності")}`);
    expect(byWord.data.items.map((w: { ref: string }) => w.ref)).toEqual(["ref-poltava-pm-9001"]);
  });

  it("без міста або для населеного пункту без Нової пошти — список недоступний", async () => {
    expect((await get(warehouses.GET, "/api/warehouses")).data).toEqual({ available: false, total: 0, items: [] });
    expect((await get(warehouses.GET, "/api/warehouses?cityRef=s:abc")).data.available).toBe(false);
  });

  it("номер, що починається з введених цифр — після точного збігу", () => {
    const list: Warehouse[] = ["1", "12", "120", "21"].map((n) => ({ ref: n, number: n, kind: "branch", label: `Відділення №${n}` }));
    expect(filterWarehouses(list, "12").map((w) => w.number)).toEqual(["12", "120"]);
    expect(filterWarehouses(list, "1").map((w) => w.number)).toEqual(["1", "12", "120"]);
  });
});

describe("вулиці для кур'єра", () => {
  it("підказки за початком назви", async () => {
    const r = await get(streets.GET, `/api/streets?cityRef=ref-poltava&q=${encodeURIComponent("Собор")}`);
    expect(r.data).toEqual({ available: true, items: [{ ref: "street-sobornosti", label: "вул. Соборності" }] });
  });
});

describe("доставка в замовленні", () => {
  it("відділення зі списку — зберігається повний підпис", async () => {
    const r = await order({ method: "np-branch", branch: "Відділення №3: вул. Тестова, 3", branchRef: "ref-poltava-wh-3" });
    expect(r.status).toBe(200);
    expect(r.data.order.delivery).toMatchObject({ branch: "Відділення №3: вул. Тестова, 3", branchRef: "ref-poltava-wh-3" });
  });

  it("номер, введений вручну, теж розпізнається", async () => {
    const r = await order({ method: "np-branch", branch: "№ 12" });
    expect(r.status).toBe(200);
    expect(r.data.order.delivery.branch).toBe("Відділення №12: вул. Тестова, 12");
  });

  it("відділення іншого міста або неіснуюче — помилка під полем", async () => {
    for (const d of [{ branchRef: "ref-kyiv-wh-3", branch: "Відділення №3" }, { branchRef: "", branch: "777" }]) {
      const r = await order({ method: "np-branch", ...d });
      expect(r.status).toBe(400);
      expect(r.data).toEqual({ error: "Оберіть відділення або поштомат зі списку", field: "branch" });
    }
  });

  it("Укрпошта — індекс із 5 цифр", async () => {
    expect((await order({ method: "ukrposhta", branch: "36 000" })).data.order.delivery.branch).toBe("36000");
    const bad = await order({ method: "ukrposhta", branch: "360" });
    expect(bad.data).toMatchObject({ field: "branch" });
  });

  it("кур'єр — вулиця, будинок і квартира складаються в адресу", async () => {
    const r = await order({ method: "np-courier", street: "вул. Соборності", streetRef: "street-sobornosti", house: "5А", flat: "12" });
    expect(r.status).toBe(200);
    expect(r.data.order.delivery).toMatchObject({ address: "вул. Соборності, буд. 5А, кв. 12", street: "вул. Соборності", house: "5А", flat: "12" });
  });

  it("кур'єр — без будинку або з вулицею не з цього міста — помилка під полем", async () => {
    expect((await order({ method: "np-courier", street: "вул. Соборності", streetRef: "street-sobornosti" })).data).toMatchObject({ field: "house" });
    expect((await order({ method: "np-courier", street: "вул. Соборності", streetRef: "street-elsewhere", house: "1" })).data).toMatchObject({ field: "street" });
  });
});
