import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import PageSkeleton from "../../components/PageSkeleton";
import CategoryListing from "../../components/CategoryListing";
import JsonLd from "../../components/JsonLd";
import { categories, categoryBySlug, isCategorySlug } from "../../components/catalog-data";
import { absoluteUrl } from "../../lib/site";

export function generateStaticParams() {
  return categories.map((c) => ({ slug: c.slug }));
}

const getCategory = (slug: string) => (isCategorySlug(slug) ? categoryBySlug[slug] : null);

export async function generateMetadata({ params }: PageProps<"/catalog/[slug]">): Promise<Metadata> {
  const category = getCategory((await params).slug);
  if (!category) return {};
  const url = `/catalog/${category.slug}`;
  const description = `${category.subtitle} ${category.name} з доставкою по Україні — фільтри за ціною та брендом, відгуки покупців, безкоштовна доставка від 3 000 ₴.`;
  return {
    title: category.title,
    description,
    // Сторінки з фільтрами (?brand=…) — дублікати; канонічна — без параметрів
    alternates: { canonical: url },
    openGraph: { url, title: category.title, description, images: [{ url: category.image, alt: category.name }] },
  };
}

export default function CategoryPage({ params }: PageProps<"/catalog/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CategoryContent params={params} />
    </Suspense>
  );
}

async function CategoryContent({ params }: Pick<PageProps<"/catalog/[slug]">, "params">) {
  const category = getCategory((await params).slug);
  if (!category) notFound();
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { name: "Головна", path: "/" },
            { name: "Каталог", path: "/catalog" },
            { name: category.name, path: `/catalog/${category.slug}` },
          ].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absoluteUrl(c.path) })),
        }}
      />
      <CategoryListing slug={category.slug} />
    </>
  );
}
