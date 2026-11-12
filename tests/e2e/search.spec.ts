import { expect, test } from "@playwright/test";

const searchBox = (page: import("@playwright/test").Page) => page.getByRole("combobox").first();

test.describe("миттєвий пошук у шапці", () => {
  test("порожнє поле показує популярні запити, клік підставляє їх", async ({ page }) => {
    await page.goto("/about");
    await searchBox(page).click();
    const panel = page.getByTestId("search-panel");
    await expect(panel).toContainText("Часто шукають");
    await panel.getByRole("button", { name: "Спальник" }).click();
    await expect(searchBox(page)).toHaveValue("Спальник");
    await expect(page.getByRole("listbox", { name: "Знайдені товари" })).toBeVisible();
  });

  test("підказки з фото й ціною з'являються під час набору", async ({ page }) => {
    await page.goto("/delivery");
    await searchBox(page).fill("nature peak");
    const list = page.getByRole("listbox", { name: "Знайдені товари" });
    await expect(list).toBeVisible();
    const options = list.getByRole("option");
    expect(await options.count()).toBeGreaterThan(2);
    await expect(options.first()).toContainText("Nature Peak");
    await expect(options.first()).toContainText("₴");
    await expect(options.last()).toContainText(/Усі результати \(\d+\)/);
  });

  test("клавіатура: стрілка вниз + Enter відкриває товар", async ({ page }) => {
    await page.goto("/contacts");
    const box = searchBox(page);
    await box.fill("Nature Peak 3");
    await expect(page.getByRole("option").first()).toContainText("Намет Nature Peak 3");
    await box.press("ArrowDown");
    await expect(page.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
    await box.press("Enter");
    await expect(page).toHaveURL("/catalog/tents/np3");
  });

  test("Enter без вибору та «Усі результати» ведуть у каталог", async ({ page }) => {
    await page.goto("/about");
    await searchBox(page).fill("намет");
    await page.getByRole("option", { name: /Усі результати/ }).click();
    await expect(page).toHaveURL(/\/catalog\?q=%D0%BD%D0%B0%D0%BC%D0%B5%D1%82|\/catalog\?q=намет/);
    await expect(page.getByText(/за запитом «намет»/).first()).toBeVisible();
  });

  test("розпізнає неправильну розкладку клавіатури", async ({ page }) => {
    await page.goto("/about");
    await searchBox(page).fill("yfvtn");
    await expect(page.getByTestId("search-panel")).toContainText("Показуємо результати для «намет»");
    await expect(page.getByRole("option").first()).toContainText("Намет");
  });

  test("нічого не знайдено — підказка з популярними запитами; Escape закриває", async ({ page }) => {
    await page.goto("/about");
    await searchBox(page).fill("телевізор");
    await expect(page.getByTestId("search-panel")).toContainText("Нічого не знайдено за «телевізор»");
    await searchBox(page).press("Escape");
    await expect(page.getByTestId("search-panel")).toBeHidden();
  });

  test("клік поза підказками закриває їх", async ({ page }) => {
    await page.goto("/about");
    await searchBox(page).fill("рюкзак");
    await expect(page.getByTestId("search-panel")).toBeVisible();
    await page.locator("h1").click();
    await expect(page.getByTestId("search-panel")).toBeHidden();
  });

  test("каталог шукає так само, як підказки", async ({ page }) => {
    await page.goto("/catalog?q=nature%20peak");
    await expect(page.getByText(/за запитом «nature peak»/i).first()).toBeVisible();
  });
});
