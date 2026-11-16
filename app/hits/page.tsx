import type { Metadata } from "next";
import HitsPage from "../components/HitsPage";
import { getHitTestimonials } from "../lib/server/catalog";

export const metadata: Metadata = {
  alternates: { canonical: "/hits" },
  title: "Хіти продажу",
  description:
    "Популярне туристичне спорядження для сімейного відпочинку: намети, спальники, рюкзаки, посуд і ліхтарі з доставкою по Україні.",
};

export default async function Hits() {
  return <HitsPage testimonials={await getHitTestimonials()} />;
}
