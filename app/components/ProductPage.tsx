"use client";

/* eslint-disable @next/next/no-img-element -- фото товарів з Unsplash, як і в каталозі */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./Auth";
import { useCart } from "./Cart";
import { useLists } from "./Lists";
import { useNotifications } from "./Notifications";
import RecentlyViewed, { useTrackView } from "./RecentlyViewed";
import { FREE_SHIPPING_FROM, RETURN_DAYS, deliveryOptions, maxQtyFor, paymentOptions } from "./cart-logic";
import { useCatalog } from "./Catalog";
import Icon from "./Icon";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import { Breadcrumbs, Chevron, ProductCard } from "./catalog-ui";
import {
  categoryBySlug,
  discountPercent,
  formatPrice,
  LOW_STOCK,
  plural,
  type Product,
} from "./catalog-data";
import {
  productDescription,
  productGallery,
  productHighlights,
  productReviews,
  productUrl,
  ratingDistribution,
  relatedProducts,
  type Review,
} from "./product-details";


const reviewsWord = (n: number) => plural(n, ["відгук", "відгуки", "відгуків"]);

const tabIds = ["description", "specs", "reviews", "delivery"] as const;
type TabId = (typeof tabIds)[number];

export default function ProductPage({ product }: { product: Product }) {
  const router = useRouter();
  const { add, notify } = useCart();
  useTrackView(product.id);
  const category = categoryBySlug[product.category];
  const gallery = productGallery(product);
  const description = productDescription(product);
  const discount = discountPercent(product);

  const [query, setQuery] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [tab, setTab] = useState<TabId>("description");
  const [reviews, setReviews] = useState<Review[]>(() => productReviews(product));
  const tabsRef = useRef<HTMLDivElement>(null);

  const reviewCount = product.reviews + (reviews.length - productReviews(product).length);
  const total = product.price * quantity;
  const leftForFree = Math.max(0, FREE_SHIPPING_FROM - total);

  const addToCart = () => add(product.id, quantity);

  const { isFavorite, toggleFavorite, isCompared, toggleCompare } = useLists();
  const favorite = isFavorite(product.id);
  const compared = isCompared(product.id);

  // «Повідомити про наявність»: підписка зберігається в акаунті, сповіщення — коли адмін поповнить склад
  const { status } = useAuth();
  const { isAlerted, setStockAlert } = useNotifications();
  const alerted = isAlerted(product.id);
  const [alertPending, setAlertPending] = useState(false);
  const toggleStockAlert = async () => {
    if (status !== "user") {
      notify("Увійдіть, щоб підписатися", {
        label: "Увійти",
        onClick: () => router.push(`/account?next=${encodeURIComponent(productUrl(product))}`),
      });
      return;
    }
    setAlertPending(true);
    const ok = await setStockAlert(product.id, !alerted);
    setAlertPending(false);
    if (!ok) notify("Не вдалося зберегти. Спробуйте ще раз");
    else if (!alerted)
      notify("Повідомимо, щойно товар з'явиться", { label: "Мої сповіщення", onClick: () => router.push("/notifications") });
    else notify("Більше не чекаємо цей товар");
  };

  // Якір у URL (#reviews, #specs, …) відкриває потрібну вкладку
  useEffect(() => {
    const fromHash = window.location.hash.slice(1) as TabId;
    if (!tabIds.includes(fromHash)) return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- одноразове читання якоря після гідратації */
    setTab(fromHash);
    tabsRef.current?.scrollIntoView({ block: "start" });
  }, []);

  const selectTab = (id: TabId) => {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
  };

  const openTab = (id: TabId) => {
    selectTab(id);
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: "description", label: "Опис" },
    { id: "specs", label: "Характеристики" },
    { id: "reviews", label: `Відгуки (${reviewCount})` },
    { id: "delivery", label: "Доставка та оплата" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#082c45]">
      <SiteHeader
        query={query}
        onQueryChange={setQuery}
        onSearchSubmit={(q) => router.push(`/catalog?q=${encodeURIComponent(q)}`)}
      />

      <main className="flex-1 pb-24 lg:pb-0">
        <div className="mx-auto max-w-[1440px] px-5 pt-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: "Головна", href: "/" },
              { label: "Каталог", href: "/catalog" },
              { label: category.name, href: `/catalog/${category.slug}` },
              { label: product.name },
            ]}
          />

          <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
            <Gallery images={gallery} alt={product.name} badge={discount ? `−${discount}%` : product.hit ? "Хіт" : product.isNew ? "Новинка" : undefined} />

            {/* Інформація та покупка */}
            <div>
              <Link
                href={`/catalog/${category.slug}`}
                className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#098fd0] hover:underline"
              >
                {category.name}
              </Link>
              <h1 className="mt-2 text-[clamp(1.75rem,3.2vw,2.6rem)] font-extrabold leading-[1.1] tracking-[-0.035em]">
                {product.name}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <button
                  onClick={() => openTab("reviews")}
                  className="flex items-center gap-2 text-[#527083] hover:text-[#098fd0]"
                >
                  <Stars value={product.rating} />
                  <span className="font-bold text-[#082c45]">{product.rating.toFixed(1)}</span>
                  <span>
                    ({reviewCount} {reviewsWord(reviewCount)})
                  </span>
                </button>
                <span className="text-[#8aa5b5]">Код: {product.id.toUpperCase()}</span>
              </div>

              <p
                className={`mt-3 flex items-center gap-2 text-sm font-bold ${product.inStock ? "text-[#1f9d55]" : "text-[#c2780a]"}`}
              >
                <span className={`h-2 w-2 rounded-full ${product.inStock ? "bg-[#1f9d55]" : "bg-[#f5ad00]"}`} />
                {!product.inStock
                  ? "Очікується надходження"
                  : product.stock <= LOW_STOCK
                    ? `Залишилось лише ${product.stock} шт. · відправимо сьогодні`
                    : "Є в наявності · відправимо сьогодні"}
              </p>

              <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-4xl font-black tracking-[-0.03em]">
                  {formatPrice(product.price)}
                </span>
                {product.oldPrice && (
                  <>
                    <span className="text-lg font-semibold text-slate-400 line-through">
                      {formatPrice(product.oldPrice)}
                    </span>
                    <span className="rounded-full bg-[#fff4c2] px-2.5 py-1 text-xs font-extrabold text-[#8a6100]">
                      Економія {formatPrice(product.oldPrice - product.price)}
                    </span>
                  </>
                )}
              </div>

              <p className="mt-4 text-[15px] leading-relaxed text-[#3d5d70]">
                {description[0]}
              </p>

              <ul className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {productHighlights(product).map(([k, v]) => (
                  <li key={k} className="flex gap-2">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#ffd51f]" />
                    <span>
                      <span className="text-[#527083]">{k}:</span>{" "}
                      <b className="font-bold">{v}</b>
                    </span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => openTab("specs")}
                className="mt-2 text-sm font-bold text-[#098fd0] underline-offset-4 hover:underline"
              >
                Усі характеристики
              </button>

              {/* Кнопки покупки */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {product.inStock && (
                  <QuantityStepper value={quantity} onChange={setQuantity} max={maxQtyFor(product)} />
                )}
                {product.inStock ? (
                  <button
                    onClick={addToCart}
                    className="inline-flex h-14 flex-1 items-center justify-center gap-2.5 rounded-full bg-[#ffd51f] px-8 text-base font-extrabold shadow-[0_10px_26px_rgba(255,213,31,.4)] transition hover:-translate-y-0.5 hover:bg-[#ffe044] sm:flex-none sm:min-w-[260px]"
                  >
                    Додати в кошик
                    <Icon name="cart" className="h-5 w-5" />
                  </button>
                ) : (
                  <button
                    onClick={toggleStockAlert}
                    disabled={alertPending}
                    aria-pressed={alerted}
                    title={alerted ? "Натисніть, щоб скасувати" : undefined}
                    className={`inline-flex h-14 flex-1 items-center justify-center gap-2.5 rounded-full px-8 text-base font-extrabold transition disabled:opacity-60 sm:flex-none sm:min-w-[260px] ${
                      alerted ? "bg-[#e7f7ee] text-[#1f9d55] hover:bg-[#d8f1e3]" : "bg-[#082c45] text-white hover:bg-[#0b3a5a]"
                    }`}
                  >
                    <Icon name="bell" className="h-5 w-5 shrink-0" />
                    {/* На телефоні поруч ще дві кнопки — повний текст не вміщується в рядок */}
                    <span className="whitespace-nowrap">
                      {alerted ? "Повідомимо" : "Повідомити"}
                      <span className="hidden min-[440px]:inline"> про наявність</span>
                    </span>
                  </button>
                )}
                <button
                  onClick={() => toggleFavorite(product.id)}
                  aria-pressed={favorite}
                  aria-label={favorite ? "Прибрати з обраного" : "Додати в обране"}
                  title={favorite ? "В обраному" : "В обране"}
                  className={`grid h-14 w-14 place-items-center rounded-full transition ${favorite ? "bg-[#ffe3e3] text-[#e5484d]" : "bg-[#eef6fb] text-[#264e65] hover:bg-[#e1f0f9]"}`}
                >
                  <Icon name="heart" filled={favorite} className="h-6 w-6" />
                </button>
                <button
                  onClick={() => toggleCompare(product.id)}
                  aria-pressed={compared}
                  aria-label={compared ? "Прибрати з порівняння" : "Додати до порівняння"}
                  title={compared ? "У порівнянні" : "Порівняти"}
                  className={`grid h-14 w-14 place-items-center rounded-full transition ${compared ? "bg-[#098fd0] text-white" : "bg-[#eef6fb] text-[#264e65] hover:bg-[#e1f0f9]"}`}
                >
                  <Icon name="compare" className="h-6 w-6" />
                </button>
              </div>

              {/* Прогрес до безкоштовної доставки */}
              {product.inStock && (
                <div className="mt-4 rounded-2xl bg-[#f3f9fd] px-4 py-3 text-sm">
                  {leftForFree > 0 ? (
                    <p>
                      До <b>безкоштовної доставки</b> ще{" "}
                      <b className="text-[#067eb7]">{formatPrice(leftForFree)}</b>
                    </p>
                  ) : (
                    <p className="font-bold text-[#1f9d55]">Доставка для цього замовлення безкоштовна</p>
                  )}
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-[#ffd51f] transition-[width] duration-300"
                      style={{ width: `${Math.min(100, (total / FREE_SHIPPING_FROM) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <Perk icon="truck" title="Швидка доставка" text="по всій Україні" />
                <Perk icon="shield" title="Гарантія якості" text={product.attrs.find(([k]) => k === "Гарантія")?.[1] ?? "12 місяців"} />
                <Perk icon="return" title="Обмін і повернення" text="14 днів" />
              </div>
            </div>
          </div>

          {/* Вкладки */}
          <div ref={tabsRef} className="mt-14 scroll-mt-28">
            <Tabs tabs={tabs} active={tab} onChange={selectTab} />
            <div className="py-8" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
              {tab === "description" && <DescriptionTab product={product} paragraphs={description} />}
              {tab === "specs" && <SpecsTab attrs={product.attrs} />}
              {tab === "reviews" && (
                <ReviewsTab
                  product={product}
                  reviews={reviews}
                  total={reviewCount}
                  onAdd={(r) => {
                    setReviews((list) => [r, ...list]);
                    notify("Дякуємо за відгук!");
                  }}
                />
              )}
              {tab === "delivery" && <DeliveryTab />}
            </div>
          </div>

          <Related product={product} />
          <RecentlyViewed exclude={product.id} className="mb-20" />
        </div>
      </main>

      <SiteFooter />

      {/* Липка панель покупки на мобільних */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-sky-100 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-[#527083]">{product.name}</p>
            <p className="text-lg font-black">{formatPrice(product.price)}</p>
          </div>
          <button
            onClick={product.inStock ? addToCart : toggleStockAlert}
            disabled={!product.inStock && alertPending}
            aria-pressed={product.inStock ? undefined : alerted}
            className={`inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-extrabold ${
              product.inStock ? "bg-[#ffd51f]" : alerted ? "bg-[#e7f7ee] text-[#1f9d55]" : "bg-[#082c45] text-white"
            }`}
          >
            {product.inStock ? (
              <>
                В кошик <Icon name="cart" className="h-5 w-5" />
              </>
            ) : (
              <>
                <Icon name="bell" className="h-5 w-5" />
                {alerted ? "Чекаємо" : "Повідомити"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Галерея ---------- */

function Gallery({
  images,
  alt,
  badge,
}: {
  images: { full: string; thumb: string }[];
  alt: string;
  badge?: string;
}) {
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const go = useCallback(
    (delta: number) => setIndex((i) => (i + delta + images.length) % images.length),
    [images.length],
  );

  useEffect(() => {
    if (!zoomed) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomed(false);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [zoomed, go]);

  return (
    <div>
      <div className="group relative aspect-[3/2] overflow-hidden rounded-[24px] bg-sky-50">
        <button
          onClick={() => setZoomed(true)}
          className="block h-full w-full cursor-zoom-in"
          aria-label="Відкрити фото на весь екран"
        >
          <img
            src={images[index].full}
            alt={`${alt} — фото ${index + 1}`}
            className="h-full w-full object-cover brightness-[1.04] saturate-[1.08]"
            fetchPriority="high"
          />
        </button>
        {badge && (
          <span className="absolute right-4 top-4 rounded-full bg-[#ffd51f] px-3.5 py-1.5 text-sm font-black">
            {badge}
          </span>
        )}
        <GalleryArrow side="left" onClick={() => go(-1)} />
        <GalleryArrow side="right" onClick={() => go(1)} />
        <span className="absolute bottom-4 right-4 rounded-full bg-[#082c45]/60 px-3 py-1 text-xs font-bold text-white backdrop-blur">
          {index + 1} / {images.length}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-3">
        {images.map((image, i) => (
          <button
            key={image.thumb}
            onClick={() => setIndex(i)}
            aria-label={`Фото ${i + 1}`}
            aria-current={i === index}
            className={`aspect-[3/2] overflow-hidden rounded-[14px] border-2 transition ${i === index ? "border-[#098fd0]" : "border-transparent opacity-80 hover:opacity-100"}`}
          >
            <img src={image.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      {zoomed && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#04182a]/92 p-4" role="dialog" aria-modal="true" aria-label="Перегляд фото">
          <button className="absolute inset-0" aria-label="Закрити" onClick={() => setZoomed(false)} />
          <img
            src={images[index].full}
            alt={`${alt} — фото ${index + 1}`}
            className="relative max-h-[86vh] max-w-full rounded-2xl object-contain"
          />
          <button
            onClick={() => setZoomed(false)}
            className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white text-[#082c45]"
            aria-label="Закрити"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
          <GalleryArrow side="left" onClick={() => go(-1)} always />
          <GalleryArrow side="right" onClick={() => go(1)} always />
        </div>
      )}
    </div>
  );
}

function GalleryArrow({
  side,
  onClick,
  always,
}: {
  side: "left" | "right";
  onClick: () => void;
  always?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={side === "left" ? "Попереднє фото" : "Наступне фото"}
      className={`absolute top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#082c45] shadow-lg transition hover:bg-white ${side === "left" ? "left-4" : "right-4"} ${always ? "" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 max-lg:opacity-100"}`}
    >
      <Chevron className={`h-5 w-5 ${side === "left" ? "rotate-180" : ""}`} />
    </button>
  );
}

/* ---------- Дрібні елементи ---------- */

function QuantityStepper({
  value,
  onChange,
  disabled,
  max = 20,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  max?: number;
}) {
  const btn = "grid h-10 w-10 place-items-center rounded-full text-xl font-bold text-[#264e65] transition hover:bg-white disabled:opacity-35 disabled:hover:bg-transparent";
  return (
    <div className="flex h-14 items-center gap-1 rounded-full bg-[#eef6fb] px-2" aria-label="Кількість">
      <button className={btn} onClick={() => onChange(value - 1)} disabled={disabled || value <= 1} aria-label="Зменшити кількість">
        −
      </button>
      <span className="w-8 text-center text-base font-extrabold" aria-live="polite">
        {value}
      </span>
      <button className={btn} onClick={() => onChange(value + 1)} disabled={disabled || value >= max} aria-label="Збільшити кількість">
        +
      </button>
    </div>
  );
}

function Perk({ icon, title, text }: { icon: "truck" | "shield" | "return"; title: string; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#eef6fb] text-[#067eb7]">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="text-sm leading-tight">
        <b className="block font-bold">{title}</b>
        <span className="text-[#527083]">{text}</span>
      </span>
    </div>
  );
}

export function Stars({ value, size = "h-4 w-4" }: { value: number; size?: string }) {
  const id = useId();
  return (
    <span className="flex items-center gap-0.5" aria-label={`Рейтинг ${value.toFixed(1)} з 5`} role="img">
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <svg key={i} viewBox="0 0 24 24" className={size} aria-hidden="true">
            <defs>
              <linearGradient id={`${id}-${i}`}>
                <stop offset={`${fill * 100}%`} stopColor="#f5ad00" />
                <stop offset={`${fill * 100}%`} stopColor="#dbe6ee" />
              </linearGradient>
            </defs>
            <path fill={`url(#${id}-${i})`} d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
          </svg>
        );
      })}
    </span>
  );
}

/* ---------- Вкладки ---------- */

function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: TabId; label: string }[];
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  // Стрілки ←/→ перемикають вкладки (патерн WAI-ARIA Tabs)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = tabs.findIndex((t) => t.id === active);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    onChange(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label="Інформація про товар"
      onKeyDown={onKeyDown}
      className="-mx-5 flex gap-7 overflow-x-auto border-b border-[#e3edf3] px-5 lg:mx-0 lg:px-0"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`tab-${t.id}`}
          role="tab"
          aria-selected={t.id === active}
          aria-controls={`panel-${t.id}`}
          tabIndex={t.id === active ? 0 : -1}
          onClick={() => onChange(t.id)}
          className={`relative shrink-0 whitespace-nowrap pb-3.5 text-base font-bold transition ${t.id === active ? "text-[#098fd0]" : "text-[#264e65] hover:text-[#098fd0]"}`}
        >
          {t.label}
          {t.id === active && (
            <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-[#098fd0]" />
          )}
        </button>
      ))}
    </div>
  );
}

