import { NextResponse, type NextRequest } from "next/server";
import {
  cleanText,
  createSession,
  error,
  hashPassword,
  isEmail,
  isPhone,
  isSameOrigin,
  newUserId,
  normalizeEmail,
  publicUser,
  sanitizeCart,
  sanitizeIds,
} from "../../../lib/server/auth";
import { write } from "../../../lib/server/db";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const body = await req.json().catch(() => ({}));

  const email = normalizeEmail(body.email);
  const firstName = cleanText(body.firstName, 50);
  const lastName = cleanText(body.lastName, 50);
  const phone = cleanText(body.phone, 20);
  const password = String(body.password ?? "");

  if (firstName.length < 2) return error("Вкажіть ім'я");
  if (!isEmail(email)) return error("Перевірте email");
  if (!isPhone(phone)) return error("Номер у форматі +380 XX XXX XX XX");
  if (password.length < 8) return error("Пароль має містити щонайменше 8 символів");
  if (password.length > 200) return error("Занадто довгий пароль");

  const passwordHash = await hashPassword(password);
  const guestCart = sanitizeCart(body.cart);

  const user = await write((db) => {
    if (db.users.some((u) => u.email === email)) return null;
    const created = {
      id: newUserId(),
      email,
      firstName,
      lastName,
      phone,
      passwordHash,
      createdAt: new Date().toISOString(),
      cart: guestCart,
      favorites: sanitizeIds(body.favorites),
      orders: [],
    };
    db.users.push(created);
    return created;
  });
  if (!user) return error("Акаунт з таким email уже існує. Спробуйте увійти.", 409);

  const res = NextResponse.json({ user: publicUser(user), cart: user.cart, favorites: user.favorites });
  await createSession(res, user.id);
  return res;
}
