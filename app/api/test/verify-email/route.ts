import type { NextRequest } from "next/server";
import { error, json, normalizeEmail } from "../../../lib/server/auth";
import { isTestDatabase, sql } from "../../../lib/server/db";

/**
 * ЛИШЕ ДЛЯ НАСКРІЗНИХ ТЕСТІВ: підтвердити email без листа (як `yarn admin:verify`).
 * Працює, тільки якщо сервер запущено з FC_E2E=1 і з окремою тимчасовою
 * базою (FC_DATA_DIR). На хостингу ця умова неможлива — там маршрут відповідає 404.
 */
export async function POST(req: NextRequest) {
  if (process.env.FC_E2E !== "1" || !isTestDatabase()) return error("Not found", 404);
  const body = await req.json().catch(() => ({}));
  const rows = await sql(
    "update users set email_verified_at = coalesce(email_verified_at, now()), email_verify_hash = null where email = $1 returning id",
    [normalizeEmail(body.email)],
  );
  return json({ verified: rows.length > 0 });
}
