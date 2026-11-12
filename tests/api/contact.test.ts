import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as contact from "../../app/api/contact/route";
import { call } from "./helpers";

const valid = { topic: "advice", name: "Оксана", email: "oksana@example.com", phone: "+380 ", message: "Шукаємо намет для родини з чотирьох" };
/** Звернення зберігаються в базі (db.json → messages) */
const savedMessages = () => (JSON.parse(readFileSync(join(process.env.FC_DATA_DIR!, "db.json"), "utf8")).messages ?? []) as Record<string, unknown>[];

describe("форма зворотного зв'язку", () => {
  it("перевіряє поля", async () => {
    const cases = [
      { ...valid, topic: "spam" },
      { ...valid, name: "О" },
      { ...valid, email: "bad" },
      { ...valid, phone: "+380 50 11" },
      { ...valid, message: "коротко" },
    ];
    for (const body of cases) {
      const r = await call(contact.POST, { body, ip: "1.1.1.1" });
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("захищена від CSRF", async () => {
    expect((await call(contact.POST, { body: valid, origin: "http://evil.example" })).status).toBe(403);
  });

  it("зберігає звернення в базі для адмін-панелі", async () => {
    const r = await call(contact.POST, { body: { ...valid, topic: "order", order: "FC-1234567" }, ip: "2.2.2.2" });
    expect(r.data).toEqual({ ok: true });
    const saved = savedMessages().at(-1)!;
    expect(saved).toMatchObject({ topic: "Питання щодо замовлення", name: "Оксана", order: "FC-1234567" });
    expect(saved.done).toBeUndefined(); // нове, ще не опрацьоване
    // Неповний телефон («+380 ») не зберігаємо
    expect(saved.phone).toBeUndefined();
  });

  it("бот, що заповнив приховане поле, отримує «ok», але нічого не зберігається", async () => {
    const before = savedMessages().length;
    const r = await call(contact.POST, { body: { ...valid, website: "http://spam" }, ip: "3.3.3.3" });
    expect(r.data).toEqual({ ok: true });
    expect(savedMessages()).toHaveLength(before);
  });

  it("не більше 3 звернень за 10 хвилин з однієї адреси", async () => {
    for (let i = 0; i < 3; i++) expect((await call(contact.POST, { body: valid, ip: "4.4.4.4" })).status).toBe(200);
    expect((await call(contact.POST, { body: valid, ip: "4.4.4.4" })).status).toBe(429);
    // Інша адреса — без обмежень
    expect((await call(contact.POST, { body: valid, ip: "5.5.5.5" })).status).toBe(200);
  });
});
