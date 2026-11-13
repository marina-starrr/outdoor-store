import "server-only";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CartLine, DeliveryId, PaymentId } from "../../components/cart-logic";
import type { Product } from "../../components/catalog-data";

/*
 * Просте файлове сховище (.data/db.json) — щоб сайт працював без окремої БД.
 * Увесь доступ іде через функції цього модуля, тож для продакшену достатньо
 * переписати лише їх під PostgreSQL / SQLite / інше.
 * Увага: на serverless-хостингах (Vercel тощо) файлова система не зберігається.
 */

export const ORDER_STATUSES = ["new", "confirmed", "shipped", "done", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type StoredOrder = {
  number: string;
  createdAt: string;
  status: OrderStatus;
  /** Коли адміністратор востаннє змінив статус */
  updatedAt?: string;
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
  /** Сповіщення для покупця, найновіші в кінці (див. lib/server/notifications.ts) */
  notifications?: StoredNotification[];
  /** id товарів, про появу яких просили повідомити */
  stockAlerts?: string[];
  /** Дублювати сповіщення на email (типово — так) */
  emailNotifications?: boolean;
};

export type NotificationKind = "reply" | "stock" | "order" | "price";

export type StoredNotification = {
  id: string;
  createdAt: string;
  kind: NotificationKind;
  title: string;
  text: string;
  /** Куди веде сповіщення на сайті */
  href?: string;
  read?: boolean;
};

export type MessageReply = {
  id: string;
  createdAt: string;
  text: string;
  /** Покупець отримав сповіщення на сайті (має акаунт) */
  onSite: boolean;
  /** Лист надіслано на email звернення */
  emailed: boolean;
};

export type StoredMessage = {
  id: string;
  createdAt: string;
  topic: string;
  name: string;
  email: string;
  phone?: string;
  order?: string;
  message: string;
  userId?: string;
  /** Опрацьоване адміністратором */
  done?: boolean;
  /** Відповіді адміністратора з адмін-панелі */
  replies?: MessageReply[];
};

type Session = { userId: string; expiresAt: number };

export type Data = {
  users: StoredUser[];
  /** ключ — SHA-256 від токена сесії (сам токен зберігається лише в cookie) */
  sessions: Record<string, Session>;
  /** Каталог; відсутній до першого запуску — тоді береться початковий (seed) */
  products?: Product[];
  /** Звернення з форми «Контакти» */
  messages?: StoredMessage[];
};

/**
 * Тека з даними. FC_DATA_DIR дозволяє тестам працювати з окремою тимчасовою
 * базою — щоб жоден тест ніколи не торкався справжніх акаунтів у .data
 */
export const dataDir = () => process.env.FC_DATA_DIR || join(process.cwd(), ".data");
export const dbFile = () => join(dataDir(), "db.json");

let cache: Data | null = null;
/** Час зміни файлу, з якого прочитано cache */
let cacheMtime = 0;
let queue: Promise<unknown> = Promise.resolve();

const mtime = async () => {
  try {
    return (await stat(dbFile())).mtimeMs;
  } catch {
    return 0;
  }
};

/**
 * Next може завантажити цей модуль кілька разів (окремо для сторінок і для
 * API), тож перед використанням кешу перевіряємо, чи файл не змінив інший екземпляр
 */
async function load(): Promise<Data> {
  const m = await mtime();
  if (cache && m === cacheMtime) return cache;
  try {
    cache = JSON.parse(await readFile(dbFile(), "utf8")) as Data;
  } catch {
    cache = { users: [], sessions: {} };
  }
  cacheMtime = m;
  return cache;
}

async function persist(data: Data) {
  await mkdir(dataDir(), { recursive: true });
  // Атомарний запис: спершу тимчасовий файл, потім перейменування
  const file = dbFile();
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await renameWithRetry(tmp, file);
  cacheMtime = await mtime();
}

/**
 * Windows не дає замінити файл, поки його хтось читає (паралельний запит,
 * антивірус, індексатор) — rename падає з EPERM/EBUSY/EACCES. Це тимчасово,
 * тож повторюємо кілька разів із короткою паузою.
 */
async function renameWithRetry(from: string, to: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rename(from, to);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (attempt >= 10 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw e;
      await new Promise((r) => setTimeout(r, 15 * (attempt + 1)));
    }
  }
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
