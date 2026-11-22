"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCart } from "./Cart";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import RecentlyViewed from "./RecentlyViewed";
import {
  ActiveChips,
  Breadcrumbs,
  Checkbox,
  CheckboxList,
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
  visibleSortOptions,
  productsWord,
  roundBounds,
  type CapacityId,
  type CategorySlug,
  type Product,
  type ProductSortId,
} from "./catalog-data";
import { useCatalog } from "./Catalog";
import { collapseVariants, variantGroups } from "./product-variants";
import { discountsEnabled } from "./shop-config";
import {
  availableFacets,
  facetValues,
  matchesFacets,
  placesOf,
  shipsToday,
  type FacetId,
  type FacetSelection,
} from "./catalog-facets";
import { matchesSearch } from "./search";

const PAGE_SIZE = 8;

type Filters = {
  price: [number, number];
  brands: string[];
  capacity: CapacityId[];
  /** Тип, колір, розмір, об'єм — з назв товарів (catalog-facets) */
  facets: FacetSelection;
  saleOnly: boolean;
  inStockOnly: boolean;
  /** Лише готові до відправки: є на складі, не «під замовлення» */
  readyOnly: boolean;
};

type Skip = Exclude<keyof Filters, "facets"> | FacetId;

const toggle = <T,>(list: T[], value: T) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

function matches(p: Product, f: Filters, query: string, skip?: Skip) {
  if (query && !matchesSearch(p, query)) return false;
  if (skip !== "price" && (p.price < f.price[0] || p.price > f.price[1]))
    return false;
  if (skip !== "brands" && f.brands.length && !f.brands.includes(p.brand))
    return false;
  if (skip !== "capacity" && f.capacity.length) {
    const places = placesOf(p);
    if (places === undefined || !capacityOptions.some((o) => f.capacity.includes(o.id) && o.test(places)))
      return false;
  }
  if (!matchesFacets(p, f.facets, skip as FacetId)) return false;
  if (f.saleOnly && !p.oldPrice) return false;
  if (f.inStockOnly && !p.inStock) return false;
  if (f.readyOnly && !shipsToday(p)) return false;
  return true;
}

const sorters: Record<ProductSortId, (a: Product, b: Product) => number> = {
  popular: (a, b) => a.popularity - b.popularity,
  cheap: (a, b) => a.price - b.price,
  expensive: (a, b) => b.price - a.price,
  discount: (a, b) => discountPercent(b) - discountPercent(a),
  // Товари без відгуків (рейтинг 0) — у кінці, у порядку «Популярні»
  rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews || a.popularity - b.popularity,
};

