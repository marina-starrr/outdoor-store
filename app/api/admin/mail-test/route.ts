import type { NextRequest } from "next/server";
import { json, rateLimiter, requireAdmin } from "../../../lib/server/auth";
import { mailSetup, sendTestMail } from "../../../lib/server/mail";

/** Не частіше 5 тестових листів за 10 хвилин (Gmail не любить зливу листів) */
const limited = rateLimiter("mail-test", 5, 10 * 60_000);

/** Як налаштована пошта (без паролів) */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  return json(mailSetup());
}

/** Тестовий лист на адресу адміністратора: доходить чи ні, і чому */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  if (await limited(auth.user.id)) return json({ ok: false, error: "Забагато перевірок — спробуйте за кілька хвилин" }, 429);
  const result = await sendTestMail(auth.user.email);
  return json({ ...result, to: auth.user.email, ...mailSetup() });
}
