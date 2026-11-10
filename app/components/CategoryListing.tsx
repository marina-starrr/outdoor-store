"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCart } from "./Cart";
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
  capacityOptions,
  categoryBySlug,
  discountPercent,
  formatPrice,
  priceBounds,
  productSortOptions,
  productsByCategory,
  productsWord,
  roundBounds,
  type CapacityId,
  type CategorySlug,
  type Product,
  type ProductSortId,
} from "./catalog-data";

const PAGE_SIZE = 8;

type Filters = {
  price: [number, number];
  brands: string[];
  capacity: CapacityId[];
  saleOnly: boolean;
  inStockOnly: boolean;
};

const toggle = <T,>(list: T[], value: T) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

function matches(p: Product, f: Filters, query: string, skip?: keyof Filters) {
  if (query && !`${p.name} ${p.brand}`.toLocaleLowerCase("uk").includes(query))
    return false;
  if (skip !== "price" && (p.price < f.price[0] || p.price > f.price[1]))
    return false;
  if (skip !== "brands" && f.brands.length && !f.brands.includes(p.brand))
    return false;
  if (
    skip !== "capacity" &&
    f.capacity.length &&
    !capacityOptions.some(
      (o) => f.capacity.includes(o.id) && p.capacity !== undefined && o.test(p.capacity),
    )
  )
    return false;
  if (f.saleOnly && !p.oldPrice) return false;
  if (f.inStockOnly && !p.inStock) return false;
  return true;
}

const sorters: Record<ProductSortId, (a: Product, b: Product) => number> = {
  popular: (a, b) => a.popularity - b.popularity,
  cheap: (a, b) => a.price - b.price,
  expensive: (a, b) => b.price - a.price,
  discount: (a, b) => discountPercent(b) - discountPercent(a),
  rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
};

