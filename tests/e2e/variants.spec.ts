import { expect, test, type APIRequestContext } from "@playwright/test";
import { helperAdminApi } from "./helpers";

/*
 * Варіанти товару: розміри одного товару (окремі товари в базі) — одна картка
 * в каталозі й вибір розміру на сторінці товару.
 */
test.describe.configure({ mode: "serial" });

const SIZES = [
  { size: "S", stock: 4 },
  { size: "M", stock: 0 },
  { size: "L", stock: 2 },
];
const ids: string[] = [];
let api: APIRequestContext;

test.beforeAll(async ({ baseURL }) => {
  api = await helperAdminApi(baseURL!);
  for (const { size, stock } of SIZES) {
    const r = await api.post("/api/admin/products", {
      data: {
        name: `Термобілизна Варіантна Тест (${size})`,
        brand: "Ranger",
        category: "clothing",
        price: size === "L" ? 990 : 890,
        stock,
        specs: "Тест",
        photo: "meadow",
        images: [],
        attrs: [],
      },
    });
    expect(r.ok(), await r.text()).toBe(true);
    ids.push((await r.json()).product.id);
  }
});
test.afterAll(async () => {
  for (const id of ids) await api.delete(`/api/admin/products/${id}`);
  await api.dispose();
});

test("каталог: одна картка на всі розміри, «від» найменшої ціни, кнопка веде обрати розмір", async ({ page }) => {
  await page.goto("/catalog/clothing?q=Варіантна");
  const cards = page.locator("article", { hasText: "Термобілизна Варіантна Тест" });
  await expect(cards).toHaveCount(1);
  const card = cards.first();
  await expect(card.getByRole("heading")).toHaveText("Термобілизна Варіантна Тест");
  await expect(card).toContainText("3 розміри");
  await expect(card).toContainText("від 890 ₴");
  await card.getByRole("link", { name: /Обрати розмір/ }).click();
  await expect(page.getByTestId("variant-picker")).toBeVisible();
});

test("сторінка товару: вибір розміру відкриває цей розмір; відсутній — закреслений", async ({ page }) => {
  await page.goto("/catalog/clothing?q=Варіантна");
  await page.locator("article", { hasText: "Термобілизна Варіантна Тест" }).getByRole("heading").getByRole("link").click();
  // Попередня сторінка лишається в DOM схованою (Next зберігає стан маршрутів) — беремо видиму
  const picker = page.getByTestId("variant-picker").filter({ visible: true });
  await expect(picker).toContainText("Розмір: S");
  await expect(picker.getByRole("link", { name: "Розмір M — немає в наявності" })).toBeVisible();

  await picker.getByRole("link", { name: "Розмір L" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Термобілизна Варіантна Тест (L)" })).toBeVisible();
  await expect(picker).toContainText("Розмір: L");
  await expect(page.getByText("990 ₴").first()).toBeVisible();
  // Для Google усі розміри — одна сторінка: canonical веде на основний (перший) розмір
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/catalog/clothing/${ids[0]}$`));
  // У кошик — саме обраний розмір
  await page.getByRole("button", { name: /^Додати в кошик/ }).first().click();
  await page.goto("/cart");
  await expect(page.locator("main")).toContainText("Термобілизна Варіантна Тест (L)");
});
