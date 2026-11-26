import type { Product } from "./catalog-data";
import { discountsEnabled } from "./shop-config";

export const MAX_QTY = 20;

export type CartLine = { id: string; qty: number };
export type ResolvedLine = CartLine & { product: Product };

/** Скільки одиниць товару можна покласти в кошик: не більше ліміту і залишку на складі */
/** Скільки можна покласти в кошик: залишок, а для товару «під замовлення» — до MAX_QTY */
export const maxQtyFor = (p: Pick<Product, "stock" | "onRequest">) =>
  p.onRequest && p.stock > 0 ? MAX_QTY : Math.max(0, Math.min(MAX_QTY, p.stock));

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

/**
 * Вартість доставки — за тарифами перевізника: покупець сплачує її при
 * отриманні посилки. У сумі замовлення доставки немає (shipping = 0)
 */
export const deliveryOptions: {
  id: DeliveryId;
  title: string;
  text: string;
}[] = [
  { id: "np-branch", title: "Нова пошта — відділення", text: "1–3 дні, відділення або поштомат" },
  { id: "np-courier", title: "Нова пошта — кур'єр", text: "1–3 дні, доставка до дверей" },
  { id: "ukrposhta", title: "Укрпошта", text: "3–5 днів, у відділення" },
];

export const SHIPPING_BY_CARRIER = "За тарифами перевізника";

/**
 * Куди доставити — одним рядком: «м. Полтава, Відділення №3: вул. Просвіти, 13».
 * Старі замовлення зберігали лише номер відділення, Укрпошта — індекс
 */
export function deliveryWhere(d: { method?: string; city?: string; branch?: string; address?: string }) {
  const branch = d.branch && /^\d+$/.test(d.branch) ? (d.method === "ukrposhta" ? `індекс ${d.branch}` : `№ ${d.branch}`) : d.branch;
  return [d.city, branch, d.address].filter(Boolean).join(", ");
}

/** Підпис вартості доставки в замовленні (старі замовлення могли мати фіксовану ціну) */
export const shippingLabel = (shipping: number, format: (n: number) => string) =>
  shipping > 0 ? format(shipping) : SHIPPING_BY_CARRIER;

/** Скільки днів перевізник зберігає посилку у відділенні */
export const PARCEL_STORAGE_DAYS = 5;
/** Строк повернення за Законом України «Про захист прав споживачів» */
export const RETURN_DAYS = 14;


/* ---------- Оплата ---------- */

export type PaymentId = "cod" | "invoice" | "card" | "parts";

type PaymentOption = { id: PaymentId; title: string; text: string; minTotal?: number; enabled: boolean };

/**
 * Усі способи оплати, включно з вимкненими: назви потрібні для старих замовлень.
 * «Карткою онлайн» і «Частинами» вимкнені, поки не підключено еквайринг
 * (LiqPay / WayForPay / monobank) — показувати оплату, яку ніхто не приймає, не можна
 */
export const allPaymentOptions: PaymentOption[] = [
  { id: "invoice", title: "Оплата на рахунок", text: "Після підтвердження замовлення надішлемо реквізити; оплатити потрібно протягом 3 днів", enabled: true },
  /*
   * Накладений платіж: покупець платить при отриманні. Обирати «готівкою чи карткою»
   * на сайті не потрібно — Нова пошта й Укрпошта приймають і те, й інше
   */
  { id: "cod", title: "Накладений платіж", text: "Оплата при отриманні — готівкою або карткою; комісію за переказ бере перевізник", enabled: true },
  { id: "card", title: "Карткою онлайн", text: "Visa, Mastercard, Apple Pay, Google Pay", enabled: false },
  { id: "parts", title: "Оплата частинами", text: "До 6 платежів без переплат", minTotal: 3000, enabled: false },
];

/** Способи оплати, які зараз доступні покупцям */
export const paymentOptions = allPaymentOptions.filter((o) => o.enabled);

/** Назва способу оплати (і вимкненого — для історії замовлень) */
export const paymentTitle = (id: string) => allPaymentOptions.find((o) => o.id === id)?.title ?? id;

/* ---------- Склади: окреме замовлення на кожен ---------- */

export type Shipment = {
  /** id постачальника ("" — власний склад) */
  key: string;
  lines: ResolvedLine[];
  /** Лише передоплата: накладений платіж для цієї посилки недоступний */
  prepayOnly: boolean;
  /** Лише Нова пошта */
  novaPoshtaOnly: boolean;
  /** Відправка протягом стількох робочих днів після оплати (0 — у день замовлення) */
  dispatchDays: number;
};

/**
 * Товари з різних складів (постачальників) не можна відправити однією посилкою —
 * на кожен склад окреме замовлення. Порядок — як у кошику
 */
export function shipments(lines: ResolvedLine[]): Shipment[] {
  const groups = new Map<string, Shipment>();
  for (const l of lines) {
    const key = l.product.shipFrom ?? "";
    const g = groups.get(key) ?? { key, lines: [], prepayOnly: false, novaPoshtaOnly: false, dispatchDays: 0 };
    g.lines.push(l);
    g.prepayOnly ||= !!l.product.prepayOnly;
    g.novaPoshtaOnly ||= !!l.product.novaPoshtaOnly;
    g.dispatchDays = Math.max(g.dispatchDays, l.product.dispatchDays ?? 0);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** Спосіб оплати посилки: накладений платіж для «лише передоплата» замінюється оплатою на рахунок */
export const shipmentPayment = (s: Pick<Shipment, "prepayOnly">, payment: PaymentId): PaymentId =>
  s.prepayOnly && payment === "cod" ? "invoice" : payment;

const workingDaysWord = (n: number) =>
  n % 10 === 1 && n % 100 !== 11 ? "робочого дня" : "робочих днів";

/** «протягом 3 робочих днів після оплати» — для товарів, які відправляються не в день замовлення */
export const dispatchText = (days: number, prepayOnly = true) =>
  `протягом ${days} ${workingDaysWord(days)} після ${prepayOnly ? "оплати" : "підтвердження"}`;

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
  // До копійки: ціни постачальників бувають з копійками, а 0.1 + 0.2 у JS — не 0.3
  const subtotal = toCents(lines.reduce((s, l) => s + l.product.price * l.qty, 0));
  const savings = toCents(lines.reduce(
    (s, l) => s + ((l.product.oldPrice ?? l.product.price) - l.product.price) * l.qty,
    0,
  ));
  // Знижки вимкнено — промокоди не діють (і поле для них сховане)
  const percent = promo && discountsEnabled() ? (promoCodes[promo]?.percent ?? 0) : 0;
  // Промокод не діє на товари з ціною постачальника (РРЦ): продаж нижче РРЦ — порушення його політики
  const promoBase = lines.reduce((s, l) => s + (l.product.fixedPrice ? 0 : l.product.price * l.qty), 0);
  const promoDiscount = Math.round((promoBase * percent) / 100);
  // Доставку покупець оплачує перевізнику при отриманні — у суму не входить
  void delivery;
  const shipping = 0;
  return {
    count: lines.reduce((s, l) => s + l.qty, 0),
    subtotal,
    savings,
    promoDiscount,
    /** Є товари, на які промокод не діє (ціна постачальника) */
    promoExcluded: lines.some((l) => l.product.fixedPrice),
    shipping,
    total: toCents(subtotal - promoDiscount + shipping),
  };
}

const toCents = (n: number) => Math.round(n * 100) / 100;

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
