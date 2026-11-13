import type { NextRequest } from "next/server";
import { error, getUser, isSameOrigin, json } from "../../lib/server/auth";
import { write, type StoredUser } from "../../lib/server/db";
import { mailEnabled } from "../../lib/server/mail";

const payload = (u: StoredUser) => {
  const notifications = [...(u.notifications ?? [])].reverse();
  return {
    notifications,
    unread: notifications.filter((n) => !n.read).length,
    stockAlerts: u.stockAlerts ?? [],
    emailNotifications: u.emailNotifications !== false,
    mailEnabled: mailEnabled(),
  };
};

/** Сповіщення поточного покупця (найновіші першими), підписки та налаштування */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return error("Потрібно увійти", 401);
  return json(payload(user));
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

  const readIds = body.read === "all" ? "all" : Array.isArray(body.read) ? new Set(body.read.filter((x: unknown) => typeof x === "string")) : null;
  const email = typeof body.emailNotifications === "boolean" ? body.emailNotifications : null;
  if (!readIds && email === null) return error("Нічого змінювати");

  const updated = await write((db) => {
    const u = db.users.find((x) => x.id === user.id)!;
    if (readIds) for (const n of u.notifications ?? []) if (readIds === "all" || readIds.has(n.id)) n.read = true;
    if (email !== null) u.emailNotifications = email;
    return u;
  });
  return json(payload(updated));
}
