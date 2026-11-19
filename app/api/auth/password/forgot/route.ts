import type { NextRequest } from "next/server";
import {
  clientIp,
  error,
  findUserByEmail,
  isEmail,
  isSameOrigin,
  json,
  normalizeEmail,
  rateLimiter,
} from "../../../../lib/server/auth";
import { mailEnabled, sendMail } from "../../../../lib/server/mail";
import { issuePasswordReset, passwordResetMail } from "../../../../lib/server/password-reset";

/** Не більше 3 листів на годину на одну адресу і 10 запитів на годину з однієї IP */
const perEmail = rateLimiter("pw-forgot-email", 3, 60 * 60_000);
const perIp = rateLimiter("pw-forgot-ip", 10, 60 * 60_000);

/**
 * «Забули пароль?» — лист із посиланням на /reset-password.
 * Відповідь однакова для зареєстрованих і незареєстрованих адрес,
 * щоб за нею не можна було перевіряти, хто має акаунт
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  if (!isEmail(email)) return error("Перевірте email");
  // Пошта не налаштована — покупцю підкажемо написати в чат
  if (!mailEnabled()) return json({ sent: false, mailEnabled: false });
  if ((await perIp(clientIp(req))) || (await perEmail(email)))
    return error("Забагато запитів. Перевірте пошту (і папку «Спам») або спробуйте за годину.", 429);

  const user = await findUserByEmail(email);
  if (user) {
    const token = await issuePasswordReset(user.id);
    await sendMail(passwordResetMail(user, token));
  }
  return json({ sent: true, mailEnabled: true });
}
