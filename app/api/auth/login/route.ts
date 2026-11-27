import { NextResponse, type NextRequest } from "next/server";
import {
  createSession,
  error,
  findUserByEmail,
  hashPassword,
  isSameOrigin,
  loginLimiter,
  normalizeEmail,
  productIdsOf,
  publicUser,
  sanitizeCart,
  sanitizeIds,
  verifyPassword,
} from "../../../lib/server/auth";
import { listedProductIds } from "../../../lib/server/catalog";
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
  const { cart, favorites } = await tx(async (q) => {
    const [savedCart, savedFavorites] = [await getCart(user.id, q), await getFavorites(user.id, q)];
    // Перевіряються лише товари з обох кошиків і списків обраного — не весь каталог
    const known = await listedProductIds(productIdsOf(savedCart, body.cart, savedFavorites, body.favorites), q);
    const cart = sanitizeCart([...savedCart, ...sanitizeCart(body.cart, known)], known);
    const favorites = sanitizeIds([...savedFavorites, ...sanitizeIds(body.favorites, known)], known);
    await setCart(user.id, cart, q);
    await setFavorites(user.id, favorites, q);
    return { cart, favorites };
  });

  const res = NextResponse.json({ user: publicUser(user), cart, favorites });
  await createSession(res, user.id);
  return res;
}
