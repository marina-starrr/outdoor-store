import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_ADMIN_EMAIL } from "../../playwright.config";
import { PASSWORD, register, uniqueEmail, verifyAdminViaScript } from "./helpers";

/*
 * Повний сценарій адмін-панелі в браузері. Кроки залежать один від одного,
 * тому виконуються послідовно в одній вкладці адміністратора.
 */
test.describe.configure({ mode: "serial" });

const PRODUCT = { name: "Ліхтар Адмін Тест 500", brand: "Tramp", price: "1234", stock: "4", specs: "500 лм · USB-C" };
let admin: Page;
let productUrl = "";

/** Покупець через API (окремий контекст із власною cookie) */
async function customerOrder(request: APIRequestContext, productId: string, qty: number) {
  const email = uniqueEmail();
  expect((await request.post("/api/auth/register", { data: { firstName: "Покупець", email, phone: "", password: PASSWORD } })).ok()).toBe(true);
  const res = await request.post("/api/orders", {
    data: {
      lines: [{ id: productId, qty }],
      contact: { firstName: "Олег", lastName: "Покупець", phone: "+380 67 123 45 67" },
      delivery: { method: "np-branch", city: "Полтава", branch: "3" },
      payment: "invoice",
      agreed: true,
    },
  });
  return { status: res.status(), body: await res.json() };
}

/** Змінити число прямо в списку товарів і дочекатися збереження на сервері */
async function saveInline(field: ReturnType<Page["getByLabel"]>, value: string) {
  await field.fill(value);
  await Promise.all([
    admin.waitForResponse((r) => r.url().includes("/api/admin/products/") && r.request().method() === "PATCH" && r.ok()),
    field.press("Enter"),
  ]);
  await expect(field).toHaveValue(value);
}

test.beforeAll(async ({ browser }) => {
  admin = await browser.newPage({ viewport: { width: 1440, height: 900 } });
});
test.afterAll(async () => admin?.close());

test("звичайний покупець не має доступу", async ({ page }) => {
  await register(page, "Марко");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Немає доступу" })).toBeVisible();
  // API теж закрите
  expect((await page.request.get("/api/admin/products")).status()).toBe(403);
});

test("гість бачить форму входу", async ({ page }) => {
  await page.goto("/admin/products");
  await expect(page.getByRole("heading", { name: "Вхід до адмін-панелі" })).toBeVisible();
});

test("адміністратор входить і бачить огляд", async () => {
  await admin.goto("/account");
  await admin.getByRole("tab", { name: "Реєстрація" }).click();
  await admin.locator("#field-reg-firstName").fill("Власник");
  await admin.locator("#field-reg-email").fill(E2E_ADMIN_EMAIL);
  await admin.locator("#field-reg-phone").fill("501234567");
  await admin.locator("#field-reg-password").fill(PASSWORD);
  await admin.getByRole("button", { name: "Створити акаунт" }).click();
  // У профілі з'являється посилання на адмін-панель
  await admin.getByRole("link", { name: "Адмін-панель" }).click();
  await expect(admin).toHaveURL("/admin");
  // Але доступ — лише після підтвердження email: інакше адмінку отримав би будь-хто з цією адресою
  await expect(admin.getByRole("heading", { name: "Підтвердіть email" })).toBeVisible();
  expect((await admin.request.get("/api/admin/products")).status()).toBe(403);

  // Пошту на тестовому сервері не налаштовано — сторінка підказує команду для сервера
  await admin.getByRole("button", { name: "Надіслати лист ще раз" }).click();
  await expect(admin.getByText(`yarn admin:verify ${E2E_ADMIN_EMAIL}`)).toBeVisible();
  await verifyAdminViaScript(admin.request, E2E_ADMIN_EMAIL);
  await admin.reload();
  await expect(admin.getByRole("heading", { name: "Огляд" })).toBeVisible();
  await expect(admin.getByText("Товари на сайті")).toBeVisible();
  await expect(admin.getByText("Закінчуються на складі")).toBeVisible();
});

test("випадний список категорій ховається під шапку при прокрутці", async () => {
  await admin.goto("/admin/products");
  // Чекаємо на товари — інакше сторінка коротка і прокручувати нікуди
  await expect(admin.getByTestId("admin-products").locator("li").nth(10)).toBeVisible();
  await admin.getByRole("button", { name: /^Категорія:/ }).click();
  const list = admin.getByRole("listbox", { name: "Категорія" });
  await expect(list).toBeVisible();
  const box = (await list.boundingBox())!;
  // Прокручуємо так, щоб верх списку опинився під липкою шапкою
  const header = (await admin.locator("header").first().boundingBox())!;
  await admin.evaluate((y) => window.scrollBy({ top: y, behavior: "instant" }), box.y - header.height / 2);
  await expect.poll(async () => (await list.boundingBox())!.y).toBeLessThan(header.height - 5);
  // У точці перетину зверху — шапка, а не список
  const topIsHeader = await admin.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest("header"), {
    x: box.x + box.width / 2,
    y: header.height - 5,
  });
  expect(topIsHeader).toBe(true);
  await admin.keyboard.press("Escape");
});

