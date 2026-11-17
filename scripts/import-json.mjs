// Переносить дані зі старого файлового сховища (.data/db.json) у базу PostgreSQL.
//
//   yarn db:import             — лише показати, що буде перенесено (нічого не змінює)
//   yarn db:import --apply     — перенести
//   yarn db:import --apply шлях/до/db.json
//
// База — та сама, що й у сайту: POSTGRES_URL / DATABASE_URL з .env.local
// (`vercel env pull .env.local`), або FC_DATA_DIR — тимчасова вбудована (перевірка).
// Файл db.json лише читається. Повторний запуск безпечний: наявні записи
// (за email, номером замовлення, id) пропускаються; товари оновлюються з файлу.
// Сесії не переносяться — покупці просто увійдуть знову.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const file = args.find((a) => !a.startsWith("--")) ?? join(".data", "db.json");
if (!existsSync(file)) {
  console.error(`Файл не знайдено: ${file}`);
  process.exit(1);
}
const data = JSON.parse(readFileSync(file, "utf8"));

const users = data.users ?? [];
const products = data.products ?? [];
const orders = [
  ...users.flatMap((u) => (u.orders ?? []).map((o) => ({ ...o, userId: u.id, claimHash: null }))),
  ...(data.guestOrders ?? []).map((o) => ({ ...o, userId: null })),
];
const messages = data.messages ?? [];
const reviews = data.reviews ?? [];

console.log(`Файл: ${file}`);
console.log(
  `  товарів: ${products.length || "немає (у базі лишиться початковий каталог)"}, акаунтів: ${users.length}, ` +
    `замовлень: ${orders.length}, звернень: ${messages.length}, відгуків: ${reviews.length}`,
);
if (!apply) {
  console.log("\nЦе перегляд — нічого не змінено. Щоб перенести: yarn db:import --apply");
  process.exit(0);
}

/* ---------- Підключення ---------- */

