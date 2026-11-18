import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dbQuery } from "./helpers";

/*
 * Лічильники лімітів — у базі: на Vercel кожен екземпляр функції має власну
 * пам'ять, тож ліміт у пам'яті не бачив би запитів до інших екземплярів.
 */

const load = () => import("../../app/lib/server/rate-limit");

const req = (headers: Record<string, string>) => new NextRequest("http://localhost:3000/api/x", { headers });

describe("обмеження частоти в базі", () => {
  it("max подій, далі — відмова", async () => {
    const { rateLimiter } = await load();
    const limited = rateLimiter("t-basic", 3, 60_000);
    expect([await limited("a"), await limited("a"), await limited("a"), await limited("a")]).toEqual([false, false, false, true]);
    // Інший ключ і інший ліміт рахуються окремо
    expect(await limited("b")).toBe(false);
    expect(await rateLimiter("t-other", 3, 60_000)("a")).toBe(false);
  });

  it("лічильник спільний для всіх екземплярів (переживає перезапуск модуля)", async () => {
    const first = await load();
    const limited = first.rateLimiter("t-shared", 2, 60_000);
    await limited("ip");
    await limited("ip");
    vi.resetModules();
    const second = await load();
    expect(await second.rateLimiter("t-shared", 2, 60_000)("ip")).toBe(true);
  });

  it("після закінчення вікна лічильник починається знову", async () => {
    const { rateLimiter } = await load();
    const limited = rateLimiter("t-window", 1, 60_000);
    await limited("ip");
    expect(await limited("ip")).toBe(true);
    await dbQuery("update rate_limits set reset_at = now() - interval '1 second' where key = 't-window|ip'");
    expect(await limited("ip")).toBe(false);
  });

  it("вхід: 5 невдалих спроб блокують, успішний вхід скидає лічильник", async () => {
    const { loginLimiter } = await load();
    const l = loginLimiter(req({ "x-forwarded-for": "7.7.7.7" }), "x@example.com");
    for (let i = 0; i < 5; i++) await l.fail();
    expect(await l.blocked()).toBe(true);
    await l.reset();
    expect(await l.blocked()).toBe(false);
  });
});

describe("IP клієнта", () => {
  afterEach(() => {
    delete process.env.VERCEL;
  });

  it("локально — з x-forwarded-for", async () => {
    const { clientIp } = await load();
    expect(clientIp(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(req({}))).toBe("local");
  });

  it("на Vercel — із заголовка платформи, підроблений x-forwarded-for ігнорується", async () => {
    process.env.VERCEL = "1";
    const { clientIp } = await load();
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6", "x-vercel-forwarded-for": "4.4.4.4", "x-real-ip": "3.3.3.3" }))).toBe("4.4.4.4");
  });
});
