import { NextRequest } from "next/server";

/* Виклик маршрутів /api/* напряму, як це робить Next, але без сервера */

export const ORIGIN = "http://localhost:3000";

type Handler = (req: NextRequest) => Promise<Response>;

export async function call(
  handler: Handler,
  {
    path = "/api/test",
    method = "POST",
    body,
    cookie,
    origin = ORIGIN,
    ip,
  }: { path?: string; method?: string; body?: unknown; cookie?: string; origin?: string | null; ip?: string } = {},
) {
  const headers = new Headers({ host: new URL(ORIGIN).host, "content-type": "application/json" });
  if (origin) headers.set("origin", origin);
  if (cookie) headers.set("cookie", cookie);
  if (ip) headers.set("x-forwarded-for", ip);
  const req = new NextRequest(ORIGIN + path, {
    method,
    headers,
    body: body === undefined || method === "GET" ? undefined : JSON.stringify(body),
  });
  const res = await handler(req);
  const data = await res.json();
  return { status: res.status, data, res };
}

/** cookie сесії з відповіді (fc_session=...) для наступних запитів */
export function sessionCookie(res: Response) {
  const raw = res.headers.get("set-cookie") ?? "";
  const match = raw.match(/fc_session=([^;]*)/);
  return match ? `fc_session=${match[1]}` : "";
}

let n = 0;
/** Унікальний email для кожного тестового користувача */
export const uniqueEmail = () => `test${Date.now()}${++n}@example.com`;
