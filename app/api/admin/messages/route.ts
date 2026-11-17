import type { NextRequest } from "next/server";
import { json, requireAdmin } from "../../../lib/server/auth";
import { mailEnabled } from "../../../lib/server/mail";
import { loadMessages } from "../../../lib/server/messages";

/**
 * Звернення з форми контактів, найновіші першими.
 * hasAccount — чи побачить покупець відповідь у сповіщеннях на сайті;
 * mailEnabled — чи піде відповідь листом
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  return json({ messages: await loadMessages(), mailEnabled: mailEnabled() });
}
