import type { Metadata } from "next";
import FavoritesPage from "../components/FavoritesPage";

export const metadata: Metadata = {
  title: "Обране — Family Camping",
  robots: { index: false },
};

export default function Favorites() {
  return <FavoritesPage />;
}
