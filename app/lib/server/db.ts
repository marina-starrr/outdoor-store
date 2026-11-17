import "server-only";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DeliveryId, PaymentId } from "../../components/cart-logic";

/*
 * База даних — PostgreSQL.
 *
 * - На хостингу (Vercel) — Supabase: рядок підключення з POSTGRES_URL
 *   (його додає інтеграція Vercel ↔ Supabase) або DATABASE_URL.
 * - Тести й локальна розробка без ключів — вбудований Postgres (PGlite) з тими
 *   самими міграціями з supabase/migrations. Якщо задано FC_DATA_DIR (тести),
 *   завжди використовується саме він — тести НІКОЛИ не торкаються справжньої бази.
 *
 * Увесь доступ — через sql() (окремий запит) і tx() (транзакція).
 */

export const ORDER_STATUSES = ["new", "confirmed", "shipped", "done", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderDelivery = { method: DeliveryId; city?: string; cityRef?: string; branch?: string; address?: string };

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
  delivery: OrderDelivery;
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
  /** Коли власник підтвердив email за посиланням з листа (без цього — немає прав адміністратора) */
  emailVerifiedAt?: string;
  /** Останні дані доставки — підставляються при наступному замовленні */
  lastDelivery?: OrderDelivery;
  /** Дублювати сповіщення на email */
  emailNotifications: boolean;
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
  read: boolean;
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

/* ---------- Підключення ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type Queryable = { query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]> };
type Backend = Queryable & { transaction<T>(fn: (q: Queryable) => Promise<T>): Promise<T>; close(): Promise<void> };

/** Тека вбудованої бази. FC_DATA_DIR — окрема тимчасова база для тестів */
export const dataDir = () => process.env.FC_DATA_DIR || join(process.cwd(), ".data");

const remoteUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
/** Вбудована база: у тестах (FC_DATA_DIR) завжди, інакше — лише якщо не задано підключення */
const embeddedMode = () => !!process.env.FC_DATA_DIR || !remoteUrl();

/** Працює окрема тимчасова тестова база (не Supabase і не локальна .data) */
export const isTestDatabase = () => !!process.env.FC_DATA_DIR && !process.env.VERCEL;

/*
 * Next завантажує цей модуль кілька разів в одному процесі (окремо для різних
 * маршрутів), тому підключення зберігається в globalThis — одне на процес.
 */
const g = globalThis as { __fcDb?: Map<string, Promise<Backend>> };
const backends = (g.__fcDb ??= new Map());

function backend(): Promise<Backend> {
  const embedded = embeddedMode();
  if (!embedded) return cached(`pg:${remoteUrl()}`, () => postgres(remoteUrl()));
  if (process.env.VERCEL)
    throw new Error("Не задано POSTGRES_URL — підключіть Supabase до проєкту у Vercel (Storage → Supabase)");
  // Під час `next build` збірка працює в кількох процесах — кожен отримує власну базу в пам'яті.
  // FC_DB_MEMORY — модульні тести: база в пам'яті, без запису на диск (швидко)
  const memory = process.env.NEXT_PHASE === "phase-production-build" || process.env.FC_DB_MEMORY === "1";
  const dir = memory ? null : join(dataDir(), "pg");
  return cached(`pglite:${dir ?? `memory:${dataDir()}`}`, () => pglite(dir));
}

function cached(key: string, create: () => Promise<Backend>) {
  let b = backends.get(key);
  if (!b) {
    b = create();
    backends.set(key, b);
    b.catch(() => backends.delete(key));
  }
  return b;
}

/** Supabase / будь-який PostgreSQL через node-postgres */
async function postgres(url: string): Promise<Backend> {
  const { Pool } = await import("pg");
  const parsed = new URL(url);
  // SSL налаштовуємо самі: sslmode із рядка Supabase у node-postgres вимагає перевірки сертифіката
  // через CA, якого в системі немає. DATABASE_CA_CERT (сертифікат із Supabase → Settings → Database) вмикає перевірку
  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("supa");
  const local = ["localhost", "127.0.0.1"].includes(parsed.hostname);
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
  const pool = new Pool({
    connectionString: parsed.toString(),
    ssl: local ? undefined : ca ? { ca } : { rejectUnauthorized: false },
    // Serverless: кілька з'єднань на екземпляр функції, решту тримає пулер Supabase
    max: 5,
    idleTimeoutMillis: 10_000,
  });
  const wrap = (c: { query: (t: string, p?: unknown[]) => Promise<{ rows: Row[] }> }): Queryable => ({
    query: async <T extends Row>(t: string, p?: unknown[]) => (await c.query(t, p)).rows as T[],
  });
  return {
    ...wrap(pool),
    close: () => pool.end(),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await fn(wrap(client));
        await client.query("commit");
        return result;
      } catch (e) {
        await client.query("rollback").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

/** Вбудований Postgres (WASM) — для тестів і розробки без Supabase */
async function pglite(dir: string | null): Promise<Backend> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { citext } = await import("@electric-sql/pglite/contrib/citext");
  // Нова база з готового шаблону (тести) — у десятки разів швидше, ніж створювати з нуля
  const template = process.env.FC_DB_TEMPLATE;
  const fresh = !dir || !existsSync(join(dir, "PG_VERSION"));
  const loadDataDir = template && fresh && existsSync(template) ? new Blob([await readFile(template)]) : undefined;
  // PGlite не створює батьківські теки сам (напр. тестова тека даних щойно видалена)
  if (dir) await mkdir(dir, { recursive: true });
  const db = await PGlite.create(dir ?? undefined, { extensions: { citext }, loadDataDir });
  await migrate(db);
  const wrap = (c: { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Queryable => ({
    query: async <T extends Row>(t: string, p?: unknown[]) => (await c.query(t, p)).rows as T[],
  });
  return { ...wrap(db), transaction: (fn) => db.transaction((t) => fn(wrap(t))), close: () => db.close() };
}

/** Шаблон порожньої бази з усіма міграціями — створюється один раз на запуск тестів */
export async function createTemplate(file: string) {
  const { PGlite } = await import("@electric-sql/pglite");
  const { citext } = await import("@electric-sql/pglite/contrib/citext");
  const db = await PGlite.create({ extensions: { citext } });
  await migrate(db);
  const dump = await db.dumpDataDir("none");
  await writeFile(file, Buffer.from(await dump.arrayBuffer()));
  await db.close();
}

/**
 * Закриває підключення (наступний запит відкриє знову). Потрібно тестам:
 * вбудовану базу може відкрити лише один процес, а `yarn admin:verify` — окремий
 */
export async function closeDatabase() {
  const all = [...backends.values()];
  backends.clear();
  await Promise.all(all.map(async (b) => (await b).close()));
}

/** Застосовує міграції з supabase/migrations, яких ще немає у вбудованій базі */
async function migrate(db: { exec: (sql: string) => Promise<unknown>; query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }) {
  // Ролі, які в Supabase є завжди — щоб міграції виконувались без змін
  await db.exec(`
    do $$ begin
      if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end $$;
    create table if not exists _fc_migrations (name text primary key, applied_at timestamptz not null default now());
  `);
  const done = new Set(((await db.query("select name from _fc_migrations")).rows as { name: string }[]).map((r) => r.name));
  const dir = join(process.cwd(), "supabase", "migrations");
  for (const name of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(name)) continue;
    await db.exec(await readFile(join(dir, name), "utf8"));
    await db.query("insert into _fc_migrations (name) values ($1)", [name]);
  }
}

/** Окремий запит */
export async function sql<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]> {
  return (await backend()).query<T>(text, params);
}

/** Транзакція: усі запити fn виконуються разом або (при помилці) жоден */
export async function tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
  return (await backend()).transaction(fn);
}

/** Запити поза транзакцією — для функцій, які приймають і транзакцію, і звичайне підключення */
export const db: Queryable = { query: sql };

/* ---------- Перетворення значень з бази ---------- */

/** timestamptz → ISO-рядок (node-postgres і PGlite повертають Date) */
export const iso = (v: unknown): string => (v instanceof Date ? v : new Date(String(v))).toISOString();
export const isoOpt = (v: unknown): string | undefined => (v == null ? undefined : iso(v));
/** numeric / bigint повертаються рядком — перетворюємо на число */
export const num = (v: unknown): number => Number(v ?? 0);
/** null → undefined (у типах застосунку необов'язкові поля відсутні, а не null) */
export const opt = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);
/** jsonb-параметр: завжди рядком, інакше node-postgres перетворить масив на масив Postgres */
export const jsonb = (v: unknown) => (v === undefined ? null : JSON.stringify(v));

export const userFromRow = (r: Row): StoredUser => ({
  id: r.id,
  email: r.email,
  firstName: r.first_name,
  lastName: r.last_name,
  phone: r.phone,
  passwordHash: r.password_hash,
  createdAt: iso(r.created_at),
  emailVerifiedAt: isoOpt(r.email_verified_at),
  lastDelivery: opt(r.last_delivery),
  emailNotifications: r.email_notifications !== false,
});

export const notificationFromRow = (r: Row): StoredNotification => ({
  id: r.id,
  createdAt: iso(r.created_at),
  kind: r.kind,
  title: r.title,
  text: r.text,
  href: opt(r.href),
  read: !!r.read,
});

export const reviewFromRow = (r: Row): StoredReview => ({
  id: r.id,
  productId: r.product_id,
  userId: r.user_id,
  author: r.author,
  rating: num(r.rating),
  text: r.text,
  createdAt: iso(r.created_at),
  status: r.status,
  verified: !!r.verified,
});
