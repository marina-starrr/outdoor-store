import type { Metadata } from "next";
import CatalogOverview from "../components/CatalogOverview";
import { CatalogSeed } from "../components/Catalog";
import { overviewSeed } from "../lib/catalog-seeds";
import { getPublicCatalog } from "../lib/server/catalog";

export const metadata: Metadata = {
  alternates: { canonical: "/catalog" },
  title: "Каталог товарів",
  description:
    "Намети, рюкзаки, спальники, туристичний посуд, кемпінгові меблі, ліхтарі та мангали з доставкою по Україні.",
};

export default async function CatalogPage() {
  return (
    <CatalogSeed products={overviewSeed(await getPublicCatalog())}>
      <CatalogOverview />
    </CatalogSeed>
  );
}
