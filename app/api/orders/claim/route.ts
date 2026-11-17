import type { NextRequest } from "next/server";
import { error, getUser, isSameOrigin, json } from "../../../lib/server/auth";
import { claimGuestOrders } from "../../../lib/server/orders";

/**
 * Переносить в акаунт гостьові замовлення, оформлені в цьому браузері
 * (браузер передає збережені токени замовлень)
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const user = await getUser(req);
  if (!user) return error("Потрібно увійти", 401);
  const body = await req.json().catch(() => ({}));
  const claimed = await claimGuestOrders(user, body.tokens);
  return json({ claimed });
}
