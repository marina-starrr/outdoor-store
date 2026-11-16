import "server-only";
import { randomUUID } from "node:crypto";
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
  /** city — підпис «м. Полтава, Полтавська обл.», cityRef — Ref Нової пошти (s:… — населений пункт без НП) */
  delivery: { method: DeliveryId; city?: string; cityRef?: string; branch?: string; address?: string };
  payment: PaymentId;
  contact: { firstName: string; lastName: string; phone: string; email?: string };
  comment?: string;
  noCall: boolean;
};

/**
 * Замовлення гостя (без акаунта). claimHash — SHA-256 від секретного токена,
 * який отримав лише браузер покупця: за ним замовлення переноситься в акаунт
 * після реєстрації чи входу. За email не прив'язуємо — email не підтверджується,
 * тож інакше чужі замовлення міг би «забрати» будь-хто.
 */
export type StoredGuestOrder = StoredOrder & { claimHash: string };

export type StoredUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  passwordHash: string;
  createdAt: string;
  /** Коли власник підтвердив email за посиланням з листа (без цього — немає прав адміністратора) */
  emailVerifiedAt?: string;
  /** Активне посилання підтвердження: SHA-256 від токена і строк дії */
  emailVerify?: { hash: string; expiresAt: number };
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

/** Відгук покупця. На сайті показуються лише схвалені адміністратором */
export type StoredReview = {
  id: string;
  productId: string;
  userId: string;
  /** Підпис на сайті: «Олена К.» */
  author: string;
  rating: number;
  text: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
  /** Автор справді купував цей товар (замовлення відправлене або виконане) */
  verified: boolean;
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
  /** Замовлення гостей, ще не перенесені в акаунт */
  guestOrders?: StoredGuestOrder[];
  /** Відгуки покупців (з модерацією) */
  reviews?: StoredReview[];
};

/**
 * Тека з даними. FC_DATA_DIR дозволяє тестам працювати з окремою тимчасовою
 * базою — щоб жоден тест ніколи не торкався справжніх акаунтів у .data
 */
export const dataDir = () => process.env.FC_DATA_DIR || join(process.cwd(), ".data");
export const dbFile = () => join(dataDir(), "db.json");

/*
 * Next завантажує цей модуль кілька разів в одному процесі (окремо для різних
 * маршрутів). Щоб записи з різних екземплярів не перезаписували одне одного,
 * а читання не бачило застарілих даних, черга записів і кеш спільні для
 * процесу — зберігаються в globalThis (окремо для кожного файлу бази).
 */
type Store = {
  cache: Data | null;
  /** Ідентифікатор версії файлу, з якої прочитано cache (inode + розмір + час зміни) */
  key: string;
  queue: Promise<unknown>;
};

const stores = ((globalThis as { __fcDbStores?: Map<string, Store> }).__fcDbStores ??= new Map());

function store(): Store {
  const file = dbFile();
  let s = stores.get(file);
  if (!s) stores.set(file, (s = { cache: null, key: "", queue: Promise.resolve() }));
  return s;
}

const versionKey = (st: { ino: number; size: number; mtimeMs: number }) => `${st.ino}:${st.size}:${st.mtimeMs}`;

async function fileKey() {
  try {
    return versionKey(await stat(dbFile()));
  } catch {
    return "";
  }
}

/** Дані з кешу, якщо файл не змінював ніхто інший (напр. інший процес чи yarn admin:verify) */
async function load(s: Store): Promise<Data> {
  const key = await fileKey();
  if (s.cache && key === s.key) return s.cache;
  try {
    s.cache = JSON.parse(await readFile(dbFile(), "utf8")) as Data;
  } catch {
    s.cache = { users: [], sessions: {} };
  }
  s.key = key;
  return s.cache;
}

async function persist(s: Store, data: Data) {
  await mkdir(dataDir(), { recursive: true });
  // Атомарний запис: спершу тимчасовий файл (унікальне ім'я), потім перейменування
  const file = dbFile();
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  // Версію беремо з нашого ж файлу ДО перейменування — після нього файл міг уже замінити хтось інший
  const key = versionKey(await stat(tmp));
  await renameWithRetry(tmp, file);
  s.key = key;
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
  const s = store();
  await s.queue;
  return fn(await load(s));
}

/** Зміна даних — виконується послідовно (одна черга на процес), щоб паралельні запити не перезаписали одне одного */
export function write<T>(fn: (data: Data) => T): Promise<T> {
  const s = store();
  const run = s.queue.then(async () => {
    const data = await load(s);
    const result = fn(data);
    await persist(s, data);
    return result;
  });
  s.queue = run.catch(() => undefined);
  return run;
}
