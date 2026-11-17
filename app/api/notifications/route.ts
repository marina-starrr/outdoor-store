import type { NextRequest } from "next/server";
import { error, getUser, isSameOrigin, json } from "../../lib/server/auth";
import { sql, type StoredUser } from "../../lib/server/db";
import { getStockAlerts } from "../../lib/server/lists";
import { mailEnabled } from "../../lib/server/mail";
import { userNotifications } from "../../lib/server/notifications";

const payload = async (u: Pick<StoredUser, "id" | "emailNotifications">) => {
  const [notifications, stockAlerts] = await Promise.all([userNotifications(u.id), getStockAlerts(u.id)]);
  return {
    notifications,
    unread: notifications.filter((n) => !n.read).length,
    stockAlerts,
    emailNotifications: u.emailNotifications,
    mailEnabled: mailEnabled(),
  };
};

/** Сповіщення поточного покупця (найновіші першими), підписки та налаштування */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return error("Потрібно увійти", 401);
  return json(await payload(user));
}

/**
 * - { read: "all" } або { read: ["id", …] } — позначити прочитаними;
 * - { emailNotifications: true/false } — дублювати сповіщення на email
 */
export async function PATCH(req: NextRequest) {
  if (!isSameOrigin(req)) return error("Forbidden", 403);
  const user = await getUser(req);
  if (!user) return error("Потрібно увійти", 401);
  const body = await req.json().catch(() => ({}));

  const readIds: "all" | string[] | null =
    body.read === "all" ? "all" : Array.isArray(body.read) ? body.read.filter((x: unknown) => typeof x === "string").slice(0, 200) : null;
  const email = typeof body.emailNotifications === "boolean" ? body.emailNotifications : null;
  if (!readIds && email === null) return error("Нічого змінювати");

  if (readIds === "all") await sql("update notifications set read = true where user_id = $1 and not read", [user.id]);
  else if (readIds?.length)
    // id порівнюємо як текст — некоректні значення просто нічого не знайдуть
    await sql("update notifications set read = true where user_id = $1 and id::text = any($2::text[])", [user.id, readIds]);
  if (email !== null) await sql("update users set email_notifications = $2 where id = $1", [user.id, email]);

  return json(await payload({ id: user.id, emailNotifications: email ?? user.emailNotifications }));
}
