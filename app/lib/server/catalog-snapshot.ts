import "server-only";
import { randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import type { Product } from "../../components/catalog-data";
import { loadCatalog } from "./catalog";
import { sql } from "./db";
import { deleteCatalogFile, readCatalogFile, saveCatalogFile, uploadsEnabled } from "./photo-storage";

/*
 * Знімок каталогу — стиснутий JSON у сховищі файлів (Supabase Storage, кошик catalog).
 *
 * Навіщо: кожен сервер Vercel тримає каталог у власній пам'яті й при кожному
 * запуску / оновленні кешу читав його з бази — ~2 МБ трафіку Supabase щоразу
 * (десятки разів на годину; Free — 5 ГБ на місяць). Знімок — ~250 КБ і віддається
 * через CDN сховища, а з бази читається лише номер версії (кілька байтів).
 *
 * Як працює:
 * - будь-яка зміна товарів, відгуків, замовлень викликає invalidateCatalog() →
 *   bumpCatalogVersion(): version + 1;
 * - сервер, якому потрібен каталог, читає (version, built_version, url):
 *   знімок актуальний → бере його; ні → читає каталог з бази один раз і зберігає
 *   новий знімок (інші сервери далі беруть уже його);
 * - будь-яка помилка зі знімком → каталог з бази, як раніше. До міграції
 *   20261128000000_catalog_snapshot.sql (таблиці ще немає) — теж з бази.
 *
 * Зміни, зроблені напряму в SQL Editor, з'являться після наступної зміни через сайт
 * (щогодинне оновлення постачальників робить це щогодини).
 */

const isMissingTable = (e: unknown) => (e as { code?: string })?.code === "42P01";

type State = { version: number; builtVersion: number; url: string | null };

async function readState(): Promise<State | null> {
  try {
    const [row] = await sql("select version, built_version, url from catalog_snapshot where id = 1");
    return row ? { version: Number(row.version), builtVersion: Number(row.built_version), url: row.url ?? null } : null;
  } catch (e) {
    if (isMissingTable(e)) return null;
    throw e;
  }
}

/** Каталог: зі знімка, якщо він актуальний; інакше з бази (і новий знімок) */
export async function loadCatalogViaSnapshot(): Promise<Product[]> {
  if (!uploadsEnabled()) return loadCatalog();
  let state: State | null;
  try {
    state = await readState();
  } catch (e) {
    console.error("[знімок каталогу] не вдалося прочитати версію", e);
    return loadCatalog();
  }
  if (!state) return loadCatalog();

  if (state.url && state.builtVersion === state.version) {
    try {
      const products = JSON.parse(gunzipSync(await readCatalogFile(state.url)).toString("utf8"));
      if (Array.isArray(products)) return products as Product[];
    } catch (e) {
      console.error("[знімок каталогу] не вдалося прочитати файл — каталог з бази", e);
    }
  }

  const products = await loadCatalog();
  await publishSnapshot(state, products).catch((e) => console.error("[знімок каталогу] не вдалося зберегти", e));
  return products;
}

/** Зберігає знімок для версії state.version (якщо за цей час версія не змінилась) */
async function publishSnapshot(state: State, products: Product[]) {
  const name = `catalog-v${state.version}-${randomBytes(6).toString("hex")}.json.gz`;
  const url = await saveCatalogFile(name, gzipSync(JSON.stringify(products), { level: 9 }));
  const updated = await sql(
    "update catalog_snapshot set built_version = $1, url = $2, built_at = now() where id = 1 and version = $1 returning id",
    [state.version, url],
  );
  // Поки збирали, каталог знову змінився — цей знімок уже застарів
  if (!updated.length) return deleteCatalogFile(url);
  if (state.url && state.url !== url) await deleteCatalogFile(state.url).catch(() => {});
}

/** Каталог змінився — наступне читання збере новий знімок */
export async function bumpCatalogVersion() {
  try {
    await sql("update catalog_snapshot set version = version + 1 where id = 1");
  } catch (e) {
    if (!isMissingTable(e)) console.error("[знімок каталогу] не вдалося позначити зміну", e);
  }
}
