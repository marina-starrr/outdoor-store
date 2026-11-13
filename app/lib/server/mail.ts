import "server-only";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SITE_NAME, absoluteUrl } from "../site";
import { dataDir } from "./db";

/*
 * Надсилання листів.
 *
 * Справжня пошта — через сервіс Resend (resend.com). У .env.local або в
 * налаштуваннях хостингу задайте:
 *   RESEND_API_KEY=re_...
 *   MAIL_FROM="Family Camping <hello@ваш-домен.ua>"
 * Без них сайт працює як і раніше, просто без листів (лише сповіщення на сайті).
 *
 * Для розробки й тестів: MAIL_TRANSPORT=log — листи не надсилаються, а
 * складаються у файл outbox.json у теці даних.
 */

export type Mail = { to: string; subject: string; text: string; href?: string };

type Transport = "resend" | "log" | null;

function transport(): Transport {
  if (process.env.MAIL_TRANSPORT === "log") return "log";
  if (process.env.RESEND_API_KEY && process.env.MAIL_FROM) return "resend";
  return null;
}

/** Чи надсилаються листи взагалі */
export const mailEnabled = () => transport() !== null;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Простий лист у фірмових кольорах: заголовок, текст, кнопка на сайт */
function html(mail: Mail) {
  const body = escapeHtml(mail.text).replace(/\n/g, "<br>");
  const button = mail.href
    ? `<p style="margin:28px 0 0"><a href="${escapeHtml(absoluteUrl(mail.href))}" style="display:inline-block;background:#ffd51f;color:#082c45;font-weight:800;text-decoration:none;padding:12px 24px;border-radius:999px">Відкрити на сайті</a></p>`
    : "";
  return `<!doctype html><html lang="uk"><body style="margin:0;background:#f7fafc;font-family:Arial,sans-serif;color:#082c45">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="margin:0 0 16px;font-weight:800;font-size:18px">family <span style="color:#00acff">camping</span></p>
<div style="background:#fff;border-radius:20px;padding:28px">
<h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(mail.subject)}</h1>
<p style="margin:0;line-height:1.6;color:#264e65">${body}</p>${button}
</div>
<p style="margin:16px 0 0;font-size:12px;color:#8aa5b5">Ви отримали цей лист, бо маєте акаунт або звертались до ${SITE_NAME}. Вимкнути листи можна на сторінці «Сповіщення» у профілі.</p>
</div></body></html>`;
}

async function appendOutbox(mail: Mail) {
  const file = join(dataDir(), "outbox.json");
  let list: unknown[] = [];
  try {
    list = JSON.parse(await readFile(file, "utf8"));
  } catch {
    /* ще немає */
  }
  list.push({ ...mail, sentAt: new Date().toISOString() });
  await mkdir(dataDir(), { recursive: true });
  await writeFile(file, JSON.stringify(list, null, 2), "utf8");
}

/** Надсилає лист; повертає true, якщо його прийнято до відправлення. Ніколи не кидає помилку */
export async function sendMail(mail: Mail): Promise<boolean> {
  const t = transport();
  if (!t) return false;
  try {
    if (t === "log") {
      await appendOutbox(mail);
      return true;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.href ? `${mail.text}\n\n${absoluteUrl(mail.href)}` : mail.text,
        html: html(mail),
      }),
    });
    if (!res.ok) console.error(`[mail] Resend ${res.status}: ${await res.text().catch(() => "")}`);
    return res.ok;
  } catch (e) {
    console.error("[mail] не вдалося надіслати лист", e);
    return false;
  }
}

/** Кілька листів паралельно */
export const sendMails = (mails: Mail[]) => Promise.all(mails.map(sendMail));
