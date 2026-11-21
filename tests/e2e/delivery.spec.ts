import { expect, test, type Page } from "@playwright/test";
import { expectCartCount, uniqueEmail } from "./helpers";

/*
 * Доставка при оформленні: відділення Нової пошти зі списку міста, кур'єр —
 * вулиця зі списку + будинок, Укрпошта — індекс. А також скасування замовлення
 * покупцем до оплати. Довідник Нової пошти підмінений (NP_CITIES_FIXTURE):
 * у кожному місті відділення №1, 2, 3, 5, 12 і поштомат №9001.
 */

// Кожен тест проходить повне оформлення — на завантаженій машині це довше за типові 30 с
test.describe.configure({ timeout: 60_000 });

async function startCheckout(page: Page) {
  await page.goto("/catalog/tents/np3");
  await page.getByRole("button", { name: /^Додати в кошик/ }).first().click();
  await expectCartCount(page, 1);
  await page.goto("/cart");
  await page.locator("#field-firstName").fill("Олена");
  await page.locator("#field-lastName").fill("Доставка");
  await page.locator("#field-phone").fill("671112233");
  await page.locator("#field-email").fill(uniqueEmail());
  const city = page.locator("#field-city");
  await city.fill("Полтава");
  await expect(page.getByRole("option", { name: "м. Полтава, Полтавська обл." })).toBeVisible();
  await city.press("Enter");
  await expect(city).toHaveValue("м. Полтава, Полтавська обл.");
}

const submit = async (page: Page) => {
  await page.locator("#field-agree").check();
  await page.getByRole("button", { name: "Підтвердити замовлення" }).click();
};

test("відділення: увесь список міста, пошук за номером, вибір зі списку", async ({ page }) => {
  await startCheckout(page);
  const branch = page.locator("#field-branch");
  await branch.click();
  const list = page.getByRole("listbox", { name: "Відділення й поштомати" });
  await expect(list.getByRole("option")).toHaveCount(6);
  await expect(page.getByText("Усього 6 — введіть номер чи вулицю")).toBeVisible();

  await branch.fill("12");
  await expect(list.getByRole("option")).toHaveCount(1);
  await list.getByRole("option", { name: "Відділення №12: вул. Тестова, 12" }).click();
  await expect(branch).toHaveValue("Відділення №12: вул. Тестова, 12");

  await submit(page);
  await expect(page.locator("h1")).toHaveText("Дякуємо, Олена!");
  // Покупець знає, що реквізити прийдуть листом після підтвердження
  await expect(page.getByTestId("payment-email-note")).toContainText("прийде лист із реквізитами для оплати");
});

test("без міста відділення обрати не можна; інше місто скидає обране відділення", async ({ page }) => {
  await startCheckout(page);
  const branch = page.locator("#field-branch");
  await branch.click();
  await page.getByRole("option", { name: /Поштомат №9001/ }).click();
  await expect(branch).toHaveValue(/Поштомат №9001/);

  await page.locator("#field-city").fill("");
  await expect(branch).toBeDisabled();
  await expect(branch).toHaveAttribute("placeholder", "Спершу оберіть місто");
  await page.locator("#field-city").fill("Київ");
  await page.locator("#field-city").press("Enter");
  await expect(branch).toBeEnabled();
  await expect(branch).toHaveValue("");
});

test("кур'єр: вулиця зі списку, будинок і квартира", async ({ page }) => {
  await startCheckout(page);
  await page.getByText("Нова пошта — кур'єр").click();
  await submit(page);
  await expect(page.getByText("Вкажіть вулицю")).toBeVisible();

  const street = page.locator("#field-street");
  await street.fill("Собор");
  await page.getByRole("option", { name: "вул. Соборності (Жовтнева)" }).click();
  await expect(street).toHaveValue("вул. Соборності (Жовтнева)");
  await page.locator("#field-house").fill("5А");
  await page.locator("#field-flat").fill("12");
  await page.getByRole("button", { name: "Підтвердити замовлення" }).click();
  await expect(page.locator("h1")).toHaveText("Дякуємо, Олена!");
});

test("Укрпошта: індекс відділення з 5 цифр", async ({ page }) => {
  await startCheckout(page);
  await page.getByText("Укрпошта", { exact: true }).click();
  const index = page.locator("#field-branch");
  await index.fill("36a0");
  await expect(index).toHaveValue("360"); // лише цифри
  await submit(page);
  await expect(page.getByText("Вкажіть індекс відділення — 5 цифр")).toBeVisible();
  await index.fill("36000");
  await page.getByRole("button", { name: "Підтвердити замовлення" }).click();
  await expect(page.locator("h1")).toHaveText("Дякуємо, Олена!");
});

test("накладений платіж: без реквізитів, оплата при отриманні готівкою або карткою", async ({ page }) => {
  await startCheckout(page);
  await page.locator("#field-branch").fill("5");
  const payment = page.getByRole("radio", { name: /Накладений платіж/ });
  await page.getByText("Накладений платіж", { exact: true }).click();
  await expect(payment).toBeChecked();
  await submit(page);
  await expect(page.locator("h1")).toHaveText("Дякуємо, Олена!");
  await expect(page.getByTestId("payment-cod-note")).toContainText("готівкою або карткою");
  await expect(page.getByTestId("payment-email-note")).toHaveCount(0);
});

test("доставка — за тарифами перевізника, без «безкоштовно»", async ({ page }) => {
  await startCheckout(page);
  await expect(page.locator("main").getByText("Доставка — за тарифами перевізника, оплачується при отриманні посилки")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/безкоштовн/i);
  await expect(page.getByText("Доставка по всій Україні Новою поштою та Укрпоштою")).toBeVisible();
});

test("покупець скасовує замовлення до оплати на сторінці «Де моє замовлення?»", async ({ page }) => {
  await startCheckout(page);
  await page.locator("#field-branch").fill("3");
  await submit(page);
  await expect(page.locator("h1")).toHaveText("Дякуємо, Олена!");
  const number = (await page.getByText(/№ FC-\d{7}/).textContent())!.match(/FC-\d{7}/)![0];

  await page.goto(`/orders/track?number=${number}`);
  await page.locator("#field-track-phone").fill("671112233");
  await page.getByRole("button", { name: "Перевірити статус" }).click();
  const card = page.getByTestId("tracked-order");
  await expect(card).toContainText("Очікує підтвердження");

  await card.getByRole("button", { name: "Скасувати замовлення" }).click();
  await card.getByRole("button", { name: "Так, скасувати" }).click();
  await expect(card).toContainText("Скасовано");
  await expect(card.getByRole("button", { name: "Скасувати замовлення" })).toHaveCount(0);
});
