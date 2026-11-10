import type { CartLine } from "./cart-logic";

export const CART_STORAGE_KEY = "family-camping-cart";

/** Кошик з localStorage (гостьовий або дзеркало кошика акаунта) */
export function readCartStorage(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter(
          (l): l is CartLine =>
            typeof l?.id === "string" && Number.isFinite(l?.qty) && l.qty > 0,
        )
      : [];
  } catch {
    return [];
  }
}

/* ---------- Обране та порівняння: прості списки id ---------- */

export const FAVORITES_STORAGE_KEY = "family-camping-favorites";
export const COMPARE_STORAGE_KEY = "family-camping-compare";

export function readIds(key: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function writeIds(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* див. writeCartStorage */
  }
}

export function writeCartStorage(lines: CartLine[]) {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  } catch {
    /* приватний режим або заповнене сховище — кошик просто не збережеться */
  }
}
