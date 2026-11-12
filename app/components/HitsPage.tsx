"use client";

/* eslint-disable @next/next/no-img-element -- фото товарів з Unsplash, як і в каталозі */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useCart } from "./Cart";
import Icon from "./Icon";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import { Breadcrumbs, CardActions, ProductCard, SortSelect } from "./catalog-ui";
import {
  categoryBySlug,
  discountPercent,
  formatPrice,
  productsWord,
  type CategorySlug,
  type Product,
} from "./catalog-data";
import { productReviews, productUrl } from "./product-details";
import { useCatalog } from "./Catalog";

const sortOptions = [
  { id: "sales", label: "Найпопулярніші" },
  { id: "rating", label: "За рейтингом" },
  { id: "cheap", label: "Спочатку дешевші" },
  { id: "expensive", label: "Спочатку дорожчі" },
  { id: "discount", label: "Найбільша знижка" },
] as const;
type SortId = (typeof sortOptions)[number]["id"];

const sorters: Record<SortId, (a: Product, b: Product) => number> = {
  sales: (a, b) => b.reviews - a.reviews,
  rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
  cheap: (a, b) => a.price - b.price,
  expensive: (a, b) => b.price - a.price,
  discount: (a, b) => discountPercent(b) - discountPercent(a),
};

/** Готовий набір із хітів для першої сімейної ночівлі */
const bundle: { id: string; qty: number }[] = [
  { id: "ch3", qty: 1 },
  { id: "sb-alpine", qty: 2 },
  { id: "ck-set", qty: 1 },
  { id: "fu-chair", qty: 2 },
  { id: "li-head", qty: 1 },
];

/** Усі розрахунки сторінки — з актуального каталогу (ціни й наявність з бази) */
export function computeHits(products: Product[], byId: ReadonlyMap<string, Product>) {
  /** Хіти: товари з позначкою «Хіт» або з великою кількістю відгуків (≈ продажів) */
  const hits = products
    .filter((p) => p.hit || p.reviews >= 60)
    .sort((a, b) => b.reviews - a.reviews);
  /** Місце в рейтингу продажів (1 — найпопулярніший) */
  const rankOf = new Map(hits.map((p, i) => [p.id, i + 1]));
  const totalReviews = hits.reduce((s, p) => s + p.reviews, 0);
  const avgRating = hits.length ? hits.reduce((s, p) => s + p.rating, 0) / hits.length : 0;
  // Набір — лише з товарів, які є в наявності
  const bundleItems = bundle.flatMap((b) => {
    const product = byId.get(b.id);
    return product?.inStock ? [{ ...b, product }] : [];
  });
  const bundleTotal = bundleItems.reduce((s, b) => s + b.product.price * b.qty, 0);
  const bundleOld = bundleItems.reduce((s, b) => s + (b.product.oldPrice ?? b.product.price) * b.qty, 0);
  /** Відгуки з п'ятьма зірками до трьох найпопулярніших хітів */
  const testimonials = hits.slice(0, 3).flatMap((p) => {
    const review = productReviews(p).find((r) => r.rating === 5);
    return review ? [{ product: p, review }] : [];
  });
  return { hits, rankOf, totalReviews, avgRating, bundleItems, bundleTotal, bundleOld, testimonials };
}

