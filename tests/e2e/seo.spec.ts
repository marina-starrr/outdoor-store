import { expect, test } from "@playwright/test";

test.describe("SEO", () => {
  test("robots.txt дозволяє сайт і вказує на sitemap", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain("Allow: /");
    expect(text).toContain("Disallow: /api/");
    expect(text).toContain("Disallow: /admin");
    expect(text).toMatch(/Sitemap: .*\/sitemap\.xml/);
  });

  test("sitemap.xml містить головну, категорії, товари й інформаційні сторінки, без службових", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    expect(locs).toEqual(expect.arrayContaining(["/", "/catalog", "/hits", "/catalog/tents", "/catalog/tents/np3", "/delivery", "/privacy"]));
    expect(locs.length).toBeGreaterThan(60);
    for (const hidden of ["/cart", "/account", "/favorites", "/compare", "/admin"]) expect(locs).not.toContain(hidden);
    expect(xml).toContain("<image:loc>");
  });

  test("невідомі товари й категорії повертають справжній 404", async ({ request }) => {
    expect((await request.get("/catalog/tents/no-such-tent")).status()).toBe(404);
    expect((await request.get("/catalog/no-such-category")).status()).toBe(404);
    expect((await request.get("/catalog/tents/np3/extra")).status()).toBe(404);
    expect((await request.get("/catalog/tents/np3")).status()).toBe(200);
  });

  test("сторінка 404 у стилі сайту з пошуком", async ({ page }) => {
    await page.goto("/catalog/tents/no-such-tent");
    await expect(page.locator("h1")).toHaveText("Сторінку не знайдено");
    await page.locator("#nf-search").fill("намет");
    await page.getByRole("button", { name: "Знайти" }).click();
    await expect(page).toHaveURL(/\/catalog\?q=/);
  });

  test("мета-теги товару: заголовок, опис, canonical, Open Graph, мікророзмітка", async ({ page }) => {
    await page.goto("/catalog/tents/np3");
    await expect(page).toHaveTitle("Намет Nature Peak 3 — Family Camping");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.{50,}/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/catalog\/tents\/np3$/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /^https:\/\//);
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    const types = ld.flatMap((s) => [JSON.parse(s)].flat().map((x: { "@type": string }) => x["@type"]));
    expect(types).toEqual(expect.arrayContaining(["Product", "BreadcrumbList"]));
  });

  test("сторінки з фільтрами мають canonical без параметрів", async ({ page }) => {
    await page.goto("/catalog/tents?brand=Tramp&sort=cheap");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/catalog\/tents$/);
  });

  test("службові сторінки закриті від індексації", async ({ page }) => {
    for (const path of ["/cart", "/account", "/favorites", "/compare", "/admin"]) {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]').first(), path).toHaveAttribute("content", /noindex/);
    }
  });

  test("головна: власний заголовок і мікророзмітка магазину з пошуком", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Family Camping — туристичне спорядження/);
    const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).join(" ");
    expect(ld).toContain('"OnlineStore"');
    expect(ld).toContain('"SearchAction"');
  });
});
