import { afterEach, beforeAll, describe, expect, it } from "vitest";
import * as mailTest from "../../app/api/admin/mail-test/route";
import * as register from "../../app/api/auth/register/route";
import { sendTestMail } from "../../app/lib/server/mail";
import { call, markEmailVerified, sessionCookie, uniqueEmail } from "./helpers";

/* Перевірка пошти з адмінки: тестовий лист і зрозуміла причина, якщо не дійшов */

const ADMIN = "mailtest-admin@example.com";
process.env.ADMIN_EMAILS = ADMIN;
let admin = "";

beforeAll(async () => {
  admin = sessionCookie((await call(register.POST, { body: { firstName: "Адмін", email: ADMIN, phone: "", password: "camping2026" } })).res);
  await markEmailVerified(ADMIN);
});

const saved = { ...process.env };
afterEach(() => {
  for (const k of ["MAIL_TRANSPORT", "SMTP_USER", "SMTP_PASS", "SMTP_HOST", "SMTP_PORT"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("перевірка пошти в адмінці", () => {
  it("лише адміністратор", async () => {
    const customer = sessionCookie((await call(register.POST, { body: { firstName: "Покупець", email: uniqueEmail(), phone: "", password: "camping2026" } })).res);
    expect((await call(mailTest.POST, { cookie: customer })).status).toBe(403);
  });

  it("пошта працює — лист на адресу адміністратора", async () => {
    process.env.MAIL_TRANSPORT = "log";
    const r = await call(mailTest.POST, { cookie: admin });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ ok: true, to: ADMIN });
  });

  it("пошта не налаштована — підказка, що додати у Vercel", async () => {
    delete process.env.MAIL_TRANSPORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    const r = await sendTestMail(ADMIN);
    expect(r).toMatchObject({ ok: false, error: "Пошта не налаштована", hint: expect.stringContaining("SMTP_USER") });
  });

  it("сервер недоступний — причина видна, пароль не показується", async () => {
    delete process.env.MAIL_TRANSPORT;
    process.env.SMTP_USER = "shop@example.com";
    process.env.SMTP_PASS = "super-secret-pass";
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1"; // нікого немає — з'єднання відхилено
    const r = await sendTestMail(ADMIN);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/ECONNREFUSED|ESOCKET|ECONNECTION/);
    expect(JSON.stringify(r)).not.toContain("super-secret-pass");
  });
});