export default function CategoryListing({ slug }: { slug: CategorySlug }) {
  const category = categoryBySlug[slug];
  const { products } = useCatalog();
  const items = useMemo(() => products.filter((p) => p.category === slug), [products, slug]);
  const bounds = useMemo(() => roundBounds(priceBounds(items)), [items]);
  const categoryBrands = useMemo(
    () => Array.from(new Set(items.map((p) => p.brand))).sort(),
    [items],
  );
  const hasCapacity = items.some((p) => placesOf(p) !== undefined);
  const facets = useMemo(() => availableFacets(items, slug), [items, slug]);
  const hasOnRequest = items.some((p) => p.inStock && p.onRequest);

  const initialFilters = useMemo<Filters>(
    () => ({
      price: bounds,
      brands: [],
      capacity: [],
      facets: {},
      saleOnly: false,
      inStockOnly: false,
      readyOnly: false,
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
      facets: Object.fromEntries(
        facets.map((f) => [f.id, listParam(sp, f.param).filter((v) => f.values.includes(v))]),
      ),
      saleOnly: sp.get("sale") === "1",
      inStockOnly: sp.get("stock") === "1",
      readyOnly: sp.get("ready") === "1",
    });
    if (sortParam && sortParam in sorters) setSort(sortParam);
    setQuery(sp.get("q") ?? "");
    setUrlReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [bounds, categoryBrands, facets]);

  // 2) Далі тримаємо URL у синхроні, щоб посиланням можна було поділитися
  useEffect(() => {
    if (!urlReady) return;
    writeSearchParams({
      q: query.trim() || undefined,
      min: filters.price[0] !== bounds[0] ? String(filters.price[0]) : undefined,
      max: filters.price[1] !== bounds[1] ? String(filters.price[1]) : undefined,
      brand: filters.brands.join(",") || undefined,
      cap: filters.capacity.join(",") || undefined,
      ...Object.fromEntries(facets.map((f) => [f.param, filters.facets[f.id]?.join(",") || undefined])),
      sale: filters.saleOnly ? "1" : undefined,
      stock: filters.inStockOnly ? "1" : undefined,
      ready: filters.readyOnly ? "1" : undefined,
      sort: sort !== "popular" ? sort : undefined,
    });
  }, [urlReady, query, filters, sort, bounds, facets]);

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
    const facet = Object.fromEntries(facets.map((f) => [f.id, {} as Record<string, number>]));
    for (const p of items) {
      if (matches(p, filters, normalizedQuery, "brands"))
        brand[p.brand] = (brand[p.brand] ?? 0) + 1;
      const places = placesOf(p);
      if (places !== undefined && matches(p, filters, normalizedQuery, "capacity"))
        for (const o of capacityOptions)
          if (o.test(places)) capacity[o.id] = (capacity[o.id] ?? 0) + 1;
      for (const f of facets)
        if (matches(p, filters, normalizedQuery, f.id))
          for (const v of facetValues(p)[f.id]) facet[f.id][v] = (facet[f.id][v] ?? 0) + 1;
    }
    return { brand, capacity, facet };
  }, [items, filters, normalizedQuery, facets]);

  // Варіанти (розміри, кольори) одного товару — одна картка
  const groups = useMemo(() => variantGroups(products), [products]);
  const cards = useMemo(() => collapseVariants(results, groups), [results, groups]);

  const paging = usePaging(
    cards.length,
    PAGE_SIZE,
    JSON.stringify([filters, normalizedQuery, sort]),
  );
  const visible = cards.slice(paging.start, paging.end);

  const update = (patch: Partial<Filters>) =>
    setFilters((f) => ({ ...f, ...patch }));
  const setFacet = (id: FacetId, values: string[]) =>
    setFilters((f) => ({ ...f, facets: { ...f.facets, [id]: values } }));

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
    ...facets.flatMap((f) =>
      (filters.facets[f.id] ?? []).map((v) => ({
        key: `${f.id}-${v}`,
        label: f.id === "size" ? `Розмір ${v}` : v,
        remove: () => setFacet(f.id, (filters.facets[f.id] ?? []).filter((x) => x !== v)),
      })),
    ),
    ...(filters.saleOnly ? [{ key: "sale", label: "Зі знижкою", remove: () => update({ saleOnly: false }) }] : []),
    ...(filters.inStockOnly ? [{ key: "stock", label: "В наявності", remove: () => update({ inStockOnly: false }) }] : []),
    ...(filters.readyOnly ? [{ key: "ready", label: "Готові до відправки", remove: () => update({ readyOnly: false }) }] : []),
  ];

  const facetGroup = (id: FacetId) => {
    const f = facets.find((x) => x.id === id);
    if (!f) return null;
    const chosen = filters.facets[id] ?? [];
    return (
      <FilterGroup key={id} title={f.title}>
        <CheckboxList
          options={f.values.map((v) => ({ value: v, label: v }))}
          isChecked={(v) => chosen.includes(v)}
          count={(v) => counts.facet[id]?.[v] ?? 0}
          onToggle={(v) => setFacet(id, toggle(chosen, v))}
        />
      </FilterGroup>
    );
  };

  const filterPanel = (
    <div className="rounded-[22px] bg-[#e9f4fb] p-5">
      <PriceRange
        bounds={bounds}
        value={filters.price}
        onChange={(price) => update({ price })}
      />
      {facetGroup("type")}
      {categoryBrands.length > 1 && (
        <FilterGroup title="Бренд">
          <CheckboxList
            options={categoryBrands.map((b) => ({ value: b, label: b }))}
            isChecked={(b) => filters.brands.includes(b)}
            count={(b) => counts.brand[b] ?? 0}
            onToggle={(b) => update({ brands: toggle(filters.brands, b) })}
          />
        </FilterGroup>
      )}
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
      {facetGroup("size")}
      {facetGroup("volume")}
      {facetGroup("color")}
      <FilterGroup title="Додатково">
        {discountsEnabled() && (
          <Checkbox
            label="Зі знижкою"
            checked={filters.saleOnly}
            onChange={() => update({ saleOnly: !filters.saleOnly })}
          />
        )}
        <Checkbox
          label="В наявності"
          checked={filters.inStockOnly}
          onChange={() => update({ inStockOnly: !filters.inStockOnly })}
        />
        {hasOnRequest && (
          <Checkbox
            label="Готові до відправки"
            checked={filters.readyOnly}
            onChange={() => update({ readyOnly: !filters.readyOnly })}
          />
        )}
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
                options={visibleSortOptions(productSortOptions)}
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
                total={cards.length}
                query={query.trim()}
                chips={chips}
              />

              {visible.length > 0 ? (
                <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {visible.map(({ product: p, group }) => (
                    <ProductCard key={p.id} product={p} group={group} onAdd={() => add(p.id)} />
                  ))}
                </div>
              ) : (
                items.length ? (
                  <EmptyState
                    title="За цими параметрами нічого немає"
                    text="Спробуйте розширити діапазон ціни або прибрати частину фільтрів."
                    onReset={resetAll}
                  />
                ) : (
                  <EmptyState title="Товари скоро з’являться" text="Ми саме наповнюємо цю категорію — загляньте трохи згодом." />
                )
              )}

              <Pagination
                from={paging.from}
                to={paging.to}
                totalPages={paging.totalPages}
                remaining={Math.min(PAGE_SIZE, cards.length - paging.end)}
                onPage={(p) => {
                  paging.goTo(p);
                  scrollToId("listing-top");
                }}
                onMore={paging.showMore}
              />
            </section>
          </div>

          <RecentlyViewed />
        </div>
      </main>

      <SiteFooter />

      <FilterDrawer
        open={filtersOpen}
        onClose={closeFilters}
        resultLabel={`Показати ${cards.length} ${productsWord(cards.length)}`}
      >
        {filterPanel}
      </FilterDrawer>
    </div>
  );
}
