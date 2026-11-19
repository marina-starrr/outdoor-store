import { rmSync } from "node:fs";
import type { FullConfig } from "@playwright/test";
import { E2E_DATA_DIR } from "../../playwright.config";

/**
 * Кожен запуск починається з чистої тимчасової бази. Сервер (webServer) уже
 * запущений, але бази ще не відкривав — після очищення одразу «прогріваємо» її:
 * створення бази з усіма міграціями триває кілька секунд, і без цього першу
 * реєстрацію в тестах довелося б чекати довше, ніж дозволяє тест
 */
export default async function globalSetup(config: FullConfig) {
  rmSync(E2E_DATA_DIR, { recursive: true, force: true });
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;
  // Підказки міст рахують ліміт запитів у базі — цього досить, щоб її створити
  const res = await fetch(`${baseURL}/api/cities?q=kyiv`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Тестовий сервер не відповів: ${res.status}`);
}
