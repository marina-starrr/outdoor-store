"use client";

/* eslint-disable @next/next/no-img-element -- фото товарів з Unsplash, як і в каталозі */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useCart } from "./Cart";
import Icon from "./Icon";
import { COMPARE_LIMIT, useLists } from "./Lists";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import { Breadcrumbs } from "./catalog-ui";
import { categoryBySlug, formatPrice, type CategorySlug, type Product } from "./catalog-data";
import { productUrl } from "./product-details";

type Row = {
  label: string;
  values: ReactNode[];
  /** Сирі значення — для пошуку відмінностей */
  raw: string[];
  /** Індекси «найкращих» значень (найнижча ціна, найвищий рейтинг) */
  best?: number[];
};

function buildRows(items: Product[]): Row[] {
  const minPrice = Math.min(...items.map((p) => p.price));
  const maxRating = Math.max(...items.map((p) => p.rating));
  const indexesOf = (test: (p: Product) => boolean) =>
    items.length > 1 ? items.flatMap((p, i) => (test(p) ? [i] : [])) : [];

  const rows: Row[] = [
    {
      label: "Ціна",
      raw: items.map((p) => String(p.price)),
      values: items.map((p) => (
        <span key={p.id} className="flex flex-wrap items-baseline gap-x-2">
          <b className="text-base">{formatPrice(p.price)}</b>
          {p.oldPrice && <span className="text-xs text-slate-400 line-through">{formatPrice(p.oldPrice)}</span>}
        </span>
      )),
      best: indexesOf((p) => p.price === minPrice),
    },
    {
      label: "Рейтинг",
      raw: items.map((p) => String(p.rating)),
      values: items.map((p) => (
        <span key={p.id}>
          <b>★ {p.rating.toFixed(1)}</b> <span className="text-[#8aa5b5]">({p.reviews} відгуків)</span>
        </span>
      )),
      best: indexesOf((p) => p.rating === maxRating),
    },
    {
      label: "Наявність",
      raw: items.map((p) => String(p.inStock)),
      values: items.map((p) =>
        p.inStock ? (
          <span key={p.id} className="font-bold text-[#1f9d55]">Є в наявності</span>
        ) : (
          <span key={p.id} className="font-bold text-[#c2780a]">Очікується</span>
        ),
      ),
    },
  ];

  // Об'єднання характеристик усіх товарів у порядку першої появи
  const labels = [...new Set(items.flatMap((p) => p.attrs.map(([k]) => k)))];
  for (const label of labels) {
    const raw = items.map((p) => p.attrs.find(([k]) => k === label)?.[1] ?? "—");
    rows.push({ label, raw, values: raw.map((v, i) => <span key={i}>{v}</span>) });
  }
  return rows;
}

