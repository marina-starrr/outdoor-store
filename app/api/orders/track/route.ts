import type { NextRequest } from "next/server";
import { cleanText, clientIp, error, isSameOrigin, json, rateLimiter } from "../../../lib/server/auth";
import { expireUnpaidOrders } from "../../../lib/server/order-flow";
import { findOrder, phoneDigits, trackingView } from "../../../lib/server/orders";

/** Не більше 10 спроб за 10 хвилин з однієї IP-адреси — щоб не перебирали номери */
const limited = rateLimiter("track", 10, 10 * 60_000);

/** «Де моє замовлення?» — статус за номером і телефоном, без входу */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const body = await req.json().catch(() => ({}));
  const number = cleanText(body.number, 20).toUpperCase().replace(/\s/g, "");
  const phone = phoneDigits(cleanText(body.phone, 30));
  if (!/^FC-\d{7}$/.test(number)) return error("Номер замовлення має вигляд FC-1234567");
  if (phone.length !== 12) return error("Номер телефону у форматі +380 XX XXX XX XX");
  if (await limited(clientIp(req))) return error("Забагато спроб. Спробуйте за кілька хвилин.", 429);

  await expireUnpaidOrders();
  const order = (await findOrder(number))?.order;
  // Однакова відповідь, якщо номера немає або телефон не збігся
  if (!order || phoneDigits(order.contact.phone) !== phone)
    return error("Замовлення не знайдено. Перевірте номер і телефон, вказаний при оформленні.", 404);
  return json({ order: trackingView(order) });
}
