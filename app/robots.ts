import type { MetadataRoute } from "next";
import { absoluteUrl, SITE_URL } from "./lib/site";

/**
 * /robots.txt. Службові сторінки (кошик, профіль, обране, порівняння)
 * закриті мета-тегом noindex — їх НЕ можна забороняти тут, інакше
 * пошукова система не побачить noindex. Забороняємо лише API та адмін-панель.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin"] },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_URL,
  };
}
