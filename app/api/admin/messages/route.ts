import type { NextRequest } from "next/server";
import { json, requireAdmin } from "../../../lib/server/auth";
import { read } from "../../../lib/server/db";

/** Звернення з форми контактів, найновіші першими */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const messages = await read((db) => [...(db.messages ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  return json({ messages });
}
