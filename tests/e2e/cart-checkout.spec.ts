import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, expectCartCount, parsePrice, register, uniqueEmail } from "./helpers";

test.describe("кошик", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/catalog/tents/np3");
    await page.getByRole("button", { name: /^Додати в кошик/ }).first().click();
    await expectCartCount(page, 1);
  });

  test("бічна панель кошика відкривається і веде до оформлення", async ({ page }) => {
    await page.getByRole("button", { name: /^Кошик, товарів/ }).click();
    const drawer = page.getByRole("dialog", { name: "Кошик" });
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Nature Peak 3");
    await drawer.getByRole("link", { name: /Оформити замовлення/ }).click();
    await expect(page).toHaveURL("/cart");
  });

  test("зміна кількості перераховує суму", async ({ page }) => {
    await page.goto("/cart");
    const total = page.getByText("До сплати").locator("..");
    const before = parsePrice((await total.textContent())!);
    await page.locator("main").getByRole("button", { name: "Збільшити кількість" }).first().click();
    await expectCartCount(page, 2);
    await expect.poll(async () => parsePrice((await total.textContent())!)).toBeGreaterThan(before);
  });

  test("видалення з можливістю повернути", async ({ page }) => {
    await page.goto("/cart");
    await page.getByRole("button", { name: /^Видалити .* з кошика$/ }).first().click();
    await expectCartCount(page, 0);
    await page.getByRole("button", { name: "Повернути" }).click();
    await expectCartCount(page, 1);
  });

  test("промокод: неіснуючий — помилка, FAMILY10 — знижка", async ({ page }) => {
    await page.goto("/cart");
    const input = page.getByRole("textbox", { name: "Промокод" });
    await input.fill("NOPE");
    await page.getByRole("button", { name: "Застосувати" }).click();
    await expect(page.getByText("Такого промокоду не існує")).toBeVisible();
    await input.fill("family10");
    await page.getByRole("button", { name: "Застосувати" }).click();
    await expect(page.getByText("Промокод FAMILY10")).toBeVisible();
  });

  test("доставка — за тарифами перевізника, самовивозу немає", async ({ page }) => {
    await page.goto("/cart");
    await expect(page.locator("aside").getByText("За тарифами перевізника").first()).toBeVisible();
    await expect(page.getByText("Самовивіз")).toHaveCount(0);
  });

  test("гість бачить форму оформлення і необов'язковий вхід", async ({ page }) => {
    await page.goto("/cart");
    await expect(page.locator("form#checkout")).toBeVisible();
    await expect(page.getByText("Реєстрація не потрібна")).toBeVisible();
    // Вхід — згорнутий; форми входу не вкладені у форму оформлення
    await page.getByRole("button", { name: "Увійти", exact: true }).click();
    await expect(page.locator("#field-login-email")).toBeVisible();
    await expect(page.locator("form#checkout form")).toHaveCount(0);
  });
});

