import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OfferContent, { offerSections } from "../../app/components/OfferContent";
import { RETURN_DAYS, paymentOptions } from "../../app/components/cart-logic";
import { SELLER, sellerCodeLabel, sellerTitle, type Seller } from "../../app/lib/seller";

/*
 * Публічна оферта: реквізити продавця й умови беруться з тих самих даних,
 * що й решта сайту, а без реквізитів сторінки й посилань на неї немає.
 */

const fop: Seller = { kind: "fop", name: "Тестенко Ірина Петрівна", code: "1234567890", address: "м. Полтава, вул. Тестова, 1" };
const tov: Seller = { kind: "tov", name: "ТОВ «Тест Кемпінг»", code: "12345678", address: "м. Київ, вул. Тестова, 2", iban: "UA213223130000026007233566001", bank: "АТ «Тестбанк»" };

const render = (seller: Seller) => renderToStaticMarkup(createElement(OfferContent, { seller }));

describe("публічна оферта", () => {
  it("поки реквізитів немає — оферта вимкнена (сторінка 404, посилань немає)", () => {
    // Вигаданих реквізитів на сайті бути не повинно: SELLER заповнюється лише справжніми даними власника
    expect(SELLER).toBeNull();
  });

  it("ФОП: ПІБ з префіксом і РНОКПП", () => {
    expect(sellerTitle(fop)).toBe("ФОП Тестенко Ірина Петрівна");
    expect(sellerCodeLabel(fop)).toBe("РНОКПП");
    const html = render(fop);
    expect(html).toContain("ФОП Тестенко Ірина Петрівна");
    expect(html).toContain("1234567890");
    expect(html).toContain("м. Полтава, вул. Тестова, 1");
    expect(html).not.toContain("IBAN");
  });

  it("ТОВ: назва без префікса, ЄДРПОУ і рахунок", () => {
    expect(sellerTitle(tov)).toBe("ТОВ «Тест Кемпінг»");
    expect(sellerCodeLabel(tov)).toBe("Код ЄДРПОУ");
    const html = render(tov);
    expect(html).toContain("Код ЄДРПОУ");
    expect(html).toContain("UA213223130000026007233566001");
  });

  it("умови повернення сховані, поки власник не ввімкне (NEXT_PUBLIC_RETURNS=1)", () => {
    const saved = process.env.NEXT_PUBLIC_RETURNS;
    try {
      delete process.env.NEXT_PUBLIC_RETURNS;
      let html = render(fop);
      expect(html).not.toContain("Обмін і повернення");
      expect(html).not.toContain('href="/returns"');
      expect(offerSections().map((s) => s.id)).not.toContain("returns");

      process.env.NEXT_PUBLIC_RETURNS = "1";
      html = render(fop);
      expect(html).toContain(`${RETURN_DAYS} днів`);
      expect(html).toContain('href="/returns"');
      expect(offerSections().map((s) => s.id)).toContain("returns");
    } finally {
      if (saved === undefined) delete process.env.NEXT_PUBLIC_RETURNS;
      else process.env.NEXT_PUBLIC_RETURNS = saved;
    }
  });

  it("умови збігаються з рештою сайту: оплата, відправка, безкоштовна доставка", () => {
    const html = render(fop);
    for (const o of paymentOptions) expect(html).toContain(o.title);
    // Накладений платіж: оплата при отриманні готівкою або карткою
    expect(html).toContain("готівкою або карткою");
    expect(html).toMatch(/будні.*14:00/);
    // Вимкнені способи оплати (картка, частинами) в оферті не обіцяємо
    expect(html).not.toContain("Карткою онлайн");
    // Доставка — за тарифами перевізника, без безкоштовної доставки
    expect(html).toContain("за тарифами перевізника");
    expect(html).not.toMatch(/безкоштовн/i);
  });

  it("зміст посилається на кожен розділ", () => {
    const html = render(fop);
    for (const s of offerSections()) {
      expect(html).toContain(`href="#${s.id}"`);
      expect(html).toContain(`id="${s.id}"`);
    }
  });
});
