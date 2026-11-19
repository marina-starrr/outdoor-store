import { expect, test } from "@playwright/test";
import { E2E_HELPER_ADMIN_EMAIL } from "../../playwright.config";
import { PASSWORD, helperAdminApi, uniqueEmail } from "./helpers";

/*
 * Чат з консультантом: кнопка на кожній сторінці, гість пише без реєстрації,
 * «Запитати про цей товар» прикріплює товар, адміністратор відповідає з адмінки,
 * відповідь з'являється у віконці покупця без перезавантаження.
 */

test.describe.configure({ timeout: 60_000 });

test("гість пише з товару, адміністратор відповідає в адмінці, покупець бачить відповідь", async ({ page, browser, baseURL }) => {
  const email = uniqueEmail();
  await page.goto("/catalog/tents/np3");
  await page.getByRole("button", { name: "Є питання? Запитати про цей товар" }).click();
  const chat = page.getByRole("dialog", { name: "Чат з консультантом" });
  await expect(chat).toBeVisible();
  await expect(chat).toContainText("Питання про: Намет Nature Peak 3");

  // Перше повідомлення гостя — потрібні ім'я і контакт
  const input = chat.getByRole("textbox", { name: "Повідомлення" });
  await input.fill("Чи влізе в багажник седана?");
  await input.press("Enter");
  await expect(chat.getByRole("alert")).toContainText("Як до вас звертатися?");
  await chat.getByRole("textbox", { name: "Ваше ім'я" }).fill("Марко");
  await chat.getByRole("textbox", { name: "Email" }).fill(email);
  await chat.getByRole("button", { name: "Надіслати" }).click();
  await expect(chat.getByText("Чи влізе в багажник седана?")).toBeVisible();
  await expect(chat.getByRole("link", { name: /Намет Nature Peak 3/ })).toBeVisible();
  // Контакти вже є — більше не питаємо
  await expect(chat.getByRole("textbox", { name: "Ваше ім'я" })).toHaveCount(0);

  // Адміністратор — у своєму браузері
  await helperAdminApi(baseURL!);
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  expect((await admin.request.post("/api/auth/login", { data: { email: E2E_HELPER_ADMIN_EMAIL, password: PASSWORD } })).ok()).toBe(true);
  await admin.goto("/admin/chats");
  const row = admin.getByTestId("admin-chats").getByRole("button", { name: /Марко/ });
  await expect(row).toContainText("Чи влізе в багажник седана?");
  await row.click();
  await expect(admin.getByText(email)).toBeVisible();
  await expect(admin.getByRole("link", { name: /Намет Nature Peak 3 · .* · залишок/ })).toBeVisible();
  const reply = admin.getByRole("textbox", { name: "Відповідь покупцю" });
  await reply.fill("Так, у складеному вигляді 60×20 см — влізе.");
  await reply.press("Enter");
  await expect(admin.getByText("Так, у складеному вигляді 60×20 см — влізе.")).toBeVisible();

  // Покупець бачить відповідь без перезавантаження
  await expect(chat.getByText("Так, у складеному вигляді 60×20 см — влізе.")).toBeVisible({ timeout: 15_000 });
  await adminCtx.close();

  // Розмова зберігається: після переходу на іншу сторінку — та сама історія
  await page.goto("/catalog");
  await page.getByRole("button", { name: /^Чат з консультантом/ }).click();
  await expect(page.getByRole("dialog", { name: "Чат з консультантом" })).toContainText("Чи влізе в багажник седана?");
});

test("чат закривається клавішею Escape; на «Контактах» — кнопка чату замість форми", async ({ page }) => {
  await page.goto("/contacts");
  await expect(page.locator("form").filter({ hasText: "Надіслати повідомлення" })).toHaveCount(0);
  await page.locator("main").getByRole("button", { name: "Відкрити чат" }).click();
  const chat = page.getByRole("dialog", { name: "Чат з консультантом" });
  await expect(chat).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chat).toBeHidden();
  await expect(page.getByRole("button", { name: "Чат з консультантом" })).toBeFocused();
});

test("посилання з листа (?chat=1) одразу відкриває чат", async ({ page }) => {
  await page.goto("/?chat=1");
  await expect(page.getByRole("dialog", { name: "Чат з консультантом" })).toBeVisible();
});

test("в адмін-панелі кнопки чату немає", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("button", { name: /^Чат з консультантом/ })).toHaveCount(0);
});

test("«Де моє замовлення?»: іконка в шапці і кнопка в чаті", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Де моє замовлення?" }).first().click();
  await expect(page).toHaveURL("/orders/track");

  await page.goto("/catalog");
  await page.getByRole("button", { name: /^Чат з консультантом/ }).click();
  const chat = page.getByRole("dialog", { name: "Чат з консультантом" });
  await chat.getByRole("link", { name: "Де моє замовлення?" }).click();
  await expect(page).toHaveURL("/orders/track");
  await expect(chat).toBeHidden();
});
