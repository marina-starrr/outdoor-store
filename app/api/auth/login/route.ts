import { NextResponse, type NextRequest } from "next/server";
import {
  createSession,
  error,
  findUserByEmail,
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
import { tx } from "../../../lib/server/db";
import { getCart, getFavorites, setCart, setFavorites } from "../../../lib/server/lists";

const WRONG = "Невірний email або пароль";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");

  const limiter = loginLimiter(req, email);
  if (await limiter.blocked())
    return error("Забагато спроб входу. Спробуйте через 15 хвилин.", 429);

  const user = email ? await findUserByEmail(email) : null;
  // Для неіснуючого email теж рахуємо хеш — щоб за часом відповіді не можна було
  // з'ясувати, які адреси зареєстровані
  const valid = user
    ? await verifyPassword(password, user.passwordHash)
    : (await hashPassword(password), false);
  if (!user || !valid) {
    await limiter.fail();
    return error(WRONG, 401);
  }
  await limiter.reset();

  // Кошик гостя додається до кошика акаунта
  const known = await knownProductIds();
  const guestCart = sanitizeCart(body.cart, known);
  const guestFavorites = sanitizeIds(body.favorites, known);
  const { cart, favorites } = await tx(async (q) => {
    const cart = sanitizeCart([...(await getCart(user.id, q)), ...guestCart], known);
    const favorites = sanitizeIds([...(await getFavorites(user.id, q)), ...guestFavorites], known);
    await setCart(user.id, cart, q);
    await setFavorites(user.id, favorites, q);
    return { cart, favorites };
  });

  const res = NextResponse.json({ user: publicUser(user), cart, favorites });
  await createSession(res, user.id);
  return res;
}
