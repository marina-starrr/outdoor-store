import type { NextRequest } from "next/server";
import { json, requireAdmin } from "../../../lib/server/auth";
import { read } from "../../../lib/server/db";
import { mailEnabled } from "../../../lib/server/mail";

/**
 * Звернення з форми контактів, найновіші першими.
 * hasAccount — чи побачить покупець відповідь у сповіщеннях на сайті;
 * mailEnabled — чи піде відповідь листом
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const messages = await read((db) =>
    [...(db.messages ?? [])]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((m) => ({
        ...m,
        hasAccount: db.users.some((u) => u.id === m.userId || u.email.toLowerCase() === m.email.toLowerCase()),
      })),
  );
  return json({ messages, mailEnabled: mailEnabled() });
}
