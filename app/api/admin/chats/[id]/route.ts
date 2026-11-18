import type { NextRequest } from "next/server";
import { error, json, requireAdmin } from "../../../../lib/server/auth";
import { CHAT_MESSAGE_MAX, CUSTOMER_ONLINE_MS, addMessage, chatFromRow, chatMessages } from "../../../../lib/server/chat";
import { sql, tx, userFromRow } from "../../../../lib/server/db";
import { sendMails, type Mail } from "../../../../lib/server/mail";
import { isUuid } from "../../../../lib/server/messages";
import { notifyUser } from "../../../../lib/server/notifications";

/** Розмова з покупцем: GET ?after=<seq> — нові повідомлення; відкриття позначає їх прочитаними */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/admin/chats/[id]">) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (!isUuid(id)) return error("Розмову не знайдено", 404);
  const [row] = await sql("update chats set admin_read_at = now() where id = $1 returning *", [id]);
  if (!row) return error("Розмову не знайдено", 404);
  const after = Math.max(0, Math.floor(Number(req.nextUrl.searchParams.get("after")) || 0));
  return json({ chat: { ...chatFromRow(row), guest: !row.user_id }, messages: await chatMessages(id, after) });
}

/**
 * Відповідь адміністратора. Якщо покупця зараз немає в чаті — дублюємо:
 * з акаунтом — сповіщення на сайті (і лист, якщо не вимкнув), гостю — лист на email
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/chats/[id]">) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (!isUuid(id)) return error("Розмову не знайдено", 404);
  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").trim().slice(0, CHAT_MESSAGE_MAX);
  if (!text) return error("Напишіть відповідь");

  const mails: Mail[] = [];
  const result = await tx(async (q) => {
    const [row] = await q.query("select * from chats where id = $1 for update", [id]);
    if (!row) return null;
    const chat = chatFromRow(row);
    const message = await addMessage(q, id, "admin", text);
    const online = chat.customerSeenAt && Date.now() - new Date(chat.customerSeenAt).getTime() < CUSTOMER_ONLINE_MS;
    let notified = false;
    if (!online) {
      const preview = text.length > 300 ? `${text.slice(0, 300)}…` : text;
      const [user] = chat.userId ? await q.query("select * from users where id = $1", [chat.userId]) : [];
      if (user) {
        await notifyUser(q, userFromRow(user), { kind: "reply", title: "Відповідь у чаті Family Camping", text: preview, href: "/?chat=1" }, mails);
        notified = true;
      } else if (chat.email) {
        mails.push({
          to: chat.email,
          subject: "Відповідь у чаті Family Camping",
          text: `${chat.name ? `${chat.name}, ` : ""}консультант відповів у чаті:\n\n${preview}\n\nПродовжити розмову можна на сайті — вікно чату в правому нижньому куті.`,
          href: "/?chat=1",
        });
        notified = true;
      }
    }
    return { message, notified };
  });
  if (!result) return error("Розмову не знайдено", 404);
  await sendMails(mails);
  return json(result);
}
