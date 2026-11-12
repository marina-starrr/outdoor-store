import { expect, test } from "@playwright/test";
import { expectCartCount, parsePrice, register } from "./helpers";

test.describe("кошик", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/catalog/tents/np3");
    await page.getByRole("button", { name: /^Додати в кошик/ }).first().click();
    await expectCartCount(page, 1);
  });

  test("бічна панель кошика відкривається і веде до оформлення", async ({ page }) => {
    await page.getByRole("button", { name: /^Кошик, товарів/ }).click();
    const drawer = page.getByRole("dialog", { name: "Кошик" });
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Nature Peak 3");
    await drawer.getByRole("link", { name: /Оформити замовлення/ }).click();
    await expect(page).toHaveURL("/cart");
  });

  test("зміна кількості перераховує суму", async ({ page }) => {
    await page.goto("/cart");
    const total = page.getByText("До сплати").locator("..");
    const before = parsePrice((await total.textContent())!);
    await page.locator("main").getByRole("button", { name: "Збільшити кількість" }).first().click();
    await expectCartCount(page, 2);
    await expect.poll(async () => parsePrice((await total.textContent())!)).toBeGreaterThan(before);
  });

  test("видалення з можливістю повернути", async ({ page }) => {
    await page.goto("/cart");
    await page.getByRole("button", { name: /^Видалити .* з кошика$/ }).first().click();
    await expectCartCount(page, 0);
    await page.getByRole("button", { name: "Повернути" }).click();
    await expectCartCount(page, 1);
  });

  test("промокод: неіснуючий — помилка, FAMILY10 — знижка", async ({ page }) => {
    await page.goto("/cart");
    const input = page.getByRole("textbox", { name: "Промокод" });
    await input.fill("NOPE");
    await page.getByRole("button", { name: "Застосувати" }).click();
    await expect(page.getByText("Такого промокоду не існує")).toBeVisible();
    await input.fill("family10");
    await page.getByRole("button", { name: "Застосувати" }).click();
    await expect(page.getByText("Промокод FAMILY10")).toBeVisible();
  });

  test("доставка від 3000 ₴ безкоштовна, самовивозу немає", async ({ page }) => {
    await page.goto("/cart");
    await expect(page.locator("aside").getByText("Безкоштовно").first()).toBeVisible();
    await expect(page.getByText("Самовивіз")).toHaveCount(0);
  });

  test("гість бачить вимогу увійти, а не форму оформлення", async ({ page }) => {
    await page.goto("/cart");
    await expect(page.getByRole("button", { name: "Увійдіть, щоб оформити" })).toBeVisible();
    await expect(page.locator("form#checkout")).toHaveCount(0);
  });
});

test("повне оформлення: згода з умовами обов'язкова", async ({ page }) => {
  await register(page, "Тарас");
  await page.goto("/catalog/tents/np3");
  await page.getByRole("button", { name: /^Додати в кошик/ }).first().click();
  await page.goto("/cart");

  // Контакти підставлені з профілю
  await expect(page.locator("#field-firstName")).toHaveValue("Тарас");
  await page.locator("#field-lastName").fill("Шевченко");
  await page.locator("#field-city").fill("Львів");
  await page.locator("#field-branch").fill("12");

  // Без згоди — підказка, замовлення не створюється
  await page.getByRole("button", { name: "Підтвердити замовлення" }).click();
  await expect(page.getByText("Підтвердьте згоду, щоб оформити замовлення")).toBeVisible();
  await expect(page.locator("#field-agree")).toBeFocused();
  await expect(page.locator("h1")).toHaveText("Оформлення замовлення");

  // Посилання на умови ведуть на справжні сторінки
  const agree = page.locator("label").filter({ has: page.locator("#field-agree") });
  await expect(agree.getByRole("link", { name: "умовами доставки й оплати" })).toHaveAttribute("href", "/delivery");
  await expect(agree.getByRole("link", { name: "умовами повернення" })).toHaveAttribute("href", "/returns");
  await expect(agree.getByRole("link", { name: "політикою конфіденційності" })).toHaveAttribute("href", "/privacy");

  await page.locator("#field-agree").check();
  await expect(page.getByText("Підтвердьте згоду")).toHaveCount(0);
  await page.getByRole("button", { name: "Підтвердити замовлення" }).click();
  await expect(page.locator("h1")).toHaveText("Дякуємо, Тарас!");
  await expectCartCount(page, 0);

  // Замовлення з'явилось у профілі
  await page.goto("/account");
  await expect(page.getByText(/FC-\d{7}/).first()).toBeVisible();
});
