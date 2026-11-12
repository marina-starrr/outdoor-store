import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import PageSkeleton from "../../../components/PageSkeleton";
import JsonLd from "../../../components/JsonLd";
import ProductPage from "../../../components/ProductPage";
import { categoryBySlug } from "../../../components/catalog-data";
import {
  findProduct,
  productDescription,
  productGallery,
  productUrl,
} from "../../../components/product-details";
import { getPublicCatalog } from "../../../lib/server/catalog";
import { absoluteUrl, SITE_NAME } from "../../../lib/site";

export async function generateStaticParams() {
  return (await getPublicCatalog()).map((p) => ({ slug: p.category, id: p.id }));
}

async function getProduct(params: PageProps<"/catalog/[slug]/[id]">["params"]) {
  const { slug, id } = await params;
  return findProduct(await getPublicCatalog(), slug, id);
}

export async function generateMetadata({ params }: PageProps<"/catalog/[slug]/[id]">): Promise<Metadata> {
  const product = await getProduct(params);
  if (!product) return {};
  const description = productDescription(product)[0].slice(0, 300);
  const url = productUrl(product);
  return {
    title: product.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: `${product.name} — ${SITE_NAME}`,
      description,
      images: [{ url: productGallery(product)[0].full, alt: product.name }],
    },
  };
}

/**
 * params читаються всередині Suspense: товари зі списку generateStaticParams
 * однаково потрапляють у статичний HTML, а нові (додані в адмін-панелі) —
 * показують заглушку, поки сторінка рендериться вперше
 */
export default function ProductRoute({ params }: PageProps<"/catalog/[slug]/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProductContent params={params} />
    </Suspense>
  );
}

async function ProductContent({ params }: Pick<PageProps<"/catalog/[slug]/[id]">, "params">) {
  const product = await getProduct(params);
  if (!product) notFound();
  const category = categoryBySlug[product.category];

  // Структуровані дані для пошукових систем (ціна, наявність, рейтинг, хлібні крихти)
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.id,
    url: absoluteUrl(productUrl(product)),
    brand: { "@type": "Brand", name: product.brand },
    category: category.name,
    image: productGallery(product).map((g) => g.full),
    description: productDescription(product).join(" "),
    // Google приймає рейтинг лише за наявності відгуків (у нового товару їх ще немає)
    ...(product.reviews > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating, reviewCount: product.reviews } }
      : {}),
    offers: {
      "@type": "Offer",
      url: absoluteUrl(productUrl(product)),
      priceCurrency: "UAH",
      price: product.price,
      itemCondition: "https://schema.org/NewCondition",
      availability: product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };
  const breadcrumbsLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { name: "Головна", path: "/" },
      { name: "Каталог", path: "/catalog" },
      { name: category.name, path: `/catalog/${category.slug}` },
      { name: product.name, path: productUrl(product) },
    ].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absoluteUrl(c.path) })),
  };

  return (
    <>
      <JsonLd data={[productLd, breadcrumbsLd]} />
      <ProductPage product={product} />
    </>
  );
}
