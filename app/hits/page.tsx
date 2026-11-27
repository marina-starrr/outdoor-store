import type { Metadata } from "next";
import HitsPage from "../components/HitsPage";
import { CatalogSeed } from "../components/Catalog";
import { hitsSeed } from "../lib/catalog-seeds";
import { getHitTestimonials, getPublicCatalog } from "../lib/server/catalog";

export const metadata: Metadata = {
  alternates: { canonical: "/hits" },
  title: "Хіти продажу",
  description:
    "Популярне туристичне спорядження для сімейного відпочинку: намети, спальники, рюкзаки, посуд і ліхтарі з доставкою по Україні.",
};

export default async function Hits() {
  const testimonials = await getHitTestimonials();
  const seed = hitsSeed(await getPublicCatalog(), testimonials.map((t) => t.productId));
  return (
    <CatalogSeed products={seed}>
      <HitsPage testimonials={testimonials} />
    </CatalogSeed>
  );
}
