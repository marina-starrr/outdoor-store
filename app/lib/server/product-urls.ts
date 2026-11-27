import "server-only";
import { CERTIFICATE_CATEGORIES, isListed } from "../certificates";
import { seedsCatalog, sql } from "./db";

/*
 * Адреси видимих товарів «категорія/код» — для proxy.ts (справжній 404).
 * Кеш спільний для процесу і скидається при зміні каталогу (invalidateCatalog);
 * на хостингу з кількома екземплярами — не довше ніж URLS_TTL.
 * Окремий модуль, щоб proxy не підтягував кеш сторінок ('use cache').
 */

const URLS_TTL = 10_000;
const g = globalThis as { __fcProductUrls?: { at: number; urls: Promise<Set<string> | null> } };

/**
 * null — вбудована база ще порожня, а початковий каталог з'явиться при першому
 * зверненні сайту (лише тести й розробка). На справжній базі — завжди список, хоч і порожній
 */
export function productUrls(): Promise<Set<string> | null> {
  const c = g.__fcProductUrls;
  if (c && Date.now() - c.at < URLS_TTL) return c.urls;
  const urls = (async () => {
    // Назва й сертифікат — лише для категорій, де потрібен документ (менше трафіку бази)
    const rows = await sql(
      `select category, id,
              case when category = any($1::text[]) then name end as name,
              case when category = any($1::text[]) then certificate end as certificate,
              certificate_exempt
       from products p where not hidden`,
      [CERTIFICATE_CATEGORIES],
    );
    const any = rows.length > 0;
    // Ніж без сертифіката — так само 404, як прихований товар
    const listed = rows.filter((r) =>
      isListed({ category: r.category, name: r.name ?? "", certificate: r.certificate ?? undefined, certificateExempt: r.certificate_exempt === true }),
    );
    return any || !seedsCatalog() ? new Set(listed.map((r) => `${r.category}/${r.id}`)) : null;
  })();
  g.__fcProductUrls = { at: Date.now(), urls };
  urls.catch(() => delete g.__fcProductUrls);
  return urls;
}

export function resetProductUrls() {
  delete g.__fcProductUrls;
}
