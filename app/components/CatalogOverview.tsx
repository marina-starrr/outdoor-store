"use client";

/* eslint-disable @next/next/no-img-element -- фото категорій з Unsplash з CSS-фільтрами, як на головній */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCart } from "./Cart";
import Icon from "./Icon";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import {
  ActiveChips,
  Breadcrumbs,
  Checkbox,
  EmptyState,
  FilterDrawer,
  FilterGroup,
  MobileFiltersButton,
  Pagination,
  PriceRange,
  ProductCard,
  ResetButton,
  SortSelect,
  listParam,
  numParam,
  readSearchParams,
  scrollToId,
  usePaging,
  writeSearchParams,
  type Chip,
} from "./catalog-ui";
import {
  brands,
  categories,
  categoryBySlug,
  discountPercent,
  formatPrice,
  priceBounds,
  products,
  productsWord,
  roundBounds,
  type CategoryInfo,
  type CategorySlug,
  type Product,
} from "./catalog-data";

const PAGE_SIZE = 6;
const BOUNDS = roundBounds(priceBounds(products));

const sortOptions = [
  { id: "popular", label: "Спочатку популярні" },
  { id: "name", label: "За назвою (А–Я)" },
  { id: "cheap", label: "Від найдешевших" },
  { id: "count", label: "Більше товарів" },
] as const;
type SortId = (typeof sortOptions)[number]["id"];

type Filters = {
  price: [number, number];
  categories: CategorySlug[];
  brands: string[];
  saleOnly: boolean;
  inStockOnly: boolean;
};

const initialFilters: Filters = {
  price: BOUNDS,
  categories: [],
  brands: [],
  saleOnly: false,
  inStockOnly: false,
};

const toggle = <T,>(list: T[], value: T) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

/** Фільтри товару (без категорії та пошуку) */
function matches(p: Product, f: Filters, skip?: "brands") {
  if (p.price < f.price[0] || p.price > f.price[1]) return false;
  if (skip !== "brands" && f.brands.length && !f.brands.includes(p.brand))
    return false;
  if (f.saleOnly && !p.oldPrice) return false;
  if (f.inStockOnly && !p.inStock) return false;
  return true;
}

const matchesQuery = (p: Product, q: string) =>
  `${p.name} ${p.brand}`.toLocaleLowerCase("uk").includes(q);

type CategoryRow = {
  info: CategoryInfo;
  items: Product[];
  /** Чи знайдено категорію за назвою (а не лише за товарами в ній) */
  nameMatch: boolean;
};

