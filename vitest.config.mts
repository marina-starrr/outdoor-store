import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/*
 * Модульні тести (логіка) та API-тести (маршрути /api/* викликаються
 * напряму, з окремою тимчасовою базою — див. tests/setup.ts).
 * Тести в браузері — у tests/e2e (Playwright), запускаються окремо.
 */
export default defineConfig({
  resolve: {
    alias: {
      // "server-only" кидає помилку поза серверними компонентами Next — у тестах він не потрібен
      "server-only": fileURLToPath(new URL("./tests/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/api/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // scrypt навмисно повільний
    testTimeout: 15_000,
  },
});
