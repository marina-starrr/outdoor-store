import { NextResponse, type NextRequest } from "next/server";
import {
  cleanText,
  createSession,
  error,
  hashPassword,
  isEmail,
  isPhone,
  isSameOrigin,
  knownProductIds,
  normalizeEmail,
  publicUser,
  sanitizeCart,
  sanitizeIds,
} from "../../../lib/server/auth";
import { tx, userFromRow } from "../../../lib/server/db";
import { issueVerification, verificationMail } from "../../../lib/server/email-verify";
import { setCart, setFavorites } from "../../../lib/server/lists";
import { sendMail } from "../../../lib/server/mail";

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
  const known = await knownProductIds();
  const cart = sanitizeCart(body.cart, known);
  const favorites = sanitizeIds(body.favorites, known);

  const created = await tx(async (q) => {
    // Унікальність email гарантує база: при збігу рядок не вставиться
    const [row] = await q.query(
      `insert into users (email, first_name, last_name, phone, password_hash)
       values ($1, $2, $3, $4, $5) on conflict (email) do nothing returning *`,
      [email, firstName, lastName, phone, passwordHash],
    );
    if (!row) return null;
    // Власник запросив цю адресу в адміністратори — права з'являться після підтвердження email
    const [invited] = await q.query(
      `with invite as (delete from admin_invites where email = $2 returning 1)
       update users set is_admin = true where id = $1 and exists (select 1 from invite) returning *`,
      [row.id, email],
    );
    const user = userFromRow(invited ?? row);
    await setCart(user.id, cart, q);
    await setFavorites(user.id, favorites, q);
    return { user, token: await issueVerification(user.id, q) };
  });
  if (!created) return error("Акаунт з таким email уже існує. Спробуйте увійти.", 409);
  const { user, token } = created;
  await sendMail(verificationMail(user, token));

  const res = NextResponse.json({ user: publicUser(user), cart, favorites });
  await createSession(res, user.id);
  return res;
}
