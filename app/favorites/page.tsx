import type { Metadata } from "next";
import { NOINDEX } from "../lib/site";
import FavoritesPage from "../components/FavoritesPage";

export const metadata: Metadata = {
  alternates: { canonical: "/favorites" },
  robots: NOINDEX,
  title: "Обране",
};

export default function Favorites() {
  return <FavoritesPage />;
}
