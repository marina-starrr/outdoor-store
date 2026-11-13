import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll } from "./helpers";

const paths = ["/", "/catalog", "/catalog/tents", "/catalog/tents/np3", "/hits", "/cart", "/account", "/about", "/contacts", "/delivery", "/returns", "/privacy"];

test.describe("мобільна версія (390px)", () => {
  for (const path of paths) {
    test(`без горизонтальної прокрутки: ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalScroll(page);
    });
  }

  test("мобільне меню відкривається і веде на сторінки", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Відкрити меню" }).click();
    await page.getByRole("link", { name: "Доставка і оплата" }).first().click();
    await expect(page).toHaveURL("/delivery");
  });

  test("у шапці видно назву сайту", async ({ page }) => {
    await page.goto("/");
    const logo = page.locator("header").getByRole("link", { name: "На головну" });
    await expect(logo).toContainText("family");
    await expect(logo).toContainText("camping");
    await expect(logo.getByText("camping")).toBeVisible();
  });

  test("шапка вміщується навіть на вузькому екрані (360px)", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/");
    await expectNoHorizontalScroll(page);
    const menu = (await page.getByRole("button", { name: "Відкрити меню" }).boundingBox())!;
    expect(menu.x + menu.width).toBeLessThanOrEqual(360);
  });

  test("стрічка під hero показує всі три переваги", async ({ page }) => {
    await page.goto("/");
    for (const text of ["Швидка доставка", "Гарантія якості", "Допомога у виборі"]) {
      await expect(page.getByText(text, { exact: true })).toBeVisible();
    }
  });

  for (const name of ["Категорії — гортайте вбік", "Хіти продажу — гортайте вбік"]) {
    test(`слайдер «${name.split(" —")[0]}» гортається вбік`, async ({ page }) => {
      await page.goto("/");
      const row = page.getByRole("region", { name });
      await row.scrollIntoViewIfNeeded();
      const cards = row.locator(":scope > *");
      const first = (await cards.nth(0).boundingBox())!;
      const second = (await cards.nth(1).boundingBox())!;
      // Картки стоять в один ряд, а не одна під одною
      expect(Math.abs(second.y - first.y)).toBeLessThan(2);
      expect(second.x).toBeGreaterThan(first.x);
      const { scrollWidth, clientWidth } = await row.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
      expect(scrollWidth).toBeGreaterThan(clientWidth);
      await row.evaluate((el) => el.scrollBy({ left: 400, behavior: "instant" }));
      await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
      await expectNoHorizontalScroll(page);
    });
  }

  test("футер: «Каталог» і «Покупцям» у дві колонки", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    const catalog = (await footer.getByRole("heading", { name: "Каталог" }).boundingBox())!;
    const buyers = (await footer.getByRole("heading", { name: "Покупцям" }).boundingBox())!;
    expect(Math.abs(catalog.y - buyers.y)).toBeLessThan(2);
    expect(buyers.x).toBeGreaterThan(catalog.x + catalog.width);
  });

  test("тап по логотипу на головній повертає на початок", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, 2000));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    await page.locator("header").getByRole("link", { name: "На головну" }).tap();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page).toHaveURL("/");
  });

  test("список сортування вміщується в екран", async ({ page }) => {
    await page.goto("/catalog/tents");
    await page.getByRole("button", { name: /^Сортування:/ }).click();
    const box = (await page.getByRole("listbox").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await page.getByRole("option", { name: "Спочатку дешевші" }).click();
    await expect(page.getByRole("listbox")).toBeHidden();
  });
});
