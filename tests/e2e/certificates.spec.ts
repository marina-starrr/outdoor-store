import { expect, test, type APIRequestContext } from "@playwright/test";
import { expectNoHorizontalScroll, helperAdminApi } from "./helpers";

/*
 * Сертифікати на ножі: ніж без висновку експерта не показується; адміністратор
 * завантажує PDF у вікні «Сертифікати ножів» (товар підбирається за назвою файлу),
 * після чого на сторінці ножа є посилання на документ.
 */
test.describe.configure({ mode: "serial" });

const KNIFE = { id: "nizh-e2e-zx4417", name: "Ніж складаний E2E ZX4417 чорний" };
const SHEATH = { id: "chokhol-e2e-zx4417", name: "Чохол для ножа E2E ZX4417" };
let api: APIRequestContext;

const knife = (p: { id: string; name: string }) => ({
  ...p,
  brand: "Ganzo",
  category: "knives",
  price: 1450,
  stock: 6,
  specs: "Складаний · 8,5 см",
  photo: "campfire",
  images: [],
  attrs: [],
});

test.beforeAll(async ({ baseURL }) => {
  api = await helperAdminApi(baseURL!);
  for (const p of [KNIFE, SHEATH]) expect((await api.post("/api/admin/products", { data: knife(p) })).ok()).toBe(true);
});
test.afterAll(async () => api?.dispose());

test("ніж без сертифіката не видно покупцям, чохол — видно", async ({ page }) => {
  expect((await page.goto(`/catalog/knives/${KNIFE.id}`))!.status()).toBe(404);
  expect((await page.goto(`/catalog/knives/${SHEATH.id}`))!.status()).toBe(200);
  await expect(page.getByTestId("product-certificate")).toHaveCount(0);
});

test("адмін завантажує сертифікат — ніж з'являється з посиланням на документ", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: await api.storageState() });
  const admin = await ctx.newPage();
  await admin.goto(`${baseURL}/admin/products?stock=nocert`);
  const row = admin.getByTestId(`admin-product-${KNIFE.id}`);
  await expect(row).toContainText("Без сертифіката");
  await expect(admin.getByTestId(`admin-product-${SHEATH.id}`)).toHaveCount(0);

  await admin.getByRole("button", { name: "Сертифікати ножів" }).click();
  const panel = admin.getByRole("dialog", { name: "Сертифікати ножів" });
  await expect(panel.getByTestId("missing-certificates")).toContainText(KNIFE.name);

  await panel.getByLabel("Файли сертифікатів").setInputFiles({
    name: "Висновок ZX4417.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% e2e certificate\n%%EOF\n"),
  });
  const file = panel.getByTestId("certificate-file");
  await expect(file.getByRole("checkbox", { name: KNIFE.name })).toBeChecked();
  await panel.getByRole("button", { name: "Зберегти сертифікати (1)" }).click();
  await expect(file.getByText("Збережено")).toBeVisible();
  // Ніж зник зі списку «без сертифіката» (порожній список не показується зовсім)
  await expect(panel.getByTestId("missing-certificates").filter({ hasText: KNIFE.name })).toHaveCount(0);
  await admin.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(row).toHaveCount(0); // фільтр «Без сертифіката» — ніж уже не в ньому
  await ctx.close();

  // Покупець бачить ніж і документ — на ноутбуці, планшеті й телефоні
  for (const viewport of [{ width: 1440, height: 900 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    expect((await page.goto(`${baseURL}/catalog/knives/${KNIFE.id}`))!.status()).toBe(200);
    // Під час потокового рендерингу Next тимчасово тримає прихований дублікат — беремо видимий
    const link = page.getByTestId("product-certificate").filter({ visible: true });
    await expect(link).toBeVisible();
    await expect(link).toContainText("Не є холодною зброєю");
    const href = await link.getAttribute("href");
    expect(href).toMatch(/\/api\/uploads\/cert-[a-z0-9-]+\.pdf$/);
    const doc = await page.request.get(href!);
    expect(doc.headers()["content-type"]).toBe("application/pdf");
    await expectNoHorizontalScroll(page);
    await page.close();
  }
});

test("картка товару: документ можна прибрати — ніж знову ховається", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: await api.storageState() });
  const admin = await ctx.newPage();
  await admin.goto(`${baseURL}/admin/products?edit=${KNIFE.id}`);
  const manager = admin.getByTestId("certificate-manager");
  await expect(manager).toContainText("Є документ");
  await manager.getByRole("button", { name: "Прибрати документ" }).click();
  await expect(manager).toContainText("Документа немає");
  await ctx.close();

  const page = await browser.newPage();
  expect((await page.goto(`${baseURL}/catalog/knives/${KNIFE.id}`))!.status()).toBe(404);
  await page.close();
});
