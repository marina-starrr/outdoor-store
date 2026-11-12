"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useCart } from "./Cart";
import { ProductCard } from "./catalog-ui";
import type { Product } from "./catalog-data";
import { useCatalog } from "./Catalog";
import { RECENT_STORAGE_KEY, parseRecent, pushRecent } from "./recently-viewed";

/*
 * Історія переглядів зберігається лише в браузері (localStorage) — без
 * акаунта і без запитів на сервер. useSyncExternalStore тримає всі блоки
 * на сторінці та інші вкладки синхронними.
 */

const EVENT = "fc-recent-change";

function read(): string | null {
  try {
    return localStorage.getItem(RECENT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function write(ids: string[]) {
  try {
    if (ids.length) localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(ids));
    else localStorage.removeItem(RECENT_STORAGE_KEY);
  } catch {
    /* приватний режим — історія просто не збережеться */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === RECENT_STORAGE_KEY) onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Список переглянутих товарів (найновіші спочатку) */
export function useRecentlyViewed() {
  // Знімок — рядок, тож порівняння стабільне; на сервері історії немає
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const { byId } = useCatalog();
  const items = useMemo(
    () => parseRecent(raw).flatMap((id) => byId.get(id) ?? []),
    [raw, byId],
  );
  return { items, clear: () => write([]) };
}

/** Запам'ятовує перегляд товару (викликається на сторінці товару) */
export function useTrackView(productId: string) {
  useEffect(() => {
    write(pushRecent(parseRecent(read()), productId));
  }, [productId]);
}

/** Блок «Нещодавно переглянуті» — у стилі «Гарячих пропозицій» */
export default function RecentlyViewed({
  exclude,
  limit = 4,
  className = "mt-16",
}: {
  /** Не показувати цей товар (поточний на сторінці товару) */
  exclude?: string;
  limit?: number;
  className?: string;
}) {
  const { add } = useCart();
  const { items, clear } = useRecentlyViewed();
  const visible: Product[] = items.filter((p) => p.id !== exclude).slice(0, limit);
  if (!visible.length) return null;

  return (
    <section className={className} aria-labelledby="recent-title" data-testid="recently-viewed">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Ви дивились</p>
          <h2 id="recent-title" className="mt-1.5 text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">
            Нещодавно переглянуті
          </h2>
        </div>
        <button
          type="button"
          onClick={clear}
          className="shrink-0 text-sm font-bold text-[#8aa5b5] transition hover:text-[#e5484d]"
        >
          Очистити історію
        </button>
      </div>
      <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 xl:grid-cols-4">
        {visible.map((p) => (
          <ProductCard key={p.id} product={p} showCategory onAdd={() => add(p.id)} />
        ))}
      </div>
    </section>
  );
}
