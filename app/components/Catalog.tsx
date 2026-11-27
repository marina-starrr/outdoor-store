"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { brandsOf, type Product } from "./catalog-data";

/*
 * Каталог у браузері.
 *
 * Сторінка приходить лише зі своїми товарами (CatalogSeed: категорія — її товари,
 * головна — вітрина, товар — схожі й варіанти; див. lib/catalog-seeds.ts), тож HTML
 * легкий, а Google бачить ті самі товари. Увесь каталог (для пошуку в шапці, кошика,
 * обраного, порівняння) браузер довантажує один раз після відкриття сторінки
 * з /api/catalog/<версія> — файл кешується на CDN і в браузері, а після будь-якої
 * зміни каталогу сторінки просять нову версію.
 *
 * Раніше кожна сторінка несла весь каталог у собі (мегабайти) — через це Vercel
 * вимкнув сайт за перевищення трафіку.
 */

type CatalogValue = {
  /** Видимі товари: увесь каталог, а поки він вантажиться — товари цієї сторінки */
  products: Product[];
  byId: ReadonlyMap<string, Product>;
  brands: string[];
  /** Увесь каталог уже завантажено */
  complete: boolean;
};

/**
 * full — увесь каталог (null — ще вантажиться); pageSeed — товари поточної сторінки
 * для компонентів над нею (кошик, обране, порівняння живуть у layout).
 * undefined — немає CatalogProvider
 */
type RootValue = { full: Product[] | null; pageSeed: Product[] | null; register: (products: Product[]) => void };
const RootContext = createContext<RootValue | undefined>(undefined);
const SeedContext = createContext<Product[] | null>(null);

const EMPTY: Product[] = [];
/** Похідні дані (byId, бренди) — раз на список, а не в кожному компоненті */
const derived = new WeakMap<Product[], Omit<CatalogValue, "complete">>();

function valueOf(products: Product[]) {
  let v = derived.get(products);
  if (!v) {
    v = { products, byId: new Map(products.map((p) => [p.id, p])), brands: brandsOf(products) };
    derived.set(products, v);
  }
  return v;
}

const RETRY_MS = 5_000;

async function fetchCatalog(version: number): Promise<Product[]> {
  const res = await fetch(`/api/catalog/${version}`);
  if (!res.ok) throw new Error(`каталог ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data?.products)) throw new Error("каталог: невірна відповідь");
  return data.products;
}

/** version — версія каталогу з сервера: файл /api/catalog/<версія> незмінний і кешується */
export function CatalogProvider({ version, children }: { version: number; children: ReactNode }) {
  const [full, setFull] = useState<Product[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (attempt: number) =>
      fetchCatalog(version)
        .then((products) => !cancelled && setFull(products))
        .catch(() => {
          // Немає мережі — лишаються товари сторінки; ще одна спроба трохи згодом
          if (!cancelled && attempt < 2) timer = setTimeout(() => load(attempt + 1), RETRY_MS);
        });
    // Після того як сторінка показалась і стала інтерактивною
    const idle = window.requestIdleCallback?.(() => load(0), { timeout: 1_500 });
    if (idle === undefined) timer = setTimeout(() => load(0), 200);
    return () => {
      cancelled = true;
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
      clearTimeout(timer);
    };
  }, [version]);

  const [pageSeed, setPageSeed] = useState<Product[] | null>(null);
  const value = useMemo<RootValue>(() => ({ full, pageSeed, register: setPageSeed }), [full, pageSeed]);
  return <RootContext.Provider value={value}>{children}</RootContext.Provider>;
}

/** Товари, які сторінка показує одразу (з сервера, разом з HTML) */
export function CatalogSeed({ products, children }: { products: Product[]; children: ReactNode }) {
  const root = useContext(RootContext);
  const register = root?.register;
  // Кошик і порівняння (у layout, над сторінкою) теж мають бачити товари сторінки,
  // поки не завантажився увесь каталог — інакше клік «до порівняння» губився б
  useEffect(() => register?.(products), [register, products]);
  return <SeedContext.Provider value={products}>{children}</SeedContext.Provider>;
}

export function useCatalog(): CatalogValue {
  const root = useContext(RootContext);
  const seed = useContext(SeedContext);
  if (!root) throw new Error("useCatalog must be used inside <CatalogProvider>");
  return { ...valueOf(root.full ?? seed ?? root.pageSeed ?? EMPTY), complete: root.full !== null };
}
