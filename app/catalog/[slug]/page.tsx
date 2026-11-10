import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CategoryListing from "../../components/CategoryListing";
import {
  categories,
  categoryBySlug,
  type CategorySlug,
} from "../../components/catalog-data";

export function generateStaticParams() {
  return categories.map((c) => ({ slug: c.slug }));
}

function getCategory(slug: string) {
  return slug in categoryBySlug ? categoryBySlug[slug as CategorySlug] : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/catalog/[slug]">): Promise<Metadata> {
  const category = getCategory((await params).slug);
  if (!category) return {};
  return {
    title: `${category.title} — Family Camping`,
    description: category.subtitle,
  };
}

export default async function CategoryPage({
  params,
}: PageProps<"/catalog/[slug]">) {
  const category = getCategory((await params).slug);
  if (!category) notFound();
  return <CategoryListing slug={category.slug} />;
}
