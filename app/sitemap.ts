import type { MetadataRoute } from "next";
import { categories } from "./components/catalog-data";
import { productGallery, productUrl } from "./components/product-details";
import { getPublicCatalog } from "./lib/server/catalog";
import { SELLER } from "./lib/seller";
import { returnsInfoEnabled } from "./components/shop-config";
import { primaryVariant, variantGroups } from "./components/product-variants";
import { absoluteUrl } from "./lib/site";
import { PLACEHOLDER_PHOTO } from "./components/photo";

/**
 * /sitemap.xml — усі сторінки, які варто індексувати: головна, каталог,
 * категорії, кожен товар (з фото) та інформаційні сторінки.
 * Кошик, профіль, обране, порівняння й адмін-панель сюди не входять.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getPublicCatalog();
  const groups = variantGroups(products);
  const lastProductUpdate = products
    .map((p) => p.updatedAt)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);

  const pages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/catalog"), changeFrequency: "daily", priority: 0.9, lastModified: lastProductUpdate },
    { url: absoluteUrl("/hits"), changeFrequency: "weekly", priority: 0.8, lastModified: lastProductUpdate },
    ...categories.map((c) => ({
      url: absoluteUrl(`/catalog/${c.slug}`),
      changeFrequency: "daily" as const,
      priority: 0.8,
      lastModified: products
        .filter((p) => p.category === c.slug && p.updatedAt)
        .map((p) => p.updatedAt!)
        .sort()
        .at(-1),
    })),
    // Інші розміри й кольори товару не додаємо — їхня canonical-адреса веде на основний варіант
    ...products.filter((p) => {
      const group = groups.get(p.id);
      return !group || primaryVariant(group).id === p.id;
    }).map((p) => ({
      url: absoluteUrl(productUrl(p)),
      changeFrequency: "weekly" as const,
      priority: 0.7,
      lastModified: p.updatedAt,
      // Google приймає лише повні адреси фото; заглушку «Фото скоро» не показуємо як фото товару
      images: [productGallery(p)[0].full].filter((src) => src !== PLACEHOLDER_PHOTO).map((src) => (src.startsWith("/") ? absoluteUrl(src) : src)),
    })),
    ...["/about", "/contacts", "/delivery", ...(returnsInfoEnabled() ? ["/returns"] : []), "/privacy", ...(SELLER ? ["/offer"] : [])].map((path) => ({
      url: absoluteUrl(path),
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  ];
  // lastModified без значення не виводимо
  return pages.map((e) => (e.lastModified ? e : { ...e, lastModified: undefined }));
}
