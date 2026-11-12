import { describe, expect, it } from "vitest";
import { maxQtyFor, MAX_QTY, resolveLines } from "../../app/components/cart-logic";
import { seedProducts, withDerived, type Product } from "../../app/components/catalog-data";
import { productDescription, productGallery } from "../../app/components/product-details";
import { applyProductInput, slugify, validateProduct } from "../../app/lib/admin-product";
import { canTransition, nextStatuses } from "../../app/lib/order-status";

const valid = {
  name: "Намет Тест 4",
  brand: "Tramp",
  category: "tents",
  price: "5000",
  oldPrice: "",
  stock: "7",
  specs: "4 місця · 5 кг",
  capacity: "4",
  photo: "meadow",
  attrs: [["Вага", "5 кг"], ["", "порожня назва — відкидається"]],
};

describe("перевірка товару з адмін-панелі", () => {
  it("правильні дані проходять і нормалізуються", () => {
    const { data, errors } = validateProduct(valid);
    expect(errors).toEqual({});
    expect(data).toMatchObject({ price: 5000, stock: 7, capacity: 4, oldPrice: null, attrs: [["Вага", "5 кг"]] });
  });

  it("помилки за кожним полем", () => {
    const { data, errors } = validateProduct({
      ...valid,
      name: "Н",
      brand: "",
      category: "cars",
      price: "-5",
      stock: "1.5",
      photo: "nope",
      customImage: "http://insecure.example/a.jpg",
      specs: "",
    });
    expect(data).toBeUndefined();
    expect(Object.keys(errors).sort()).toEqual(["brand", "category", "customImage", "name", "photo", "price", "specs", "stock"].sort());
  });

  it("стара ціна має бути більшою за нову", () => {
    expect(validateProduct({ ...valid, oldPrice: "4000" }).errors.oldPrice).toBeTruthy();
    expect(validateProduct({ ...valid, oldPrice: "6000" }).data?.oldPrice).toBe(6000);
  });

  it("код товару — лише латиниця, цифри, дефіс", () => {
    expect(validateProduct({ ...valid, id: "Намет!" }).errors.id).toBeTruthy();
    expect(validateProduct({ ...valid, id: "np-4" }).data?.id).toBe("np-4");
  });

  it("slugify транслітерує українську назву", () => {
    expect(slugify("Намет Nature Peak 4")).toBe("namet-nature-peak-4");
    expect(slugify("Гамак «Щастя» ’24")).toBe("hamak-shchastia-24");
  });

  it("applyProductInput: бренд у характеристиках, порожні необов'язкові поля прибираються", () => {
    const target: Partial<Product> = { oldPrice: 9000, customImage: "https://x/y.jpg", description: "старий" };
    applyProductInput(target, validateProduct({ ...valid, attrs: [["Бренд", "Старий бренд"], ["Вага", "5 кг"]] }).data!);
    expect(target.attrs).toEqual([["Бренд", "Tramp"], ["Вага", "5 кг"]]);
    expect(target.oldPrice).toBeUndefined();
    expect(target.customImage).toBeUndefined();
    expect(target.description).toBeUndefined();
    expect(target.inStock).toBe(true);
    expect(target.updatedAt).toBeTruthy();
  });
});

describe("склад і кошик", () => {
  const p = withDerived(seedProducts[0]);

  it("наявність рахується із залишку", () => {
    expect(withDerived({ ...p, stock: 0 }).inStock).toBe(false);
    expect(withDerived({ ...p, stock: 3 }).inStock).toBe(true);
  });

  it("у кошик — не більше залишку і не більше ліміту", () => {
    expect(maxQtyFor({ stock: 3 })).toBe(3);
    expect(maxQtyFor({ stock: 500 })).toBe(MAX_QTY);
    expect(maxQtyFor({ stock: 0 })).toBe(0);
  });

  it("приховані товари випадають з кошика", () => {
    const byId = new Map([[p.id, { ...p, hidden: true }]]);
    expect(resolveLines([{ id: p.id, qty: 1 }], byId)).toEqual([]);
  });

  it("власне фото та опис з адмін-панелі мають пріоритет", () => {
    const custom = withDerived({ ...p, customImage: "https://example.com/tent.jpg", description: "Перший абзац.\n\nДругий абзац." });
    expect(custom.image).toBe("https://example.com/tent.jpg");
    expect(productGallery(custom)[0].full).toBe("https://example.com/tent.jpg");
    expect(productDescription(custom)).toEqual(["Перший абзац.", "Другий абзац."]);
  });

  it("опис нового товару без характеристик не містить «undefined»", () => {
    const bare = withDerived({ ...p, id: "x", attrs: [["Бренд", "Tramp"]] });
    expect(productDescription(bare).join(" ")).not.toContain("undefined");
  });
});

describe("статуси замовлень", () => {
  it("дозволені переходи", () => {
    expect(canTransition("new", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "shipped")).toBe(true);
    expect(canTransition("shipped", "done")).toBe(true);
    expect(canTransition("new", "cancelled")).toBe(true);
  });

  it("заборонені переходи: назад, через крок, з фінальних статусів", () => {
    expect(canTransition("shipped", "new")).toBe(false);
    expect(canTransition("new", "done")).toBe(false);
    expect(canTransition("shipped", "cancelled")).toBe(false);
    expect(nextStatuses.done).toEqual([]);
    expect(nextStatuses.cancelled).toEqual([]);
  });
});
