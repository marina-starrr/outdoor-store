// Наскрізні тести: збірка + Playwright. Аргументи передаються Playwright: `yarn test:e2e admin`.
//
// Збірка теж працює з окремою тимчасовою базою (FC_DATA_DIR) — навіть якщо в
// .env.local є POSTGRES_URL, тести не читають і не змінюють Supabase.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const env = { ...process.env, FC_DATA_DIR: join(tmpdir(), "fc-e2e-build") };

const run = (bin, args) => {
  const r = spawnSync(process.execPath, [bin, ...args], { stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run(require.resolve("next/dist/bin/next"), ["build"]);
run(join(require.resolve("@playwright/test/package.json"), "..", "cli.js"), ["test", ...process.argv.slice(2)]);
