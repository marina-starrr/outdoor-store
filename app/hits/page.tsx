import type { Metadata } from "next";
import HitsPage from "../components/HitsPage";

export const metadata: Metadata = {
  alternates: { canonical: "/hits" },
  title: "Хіти продажу",
  description:
    "Найпопулярніше туристичне спорядження сезону: намети, спальники, рюкзаки, посуд і ліхтарі з найкращими відгуками покупців.",
};

export default function Hits() {
  return <HitsPage />;
}
