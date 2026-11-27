import { NextResponse, type NextRequest } from "next/server";
import {
  cleanText,
  clientIp,
  error,
  getUser,
  isEmail,
  isPhone,
  isSameOrigin,
  json,
  knownProductIds,
  rateLimiter,
} from "../../lib/server/auth";
import { loadProducts } from "../../lib/server/catalog";
import {
  CHAT_MESSAGE_MAX,
  addMessage,
  chatMessages,
  createChat,
  findChat,
  setChatCookie,
  unreadCount,
} from "../../lib/server/chat";
import { sql, tx } from "../../lib/server/db";
import { chatMessageText, notifyAdmin } from "../../lib/server/telegram";

/** Не більше 20 повідомлень за 10 хвилин з однієї IP — захист від спаму */
const limited = rateLimiter("chat", 20, 10 * 60_000);
/** Скільки часу без повідомлень покупця, щоб знову сповістити в Telegram (не на кожне слово) */
const TELEGRAM_PAUSE_MS = 3 * 60_000;

/**
 * Розмова поточного покупця: GET /api/chat?after=<seq> — нові повідомлення
 * (віконце чату опитує сервер кілька секунд, поки відкрите)
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  const chat = await findChat(req, user);
  if (!chat) return json({ chat: null, messages: [], unread: 0 });
  const after = Math.max(0, Math.floor(Number(req.nextUrl.searchParams.get("after")) || 0));
  // «Покупець зараз тут» — відповідь не дублюватимемо листом
  if (req.nextUrl.searchParams.get("open") === "1")
    await sql("update chats set customer_seen_at = now() where id = $1", [chat.id]);
  const [messages, unread] = await Promise.all([chatMessages(chat.id, after), unreadCount(chat.id, "customer")]);
  return json({ chat: { name: chat.name }, messages, unread });
}

/** Повідомлення від покупця. Перше повідомлення гостя — з ім'ям і телефоном або email */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const body = await req.json().catch(() => ({}));
  // Пастка для ботів: приховане поле, яке людина не заповнює
  if (cleanText(body.website, 100)) return json({ ok: true });

  const text = String(body.text ?? "").trim().slice(0, CHAT_MESSAGE_MAX);
  if (!text) return error("Напишіть повідомлення");
  const productId = cleanText(body.productId, 60);
  const product = productId && (await knownProductIds(productId)).has(productId) ? productId : undefined;
  if (await limited(clientIp(req))) return error("Забагато повідомлень. Зачекайте кілька хвилин.", 429);

  const user = await getUser(req);
  let chat = await findChat(req, user);
  let token: string | undefined;

  if (!chat) {
    // Перше повідомлення: як звертатись і куди відповісти, якщо покупець закриє сайт
    const name = user ? `${user.firstName} ${user.lastName}`.trim() : cleanText(body.name, 60);
    const phone = user ? user.phone : cleanText(body.phone, 20);
    const email = user ? user.email : cleanText(body.email, 254).toLowerCase();
    if (!user) {
      if (name.length < 2) return json({ error: "Як до вас звертатися?", field: "name" }, 400);
      const phoneGiven = phone.replace(/\D/g, "").length > 3;
      if (phoneGiven && !isPhone(phone)) return json({ error: "Перевірте номер телефону", field: "phone" }, 400);
      if (email && !isEmail(email)) return json({ error: "Перевірте email", field: "email" }, 400);
      if (!phoneGiven && !email)
        return json({ error: "Залиште телефон або email — щоб ми могли відповісти, навіть якщо ви закриєте сайт", field: "phone" }, 400);
    }
    const created = await tx((q) =>
      createChat(q, { user, name: name || "Покупець", phone: phone.replace(/\D/g, "").length === 12 ? phone : undefined, email: email || undefined }),
    );
    chat = created.chat;
    token = created.token;
  }

  // Сповіщення в Telegram — на початок розмови або після паузи, а не на кожне повідомлення
  const [last] = await sql(
    "select created_at from chat_messages where chat_id = $1 and author = 'customer' order by seq desc limit 1",
    [chat.id],
  );
  const message = await tx((q) => addMessage(q, chat.id, "customer", text, product));
  if (!last || Date.now() - new Date(last.created_at).getTime() > TELEGRAM_PAUSE_MS) {
    const productName = product ? (await loadProducts([product]))[0]?.name : undefined;
    await notifyAdmin(chatMessageText(chat, text, productName));
  }

  const res = NextResponse.json({ message, chat: { name: chat.name } });
  if (token) setChatCookie(res, token);
  return res;
}
