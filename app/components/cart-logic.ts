import type { Product } from "./catalog-data";

export const FREE_SHIPPING_FROM = 3000;
export const MAX_QTY = 20;

export type CartLine = { id: string; qty: number };
export type ResolvedLine = CartLine & { product: Product };

/** Скільки одиниць товару можна покласти в кошик: не більше ліміту і залишку на складі */
export const maxQtyFor = (p: Pick<Product, "stock">) => Math.max(0, Math.min(MAX_QTY, p.stock));

/**
 * Додає до рядків кошика дані товару; невідомі й приховані товари
 * (напр. видалені з каталогу) відкидаються
 */
export function resolveLines(lines: CartLine[], byId: ReadonlyMap<string, Product>): ResolvedLine[] {
  return lines.flatMap((l) => {
    const product = byId.get(l.id);
    return product && !product.hidden ? [{ ...l, product }] : [];
  });
}

/* ---------- Доставка ---------- */

/** Магазин працює лише онлайн, тож самовивозу немає — тільки доставка */
export type DeliveryId = "np-branch" | "np-courier" | "ukrposhta";

export const isDeliveryId = (v: unknown): v is DeliveryId =>
  deliveryOptions.some((o) => o.id === v);

export const deliveryOptions: {
  id: DeliveryId;
  title: string;
  text: string;
  price: number;
  /** Чи діє безкоштовна доставка від FREE_SHIPPING_FROM */
  freeAbove: boolean;
}[] = [
  { id: "np-branch", title: "Нова пошта — відділення", text: "1–3 дні, відділення або поштомат", price: 70, freeAbove: true },
  { id: "np-courier", title: "Нова пошта — кур'єр", text: "1–3 дні, доставка до дверей", price: 120, freeAbove: false },
  { id: "ukrposhta", title: "Укрпошта", text: "3–5 днів, у відділення", price: 45, freeAbove: true },
];

/** Скільки днів перевізник зберігає посилку у відділенні */
export const PARCEL_STORAGE_DAYS = 5;
/** Строк повернення за Законом України «Про захист прав споживачів» */
export const RETURN_DAYS = 14;

export const deliveryPrice = (id: DeliveryId, subtotal: number) => {
  const option = deliveryOptions.find((o) => o.id === id)!;
  return option.freeAbove && subtotal >= FREE_SHIPPING_FROM ? 0 : option.price;
};

/* ---------- Оплата ---------- */

export type PaymentId = "card" | "cod" | "parts";

export const paymentOptions: { id: PaymentId; title: string; text: string; minTotal?: number }[] = [
  { id: "card", title: "Карткою онлайн", text: "Visa, Mastercard, Apple Pay, Google Pay" },
  { id: "cod", title: "Накладений платіж", text: "Оплата при отриманні, комісія перевізника" },
  { id: "parts", title: "Оплата частинами", text: "До 6 платежів без переплат", minTotal: 3000 },
];

/* ---------- Промокоди ---------- */

export const promoCodes: Record<string, { percent: number; label: string }> = {
  FAMILY10: { percent: 10, label: "−10% для всієї родини" },
  CAMP5: { percent: 5, label: "−5% на перше замовлення" },
};

/* ---------- Підсумки ---------- */

export function cartTotals(
  lines: ResolvedLine[],
  delivery: DeliveryId = "np-branch",
  promo?: string,
) {
  const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const savings = lines.reduce(
    (s, l) => s + ((l.product.oldPrice ?? l.product.price) - l.product.price) * l.qty,
    0,
  );
  const percent = promo ? (promoCodes[promo]?.percent ?? 0) : 0;
  const promoDiscount = Math.round((subtotal * percent) / 100);
  const shipping = lines.length ? deliveryPrice(delivery, subtotal) : 0;
  return {
    count: lines.reduce((s, l) => s + l.qty, 0),
    subtotal,
    savings,
    promoDiscount,
    shipping,
    total: subtotal - promoDiscount + shipping,
    leftForFreeShipping: Math.max(0, FREE_SHIPPING_FROM - subtotal),
  };
}

/**
 * «Вам також знадобиться»: спершу товари з інших категорій (до намету —
 * спальник, до рюкзака — посуд), далі хіти та найвищий рейтинг
 */
export function cartRecommendations(products: Product[], lines: ResolvedLine[], limit = 4) {
  const inCart = new Set(lines.map((l) => l.id));
  const categories = new Set(lines.map((l) => l.product.category));
  const complementary = (p: Product) => (categories.has(p.category) ? 0 : 1);
  return products
    .filter((p) => !inCart.has(p.id) && p.inStock && !p.hidden)
    .sort(
      (a, b) =>
        complementary(b) - complementary(a) ||
        Number(!!b.hit) - Number(!!a.hit) ||
        b.rating - a.rating,
    )
    .slice(0, limit);
}
