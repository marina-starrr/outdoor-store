import type { NextRequest } from "next/server";
import { error, isAdminEmail, isEmail, isOwner, json, normalizeEmail, requireAdmin } from "../../../lib/server/auth";
import { addAdmin, adminInviteMail, listTeam, removeAdmin } from "../../../lib/server/admins";
import { sendMail } from "../../../lib/server/mail";
import { notifyAdmin } from "../../../lib/server/telegram";

const ONLY_OWNER = "Додавати й прибирати адміністраторів може лише власник магазину";

/** Список адміністраторів (бачать усі адміністратори; змінювати — лише власник) */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  return json({ team: await listTeam(), canManage: isOwner(auth.user) });
}

/** Додати адміністратора за email */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  if (!isOwner(auth.user)) return error(ONLY_OWNER, 403);
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  if (!isEmail(email)) return error("Перевірте email");
  if (isAdminEmail(email)) return error("Це адреса власника — у неї вже є всі права");

  const added = await addAdmin(email, auth.user);
  if (!added) return error("Ця адреса вже є серед адміністраторів");
  const mailed = await sendMail(adminInviteMail(email, auth.user, added.registered));
  await notifyAdmin(`🛡 Новий адміністратор: ${email}\nДодав(-ла): ${auth.user.email}`);
  return json({ team: await listTeam(), canManage: true, registered: added.registered, mailed });
}

/** Прибрати адміністратора: DELETE /api/admin/team?email=… */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  if (!isOwner(auth.user)) return error(ONLY_OWNER, 403);
  const email = normalizeEmail(req.nextUrl.searchParams.get("email"));
  if (isAdminEmail(email)) return error("Власника не можна прибрати з панелі — його адреса задана в налаштуваннях Vercel (ADMIN_EMAILS)");
  if (!(await removeAdmin(email))) return error("Такого адміністратора немає", 404);
  await notifyAdmin(`🛡 Адміністратора прибрано: ${email}\nПрибрав(-ла): ${auth.user.email}`);
  return json({ team: await listTeam(), canManage: true });
}
