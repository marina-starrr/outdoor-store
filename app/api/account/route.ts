import type { NextRequest } from "next/server";
import {
  cleanText,
  error,
  getUser,
  hashPassword,
  isPhone,
  isSameOrigin,
  json,
  publicUser,
  verifyPassword,
} from "../../lib/server/auth";
import { write } from "../../lib/server/db";

/** Оновлення особистих даних (і, за бажанням, пароля) */
export async function PATCH(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const user = await getUser(req);
  if (!user) return error("Потрібно увійти", 401);

  const body = await req.json().catch(() => ({}));
  const firstName = cleanText(body.firstName, 50);
  const lastName = cleanText(body.lastName, 50);
  const phone = cleanText(body.phone, 20);
  if (firstName.length < 2) return error("Вкажіть ім'я");
  if (!isPhone(phone)) return error("Номер у форматі +380 XX XXX XX XX");

  let passwordHash: string | undefined;
  if (body.newPassword) {
    if (!(await verifyPassword(String(body.currentPassword ?? ""), user.passwordHash)))
      return error("Поточний пароль невірний");
    if (String(body.newPassword).length < 8)
      return error("Новий пароль має містити щонайменше 8 символів");
    passwordHash = await hashPassword(String(body.newPassword));
  }

  const updated = await write((db) => {
    const u = db.users.find((x) => x.id === user.id)!;
    Object.assign(u, { firstName, lastName, phone }, passwordHash ? { passwordHash } : {});
    return u;
  });
  return json({ user: publicUser(updated) });
}
