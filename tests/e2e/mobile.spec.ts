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
