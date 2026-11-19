import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as adminProducts from "../../app/api/admin/products/route";
import * as team from "../../app/api/admin/team/route";
import * as me from "../../app/api/auth/me/route";
import * as register from "../../app/api/auth/register/route";
import { call, dbDump, markEmailVerified, sessionCookie, uniqueEmail } from "./helpers";

const OWNER = "team-owner@example.com";
process.env.ADMIN_EMAILS = OWNER;

const outbox = (): { to: string; subject: string; href?: string }[] => {
  const file = join(process.env.FC_DATA_DIR!, "outbox.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
};

const signUp = async (email: string) =>
  sessionCookie((await call(register.POST, { body: { firstName: "Марія", lastName: "Тест", email, phone: "", password: "camping2026" } })).res);
const whoami = async (cookie: string) => (await call(me.GET, { method: "GET", cookie })).data.user;
const canOpenAdmin = async (cookie: string) => (await call(adminProducts.GET, { method: "GET", cookie })).status === 200;
const add = (email: string, cookie: string) => call(team.POST, { body: { email }, cookie });
const remove = (email: string, cookie: string) =>
  call(team.DELETE, { method: "DELETE", cookie, path: `/api/admin/team?email=${encodeURIComponent(email)}` });

let owner = "";

beforeAll(async () => {
  process.env.MAIL_TRANSPORT = "log";
  owner = await signUp(OWNER);
  await markEmailVerified(OWNER);
});
afterAll(() => {
  delete process.env.MAIL_TRANSPORT;
});

describe("адміністратори з адмін-панелі", () => {
  it("власник бачить себе в списку й може керувати", async () => {
    const r = await call(team.GET, { method: "GET", cookie: owner });
    expect(r.status).toBe(200);
    expect(r.data.canManage).toBe(true);
    expect(r.data.team[0]).toMatchObject({ email: OWNER, role: "owner", status: "active", name: "Марія Тест" });
    expect((await whoami(owner)).isOwner).toBe(true);
  });

  it("зареєстрований покупець стає адміністратором після підтвердження email", async () => {
    const email = uniqueEmail();
    const cookie = await signUp(email);
    expect(await canOpenAdmin(cookie)).toBe(false);

    const r = await add(email, owner);
    expect(r.status).toBe(200);
    expect(r.data.registered).toBe(true);
    expect(r.data.team).toContainEqual(expect.objectContaining({ email, role: "admin", status: "unverified" }));
    expect(outbox().filter((m) => m.to === email && m.subject.includes("адміністратором"))).toHaveLength(1);

    // Без підтвердженого email — ще ні
    expect(await whoami(cookie)).toMatchObject({ isAdmin: false, adminPending: true });
    expect(await canOpenAdmin(cookie)).toBe(false);
    await markEmailVerified(email);
    expect(await whoami(cookie)).toMatchObject({ isAdmin: true, isOwner: false, adminPending: false });
    expect(await canOpenAdmin(cookie)).toBe(true);

    // Доданий адміністратор бачить список, але не керує ним
    const view = await call(team.GET, { method: "GET", cookie });
    expect(view.data.canManage).toBe(false);
    expect((await add(uniqueEmail(), cookie)).status).toBe(403);
    expect((await remove(email, cookie)).status).toBe(403);
    expect((await remove(OWNER, cookie)).status).toBe(403);

    // Прибрали — доступ зникає одразу
    expect((await remove(email, owner)).status).toBe(200);
    expect(await canOpenAdmin(cookie)).toBe(false);
    expect(await whoami(cookie)).toMatchObject({ isAdmin: false, adminPending: false });
  });

  it("запрошення для адреси без акаунта спрацьовує під час реєстрації", async () => {
    const email = uniqueEmail();
    const r = await add(email.toUpperCase(), owner);
    expect(r.data.registered).toBe(false);
    expect(r.data.team).toContainEqual(expect.objectContaining({ email, status: "invited" }));
    expect(outbox().filter((m) => m.to === email).at(-1)?.href).toBe("/account");

    const cookie = await signUp(email);
    expect(await whoami(cookie)).toMatchObject({ isAdmin: false, adminPending: true });
    await markEmailVerified(email);
    expect(await canOpenAdmin(cookie)).toBe(true);
    // Запрошення використане — у списку тепер акаунт
    const list = (await call(team.GET, { method: "GET", cookie: owner })).data.team;
    expect(list.filter((m: { email: string }) => m.email === email)).toEqual([expect.objectContaining({ status: "active", name: "Марія Тест" })]);
  });

  it("скасоване запрошення не дає прав", async () => {
    const email = uniqueEmail();
    await add(email, owner);
    expect((await remove(email, owner)).status).toBe(200);
    const cookie = await signUp(email);
    await markEmailVerified(email);
    expect(await canOpenAdmin(cookie)).toBe(false);
  });

  it("власника не прибрати, дублікати й невірні адреси відхиляються", async () => {
    expect((await remove(OWNER, owner)).status).toBe(400);
    expect((await add(OWNER, owner)).status).toBe(400);
    expect((await add("не email", owner)).status).toBe(400);
    const email = uniqueEmail();
    expect((await add(email, owner)).status).toBe(200);
    expect((await add(email, owner)).status).toBe(400);
    expect((await remove(uniqueEmail(), owner)).status).toBe(404);
  });

  it("покупці й гості не мають доступу; CSRF відхиляється", async () => {
    const customer = await signUp(uniqueEmail());
    expect((await call(team.GET, { method: "GET", cookie: customer })).status).toBe(403);
    expect((await call(team.GET, { method: "GET" })).status).toBe(401);
    expect((await call(team.POST, { body: { email: uniqueEmail() }, cookie: owner, origin: "http://evil.example" })).status).toBe(403);
    // Нічого зайвого в базі
    expect(await dbDump()).not.toContain("evil.example");
  });
});