test("місто: підказки з довідника, виправлення одруківок, перевірка при оформленні", async ({ page }) => {
  await page.goto("/catalog/tents/np3");
  await page.getByRole("button", { name: /^Додати в кошик/ }).first().click();
  await page.goto("/cart");
  const city = page.getByRole("combobox", { name: "Місто або село" });
  const list = page.getByRole("listbox", { name: "Населені пункти" });

  // Підказки за початком назви, вибір мишею
  await city.fill("Полт");
  await expect(list.getByRole("option").first()).toHaveText("м. Полтава, Полтавська обл.");
  await expect(list).toContainText("с. Полтавка, Первомайський р-н, Миколаївська обл.");
  await list.getByRole("option", { name: "м. Полтава, Полтавська обл." }).click();
  await expect(city).toHaveValue("м. Полтава, Полтавська обл.");
  await expect(list).toBeHidden();

  // Одруківка — «Можливо, ви мали на увазі», вибір клавіатурою
  await city.fill("Харкив");
  await expect(page.getByText("Можливо, ви мали на увазі:")).toBeVisible();
  await city.press("ArrowDown");
  await city.press("ArrowUp");
  await city.press("Enter");
  await expect(city).toHaveValue("м. Харків, Харківська обл.");

  // Неіснуюча назва
  await city.fill("Абракадабрськ");
  await expect(page.getByText("Нічого не знайдено — перевірте написання")).toBeVisible();

  // Оформлення з одруківкою без вибору — помилка під полем, фокус на ньому
  await city.fill("Палтава");
  await page.locator("#field-firstName").fill("Ірина");
  await page.locator("#field-lastName").fill("Місто");
  await page.locator("#field-phone").fill("502223344");
  await page.locator("#field-email").fill(uniqueEmail());
  await page.locator("#field-branch").fill("5");
  await page.locator("#field-agree").check();
  await page.getByRole("button", { name: "Підтвердити замовлення" }).click();
  await expect(page.getByText("Не знайшли «Палтава». Можливо, ви мали на увазі «Полтава»?")).toBeVisible();
  await expect(city).toBeFocused();
  await expect(page.locator("h1")).toHaveText("Оформлення замовлення");
});

test("кошик з товарами після перезавантаження — без помилки гідратації", async ({ page }) => {
  // Кошик лежить у localStorage, сервер про нього не знає: HTML має збігтися з серверним
  await page.addInitScript(() => localStorage.setItem("family-camping-cart", JSON.stringify([{ id: "np3", qty: 2 }])));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  for (const path of ["/", "/catalog/tents", "/catalog/tents/np3", "/hits", "/cart"]) {
    await page.goto(path);
    await expectCartCount(page, 2);
  }
  expect(errors.filter((e) => /hydrat|#418|#423|#425/i.test(e))).toEqual([]);

  // Панель кошика після гідратації показує справжній вміст
  await page.goto("/");
  await page.getByRole("button", { name: /^Кошик, товарів/ }).click();
  const drawer = page.getByRole("dialog", { name: "Кошик" });
  await expect(drawer).toContainText("Nature Peak 3");
  await expect(drawer).toContainText("2 товари");
});

/** Заповнює форму оформлення гостя і підтверджує замовлення */
async function placeGuestOrder(page: Page, email: string) {
  await page.goto("/catalog/tents/np3");
  await page.getByRole("button", { name: /^Додати в кошик/ }).first().click();
  await page.goto("/cart");
  await page.locator("#field-firstName").fill("Галина");
  await page.locator("#field-lastName").fill("Гостьова");
  await page.locator("#field-phone").fill("677654321");
  await page.locator("#field-city").fill("Полтава");
  await page.locator("#field-branch").fill("3");

  // Без email гість замовити не може
  await page.locator("#field-agree").check();
  await page.getByRole("button", { name: "Підтвердити замовлення" }).click();
  await expect(page.getByText("Вкажіть email — надішлемо підтвердження")).toBeVisible();
  await expect(page.locator("#field-email")).toBeFocused();

  await page.locator("#field-email").fill(email);
  await page.getByRole("button", { name: "Підтвердити замовлення" }).click();
  await expect(page.locator("h1")).toHaveText("Дякуємо, Галина!");
  await expectCartCount(page, 0);
  return (await page.getByText(/№ FC-\d{7}/).textContent())!.match(/FC-\d{7}/)![0];
}

test("гість: замовлення без реєстрації, потім акаунт одним паролем — замовлення в профілі", async ({ page }) => {
  const number = await placeGuestOrder(page, uniqueEmail());
  await expect(page.getByRole("link", { name: "«Де моє замовлення?»" })).toHaveAttribute("href", `/orders/track?number=${number}`);

  await page.locator("#field-guest-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Створити акаунт" }).click();
  await expect(page.getByText("Готово! Замовлення збережено")).toBeVisible();

  await page.goto("/account");
  await expect(page.getByText(number).first()).toBeVisible();
});

test("гість: статус замовлення на сторінці «Де моє замовлення?»", async ({ page }) => {
  const number = await placeGuestOrder(page, uniqueEmail());
  await page.getByRole("link", { name: "«Де моє замовлення?»" }).click();
  await expect(page).toHaveURL(`/orders/track?number=${number}`);
  await expect(page.locator("#field-track-number")).toHaveValue(number);

  // Чужий телефон — не знайдено
  await page.locator("#field-track-phone").fill("501112233");
  await page.getByRole("button", { name: "Перевірити статус" }).click();
  await expect(page.getByText("Замовлення не знайдено")).toBeVisible();

  await page.locator("#field-track-phone").fill("677654321");
  await page.getByRole("button", { name: "Перевірити статус" }).click();
  const card = page.getByTestId("tracked-order");
  await expect(card).toContainText(`Замовлення ${number}`);
  // Для покупця — словами, що відбувається: менеджер ще не підтвердив
  await expect(card).toContainText("Очікує підтвердження");
  await expect(card).toContainText("Nature Peak 3");
});

test("гість з наявним акаунтом: вхід після замовлення переносить його в профіль", async ({ page }) => {
  // Акаунт існує, але покупець оформив замовлення, не входячи
  const email = await register(page, "Галина");
  await page.getByRole("button", { name: "Вийти" }).click();
  const number = await placeGuestOrder(page, email);

  await page.locator("#field-guest-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Створити акаунт" }).click();
  await expect(page.getByText(/уже існує/)).toBeVisible();
  await page.getByRole("link", { name: /Увійти — замовлення перейде в акаунт/ }).click();

  await page.locator("#field-login-email").fill(email);
  await page.locator("#field-login-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Увійти", exact: true }).click();
  await expect(page.getByText(number).first()).toBeVisible();
});

