import { expect, request as playwrightRequest, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_HELPER_ADMIN_EMAIL } from "../../playwright.config";

let n = 0;
export const uniqueEmail = () => `e2e${Date.now()}${process.pid}${++n}@example.com`;
export const PASSWORD = "camping2026";

/** Ціна з тексту «4 890 ₴» → 4890 */
export const parsePrice = (s: string) => Number(s.replace(/[^\d]/g, ""));

/** Лічильник кошика в шапці */
export const cartButton = (page: Page) => page.getByRole("button", { name: /^Кошик, товарів:/ });

export async function expectCartCount(page: Page, count: number) {
  await expect(cartButton(page)).toHaveAccessibleName(`Кошик, товарів: ${count}`);
}

/** Реєстрація через сторінку профілю */
export async function register(page: Page, firstName = "Тарас") {
  const email = uniqueEmail();
  await page.goto("/account");
  await page.getByRole("tab", { name: "Реєстрація" }).click();
  await page.locator("#field-reg-firstName").fill(firstName);
  await page.locator("#field-reg-email").fill(email);
  await page.locator("#field-reg-phone").fill("501112233");
  await page.locator("#field-reg-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Створити акаунт" }).click();
  await expect(page.getByRole("link", { name: `Профіль: ${firstName}` })).toBeVisible();
  return email;
}

/** Ширина сторінки не перевищує екран (немає горизонтальної прокрутки) */
export async function expectNoHorizontalScroll(page: Page) {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(scroll, "сторінка ширша за екран").toBeLessThanOrEqual(width);
}

/** Відкрити товар і дочекатися, поки перегляд запишеться в «Нещодавно переглянуті» */
export async function viewProduct(page: Page, path: string) {
  await page.goto(path);
  const id = path.split("/").pop()!;
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("family-camping-recent") ?? "[]")[0]))
    .toBe(id);
}

/**
 * Сесія «службового» адміністратора для запитів до адмін-API з тестів
 * (окремий акаунт, щоб не заважати admin.spec). Перший виклик реєструє його,
 * наступні — входять.
 */
export async function helperAdminApi(baseURL: string): Promise<APIRequestContext> {
  const api = await playwrightRequest.newContext({ baseURL });
  const data = { firstName: "Помічник", email: E2E_HELPER_ADMIN_EMAIL, phone: "", password: PASSWORD };
  if (!(await api.post("/api/auth/register", { data })).ok())
    expect((await api.post("/api/auth/login", { data: { email: data.email, password: PASSWORD } })).ok()).toBe(true);
  return api;
}
