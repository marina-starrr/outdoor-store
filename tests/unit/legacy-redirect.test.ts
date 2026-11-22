import { afterEach, describe, expect, it, vi } from "vitest";

/* Стара адреса Vercel → власний домен; /api/ лишається (щогодинне оновлення) */

const loadConfig = async (siteUrl?: string) => {
  vi.resetModules();
  if (siteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = siteUrl;
  return (await import("../../next.config")).default;
};

const saved = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = saved;
});

describe("переадресація outdoor-store-ten.vercel.app", () => {
  it("на власний домен, постійна, лише для старого хоста і не для /api/", async () => {
    const config = await loadConfig("https://www.familycamping.pp.ua/");
    const [rule, ...rest] = await config.redirects!();
    expect(rest).toEqual([]);
    expect(rule).toMatchObject({
      destination: "https://www.familycamping.pp.ua/:path",
      permanent: true,
      has: [{ type: "host", value: "outdoor-store-ten.vercel.app" }],
    });
    // Шаблон шляху: усе, крім api/…
    const pattern = new RegExp(`^${rule.source.replace("/:path(", "/(")}$`);
    expect(pattern.test("/catalog/tactical")).toBe(true);
    expect(pattern.test("/")).toBe(true);
    expect(pattern.test("/api/cron/suppliers")).toBe(false);
  });

  it("без власного домену (розробка, тести) — без переадресації", async () => {
    expect(await (await loadConfig()).redirects!()).toEqual([]);
    expect(await (await loadConfig("http://localhost:3000")).redirects!()).toEqual([]);
    expect(await (await loadConfig("https://outdoor-store-ten.vercel.app")).redirects!()).toEqual([]);
  });
});
