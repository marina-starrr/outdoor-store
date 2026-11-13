import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { helperAdminApi, register } from "./helpers";

/*
 * Сповіщення: «Повідомити про наявність», відповідь на звернення з адмін-панелі,
 * дзвіночок у шапці та сторінка /notifications.
 * Тестовий сервер працює без пошти (немає RESEND_API_KEY) — тож для гостя без
 * акаунта адмін-панель пропонує лист у Gmail.
 */
test.describe.configure({ mode: "serial" });

const PRODUCT = { id: "hm-net", url: "/catalog/hammocks/hm-net", name: "Гамак з москітною сіткою Terra Incognita" };

const setStock = async (api: APIRequestContext, stock: number) =>
  expect((await api.patch(`/api/admin/products/${PRODUCT.id}`, { data: { stock } })).ok()).toBe(true);

let api: APIRequestContext;
test.beforeAll(async ({ baseURL }) => {
  api = await helperAdminApi(baseURL!);
  await setStock(api, 0);
});
test.afterAll(async () => {
  await setStock(api, 7);
  await api.dispose();
});

const bell = (page: Page) => page.getByRole("link", { name: /^Сповіщення, нових:/ });

test("гостю пропонуємо увійти, а не обіцяємо сповіщення", async ({ page }) => {
  await page.goto(PRODUCT.url);
  await page.getByRole("main").getByRole("button", { name: "Повідомити про наявність" }).click();
  await expect(page.getByText("Увійдіть, щоб підписатися")).toBeVisible();
  await page.getByRole("button", { name: "Увійти" }).click();
  await expect(page).toHaveURL(`/account?next=${encodeURIComponent(PRODUCT.url)}`);
  // Гість не бачить дзвіночка
  await expect(bell(page)).toHaveCount(0);
});

test("покупець підписується → адмін поповнює склад → сповіщення з дзвіночком", async ({ page }) => {
  await register(page, "Олена");
  await page.goto(PRODUCT.url);
  await expect(bell(page)).toHaveAccessibleName("Сповіщення, нових: 0");

  const button = page.getByRole("main").getByRole("button", { name: /Повідом/ });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(button).toHaveText("Повідомимо про наявність");
  // Підписка видна на сторінці сповіщень і зберігається після перезавантаження
  await page.goto("/notifications");
  await expect(page.getByRole("region", { name: "Чекаю наявності" }).getByRole("link", { name: PRODUCT.name })).toBeVisible();

  await setStock(api, 3);
  // Нові сповіщення підтягуються при поверненні на вкладку — тут просто перезавантажуємо
  await page.goto("/");
  await expect(bell(page)).toHaveAccessibleName("Сповіщення, нових: 1");
  await bell(page).click();
  await expect(page).toHaveURL("/notifications");
  const item = page.getByTestId("notifications").getByRole("listitem").first();
  await expect(item).toContainText(`${PRODUCT.name} знову в наявності`);
  await expect(item).toContainText("Нове");
  // Відкрили сторінку — лічильник обнуляється, а підписка знята
  await expect(bell(page)).toHaveAccessibleName("Сповіщення, нових: 0");
  await expect(page.getByRole("region", { name: "Чекаю наявності" }).getByRole("link")).toHaveCount(0);
  await item.getByRole("link", { name: "Переглянути товар" }).click();
  await expect(page).toHaveURL(PRODUCT.url);
});

test("відповідь на звернення: з адмін-панелі — у сповіщення покупця", async ({ page, browser }) => {
  // Форма «Контакти» обмежує 3 звернення на IP — у повному прогоні їх надсилають і інші тести
  await page.setExtraHTTPHeaders({ "x-forwarded-for": "10.20.0.1" });
  await register(page, "Марина");
  await page.goto("/contacts");
  await page.locator("#field-c-message").fill("Підкажіть, будь ласка, який гамак обрати на двох?");
  await page.getByRole("button", { name: "Надіслати повідомлення" }).click();
  await expect(page.getByText("і в сповіщення на сайті")).toBeVisible();

  const admin = await browser.newPage({ storageState: await api.storageState() });
  await admin.goto("/admin/messages");
  const card = admin.getByTestId("admin-messages").getByRole("listitem").filter({ hasText: "який гамак обрати на двох" });
  await expect(card.getByText("Має акаунт")).toBeVisible();
  await card.getByRole("button", { name: "Відповісти" }).click();
  await expect(card.getByText("Відповідь прийде у сповіщення на сайті.")).toBeVisible();
  // Порожню відповідь не надсилаємо
  await card.getByRole("button", { name: "Надіслати відповідь" }).click();
  await expect(card.getByRole("alert")).toHaveText("Напишіть відповідь");
  await card.getByRole("textbox").fill("Радимо Nature Peak Double — витримує до 200 кг.");
  await card.getByRole("button", { name: "Надіслати відповідь" }).click();
  await expect(admin.getByRole("status")).toContainText("Марина: відповідь надіслано у сповіщення на сайті");
  // Звернення опрацьоване — з'являється у вкладці «Опрацьовані» разом з відповіддю
  await admin.getByRole("button", { name: /^Опрацьовані/ }).click();
  await expect(admin.getByTestId("admin-messages")).toContainText("Радимо Nature Peak Double");
  await admin.close();

  await page.goto("/notifications");
  await expect(page.getByTestId("notifications")).toContainText("Відповідь на ваше звернення «Допомога з вибором»");
  await expect(page.getByTestId("notifications")).toContainText("Радимо Nature Peak Double — витримує до 200 кг.");
});

test("гість без акаунта: адмін-панель пропонує лист у Gmail", async ({ page, browser }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": "10.20.0.2" });
  await page.goto("/contacts");
  // Гостю підказуємо увійти
  await expect(page.getByRole("link", { name: "Увійдіть" })).toHaveAttribute("href", "/account?next=/contacts");
  await page.locator("#field-c-name").fill("Гість Тестовий");
  await page.locator("#field-c-email").fill("guest-e2e@example.com");
  await page.locator("#field-c-message").fill("Чи є знижки для багатодітних родин?");
  await page.getByRole("button", { name: "Надіслати повідомлення" }).click();
  await expect(page.getByText("Дякуємо, Гість!")).toBeVisible();

  const admin = await browser.newPage({ storageState: await api.storageState() });
  await admin.goto("/admin/messages");
  const card = admin.getByTestId("admin-messages").getByRole("listitem").filter({ hasText: "знижки для багатодітних" });
  await expect(card.getByText("Без акаунта")).toBeVisible();
  await card.getByRole("button", { name: "Відповісти" }).click();
  await expect(card.getByText(/відповідь не дійде автоматично/)).toBeVisible();
  await card.getByRole("textbox").fill("Так, 5% за промокодом");
  const gmail = card.getByRole("link", { name: "Відкрити лист у Gmail" });
  const href = new URL((await gmail.getAttribute("href"))!);
  expect(href.host).toBe("mail.google.com");
  expect(href.searchParams.get("to")).toBe("guest-e2e@example.com");
  expect(href.searchParams.get("su")).toBe("Re: Допомога з вибором — Family Camping");
  expect(href.searchParams.get("body")).toBe("Так, 5% за промокодом");
  await expect(gmail).toHaveAttribute("target", "_blank");
  await admin.close();
});
