import type { Metadata } from "next";
import { NOINDEX } from "../lib/site";
import ComparePage from "../components/ComparePage";

export const metadata: Metadata = {
  alternates: { canonical: "/compare" },
  robots: NOINDEX,
  title: "Порівняння товарів",
};

export default function Compare() {
  return <ComparePage />;
}
