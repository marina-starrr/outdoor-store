import { expect, test } from "@playwright/test";
import { helperAdminApi, register } from "./helpers";

const PRODUCT = { id: "gr-grid", url: "/catalog/grills/gr-grid", name: "Решітка-гриль Outventure BBQ" };
const TEXT = "Решітка міцна, мангал під неї підходить ідеально. Миється легко.";

test("відгук: лише з акаунтом, з'являється після схвалення, рейтинг — справжній", async ({ page, baseURL }) => {
  // Спочатку відгуків немає, вигаданого рейтингу теж
  await page.goto(`${PRODUCT.url}#reviews`);
  await expect(page.getByText("Відгуків ще немає — напишіть перший")).toBeVisible();
  await expect(page.getByRole("tabpanel")).toContainText("Відгуків ще немає");
  // Гість — лише посилання на вхід
  await expect(page.getByRole("link", { name: "Увійдіть, щоб написати відгук" })).toHaveAttribute(
    "href",
    `/account?next=${encodeURIComponent(`${PRODUCT.url}#reviews`)}`,
  );

  await register(page, "Олег");
  await page.goto(`${PRODUCT.url}#reviews`);
  await page.getByRole("button", { name: "Написати відгук" }).click();
  await page.getByRole("radio", { name: "4 з 5" }).click();
  await page.getByRole("button", { name: "Надіслати на перевірку" }).click();
  await expect(page.getByRole("tabpanel").getByRole("alert")).toHaveText("Відгук має містити щонайменше 10 символів");
  await page.getByPlaceholder("Що сподобалось, а що можна покращити?").fill(TEXT);
  await page.getByRole("button", { name: "Надіслати на перевірку" }).click();
  await expect(page.getByText("Ваш відгук з’явиться на сайті після перевірки модератором")).toBeVisible();
  // Поки не схвалено — на сайті його немає
  await expect(page.getByTestId("reviews")).toHaveCount(0);

  // Адміністратор схвалює
  const api = await helperAdminApi(baseURL!);
  const { reviews } = await (await api.get("/api/admin/reviews")).json();
  const review = reviews.find((r: { productId: string; text: string }) => r.productId === PRODUCT.id && r.text === TEXT);
  expect(review).toMatchObject({ status: "pending", verified: false, author: "Олег" });
  expect((await api.patch(`/api/admin/reviews/${review.id}`, { data: { status: "approved" } })).ok()).toBe(true);
  await api.dispose();

  // Відгук і справжній рейтинг на сторінці товару (кеш каталогу оновлюється за мить)
  // reload, а не goto: перехід на ту саму адресу з #reviews браузер не перезавантажує
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId("reviews")).toContainText(TEXT, { timeout: 1000 });
    await expect(page.getByRole("tab", { name: "Відгуки (1)" })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId("reviews")).not.toContainText("Підтверджена покупка");
  await expect(page.getByText("Ваш відгук опубліковано.")).toBeVisible();

  // Рейтинг на картці в каталозі
  await page.goto("/catalog/grills");
  // Картка є і в сітці, і в «Нещодавно переглянуті» — перевіряємо першу (сітку)
  const card = page.getByRole("main").locator("article", { hasText: PRODUCT.name }).first();
  await expect(card.getByLabel("Рейтинг 4.0 з 5, відгуків: 1")).toBeVisible();
});

test("підтвердження email: недійсне посилання — зрозуміла помилка", async ({ page }) => {
  await page.goto("/verify-email?token=недійсний");
  await expect(page.getByRole("heading", { name: "Не вдалося підтвердити" })).toBeVisible();
  await expect(page.getByText("Посилання недійсне або застаріло")).toBeVisible();
});

test("адмін-панель: модерація відгуків", async ({ browser, baseURL }) => {
  const api = await helperAdminApi(baseURL!);
  const admin = await browser.newPage({ storageState: await api.storageState() });
  await admin.goto("/admin/reviews");
  await expect(admin.getByRole("heading", { name: "Відгуки" })).toBeVisible();
  await expect(admin.getByRole("button", { name: /^На модерації/ })).toHaveAttribute("aria-pressed", "true");
  await admin.getByRole("button", { name: /^Схвалені/ }).click();
  await expect(admin.getByRole("button", { name: /^Схвалені/ })).toHaveAttribute("aria-pressed", "true");
  await admin.close();
  await api.dispose();
});
