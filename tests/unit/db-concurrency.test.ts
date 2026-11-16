import { describe, expect, it, vi } from "vitest";

/*
 * Next завантажує модуль бази кілька разів (окремо для різних маршрутів).
 * Імітуємо це двома незалежними екземплярами модуля й перевіряємо, що
 * одночасні записи з обох не губляться, а читання не бачить застарілих даних.
 */

type DbModule = typeof import("../../app/lib/server/db");

async function freshInstance(): Promise<DbModule> {
  vi.resetModules();
  return import("../../app/lib/server/db");
}

/** Лічильник у полі, якого немає в типі Data — лише для тесту */
const counter = (d: object) => (d as { testCounter?: number }).testCounter ?? 0;
const bump = (d: object) => {
  (d as { testCounter?: number }).testCounter = counter(d) + 1;
};

describe("файлове сховище: кілька екземплярів модуля", () => {
  it("одночасні записи з двох екземплярів не губляться", async () => {
    const a = await freshInstance();
    const b = await freshInstance();
    expect(a).not.toBe(b);
    await a.write((d) => void ((d as { testCounter?: number }).testCounter = 0));

    const N = 40;
    await Promise.all(Array.from({ length: N }, (_, i) => (i % 2 ? a : b).write(bump)));
    expect(await a.read(counter)).toBe(N);
    expect(await b.read(counter)).toBe(N);
  });

  it("читання одразу бачить запис іншого екземпляра", async () => {
    const a = await freshInstance();
    const b = await freshInstance();
    for (let i = 0; i < 30; i++) {
      await Promise.all([a.write(bump), b.read(counter)]);
      const fromA = await a.read(counter);
      expect(await b.read(counter)).toBe(fromA);
    }
  });
});
