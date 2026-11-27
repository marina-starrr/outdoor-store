import type { NextRequest } from "next/server";
import { slimProduct } from "../../../lib/catalog-seeds";
import { getCatalogAtVersion } from "../../../lib/server/catalog";

/**
 * Увесь каталог для браузера (пошук у шапці, кошик, обране, порівняння) — без
 * описів і фото-галерей. Адреса містить версію каталогу (її дає layout), тож файл
 * однієї версії незмінний: CDN і браузер тримають його скільки завгодно, а після
 * будь-якої зміни сторінки просять уже нову адресу.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/catalog/[version]">) {
  const { version } = await ctx.params;
  const v = Number(version);
  if (!Number.isSafeInteger(v) || v < 0) return new Response("Not found", { status: 404 });
  const products = (await getCatalogAtVersion(v)).map(slimProduct);
  return new Response(JSON.stringify({ products }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