test("створення товару — і він одразу на сайті", async ({ page }) => {
  await admin.goto("/admin/products");
  await admin.getByRole("button", { name: "Додати товар" }).click();
  const editor = admin.getByRole("dialog", { name: "Новий товар" });
  await expect(editor).toBeVisible();

  // Перевірка полів до відправлення
  await editor.getByRole("button", { name: "Створити товар" }).click();
  await expect(editor.getByText("Назва — щонайменше 3 символи")).toBeVisible();

  await editor.locator("#pe-name").fill(PRODUCT.name);
  await editor.getByRole("button", { name: /^Категорія товару:/ }).click();
  await admin.getByRole("option", { name: "Освітлення та ліхтарі" }).click();
  await editor.locator("#pe-brand").fill(PRODUCT.brand);
  await editor.locator("#pe-specs").fill(PRODUCT.specs);
  await editor.locator("#pe-price").fill(PRODUCT.price);
  await editor.locator("#pe-stock").fill(PRODUCT.stock);
  await editor.getByRole("radio").nth(1).click();
  await editor.getByRole("button", { name: "+ Додати характеристику" }).click();
  await editor.getByLabel("Назва характеристики 1").fill("Яскравість");
  await editor.getByLabel("Значення характеристики 1").fill("500 лм");
  await editor.getByRole("button", { name: "Створити товар" }).click();
  await expect(editor).toBeHidden();

  const row = admin.getByTestId("admin-products").locator("li", { hasText: PRODUCT.name });
  await expect(row).toBeVisible();
  productUrl = (await row.getByRole("link", { name: `Відкрити ${PRODUCT.name} на сайті` }).getAttribute("href"))!;
  expect(productUrl).toMatch(/^\/catalog\/lighting\/likhtar-admin-test-500$/);

  // Сторінка товару, категорія, пошук — для покупця
  await page.goto(productUrl);
  // Сторінка нового товару приходить потоком — перевіряємо лише видимий заголовок
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(PRODUCT.name);
  await expect(page.getByText("1 234 ₴").first()).toBeVisible();
  await expect(page.getByText("Залишилось лише 4 шт.")).toBeVisible();
  await expect(page.getByText("500 лм").first()).toBeVisible();
  await page.goto("/catalog/lighting");
  await expect(page.getByRole("region", { name: "Товари" }).getByRole("link", { name: PRODUCT.name })).toBeVisible();
  await page.getByRole("combobox").first().fill("Адмін Тест");
  await expect(page.getByRole("option").first()).toContainText(PRODUCT.name);
});

