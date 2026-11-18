import type { NextRequest } from "next/server";
import { customerCanCancel } from "../../../lib/order-status";
import { cleanText, clientIp, error, getUser, isSameOrigin, json, rateLimiter } from "../../../lib/server/auth";
import { changeOrderStatus } from "../../../lib/server/order-flow";
import { findOrder, phoneDigits, trackingView } from "../../../lib/server/orders";
import { notifyAdmin } from "../../../lib/server/telegram";

/** Не більше 10 спроб за 10 хвилин з однієї IP-адреси — щоб не перебирали номери */
const limited = rateLimiter("order-cancel", 10, 10 * 60_000);

const NOT_FOUND = "Замовлення не знайдено. Перевірте номер і телефон, вказаний при оформленні.";

/**
 * Покупець сам скасовує замовлення, доки його не оплатив.
 * З акаунтом — своє замовлення; гість — за номером і телефоном (як на «Де моє замовлення?»)
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const body = await req.json().catch(() => ({}));
  const number = cleanText(body.number, 20).toUpperCase().replace(/\s/g, "");
  if (!/^FC-\d{7}$/.test(number)) return error("Номер замовлення має вигляд FC-1234567");
  if (await limited(clientIp(req))) return error("Забагато спроб. Спробуйте за кілька хвилин.", 429);

  const user = await getUser(req);
  const phone = phoneDigits(cleanText(body.phone, 30));
  const found = await findOrder(number);
  if (!found) return error(NOT_FOUND, 404);
  const own = !!user && found.owner?.id === user.id;
  const byPhone = phone.length === 12 && phoneDigits(found.order.contact.phone) === phone;
  // Однакова відповідь, якщо замовлення чуже — не підказуємо, що номер існує
  if (!own && !byPhone) return error(NOT_FOUND, 404);

  const result = await changeOrderStatus(number, "cancelled", "customer", (o) =>
    customerCanCancel(o.status)
      ? null
      : o.status === "cancelled"
        ? "Замовлення вже скасовано"
        : "Оплачене замовлення скасувати самостійно не можна — напишіть нам, і ми повернемо кошти",
  );
  if ("notFound" in result) return error(NOT_FOUND, 404);
  if ("error" in result) return error(result.error, 409);

  await notifyAdmin(`❌ Покупець скасував замовлення ${number} (${result.order.contact.firstName} ${result.order.contact.lastName}, ${result.order.contact.phone})`);
  return json({ order: trackingView(result.order) });
}
