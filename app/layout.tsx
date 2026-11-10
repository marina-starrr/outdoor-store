import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { AuthProvider } from "./components/Auth";
import { CartProvider } from "./components/Cart";
import CartDrawer from "./components/CartDrawer";
import { ListsProvider } from "./components/Lists";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Family Camping — спорядження для відпочинку",
  description:
    "Намети, рюкзаки, спальники та туристичний посуд з доставкою по Україні.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uk" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AuthProvider>
          <CartProvider>
            <ListsProvider>
              {children}
              <CartDrawer />
            </ListsProvider>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
