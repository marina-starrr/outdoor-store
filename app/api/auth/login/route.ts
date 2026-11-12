import { NextResponse, type NextRequest } from "next/server";
import {
  createSession,
  error,
  hashPassword,
  isSameOrigin,
  knownProductIds,
  loginLimiter,
  normalizeEmail,
  publicUser,
  sanitizeCart,
  sanitizeIds,
  verifyPassword,
} from "../../../lib/server/auth";
import { read, write } from "../../../lib/server/db";

const WRONG = "Невірний email або пароль";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");

  const limiter = loginLimiter(req, email);
  if (limiter.blocked())
    return error("Забагато спроб входу. Спробуйте через 15 хвилин.", 429);

  const user = await read((db) => db.users.find((u) => u.email === email));
  // Для неіснуючого email теж рахуємо хеш — щоб за часом відповіді не можна було
  // з'ясувати, які адреси зареєстровані
  const valid = user
    ? await verifyPassword(password, user.passwordHash)
    : (await hashPassword(password), false);
  if (!user || !valid) {
    limiter.fail();
    return error(WRONG, 401);
  }
  limiter.reset();

  // Кошик гостя додається до кошика акаунта
  const known = await knownProductIds();
  const guestCart = sanitizeCart(body.cart, known);
  const guestFavorites = sanitizeIds(body.favorites, known);
  const { cart, favorites } = await write((db) => {
    const u = db.users.find((x) => x.id === user.id)!;
    u.cart = sanitizeCart([...u.cart, ...guestCart], known);
    u.favorites = sanitizeIds([...(u.favorites ?? []), ...guestFavorites], known);
    return { cart: u.cart, favorites: u.favorites };
  });

  const res = NextResponse.json({ user: publicUser(user), cart, favorites });
  await createSession(res, user.id);
  return res;
}
