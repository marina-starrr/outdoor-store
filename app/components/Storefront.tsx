"use client";

/* eslint-disable @next/next/no-img-element -- зображення з Unsplash та фон hero потребують CSS-фільтрів/масок як у макеті */
import Link from "next/link";
import { useMemo, useState } from "react";
import { useCart } from "./Cart";
import Icon from "./Icon";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import RecentlyViewed from "./RecentlyViewed";
import { useCatalog } from "./Catalog";
import { discountPercent, formatPrice } from "./catalog-data";
import { categories, products as showcase } from "./data";
import { productUrl } from "./product-details";
import { CardActions } from "./catalog-ui";

export default function Storefront() {
  const [query, setQuery] = useState("");
  const { add: addToCart } = useCart();
  const { byId } = useCatalog();

  // Вітрина: фото й підписи — свої, а назва, ціна й наявність — з каталогу (бази)
  const products = useMemo(
    () =>
      showcase.flatMap((s) => {
        const live = byId.get(s.id);
        if (!live) return [];
        return [{
          ...s,
          name: live.name,
          price: formatPrice(live.price),
          oldPrice: live.oldPrice ? formatPrice(live.oldPrice) : undefined,
          // Знижка рахується з актуальних цін; без знижки «−15%» / «Акція» не показуємо
          badge: live.oldPrice ? `−${discountPercent(live)}%` : s.badge === "Хіт" ? s.badge : undefined,
          href: productUrl(live),
        }];
      }),
    [byId],
  );

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("uk");
    return normalized
      ? products.filter((product) =>
          `${product.name} ${product.category}`
            .toLocaleLowerCase("uk")
            .includes(normalized),
        )
      : products;
  }, [query, products]);

  return (
    <div className="min-h-screen bg-[#f7fafc] text-[#082c45]">
      <SiteHeader
        query={query}
        onQueryChange={setQuery}
        onSearchFocus={() =>
          document
            .querySelector("#products")
            ?.scrollIntoView({ behavior: "smooth" })
        }
      />

      <main>
        {/* Hero */}
        <section className="relative isolate min-h-[680px] overflow-hidden bg-[#063e62] lg:min-h-[720px]">
          <img
            src="/family-camping-lake.webp"
            alt="Сім’я відпочиває з наметом на зеленій галявині біля лісового озера"
            className="absolute inset-0 -z-20 h-full w-full object-cover object-center brightness-[1.04] saturate-[1.08]"
            fetchPriority="high"
          />

          <div className="mx-auto flex min-h-[680px] max-w-[1440px] items-center justify-center px-5 pb-36 pt-24 text-center lg:min-h-[720px] lg:px-8">
            <div>
              <h1 className="hero-family-title text-[clamp(4rem,10vw,9rem)] font-black leading-[0.82] tracking-[-0.075em] text-white">
                Family
                <span className="mt-3 block text-[#ffff00]">Camping</span>
              </h1>
              <Link
                href="/catalog"
                className="mt-10 inline-flex items-center justify-center gap-3 rounded-full bg-[#ffff00] px-7 py-4 text-sm font-extrabold text-[#082c45] shadow-[0_14px_38px_rgba(255,255,0,.35)] transition hover:-translate-y-1 hover:bg-[#ffff4d] sm:px-9 sm:py-5"
              >
                Перейти до каталогу
                <Icon name="arrow" className="h-5 w-5" />
              </Link>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 border-t border-white/15 bg-[#067eb7]">
            <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-4 px-5 py-4 text-xs font-bold text-white sm:grid-cols-3 lg:px-8">
              <div className="flex items-center gap-2.5">
                <Icon name="truck" className="h-5 w-5 text-[#3ed8ff]" />
                Швидка доставка
              </div>
              <div className="hidden items-center gap-2.5 sm:flex">
                <Icon name="shield" className="h-5 w-5 text-[#3ed8ff]" />
                Гарантія якості
              </div>
              <div className="hidden items-center gap-2.5 sm:flex">
                <Icon name="headset" className="h-5 w-5 text-[#3ed8ff]" />
                Допомога у виборі
              </div>
            </div>
          </div>
        </section>

        {/* Категорії */}
        <section
          id="categories"
          className="relative isolate overflow-hidden bg-[#fcfbe6] py-20 text-[#082c45] lg:py-28"
        >
          <div
            className="pointer-events-none absolute -right-32 -top-44 -z-10 h-[560px] w-[560px] rounded-full bg-[#ffe97a]/45 blur-[110px]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute left-[4%] top-24 -z-10 h-64 w-64 rounded-full bg-[#7ed7ff]/16 blur-[100px]"
            aria-hidden="true"
          />

          <div className="relative mx-auto max-w-[1440px] px-5 lg:px-8">
            <div className="category-heading">
              <div>
                <p>З чого почати</p>
                <h2 className="text-[#209fdb]">
                  <span className="text-[#082c45]">Обирай</span> свою пригоду
                </h2>
              </div>
              <p className="text-lg font-semibold text-[#263e4a]">
                Усе необхідне для комфортного відпочинку на природі — від
                першого кроку до вершини.
              </p>
            </div>

            <div className="relative z-10 mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {categories.map((category, index) => (
                <a
                  href={category.href}
                  key={category.name}
                  className="category-card group"
                  onClick={() => setQuery(category.name)}
                >
                  <span className="category-number">0{index + 1}</span>
                  <div className="category-product">
                    <span aria-hidden="true" />
                    <img src={category.image} alt={category.alt} loading="lazy" />
                  </div>
                  <div className="relative z-10 mt-auto">
                    <h3>{category.name}</h3>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <span className="category-price">{category.meta}</span>
                      <span className="category-arrow">
                        <Icon name="arrow" className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* Хіти продажу */}
        <section id="products" className="scroll-mt-24 bg-white py-20 lg:py-28">
          <div className="mx-auto max-w-[1440px] px-5 lg:px-8">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Вибір мандрівників</p>
                <h2>
                  Хіти <span>продажу</span>
                </h2>
              </div>
              <p>
                {query
                  ? `Результати пошуку за запитом «${query}»`
                  : "Перевірене спорядження, яке обирають наші покупці цього сезону."}
                <Link href="/hits" className="mt-3 flex items-center gap-2 font-extrabold text-[#098fd0] hover:underline">
                  Усі хіти продажу <Icon name="arrow" className="h-4 w-4" />
                </Link>
              </p>
            </div>

            {filteredProducts.length > 0 ? (
              <div className="mt-10 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                {filteredProducts.map((product) => (
                  <article key={product.id} className="product-card group">
                    <div className="relative aspect-[4/4.4] overflow-hidden rounded-[22px] bg-sky-50">
                      <img
                        src={product.image}
                        alt={product.alt}
                        loading="lazy"
                        className="h-full w-full object-cover brightness-[1.08] saturate-[1.12] transition duration-700 group-hover:scale-105"
                      />
                      {product.badge && (
                        <span className="absolute left-4 top-4 rounded-full bg-[#ffd51f] px-3 py-1.5 text-xs font-black text-[#082c45]">
                          {product.badge}
                        </span>
                      )}
                      <CardActions productId={product.id} productName={product.name} />
                    </div>
                    <div className="px-1 pb-1 pt-5">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#098fd0]">
                        {product.category}
                      </p>
                      <h3 className="mt-2 text-lg font-extrabold">
                        <Link href={product.href} className="transition hover:text-[#098fd0]">
                          {product.name}
                        </Link>
                      </h3>
                      <div className="mt-5 flex items-end justify-between gap-3">
                        <div>
                          {product.oldPrice && (
                            <p className="text-xs font-semibold text-slate-400 line-through">
                              {product.oldPrice}
                            </p>
                          )}
                          <p className="text-xl font-black">{product.price}</p>
                        </div>
                        <button
                          onClick={() => addToCart(product.id)}
                          className="grid h-12 w-12 place-items-center rounded-[15px] bg-[#ffd51f] text-[#082c45] shadow-[0_8px_20px_rgba(255,213,31,.3)] transition hover:-translate-y-1 hover:bg-[#ffe044]"
                          aria-label={`Додати ${product.name} у кошик`}
                        >
                          <Icon name="cart" className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-10 rounded-[28px] bg-sky-50 px-6 py-16 text-center">
                <p className="text-xl font-extrabold">Нічого не знайдено</p>
                <button
                  onClick={() => setQuery("")}
                  className="mt-4 font-bold text-[#098fd0] underline underline-offset-4"
                >
                  Очистити пошук
                </button>
              </div>
            )}

            <RecentlyViewed />
          </div>
        </section>

        {/* CTA-банер */}
        <section
          id="about"
          className="relative isolate overflow-hidden bg-[linear-gradient(135deg,#1eb6ed_0%,#65d6ff_100%)]"
        >
          <svg
            className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-20"
            viewBox="0 0 1440 260"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
          >
            <g fill="white">
              <path d="M86 82c6-25 27-42 53-42 22 0 41 13 49 32 7-4 15-6 24-6 27 0 49 20 52 46H73c1-12 5-22 13-30Z" />
              <path d="M935 58c5-18 22-31 42-31 17 0 32 10 39 25 6-3 12-5 19-5 22 0 40 16 43 37H923c1-10 5-19 12-26Z" />
              <path d="M1205 160c7-27 30-46 59-46 24 0 45 14 54 35 8-4 17-7 27-7 30 0 54 22 57 51h-211c1-13 6-24 14-33Z" />
            </g>
          </svg>
          <div className="relative mx-auto grid max-w-[1440px] items-center gap-10 px-5 py-14 lg:grid-cols-[1fr_auto] lg:px-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/85">
                Готові до нових вражень?
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
                Збирайте рюкзак. Решта — за нами.
              </h2>
            </div>
            <a
              href="#categories"
              className="inline-flex items-center justify-center gap-3 rounded-full bg-[#ffff04] px-7 py-4 text-sm font-extrabold text-[#063e62] transition hover:-translate-y-1 hover:bg-[#ffff4a]"
            >
              Обрати спорядження <Icon name="arrow" className="h-5 w-5" />
            </a>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
