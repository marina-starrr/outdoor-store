import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { Suspense } from "react";
import { AuthProvider } from "./components/Auth";
import { CatalogProvider } from "./components/Catalog";
import { CartProvider } from "./components/Cart";
import CartDrawer from "./components/CartDrawer";
import ChatWidget from "./components/ChatWidget";
import { ListsProvider } from "./components/Lists";
import { NotificationsProvider } from "./components/Notifications";
import SiteAnalytics from "./components/SiteAnalytics";
import { getCatalogVersion } from "./lib/server/catalog";
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
    images: [{ url: "/family-camping-autumn-og.jpg", width: 1200, height: 630, alt: "Родина з собакою біля вогнища й намету в осінньому лісі" }],
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Каталогу в layout немає: кожна сторінка передає лише свої товари (CatalogSeed),
  // увесь каталог браузер довантажує з /api/catalog/<версія> (див. Catalog.tsx)
  const catalogVersion = await getCatalogVersion();
  return (
    <html lang="uk" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full">
        <CatalogProvider version={catalogVersion}>
          <AuthProvider>
            <NotificationsProvider>
              <CartProvider>
                <ListsProvider>
                  {children}
                  {/* Читає адресу сторінки (usePathname) — для маршрутів з параметрами потрібна межа Suspense */}
                  <Suspense fallback={null}>
                    <CartDrawer />
                  </Suspense>
                  {/* Чат з консультантом на кожній сторінці (крім адмін-панелі) */}
                  <Suspense fallback={null}>
                    <ChatWidget />
                  </Suspense>
                  {/* Статистика відвідувань (Vercel Web Analytics, без cookie) — лише на Vercel: локально її скрипта немає */}
                  {process.env.VERCEL && (
                    <Suspense fallback={null}>
                      <SiteAnalytics />
                    </Suspense>
                  )}
                </ListsProvider>
              </CartProvider>
            </NotificationsProvider>
          </AuthProvider>
        </CatalogProvider>
      </body>
    </html>
  );
}
