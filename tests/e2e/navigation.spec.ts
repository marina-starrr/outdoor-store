import { expect, test } from "@playwright/test";

const pages = [
  { path: "/", h1: /Family/ },
  { path: "/catalog", h1: /Каталог/ },
  { path: "/catalog/tents", h1: /Намети/ },
  { path: "/catalog/tents/np3", h1: /Nature Peak 3/ },
  { path: "/hits", h1: /Хіти/ },
  { path: "/cart", h1: /Кошик/ },
  { path: "/account", h1: /./ },
  { path: "/favorites", h1: /Обране/ },
  { path: "/compare", h1: /Порівняння/ },
  { path: "/notifications", h1: /Сповіщення/ },
  { path: "/about", h1: /сімейного відпочинку/ },
  { path: "/contacts", h1: /зв’язку/ },
  { path: "/delivery", h1: /Доставка/ },
  { path: "/privacy", h1: /Політика/ },
];

test.describe("усі сторінки відкриваються без помилок", () => {
  for (const { path, h1 } of pages) {
    test(path, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator("h1").first()).toHaveText(h1);
      await page.waitForLoadState("networkidle");
      // Помилки гідратації, JS-винятки тощо
      expect(errors.filter((e) => !e.includes("images.unsplash.com"))).toEqual([]);
    });
  }
});

test("обмін і повернення поки сховано: сторінки й посилань немає", async ({ page }) => {
  const res = await page.goto("/returns");
  expect(res?.status()).toBe(404);
  await page.goto("/catalog/tents/np3");
  await expect(page.locator('a[href="/returns"]')).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("Обмін і повернення");
});

test("сторінка товару: коли відправимо — за київським часом, у будні до 14:00", async ({ page }) => {
  await page.goto("/catalog/tents/np3");
  await expect(page.getByText("Замовлення, оформлені в будні до 14:00, відправляємо того ж дня")).toBeVisible();
  await expect(page.getByText(/Є в наявності · відправимо (сьогодні|завтра|в понеділок)|Залишилось лише \d+ шт\. · відправимо/)).toBeVisible();
});

test("неіснуючий товар показує сторінку «не знайдено»", async ({ page }) => {
  await page.goto("/catalog/tents/no-such-product");
  await expect(page.getByText(/не знайдено|404/i).first()).toBeVisible();
});

test("пункти меню ведуть на правильні сторінки й підсвічуються", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Головна навігація" });
  for (const [label, url] of [
    ["Каталог", "/catalog"],
    ["Хіти", "/hits"],
    ["Доставка і оплата", "/delivery"],
    ["Про нас", "/about"],
    ["Контакти", "/contacts"],
  ]) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(url);
    await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
  }
});

test.describe("футер", () => {
  test("посилання ведуть на інформаційні сторінки", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await expect(footer.getByRole("link", { name: "Обмін і повернення" })).toHaveCount(0);
    await footer.getByRole("link", { name: "Доставка і оплата" }).click();
    await expect(page).toHaveURL("/delivery");
    await page.locator("footer").getByRole("link", { name: "Політика конфіденційності" }).click();
    await expect(page).toHaveURL("/privacy");
  });

  test("клік на поточну сторінку прокручує на початок", async ({ page }) => {
    await page.goto("/delivery");
    await page.locator("footer").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);

    await page.locator("footer").getByRole("link", { name: "Доставка і оплата" }).click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page).toHaveURL("/delivery");
  });

  test("те саме для меню в шапці та логотипа", async ({ page }) => {
    await page.goto("/about");
    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.getByRole("navigation", { name: "Головна навігація" }).getByRole("link", { name: "Про нас" }).click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.getByRole("link", { name: "На головну" }).click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("бічне меню інформаційних сторінок", async ({ page }) => {
    await page.goto("/privacy");
    const side = page.getByRole("navigation", { name: "Інформація для покупців" });
    await expect(side.getByRole("link", { name: "Політика конфіденційності" })).toHaveAttribute("aria-current", "page");
    await side.getByRole("link", { name: "Контакти" }).click();
    await expect(page).toHaveURL("/contacts");
  });
});
