import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { invalidateCatalog, loadCatalog } from "../../app/lib/server/catalog";
import { loadCatalogViaSnapshot } from "../../app/lib/server/catalog-snapshot";
import { dbQuery } from "./helpers";

/*
 * Знімок каталогу у сховищі файлів: сервери беруть каталог зі знімка (~250 КБ через CDN),
 * а не з бази (~2 МБ трафіку Supabase щоразу). Після будь-якої зміни — новий знімок
 */

const state = async () => (await dbQuery("select version, built_version, url from catalog_snapshot where id = 1"))[0];
const fileOf = (url: string) => join(process.env.FC_DATA_DIR!, "uploads", url.split("/").pop()!);

let productId = "";

beforeAll(async () => {
  productId = (await loadCatalog())[0].id;
});

describe("знімок каталогу", () => {
  it("перше читання — з бази, і зберігається знімок", async () => {
    const products = await loadCatalogViaSnapshot();
    expect(products.length).toBe((await loadCatalog()).length);
    const s = await state();
    expect(Number(s.built_version)).toBe(Number(s.version));
    expect(s.url).toMatch(/^\/api\/uploads\/catalog-v\d+-[a-f0-9]{12}\.json\.gz$/);
    expect(existsSync(fileOf(s.url))).toBe(true);
  });

  it("далі — зі знімка (зміна напряму в базі без invalidateCatalog не видна)", async () => {
    await dbQuery("update products set price = 7777 where id = $1", [productId]);
    const p = (await loadCatalogViaSnapshot()).find((x) => x.id === productId)!;
    expect(p.price).not.toBe(7777);
  });

  it("після invalidateCatalog — новий знімок з новими даними, старий файл видалено", async () => {
    const before = await state();
    await invalidateCatalog();
    expect(Number((await state()).version)).toBe(Number(before.version) + 1);
    const p = (await loadCatalogViaSnapshot()).find((x) => x.id === productId)!;
    expect(p.price).toBe(7777);
    const after = await state();
    expect(after.url).not.toBe(before.url);
    expect(Number(after.built_version)).toBe(Number(after.version));
    expect(existsSync(fileOf(before.url))).toBe(false);
    expect(existsSync(fileOf(after.url))).toBe(true);
  });

  it("знімка немає (файл зник) — каталог з бази, без помилки", async () => {
    const s = await state();
    await dbQuery("update catalog_snapshot set url = $1 where id = 1", ["/api/uploads/catalog-v1-000000000000.json.gz"]);
    await dbQuery("update products set price = 8888 where id = $1", [productId]);
    const p = (await loadCatalogViaSnapshot()).find((x) => x.id === productId)!;
    expect(p.price).toBe(8888);
    expect((await state()).url).not.toBe(s.url);
  });
});
