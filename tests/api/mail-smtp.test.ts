import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * Листи через Gmail (SMTP з паролем додатка) — без власного домену.
 * nodemailer підмінено: справжніх листів тест не надсилає.
 */

const sent: Record<string, unknown>[] = [];
const created: Record<string, unknown>[] = [];
let fail = false;

vi.mock("nodemailer", () => {
  const createTransport = (opts: Record<string, unknown>) => {
    created.push(opts);
    return {
      sendMail: async (msg: Record<string, unknown>) => {
        if (fail) throw new Error("Invalid login");
        sent.push(msg);
        return { messageId: "x" };
      },
    };
  };
  return { default: { createTransport }, createTransport };
});

beforeAll(() => {
  delete process.env.MAIL_TRANSPORT;
  process.env.SMTP_USER = "familycamping.shop@gmail.com";
  process.env.SMTP_PASS = "abcd efgh ijkl mnop";
});
afterAll(() => {
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
});

describe("листи через Gmail", () => {
  it("з’єднання з Gmail: SSL, пароль додатка без пробілів", async () => {
    const { mailEnabled, sendMail } = await import("../../app/lib/server/mail");
    expect(mailEnabled()).toBe(true);
    const ok = await sendMail({ to: "buyer@example.com", subject: "Замовлення FC-1234567 прийнято", text: "Дякуємо!", href: "/account" });
    expect(ok).toBe(true);
    expect(created[0]).toMatchObject({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "familycamping.shop@gmail.com", pass: "abcdefghijklmnop" },
    });
  });

  it("відправник — назва магазину й адреса скриньки; текст і HTML з посиланням", () => {
    expect(sent[0]).toMatchObject({
      from: `"Family Camping" <familycamping.shop@gmail.com>`,
      to: "buyer@example.com",
      subject: "Замовлення FC-1234567 прийнято",
    });
    expect(sent[0].text).toMatch(/^Дякуємо!\n\nhttps?:\/\/.+\/account$/);
    expect(sent[0].html).toContain("Відкрити на сайті");
  });

  it("помилка Gmail (напр. неправильний пароль) не ламає замовлення — лише false", async () => {
    const { sendMail } = await import("../../app/lib/server/mail");
    fail = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await sendMail({ to: "buyer@example.com", subject: "Тест", text: "x" })).toBe(false);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
    fail = false;
  });
});
