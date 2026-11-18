import "server-only";
import { db, iso, opt, type Queryable, type Row, type StoredMessage } from "./db";
import { rateLimiter } from "./rate-limit";

/*
 * Звернення з форми «Контакти» зберігаються в базі (таблиці messages і
 * message_replies) і опрацьовуються в адмін-панелі (розділ «Звернення»).
 */

export type ContactMessage = StoredMessage;

export async function saveMessage(msg: Omit<ContactMessage, "id" | "createdAt" | "done" | "replies">): Promise<ContactMessage> {
  const [row] = await db.query(
    `insert into messages (topic, name, email, phone, order_number, message, user_id)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [msg.topic, msg.name, msg.email, msg.phone ?? null, msg.order ?? null, msg.message, msg.userId ?? null],
  );
  return { ...messageFromRow(row), replies: [] };
}

const messageFromRow = (r: Row): StoredMessage => ({
  id: r.id,
  createdAt: iso(r.created_at),
  topic: r.topic,
  name: r.name,
  email: r.email,
  phone: opt(r.phone),
  order: opt(r.order_number),
  message: r.message,
  userId: opt(r.user_id),
  done: !!r.done,
});

/** Звернення з відповідями, найновіші першими. where — умова для messages (аліас m) */
export async function loadMessages(where = "true", params: unknown[] = [], q: Queryable = db): Promise<(StoredMessage & { hasAccount: boolean })[]> {
  const rows = await q.query(
    `select m.*, exists(select 1 from users u where u.id = m.user_id or u.email = m.email) as has_account
     from messages m where ${where} order by m.created_at desc`,
    params,
  );
  if (!rows.length) return [];
  const replies = await q.query(
    "select * from message_replies where message_id = any($1::uuid[]) order by created_at, id",
    [rows.map((r) => r.id)],
  );
  return rows.map((r) => ({
    ...messageFromRow(r),
    replies: replies
      .filter((x) => x.message_id === r.id)
      .map((x) => ({ id: x.id, createdAt: iso(x.created_at), text: x.text, onSite: !!x.on_site, emailed: !!x.emailed })),
    hasAccount: !!r.has_account,
  }));
}

/** Одне звернення з відповідями */
export async function findMessage(id: string, q: Queryable = db) {
  if (!isUuid(id)) return null;
  const [m] = await loadMessages("m.id = $1", [id], q);
  return m ?? null;
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** Не більше 3 звернень за 10 хвилин з однієї IP-адреси */
export const contactRateLimited = rateLimiter("contact", 3, 10 * 60_000);
