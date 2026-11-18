import type { NextRequest } from "next/server";
import { json, requireAdmin } from "../../../lib/server/auth";
import { chatFromRow, messageFromRow } from "../../../lib/server/chat";
import { num, sql } from "../../../lib/server/db";

/** Усі розмови, найсвіжіші першими: контакти, останнє повідомлення, скільки непрочитаних */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const rows = await sql(
    `select c.*,
       (select to_jsonb(m) from chat_messages m where m.chat_id = c.id order by m.seq desc limit 1) as last,
       (select count(*) from chat_messages m
        where m.chat_id = c.id and m.author = 'customer' and m.created_at > coalesce(c.admin_read_at, '-infinity')) as unread
     from chats c
     where exists (select 1 from chat_messages m where m.chat_id = c.id)
     order by c.last_message_at desc
     limit 300`,
  );
  return json({
    chats: rows.map((r) => ({
      ...chatFromRow(r),
      guest: !r.user_id,
      unread: num(r.unread),
      last: r.last ? messageFromRow(r.last) : null,
    })),
  });
}