test("зміна ціни прямо в списку оновлює сайт", async ({ page }) => {
  await admin.goto("/admin/products");
  const price = admin.getByLabel(`Ціна ${PRODUCT.name}`, { exact: true });
  await saveInline(price, "990");
  // Перший запит одразу після збереження може ще отримати попередню версію з кешу — перезавантажуємо
  await expect(async () => {
    await page.goto(productUrl);
    await expect(page.getByText("990 ₴").first()).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
});

test("залишок: кошик не дає взяти більше, ніж є; 0 — «Очікується»", async ({ page }) => {
  await page.goto(productUrl);
  const stepper = page.locator('[aria-label="Кількість"]');
  const plus = stepper.getByRole("button", { name: "Збільшити кількість" });
  const value = stepper.locator("span");
  // Сторінка нового товару приходить потоком — чекаємо, поки кнопки оживуть
  await expect(async () => {
    await plus.click();
    await expect(value).toHaveText("2", { timeout: 500 });
  }).toPass();
  await plus.click();
  await expect(value).toHaveText("3");
  await plus.click();
  await expect(value).toHaveText("4");
  // Більше, ніж є на складі (4), не дає
  await expect(plus).toBeDisabled();

  await admin.goto("/admin/products");
  const stock = admin.getByLabel(`Залишок ${PRODUCT.name}`, { exact: true });
  await saveInline(stock, "0");

  // Сторінка приходить потоком: поки він не дійшов, у DOM буває ще прихована копія — шукаємо лише в <main>.
  // Перший запит одразу після збереження може ще отримати попередню версію з кешу — перезавантажуємо
  await expect(async () => {
    await page.goto(productUrl);
    await expect(page.getByRole("main").getByText("Очікується надходження")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^Додати в кошик/ })).toHaveCount(0);

  await saveInline(stock, "4");
});

test("редагування у формі: стара ціна, опис", async ({ page }) => {
  await admin.goto("/admin/products");
  await admin.getByTestId("admin-products").locator("li", { hasText: PRODUCT.name }).getByRole("button", { name: "Редагувати" }).click();
  const editor = admin.getByRole("dialog");
  await editor.locator("#pe-oldPrice").fill("500");
  await editor.getByRole("button", { name: "Зберегти зміни" }).click();
  await expect(editor.getByText("Стара ціна має бути більшою")).toBeVisible();
  await editor.locator("#pe-oldPrice").fill("1290");
  await editor.locator("#pe-description").fill("Яскравий ліхтар для табору.\n\nЗаряджається від USB-C.");
  await editor.getByRole("button", { name: "Зберегти зміни" }).click();
  await expect(editor).toBeHidden();

  // Паралельні тести оформлюють замовлення, і кожне скидає кеш каталогу:
  // перший запит одразу після збереження іноді ще отримує попередню версію
  // сторінки (кеш Next оновлюється за мить). Перевіряємо з перезавантаженням
  await expect(async () => {
    await page.goto(productUrl);
    await expect(page.getByText("Яскравий ліхтар для табору.").first()).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByText("−23%").first()).toBeVisible();
});

test("замовлення покупця: бронювання при підтвердженні, оплата, повернення на склад при скасуванні", async ({ browser }) => {
  const id = productUrl.split("/").pop()!;
  const customer = await browser.newContext();
  const { status, body } = await customerOrder(customer.request, id, 3);
  expect(status).toBe(200);
  const number = body.order.number as string;

  await admin.goto("/admin/orders");
  const order = admin.getByTestId("admin-orders").locator("li", { hasText: number });
  await expect(order).toContainText("Нове");
  await order.getByRole("button", { name: new RegExp(number) }).click();
  await expect(order).toContainText("Полтава");

  // Нове замовлення товар ще не бронює
  const stockInput = () => admin.getByLabel(`Залишок ${PRODUCT.name}`, { exact: true });
  const products = await (await admin.request.get("/api/admin/products")).json();
  expect(products.products.find((p: { id: string }) => p.id === id).stock).toBe(4);

  await order.getByRole("button", { name: "Підтвердити й забронювати" }).click();
  await expect(order).toContainText("Чекає оплату");
  await expect(order).toContainText("Чекаємо оплату до");
  await expect(admin.getByText(/підтверджено: товар заброньовано/)).toBeVisible();

  // Покупець бачить статус і що треба оплатити
  const history = await (await customer.request.get("/api/orders")).json();
  expect(history.orders[0]).toMatchObject({ number, status: "confirmed" });
  const customerPage = await customer.newPage();
  await customerPage.goto("/account");
  await expect(customerPage.getByText("Очікує оплату").first()).toBeVisible();
  await expect(customerPage.getByTestId("order-payment").first()).toContainText("Оплатіть");
  await expect(customerPage.getByTestId("order-payment").first()).toContainText(`Оплата замовлення ${number}`);

  // Підтвердження забронювало товар (4 − 3)
  await admin.goto("/admin/products");
  await expect(stockInput()).toHaveValue("1");

  // Скасування з підтвердженням повертає товар на склад
  await admin.goto(`/admin/orders?q=${number}`);
  const again = admin.getByTestId("admin-orders").locator("li", { hasText: number });
  await again.getByRole("button", { name: "Скасувати" }).click();
  await again.getByRole("button", { name: "Так" }).click();
  await expect(again).toContainText("Скасоване");
  await admin.goto("/admin/products");
  await expect(admin.getByLabel(`Залишок ${PRODUCT.name}`, { exact: true })).toHaveValue("4");
  await customer.close();
});

test("прихований товар зникає з сайту (404)", async ({ page, request }) => {
  await admin.goto("/admin/products");
  await admin.getByTestId("admin-products").locator("li", { hasText: PRODUCT.name }).getByRole("button", { name: "Приховати" }).click();
  await expect(admin.getByTestId("admin-products").locator("li", { hasText: PRODUCT.name })).toContainText("Прихований");
  expect((await request.get(productUrl)).status()).toBe(404);
  await page.goto("/catalog/lighting");
  await expect(page.getByRole("region", { name: "Товари" }).getByRole("link", { name: PRODUCT.name })).toHaveCount(0);
  // І з «Нещодавно переглянутих» теж зникає
  await expect(page.getByTestId("recently-viewed").getByText(PRODUCT.name)).toHaveCount(0);
});