const testDir = process.env.FC_DATA_DIR;
if (!testDir && existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = testDir ? "" : process.env.DATABASE_URL || process.env.POSTGRES_URL;
let q, transaction, close, target;

if (url) {
  const { default: pg } = await import("pg");
  const parsed = new URL(url);
  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("supa");
  const local = ["localhost", "127.0.0.1"].includes(parsed.hostname);
  const client = new pg.Client({ connectionString: parsed.toString(), ssl: local ? undefined : { rejectUnauthorized: false } });
  await client.connect();
  q = async (t, p) => (await client.query(t, p)).rows;
  transaction = async (fn) => {
    await client.query("begin");
    try {
      const r = await fn();
      await client.query("commit");
      return r;
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  };
  close = () => client.end();
  target = parsed.hostname;
} else {
  const dir = join(testDir || join(process.cwd(), ".data"), "pg");
  if (!existsSync(dir)) {
    console.error("Базу не знайдено. Додайте POSTGRES_URL у .env.local (vercel env pull .env.local).");
    process.exit(1);
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { citext } = await import("@electric-sql/pglite/contrib/citext");
  const db = await PGlite.create(dir, { extensions: { citext } });
  q = async (t, p) => (await db.query(t, p)).rows;
  transaction = (fn) => db.transaction(async (tx) => {
    const outer = q;
    q = async (t, p) => (await tx.query(t, p)).rows;
    try {
      return await fn();
    } finally {
      q = outer;
    }
  });
  close = () => db.close();
  target = `вбудована база ${dir}`;
}
console.log(`\nБаза: ${target}`);

/* ---------- Перенесення ---------- */

const ts = (v) => (v == null ? null : new Date(typeof v === "number" ? v : String(v)).toISOString());
const counts = {};
const add = (k, rows) => {
  if (rows.length) counts[k] = (counts[k] ?? 0) + rows.length;
};
const warn = (s) => console.log(`  ! ${s}`);

try {
  await transaction(async () => {
    // Товари: у порядку з файлу; наявні оновлюються (адмін міг змінити ціну, залишок, опис)
    for (const p of products) {
      add(
        "товари",
        await q(
          `insert into products (id, name, category, brand, price, old_price, hit, is_new, stock, hidden, description,
             custom_image, popularity, specs, capacity, image, photo, attrs, updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19)
           on conflict (id) do update set name = excluded.name, category = excluded.category, brand = excluded.brand,
             price = excluded.price, old_price = excluded.old_price, hit = excluded.hit, is_new = excluded.is_new,
             stock = excluded.stock, hidden = excluded.hidden, description = excluded.description,
             custom_image = excluded.custom_image, popularity = excluded.popularity, specs = excluded.specs,
             capacity = excluded.capacity, image = excluded.image, photo = excluded.photo, attrs = excluded.attrs,
             updated_at = excluded.updated_at
           returning id`,
          [p.id, p.name, p.category, p.brand ?? "", p.price, p.oldPrice ?? null, !!p.hit, !!p.isNew, p.stock ?? 0,
            !!p.hidden, p.description ?? null, p.customImage ?? null, p.popularity ?? 0, p.specs ?? "",
            p.capacity ?? null, p.image ?? "", p.photo, JSON.stringify(p.attrs ?? []), ts(p.updatedAt)],
        ),
      );
    }
    const known = new Set((await q("select id from products")).map((r) => r.id));
    const skippedUsers = new Set();

    for (const u of users) {
      const inserted = await q(
        `insert into users (id, email, first_name, last_name, phone, password_hash, created_at, email_verified_at,
           email_verify_hash, email_verify_expires_at, last_delivery, email_notifications)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
         on conflict do nothing returning id`,
        [u.id, u.email, u.firstName ?? "", u.lastName ?? "", u.phone ?? "", u.passwordHash, ts(u.createdAt),
          ts(u.emailVerifiedAt), u.emailVerify?.hash ?? null, ts(u.emailVerify?.expiresAt),
          u.lastDelivery ? JSON.stringify(u.lastDelivery) : null, u.emailNotifications !== false],
      );
      if (!inserted.length) {
        // Акаунт з таким email уже є в базі (напр. зареєстрований на новому сайті) — не змішуємо дані
        skippedUsers.add(u.id);
        warn(`${u.email}: акаунт уже є в базі — пропущено разом з його кошиком, замовленнями й сповіщеннями`);
        continue;
      }
      add("акаунти", inserted);
      const cart = (u.cart ?? []).filter((l) => known.has(l.id));
      for (const [i, l] of cart.entries())
        add("кошик", await q("insert into cart_items (user_id, product_id, qty, position) values ($1,$2,$3,$4) on conflict do nothing returning 1", [u.id, l.id, Math.min(20, Math.max(1, l.qty)), i]));
      for (const [i, id] of (u.favorites ?? []).filter((id) => known.has(id)).entries())
        add("обране", await q("insert into favorites (user_id, product_id, position) values ($1,$2,$3) on conflict do nothing returning 1", [u.id, id, i]));
      for (const id of (u.stockAlerts ?? []).filter((id) => known.has(id)))
        add("підписки", await q("insert into stock_alerts (user_id, product_id) values ($1,$2) on conflict do nothing returning 1", [u.id, id]));
      // Сповіщення — від найстаріших, щоб порядок (seq) зберігся
      for (const n of u.notifications ?? [])
        add("сповіщення", await q(
          "insert into notifications (id, user_id, created_at, kind, title, text, href, read) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing returning 1",
          [n.id, u.id, ts(n.createdAt), n.kind, n.title, n.text, n.href ?? null, !!n.read],
        ));
    }

    for (const o of [...orders].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
      if (o.userId && skippedUsers.has(o.userId)) continue;
      const lines = o.lines ?? [];
      const missing = lines.filter((l) => !known.has(l.id));
      if (missing.length) {
        warn(`${o.number}: товарів ${missing.map((l) => l.id).join(", ")} немає в каталозі — замовлення пропущено`);
        continue;
      }
      const d = o.delivery ?? {};
      const c = o.contact ?? {};
      const inserted = await q(
        `insert into orders (number, user_id, claim_hash, created_at, updated_at, status, subtotal, promo, promo_discount,
           shipping, total, delivery_method, delivery_city, delivery_city_ref, delivery_branch, delivery_address,
           payment, first_name, last_name, phone, email, comment, no_call)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         on conflict (number) do nothing returning number`,
        [o.number, o.userId, o.claimHash ?? null, ts(o.createdAt), ts(o.updatedAt), o.status, o.subtotal, o.promo ?? null,
          o.promoDiscount ?? 0, o.shipping ?? 0, o.total, d.method, d.city ?? null, d.cityRef ?? null, d.branch ?? null,
          d.address ?? null, o.payment, c.firstName ?? "", c.lastName ?? "", c.phone ?? "", c.email ?? null,
          o.comment ?? null, !!o.noCall],
      );
      if (!inserted.length) continue;
      add("замовлення", inserted);
      for (const [i, l] of lines.entries())
        await q("insert into order_items (order_number, product_id, name, price, qty, position) values ($1,$2,$3,$4,$5,$6)", [o.number, l.id, l.name, l.price, l.qty, i]);
    }

    const userIds = new Set((await q("select id from users")).map((r) => r.id));
    for (const m of messages) {
      const inserted = await q(
        `insert into messages (id, created_at, topic, name, email, phone, order_number, message, user_id, done)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict do nothing returning id`,
        [m.id, ts(m.createdAt), m.topic, m.name, m.email, m.phone ?? null, m.order ?? null, m.message,
          m.userId && userIds.has(m.userId) ? m.userId : null, !!m.done],
      );
      add("звернення", inserted);
      if (inserted.length)
        for (const r of m.replies ?? [])
          await q("insert into message_replies (id, message_id, created_at, text, on_site, emailed) values ($1,$2,$3,$4,$5,$6)", [r.id, m.id, ts(r.createdAt), r.text, !!r.onSite, !!r.emailed]);
    }

    for (const r of reviews) {
      if (!userIds.has(r.userId) || skippedUsers.has(r.userId) || !known.has(r.productId)) continue;
      add("відгуки", await q(
        `insert into reviews (id, product_id, user_id, author, rating, text, created_at, status, verified)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict do nothing returning 1`,
        [r.id, r.productId, r.userId, r.author, r.rating, r.text, ts(r.createdAt), r.status, !!r.verified],
      ));
    }
  });
} catch (e) {
  console.error("\nПомилка — у базі нічого не змінено (усе відкочено):", e.message);
  await close();
  process.exit(1);
}
await close();

console.log("\nГотово. Додано / оновлено:");
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
if (!Object.keys(counts).length) console.log("  нічого — усе вже було в базі");
