import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/*
 * Один раз на запуск: шаблон порожньої бази з усіма міграціями.
 * Кожен тестовий файл створює з нього власну базу в пам'яті (див. tests/setup.ts).
 */
export default async function globalSetup() {
  const dir = mkdtempSync(join(tmpdir(), "fc-db-template-"));
  const file = join(dir, "template.tar");
  delete process.env.POSTGRES_URL;
  delete process.env.DATABASE_URL;
  const { createTemplate } = await import("../app/lib/server/db");
  await createTemplate(file);
  // Воркери Vitest успадковують змінні середовища
  process.env.FC_DB_TEMPLATE = file;
  return () => rmSync(dir, { recursive: true, force: true });
}
