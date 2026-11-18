import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as adminProducts from "../../app/api/admin/products/route";
import * as me from "../../app/api/auth/me/route";
import * as register from "../../app/api/auth/register/route";
import * as verify from "../../app/api/auth/verify-email/route";
import * as resend from "../../app/api/auth/verify-email/resend/route";
import { closeDatabase } from "../../app/lib/server/db";
import { call, dbDump, dbQuery, sessionCookie, uniqueEmail } from "./helpers";

const ADMIN_EMAIL = "verify-owner@example.com";
process.env.ADMIN_EMAILS = ADMIN_EMAIL;
// Команда yarn admin:verify — окремий процес, тож база має бути на диску (у тимчасовій теці)
delete process.env.FC_DB_MEMORY;

const outbox = (): { to: string; subject: string; href?: string }[] => {
  const file = join(process.env.FC_DATA_DIR!, "outbox.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
};
/** Токен з останнього листа підтвердження на цю адресу */
const tokenFor = (email: string) => {
  const mail = outbox().filter((m) => m.to === email && m.href?.startsWith("/verify-email")).at(-1);
  return mail ? new URL(mail.href!, "http://x").searchParams.get("token")! : "";
};

const signUp = async (email: string) =>
  sessionCookie((await call(register.POST, { body: { firstName: "Власник", email, phone: "", password: "camping2026" } })).res);

// База на диску створюється кілька секунд, а під навантаженням (усі тести паралельно) — довше:
// створюємо її тут, з окремим запасом часу, щоб не впиратись у ліміт першого тесту
beforeAll(async () => {
  await dbQuery("select 1");
}, 60_000);

beforeEach(() => {
  process.env.MAIL_TRANSPORT = "log";
});
afterEach(() => {
  delete process.env.MAIL_TRANSPORT;
});

describe("адміністратор лише з підтвердженим email", () => {
  it("реєстрація з адресою власника не дає адмінки, доки email не підтверджено", async () => {
    const cookie = await signUp(ADMIN_EMAIL);
    const who = await call(me.GET, { method: "GET", cookie });
    expect(who.data.user).toMatchObject({ isAdmin: false, adminPending: true, emailVerified: false });
    expect((await call(adminProducts.GET, { method: "GET", cookie })).status).toBe(403);

    // Посилання з листа відкриває доступ
    const token = tokenFor(ADMIN_EMAIL);
    expect(token).toBeTruthy();
    const r = await call(verify.POST, { body: { token }, ip: "10.40.0.1" });
    expect(r.status).toBe(200);
    expect(r.data.user).toMatchObject({ isAdmin: true, adminPending: false, emailVerified: true });
    expect((await call(adminProducts.GET, { method: "GET", cookie })).status).toBe(200);

    // Посилання одноразове
    expect((await call(verify.POST, { body: { token }, ip: "10.40.0.1" })).status).toBe(400);
  });

  it("лист підтвердження приходить на адресу з реєстрації, у базі — лише хеш токена", async () => {
    const email = uniqueEmail();
    await signUp(email);
    const token = tokenFor(email);
    expect(token.length).toBeGreaterThan(30);
    expect(await dbDump()).not.toContain(token);
  });

  it("невірний токен і CSRF відхиляються", async () => {
    expect((await call(verify.POST, { body: { token: "підробка" }, ip: "10.40.0.2" })).status).toBe(400);
    expect((await call(verify.POST, { body: { token: "x" }, origin: "http://evil.example" })).status).toBe(403);
  });

  it("звичайний покупець після підтвердження адміном не стає", async () => {
    const email = uniqueEmail();
    const cookie = await signUp(email);
    await call(verify.POST, { body: { token: tokenFor(email) }, ip: "10.40.0.3" });
    const who = await call(me.GET, { method: "GET", cookie });
    expect(who.data.user).toMatchObject({ emailVerified: true, isAdmin: false, adminPending: false });
  });

  it("повторне надсилання листа: нове посилання замінює старе, ліміт 3 на годину", async () => {
    const email = uniqueEmail();
    const cookie = await signUp(email);
    const first = tokenFor(email);
    expect((await call(resend.POST, { cookie })).data).toMatchObject({ sent: true });
    const second = tokenFor(email);
    expect(second).not.toBe(first);
    expect((await call(verify.POST, { body: { token: first }, ip: "10.40.0.4" })).status).toBe(400);

    await call(resend.POST, { cookie });
    await call(resend.POST, { cookie });
    expect((await call(resend.POST, { cookie })).status).toBe(429);
    expect((await call(resend.POST, {})).status).toBe(401);
  });

  it("без налаштованої пошти — підказка про команду для сервера", async () => {
    delete process.env.MAIL_TRANSPORT;
    const cookie = await signUp(uniqueEmail());
    expect((await call(resend.POST, { cookie })).data).toEqual({ sent: false, mailEnabled: false });
  });

  it("команда yarn admin:verify підтверджує email у базі", async () => {
    const email = uniqueEmail();
    const cookie = await signUp(email);
    // Вбудовану базу відкриває лише один процес — закриваємо її на час команди
    await closeDatabase();
    const out = execFileSync(process.execPath, ["scripts/verify-email.mjs", email], { env: process.env, encoding: "utf8" });
    expect(out).toContain("підтверджено");
    expect(() => execFileSync(process.execPath, ["scripts/verify-email.mjs", "nobody@example.com"], { env: process.env, stdio: "pipe" })).toThrow();
    expect((await call(me.GET, { method: "GET", cookie })).data.user.emailVerified).toBe(true);
  });
});
