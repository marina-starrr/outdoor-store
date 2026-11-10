import type { Metadata } from "next";
import ComparePage from "../components/ComparePage";

export const metadata: Metadata = {
  title: "Порівняння товарів — Family Camping",
  robots: { index: false },
};

export default function Compare() {
  return <ComparePage />;
}
