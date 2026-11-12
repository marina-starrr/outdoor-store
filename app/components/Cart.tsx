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
import { useAuth } from "./Auth";
import { MAX_QTY, maxQtyFor, resolveLines, type CartLine, type ResolvedLine } from "./cart-logic";
import { useCatalog } from "./Catalog";
import { CART_STORAGE_KEY, readCartStorage, writeCartStorage } from "./cart-storage";

type ToastAction = {
  label: string;
  onClick: () => void;
  /** Не показувати кнопку, коли панель кошика вже відкрита */
  hideWhenCartOpen?: boolean;
};

type CartContextValue = {
  lines: ResolvedLine[];
  /** Загальна кількість одиниць товару */
  count: number;
  /** Чи прочитано кошик з localStorage (до цього count = 0) */
  ready: boolean;
  add: (productId: string, quantity?: number) => void;
  setQty: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  /** Коротке сповіщення внизу екрана, за потреби — з кнопкою дії */
  notify: (message: string, action?: ToastAction) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

const clampQty = (n: number) => Math.max(1, Math.min(MAX_QTY, Math.round(n)));

/** Об'єднання кошиків: для однакових товарів береться більша кількість */
function unionMax(a: CartLine[], b: CartLine[]) {
  const map = new Map(a.map((l) => [l.id, l.qty]));
  for (const l of b) map.set(l.id, Math.max(map.get(l.id) ?? 0, l.qty));
  return [...map].map(([id, qty]) => ({ id, qty: clampQty(qty) }));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [rawLines, setRawLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; action?: ToastAction } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const { status, event } = useAuth();
  /** Останній стан кошика, відомий серверу (щоб не надсилати зайвих запитів) */
  const syncedRef = useRef("");
  const handledEventRef = useRef(0);

  // Кошик зберігається у браузері — переживає перезавантаження сторінки
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- читання localStorage можливе лише після гідратації */
    setRawLines(readCartStorage());
    setReady(true);
    // Синхронізація між відкритими вкладками
    const onStorage = (e: StorageEvent) => {
      if (e.key === CART_STORAGE_KEY) setRawLines(readCartStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (ready) writeCartStorage(rawLines);
  }, [rawLines, ready]);

  // Вхід / вихід / відновлення сесії: кошик береться з акаунта
  useEffect(() => {
    if (!ready || event.type === "none" || handledEventRef.current === event.seq) return;
    handledEventRef.current = event.seq;
    /* eslint-disable react-hooks/set-state-in-effect -- реакція на зміну сесії */
    if (event.type === "logout") {
      // Кошик лишається збереженим в акаунті, а на цьому пристрої очищується
      syncedRef.current = "";
      setRawLines([]);
      return;
    }
    syncedRef.current = JSON.stringify(event.cart);
    // При відновленні сесії зберігаємо й те, що встигли додати до її завантаження
    setRawLines(event.type === "restore" ? unionMax(event.cart, readCartStorage()) : event.cart);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [event, ready]);

  // Для авторизованого користувача кожна зміна кошика зберігається в акаунті
  useEffect(() => {
    if (status !== "user" || !ready) return;
    const body = JSON.stringify(rawLines);
    if (body === syncedRef.current) return;
    const t = window.setTimeout(() => {
      syncedRef.current = body;
      fetch("/api/cart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: rawLines }),
      }).catch(() => {
        syncedRef.current = ""; // спробуємо ще раз при наступній зміні
      });
    }, 500);
    return () => window.clearTimeout(t);
  }, [rawLines, status, ready]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const notify = useCallback((message: string, action?: ToastAction) => {
    setToast({ message, action });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), action ? 4500 : 2400);
  }, []);

  const { byId } = useCatalog();
  /** Скільки можна покласти в кошик (не більше залишку на складі) */
  const limitFor = useCallback((id: string) => {
    const p = byId.get(id);
    return p ? Math.max(1, maxQtyFor(p)) : MAX_QTY;
  }, [byId]);

  // Кількість не може перевищувати залишок (його міг змінити адміністратор)
  const lines = useMemo(
    () => resolveLines(rawLines, byId).map((l) => ({ ...l, qty: Math.min(l.qty, Math.max(1, maxQtyFor(l.product))) })),
    [rawLines, byId],
  );

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const add = useCallback(
    (productId: string, quantity = 1) => {
      const product = byId.get(productId);
      const name = product?.name ?? "Товар";
      if (product && !product.inStock) {
        notify(`${name} — немає в наявності`);
        return;
      }
      const limit = limitFor(productId);
      const current = rawLines.find((l) => l.id === productId)?.qty ?? 0;
      if (current >= limit) {
        notify(`Більше немає на складі: у кошику вже ${limit} шт.`, { label: "Відкрити кошик", onClick: openCart, hideWhenCartOpen: true });
        return;
      }
      setRawLines((list) => {
        const existing = list.find((l) => l.id === productId);
        return existing
          ? list.map((l) =>
              l.id === productId ? { ...l, qty: Math.min(limit, clampQty(l.qty + quantity)) } : l,
            )
          : [...list, { id: productId, qty: Math.min(limit, clampQty(quantity)) }];
      });
      notify(
        quantity > 1 ? `${name} × ${quantity} — у кошику` : `${name} — у кошику`,
        { label: "Відкрити кошик", onClick: openCart, hideWhenCartOpen: true },
      );
    },
    [notify, openCart, byId, limitFor, rawLines],
  );

  const setQty = useCallback((productId: string, quantity: number) => {
    const limit = limitFor(productId);
    setRawLines((list) =>
      list.map((l) => (l.id === productId ? { ...l, qty: Math.min(limit, clampQty(quantity)) } : l)),
    );
  }, [limitFor]);

  const remove = useCallback(
    (productId: string) => {
      let removed: { line: CartLine; index: number } | undefined;
      setRawLines((list) => {
        const index = list.findIndex((l) => l.id === productId);
        if (index === -1) return list;
        removed = { line: list[index], index };
        return list.filter((l) => l.id !== productId);
      });
      // Можливість скасувати випадкове видалення
      notify("Товар видалено з кошика", {
        label: "Повернути",
        onClick: () => {
          if (!removed) return;
          const { line, index } = removed;
          setRawLines((list) =>
            list.some((l) => l.id === line.id)
              ? list
              : [...list.slice(0, index), line, ...list.slice(index)],
          );
          setToast(null);
        },
      });
    },
    [notify],
  );

  const clear = useCallback(() => setRawLines([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: lines.reduce((s, l) => s + l.qty, 0),
      ready,
      add,
      setQty,
      remove,
      clear,
      isOpen,
      openCart,
      closeCart,
      notify,
    }),
    [lines, ready, add, setQty, remove, clear, isOpen, openCart, closeCart, notify],
  );

  return (
    <CartContext.Provider value={value}>
      {children}
      {toast && (
        <div
          role="status"
          className={`fixed left-1/2 z-[90] flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-4 rounded-full bg-[#082c45] py-2.5 pl-5 pr-2.5 text-sm font-bold text-white shadow-2xl ${
            // Коли відкрита панель кошика — показуємо зверху, щоб не закривати її кнопки
            isOpen ? "top-20" : "bottom-24 lg:bottom-5"
          }`}
        >
          <span className="min-w-0 truncate py-0.5">{toast.message}</span>
          {toast.action && !(isOpen && toast.action.hideWhenCartOpen) ? (
            <button
              onClick={() => {
                toast.action!.onClick();
                setToast(null);
              }}
              className="shrink-0 rounded-full bg-[#ffd51f] px-4 py-1.5 text-xs font-extrabold text-[#082c45] transition hover:bg-[#ffe044]"
            >
              {toast.action.label}
            </button>
          ) : (
            <span className="pr-2.5" />
          )}
        </div>
      )}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
