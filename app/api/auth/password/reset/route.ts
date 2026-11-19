import type { NextRequest } from "next/server";
import { cleanText, clientIp, error, isSameOrigin, json, rateLimiter } from "../../../../lib/server/auth";
import { MIN_PASSWORD, resetPassword } from "../../../../lib/server/password-reset";

/** Не більше 20 спроб за 10 хвилин з однієї IP — щоб не перебирали токени */
const limited = rateLimiter("pw-reset", 20, 10 * 60_000);

/**
 * Новий пароль за посиланням з листа. Після успіху сторінка входить у акаунт
 * звичайним входом з новим паролем (так кошик гостя додається до акаунта)
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  if (await limited(clientIp(req))) return error("Забагато спроб. Спробуйте за кілька хвилин.", 429);
  const body = await req.json().catch(() => ({}));
  const password = String(body.password ?? "");
  if (password.length < MIN_PASSWORD) return error(`Пароль має містити щонайменше ${MIN_PASSWORD} символів`);
  if (password.length > 200) return error("Занадто довгий пароль");

  const user = await resetPassword(cleanText(body.token, 100), password);
  if (!user) return error("Посилання недійсне або застаріло. Запросіть новий лист на сторінці входу.", 400);
  return json({ ok: true, email: user.email });
}
