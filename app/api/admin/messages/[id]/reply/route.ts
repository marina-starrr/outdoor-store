import type { NextRequest } from "next/server";
import { REPLY_MAX } from "../../../../../components/contact-topics";
import { cleanText, error, json, requireAdmin } from "../../../../../lib/server/auth";
import { iso, sql, tx, userFromRow, type MessageReply } from "../../../../../lib/server/db";
import { sendMail } from "../../../../../lib/server/mail";
import { findMessage } from "../../../../../lib/server/messages";
import { notifyUser } from "../../../../../lib/server/notifications";

/**
 * Відповідь на звернення з адмін-панелі.
 * - Покупець з акаунтом (звернення з акаунта або з тим самим email) бачить її
 *   у сповіщеннях на сайті;
 * - якщо налаштована пошта — відповідь іде листом на email звернення.
 * Звернення одразу позначається опрацьованим.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/messages/[id]/reply">) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const text = cleanText(body.text, REPLY_MAX);
  if (text.length < 2) return error("Напишіть відповідь");

  // Сповіщення на сайті пишемо разом з відповіддю; лист — після запису
  const result = await tx(async (q) => {
    const m = await findMessage(id, q);
    if (!m) return null;
    const [userRow] = await q.query(
      "select * from users where id = $1 or email = $2 order by (id = $1) desc limit 1",
      [m.userId ?? null, m.email],
    );
    if (userRow) {
      await notifyUser(q, userFromRow(userRow), {
        kind: "reply",
        title: `Відповідь на ваше звернення «${m.topic}»`,
        text,
        href: "/notifications",
      }, []); // лист надсилаємо нижче — на адресу звернення, навіть якщо листи сповіщень вимкнено
    }
    const [r] = await q.query(
      "insert into message_replies (message_id, text, on_site) values ($1, $2, $3) returning *",
      [m.id, text, !!userRow],
    );
    await q.query("update messages set done = true where id = $1", [m.id]);
    const reply: MessageReply = { id: r.id, createdAt: iso(r.created_at), text, onSite: !!userRow, emailed: false };
    return { m, reply };
  });
  if (!result) return error("Звернення не знайдено", 404);

  const emailed = await sendMail({
    to: result.m.email,
    subject: `Re: ${result.m.topic} — Family Camping`,
    text: `Вітаємо, ${result.m.name}!\n\n${text}\n\n— Команда Family Camping\n\nВаше звернення:\n«${result.m.message}»`,
  });
  if (emailed) await sql("update message_replies set emailed = true where id = $1", [result.reply.id]);

  return json({ message: await findMessage(id), reply: { ...result.reply, emailed } });
}
