import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { helperAdminApi } from "./helpers";

/*
 * Товари з двох складів (як Ranger і Atlantmarket): кошик показує дві посилки,
 * Укрпошта й накладений платіж для складу «лише передоплата, Нова пошта» недоступні,
 * після оформлення — два окремі замовлення
 */

// Повне оформлення — на завантаженій машині довше за типові 30 с.
// Послідовно: склади готуються один раз (паралельні beforeAll змагалися б зі скиданням кешу)
test.describe.configure({ mode: "serial", timeout: 60_000 });

/*
 * Товар «партнера» — новий (як товари, що додає імпорт): його сторінка ще не
 * зібрана наперед, тож одразу показує умови складу
 */
let ATLANT_ITEM = "";
const RANGER_ITEM = "/catalog/furniture/fu-stool";
let api: APIRequestContext;
let atlantId = "";

test.beforeAll(async ({ baseURL }) => {
  api = await helperAdminApi(baseURL!);
  const created = await api.post("/api/admin/products", {
    data: { name: "Кемпінговий органайзер Складський Е2Е", brand: "Naturehike", category: "accessories", price: 740, stock: 8, specs: "Тест", photo: "meadow", images: [], attrs: [] },
  });
  expect(created.ok(), await created.text()).toBe(true);
  atlantId = (await created.json()).product.id;
  ATLANT_ITEM = `/catalog/accessories/${atlantId}`;
  const atlant = await api.post("/api/test/supplier", {
    data: { name: "E2E Atlant", codAllowed: false, novaPoshtaOnly: true, dispatchDays: 3, products: [atlantId] },
  });
  expect(atlant.ok()).toBe(true);
  expect((await api.post("/api/test/supplier", { data: { name: "E2E Ranger", products: ["fu-stool"] } })).ok()).toBe(true);
});
test.afterAll(async () => {
  await api.delete(`/api/admin/products/${atlantId}`);
  await api.dispose();
});

async function addToCart(page: Page, path: string) {
  await page.goto(path);
  await page.getByRole("button", { name: /^Додати в кошик/ }).first().click();
}

/**
 * Готові сторінки кешуються: після зміни умов складу перший запит ще може
 * віддати стару сторінку (на сайті — оновлюється сама за хвилину). Перезавантажуємо, доки не оновиться
 */
async function openFresh(page: Page, path: string, ready: () => Promise<boolean>) {
  await expect
    .poll(async () => {
      await page.goto(path);
      return ready();
    }, { timeout: 30_000, intervals: [500, 1000, 2000] })
    .toBe(true);
}
const dispatchNote = (page: Page) => page.getByTestId("dispatch-note");

const VIEWPORTS = [
  { name: "laptop", width: 1440, height: 900 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "phone", width: 390, height: 844 },
];

test("сторінка товару зі складу партнера: строк відправки, лише передоплата й Нова пошта", async ({ page }) => {
  await openFresh(page, ATLANT_ITEM, async () => /складу партнера/.test(await dispatchNote(page).innerText()));
  await expect(dispatchNote(page)).toHaveText(
    "Зі складу партнера: відправка протягом 3 робочих днів після оплати, лише за передоплатою на рахунок, Новою поштою",
  );
  await page.getByRole("tab", { name: /Доставка/ }).click();
  const tab = page.getByRole("tabpanel");
  await expect(tab.getByText("Нова пошта — відділення")).toBeVisible();
  await expect(tab.getByText("Укрпошта")).toHaveCount(0);
  await expect(tab.getByText("Накладений платіж")).toHaveCount(0);
});

for (const vp of VIEWPORTS) {
  test(`кошик з двох складів — дві посилки й два замовлення (${vp.name})`, async ({ page }, info) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await addToCart(page, RANGER_ITEM);
    await addToCart(page, ATLANT_ITEM);
    await openFresh(page, "/cart", async () => {
      await page.locator("main").getByText(/Оформлення замовлення/).waitFor();
      return page.getByTestId("split-note").isVisible();
    });

    await expect(page.getByTestId("split-note")).toContainText("2 посилки з різних складів");
    await expect(page.getByText("Посилка 1", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Посилка 2", { exact: false }).first()).toBeVisible();

    // Укрпошта недоступна (склад «лише Нова пошта»)
    await expect(page.getByRole("radio", { name: /Укрпошта/ })).toBeDisabled();
    // Накладений платіж можна — для посилки Ranger; посилку партнера — на рахунок
    await page.getByText("Накладений платіж", { exact: true }).click();
    await expect(page.getByTestId("prepay-note")).toContainText("лише за передоплатою");

    const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(noScroll, "сторінка ширша за екран").toBe(true);
    await page.screenshot({ path: info.outputPath(`cart-${vp.name}.png`), fullPage: true });

    // Оформлення
    await page.locator("#field-firstName").fill("Галина");
    await page.locator("#field-lastName").fill("Складська");
    await page.locator("#field-phone").fill("671234567");
    await page.locator("#field-email").fill(`split-${vp.name}-${Date.now()}@example.com`);
    const city = page.locator("#field-city");
    await city.fill("Полтава");
    await expect(page.getByRole("option", { name: "м. Полтава, Полтавська обл." })).toBeVisible();
    await city.press("Enter");
    await expect(city).toHaveValue("м. Полтава, Полтавська обл.");
    const branch = page.locator("#field-branch");
    await branch.fill("12");
    await page.getByRole("listbox", { name: "Відділення й поштомати" }).getByRole("option", { name: /Відділення №12/ }).click();
    await page.locator("#field-agree").check();
    await page.getByRole("button", { name: "Підтвердити замовлення" }).click();

    await expect(page.getByText(/оформили 2 окремі замовлення/)).toBeVisible();
    await expect(page.getByText(/Замовлення № FC-\d{7}/)).toHaveCount(2);
    await expect(page.getByTestId("payment-email-note")).toBeVisible();
    await expect(page.getByTestId("payment-cod-note")).toBeVisible();
    await page.screenshot({ path: info.outputPath(`done-${vp.name}.png`), fullPage: true });
  });
}
