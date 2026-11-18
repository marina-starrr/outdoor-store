import "server-only";
import { formatPrice, type Product } from "../../components/catalog-data";
import { productUrl } from "../../components/product-details";
import { PAYMENT_DAYS, orderStatusInfo, paymentDue, type OrderStatusId } from "../order-status";
import { paymentDetailsText } from "../payment";
import { db, notificationFromRow, userFromRow, type NotificationKind, type Queryable, type StoredNotification, type StoredOrder, type StoredUser } from "./db";
import type { Mail } from "./mail";

/*
 * Сповіщення покупцям. Створюються в тій самій транзакції, що й зміна, яка
 * їх спричинила, а листи збираються в масив і надсилаються вже після
 * запису (sendMails) — щоб повільна пошта не тримала транзакцію.
 */

/** Скільки сповіщень зберігаємо на користувача (старіші видаляються) */
export const NOTIFICATIONS_LIMIT = 50;

type NewNotification = { kind: NotificationKind; title: string; text: string; href?: string };
type Recipient = Pick<StoredUser, "id" | "email" | "emailNotifications">;

/** Додає сповіщення користувачу; якщо він не вимкнув листи — додає й лист у mails */
export async function notifyUser(q: Queryable, user: Recipient, n: NewNotification, mails: Mail[]): Promise<StoredNotification> {
  const [row] = await q.query(
    "insert into notifications (user_id, kind, title, text, href) values ($1, $2, $3, $4, $5) returning *",
    [user.id, n.kind, n.title, n.text, n.href ?? null],
  );
  await q.query(
    `delete from notifications where user_id = $1 and seq not in (
       select seq from notifications where user_id = $1 order by seq desc limit $2)`,
    [user.id, NOTIFICATIONS_LIMIT],
  );
  if (user.emailNotifications !== false) mails.push({ to: user.email, subject: n.title, text: n.text, href: n.href });
  return notificationFromRow(row);
}

/** Сповіщення покупця, найновіші першими */
export async function userNotifications(userId: string, q: Queryable = db): Promise<StoredNotification[]> {
  const rows = await q.query("select * from notifications where user_id = $1 order by seq desc", [userId]);
  return rows.map(notificationFromRow);
}

/** Стан товару до зміни — щоб зрозуміти, що саме змінилось */
export type ProductSnapshot = { inStock: boolean; price: number };
export const snapshot = (p: Pick<Product, "inStock" | "price" | "stock">): ProductSnapshot => ({
  inStock: p.stock > 0,
  price: p.price,
});

/**
 * Події товару після зміни:
 * - з'явився в наявності → усім, хто підписався (підписка знімається);
 * - подешевшав → усім, у кого він в обраному.
 * Прихований товар нікому не показуємо.
 */
export async function productEvents(q: Queryable, product: Product, before: ProductSnapshot, mails: Mail[]) {
  if (product.hidden) return;
  const href = productUrl(product);

  if (!before.inStock && product.stock > 0) {
    const subscribers = await q.query(
      `with d as (delete from stock_alerts where product_id = $1 returning user_id)
       select u.* from users u join d on d.user_id = u.id order by u.created_at`,
      [product.id],
    );
    for (const user of subscribers.map(userFromRow)) {
      await notifyUser(q, user, {
        kind: "stock",
        title: `${product.name} знову в наявності`,
        text: `Товар, про який ви просили повідомити, з'явився на складі. Ціна — ${formatPrice(product.price)}. Встигніть замовити, поки є.`,
        href,
      }, mails);
    }
  }

  if (product.price < before.price) {
    const fans = await q.query(
      "select u.* from users u join favorites f on f.user_id = u.id where f.product_id = $1 order by u.created_at",
      [product.id],
    );
    for (const user of fans.map(userFromRow)) {
      await notifyUser(q, user, {
        kind: "price",
        title: `Знижка на ${product.name}`,
        text: `Товар з вашого обраного подешевшав: ${formatPrice(before.price)} → ${formatPrice(product.price)}.`,
        href,
      }, mails);
    }
  }
}

/** Що сталося із замовленням — продовження фрази «Ваше замовлення FC-… …» */
function statusText(order: StoredOrder, status: OrderStatusId, reason?: "unpaid"): string | null {
  switch (status) {
    case "confirmed":
      return `підтверджено, товар заброньовано за вами. Оплатіть ${formatPrice(order.total)} до ${formatDue(order)} — після оплати відправимо посилку`;
    case "paid":
      return "оплачено, дякуємо! Готуємо посилку до відправлення";
    case "shipped":
      return "відправлено. Скоро посилка буде у вибраному відділенні чи за адресою";
    case "done":
      return "виконано. Дякуємо за покупку — гарного відпочинку!";
    case "cancelled":
      return reason === "unpaid"
        ? `скасовано, бо оплата не надійшла протягом ${PAYMENT_DAYS} днів. Якщо ви вже оплатили — напишіть нам`
        : "скасовано. Якщо це помилка — напишіть нам";
    default:
      return null;
  }
}

const formatDue = (order: StoredOrder) =>
  new Date(paymentDue(order.confirmedAt ?? new Date().toISOString())).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Kyiv",
  });

/** У листі про підтвердження — ще й реквізити для оплати */
const mailExtra = (order: StoredOrder, status: OrderStatusId) =>
  status === "confirmed" ? `

${paymentDetailsText(order)}` : "";

/** Зміна статусу замовлення → його власнику (сповіщення на сайті й лист) */
export async function orderEvent(
  q: Queryable,
  user: Recipient,
  order: StoredOrder,
  status: OrderStatusId,
  mails: Mail[],
  reason?: "unpaid",
) {
  const text = statusText(order, status, reason);
  if (!text) return;
  const before = mails.length;
  await notifyUser(q, user, {
    kind: "order",
    title: `Замовлення ${order.number}: ${orderStatusInfo[status].customer.toLowerCase()}`,
    text: `Ваше замовлення ${order.number} ${text}.`,
    href: "/account",
  }, mails);
  // Лист (якщо покупець їх не вимкнув) — із реквізитами
  if (mails.length > before) mails[mails.length - 1].text += mailExtra(order, status);
}

/** Зміна статусу замовлення гостя → лист на email із замовлення */
export function guestOrderEvent(order: StoredOrder, status: OrderStatusId, mails: Mail[], reason?: "unpaid") {
  const text = statusText(order, status, reason);
  if (!text || !order.contact.email) return;
  mails.push({
    to: order.contact.email,
    subject: `Замовлення ${order.number}: ${orderStatusInfo[status].customer.toLowerCase()}`,
    text: `Ваше замовлення ${order.number} ${text}.${mailExtra(order, status)}`,
    href: `/orders/track?number=${encodeURIComponent(order.number)}`,
  });
}
