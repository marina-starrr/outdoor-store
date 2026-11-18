import "server-only";
import { randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { sha256 } from "./auth";
import { db, iso, isoOpt, num, opt, sql, tx, type Queryable, type Row, type StoredUser } from "./db";

/*
 * Чат з консультантом. Одна розмова на покупця:
 * - з акаунтом — за user_id;
 * - гість — за секретним токеном у cookie браузера (у базі — лише його хеш).
 * Якщо гість потім увійде в акаунт, його розмова переходить в акаунт.
 */

export const CHAT_COOKIE = "fc_chat";
export const CHAT_MESSAGE_MAX = 2000;
/** Покупець «у чаті», якщо заглядав щойно — тоді відповідь не дублюємо листом */
export const CUSTOMER_ONLINE_MS = 2 * 60_000;

export type ChatMessage = {
  id: string;
  seq: number;
  createdAt: string;
  author: "customer" | "admin";
  text: string;
  productId?: string;
};

export type Chat = {
  id: string;
  userId?: string;
  name: string;
  phone?: string;
  email?: string;
  createdAt: string;
  lastMessageAt: string;
  adminReadAt?: string;
  customerReadAt?: string;
  customerSeenAt?: string;
};

export const chatFromRow = (r: Row): Chat => ({
  id: r.id,
  userId: opt(r.user_id),
  name: r.name,
  phone: opt(r.phone),
  email: opt(r.email),
  createdAt: iso(r.created_at),
  lastMessageAt: iso(r.last_message_at),
  adminReadAt: isoOpt(r.admin_read_at),
  customerReadAt: isoOpt(r.customer_read_at),
  customerSeenAt: isoOpt(r.customer_seen_at),
});

export const messageFromRow = (r: Row): ChatMessage => ({
  id: r.id,
  seq: num(r.seq),
  createdAt: iso(r.created_at),
  author: r.author,
  text: r.text,
  ...(r.product_id ? { productId: r.product_id } : {}),
});

const visitorHash = (req: NextRequest) => {
  const token = req.cookies.get(CHAT_COOKIE)?.value;
  return token && token.length >= 20 && token.length <= 100 ? sha256(token) : null;
};

/**
 * Розмова поточного покупця або null. Гість, що увійшов у акаунт, — його
 * розмова переходить в акаунт (або зливається з уже наявною розмовою акаунта)
 */
export async function findChat(req: NextRequest, user: StoredUser | null): Promise<Chat | null> {
  const hash = visitorHash(req);
  if (!user) {
    if (!hash) return null;
    const [row] = await sql("select * from chats where visitor_hash = $1 and user_id is null", [hash]);
    return row ? chatFromRow(row) : null;
  }
  return tx(async (q) => {
    const [own] = await q.query("select * from chats where user_id = $1 for update", [user.id]);
    const [guest] = hash ? await q.query("select * from chats where visitor_hash = $1 and user_id is null for update", [hash]) : [];
    if (!guest) return own ? chatFromRow(own) : null;
    if (!own) {
      const [row] = await q.query(
        `update chats set user_id = $2, email = coalesce(email, $3), phone = coalesce(phone, nullif($4, ''))
         where id = $1 returning *`,
        [guest.id, user.id, user.email, user.phone],
      );
      return chatFromRow(row);
    }
    // В акаунта вже є розмова — переносимо в неї повідомлення гостя
    await q.query("update chat_messages set chat_id = $2 where chat_id = $1", [guest.id, own.id]);
    await q.query("delete from chats where id = $1", [guest.id]);
    const [row] = await q.query(
      "update chats set last_message_at = greatest(last_message_at, $2) where id = $1 returning *",
      [own.id, guest.last_message_at],
    );
    return chatFromRow(row);
  });
}

/** Нова розмова; гостю — токен для cookie (повертається лише тут) */
export async function createChat(
  q: Queryable,
  data: { user: StoredUser | null; name: string; phone?: string; email?: string },
): Promise<{ chat: Chat; token?: string }> {
  const token = data.user ? undefined : randomBytes(24).toString("base64url");
  const [row] = await q.query(
    `insert into chats (user_id, visitor_hash, name, phone, email) values ($1, $2, $3, $4, $5) returning *`,
    [data.user?.id ?? null, token ? sha256(token) : null, data.name, data.phone || null, data.email || null],
  );
  return { chat: chatFromRow(row), token };
}

export function setChatCookie(res: NextResponse, token: string) {
  res.cookies.set(CHAT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 86_400,
  });
}

export async function addMessage(
  q: Queryable,
  chatId: string,
  author: ChatMessage["author"],
  text: string,
  productId?: string,
): Promise<ChatMessage> {
  const [row] = await q.query(
    `insert into chat_messages (chat_id, author, text, product_id) values ($1, $2, $3, $4) returning *`,
    [chatId, author, text, productId ?? null],
  );
  // Свої повідомлення автор уже «прочитав»
  await q.query(
    `update chats set last_message_at = $2,
       admin_read_at = case when $3 = 'admin' then $2 else admin_read_at end,
       customer_read_at = case when $3 = 'customer' then $2 else customer_read_at end
     where id = $1`,
    [chatId, row.created_at, author],
  );
  return messageFromRow(row);
}

/** Повідомлення розмови після seq (для опитування — лише нові) */
export async function chatMessages(chatId: string, after = 0, q: Queryable = db): Promise<ChatMessage[]> {
  const rows = await q.query(
    "select * from chat_messages where chat_id = $1 and seq > $2 order by seq limit 500",
    [chatId, after],
  );
  return rows.map(messageFromRow);
}

/** Скільки повідомлень іншої сторони ще не прочитано */
export async function unreadCount(chatId: string, reader: "customer" | "admin"): Promise<number> {
  const other = reader === "customer" ? "admin" : "customer";
  const column = reader === "customer" ? "customer_read_at" : "admin_read_at";
  const [row] = await sql(
    `select count(*) as n from chat_messages m join chats c on c.id = m.chat_id
     where m.chat_id = $1 and m.author = $2 and m.created_at > coalesce(c.${column}, '-infinity')`,
    [chatId, other],
  );
  return num(row.n);
}

/** Скільки розмов мають непрочитані повідомлення покупців — для значка в адмінці */
export async function chatsWaiting(): Promise<number> {
  const [row] = await sql(
    `select count(*) as n from chats c
     where exists (select 1 from chat_messages m
                   where m.chat_id = c.id and m.author = 'customer' and m.created_at > coalesce(c.admin_read_at, '-infinity'))`,
  );
  return num(row.n);
}
