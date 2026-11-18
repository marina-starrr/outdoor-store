import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OfferContent, { offerSections } from "../../app/components/OfferContent";
import { FREE_SHIPPING_FROM, RETURN_DAYS, paymentOptions } from "../../app/components/cart-logic";
import { formatPrice } from "../../app/components/catalog-data";
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

  it("умови збігаються з рештою сайту: строк повернення, оплата, безкоштовна доставка", () => {
    const html = render(fop);
    expect(html).toContain(`${RETURN_DAYS} днів`);
    for (const o of paymentOptions) expect(html).toContain(o.title);
    // Вимкнені способи оплати (картка, частинами) в оферті не обіцяємо
    expect(html).not.toContain("Карткою онлайн");
    expect(html).toContain(formatPrice(FREE_SHIPPING_FROM));
  });

  it("зміст посилається на кожен розділ", () => {
    const html = render(fop);
    for (const s of offerSections) {
      expect(html).toContain(`href="#${s.id}"`);
      expect(html).toContain(`id="${s.id}"`);
    }
  });
});
