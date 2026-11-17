import "server-only";
import { randomBytes } from "node:crypto";
import { SITE_NAME } from "../site";
import { sha256 } from "./auth";
import { db, userFromRow, type Queryable, type StoredUser } from "./db";
import type { Mail } from "./mail";

/*
 * Підтвердження email. Без нього адреса з ADMIN_EMAILS не дає прав
 * адміністратора: інакше будь-хто, хто першим зареєструється з цією адресою,
 * отримав би адмінку. Посилання діє 48 годин; у базі — лише хеш токена.
 */

const TTL = 48 * 3_600_000;

/** Створює нове посилання (попереднє перестає діяти) і повертає токен для листа */
export async function issueVerification(userId: string, q: Queryable = db): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await q.query("update users set email_verify_hash = $2, email_verify_expires_at = $3 where id = $1", [
    userId,
    sha256(token),
    new Date(Date.now() + TTL),
  ]);
  return token;
}

export function verificationMail(user: Pick<StoredUser, "email" | "firstName">, token: string): Mail {
  return {
    to: user.email,
    subject: `Підтвердіть email — ${SITE_NAME}`,
    text:
      `${user.firstName}, натисніть кнопку нижче, щоб підтвердити адресу ${user.email}.\n\n` +
      "Посилання діє 48 годин. Якщо ви не створювали акаунт — просто проігноруйте цей лист.",
    href: `/verify-email?token=${encodeURIComponent(token)}`,
  };
}

/** Підтверджує email за токеном; повертає користувача або null (невірне чи прострочене посилання) */
export async function confirmVerification(token: string, q: Queryable = db): Promise<StoredUser | null> {
  if (!token || token.length > 100) return null;
  const [row] = await q.query(
    `update users set email_verified_at = now(), email_verify_hash = null, email_verify_expires_at = null
     where email_verify_hash = $1 and email_verify_expires_at > now() returning *`,
    [sha256(token)],
  );
  return row ? userFromRow(row) : null;
}