function DescriptionTab({ product, paragraphs }: { product: Product; paragraphs: string[] }) {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="space-y-4 text-[15px] leading-relaxed text-[#264e65]">
        {paragraphs.map((p) => (
          <p key={p.slice(0, 24)}>{p}</p>
        ))}
      </div>
      <div className="rounded-[22px] bg-[#f3f9fd] p-6">
        <p className="font-extrabold">Коротко про головне</p>
        <ul className="mt-4 space-y-3 text-sm">
          {productHighlights(product).map(([k, v]) => (
            <li key={k} className="flex items-start gap-3">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#ffd51f]">
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="#082c45" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              </span>
              <span>
                {k}: <b>{v}</b>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SpecsTab({ attrs }: { attrs: [string, string][] }) {
  return (
    <dl className="max-w-3xl overflow-hidden rounded-[20px] border border-[#e3edf3]">
      {attrs.map(([k, v], i) => (
        <div key={k} className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4 px-5 py-3.5 text-sm ${i % 2 ? "bg-white" : "bg-[#f6fafd]"}`}>
          <dt className="text-[#527083]">{k}</dt>
          <dd className="font-bold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReviewsTab({
  product,
  reviews,
  total,
  onAdd,
}: {
  product: Product;
  reviews: Review[];
  total: number;
  onAdd: (r: Review) => void;
}) {
  const [shown, setShown] = useState(3);
  const [formOpen, setFormOpen] = useState(false);
  const dist = ratingDistribution(product);
  const max = Math.max(...dist, 1);

  return (
    <div className="grid gap-10 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="h-fit rounded-[22px] bg-[#f3f9fd] p-6">
        <div className="flex items-end gap-3">
          <span className="text-5xl font-black tracking-[-0.04em]">{product.rating.toFixed(1)}</span>
          <div className="pb-1.5">
            <Stars value={product.rating} />
            <p className="mt-1 text-xs text-[#527083]">
              {total} {reviewsWord(total)}
            </p>
          </div>
        </div>
        <div className="mt-5 space-y-2">
          {dist.map((n, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="w-3 font-bold">{5 - i}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-[#ffd51f]" style={{ width: `${(n / max) * 100}%` }} />
              </div>
              <span className="w-7 text-right text-[#527083]">{n}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setFormOpen((o) => !o)}
          className="mt-6 w-full rounded-full bg-[#ffd51f] py-3 text-sm font-extrabold transition hover:bg-[#ffe044]"
        >
          {formOpen ? "Скасувати" : "Написати відгук"}
        </button>
      </div>

      <div>
        {formOpen && (
          <ReviewForm
            productId={product.id}
            onSubmit={(r) => {
              onAdd(r);
              setFormOpen(false);
              setShown((s) => s + 1);
            }}
          />
        )}
        <ul className="divide-y divide-[#e3edf3]">
          {reviews.slice(0, shown).map((r) => (
            <li key={r.id} className="py-5 first:pt-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[#e1f0f9] text-sm font-extrabold text-[#067eb7]">
                  {r.author[0]}
                </span>
                <span className="font-bold">{r.author}</span>
                <span className="text-xs text-[#8aa5b5]">
                  {r.city} · {r.date}
                </span>
                {r.verified && (
                  <span className="rounded-full bg-[#e7f7ee] px-2 py-0.5 text-[11px] font-bold text-[#1f9d55]">
                    Підтверджена покупка
                  </span>
                )}
              </div>
              <div className="mt-2">
                <Stars value={r.rating} size="h-3.5 w-3.5" />
              </div>
              <p className="mt-2 text-[15px] leading-relaxed text-[#264e65]">{r.text}</p>
            </li>
          ))}
        </ul>
        {shown < reviews.length && (
          <button
            onClick={() => setShown((s) => s + 3)}
            className="mt-2 rounded-full bg-[#eaf3f8] px-6 py-3 text-sm font-extrabold text-[#264e65] transition hover:bg-[#d8ecf7]"
          >
            Показати ще відгуки
          </button>
        )}
      </div>
    </div>
  );
}

function ReviewForm({ productId, onSubmit }: { productId: string; onSubmit: (r: Review) => void }) {
  const [rating, setRating] = useState(5);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError("Вкажіть ваше ім'я");
    if (text.trim().length < 10) return setError("Відгук має містити щонайменше 10 символів");
    onSubmit({
      id: `${productId}-new-${text.length}-${name}`,
      author: name.trim(),
      city: "",
      date: "щойно",
      rating,
      text: text.trim(),
      verified: false,
    });
  };

  return (
    <form onSubmit={submit} className="mb-8 rounded-[22px] border border-[#e3edf3] p-5" noValidate>
      <p className="font-extrabold">Ваш відгук</p>
      <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label="Оцінка">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} з 5`}
            onClick={() => setRating(n)}
            className="p-0.5"
          >
            <svg viewBox="0 0 24 24" className={`h-7 w-7 ${n <= rating ? "text-[#f5ad00]" : "text-[#dbe6ee]"}`} fill="currentColor" aria-hidden="true">
              <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
            </svg>
          </button>
        ))}
      </div>
      <FormField label="Ім'я">
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-[#d5e5ef] px-4 py-2.5 text-sm outline-none focus:border-[#0aa4e8] focus:ring-4 focus:ring-sky-100" />
      </FormField>
      <FormField label="Відгук">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="w-full resize-y rounded-xl border border-[#d5e5ef] px-4 py-2.5 text-sm outline-none focus:border-[#0aa4e8] focus:ring-4 focus:ring-sky-100" placeholder="Що сподобалось, а що можна покращити?" />
      </FormField>
      {error && <p className="mt-3 text-sm font-semibold text-[#e5484d]">{error}</p>}
      <button type="submit" className="mt-4 rounded-full bg-[#082c45] px-6 py-3 text-sm font-extrabold text-white transition hover:bg-[#0b3a5a]">
        Опублікувати
      </button>
    </form>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mt-4 block">
      <span className="mb-1.5 block text-sm font-bold">{label}</span>
      {children}
    </label>
  );
}

function DeliveryTab() {
  // Ті самі способи й ціни, що в кошику
  const delivery = deliveryOptions.map((o) => ({
    title: o.title,
    text: `${o.text}.`,
    aside: o.freeAbove ? `${formatPrice(o.price)} · від ${formatPrice(FREE_SHIPPING_FROM)} безкоштовно` : formatPrice(o.price),
  }));
  const payment = paymentOptions.map((o) => ({
    title: o.title,
    text: o.minTotal ? `${o.text}, для замовлень від ${formatPrice(o.minTotal)}.` : `${o.text}.`,
  }));
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <InfoList title="Доставка" icon="truck" items={delivery} />
      <InfoList title="Оплата" icon="shield" items={payment} />
      <div className="rounded-[22px] bg-[#fffbe6] p-6 lg:col-span-2">
        <p className="font-extrabold">Обмін і повернення</p>
        <p className="mt-2 text-sm leading-relaxed text-[#3d5d70]">
          Протягом {RETURN_DAYS} днів ви можете повернути або обміняти товар, якщо він не був у використанні та збережено товарний вигляд. Вартість зворотної доставки — за тарифами перевізника.
        </p>
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-bold">
          <Link href="/delivery" className="text-[#098fd0] hover:underline">Усе про доставку й оплату →</Link>
          <Link href="/returns" className="text-[#098fd0] hover:underline">Як повернути товар →</Link>
        </p>
      </div>
    </div>
  );
}

function InfoList({
  title,
  icon,
  items,
}: {
  title: string;
  icon: "truck" | "shield";
  items: { title: string; text: string; aside?: string }[];
}) {
  return (
    <div>
      <p className="flex items-center gap-2.5 text-lg font-extrabold">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[#eef6fb] text-[#067eb7]">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        {title}
      </p>
      <ul className="mt-4 divide-y divide-[#e3edf3] rounded-[20px] border border-[#e3edf3]">
        {items.map((it) => (
          <li key={it.title} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <span>
              <b className="block text-sm">{it.title}</b>
              <span className="text-sm text-[#527083]">{it.text}</span>
            </span>
            {it.aside && <span className="shrink-0 text-sm font-bold text-[#067eb7]">{it.aside}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Схожі товари ---------- */

function Related({ product }: { product: Product }) {
  const { add } = useCart();
  const { products } = useCatalog();
  const items = relatedProducts(products, product);
  if (!items.length) return null;
  return (
    <section className="mb-20 mt-6" aria-labelledby="related-title">
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 id="related-title" className="text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">
          Схожі товари
        </h2>
        <Link href={`/catalog/${product.category}`} className="text-sm font-bold text-[#098fd0] hover:underline">
          Усі {categoryBySlug[product.category].name.toLowerCase()}
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-4">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} onAdd={() => add(p.id)} />
        ))}
      </div>
    </section>
  );
}
