"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { brandsOf, type Product } from "./catalog-data";

/*
 * Каталог у браузері. Товари приходять із сервера (база даних) через
 * кореневий layout, тож ціни й залишки, змінені в адмін-панелі, одразу
 * видно в каталозі, кошику, обраному тощо.
 */

type CatalogValue = {
  /** Видимі товари */
  products: Product[];
  byId: ReadonlyMap<string, Product>;
  brands: string[];
};

const CatalogContext = createContext<CatalogValue | null>(null);

export function CatalogProvider({ products, children }: { products: Product[]; children: ReactNode }) {
  const value = useMemo<CatalogValue>(
    () => ({
      products,
      byId: new Map(products.map((p) => [p.id, p])),
      brands: brandsOf(products),
    }),
    [products],
  );
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used inside <CatalogProvider>");
  return ctx;
}
