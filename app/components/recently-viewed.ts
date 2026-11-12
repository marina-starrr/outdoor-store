/* Логіка «Нещодавно переглянутих» — чисті функції, без React (зручно тестувати) */

export const RECENT_STORAGE_KEY = "family-camping-recent";
/** Скільки останніх товарів пам'ятаємо */
export const RECENT_LIMIT = 12;

/** Додає товар на початок списку: без дублікатів, не довше за ліміт */
export function pushRecent(ids: readonly string[], id: string, limit = RECENT_LIMIT): string[] {
  return [id, ...ids.filter((x) => x !== id)].slice(0, limit);
}

/** Безпечний розбір збереженого значення: лише рядки, без дублікатів */
export function parseRecent(raw: string | null): string[] {
  try {
    const value = JSON.parse(raw ?? "[]");
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((x): x is string => typeof x === "string"))].slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}
