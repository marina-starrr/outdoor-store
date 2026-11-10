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
import { products } from "../../components/catalog-data";
import { read, write, type StoredUser } from "./db";

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

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(res: NextResponse, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_DAYS * 86_400_000;
  await write((db) => {
    // Заодно прибираємо прострочені сесії
    for (const [key, s] of Object.entries(db.sessions))
      if (s.expiresAt < Date.now()) delete db.sessions[key];
    db.sessions[sha256(token)] = { userId, expiresAt };
  });
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
  if (token) await write((db) => void delete db.sessions[sha256(token)]);
  res.cookies.delete(SESSION_COOKIE);
}

/** Поточний користувач за cookie сесії, або null */
export async function getUser(req: NextRequest): Promise<StoredUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return read((db) => {
    const session = db.sessions[sha256(token)];
    if (!session || session.expiresAt < Date.now()) return null;
    return db.users.find((u) => u.id === session.userId) ?? null;
  });
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

/** Обмеження спроб входу: 5 невдалих спроб на 15 хвилин для email+IP */
const attempts = new Map<string, { count: number; until: number }>();

export function loginLimiter(req: NextRequest, email: string) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const key = `${ip}|${email}`;
  return {
    blocked() {
      const a = attempts.get(key);
      return !!a && a.count >= 5 && a.until > Date.now();
    },
    fail() {
      const a = attempts.get(key);
      const fresh = !a || a.until < Date.now();
      attempts.set(key, { count: fresh ? 1 : a.count + 1, until: Date.now() + 15 * 60_000 });
    },
    reset() {
      attempts.delete(key);
    },
  };
}

const knownIds = new Set(products.map((p) => p.id));

/** Очищує кошик з клієнта: лише існуючі товари, коректна кількість, без дублікатів */
export function sanitizeCart(input: unknown): CartLine[] {
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
export function sanitizeIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((id): id is string => typeof id === "string" && knownIds.has(id)))].slice(0, 100);
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
  };
}

export type PublicUser = ReturnType<typeof publicUser>;

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
export const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export const normalizeEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();
export const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;
export const isPhone = (p: string) => p === "" || p.replace(/\D/g, "").length === 12;
export const cleanText = (s: unknown, max = 100) => String(s ?? "").trim().slice(0, max);
