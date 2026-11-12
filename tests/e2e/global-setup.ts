import { rmSync } from "node:fs";
import { E2E_DATA_DIR } from "../../playwright.config";

/** Кожен запуск починається з чистої тимчасової бази */
export default function globalSetup() {
  rmSync(E2E_DATA_DIR, { recursive: true, force: true });
}
