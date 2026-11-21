// Наскрізні тести: збірка + Playwright. Аргументи передаються Playwright: `yarn test:e2e admin`.
//
// Збірка теж працює з окремою тимчасовою базою (FC_DATA_DIR) — навіть якщо в
// .env.local є POSTGRES_URL, тести не читають і не змінюють Supabase.
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
// NEXT_PUBLIC_DISCOUNTS=1: знижки на сайті вимкнено, але тести перевіряють і їх (вбудовується під час збірки)
const env = { ...process.env, FC_DATA_DIR: join(tmpdir(), "fc-e2e-build"), NEXT_PUBLIC_DISCOUNTS: process.env.NEXT_PUBLIC_DISCOUNTS ?? "1" };

const run = (bin, args) => {
  const r = spawnSync(process.execPath, [bin, ...args], { stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

// Кеш сторінок Next (.next/cache) переживає перезапуски сервера, а тестова база щоразу нова:
// без очищення сторінки показували б дані попереднього прогону (напр. «Відгуки (1)»)
rmSync(".next/cache", { recursive: true, force: true });
run(require.resolve("next/dist/bin/next"), ["build"]);
run(join(require.resolve("@playwright/test/package.json"), "..", "cli.js"), ["test", ...process.argv.slice(2)]);
