import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CartLine, DeliveryId, PaymentId } from "../../components/cart-logic";

/*
 * Просте файлове сховище (.data/db.json) — щоб сайт працював без окремої БД.
 * Увесь доступ іде через функції цього модуля, тож для продакшену достатньо
 * переписати лише їх під PostgreSQL / SQLite / інше.
 * Увага: на serverless-хостингах (Vercel тощо) файлова система не зберігається.
 */

export type StoredOrder = {
  number: string;
  createdAt: string;
  status: "new" | "confirmed" | "shipped" | "done";
  lines: { id: string; name: string; price: number; qty: number }[];
  subtotal: number;
  promo?: string;
  promoDiscount: number;
  shipping: number;
  total: number;
  delivery: { method: DeliveryId; city?: string; branch?: string; address?: string };
  payment: PaymentId;
  contact: { firstName: string; lastName: string; phone: string; email?: string };
  comment?: string;
  noCall: boolean;
};

export type StoredUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  passwordHash: string;
  createdAt: string;
  cart: CartLine[];
  /** id обраних товарів (поле з'явилось пізніше — у старих записах може бути відсутнім) */
  favorites?: string[];
  /** Останні дані доставки — підставляються при наступному замовленні */
  lastDelivery?: StoredOrder["delivery"];
  orders: StoredOrder[];
};

type Session = { userId: string; expiresAt: number };

type Data = {
  users: StoredUser[];
  /** ключ — SHA-256 від токена сесії (сам токен зберігається лише в cookie) */
  sessions: Record<string, Session>;
};

const DIR = join(process.cwd(), ".data");
const FILE = join(DIR, "db.json");

let cache: Data | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<Data> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(FILE, "utf8")) as Data;
  } catch {
    cache = { users: [], sessions: {} };
  }
  return cache;
}

async function persist(data: Data) {
  await mkdir(DIR, { recursive: true });
  // Атомарний запис: спершу тимчасовий файл, потім перейменування
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, FILE);
}

/** Читання */
export async function read<T>(fn: (data: Data) => T): Promise<T> {
  await queue;
  return fn(await load());
}

/** Зміна даних — виконується послідовно, щоб паралельні запити не перезаписали одне одного */
export function write<T>(fn: (data: Data) => T): Promise<T> {
  const run = queue.then(async () => {
    const data = await load();
    const result = fn(data);
    await persist(data);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}
