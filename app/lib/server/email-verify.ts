import "server-only";
import { randomBytes } from "node:crypto";
import { SITE_NAME } from "../site";
import { sha256 } from "./auth";
import type { Data, StoredUser } from "./db";
import type { Mail } from "./mail";

/*
 * Підтвердження email. Без нього адреса з ADMIN_EMAILS не дає прав
 * адміністратора: інакше будь-хто, хто першим зареєструється з цією адресою,
 * отримав би адмінку. Посилання діє 48 годин; у базі — лише хеш токена.
 */

const TTL = 48 * 3_600_000;

/** Створює нове посилання (попереднє перестає діяти) і повертає токен для листа */
export function issueVerification(user: StoredUser): string {
  const token = randomBytes(32).toString("base64url");
  user.emailVerify = { hash: sha256(token), expiresAt: Date.now() + TTL };
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
export function confirmVerification(db: Data, token: string): StoredUser | null {
  if (!token || token.length > 100) return null;
  const hash = sha256(token);
  const user = db.users.find((u) => u.emailVerify?.hash === hash);
  if (!user || user.emailVerify!.expiresAt < Date.now()) return null;
  user.emailVerifiedAt = new Date().toISOString();
  delete user.emailVerify;
  return user;
}
