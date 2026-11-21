import { describe, expect, it } from "vitest";
import { formatPrice } from "../../app/components/catalog-data";
import { returnsInfoEnabled, shipDay } from "../../app/components/shop-config";

/* Київ узимку — UTC+2: 14:00 за Києвом = 12:00 UTC */
const kyiv = (iso: string) => new Date(`${iso}+02:00`);

describe("коли відправимо: будні до 14:00 — сьогодні", () => {
  it("будній день до 14:00 — сьогодні", () => {
    expect(shipDay(kyiv("2026-11-23T09:00:00"))).toBe("сьогодні"); // понеділок
    expect(shipDay(kyiv("2026-11-27T13:59:00"))).toBe("сьогодні"); // п'ятниця
  });

  it("будній день після 14:00 — завтра, а в п'ятницю — в понеділок", () => {
    expect(shipDay(kyiv("2026-11-23T14:00:00"))).toBe("завтра");
    expect(shipDay(kyiv("2026-11-26T22:30:00"))).toBe("завтра"); // четвер
    expect(shipDay(kyiv("2026-11-27T14:05:00"))).toBe("в понеділок");
  });

  it("вихідні — в понеділок (неділя — «завтра»)", () => {
    expect(shipDay(kyiv("2026-11-28T10:00:00"))).toBe("в понеділок"); // субота
    expect(shipDay(kyiv("2026-11-29T10:00:00"))).toBe("завтра"); // неділя
  });

  it("рахує за київським часом, а не за часом сервера", () => {
    // 12:30 UTC = 14:30 за Києвом — уже після межі
    expect(shipDay(new Date("2026-11-23T12:30:00Z"))).toBe("завтра");
    expect(shipDay(new Date("2026-11-23T11:30:00Z"))).toBe("сьогодні");
  });
});

describe("ціни з копійками", () => {
  it("цілі — без копійок, не цілі — з копійками через кому", () => {
    expect(formatPrice(1237)).toBe("1 237 ₴");
    expect(formatPrice(1236.9)).toBe("1 236,90 ₴");
    expect(formatPrice(437.5)).toBe("437,50 ₴");
    expect(formatPrice(1236.9 * 3)).toBe("3 710,70 ₴");
    expect(formatPrice(12500)).toBe("12 500 ₴");
  });
});

describe("обмін і повернення", () => {
  it("за замовчуванням сховано", () => {
    expect(returnsInfoEnabled()).toBe(false);
  });
});
