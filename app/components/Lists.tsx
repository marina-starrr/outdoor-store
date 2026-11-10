"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./Auth";
import { useCart } from "./Cart";
import {
  COMPARE_STORAGE_KEY,
  FAVORITES_STORAGE_KEY,
  readIds,
  writeIds,
} from "./cart-storage";
import { categoryBySlug, products, type Product } from "./catalog-data";

/** Скільки товарів однієї категорії можна порівнювати одночасно */
export const COMPARE_LIMIT = 4;

const byId = new Map(products.map((p) => [p.id, p]));
const known = (ids: string[]) => ids.filter((id) => byId.has(id));

type ListsContextValue = {
  ready: boolean;
  favorites: Product[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  clearFavorites: () => void;
  compare: Product[];
  isCompared: (id: string) => boolean;
  toggleCompare: (id: string) => void;
  /** Прибрати з порівняння всі товари категорії (або всі взагалі) */
  clearCompare: (category?: string) => void;
};

const ListsContext = createContext<ListsContextValue | null>(null);

/**
 * Обране (синхронізується з акаунтом, як і кошик) та порівняння
 * (зберігається лише в браузері — це тимчасовий робочий список)
 */
export function ListsProvider({ children }: { children: ReactNode }) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const { status, event } = useAuth();
  const { notify } = useCart();
  const router = useRouter();
  const syncedRef = useRef("");
  const handledEventRef = useRef(0);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- читання localStorage можливе лише після гідратації */
    setFavoriteIds(known(readIds(FAVORITES_STORAGE_KEY)));
    setCompareIds(known(readIds(COMPARE_STORAGE_KEY)));
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    const onStorage = (e: StorageEvent) => {
      if (e.key === FAVORITES_STORAGE_KEY) setFavoriteIds(known(readIds(FAVORITES_STORAGE_KEY)));
      if (e.key === COMPARE_STORAGE_KEY) setCompareIds(known(readIds(COMPARE_STORAGE_KEY)));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (ready) writeIds(FAVORITES_STORAGE_KEY, favoriteIds);
  }, [favoriteIds, ready]);
  useEffect(() => {
    if (ready) writeIds(COMPARE_STORAGE_KEY, compareIds);
  }, [compareIds, ready]);

  // Вхід / вихід / відновлення сесії — обране береться з акаунта
  useEffect(() => {
    if (!ready || event.type === "none" || handledEventRef.current === event.seq) return;
    handledEventRef.current = event.seq;
    /* eslint-disable react-hooks/set-state-in-effect -- реакція на зміну сесії */
    if (event.type === "logout") {
      syncedRef.current = "";
      setFavoriteIds([]);
      return;
    }
    syncedRef.current = JSON.stringify(event.favorites);
    setFavoriteIds(
      known(
        event.type === "restore"
          ? [...new Set([...event.favorites, ...readIds(FAVORITES_STORAGE_KEY)])]
          : event.favorites,
      ),
    );
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [event, ready]);

  // Для авторизованого користувача зміни обраного зберігаються в акаунті
  useEffect(() => {
    if (status !== "user" || !ready) return;
    const body = JSON.stringify(favoriteIds);
    if (body === syncedRef.current) return;
    const t = window.setTimeout(() => {
      syncedRef.current = body;
      fetch("/api/favorites", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: favoriteIds }),
      }).catch(() => {
        syncedRef.current = "";
      });
    }, 500);
    return () => window.clearTimeout(t);
  }, [favoriteIds, status, ready]);

  const toggleFavorite = useCallback(
    (id: string) => {
      const adding = !favoriteIds.includes(id);
      setFavoriteIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [id, ...list]));
      notify(
        adding ? "Додано в обране" : "Прибрано з обраного",
        adding ? { label: "Переглянути", onClick: () => router.push("/favorites") } : undefined,
      );
    },
    [favoriteIds, notify, router],
  );

  const toggleCompare = useCallback(
    (id: string) => {
      const product = byId.get(id);
      if (!product) return;
      if (compareIds.includes(id)) {
        setCompareIds((list) => list.filter((x) => x !== id));
        notify("Прибрано з порівняння");
        return;
      }
      const sameCategory = compareIds.filter((x) => byId.get(x)?.category === product.category);
      if (sameCategory.length >= COMPARE_LIMIT) {
        notify(
          `Можна порівнювати до ${COMPARE_LIMIT} товарів категорії «${categoryBySlug[product.category].name}»`,
          { label: "До порівняння", onClick: () => router.push(`/compare?category=${product.category}`) },
        );
        return;
      }
      setCompareIds((list) => [...list, id]);
      notify(
        sameCategory.length ? `Додано до порівняння (${sameCategory.length + 1})` : "Додано до порівняння",
        { label: "Порівняти", onClick: () => router.push(`/compare?category=${product.category}`) },
      );
    },
    [compareIds, notify, router],
  );

  const clearFavorites = useCallback(() => setFavoriteIds([]), []);
  const clearCompare = useCallback(
    (category?: string) =>
      setCompareIds((list) => (category ? list.filter((id) => byId.get(id)?.category !== category) : [])),
    [],
  );

  const value = useMemo<ListsContextValue>(() => {
    const favSet = new Set(favoriteIds);
    const cmpSet = new Set(compareIds);
    return {
      ready,
      favorites: favoriteIds.map((id) => byId.get(id)!).filter(Boolean),
      isFavorite: (id) => favSet.has(id),
      toggleFavorite,
      clearFavorites,
      compare: compareIds.map((id) => byId.get(id)!).filter(Boolean),
      isCompared: (id) => cmpSet.has(id),
      toggleCompare,
      clearCompare,
    };
  }, [ready, favoriteIds, compareIds, toggleFavorite, clearFavorites, toggleCompare, clearCompare]);

  return <ListsContext.Provider value={value}>{children}</ListsContext.Provider>;
}

export function useLists() {
  const ctx = useContext(ListsContext);
  if (!ctx) throw new Error("useLists must be used inside <ListsProvider>");
  return ctx;
}
