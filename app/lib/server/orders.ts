import "server-only";
import { randomInt } from "node:crypto";
import { deliveryOptions } from "../../components/cart-logic";
import { formatPrice } from "../../components/catalog-data";
import { sha256 } from "./auth";
import { db, iso, isoOpt, num, opt, userFromRow, type Queryable, type Row, type StoredOrder, type StoredUser } from "./db";
import type { Mail } from "./mail";

/*
 * Замовлення покупців з акаунтом (user_id) і гостей (user_id = null, claim_hash —
 * хеш секретного токена з браузера гостя; за ним замовлення переноситься в акаунт).
 */

export type OrderRef = { order: StoredOrder; owner: StoredUser | null };

const orderFromRow = (r: Row, lines: StoredOrder["lines"]): StoredOrder => ({
  number: r.number,
  createdAt: iso(r.created_at),
  status: r.status,
  updatedAt: isoOpt(r.updated_at),
  lines,
  subtotal: num(r.subtotal),
  promo: opt(r.promo),
  promoDiscount: num(r.promo_discount),
  shipping: num(r.shipping),
  total: num(r.total),
  delivery: Object.fromEntries(
    Object.entries({
      method: r.delivery_method,
      city: r.delivery_city,
      cityRef: r.delivery_city_ref,
      branch: r.delivery_branch,
      address: r.delivery_address,
    }).filter(([, v]) => v != null),
  ) as StoredOrder["delivery"],
  payment: r.payment,
  contact: {
    firstName: r.first_name,
    lastName: r.last_name,
    phone: r.phone,
    ...(r.email ? { email: r.email } : {}),
  },
  comment: opt(r.comment),
  noCall: !!r.no_call,
});

/**
 * Замовлення з рядками товарів. where — умова для таблиці orders (аліас o),
 * сортування — найновіші першими. Власник додається, якщо є
 */
export async function loadOrders(where: string, params: unknown[] = [], q: Queryable = db, lock = false): Promise<OrderRef[]> {
  const rows = await q.query(
    `select o.*, ${lock ? "null as owner" : "to_jsonb(u) as owner"}
     from orders o ${lock ? "" : "left join users u on u.id = o.user_id"}
     where ${where} order by o.created_at desc, o.number desc ${lock ? "for update" : ""}`,
    params,
  );
  if (!rows.length) return [];
  const items = await q.query(
    "select * from order_items where order_number = any($1::text[]) order by position",
    [rows.map((r) => r.number)],
  );
  const byOrder = new Map<string, StoredOrder["lines"]>();
  for (const i of items) {
    const list = byOrder.get(i.order_number) ?? [];
    list.push({ id: i.product_id, name: i.name, price: num(i.price), qty: num(i.qty) });
    byOrder.set(i.order_number, list);
  }
  return rows.map((r) => ({
    order: orderFromRow(r, byOrder.get(r.number) ?? []),
    owner: r.owner ? userFromRow(r.owner) : null,
  }));
}

/** Замовлення за номером (lock — заблокувати рядок до кінця транзакції) */
export async function findOrder(number: string, q: Queryable = db, lock = false): Promise<OrderRef | undefined> {
  const [found] = await loadOrders("o.number = $1", [number], q, lock);
  if (!found || !lock) return found;
  // Під блокуванням власника читаємо окремо (for update не працює з left join)
  const [owner] = await q.query("select u.* from users u join orders o on o.user_id = u.id where o.number = $1", [number]);
  return { order: found.order, owner: owner ? userFromRow(owner) : null };
}

/** Замовлення покупця, найновіші першими */
export const userOrders = async (userId: string, q: Queryable = db) =>
  (await loadOrders("o.user_id = $1", [userId], q)).map((r) => r.order);

/** Номер «FC-» + 7 цифр (унікальність гарантує первинний ключ — див. insertOrder) */
const newOrderNumber = () => `FC-${String(Date.now()).slice(-5)}${randomInt(10, 100)}`;

