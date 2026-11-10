"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./Auth";
import { useCart } from "./Cart";
import Icon from "./Icon";
import { useLists } from "./Lists";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import { Breadcrumbs, ProductCard } from "./catalog-ui";
import { categoryBySlug, formatPrice, productsWord, type CategorySlug } from "./catalog-data";

export default function FavoritesPage() {
  const router = useRouter();
  const { favorites, ready, clearFavorites } = useLists();
  const { add, openCart } = useCart();
  const { status } = useAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategorySlug | "all">("all");
  const [confirmClear, setConfirmClear] = useState(false);

  const categories = [...new Set(favorites.map((p) => p.category))];
  const active = category !== "all" && categories.includes(category) ? category : "all";
  const visible = active === "all" ? favorites : favorites.filter((p) => p.category === active);
  const available = visible.filter((p) => p.inStock);
  const availableSum = available.reduce((s, p) => s + p.price, 0);

  const addAll = () => {
    available.forEach((p) => add(p.id));
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
        <div className="mx-auto max-w-[1440px] px-5 pb-20 pt-6 lg:px-8">
          <Breadcrumbs items={[{ label: "Головна", href: "/" }, { label: "Обране" }]} />

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[clamp(2rem,4vw,2.9rem)] font-extrabold leading-[1.05] tracking-[-0.04em]">
                Обране
              </h1>
              {ready && favorites.length > 0 && (
                <p className="mt-2 text-[#3d5d70]">
                  {favorites.length} {productsWord(favorites.length)}, які вам сподобались
                </p>
              )}
            </div>
            {visible.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                {confirmClear ? (
                  <span className="flex items-center gap-2 text-sm">
                    <span className="text-[#527083]">Очистити обране?</span>
                    <button onClick={() => { clearFavorites(); setConfirmClear(false); }} className="font-bold text-[#e5484d] hover:underline">Так</button>
                    <button onClick={() => setConfirmClear(false)} className="font-bold text-[#264e65] hover:underline">Ні</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmClear(true)} className="text-sm font-bold text-[#8aa5b5] transition hover:text-[#e5484d]">
                    Очистити
                  </button>
                )}
                {available.length > 0 && (
                  <button
                    onClick={addAll}
                    className="inline-flex items-center gap-2 rounded-full bg-[#ffd51f] px-5 py-3 text-sm font-extrabold shadow-[0_8px_20px_rgba(255,213,31,.3)] transition hover:bg-[#ffe044]"
                  >
                    <Icon name="cart" className="h-5 w-5" />
                    Усе в кошик · {formatPrice(availableSum)}
                  </button>
                )}
              </div>
            )}
          </div>

          {!ready ? (
            <div className="mt-8 h-64 animate-pulse rounded-[24px] bg-white" aria-label="Завантаження" />
          ) : favorites.length === 0 ? (
            <div className="mt-8 flex flex-col items-center rounded-[24px] bg-white px-6 py-16 text-center shadow-[0_18px_52px_rgba(79,93,101,.08)]">
              <span className="grid h-20 w-20 place-items-center rounded-full bg-[#ffecec] text-[#e5484d]">
                <Icon name="heart" className="h-9 w-9" />
              </span>
              <p className="mt-5 text-xl font-extrabold">Тут поки порожньо</p>
              <p className="mt-2 max-w-sm text-sm text-[#527083]">
                Натискайте ♡ на товарах, які сподобались, — вони збережуться тут, щоб повернутися до них пізніше.
              </p>
              <Link href="/catalog" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#ffd51f] px-6 py-3 text-sm font-extrabold transition hover:bg-[#ffe044]">
                Перейти до каталогу <Icon name="arrow" className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <>
              {status === "guest" && (
                <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-[#eaf6fd] px-5 py-3.5 text-sm text-[#264e65]">
                  <Icon name="user" className="h-5 w-5 text-[#067eb7]" />
                  Обране збережене лише в цьому браузері.
                  <Link href="/account?next=/favorites" className="font-bold text-[#067eb7] hover:underline">
                    Увійдіть
                  </Link>
                  — і воно буде доступне на всіх пристроях.
                </p>
              )}

              {categories.length > 1 && (
                <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Категорії">
                  {(["all", ...categories] as const).map((c) => {
                    const count = c === "all" ? favorites.length : favorites.filter((p) => p.category === c).length;
                    return (
                      <button
                        key={c}
                        role="tab"
                        aria-selected={active === c}
                        onClick={() => setCategory(c)}
                        className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                          active === c ? "bg-[#082c45] text-white" : "bg-white text-[#264e65] shadow-[0_4px_14px_rgba(79,93,101,.08)] hover:bg-[#eef6fb]"
                        }`}
                      >
                        {c === "all" ? "Усі" : categoryBySlug[c].name}
                        <span className={`ml-1.5 text-xs ${active === c ? "text-white/70" : "text-[#8aa5b5]"}`}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-6 grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visible.map((p) => (
                  <ProductCard key={p.id} product={p} showCategory onAdd={() => add(p.id)} />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
