import { NextResponse, type NextRequest } from "next/server";
import { destroySession, error, isSameOrigin } from "../../../lib/server/auth";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const res = NextResponse.json({ ok: true });
  await destroySession(req, res);
  return res;
}
