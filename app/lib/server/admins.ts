import "server-only";
import { SITE_NAME } from "../site";
import { isAdminEmail } from "./auth";
import { jsonb, sql, tx, type StoredUser } from "./db";
import type { Mail } from "./mail";

/*
 * Адміністратори магазину.
 * - Власник — адреси з ADMIN_EMAILS (Vercel). Їх не можна прибрати з панелі.
 * - Інших додає власник: є акаунт — users.is_admin; немає — запрошення в
 *   admin_invites, яке спрацює під час реєстрації з цією адресою.
 */

export type TeamMember = {
  email: string;
  name?: string;
  role: "owner" | "admin";
  /** active — є доступ; unverified — зареєстрований, але email не підтверджено; invited — ще не зареєструвався */
  status: "active" | "unverified" | "invited";
};

const ownerEmails = () =>
  (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

const statusOf = (verified: unknown): TeamMember["status"] => (verified ? "active" : "unverified");
const fullName = (r: { first_name?: string; last_name?: string }) => [r.first_name, r.last_name].filter(Boolean).join(" ") || undefined;

/** Усі адміністратори: власники, додані, запрошені */
export async function listTeam(): Promise<TeamMember[]> {
  const owners = ownerEmails();
  const [ownerRows, adminRows, invites] = await Promise.all([
    // Список адрес — як jsonb: масиви-параметри драйвери бази передають по-різному
    owners.length
      ? sql(
          "select email, first_name, last_name, email_verified_at from users where lower(email::text) in (select jsonb_array_elements_text($1::jsonb))",
          [jsonb(owners)],
        )
      : [],
    sql("select email, first_name, last_name, email_verified_at from users where is_admin order by created_at"),
    sql("select email from admin_invites order by created_at"),
  ]);
  const byEmail = new Map(ownerRows.map((r) => [String(r.email).toLowerCase(), r]));
  return [
    ...owners.map((email): TeamMember => {
      const r = byEmail.get(email);
      return { email, name: r && fullName(r), role: "owner", status: r ? statusOf(r.email_verified_at) : "invited" };
    }),
    ...adminRows
      .filter((r) => !isAdminEmail(r.email))
      .map((r): TeamMember => ({ email: r.email, name: fullName(r), role: "admin", status: statusOf(r.email_verified_at) })),
    ...invites.map((r): TeamMember => ({ email: r.email, role: "admin", status: "invited" })),
  ];
}

/** Додає адміністратора; повертає, чи акаунт уже існує (null — адреса вже має права) */
export async function addAdmin(email: string, by: StoredUser): Promise<{ registered: boolean } | null> {
  return tx(async (q) => {
    const [user] = await q.query("select id, is_admin from users where email = $1 for update", [email]);
    if (user) {
      if (user.is_admin) return null;
      await q.query("update users set is_admin = true where id = $1", [user.id]);
      return { registered: true };
    }
    const added = await q.query(
      "insert into admin_invites (email, invited_by) values ($1, $2) on conflict (email) do nothing returning email",
      [email, by.id],
    );
    return added.length ? { registered: false } : null;
  });
}

/** Прибирає права адміністратора й запрошення; false — такого адміністратора не було */
export async function removeAdmin(email: string): Promise<boolean> {
  return tx(async (q) => {
    const users = await q.query("update users set is_admin = false where email = $1 and is_admin returning id", [email]);
    const invites = await q.query("delete from admin_invites where email = $1 returning email", [email]);
    return users.length + invites.length > 0;
  });
}

/** Лист новому адміністратору: як отримати доступ */
export function adminInviteMail(email: string, by: StoredUser, registered: boolean): Mail {
  return {
    to: email,
    subject: `Вас додано адміністратором — ${SITE_NAME}`,
    text:
      `${by.firstName} (${by.email}) додав(-ла) вас адміністратором інтернет-магазину ${SITE_NAME}.\n\n` +
      (registered
        ? "Увійдіть на сайт зі своїм акаунтом — адмін-панель відкриється за кнопкою нижче. Якщо email ще не підтверджено, панель попросить це зробити."
        : `Зареєструйтесь на сайті саме з адресою ${email} і підтвердьте її за посиланням з листа — після цього відкриється адмін-панель.`) +
      "\n\nЯкщо ви не чекали цього листа — просто проігноруйте його.",
    href: registered ? "/admin" : "/account",
  };
}
