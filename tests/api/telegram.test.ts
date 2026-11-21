import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as chat from "../../app/api/chat/route";
import * as orders from "../../app/api/orders/route";
import { formatPrice } from "../../app/components/catalog-data";
import { call, dbQuery } from "./helpers";

/** Повідомлення, «надіслані» в режимі TELEGRAM_TRANSPORT=log */
const sent = (): { text: string }[] => {
  const file = join(process.env.FC_DATA_DIR!, "telegram.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
};

beforeEach(() => {
  process.env.TELEGRAM_TRANSPORT = "log";
});
afterEach(() => {
  delete process.env.TELEGRAM_TRANSPORT;
});

describe("сповіщення адміністратору в Telegram", () => {
  it("нове замовлення — з товарами, контактами, доставкою і посиланням в адмінку", async () => {
    const r = await call(orders.POST, {
      ip: "10.50.0.1",
      body: {
        lines: [{ id: "np3", qty: 2 }],
        contact: { firstName: "Тетяна", lastName: "Телеграм", phone: "+380 63 555 44 33", email: "tg@example.com" },
        delivery: { method: "np-branch", city: "Київ", branch: "5" },
        payment: "invoice",
        comment: "Після 18:00",
        noCall: true,
        agreed: true,
      },
    });
    expect(r.status).toBe(200);
    const text = sent().at(-1)!.text;
    const n = r.data.order.number;
    expect(text).toContain(`Нове замовлення ${n}`);
    expect(text).toMatch(/Намет Nature Peak 3 × 2/);
    expect(text).toContain("Тетяна Телеграм (без акаунта)");
    expect(text).toContain("+380 63 555 44 33 — просить не телефонувати");
    expect(text).toContain("м. Київ, Київська обл., Відділення №5: вул. Тестова, 5");
    expect(text).toContain("Оплата на рахунок");
    expect(text).toContain("Після 18:00");
    expect(text).toContain(`/admin/orders?q=${n}`);
    // Без порожніх рядків поспіль і «undefined»
    expect(text).not.toMatch(/\n\n\n|undefined|null/);
  });

  it("товар постачальника — з назвою постачальника й артикулом; накладений платіж — сума для ТТН", async () => {
    const [s] = await dbQuery("insert into suppliers (name, feed_url) values ('Ranger', 'https://example.com/tg.xml') returning id");
    await dbQuery("update products set supplier_id = $1, supplier_sku = 'RA6667' where id = 'np3'", [s.id]);
    try {
      const r = await call(orders.POST, {
        ip: "10.50.0.9",
        body: {
          lines: [{ id: "np3", qty: 1 }],
          contact: { firstName: "Ольга", lastName: "Артикул", phone: "+380 63 555 44 34", email: "sku@example.com" },
          delivery: { method: "np-branch", city: "Київ", branch: "5" },
          payment: "cod",
          agreed: true,
        },
      });
      expect(r.status).toBe(200);
      const text = sent().at(-1)!.text;
      expect(text).toMatch(/Намет Nature Peak 3 × 1 — .+\n   📦 Ranger, арт\. RA6667/);
      expect(text).toContain(`Накладений платіж — ТТН з накладеним платежем на ${formatPrice(r.data.order.total)}`);
    } finally {
      await dbQuery("update products set supplier_id = null, supplier_sku = null where id = 'np3'");
      await dbQuery("delete from suppliers where id = $1", [s.id]);
    }
  });

  it("невдале замовлення не надсилає сповіщення", async () => {
    const before = sent().length;
    await call(orders.POST, { ip: "10.50.0.2", body: { lines: [], agreed: true } });
    expect(sent().length).toBe(before);
  });

  it("нове повідомлення в чаті — з контактами, товаром і посиланням на розмову", async () => {
    const r = await call(chat.POST, {
      ip: "10.50.0.3",
      body: { name: "Петро", email: "petro@example.com", text: "Який намет обрати для чотирьох?", productId: "np3" },
    });
    expect(r.status).toBe(200);
    const text = sent().at(-1)!.text;
    expect(text).toContain("💬 Чат: Петро (petro@example.com)");
    expect(text).toContain("Про товар: Намет Nature Peak 3");
    expect(text).toContain("Який намет обрати для чотирьох?");
    expect(text).toMatch(/\/admin\/chats\?id=[0-9a-f-]{36}/);
  });

  it("без налаштувань нічого не ламається", async () => {
    delete process.env.TELEGRAM_TRANSPORT;
    const before = sent().length;
    const r = await call(chat.POST, {
      ip: "10.50.0.4",
      body: { name: "Петро", email: "petro2@example.com", text: "Питання без Telegram-бота" },
    });
    expect(r.status).toBe(200);
    expect(sent().length).toBe(before);
  });
});