/** Зберігає нове замовлення; номер підбирається вільний */
export async function insertOrder(
  q: Queryable,
  order: Omit<StoredOrder, "number">,
  owner: { userId: string } | { claimHash: string },
): Promise<StoredOrder> {
  for (;;) {
    const number = newOrderNumber();
    const [row] = await q.query(
      `insert into orders (number, user_id, claim_hash, created_at, status, subtotal, promo, promo_discount, shipping, total,
         delivery_method, delivery_city, delivery_city_ref, delivery_branch, delivery_address, payment,
         first_name, last_name, phone, email, comment, no_call)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       on conflict (number) do nothing returning number`,
      [
        number,
        "userId" in owner ? owner.userId : null,
        "claimHash" in owner ? owner.claimHash : null,
        order.createdAt,
        order.status,
        order.subtotal,
        order.promo ?? null,
        order.promoDiscount,
        order.shipping,
        order.total,
        order.delivery.method,
        order.delivery.city ?? null,
        order.delivery.cityRef ?? null,
        order.delivery.branch ?? null,
        order.delivery.address ?? null,
        order.payment,
        order.contact.firstName,
        order.contact.lastName,
        order.contact.phone,
        order.contact.email ?? null,
        order.comment ?? null,
        order.noCall,
      ],
    );
    if (!row) continue;
    await q.query(
      `insert into order_items (order_number, product_id, name, price, qty, position)
       select $1, x.id, x.name, x.price, x.qty, x.pos - 1
       from unnest($2::text[], $3::text[], $4::numeric[], $5::int[]) with ordinality as x(id, name, price, qty, pos)`,
      [number, order.lines.map((l) => l.id), order.lines.map((l) => l.name), order.lines.map((l) => l.price), order.lines.map((l) => l.qty)],
    );
    return { number, ...order };
  }
}

/**
 * Переносить у акаунт гостьові замовлення, токени яких зберіг браузер
 * покупця. Повертає кількість перенесених
 */
export async function claimGuestOrders(user: StoredUser, tokens: unknown, q: Queryable = db): Promise<number> {
  if (!Array.isArray(tokens)) return 0;
  const hashes = tokens
    .filter((t): t is string => typeof t === "string" && t.length >= 20 && t.length <= 100)
    .slice(0, 50)
    .map(sha256);
  if (!hashes.length) return 0;
  const claimed = await q.query(
    `update orders set user_id = $1, claim_hash = null
     where claim_hash = any($2::text[]) and user_id is null
     returning phone, created_at`,
    [user.id, hashes],
  );
  if (!claimed.length) return 0;
  // Якщо телефону в профілі ще немає — беремо з останнього перенесеного замовлення
  if (!user.phone) {
    const latest = claimed.reduce((a, b) => (iso(a.created_at) >= iso(b.created_at) ? a : b));
    await q.query("update users set phone = $2 where id = $1 and phone = ''", [user.id, latest.phone]);
  }
  return claimed.length;
}

/** Цифри телефону без форматування */
export const phoneDigits = (p: string) => p.replace(/\D/g, "");

/** Що показуємо на сторінці відстеження: без адреси, телефону й email */
export function trackingView(order: StoredOrder) {
  return {
    number: order.number,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    status: order.status,
    lines: order.lines,
    shipping: order.shipping,
    promoDiscount: order.promoDiscount,
    total: order.total,
    delivery: { method: order.delivery.method, city: order.delivery.city },
    payment: order.payment,
  };
}

export const trackHref = (number: string) => `/orders/track?number=${encodeURIComponent(number)}`;

/** Лист-підтвердження нового замовлення */
export function orderPlacedMail(order: StoredOrder, to: string, guest: boolean): Mail {
  const items = order.lines.map((l) => `• ${l.name} × ${l.qty} — ${formatPrice(l.price * l.qty)}`).join("\n");
  const delivery = deliveryOptions.find((o) => o.id === order.delivery.method)?.title ?? "";
  const where = [order.delivery.city, order.delivery.branch && `№ ${order.delivery.branch}`, order.delivery.address].filter(Boolean).join(", ");
  return {
    to,
    subject: `Замовлення ${order.number} прийнято`,
    text:
      `${order.contact.firstName}, дякуємо за замовлення!\n\n${items}\n\n` +
      `Доставка: ${delivery}${where ? `, ${where}` : ""} — ${order.shipping ? formatPrice(order.shipping) : "безкоштовно"}\n` +
      (order.promoDiscount ? `Знижка за промокодом: −${formatPrice(order.promoDiscount)}\n` : "") +
      `Разом: ${formatPrice(order.total)}\n\n` +
      (guest
        ? `Статус замовлення можна перевірити на сайті за номером ${order.number} і вашим телефоном.`
        : "Статус замовлення — у вашому профілі на сайті."),
    href: guest ? trackHref(order.number) : "/account",
  };
}
