import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { Suspense } from "react";
import { AuthProvider } from "./components/Auth";
import { CatalogProvider } from "./components/Catalog";
import { CartProvider } from "./components/Cart";
import CartDrawer from "./components/CartDrawer";
import { ListsProvider } from "./components/Lists";
import { NotificationsProvider } from "./components/Notifications";
import { getPublicCatalog } from "./lib/server/catalog";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./lib/site";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — спорядження для відпочинку`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    locale: "uk_UA",
    siteName: SITE_NAME,
    images: [{ url: "/family-camping-lake.webp", alt: "Сім’я відпочиває з наметом біля лісового озера" }],
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Каталог з бази (кешується; оновлюється після змін в адмін-панелі)
  const products = await getPublicCatalog();
  return (
    <html lang="uk" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full">
        <CatalogProvider products={products}>
          <AuthProvider>
            <NotificationsProvider>
              <CartProvider>
                <ListsProvider>
                  {children}
                  {/* Читає адресу сторінки (usePathname) — для маршрутів з параметрами потрібна межа Suspense */}
                  <Suspense fallback={null}>
                    <CartDrawer />
                  </Suspense>
                </ListsProvider>
              </CartProvider>
            </NotificationsProvider>
          </AuthProvider>
        </CatalogProvider>
      </body>
    </html>
  );
}
