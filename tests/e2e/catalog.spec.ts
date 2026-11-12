import { expect, test, type Page } from "@playwright/test";
import { parsePrice } from "./helpers";

const listing = (page: Page) => page.getByRole("region", { name: "Товари" }).or(page.locator('section[aria-label="Товари"]'));
const prices = async (page: Page) =>
  (await listing(page).locator("article span.text-lg").allTextContents()).map(parsePrice);
const sortButton = (page: Page) => page.getByRole("button", { name: /^Сортування:/ });

test.describe("випадний список сортування", () => {
  test("відкривається, показує варіанти і сортує за ціною", async ({ page }) => {
    await page.goto("/catalog/tents");
    await expect(page.locator("select")).toHaveCount(0); // замість системного <select>
    const button = sortButton(page);
    await expect(button).toHaveAttribute("aria-expanded", "false");

    await button.click();
    const list = page.getByRole("listbox", { name: "Сортування" });
    await expect(list).toBeVisible();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(list.getByRole("option")).toHaveCount(await list.getByRole("option").count());
    await expect(list.getByRole("option", { selected: true })).toHaveCount(1);

    await list.getByRole("option", { name: "Спочатку дешевші" }).click();
    await expect(list).toBeHidden();
    await expect(button).toHaveAccessibleName("Сортування: Спочатку дешевші");
    const asc = await prices(page);
    expect(asc.length).toBeGreaterThan(1);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));

    await button.click();
    await page.getByRole("option", { name: "Спочатку дорожчі" }).click();
    const desc = await prices(page);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
  });

  test("керується з клавіатури", async ({ page }) => {
    await page.goto("/catalog/tents");
    const button = sortButton(page);
    await button.focus();
    await page.keyboard.press("ArrowDown");
    const list = page.getByRole("listbox", { name: "Сортування" });
    await expect(list).toBeFocused();
    await page.keyboard.press("End");
    const last = list.getByRole("option").last();
    const lastLabel = (await last.textContent())!.trim();
    await page.keyboard.press("Enter");
    await expect(list).toBeHidden();
    await expect(button).toHaveAccessibleName(`Сортування: ${lastLabel}`);
    await expect(button).toBeFocused();

    // Escape закриває без зміни
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await expect(button).toHaveAccessibleName(`Сортування: ${lastLabel}`);
  });

  test("закривається кліком поза списком", async ({ page }) => {
    await page.goto("/catalog");
    await sortButton(page).click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.locator("h1").click();
    await expect(page.getByRole("listbox")).toBeHidden();
  });

  test("працює і на сторінці хітів", async ({ page }) => {
    await page.goto("/hits");
    await sortButton(page).click();
    await page.getByRole("option", { name: "Спочатку дешевші" }).click();
    await expect(sortButton(page)).toHaveAccessibleName("Сортування: Спочатку дешевші");
  });
});

test.describe("фільтри категорії", () => {
  test("бренд звужує список, чип фільтра його скидає", async ({ page }) => {
    await page.goto("/catalog/tents");
    const total = (await prices(page)).length;
    const aside = page.locator('aside[aria-label="Фільтри"]');
    const label = "Nature Peak";
    const checkbox = aside.getByRole("checkbox", { name: new RegExp(`^${label}`) });
    await aside.locator("label").filter({ hasText: label }).click();
    await expect(checkbox).toBeChecked();

    const chip = page.getByRole("button", { name: `Прибрати фільтр ${label}` });
    await expect(chip).toBeVisible();
    await expect(page).toHaveURL(/brand/i);
    const filtered = (await prices(page)).length;
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThanOrEqual(total);

    await chip.click();
    await expect(chip).toBeHidden();
  });

  test("фільтр за ціною з URL зберігається після перезавантаження", async ({ page }) => {
    await page.goto("/catalog/tents");
    await sortButton(page).click();
    await page.getByRole("option", { name: "Спочатку дешевші" }).click();
    await page.reload();
    await expect(sortButton(page)).toHaveAccessibleName("Сортування: Спочатку дешевші");
  });
});

test("пошук у шапці веде до каталогу з результатами", async ({ page }) => {
  await page.goto("/about");
  await page.getByPlaceholder("Що шукаєте?").fill("намет");
  await page.getByPlaceholder("Що шукаєте?").press("Enter");
  await expect(page).toHaveURL(/\/catalog\?q=/);
  await expect(page.getByText(/за запитом «намет»/).first()).toBeVisible();
});