export default function CatalogOverview() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [sort, setSort] = useState<SortId>("popular");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [urlReady, setUrlReady] = useState(false);
  const { add } = useCart();

  // Відновлюємо фільтри з URL — посилання на відфільтрований каталог працює
  useEffect(() => {
    const sp = readSearchParams();
    const min = numParam(sp, "min");
    const max = numParam(sp, "max");
    const s = sp.get("sort");
    /* eslint-disable react-hooks/set-state-in-effect -- одноразова ініціалізація з URL після гідратації */
    setFilters({
      price: [
        Math.max(BOUNDS[0], Math.min(min ?? BOUNDS[0], BOUNDS[1])),
        Math.min(BOUNDS[1], Math.max(max ?? BOUNDS[1], BOUNDS[0])),
      ],
      categories: listParam(sp, "cat").filter(
        (c): c is CategorySlug => c in categoryBySlug,
      ),
      brands: listParam(sp, "brand").filter((b) => brands.includes(b)),
      saleOnly: sp.get("sale") === "1",
      inStockOnly: sp.get("stock") === "1",
    });
    if (sortOptions.some((o) => o.id === s)) setSort(s as SortId);
    setQuery(sp.get("q") ?? "");
    setUrlReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Параметри, що передаються далі на сторінку категорії
  const carried = {
    min: filters.price[0] !== BOUNDS[0] ? String(filters.price[0]) : undefined,
    max: filters.price[1] !== BOUNDS[1] ? String(filters.price[1]) : undefined,
    brand: filters.brands.join(",") || undefined,
    sale: filters.saleOnly ? "1" : undefined,
    stock: filters.inStockOnly ? "1" : undefined,
  };
  const carriedKey = JSON.stringify(carried);

  useEffect(() => {
    if (!urlReady) return;
    writeSearchParams({
      q: query.trim() || undefined,
      cat: filters.categories.join(",") || undefined,
      ...(JSON.parse(carriedKey) as Record<string, string | undefined>),
      sort: sort !== "popular" ? sort : undefined,
    });
  }, [urlReady, query, filters.categories, carriedKey, sort]);

  const q = query.trim().toLocaleLowerCase("uk");

  // Рядки категорій: які товари в кожній проходять фільтри (та пошук)
  const rows = useMemo<CategoryRow[]>(() => {
    const list = categories
      .filter(
        (c) =>
          !filters.categories.length || filters.categories.includes(c.slug),
      )
      .map((info) => {
        const filtered = products.filter(
          (p) => p.category === info.slug && matches(p, filters),
        );
        const nameMatch = !q || info.name.toLocaleLowerCase("uk").includes(q);
        return {
          info,
          nameMatch,
          items: nameMatch ? filtered : filtered.filter((p) => matchesQuery(p, q)),
        };
      })
      .filter((r) => r.items.length > 0);

    const minPrice = (r: CategoryRow) => Math.min(...r.items.map((p) => p.price));
    const sorters: Record<SortId, (a: CategoryRow, b: CategoryRow) => number> = {
      popular: (a, b) => a.info.popularity - b.info.popularity,
      name: (a, b) => a.info.name.localeCompare(b.info.name, "uk"),
      cheap: (a, b) => minPrice(a) - minPrice(b),
      count: (a, b) => b.items.length - a.items.length,
    };
    return list.sort(sorters[sort]);
  }, [filters, q, sort]);

  // Лічильники для чекбоксів
  const counts = useMemo(() => {
    const category: Record<string, number> = {};
    const brand: Record<string, number> = {};
    for (const p of products) {
      if (matches(p, filters))
        category[p.category] = (category[p.category] ?? 0) + 1;
      if (
        matches(p, filters, "brands") &&
        (!filters.categories.length || filters.categories.includes(p.category))
      )
        brand[p.brand] = (brand[p.brand] ?? 0) + 1;
    }
    return { category, brand };
  }, [filters]);

  // Товари за пошуковим запитом або «Гарячі пропозиції»
  const featured = useMemo(() => {
    const pool = products.filter(
      (p) =>
        matches(p, filters) &&
        (!filters.categories.length || filters.categories.includes(p.category)),
    );
    return q
      ? pool.filter((p) => matchesQuery(p, q)).slice(0, 8)
      : pool
          .filter((p) => p.oldPrice && p.inStock)
          .sort((a, b) => discountPercent(b) - discountPercent(a))
          .slice(0, 4);
  }, [filters, q]);

  const paging = usePaging(
    rows.length,
    PAGE_SIZE,
    JSON.stringify([filters, q, sort]),
  );
  const visible = rows.slice(paging.start, paging.end);

  const update = (patch: Partial<Filters>) =>
    setFilters((f) => ({ ...f, ...patch }));
  const resetAll = () => {
    setFilters(initialFilters);
    setQuery("");
  };
  const closeFilters = useCallback(() => setFiltersOpen(false), []);

  const chips: Chip[] = [
    ...(filters.price[0] !== BOUNDS[0] || filters.price[1] !== BOUNDS[1]
      ? [{ key: "price", label: `${formatPrice(filters.price[0])} – ${formatPrice(filters.price[1])}`, remove: () => update({ price: BOUNDS }) }]
      : []),
    ...filters.categories.map((c) => ({
      key: `c-${c}`,
      label: categoryBySlug[c].name,
      remove: () => update({ categories: filters.categories.filter((x) => x !== c) }),
    })),
    ...filters.brands.map((b) => ({
      key: `b-${b}`,
      label: b,
      remove: () => update({ brands: filters.brands.filter((x) => x !== b) }),
    })),
    ...(filters.saleOnly ? [{ key: "sale", label: "Зі знижкою", remove: () => update({ saleOnly: false }) }] : []),
    ...(filters.inStockOnly ? [{ key: "stock", label: "В наявності", remove: () => update({ inStockOnly: false }) }] : []),
  ];

  const hrefFor = (row: CategoryRow) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(carried)) if (v) sp.set(k, v);
    // Якщо категорію знайдено через товари — переносимо запит, щоб побачити саме їх
    if (q && !row.nameMatch) sp.set("q", query.trim());
    const qs = sp.toString();
    return `/catalog/${row.info.slug}${qs ? `?${qs}` : ""}`;
  };

  const filterPanel = (
    <div className="rounded-[22px] bg-[#e9f4fb] p-5">
      <PriceRange
        bounds={BOUNDS}
        value={filters.price}
        onChange={(price) => update({ price })}
      />
      <FilterGroup title="Категорії">
        {categories.map((c) => (
          <Checkbox
            key={c.slug}
            label={c.name}
            count={counts.category[c.slug] ?? 0}
            checked={filters.categories.includes(c.slug)}
            onChange={() => update({ categories: toggle(filters.categories, c.slug) })}
          />
        ))}
      </FilterGroup>
      <FilterGroup title="Бренд">
        {brands.map((b) => (
          <Checkbox
            key={b}
            label={b}
            count={counts.brand[b] ?? 0}
            checked={filters.brands.includes(b)}
            onChange={() => update({ brands: toggle(filters.brands, b) })}
          />
        ))}
      </FilterGroup>
      <FilterGroup title="Додатково">
        <Checkbox
          label="Зі знижкою"
          checked={filters.saleOnly}
          onChange={() => update({ saleOnly: !filters.saleOnly })}
        />
        <Checkbox
          label="В наявності"
          checked={filters.inStockOnly}
          onChange={() => update({ inStockOnly: !filters.inStockOnly })}
        />
      </FilterGroup>
      <ResetButton onClick={resetAll} />
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#f7fafc] text-[#082c45]">
      <SiteHeader query={query} onQueryChange={setQuery} />

      <main className="flex-1">
        <div className="mx-auto max-w-[1440px] px-5 pb-20 pt-6 lg:px-8">
          <Breadcrumbs items={[{ label: "Головна", href: "/" }, { label: "Каталог" }]} />

          <div
            id="catalog-top"
            className="mt-4 flex scroll-mt-28 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
          >
            <div>
              <h1 className="text-[clamp(2rem,4vw,2.9rem)] font-extrabold leading-[1.05] tracking-[-0.04em]">
                Каталог товарів
              </h1>
              <p className="mt-2 text-[#3d5d70]">
                Все необхідне для вашого незабутнього сімейного відпочинку на
                природі
              </p>
            </div>
            <div className="flex items-center gap-3">
              <MobileFiltersButton
                activeCount={chips.length}
                onClick={() => setFiltersOpen(true)}
              />
              <SortSelect value={sort} options={sortOptions} onChange={setSort} />
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr] lg:items-start">
            <aside className="sticky top-28 hidden lg:block" aria-label="Фільтри">
              {filterPanel}
            </aside>

            <div className="min-w-0">
              <section aria-label="Категорії">
                <ActiveChips total={rows.length} chips={chips} />

                {visible.length > 0 ? (
                  <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 xl:grid-cols-3">
                    {visible.map((row) => (
                      <CategoryCard key={row.info.slug} row={row} href={hrefFor(row)} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="Нічого не знайдено"
                    text="Жодна категорія не має товарів з такими параметрами. Спробуйте змінити фільтри або запит."
                    onReset={resetAll}
                  />
                )}

                <Pagination
                  from={paging.from}
                  to={paging.to}
                  totalPages={paging.totalPages}
                  remaining={Math.min(PAGE_SIZE, rows.length - paging.end)}
                  onPage={(p) => {
                    paging.goTo(p);
                    scrollToId("catalog-top");
                  }}
                  onMore={paging.showMore}
                />
              </section>

              {featured.length > 0 && (
                <section className="mt-16" aria-labelledby="featured-title">
                  <div className="mb-5 flex items-end justify-between gap-4">
                    <div>
                      <p className="eyebrow">
                        {q ? "Результати пошуку" : "Встигніть придбати"}
                      </p>
                      <h2
                        id="featured-title"
                        className="mt-1.5 text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl"
                      >
                        {q ? `Товари за запитом «${query.trim()}»` : "Гарячі пропозиції"}
                      </h2>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 xl:grid-cols-4">
                    {featured.map((p) => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        showCategory
                        onAdd={() => add(p.id)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />

      <FilterDrawer
        open={filtersOpen}
        onClose={closeFilters}
        resultLabel={`Показати ${rows.length} ${rows.length === 1 ? "категорію" : "категорій"}`}
      >
        {filterPanel}
      </FilterDrawer>
    </div>
  );
}

function CategoryCard({ row, href }: { row: CategoryRow; href: string }) {
  const { info, items } = row;
  const minPrice = Math.min(...items.map((p) => p.price));
  const maxDiscount = Math.max(...items.map(discountPercent));

  return (
    <Link
      href={href}
      className="product-card group flex flex-col !rounded-[24px] !p-2.5 outline-none focus-visible:ring-4 focus-visible:ring-sky-200"
    >
      <div className="relative aspect-[2/1] overflow-hidden rounded-[50%_50%_16px_16px/18%_18%_16px_16px] bg-sky-50">
        <img
          src={info.image}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover brightness-[1.05] saturate-[1.1] transition duration-700 group-hover:scale-105"
        />
        {maxDiscount > 0 && (
          <span className="absolute bottom-3 left-3 rounded-full bg-[#ffd51f] px-2.5 py-1 text-xs font-black text-[#082c45]">
            Знижки до −{maxDiscount}%
          </span>
        )}
      </div>
      <div className="flex flex-1 items-end justify-between gap-3 px-2.5 pb-2 pt-4">
        <div className="min-w-0">
          <h3 className="text-xl font-extrabold leading-tight tracking-[-0.02em]">
            {info.name}
          </h3>
          <p className="mt-1.5 text-sm text-[#527083]">
            {items.length} {productsWord(items.length)} · від {formatPrice(minPrice)}
          </p>
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#ffd51f] text-[#082c45] shadow-[0_8px_20px_rgba(255,213,31,.3)] transition group-hover:translate-x-1">
          <Icon name="arrow" className="h-5 w-5" />
        </span>
      </div>
    </Link>
  );
}
