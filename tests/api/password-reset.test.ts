import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as login from "../../app/api/auth/login/route";
import * as me from "../../app/api/auth/me/route";
import * as forgot from "../../app/api/auth/password/forgot/route";
import * as reset from "../../app/api/auth/password/reset/route";
import * as register from "../../app/api/auth/register/route";
import { call, dbDump, dbQuery, sessionCookie, uniqueEmail } from "./helpers";

const outbox = (): { to: string; subject: string; text: string; href?: string }[] => {
  const file = join(process.env.FC_DATA_DIR!, "outbox.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
};
const resetMails = (email: string) => outbox().filter((m) => m.to === email && m.href?.startsWith("/reset-password"));
/** Токен з останнього листа відновлення на цю адресу */
const tokenFor = (email: string) => {
  const mail = resetMails(email).at(-1);
  return mail ? new URL(mail.href!, "http://x").searchParams.get("token")! : "";
};

let ipSeq = 0;
/** Окрема IP для кожного виклику — щоб ліміти одних тестів не заважали іншим */
const ip = () => `10.77.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;

const signUp = async (email: string, password = "oldpass123") =>
  sessionCookie((await call(register.POST, { body: { firstName: "Олена", email, phone: "", password } })).res);
const askReset = (email: string) => call(forgot.POST, { body: { email }, ip: ip() });
const signIn = (email: string, password: string) => call(login.POST, { body: { email, password }, ip: ip() });

beforeEach(() => {
  process.env.MAIL_TRANSPORT = "log";
});
afterEach(() => {
  delete process.env.MAIL_TRANSPORT;
});

describe("відновлення пароля", () => {
  it("лист → новий пароль → старий не діє, старі сесії закрито, посилання одноразове", async () => {
    const email = uniqueEmail();
    const oldSession = await signUp(email);

    const r = await askReset(email.toUpperCase());
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ sent: true, mailEnabled: true });
    const [mail] = resetMails(email);
    expect(mail.subject).toContain("Відновлення пароля");
    expect(mail.text).toContain("60 хвилин");
    const token = tokenFor(email);
    expect(token.length).toBeGreaterThan(30);
    // У базі — лише хеш токена
    expect(await dbDump()).not.toContain(token);

    expect((await call(reset.POST, { body: { token, password: "short" }, ip: ip() })).status).toBe(400);
    const done = await call(reset.POST, { body: { token, password: "newpass456" }, ip: ip() });
    expect(done.status).toBe(200);
    expect(done.data).toEqual({ ok: true, email });

    expect((await signIn(email, "oldpass123")).status).toBe(401);
    expect((await signIn(email, "newpass456")).status).toBe(200);
    // Сесія, відкрита до зміни пароля, більше не діє
    expect((await call(me.GET, { method: "GET", cookie: oldSession })).data.user).toBeNull();
    // Посилання з листа підтверджує й email
    const [row] = await dbQuery("select email_verified_at, password_reset_hash from users where email = $1", [email]);
    expect(row.email_verified_at).toBeTruthy();
    expect(row.password_reset_hash).toBeNull();

    expect((await call(reset.POST, { body: { token, password: "another789" }, ip: ip() })).status).toBe(400);
  });

  it("новий лист замінює попереднє посилання", async () => {
    const email = uniqueEmail();
    await signUp(email);
    await askReset(email);
    const first = tokenFor(email);
    await askReset(email);
    const second = tokenFor(email);
    expect(second).not.toBe(first);
    expect((await call(reset.POST, { body: { token: first, password: "newpass456" }, ip: ip() })).status).toBe(400);
    expect((await call(reset.POST, { body: { token: second, password: "newpass456" }, ip: ip() })).status).toBe(200);
  });

  it("посилання діє годину", async () => {
    const email = uniqueEmail();
    await signUp(email);
    await askReset(email);
    await dbQuery("update users set password_reset_expires_at = now() - interval '1 minute' where email = $1", [email]);
    expect((await call(reset.POST, { body: { token: tokenFor(email), password: "newpass456" }, ip: ip() })).status).toBe(400);
    expect((await signIn(email, "oldpass123")).status).toBe(200);
  });

  it("незареєстрована адреса: та сама відповідь, лист не надсилається", async () => {
    const email = uniqueEmail();
    const r = await askReset(email);
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ sent: true, mailEnabled: true });
    expect(outbox().filter((m) => m.to === email)).toHaveLength(0);
  });

  it("ліміт: 3 листи на годину на адресу", async () => {
    const email = uniqueEmail();
    await signUp(email);
    for (let i = 0; i < 3; i++) expect((await askReset(email)).status).toBe(200);
    expect((await askReset(email)).status).toBe(429);
    expect(resetMails(email)).toHaveLength(3);
  });

  it("невірні дані, підробний токен і CSRF відхиляються", async () => {
    expect((await call(forgot.POST, { body: { email: "не email" }, ip: ip() })).status).toBe(400);
    expect((await call(reset.POST, { body: { token: "підробка", password: "newpass456" }, ip: ip() })).status).toBe(400);
    expect((await call(reset.POST, { body: { token: "", password: "newpass456" }, ip: ip() })).status).toBe(400);
    expect((await call(forgot.POST, { body: { email: uniqueEmail() }, origin: "http://evil.example" })).status).toBe(403);
    expect((await call(reset.POST, { body: { token: "x", password: "newpass456" }, origin: "http://evil.example" })).status).toBe(403);
  });

  it("без налаштованої пошти — підказка написати в чат", async () => {
    delete process.env.MAIL_TRANSPORT;
    const email = uniqueEmail();
    await signUp(email);
    expect((await askReset(email)).data).toEqual({ sent: false, mailEnabled: false });
  });
});
