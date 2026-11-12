/** Загальні дані сайту для SEO */

/**
 * Публічна адреса сайту — для sitemap, canonical та Open Graph.
 * На хостингу задайте NEXT_PUBLIC_SITE_URL=https://ваш-домен.ua
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

export const SITE_NAME = "Family Camping";

export const SITE_DESCRIPTION =
  "Онлайн-магазин туристичного спорядження для сімейного відпочинку: намети, рюкзаки, спальники, посуд і кемпінгові меблі з доставкою по Україні. Безкоштовна доставка від 3 000 ₴.";

/** Абсолютна адреса сторінки */
export const absoluteUrl = (path = "/") => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

/** Службові сторінки: не індексуються пошуковими системами */
export const NOINDEX = { index: false, follow: true } as const;
