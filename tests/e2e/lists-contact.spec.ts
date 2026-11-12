import { expect, test } from "@playwright/test";

test.describe("обране", () => {
  test("додавання з картки, лічильник у шапці, сторінка обраного", async ({ page }) => {
    await page.goto("/catalog/tents");
    const heart = page.getByRole("button", { name: /^Додати .* в обране$/ }).first();
    const name = (await heart.getAttribute("aria-label"))!.replace(/^Додати /, "").replace(/ в обране$/, "");
    await heart.click();
    await expect(page.getByRole("button", { name: `Прибрати ${name} з обраного` })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("link", { name: "Обране, товарів: 1" })).toBeVisible();

    await page.goto("/favorites");
    await expect(page.locator("main")).toContainText(name);
    await page.getByRole("button", { name: `Прибрати ${name} з обраного` }).click();
    await expect(page.getByRole("link", { name: "Обране, товарів: 0" })).toBeVisible();
  });
});

test.describe("порівняння", () => {
  test("два намети в таблиці порівняння", async ({ page }) => {
    await page.goto("/catalog/tents");
    const buttons = page.getByRole("button", { name: /^Додати .* до порівняння$/ });
    await buttons.nth(0).click();
    await buttons.nth(0).click(); // перша вже стала «Прибрати…», тож nth(0) — наступна
    await expect(page.getByRole("link", { name: "Порівняння, товарів: 2" })).toBeVisible();

    await page.goto("/compare?category=tents");
    await expect(page.locator("thead")).toContainText("Товарів: 2 / 4");
    await expect(page.getByRole("button", { name: /^Прибрати .* з порівняння$/ })).toHaveCount(2);
    await page.getByRole("button", { name: /^Прибрати .* з порівняння$/ }).first().click();
    await expect(page.locator("thead")).toContainText("Товарів: 1 / 4");
  });
});

test.describe("форма контактів", () => {
  test("перевірка полів і успішне надсилання", async ({ page }) => {
    await page.goto("/contacts");
    await page.getByRole("button", { name: "Надіслати повідомлення" }).click();
    await expect(page.getByText("Вкажіть ім'я")).toBeVisible();
    await expect(page.getByText("Перевірте email")).toBeVisible();
    await expect(page.locator("#field-c-name")).toBeFocused();

    await expect(page.locator("#field-c-order")).toHaveCount(0);
    await page.getByText("Питання щодо замовлення", { exact: true }).click();
    await expect(page.locator("#field-c-order")).toBeVisible();

    await page.locator("#field-c-name").fill("Оксана");
    await page.locator("#field-c-email").fill("oksana@example.com");
    await page.locator("#field-c-order").fill("fc-1234567");
    await expect(page.locator("#field-c-order")).toHaveValue("FC-1234567");
    await page.locator("#field-c-message").fill("Коли відправите моє замовлення?");
    await page.getByRole("button", { name: "Надіслати повідомлення" }).click();
    await expect(page.getByRole("status")).toContainText("Дякуємо, Оксана!");
  });

  test("графік — цілодобово, адреси немає", async ({ page }) => {
    await page.goto("/contacts");
    await expect(page.getByText("Цілодобово, 24/7")).toBeVisible();
    await expect(page.getByText(/вул\./)).toHaveCount(0);
  });
});
