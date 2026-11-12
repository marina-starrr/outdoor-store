import type { Metadata } from "next";
import { NOINDEX } from "../lib/site";
import CartPage from "../components/CartPage";

export const metadata: Metadata = {
  alternates: { canonical: "/cart" },
  robots: NOINDEX,
  title: "Кошик",
};

export default function Cart() {
  return <CartPage />;
}
