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
