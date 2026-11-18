import type { NextRequest } from "next/server";
import { error, getUser, isSameOrigin, json } from "../../../lib/server/auth";
import { findChat } from "../../../lib/server/chat";
import { sql } from "../../../lib/server/db";

/** Покупець побачив відповіді — значок непрочитаних зникає */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const chat = await findChat(req, await getUser(req));
  if (chat) await sql("update chats set customer_read_at = now(), customer_seen_at = now() where id = $1", [chat.id]);
  return json({ ok: true });
}
