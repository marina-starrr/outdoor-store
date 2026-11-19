import "server-only";
import { randomBytes } from "node:crypto";
import { SITE_NAME } from "../site";
import { hashPassword, sha256 } from "./auth";
import { db, tx, userFromRow, type Queryable, type StoredUser } from "./db";
import type { Mail } from "./mail";

/*
 * Відновлення пароля через лист. Посилання одноразове й діє годину;
 * у базі — лише хеш токена. Новий пароль закриває всі старі сесії
 * (якщо пароль хтось дізнався — його вхід перестає діяти).
 */

export const RESET_TTL_MINUTES = 60;
export const MIN_PASSWORD = 8;

/** Нове посилання (попереднє перестає діяти); повертає токен для листа */
export async function issuePasswordReset(userId: string, q: Queryable = db): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await q.query("update users set password_reset_hash = $2, password_reset_expires_at = $3 where id = $1", [
    userId,
    sha256(token),
    new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
  ]);
  return token;
}

export function passwordResetMail(user: Pick<StoredUser, "email" | "firstName">, token: string): Mail {
  return {
    to: user.email,
    subject: `Відновлення пароля — ${SITE_NAME}`,
    text:
      `${user.firstName}, ви попросили змінити пароль до акаунта ${user.email}. ` +
      "Натисніть кнопку нижче й задайте новий пароль.\n\n" +
      `Посилання діє ${RESET_TTL_MINUTES} хвилин і спрацьовує один раз. ` +
      "Якщо ви не просили відновлення — просто проігноруйте лист, пароль не зміниться.",
    href: `/reset-password?token=${encodeURIComponent(token)}`,
  };
}

/**
 * Встановлює новий пароль за токеном. Одночасно: токен гасне, усі сесії
 * користувача видаляються, email вважається підтвердженим (лист дійшов до
 * власника скриньки). Повертає користувача або null (недійсне посилання)
 */
export async function resetPassword(token: string, password: string): Promise<StoredUser | null> {
  if (!token || token.length > 100) return null;
  const passwordHash = await hashPassword(password);
  return tx(async (q) => {
    const [row] = await q.query(
      `update users set password_hash = $2, password_reset_hash = null, password_reset_expires_at = null,
              email_verified_at = coalesce(email_verified_at, now())
       where password_reset_hash = $1 and password_reset_expires_at > now() returning *`,
      [sha256(token), passwordHash],
    );
    if (!row) return null;
    await q.query("delete from sessions where user_id = $1", [row.id]);
    return userFromRow(row);
  });
}
