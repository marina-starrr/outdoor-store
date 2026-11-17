import type { NextRequest } from "next/server";
import { cleanText, clientIp, error, isSameOrigin, json, publicUser, rateLimiter } from "../../../lib/server/auth";
import { confirmVerification } from "../../../lib/server/email-verify";

/** Не більше 20 спроб за 10 хвилин з однієї IP — щоб не перебирали токени */
const limited = rateLimiter(20, 10 * 60_000);

/**
 * Підтвердження email за токеном із листа. Сторінка /verify-email надсилає його
 * POST-запитом (а не GET), щоб поштові сканери посилань не підтверджували адресу самі
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  if (limited(clientIp(req))) return error("Забагато спроб. Спробуйте за кілька хвилин.", 429);
  const body = await req.json().catch(() => ({}));
  const user = await confirmVerification(cleanText(body.token, 100));
  if (!user) return error("Посилання недійсне або застаріло. Надішліть новий лист з профілю.", 400);
  return json({ user: publicUser(user) });
}
