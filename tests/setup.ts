import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

/*
 * Кожен тестовий файл отримує власну тимчасову базу (вбудований Postgres у
 * тимчасовій теці). Supabase і справжня .data/ проєкту тестами НІКОЛИ не
 * змінюються: з FC_DATA_DIR db.ts ігнорує POSTGRES_URL / DATABASE_URL.
 */
const dir = mkdtempSync(join(tmpdir(), "fc-test-data-"));
process.env.FC_DATA_DIR = dir;
delete process.env.POSTGRES_URL;
delete process.env.DATABASE_URL;
// База в пам'яті з шаблону (tests/global-setup.ts); файл тесту може вимкнути це до першого запиту
process.env.FC_DB_MEMORY = "1";
// Знижки на сайті вимкнено (shop-config), але сама функція має лишатися перевіреною
process.env.NEXT_PUBLIC_DISCOUNTS ??= "1";
// Довідник міст — з локального файлу, без запитів до Нової пошти
process.env.NP_CITIES_FIXTURE = join(process.cwd(), "tests", "fixtures", "np-cities.json");

afterAll(async () => {
  const { closeDatabase } = await import("../app/lib/server/db");
  await closeDatabase();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
});
