import type { NextRequest } from "next/server";
import { error, getUser, isSameOrigin, json, rateLimiter } from "../../../../lib/server/auth";
import { issueVerification, verificationMail } from "../../../../lib/server/email-verify";
import { mailEnabled, sendMail } from "../../../../lib/server/mail";

/** Не більше 3 листів на годину для одного акаунта */
const limited = rateLimiter(3, 60 * 60_000);

/** Надіслати лист підтвердження ще раз */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const user = await getUser(req);
  if (!user) return error("Потрібно увійти", 401);
  if (user.emailVerifiedAt) return json({ sent: false, alreadyVerified: true });
  // Пошта не налаштована — підказка для власника, як підтвердити адресу інакше
  if (!mailEnabled()) return json({ sent: false, mailEnabled: false });
  if (limited(user.id)) return error("Лист уже надіслано кілька разів. Перевірте папку «Спам» або спробуйте за годину.", 429);

  const token = await issueVerification(user.id);
  const sent = await sendMail(verificationMail(user, token));
  return json({ sent, mailEnabled: true });
}