export default function ComparePage() {
  const router = useRouter();
  const { compare, ready, toggleCompare, clearCompare } = useLists();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CategorySlug | null>(null);
  const [diffOnly, setDiffOnly] = useState(false);

  // ?category=tents — відкрити потрібну групу (посилання зі сповіщень)
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("category");
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- читання URL після гідратації */
    if (c && c in categoryBySlug) setSelected(c as CategorySlug);
  }, []);

  const groups = [...new Set(compare.map((p) => p.category))];
  const active = selected && groups.includes(selected) ? selected : groups[0];
  const items = compare.filter((p) => p.category === active);
  const rows = items.length ? buildRows(items) : [];
  const differs = (r: Row) => new Set(r.raw).size > 1;
  const shownRows = diffOnly ? rows.filter(differs) : rows;
  const canAddMore = items.length < COMPARE_LIMIT;

  const selectGroup = (c: CategorySlug) => {
    setSelected(c);
    window.history.replaceState(null, "", `?category=${c}`);
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
          <Breadcrumbs items={[{ label: "Головна", href: "/" }, { label: "Порівняння" }]} />
          <h1 className="mt-4 text-[clamp(2rem,4vw,2.9rem)] font-extrabold leading-[1.05] tracking-[-0.04em]">
            Порівняння товарів
          </h1>

          {!ready ? (
            <div className="mt-8 h-64 animate-pulse rounded-[24px] bg-white" aria-label="Завантаження" />
          ) : compare.length === 0 ? (
            <div className="mt-8 flex flex-col items-center rounded-[24px] bg-white px-6 py-16 text-center shadow-[0_18px_52px_rgba(79,93,101,.08)]">
              <span className="grid h-20 w-20 place-items-center rounded-full bg-[#eef9ff] text-[#067eb7]">
                <Icon name="compare" className="h-9 w-9" />
              </span>
              <p className="mt-5 text-xl font-extrabold">Немає товарів для порівняння</p>
              <p className="mt-2 max-w-sm text-sm text-[#527083]">
                Натисніть кнопку порівняння на картках товарів однієї категорії — і тут з&apos;явиться таблиця їхніх характеристик.
              </p>
              <Link href="/catalog" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#ffd51f] px-6 py-3 text-sm font-extrabold transition hover:bg-[#ffe044]">
                Перейти до каталогу <Icon name="arrow" className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-2" role="tablist" aria-label="Категорії для порівняння">
                  {groups.map((c) => (
                    <button
                      key={c}
                      role="tab"
                      aria-selected={active === c}
                      onClick={() => selectGroup(c)}
                      className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                        active === c ? "bg-[#082c45] text-white" : "bg-white text-[#264e65] shadow-[0_4px_14px_rgba(79,93,101,.08)] hover:bg-[#eef6fb]"
                      }`}
                    >
                      {categoryBySlug[c].name}
                      <span className={`ml-1.5 text-xs ${active === c ? "text-white/70" : "text-[#8aa5b5]"}`}>
                        {compare.filter((p) => p.category === c).length}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm font-bold">
                    <span className="relative inline-flex">
                      <input type="checkbox" checked={diffOnly} onChange={(e) => setDiffOnly(e.target.checked)} className="peer sr-only" disabled={items.length < 2} />
                      <span className="h-6 w-11 rounded-full bg-[#d5e5ef] transition peer-checked:bg-[#098fd0] peer-focus-visible:ring-4 peer-focus-visible:ring-sky-200 peer-disabled:opacity-50" />
                      <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                    </span>
                    Лише відмінності
                  </label>
                  <button onClick={() => active && clearCompare(active)} className="text-sm font-bold text-[#8aa5b5] transition hover:text-[#e5484d]">
                    Очистити
                  </button>
                </div>
              </div>

              {items.length === 1 && (
                <p className="mt-4 rounded-2xl bg-[#fffbe6] px-5 py-3.5 text-sm text-[#5b4a00]">
                  Додайте ще хоча б один товар з категорії «{categoryBySlug[active].name}», щоб побачити різницю.
                </p>
              )}

              <div className="mt-5 overflow-x-auto rounded-[24px] bg-white shadow-[0_18px_52px_rgba(79,93,101,.08)]">
                <table className="w-full min-w-max border-collapse text-sm">
                  <thead>
                    <tr>
                      <th scope="col" className="sticky left-0 z-10 w-40 bg-white p-4 text-left align-bottom sm:w-52">
                        <span className="text-sm font-bold text-[#8aa5b5]">
                          Товарів: {items.length} / {COMPARE_LIMIT}
                        </span>
                      </th>
                      {items.map((p) => (
                        <th key={p.id} scope="col" className="w-[230px] min-w-[200px] p-4 text-left align-top font-normal">
                          <ProductHead product={p} onRemove={() => toggleCompare(p.id)} />
                        </th>
                      ))}
                      {canAddMore && (
                        <th scope="col" className="w-[200px] min-w-[180px] p-4 align-top font-normal">
                          <Link
                            href={`/catalog/${active}`}
                            className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#d5e5ef] text-sm font-bold text-[#527083] transition hover:border-[#098fd0] hover:text-[#098fd0]"
                          >
                            <span className="text-3xl leading-none">+</span>
                            Додати товар
                          </Link>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {shownRows.map((row, i) => {
                      const diff = differs(row);
                      return (
                        <tr key={row.label} className={i % 2 ? "bg-white" : "bg-[#f6fafd]"}>
                          <th scope="row" className={`sticky left-0 z-10 p-4 text-left font-semibold text-[#527083] ${i % 2 ? "bg-white" : "bg-[#f6fafd]"}`}>
                            <span className="flex items-center gap-2">
                              {row.label}
                              {diff && !diffOnly && items.length > 1 && (
                                <span className="h-1.5 w-1.5 rounded-full bg-[#ffd51f]" title="Значення відрізняються" />
                              )}
                            </span>
                          </th>
                          {row.values.map((v, j) => (
                            <td key={j} className="p-4 align-top">
                              <span className={row.best?.includes(j) && diff ? "inline-flex rounded-lg bg-[#e7f7ee] px-2 py-1 text-[#1f7a45]" : ""}>
                                {v}
                              </span>
                            </td>
                          ))}
                          {canAddMore && <td />}
                        </tr>
                      );
                    })}
                    {diffOnly && shownRows.length === 0 && (
                      <tr>
                        <td colSpan={items.length + 2} className="p-8 text-center text-[#527083]">
                          Характеристики однакові — обирайте за ціною чи дизайном 🙂
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-[#8aa5b5]">
                Зеленим виділено найкращу ціну та найвищий рейтинг. Можна порівнювати до {COMPARE_LIMIT} товарів кожної категорії.
              </p>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function ProductHead({ product, onRemove }: { product: Product; onRemove: () => void }) {
  const { add } = useCart();
  return (
    <div className="relative">
      <button
        onClick={onRemove}
        aria-label={`Прибрати ${product.name} з порівняння`}
        className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-[#527083] shadow transition hover:text-[#e5484d]"
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
      <Link href={productUrl(product)} className="block aspect-[4/3] overflow-hidden rounded-2xl bg-sky-50">
        <img src={product.image} alt="" className="h-full w-full object-cover" />
      </Link>
      <Link href={productUrl(product)} className="mt-3 line-clamp-2 min-h-[2.6em] text-[15px] font-extrabold leading-snug transition hover:text-[#098fd0]">
        {product.name}
      </Link>
      <button
        onClick={() => add(product.id)}
        disabled={!product.inStock}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#ffd51f] py-2.5 text-sm font-extrabold transition hover:bg-[#ffe044] disabled:cursor-not-allowed disabled:bg-[#e6eef3] disabled:text-[#8aa5b5]"
      >
        <Icon name="cart" className="h-4 w-4" />
        {product.inStock ? "В кошик" : "Очікується"}
      </button>
    </div>
  );
}
