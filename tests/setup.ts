import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

/*
 * Кожен тестовий файл отримує власну тимчасову теку даних.
 * Справжня .data/ проєкту (з акаунтами покупців) тестами НІКОЛИ не змінюється.
 */
const dir = mkdtempSync(join(tmpdir(), "fc-test-data-"));
process.env.FC_DATA_DIR = dir;

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
