import { describe, expect, it } from "vitest";
import type { CategorySlug, Product } from "../../app/components/catalog-data";
import { baseTitle, collapseVariants, variantGroups, variantOptions, variantSummary, variantValue } from "../../app/components/product-variants";

let seq = 0;
const make = (name: string, category: CategorySlug, over: Partial<Product> = {}): Product =>
  ({
    id: `v${++seq}`,
    name,
    category,
    brand: "Ranger",
    price: 500,
    rating: 0,
    reviews: 0,
    inStock: true,
    stock: 3,
    specs: "",
    image: "",
    photo: "",
    attrs: [],
    popularity: seq,
    ...over,
  }) as Product;

describe("варіанти товару", () => {
  it("розміри термобілизни — одна група з шести розмірів", () => {
    const items = ["XS", "S", "L", "XL", "XXL", "XXХL"].map((s) => make(`Термобілизна Ranger Active (${s}) (Арт. RA 8843${s})`, "clothing"));
    const groups = variantGroups(items);
    const g = groups.get(items[0].id)!;
    expect(g.members).toHaveLength(6);
    expect(g.dims).toEqual(["size"]);
    expect(g.title).toBe("Термобілизна Ranger Active");
    expect(variantSummary(g)).toBe("6 розмірів");
    expect(items.map((p) => variantValue(p, "size"))).toEqual(["XS", "S", "L", "XL", "XXL", "XXXL"]);
  });

  it("колір × розмір: шапки Ranger 55-57 / 58-61 у трьох кольорах", () => {
    const items = [
      make("Шапка флісова Ranger мультикам 55-57 (RA8951)", "tactical"),
      make("Шапка флісова Ranger мультикам 58-61 (RA89511)", "tactical"),
      make("Шапка флісова Ranger олива 55-57 (RA8950)", "tactical", { inStock: false, stock: 0 }),
      make("Шапка флісова Ranger піксель 55-57 (RA8952)", "tactical"),
      make("Шапка флісова Ranger піксель 58-61 (RA89521)", "tactical"),
      // інша модель («герб») — окрема група
      make("Шапка флісова герб Ranger піксель 55-57 (RA8955)", "tactical"),
      make("Шапка флісова герб Ranger піксель 58-61 (RA89551)", "tactical"),
    ];
    const groups = variantGroups(items);
    const g = groups.get(items[0].id)!;
    expect(g.members).toHaveLength(5);
    expect(g.dims).toEqual(["color", "size"]);
    expect(g.title).toBe("Шапка флісова Ranger");
    expect(variantSummary(g)).toBe("3 кольори · 2 розміри");
    expect(groups.get(items[5].id)!.members).toHaveLength(2);

    // Вибір кольору зберігає розмір; олива 58-61 немає — веде на оливу 55-57
    const colors = variantOptions(items[1], g, "color");
    expect(colors.map((o) => [o.value, o.product.name.includes("58-61"), o.available])).toEqual([
      ["Мультикам", true, true],
      ["Піксель", true, true],
      ["Олива", false, false],
    ]);
    const sizes = variantOptions(items[0], g, "size");
    expect(sizes.map((o) => [o.value, o.selected])).toEqual([["55–57", true], ["58–61", false]]);
  });

  it("підсумки Kirasa в кольорах; одяг Kirasa з розміром у дужках і з літерою", () => {
    const pouches = ["мультикам", "піксель", "чорний"].map((c) => make(`Підсумок подвійний під ріжки Kirasa ${c} (Арт.KI22${c.length})`, "tactical", { brand: "Kirasa" }));
    const tees = ["48M", "50L", "54XXL", "56 3XL"].map((s) => make(`Адаптивна футболка при травмуванні, Kirasa меланж ${s} (Арт KI427)`, "tactical", { brand: "Kirasa" }));
    const fleece = ["46", "48", "50"].map((s) => make(`Кофта флісова Kirasa 320г/м хакі (${s}) (Арт KI413-${s})`, "tactical", { brand: "Kirasa" }));
    const groups = variantGroups([...pouches, ...tees, ...fleece]);
    expect(groups.get(pouches[0].id)!.members).toHaveLength(3);
    expect(groups.get(tees[0].id)!.members).toHaveLength(4);
    expect(groups.get(tees[0].id)!.title).toBe("Адаптивна футболка при травмуванні, Kirasa меланж");
    expect(groups.get(fleece[0].id)!.title).toBe("Кофта флісова Kirasa 320г/м");
    expect(baseTitle(fleece[1])).toBe("Кофта флісова Kirasa 320г/м");
  });

  it("не групує різні моделі, різні бренди й неоднозначні набори", () => {
    const rods = ["4м", "5м", "6м"].map((l) => make(`Вудка карбонова GLADIATOR QUEEN без кілець ${l} (GL68)`, "fishing"));
    const tents = [make("Намет Ranger Scout 3 (Арт. RA 6621)", "tents"), make("Намет Ranger Scout 4 (Арт. RA 6622)", "tents")];
    // Колір є лише в одного — незрозуміло, що обирати
    const thermos = [make("Термос Ranger Expert 0,9 L (Арт. RA 9920)", "thermos"), make("Термос Ranger Expert 0,9 L Black (Арт. RA 9932)", "thermos")];
    const brands = [make("Шапка флісова мультикам", "tactical", { brand: "A" }), make("Шапка флісова піксель", "tactical", { brand: "B" })];
    expect(variantGroups([...rods, ...tents, ...thermos, ...brands]).size).toBe(0);
  });

  it("каталог: одна картка на групу — на місці першого, показуємо той, що в наявності", () => {
    const a = make("Гамак Ranger Style blue (Арт. RA 7723)", "hammocks", { inStock: false, stock: 0 });
    const other = make("Гамак Ranger Oasis blue (Арт. RA 7725)", "hammocks");
    const b = make("Гамак Ranger Style red (Арт. RA 7724)", "hammocks");
    const list = [a, other, b];
    const cards = collapseVariants(list, variantGroups(list));
    expect(cards.map((c) => c.product.id)).toEqual([b.id, other.id]);
    expect(cards[0].group!.title).toBe("Гамак Ranger Style");
  });
});
