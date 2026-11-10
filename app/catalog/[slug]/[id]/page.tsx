import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductPage from "../../../components/ProductPage";
import { products } from "../../../components/catalog-data";
import {
  findProduct,
  productDescription,
  productGallery,
} from "../../../components/product-details";

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.category, id: p.id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/catalog/[slug]/[id]">): Promise<Metadata> {
  const { slug, id } = await params;
  const product = findProduct(slug, id);
  if (!product) return {};
  return {
    title: `${product.name} — Family Camping`,
    description: productDescription(product)[0],
    openGraph: { images: [productGallery(product)[0].full] },
  };
}

export default async function ProductRoute({
  params,
}: PageProps<"/catalog/[slug]/[id]">) {
  const { slug, id } = await params;
  const product = findProduct(slug, id);
  if (!product) notFound();

  // Структуровані дані для пошукових систем (ціна, наявність, рейтинг)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.id,
    brand: { "@type": "Brand", name: product.brand },
    image: productGallery(product).map((g) => g.full),
    description: productDescription(product).join(" "),
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: product.rating,
      reviewCount: product.reviews,
    },
    offers: {
      "@type": "Offer",
      priceCurrency: "UAH",
      price: product.price,
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/PreOrder",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <ProductPage product={product} />
    </>
  );
}