export default function CategoryListing({ slug }: { slug: CategorySlug }) {
  const category = categoryBySlug[slug];
  const items = useMemo(() => productsByCategory(slug), [slug]);
  const bounds = useMemo(() => roundBounds(priceBounds(items)), [items]);
  const categoryBrands = useMemo(
    () => Array.from(new Set(items.map((p) => p.brand))).sort(),
    [items],
  );
  const hasCapacity = items.some((p) => p.capacity !== undefined);

  const initialFilters = useMemo<Filters>(
    () => ({
      price: bounds,
      brands: [],
      capacity: [],
      saleOnly: false,
      inStockOnly: false,
    }),
    [bounds],
  );

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [sort, setSort] = useState<ProductSortId>("popular");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [urlReady, setUrlReady] = useState(false);
  const { add } = useCart();

  // 1) Після завантаження підхоплюємо фільтри з URL (напр. прийшли з /catalog)
  useEffect(() => {
    const sp = readSearchParams();
    const min = numParam(sp, "min");
    const max = numParam(sp, "max");
    const sortParam = sp.get("sort") as ProductSortId | null;
    /* eslint-disable react-hooks/set-state-in-effect -- одноразова ініціалізація з URL після гідратації */
    setFilters({
      price: [
        Math.max(bounds[0], Math.min(min ?? bounds[0], bounds[1])),
        Math.min(bounds[1], Math.max(max ?? bounds[1], bounds[0])),
      ],
      brands: listParam(sp, "brand").filter((b) => categoryBrands.includes(b)),
      capacity: listParam(sp, "cap").filter((c): c is CapacityId =>
        capacityOptions.some((o) => o.id === c),
      ),
      saleOnly: sp.get("sale") === "1",
      inStockOnly: sp.get("stock") === "1",
    });
    if (sortParam && sortParam in sorters) setSort(sortParam);
    setQuery(sp.get("q") ?? "");
    setUrlReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [bounds, categoryBrands]);

  // 2) Далі тримаємо URL у синхроні, щоб посиланням можна було поділитися
  useEffect(() => {
    if (!urlReady) return;
    writeSearchParams({
      q: query.trim() || undefined,
      min: filters.price[0] !== bounds[0] ? String(filters.price[0]) : undefined,
      max: filters.price[1] !== bounds[1] ? String(filters.price[1]) : undefined,
      brand: filters.brands.join(",") || undefined,
      cap: filters.capacity.join(",") || undefined,
      sale: filters.saleOnly ? "1" : undefined,
      stock: filters.inStockOnly ? "1" : undefined,
      sort: sort !== "popular" ? sort : undefined,
    });
  }, [urlReady, query, filters, sort, bounds]);

  const normalizedQuery = query.trim().toLocaleLowerCase("uk");

  const results = useMemo(
    () =>
      items
        .filter((p) => matches(p, filters, normalizedQuery))
        .sort(sorters[sort]),
    [items, filters, normalizedQuery, sort],
  );

  // Лічильники біля чекбоксів: скільки товарів буде, якщо обрати цю опцію
  const counts = useMemo(() => {
    const brand: Record<string, number> = {};
    const capacity: Record<string, number> = {};
    for (const p of items) {
      if (matches(p, filters, normalizedQuery, "brands"))
        brand[p.brand] = (brand[p.brand] ?? 0) + 1;
      if (p.capacity !== undefined && matches(p, filters, normalizedQuery, "capacity"))
        for (const o of capacityOptions)
          if (o.test(p.capacity)) capacity[o.id] = (capacity[o.id] ?? 0) + 1;
    }
    return { brand, capacity };
  }, [items, filters, normalizedQuery]);

  const paging = usePaging(
    results.length,
    PAGE_SIZE,
    JSON.stringify([filters, normalizedQuery, sort]),
  );
  const visible = results.slice(paging.start, paging.end);

  const update = (patch: Partial<Filters>) =>
    setFilters((f) => ({ ...f, ...patch }));

  const resetAll = () => {
    setFilters(initialFilters);
    setQuery("");
  };

  const closeFilters = useCallback(() => setFiltersOpen(false), []);

  const isPriceChanged =
    filters.price[0] !== bounds[0] || filters.price[1] !== bounds[1];
  const chips: Chip[] = [
    ...(isPriceChanged
      ? [{ key: "price", label: `${formatPrice(filters.price[0])} – ${formatPrice(filters.price[1])}`, remove: () => update({ price: bounds }) }]
      : []),
    ...filters.brands.map((b) => ({
      key: `b-${b}`,
      label: b,
      remove: () => update({ brands: filters.brands.filter((x) => x !== b) }),
    })),
    ...filters.capacity.map((c) => ({
      key: `c-${c}`,
      label: capacityOptions.find((o) => o.id === c)!.label,
      remove: () => update({ capacity: filters.capacity.filter((x) => x !== c) }),
    })),
    ...(filters.saleOnly ? [{ key: "sale", label: "Зі знижкою", remove: () => update({ saleOnly: false }) }] : []),
    ...(filters.inStockOnly ? [{ key: "stock", label: "В наявності", remove: () => update({ inStockOnly: false }) }] : []),
  ];

  const filterPanel = (
    <div className="rounded-[22px] bg-[#e9f4fb] p-5">
      <PriceRange
        bounds={bounds}
        value={filters.price}
        onChange={(price) => update({ price })}
      />
      <FilterGroup title="Бренд">
        {categoryBrands.map((brand) => (
          <Checkbox
            key={brand}
            label={brand}
            count={counts.brand[brand] ?? 0}
            checked={filters.brands.includes(brand)}
            onChange={() => update({ brands: toggle(filters.brands, brand) })}
          />
        ))}
      </FilterGroup>
      {hasCapacity && (
        <FilterGroup title="Місткість">
          {capacityOptions.map((o) => (
            <Checkbox
              key={o.id}
              label={o.label}
              count={counts.capacity[o.id] ?? 0}
              checked={filters.capacity.includes(o.id)}
              onChange={() => update({ capacity: toggle(filters.capacity, o.id) })}
            />
          ))}
        </FilterGroup>
      )}
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
          <Breadcrumbs
            items={[
              { label: "Головна", href: "/" },
              { label: "Каталог", href: "/catalog" },
              { label: category.name },
            ]}
          />

          <div
            id="listing-top"
            className="mt-4 flex scroll-mt-28 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
          >
            <div>
              <h1 className="text-[clamp(2rem,4vw,2.9rem)] font-extrabold leading-[1.05] tracking-[-0.04em]">
                {category.title}
              </h1>
              <p className="mt-2 text-[#3d5d70]">{category.subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              <MobileFiltersButton
                activeCount={chips.length}
                onClick={() => setFiltersOpen(true)}
              />
              <SortSelect
                value={sort}
                options={productSortOptions}
                onChange={setSort}
              />
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr] lg:items-start">
            <aside className="sticky top-28 hidden lg:block" aria-label="Фільтри">
              {filterPanel}
            </aside>

            <section aria-label="Товари">
              <ActiveChips
                total={results.length}
                query={query.trim()}
                chips={chips}
              />

              {visible.length > 0 ? (
                <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {visible.map((p) => (
                    <ProductCard key={p.id} product={p} onAdd={() => add(p.id)} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="За цими параметрами нічого немає"
                  text="Спробуйте розширити діапазон ціни або прибрати частину фільтрів."
                  onReset={resetAll}
                />
              )}

              <Pagination
                from={paging.from}
                to={paging.to}
                totalPages={paging.totalPages}
                remaining={Math.min(PAGE_SIZE, results.length - paging.end)}
                onPage={(p) => {
                  paging.goTo(p);
                  scrollToId("listing-top");
                }}
                onMore={paging.showMore}
              />
            </section>
          </div>
        </div>
      </main>

      <SiteFooter />

      <FilterDrawer
        open={filtersOpen}
        onClose={closeFilters}
        resultLabel={`Показати ${results.length} ${productsWord(results.length)}`}
      >
        {filterPanel}
      </FilterDrawer>
    </div>
  );
}