test("повне оформлення: згода з умовами обов'язкова", async ({ page }) => {
  await register(page, "Тарас");
  await page.goto("/catalog/tents/np3");
  await page.getByRole("button", { name: /^Додати в кошик/ }).first().click();
  await page.goto("/cart");

  // Контакти підставлені з профілю
  await expect(page.locator("#field-firstName")).toHaveValue("Тарас");
  await page.locator("#field-lastName").fill("Шевченко");
  await page.locator("#field-city").fill("Львів");
  await page.locator("#field-branch").fill("12");

  // Без згоди — підказка, замовлення не створюється
  await page.getByRole("button", { name: "Підтвердити замовлення" }).click();
  await expect(page.getByText("Підтвердьте згоду, щоб оформити замовлення")).toBeVisible();
  await expect(page.locator("#field-agree")).toBeFocused();
  await expect(page.locator("h1")).toHaveText("Оформлення замовлення");

  // Посилання на умови ведуть на справжні сторінки
  const agree = page.locator("label").filter({ has: page.locator("#field-agree") });
  await expect(agree.getByRole("link", { name: "умовами доставки й оплати" })).toHaveAttribute("href", "/delivery");
  // Умови повернення поки сховані (shop-config: returnsInfoEnabled)
  await expect(agree.getByRole("link", { name: "умовами повернення" })).toHaveCount(0);
  await expect(agree.getByRole("link", { name: "політикою конфіденційності" })).toHaveAttribute("href", "/privacy");

  await page.locator("#field-agree").check();
  await expect(page.getByText("Підтвердьте згоду")).toHaveCount(0);
  await page.getByRole("button", { name: "Підтвердити замовлення" }).click();
  await expect(page.locator("h1")).toHaveText("Дякуємо, Тарас!");
  await expectCartCount(page, 0);

  // Замовлення з'явилось у профілі
  await page.goto("/account");
  await expect(page.getByText(/FC-\d{7}/).first()).toBeVisible();
});
