import { expect, test } from "@playwright/test";
import { expectCartCount, viewProduct } from "./helpers";

test("сторінка товару: кількість і додавання в кошик", async ({ page }) => {
  await viewProduct(page, "/catalog/tents/np3");
  await expectCartCount(page, 0);
  await page.getByRole("button", { name: "Збільшити кількість" }).first().click();
  await page.getByRole("button", { name: /^Додати в кошик/ }).first().click();
  await expectCartCount(page, 2);
  await expect(page.getByRole("status")).toContainText("× 2 — у кошику");
  // Кошик пам'ятається після перезавантаження
  await page.reload();
  await expectCartCount(page, 2);
});

test.describe("нещодавно переглянуті", () => {
  test("на початку блоку немає", async ({ page }) => {
    await page.goto("/catalog");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("recently-viewed")).toHaveCount(0);
  });

  test("показує переглянуті товари, найновіші першими, без поточного", async ({ page }) => {
    await viewProduct(page, "/catalog/tents/np3");
    await expect(page.locator("h1")).toContainText("Nature Peak 3");
    // На сторінці першого переглянутого товару блок порожній (сам товар не показуємо)
    await expect(page.getByTestId("recently-viewed")).toHaveCount(0);

    await viewProduct(page, "/catalog/backpacks/bp-trail45");
    const onProduct = page.getByTestId("recently-viewed");
    await expect(onProduct).toBeVisible();
    await expect(onProduct.locator("article")).toHaveCount(1);
    await expect(onProduct).toContainText("Nature Peak 3");
    await expect(onProduct).not.toContainText("Trail Pro 45L");

    for (const path of ["/catalog", "/catalog/sleeping-bags", "/", "/cart"]) {
      await page.goto(path);
      const block = page.getByTestId("recently-viewed");
      await expect(block, path).toBeVisible();
      const titles = await block.locator("article h3").allTextContents();
      expect(titles[0], path).toContain("Trail Pro 45L");
      expect(titles[1], path).toContain("Nature Peak 3");
    }
  });

  test("повторний перегляд піднімає товар на початок і не дублює", async ({ page }) => {
    await viewProduct(page, "/catalog/tents/np3");
    await viewProduct(page, "/catalog/backpacks/bp-trail45");
    await viewProduct(page, "/catalog/tents/np3");
    await page.goto("/catalog");
    const titles = await page.getByTestId("recently-viewed").locator("article h3").allTextContents();
    expect(titles).toHaveLength(2);
    expect(titles[0]).toContain("Nature Peak 3");
  });

  test("можна додати в кошик прямо з блоку і очистити історію", async ({ page }) => {
    await viewProduct(page, "/catalog/tents/np3");
    await page.goto("/catalog");
    const block = page.getByTestId("recently-viewed");
    await block.getByRole("button", { name: /^Додати .* у кошик$/ }).first().click();
    await expectCartCount(page, 1);

    await block.getByRole("button", { name: "Очистити історію" }).click();
    await expect(page.getByTestId("recently-viewed")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("family-camping-recent"))).toBeNull();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Гарячі пропозиції" })).toBeVisible();
    await expect(page.getByTestId("recently-viewed")).toHaveCount(0);
  });
});
