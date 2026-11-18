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

  test("заголовки безпеки: CSP, HSTS, заборона вбудовування в чужі сайти", async ({ request }) => {
    for (const path of ["/", "/catalog/tents/np3", "/api/auth/me"]) {
      const h = (await request.get(path)).headers();
      expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(h["content-security-policy"]).toContain("object-src 'none'");
      expect(h["strict-transport-security"]).toContain("max-age=63072000");
      expect(h["x-frame-options"]).toBe("DENY");
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    }
  });

  test("CSP не ламає сторінку: без порушень політики в консолі", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
    });
    await page.goto("/catalog/tents/np3");
    await page.getByRole("button", { name: "Додати в кошик" }).first().click();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(violations).toEqual([]);
  });

  test("оферта: поки немає реквізитів продавця — 404 і посилань немає", async ({ page, request }) => {
    expect((await request.get("/offer")).status()).toBe(404);
    await page.goto("/delivery");
    await expect(page.locator("a[href='/offer']")).toHaveCount(0);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).not.toContain("/offer");
  });

  test("головна: ціни «від … ₴» у категоріях — з каталогу", async ({ page }) => {
    await page.goto("/");
    const prices = await page.locator(".category-price").allTextContents();
    expect(prices.length).toBe(4);
    for (const p of prices) expect(p).toMatch(/^від \d[\d\s ]* ₴$/);
  });

  test("головна: власний заголовок і мікророзмітка магазину з пошуком", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Family Camping — туристичне спорядження/);
    const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).join(" ");
    expect(ld).toContain('"OnlineStore"');
    expect(ld).toContain('"SearchAction"');
  });
});
