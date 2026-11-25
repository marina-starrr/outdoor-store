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
import { primaryVariant, variantGroups } from "../../../components/product-variants";
import { SHIP_CUTOFF_HOUR } from "../../../components/shop-config";
import { getPublicCatalog } from "../../../lib/server/catalog";
import { absoluteUrl, SITE_NAME } from "../../../lib/site";

/** Сторінка-заглушка для порожнього каталогу: Next вимагає хоча б один варіант, а такого товару немає (404) */
const NO_PRODUCTS_PARAM = { slug: "tents", id: "__catalog-empty" };

export async function generateStaticParams() {
  const params = (await getPublicCatalog()).map((p) => ({ slug: p.category, id: p.id }));
  // Порожній магазин (усі товари видалені) теж має збиратися
  return params.length ? params : [NO_PRODUCTS_PARAM];
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
  // Розміри й кольори одного товару — для Google одна сторінка (основний варіант)
  const group = variantGroups(await getPublicCatalog()).get(product.id);
  const canonical = group ? productUrl(primaryVariant(group)) : url;
  return {
    title: product.name,
    description,
    alternates: { canonical },
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
    // category не передаємо: Google чекає англомовну назву зі свого довідника, а «Рибалка» вважає недійсною
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
      // Доставка: по Україні, відправка в будні (до 14:00 — того ж дня), у дорозі 1–5 днів.
      // Вартість — за тарифами перевізника, тож shippingRate не вказуємо
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "UA" },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          businessDays: {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d) => `https://schema.org/${d}`),
          },
          cutoffTime: `${String(SHIP_CUTOFF_HOUR).padStart(2, "0")}:00:00+02:00`,
          handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
          transitTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 5, unitCode: "DAY" },
        },
      },
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
