import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { REPLY_MAX } from "../../../../../components/contact-topics";
import { cleanText, error, json, requireAdmin } from "../../../../../lib/server/auth";
import { write, type MessageReply } from "../../../../../lib/server/db";
import { sendMail } from "../../../../../lib/server/mail";
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
  const result = await write((db) => {
    const m = db.messages?.find((x) => x.id === id);
    if (!m) return null;
    const user =
      (m.userId && db.users.find((u) => u.id === m.userId)) ||
      db.users.find((u) => u.email.toLowerCase() === m.email.toLowerCase());
    const reply: MessageReply = { id: randomUUID(), createdAt: new Date().toISOString(), text, onSite: !!user, emailed: false };
    if (user) {
      notifyUser(user, {
        kind: "reply",
        title: `Відповідь на ваше звернення «${m.topic}»`,
        text,
        href: "/notifications",
      }, []); // лист надсилаємо нижче — на адресу звернення, навіть якщо листи сповіщень вимкнено
    }
    (m.replies ??= []).push(reply);
    m.done = true;
    return { m, reply };
  });
  if (!result) return error("Звернення не знайдено", 404);

  const emailed = await sendMail({
    to: result.m.email,
    subject: `Re: ${result.m.topic} — Family Camping`,
    text: `Вітаємо, ${result.m.name}!\n\n${text}\n\n— Команда Family Camping\n\nВаше звернення:\n«${result.m.message}»`,
  });
  const message = emailed
    ? await write((db) => {
        const m = db.messages!.find((x) => x.id === id)!;
        m.replies!.find((r) => r.id === result.reply.id)!.emailed = true;
        return m;
      })
    : result.m;

  return json({ message, reply: { ...result.reply, emailed } });
}
