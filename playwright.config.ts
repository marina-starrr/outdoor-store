import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

/*
 * Наскрізні тести в справжньому браузері (Microsoft Edge, уже встановлений у
 * системі — завантажувати браузери не потрібно).
 *
 * Сервер: production-збірка на порту 3123 з ОКРЕМОЮ тимчасовою базою
 * (FC_DATA_DIR), тож тестові акаунти й замовлення не потрапляють у .data
 * проєкту, а dev-сервер на 3000 не зачіпається.
 * Запуск: `yarn test:e2e` (спершу збирає проєкт).
 */
const PORT = 3123;
export const E2E_DATA_DIR = join(tmpdir(), "fc-e2e-data");
/** Адміністратор тестового сервера (реєструється в tests/e2e/admin.spec.ts) */
export const E2E_ADMIN_EMAIL = "admin-e2e@example.com";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  workers: 3,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "msedge",
    locale: "uk-UA",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Edge"], channel: "msedge", viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { channel: "msedge", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: `node node_modules/next/dist/bin/next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    // Ніколи не підключаємось до чужого сервера — лише до власного тестового
    reuseExistingServer: false,
    timeout: 60_000,
    env: { FC_DATA_DIR: E2E_DATA_DIR, ADMIN_EMAILS: E2E_ADMIN_EMAIL },
  },
});
