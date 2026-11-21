import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deliveryOptions, paymentTitle, shippingLabel, deliveryWhere } from "../../components/cart-logic";
import { formatPrice } from "../../components/catalog-data";
import { absoluteUrl } from "../site";
import { dataDir, type StoredOrder, type StoredReview } from "./db";

/*
 * Сповіщення адміністратору в Telegram — про нові замовлення, відгуки й повідомлення в чаті.
 *
 * Налаштування (.env.local або змінні хостингу):
 *   TELEGRAM_BOT_TOKEN=123456:ABC...   — токен бота від @BotFather
 *   TELEGRAM_CHAT_ID=123456789         — ваш chat id (кілька — через кому)
 * Як дізнатися chat id: напишіть боту будь-що й відкрийте
 *   https://api.telegram.org/bot<TOKEN>/getUpdates — поле "chat":{"id":...}
 *
 * Для розробки й тестів: TELEGRAM_TRANSPORT=log — повідомлення пишуться
 * у файл telegram.json у теці даних.
 */

export const telegramEnabled = () =>
  process.env.TELEGRAM_TRANSPORT === "log" || !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

async function appendLog(text: string) {
  const file = join(dataDir(), "telegram.json");
  let list: unknown[] = [];
  try {
    list = JSON.parse(await readFile(file, "utf8"));
  } catch {
    /* ще немає */
  }
  list.push({ text, sentAt: new Date().toISOString() });
  await mkdir(dataDir(), { recursive: true });
  await writeFile(file, JSON.stringify(list, null, 2), "utf8");
}

/** Надсилає повідомлення всім чатам адміністратора. Ніколи не кидає помилку */
export async function notifyAdmin(text: string): Promise<boolean> {
  try {
    if (process.env.TELEGRAM_TRANSPORT === "log") {
      await appendLog(text);
      return true;
    }
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chats = (process.env.TELEGRAM_CHAT_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!token || !chats.length) return false;
    const results = await Promise.all(
      chats.map(async (chat_id) => {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id, text, disable_web_page_preview: true }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) console.error(`[telegram] ${res.status}: ${await res.text().catch(() => "")}`);
        return res.ok;
      }),
    );
    return results.every(Boolean);
  } catch (e) {
    console.error("[telegram] не вдалося надіслати", e);
    return false;
  }
}

/** Текст про нове замовлення: усе, щоб передзвонити й відправити, не відкриваючи адмінку */
export function newOrderText(
  order: StoredOrder,
  guest: boolean,
  /** id товару → «Ranger, арт. RA6667» (товари постачальників) */
  supplierSkus: ReadonlyMap<string, string> = new Map(),
) {
  const delivery = deliveryOptions.find((o) => o.id === order.delivery.method)?.title ?? order.delivery.method;
  const where = deliveryWhere(order.delivery);
  const c = order.contact;
  return [
    `🛒 Нове замовлення ${order.number} — ${formatPrice(order.total)}`,
    "",
    ...order.lines.flatMap((l) => [
      `• ${l.name} × ${l.qty} — ${formatPrice(l.price * l.qty)}${l.onRequest ? " ⚠️ під замовлення" : ""}`,
      ...(supplierSkus.has(l.id) ? [`   📦 ${supplierSkus.get(l.id)}`] : []),
    ]),
    order.lines.some((l) => l.onRequest) ? "⚠️ Уточніть кількість у постачальника, перш ніж підтвердити" : null,
    order.promoDiscount ? `Промокод ${order.promo}: −${formatPrice(order.promoDiscount)}` : null,
    `Доставка: ${shippingLabel(order.shipping, formatPrice).toLowerCase()}`,
    "",
    `👤 ${c.firstName} ${c.lastName}${guest ? " (без акаунта)" : ""}`,
    `📞 ${c.phone}${order.noCall ? " — просить не телефонувати" : ""}`,
    c.email ? `✉️ ${c.email}` : null,
    `🚚 ${delivery}: ${where}`,
    `💳 ${paymentTitle(order.payment)}${order.payment === "cod" ? ` — ТТН з накладеним платежем на ${formatPrice(order.total)}` : ""}`,
    order.comment ? `💬 ${order.comment}` : null,
    "",
    absoluteUrl(`/admin/orders?q=${encodeURIComponent(order.number)}`),
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/** Текст про новий відгук, що чекає на модерацію */
export function newReviewText(r: StoredReview) {
  return [
    `⭐ Новий відгук на модерацію: ${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}`,
    `${r.author}${r.verified ? " · підтверджена покупка" : ""}`,
    "",
    r.text.length > 600 ? `${r.text.slice(0, 600)}…` : r.text,
    "",
    absoluteUrl("/admin/reviews"),
  ].join("\n");
}

/** Нове повідомлення в чаті від покупця */
export function chatMessageText(chat: { id: string; name: string; phone?: string; email?: string }, text: string, productName?: string) {
  const contacts = [chat.phone, chat.email].filter(Boolean).join(", ");
  return [
    `💬 Чат: ${chat.name || "Покупець"}${contacts ? ` (${contacts})` : ""}`,
    productName ? `Про товар: ${productName}` : null,
    "",
    text.length > 500 ? `${text.slice(0, 500)}…` : text,
    "",
    absoluteUrl(`/admin/chats?id=${chat.id}`),
  ]
    .filter((l) => l !== null)
    .join("\n");
}
