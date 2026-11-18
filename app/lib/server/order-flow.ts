import "server-only";
import { PAYMENT_DAYS, canTransition, orderStatusInfo, type OrderStatusId } from "../order-status";
import { invalidateCatalog, productFromRow } from "./catalog";
import { sql, tx, type Queryable, type StoredOrder } from "./db";
import { sendMails, type Mail } from "./mail";
import { guestOrderEvent, orderEvent, productEvents } from "./notifications";
import { findOrder } from "./orders";
import { notifyAdmin } from "./telegram";

/*
 * Зміна статусу замовлення і склад:
 * - при оформленні товар лише перевіряється (є в наявності), але не списується;
 * - підтвердження адміністратором бронює товар — списує зі складу (stock_reserved);
 * - скасування повертає заброньований товар на склад;
 * - підтверджене, але не оплачене за PAYMENT_DAYS дні, скасовується автоматично.
 */

export type StatusChange =
  | { order: StoredOrder }
  | { notFound: true }
  | { error: string };

/** Списує товари замовлення; якщо чогось бракує — помилка з поясненням (транзакція відкочується) */
class ReserveError extends Error {}

async function reserve(q: Queryable, order: StoredOrder) {
  // Однаковий порядок блокування рядків у всіх транзакціях — без взаємних блокувань
  for (const l of [...order.lines].sort((a, b) => a.id.localeCompare(b.id))) {
    const [taken] = await q.query(
      "update products set stock = stock - $2 where id = $1 and stock >= $2 returning id",
      [l.id, l.qty],
    );
    if (taken) continue;
    const [p] = await q.query("select stock from products where id = $1", [l.id]);
    throw new ReserveError(
      `Не вистачає «${l.name}»: потрібно ${l.qty} шт., на складі ${Number(p?.stock ?? 0)}. ` +
        "Поповніть залишок у «Товарах» або зв’яжіться з покупцем і скасуйте замовлення.",
    );
  }
}

async function release(q: Queryable, order: StoredOrder, mails: Mail[]) {
  for (const l of [...order.lines].sort((a, b) => a.id.localeCompare(b.id))) {
    const [row] = await q.query(
      "update products set stock = stock + $2 where id = $1 returning *, stock - $2 as stock_before",
      [l.id, l.qty],
    );
    if (!row) continue;
    const p = productFromRow(row);
    // Товар повернувся на склад — це теж «з'явився в наявності»
    await productEvents(q, p, { inStock: Number(row.stock_before) > 0, price: p.price }, mails);
  }
}

/**
 * Переводить замовлення в новий статус: бронює або повертає товар, сповіщає
 * покупця. reason=unpaid — автоматичне скасування через несплату
 */
export async function changeOrderStatus(number: string, status: OrderStatusId, reason?: "unpaid"): Promise<StatusChange> {
  const mails: Mail[] = [];
  let stockChanged = false;
  let result: StatusChange;
  try {
    result = await tx(async (q) => {
      // Блокуємо замовлення — два одночасні скасування не повернуть товар на склад двічі
      const found = await findOrder(number, q, true);
      if (!found) return { notFound: true as const };
      const { order, owner } = found;
      if (!canTransition(order.status, status, order.payment))
        return {
          error: `Не можна змінити статус «${orderStatusInfo[order.status].label}» на «${orderStatusInfo[status].label}»`,
        };
      const [{ stock_reserved: reserved }] = await q.query("select stock_reserved from orders where number = $1", [number]);

      const now = new Date().toISOString();
      const updated: StoredOrder = { ...order, status, updatedAt: now };
      if (status === "confirmed") {
        if (!reserved) {
          await reserve(q, order);
          stockChanged = true;
        }
        updated.confirmedAt = now;
      }
      if (status === "paid") updated.paidAt = now;
      if (status === "cancelled" && reserved) {
        await release(q, order, mails);
        stockChanged = true;
      }

      await q.query(
        `update orders set status = $2, updated_at = $3,
           stock_reserved = case when $2 = 'confirmed' then true when $2 = 'cancelled' then false else stock_reserved end,
           confirmed_at = case when $2 = 'confirmed' then $3::timestamptz else confirmed_at end,
           paid_at = case when $2 = 'paid' then $3::timestamptz else paid_at end
         where number = $1`,
        [number, status, now],
      );
      if (owner) await orderEvent(q, owner, updated, status, mails, reason);
      else guestOrderEvent(updated, status, mails, reason);
      return { order: updated };
    });
  } catch (e) {
    if (e instanceof ReserveError) return { error: e.message };
    throw e;
  }
  if (stockChanged) invalidateCatalog();
  await sendMails(mails);
  return result;
}

/**
 * Скасовує підтверджені замовлення, не оплачені за PAYMENT_DAYS дні (лише оплата
 * на рахунок), і повертає товар на склад. Викликається щодня з Vercel Cron і
 * при відкритті списку замовлень в адмінці. Повертає номери скасованих
 */
export async function expireUnpaidOrders(): Promise<string[]> {
  const due = await sql<{ number: string }>(
    `select number from orders
     where status = 'confirmed' and payment = 'invoice'
       and confirmed_at < now() - $1::int * interval '1 day'
     order by confirmed_at limit 50`,
    [PAYMENT_DAYS],
  );
  const cancelled: string[] = [];
  for (const { number } of due) {
    const r = await changeOrderStatus(number, "cancelled", "unpaid");
    if ("order" in r) cancelled.push(number);
  }
  if (cancelled.length)
    await notifyAdmin(
      `⏰ Скасовано без оплати (${PAYMENT_DAYS} дні): ${cancelled.join(", ")}. Товар повернено на склад.`,
    );
  return cancelled;
}
