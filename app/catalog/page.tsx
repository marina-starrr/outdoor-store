import type { Metadata } from "next";
import CatalogOverview from "../components/CatalogOverview";

export const metadata: Metadata = {
  alternates: { canonical: "/catalog" },
  title: "Каталог товарів",
  description:
    "Намети, рюкзаки, спальники, туристичний посуд, кемпінгові меблі, ліхтарі та мангали з доставкою по Україні.",
};

export default function CatalogPage() {
  return <CatalogOverview />;
}
