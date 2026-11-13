import "server-only";
import { randomUUID } from "node:crypto";
import { formatPrice, type Product } from "../../components/catalog-data";
import { productUrl } from "../../components/product-details";
import { orderStatusInfo, type OrderStatusId } from "../order-status";
import type { Data, NotificationKind, StoredNotification, StoredUser } from "./db";
import type { Mail } from "./mail";

/*
 * Сповіщення покупцям. Створюються всередині write()/writeCatalog() разом зі
 * зміною, яка їх спричинила, а листи збираються в масив і надсилаються вже
 * після запису (sendMails) — щоб повільна пошта не тримала чергу бази.
 */

/** Скільки сповіщень зберігаємо на користувача (старіші видаляються) */
export const NOTIFICATIONS_LIMIT = 50;

type NewNotification = { kind: NotificationKind; title: string; text: string; href?: string };

/** Додає сповіщення користувачу; якщо він не вимкнув листи — додає й лист у mails */
export function notifyUser(user: StoredUser, n: NewNotification, mails: Mail[]) {
  const item: StoredNotification = { id: randomUUID(), createdAt: new Date().toISOString(), ...n };
  const list = (user.notifications ??= []);
  list.push(item);
  if (list.length > NOTIFICATIONS_LIMIT) list.splice(0, list.length - NOTIFICATIONS_LIMIT);
  if (user.emailNotifications !== false) mails.push({ to: user.email, subject: n.title, text: n.text, href: n.href });
  return item;
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
export function productEvents(db: Data, product: Product, before: ProductSnapshot, mails: Mail[]) {
  if (product.hidden) return;
  const href = productUrl(product);

  if (!before.inStock && product.stock > 0) {
    for (const user of db.users) {
      if (!user.stockAlerts?.includes(product.id)) continue;
      user.stockAlerts = user.stockAlerts.filter((id) => id !== product.id);
      notifyUser(user, {
        kind: "stock",
        title: `${product.name} знову в наявності`,
        text: `Товар, про який ви просили повідомити, з'явився на складі. Ціна — ${formatPrice(product.price)}. Встигніть замовити, поки є.`,
        href,
      }, mails);
    }
  }

  if (product.price < before.price) {
    for (const user of db.users) {
      if (!user.favorites?.includes(product.id)) continue;
      notifyUser(user, {
        kind: "price",
        title: `Знижка на ${product.name}`,
        text: `Товар з вашого обраного подешевшав: ${formatPrice(before.price)} → ${formatPrice(product.price)}.`,
        href,
      }, mails);
    }
  }
}

const statusText: Partial<Record<OrderStatusId, string>> = {
  confirmed: "підтверджено — готуємо до відправлення",
  shipped: "відправлено. Номер накладної надішлемо в SMS",
  done: "виконано. Дякуємо за покупку — гарного відпочинку!",
  cancelled: "скасовано. Якщо це помилка — напишіть нам",
};

/** Зміна статусу замовлення → його власнику */
export function orderEvent(user: StoredUser, number: string, status: OrderStatusId, mails: Mail[]) {
  const text = statusText[status];
  if (!text) return;
  notifyUser(user, {
    kind: "order",
    title: `Замовлення ${number}: ${orderStatusInfo[status].label.toLowerCase()}`,
    text: `Ваше замовлення ${number} ${text}.`,
    href: "/account",
  }, mails);
}