export default function HitsPage() {
  const router = useRouter();
  const { add, openCart } = useCart();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategorySlug | "all">("all");
  const [sort, setSort] = useState<SortId>("sales");
  const [saleOnly, setSaleOnly] = useState(false);
  const { products, byId } = useCatalog();
  const { hits, rankOf, totalReviews, avgRating, bundleItems, bundleTotal, bundleOld, testimonials } = useMemo(
    () => computeHits(products, byId),
    [products, byId],
  );

  const categories = useMemo(() => [...new Set(hits.map((p) => p.category))], [hits]);
  const visible = useMemo(
    () =>
      hits
        .filter((p) => (category === "all" || p.category === category) && (!saleOnly || p.oldPrice))
        .sort(sorters[sort]),
    [hits, category, saleOnly, sort],
  );

  const addBundle = () => {
    bundleItems.forEach((b) => add(b.id, b.qty));
    openCart();
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f7fafc] text-[#082c45]">
      <SiteHeader
        query={query}
        onQueryChange={setQuery}
        onSearchSubmit={(q) => router.push(`/catalog?q=${encodeURIComponent(q)}`)}
      />

      <main className="flex-1">
        {/* Банер */}
        <section className="relative isolate overflow-hidden bg-[linear-gradient(135deg,#067eb7_0%,#1eb6ed_100%)] text-white">
          <div className="pointer-events-none absolute -right-24 -top-32 -z-10 h-[420px] w-[420px] rounded-full bg-[#ffd51f]/30 blur-[100px]" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-40 left-10 -z-10 h-80 w-80 rounded-full bg-white/15 blur-[90px]" aria-hidden="true" />
          <div className="mx-auto max-w-[1440px] px-5 pb-14 pt-6 lg:px-8 lg:pb-16">
            <div className="[&_a]:text-white/75 [&_a:hover]:text-white [&_li]:text-white/75 [&_span[aria-current]]:text-white">
              <Breadcrumbs items={[{ label: "Головна", href: "/" }, { label: "Хіти продажу" }]} />
            </div>
            <div className="mt-8 grid items-end gap-10 lg:grid-cols-[1fr_auto]">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-black uppercase tracking-[0.16em] backdrop-blur">
                  <FlameIcon /> Вибір мандрівників
                </p>
                <h1 className="mt-5 text-[clamp(2.6rem,6vw,4.8rem)] font-black leading-[0.95] tracking-[-0.055em]">
                  Хіти <span className="text-[#ffff00]">продажу</span>
                </h1>
                <p className="mt-4 max-w-xl text-lg font-medium text-white/85">
                  Перевірене спорядження, яке найчастіше обирають родини для відпочинку на природі цього сезону.
                </p>
              </div>
              <dl className="grid grid-cols-3 gap-3 sm:gap-4">
                <Stat value={String(hits.length)} label={productsWord(hits.length)} />
                <Stat value={`★ ${avgRating.toFixed(1)}`} label="середній рейтинг" />
                <Stat value={totalReviews.toLocaleString("uk-UA").replace(/\s/g, " ")} label="відгуків" />
              </dl>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-[1440px] px-5 pb-20 lg:px-8">
          {/* Топ-3 */}
          <section className="-mt-6 lg:-mt-8" aria-labelledby="top3-title">
            <h2 id="top3-title" className="sr-only">Топ-3 тижня</h2>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {hits.slice(0, 3).map((p, i) => (
                <TopCard key={p.id} product={p} place={i + 1} onAdd={() => add(p.id)} />
              ))}
            </div>
          </section>

          {/* Усі хіти */}
          <section className="mt-16" aria-labelledby="all-hits">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Рейтинг продажів</p>
                <h2 id="all-hits" className="mt-1.5 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">
                  Усі хіти сезону
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-bold">
                  <span className="relative inline-flex">
                    <input type="checkbox" checked={saleOnly} onChange={(e) => setSaleOnly(e.target.checked)} className="peer sr-only" />
                    <span className="h-6 w-11 rounded-full bg-[#d5e5ef] transition peer-checked:bg-[#098fd0] peer-focus-visible:ring-4 peer-focus-visible:ring-sky-200" />
                    <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                  </span>
                  Зі знижкою
                </label>
                <SortSelect value={sort} options={sortOptions} onChange={setSort} />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Категорії">
              {(["all", ...categories] as const).map((c) => {
                const count = c === "all" ? hits.length : hits.filter((p) => p.category === c).length;
                return (
                  <button
                    key={c}
                    role="tab"
                    aria-selected={category === c}
                    onClick={() => setCategory(c)}
                    className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                      category === c ? "bg-[#082c45] text-white" : "bg-white text-[#264e65] shadow-[0_4px_14px_rgba(79,93,101,.08)] hover:bg-[#eef6fb]"
                    }`}
                  >
                    {c === "all" ? "Усі" : categoryBySlug[c].name}
                    <span className={`ml-1.5 text-xs ${category === c ? "text-white/70" : "text-[#8aa5b5]"}`}>{count}</span>
                  </button>
                );
              })}
            </div>

            {visible.length > 0 ? (
              <div className="mt-6 grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visible.map((p) => (
                  <div key={p.id} className="relative">
                    <span className="pointer-events-none absolute -left-2 -top-2 z-10 grid h-9 min-w-9 place-items-center rounded-full bg-[#082c45] px-2 text-xs font-black text-[#ffd51f] shadow-lg">
                      #{rankOf.get(p.id)}
                    </span>
                    <ProductCard product={p} showCategory onAdd={() => add(p.id)} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-6 rounded-[24px] bg-white px-6 py-12 text-center text-[#527083]">
                У цій категорії немає хітів зі знижкою.{" "}
                <button onClick={() => setSaleOnly(false)} className="font-bold text-[#098fd0] hover:underline">
                  Показати всі
                </button>
              </p>
            )}
          </section>

          {/* Готовий набір */}
          <section className="mt-20 overflow-hidden rounded-[28px] bg-[#082c45] text-white" aria-labelledby="bundle-title">
            <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ffd51f]">Готове рішення</p>
                <h2 id="bundle-title" className="mt-3 text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-4xl">
                  Набір для першої сімейної ночівлі
                </h2>
                <p className="mt-3 max-w-md text-white/75">
                  Ми зібрали хіти, які найчастіше купують разом: намет, два спальники, посуд, крісла та ліхтар. Додайте все одним кліком.
                </p>
                <div className="mt-6 flex flex-wrap items-baseline gap-3">
                  <span className="text-4xl font-black tracking-[-0.03em]">{formatPrice(bundleTotal)}</span>
                  {bundleOld > bundleTotal && (
                    <span className="text-lg font-semibold text-white/50 line-through">{formatPrice(bundleOld)}</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-[#7ee2a8]">
                  <Icon name="truck" className="mr-1.5 inline h-4 w-4 align-[-3px]" />
                  Безкоштовна доставка — сума більша за 3 000 ₴
                </p>
                <button
                  onClick={addBundle}
                  className="mt-6 inline-flex items-center gap-2.5 rounded-full bg-[#ffd51f] px-7 py-4 text-base font-extrabold text-[#082c45] shadow-[0_10px_26px_rgba(255,213,31,.3)] transition hover:-translate-y-0.5 hover:bg-[#ffe044]"
                >
                  <Icon name="cart" className="h-5 w-5" />
                  Додати весь набір у кошик
                </button>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {bundleItems.map(({ product, qty }) => (
                  <li key={product.id}>
                    <Link
                      href={productUrl(product)}
                      className="flex items-center gap-3 rounded-2xl bg-white/[0.07] p-3 transition hover:bg-white/[0.12]"
                    >
                      <img src={product.image} alt="" className="h-16 w-20 shrink-0 rounded-xl object-cover" loading="lazy" />
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-sm font-bold leading-snug">{product.name}</span>
                        <span className="mt-0.5 block text-xs text-white/60">
                          {qty > 1 ? `${qty} × ${formatPrice(product.price)}` : formatPrice(product.price)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Відгуки */}
          {testimonials.length > 0 && (
            <section className="mt-20" aria-labelledby="reviews-title">
              <p className="eyebrow">Відгуки покупців</p>
              <h2 id="reviews-title" className="mt-1.5 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">
                Чому їх обирають
              </h2>
              <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
                {testimonials.map(({ product, review }) => (
                  <figure key={review.id} className="flex flex-col rounded-[24px] bg-white p-6 shadow-[0_18px_52px_rgba(79,93,101,.08)]">
                    <span className="text-[#f5ad00]" aria-label="5 з 5">★★★★★</span>
                    <blockquote className="mt-3 flex-1 text-[15px] leading-relaxed text-[#264e65]">
                      «{review.text}»
                    </blockquote>
                    <figcaption className="mt-5 flex items-center gap-3 border-t border-[#e3edf3] pt-4">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e1f0f9] font-extrabold text-[#067eb7]">
                        {review.author[0]}
                      </span>
                      <span className="min-w-0 text-sm">
                        <b className="block">{review.author}, {review.city}</b>
                        <Link href={`${productUrl(product)}#reviews`} className="block truncate text-[#098fd0] hover:underline">
                          про {product.name}
                        </Link>
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/12 px-4 py-3 text-center backdrop-blur sm:px-6 sm:py-4">
      <dt className="sr-only">{label}</dt>
      <dd className="text-2xl font-black tracking-[-0.03em] sm:text-3xl">{value}</dd>
      <dd className="mt-0.5 text-xs font-semibold text-white/75">{label}</dd>
    </div>
  );
}

const placeStyles = [
  "bg-[#ffd51f] text-[#082c45]",
  "bg-[#dfe9f0] text-[#082c45]",
  "bg-[#f3c7a0] text-[#5a3410]",
];

function TopCard({ product, place, onAdd }: { product: Product; place: number; onAdd: () => void }) {
  const discount = discountPercent(product);
  return (
    <article className="product-card group relative flex flex-col !rounded-[26px] !p-2.5">
      <div className="relative">
        <Link href={productUrl(product)} tabIndex={-1} aria-hidden="true" className="block aspect-[16/10] overflow-hidden rounded-[20px] bg-sky-50">
          <img src={product.image} alt={product.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
        </Link>
        <span className={`absolute left-3 top-3 grid h-12 w-12 place-items-center rounded-full text-lg font-black shadow-lg ${placeStyles[place - 1]}`}>
          {place}
        </span>
        <CardActions productId={product.id} productName={product.name} />
      </div>
      <div className="flex flex-1 flex-col px-3 pb-2 pt-4">
        <p className="flex items-center justify-between gap-2 text-xs">
          <Link href={`/catalog/${product.category}`} className="font-bold uppercase tracking-[0.1em] text-[#098fd0] hover:underline">
            {categoryBySlug[product.category].name}
          </Link>
          <span className="font-bold text-[#527083]">
            <span className="text-[#f5ad00]">★</span> {product.rating.toFixed(1)} · {product.reviews} відгуків
          </span>
        </p>
        <h3 className="mt-2 text-lg font-extrabold leading-snug">
          <Link href={productUrl(product)} className="transition hover:text-[#098fd0]">
            {product.name}
          </Link>
        </h3>
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-2xl font-black">{formatPrice(product.price)}</span>
            {product.oldPrice && (
              <span className="text-sm font-semibold text-slate-400 line-through">{formatPrice(product.oldPrice)}</span>
            )}
            {discount > 0 && (
              <span className="rounded-full bg-[#fff4c2] px-2 py-0.5 text-xs font-extrabold text-[#8a6100]">−{discount}%</span>
            )}
          </div>
          <button
            onClick={onAdd}
            disabled={!product.inStock}
            aria-label={`Додати ${product.name} у кошик`}
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-[#ffd51f] px-5 text-sm font-extrabold shadow-[0_8px_20px_rgba(255,213,31,.3)] transition hover:-translate-y-0.5 hover:bg-[#ffe044] disabled:bg-[#e6eef3] disabled:text-[#8aa5b5] disabled:shadow-none"
          >
            <Icon name="cart" className="h-5 w-5" />
            <span className="hidden sm:inline">В кошик</span>
          </button>
        </div>
      </div>
    </article>
  );
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#ffd51f]" fill="currentColor" aria-hidden="true">
      <path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5.2.2 1.7 1 2.7 2 3.2-.5-3.4.2-6.5.5-9Z" />
    </svg>
  );
}
