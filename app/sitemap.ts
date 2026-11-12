import type { MetadataRoute } from "next";
import { categories } from "./components/catalog-data";
import { productGallery, productUrl } from "./components/product-details";
import { getPublicCatalog } from "./lib/server/catalog";
import { absoluteUrl } from "./lib/site";

/**
 * /sitemap.xml — усі сторінки, які варто індексувати: головна, каталог,
 * категорії, кожен товар (з фото) та інформаційні сторінки.
 * Кошик, профіль, обране, порівняння й адмін-панель сюди не входять.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getPublicCatalog();
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
    ...products.map((p) => ({
      url: absoluteUrl(productUrl(p)),
      changeFrequency: "weekly" as const,
      priority: 0.7,
      lastModified: p.updatedAt,
      images: [productGallery(p)[0].full],
    })),
    ...["/about", "/contacts", "/delivery", "/returns", "/privacy"].map((path) => ({
      url: absoluteUrl(path),
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  ];
  // lastModified без значення не виводимо
  return pages.map((e) => (e.lastModified ? e : { ...e, lastModified: undefined }));
}
