// Підтвердити email користувача вручну — для власника, поки не налаштовано
// надсилання пошти (RESEND_API_KEY).
//   yarn admin:verify owner@example.com
//
// Працює з тією ж базою, що й сайт:
//   - FC_DATA_DIR (тести) — тимчасова вбудована база; Supabase тоді не використовується ніколи;
//   - Supabase — якщо в .env.local (або в середовищі) є POSTGRES_URL / DATABASE_URL
//     (`vercel env pull .env.local` підтягне його з Vercel);
//   - інакше — локальна вбудована база в .data/pg (спершу зупиніть `yarn dev`).
import { existsSync } from "node:fs";
import { join } from "node:path";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Вкажіть email: yarn admin:verify owner@example.com");
  process.exit(1);
}

const testDir = process.env.FC_DATA_DIR;
if (!testDir && existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = testDir ? "" : process.env.DATABASE_URL || process.env.POSTGRES_URL;

const UPDATE =
  "update users set email_verified_at = coalesce(email_verified_at, now()), email_verify_hash = null, email_verify_expires_at = null where email = $1 returning email_verified_at";

let rows;
if (url) {
  const { default: pg } = await import("pg");
  const parsed = new URL(url);
  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("supa");
  const local = ["localhost", "127.0.0.1"].includes(parsed.hostname);
  const client = new pg.Client({ connectionString: parsed.toString(), ssl: local ? undefined : { rejectUnauthorized: false } });
  await client.connect();
  try {
    rows = (await client.query(UPDATE, [email])).rows;
  } finally {
    await client.end();
  }
} else {
  const dir = join(testDir || join(process.cwd(), ".data"), "pg");
  if (!existsSync(dir)) {
    console.error("Базу не знайдено. Додайте POSTGRES_URL у .env.local або спершу запустіть сайт (yarn dev).");
    process.exit(1);
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { citext } = await import("@electric-sql/pglite/contrib/citext");
  const db = await PGlite.create(dir, { extensions: { citext } });
  rows = (await db.query(UPDATE, [email])).rows;
  await db.close();
}

if (!rows.length) {
  console.error(`Акаунт ${email} не знайдено. Спершу зареєструйтеся на сайті з цією адресою.`);
  process.exit(1);
}
console.log(`Готово: ${email} підтверджено.`);
console.log("Права адміністратора діють, якщо адреса є в ADMIN_EMAILS. Оновіть сторінку /admin.");
