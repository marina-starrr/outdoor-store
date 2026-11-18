import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { call, dbQuery } from "./helpers";

/*
 * Довідник міст Нової пошти зберігається в базі (а не у файлі, який на Vercel
 * не записати): перший запуск завантажує його з Нової пошти, щотижневий
 * Vercel Cron оновлює, а новий екземпляр сайту читає з бази без мережі.
 * Нова пошта тут підмінена — справжніх запитів немає.
 */

const SECRET = "test-cron-secret";

/** Відповідь getCities: 1200 населених пунктів, серед них Полтава */
function npResponse(extra = "") {
  const data = Array.from({ length: 1200 }, (_, i) => ({
    Ref: `ref-${i}${extra}`,
    Description: i === 0 ? "Полтава" : `Село${i}${extra} (Тестовий р-н, Полтавська обл)`,
    SettlementTypeDescription: i === 0 ? "місто" : "село",
    AreaDescription: "Полтавська",
  }));
  return new Response(JSON.stringify({ success: true, data, errors: [] }), { headers: { "content-type": "application/json" } });
}

const fetchMock = vi.fn(async () => npResponse());

beforeAll(() => {
  delete process.env.NP_CITIES_FIXTURE;
  process.env.CRON_SECRET = SECRET;
  vi.stubGlobal("fetch", fetchMock);
});
afterAll(() => {
  vi.unstubAllGlobals();
  delete process.env.CRON_SECRET;
});

const suggest = async (q: string) => {
  const cities = await import("../../app/api/cities/route");
  return call(cities.GET, { method: "GET", path: `/api/cities?q=${encodeURIComponent(q)}&method=np-branch`, ip: "10.40.0.1" });
};

describe("довідник міст у базі", () => {
  it("перший запуск: база порожня — завантажує з Нової пошти і зберігає", async () => {
    const r = await suggest("полт");
    expect(r.data.available).toBe(true);
    expect(r.data.cities[0]).toEqual({ ref: "ref-0", label: "м. Полтава, Полтавська обл." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [{ count }] = await dbQuery("select count(*)::int as count from np_cities");
    expect(count).toBe(1200);
    const [meta] = await dbQuery("select count from np_cities_meta");
    expect(meta.count).toBe(1200);
  });

  it("новий екземпляр сайту читає довідник з бази, без запиту до Нової пошти", async () => {
    vi.resetModules();
    fetchMock.mockClear();
    const r = await suggest("Село12");
    expect(r.data.cities.length).toBeGreaterThan(0);
    expect(r.data.cities[0].label).toBe("с. Село12, Тестовий р-н, Полтавська обл.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cron без секрету або з чужим — 401, Нова пошта не викликається", async () => {
    const cron = await import("../../app/api/cron/np-cities/route");
    fetchMock.mockClear();
    expect((await call(cron.GET, { method: "GET" })).status).toBe(401);
    const wrong = new Request("http://localhost:3000/api/cron/np-cities", { headers: { authorization: "Bearer nope" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((await cron.GET(wrong as any)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cron з секретом замінює довідник у базі новим", async () => {
    const cron = await import("../../app/api/cron/np-cities/route");
    fetchMock.mockImplementationOnce(async () => npResponse("x"));
    const req = new Request("http://localhost:3000/api/cron/np-cities", { headers: { authorization: `Bearer ${SECRET}` } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await cron.GET(req as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, cities: 1200 });
    const rows = await dbQuery("select ref from np_cities where ref = 'ref-5x' or ref = 'ref-5'");
    expect(rows.map((r) => r.ref)).toEqual(["ref-5x"]);
  });

  it("Нова пошта повернула підозріло мало міст — старий довідник лишається", async () => {
    const cron = await import("../../app/api/cron/np-cities/route");
    fetchMock.mockImplementationOnce(
      async () => new Response(JSON.stringify({ success: true, data: [], errors: [] }), { headers: { "content-type": "application/json" } }),
    );
    const req = new Request("http://localhost:3000/api/cron/np-cities", { headers: { authorization: `Bearer ${SECRET}` } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((await cron.GET(req as any)).status).toBe(502);
    const [{ count }] = await dbQuery("select count(*)::int as count from np_cities");
    expect(count).toBe(1200);
  });
});
