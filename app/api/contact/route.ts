import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { MESSAGE_MAX, contactTopics } from "../../components/contact-topics";
import { cleanText, error, getUser, isEmail, isPhone, isSameOrigin, json } from "../../lib/server/auth";
import { contactRateLimited, saveMessage } from "../../lib/server/messages";

/** Форма зворотного зв'язку — доступна і гостям, і авторизованим */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const body = await req.json().catch(() => ({}));

  // Пастка для ботів: приховане поле, яке людина не заповнює
  if (cleanText(body.website, 100)) return json({ ok: true });

  const topic = contactTopics.find((t) => t.id === body.topic);
  if (!topic) return error("Оберіть тему звернення");
  const name = cleanText(body.name, 60);
  const email = cleanText(body.email, 254).toLowerCase();
  const phone = cleanText(body.phone, 20);
  const order = cleanText(body.order, 20);
  const message = cleanText(body.message, MESSAGE_MAX);
  if (name.length < 2) return error("Вкажіть ім'я");
  if (!isEmail(email)) return error("Перевірте email");
  if (phone && phone.replace(/\D/g, "").length > 3 && !isPhone(phone)) return error("Перевірте номер телефону");
  if (message.length < 10) return error("Опишіть питання трохи детальніше (від 10 символів)");

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (contactRateLimited(ip)) return error("Забагато звернень. Спробуйте за кілька хвилин.", 429);

  const user = await getUser(req);
  await saveMessage({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    topic: topic.label,
    name,
    email,
    phone: phone.replace(/\D/g, "").length === 12 ? phone : undefined,
    order: order || undefined,
    message,
    userId: user?.id,
  });
  return json({ ok: true });
}
