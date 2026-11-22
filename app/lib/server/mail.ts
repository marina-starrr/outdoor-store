import "server-only";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SITE_NAME, absoluteUrl } from "../site";
import { dataDir } from "./db";

/*
 * Надсилання листів. Два способи (Vercel → Settings → Environment Variables):
 *
 * 1. Gmail (без власного домену): скринька магазину + «пароль додатка» Google
 *      SMTP_USER=familycamping.shop@gmail.com
 *      SMTP_PASS=пароль додатка з 16 літер
 *    Необов'язково: SMTP_HOST / SMTP_PORT (інший поштовий сервер; типово Gmail),
 *    MAIL_FROM="Family Camping <адреса>" (типово — «Family Camping» + SMTP_USER).
 *
 * 2. Resend (resend.com) — коли з'явиться власний домен:
 *      RESEND_API_KEY=re_...
 *      MAIL_FROM="Family Camping <hello@ваш-домен.ua>"
 *
 * Без них сайт працює як і раніше, просто без листів (лише сповіщення на сайті).
 *
 * Для розробки й тестів: MAIL_TRANSPORT=log — листи не надсилаються, а
 * складаються у файл outbox.json у теці даних.
 */

export type Mail = { to: string; subject: string; text: string; href?: string };

type Transport = "smtp" | "resend" | "log" | null;

function transport(): Transport {
  if (process.env.MAIL_TRANSPORT === "log") return "log";
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return "smtp";
  if (process.env.RESEND_API_KEY && process.env.MAIL_FROM) return "resend";
  return null;
}

/** Відправник: MAIL_FROM або «Family Camping <SMTP_USER>» */
const sender = () => process.env.MAIL_FROM || `"${SITE_NAME}" <${process.env.SMTP_USER}>`;

/* Одне SMTP-з'єднання на екземпляр сервера (Gmail обмежує кількість підключень) */
const g = globalThis as { __fcSmtp?: Promise<import("nodemailer").Transporter> };

function smtp() {
  g.__fcSmtp ??= import("nodemailer").then((nodemailer) => {
    const port = Number(process.env.SMTP_PORT || 465);
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      // Кілька листів одразу (напр. «товар з'явився» підписникам) — через 2 з'єднання, а не десяток
      pool: true,
      maxConnections: 2,
      // Пароль додатка Google часто копіюють із пробілами («abcd efgh …») — прибираємо їх
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS?.replace(/\s+/g, "") },
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    });
  });
  g.__fcSmtp.catch(() => (g.__fcSmtp = undefined));
  return g.__fcSmtp;
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
  // Пошта не налаштована — сайт працює без листів (не помилка)
  if (!transport()) return false;
  try {
    await deliver(mail);
    return true;
  } catch (e) {
    console.error("[mail] не вдалося надіслати лист", e);
    return false;
  }
}

/** Надсилає або кидає помилку з причиною (для перевірки пошти в адмінці) */
async function deliver(mail: Mail): Promise<void> {
  const t = transport();
  if (!t) throw new Error("Пошта не налаштована");
  if (t === "log") {
    await appendOutbox(mail);
    return;
  }
  const text = mail.href ? `${mail.text}\n\n${absoluteUrl(mail.href)}` : mail.text;
  if (t === "smtp") {
    await (await smtp()).sendMail({ from: sender(), to: mail.to, subject: mail.subject, text, html: html(mail) });
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [mail.to],
      subject: mail.subject,
      text,
      html: html(mail),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
}

/** Як надсилаються листи — для адмінки (без паролів і ключів) */
export const mailSetup = () => {
  const t = transport();
  return {
    transport: t,
    from: t === "smtp" || t === "resend" ? sender() : null,
    host: t === "smtp" ? process.env.SMTP_HOST || "smtp.gmail.com" : null,
  };
};

/**
 * Тестовий лист для перевірки пошти з адмінки: повертає причину, якщо не вдалося.
 * Помилка Gmail «535 … Username and Password not accepted» — недійсний пароль додатка
 */
export async function sendTestMail(to: string): Promise<{ ok: true } | { ok: false; error: string; hint?: string }> {
  try {
    await deliver({
      to,
      subject: "Перевірка пошти магазину",
      text: "Цей лист надіслано з адмін-панелі, щоб перевірити, чи доходять листи покупцям. Якщо ви його бачите — пошта працює.",
      href: "/admin",
    });
    return { ok: true };
  } catch (e) {
    // Скинути з'єднання: наступна спроба (напр. після нового пароля) почне з нуля
    g.__fcSmtp = undefined;
    const err = e as Error & { code?: string; responseCode?: number; response?: string };
    const error = [err.code, err.responseCode, err.response ?? err.message].filter(Boolean).join(" · ").slice(0, 400);
    const hint =
      err.code === "EAUTH" || err.responseCode === 535
        ? "Gmail не прийняв логін або пароль: створіть новий пароль додатка в Google-акаунті магазину (Безпека → Паролі додатків), замініть SMTP_PASS у Vercel і зробіть Redeploy. Перевірте й SMTP_USER — повна адреса Gmail."
        : /ETIMEDOUT|ECONNECTION|ESOCKET/.test(err.code ?? "")
          ? "Немає з'єднання з поштовим сервером — перевірте SMTP_HOST і SMTP_PORT або спробуйте пізніше."
          : err.message === "Пошта не налаштована"
            ? "У Vercel немає SMTP_USER і SMTP_PASS (або RESEND_API_KEY і MAIL_FROM)."
            : undefined;
    return { ok: false, error, ...(hint ? { hint } : {}) };
  }
}

/** Кілька листів паралельно */
export const sendMails = (mails: Mail[]) => Promise.all(mails.map(sendMail));
