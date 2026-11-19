import "server-only";
import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { NextResponse, type NextRequest } from "next/server";
import { MAX_QTY, type CartLine } from "../../components/cart-logic";
import { loadCatalog } from "./catalog";
import { sql, userFromRow, type StoredUser } from "./db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "fc_session";
const SESSION_DAYS = 30;

/* ---------- Паролі ---------- */

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [, saltB64, hashB64] = stored.split("$");
  if (!saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

/* ---------- Сесії ---------- */

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(res: NextResponse, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  // Заодно прибираємо прострочені сесії
  await sql("delete from sessions where expires_at < now()");
  await sql("insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)", [sha256(token), userId, expiresAt]);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function destroySession(req: NextRequest, res: NextResponse) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await sql("delete from sessions where token_hash = $1", [sha256(token)]);
  res.cookies.delete(SESSION_COOKIE);
}

/** Поточний користувач за cookie сесії, або null */
export async function getUser(req: NextRequest): Promise<StoredUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const [row] = await sql(
    `select u.* from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [sha256(token)],
  );
  return row ? userFromRow(row) : null;
}

/** Користувач за email (без урахування регістру) */
export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const [row] = await sql("select * from users where email = $1", [email]);
  return row ? userFromRow(row) : null;
}

export const newUserId = () => randomUUID();

/* ---------- Захист і валідація ---------- */

/**
 * Простий захист від CSRF: змінювальні запити приймаються лише з нашого ж сайту
 * (додатково до cookie SameSite=Lax).
 */
export function isSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

/** Обмеження частоти — лічильники в базі, див. rate-limit.ts */
export { clientIp, loginLimiter, rateLimiter } from "./rate-limit";

/** id товарів, які зараз показуються на сайті (не приховані) */
export async function knownProductIds(): Promise<ReadonlySet<string>> {
  return new Set((await loadCatalog()).filter((p) => !p.hidden).map((p) => p.id));
}

/** Очищує кошик з клієнта: лише існуючі товари, коректна кількість, без дублікатів */
export function sanitizeCart(input: unknown, knownIds: ReadonlySet<string>): CartLine[] {
  if (!Array.isArray(input)) return [];
  const merged = new Map<string, number>();
  for (const l of input) {
    const id = typeof l?.id === "string" ? l.id : "";
    const qty = Math.round(Number(l?.qty));
    if (!knownIds.has(id) || !Number.isFinite(qty) || qty < 1) continue;
    merged.set(id, Math.min(MAX_QTY, (merged.get(id) ?? 0) + qty));
  }
  return [...merged].map(([id, qty]) => ({ id, qty }));
}

/** Список id товарів: лише існуючі, без дублікатів, не більше 100 */
export function sanitizeIds(input: unknown, knownIds: ReadonlySet<string>): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((id): id is string => typeof id === "string" && knownIds.has(id)))].slice(0, 100);
}

/** Email зі списку ADMIN_EMAILS (через кому), напр. у .env.local: ADMIN_EMAILS=owner@example.com */
export function isAdminEmail(email: string) {
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** Має права адміністратора (ще без перевірки email): власник з ADMIN_EMAILS або доданий власником */
const hasAdminRole = (u: Pick<StoredUser, "email" | "grantedAdmin">) => isAdminEmail(u.email) || u.grantedAdmin;

/**
 * Адміністратор — власник (email у ADMIN_EMAILS) або доданий ним з адмін-панелі,
 * І email підтверджений власником скриньки. Без підтвердження будь-хто міг би
 * першим зареєструватися з чужою адресою й отримати адмінку
 */
export function isAdmin(u: Pick<StoredUser, "email" | "emailVerifiedAt" | "grantedAdmin">) {
  return hasAdminRole(u) && !!u.emailVerifiedAt;
}

/** Власник: лише він додає й прибирає інших адміністраторів */
export function isOwner(u: Pick<StoredUser, "email" | "emailVerifiedAt">) {
  return isAdminEmail(u.email) && !!u.emailVerifiedAt;
}

/** Поточний адміністратор або відповідь з помилкою (401 / 403) */
export async function requireAdmin(req: NextRequest): Promise<{ user: StoredUser } | { response: NextResponse }> {
  if (!isSameOrigin(req)) return { response: error("Forbidden", 403) };
  const user = await getUser(req);
  if (!user) return { response: error("Потрібно увійти", 401) };
  if (!isAdmin(user)) return { response: error("Доступ лише для адміністратора", 403) };
  return { user };
}

/** Дані користувача, які безпечно віддавати в браузер */
export function publicUser(u: StoredUser) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    phone: u.phone,
    lastDelivery: u.lastDelivery ?? null,
    createdAt: u.createdAt,
    emailVerified: !!u.emailVerifiedAt,
    isAdmin: isAdmin(u),
    isOwner: isOwner(u),
    /** Адреса адміністратора, але ще не підтверджена — адмінка попросить підтвердити */
    adminPending: hasAdminRole(u) && !u.emailVerifiedAt,
  };
}

export type PublicUser = ReturnType<typeof publicUser>;

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
export const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export const normalizeEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();
export const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;
export const isPhone = (p: string) => p === "" || p.replace(/\D/g, "").length === 12;
export const cleanText = (s: unknown, max = 100) => String(s ?? "").trim().slice(0, max);
