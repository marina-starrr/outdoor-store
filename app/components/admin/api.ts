"use client";

import { useCallback, useEffect, useState } from "react";

/** Помилка від API з повідомленням для користувача та помилками за полями форми */
export class ApiError extends Error {
  constructor(message: string, public status: number, public errors: Record<string, string> = {}) {
    super(message);
  }
}

/** Запит до адмін-API: JSON туди й назад, зрозуміла помилка */
export async function adminFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError("Немає з'єднання з сервером", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "Щось пішло не так", res.status, data.errors);
  return data as T;
}

/** Завантаження даних для сторінки адмін-панелі з повторним запитом (reload) */
export function useAdminData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    adminFetch<T>(path)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError("");
        }
      })
      .catch((e: ApiError) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload, setData };
}

const months = ["січ", "лют", "бер", "квіт", "трав", "черв", "лип", "серп", "вер", "жовт", "лист", "груд"];
/** «12 лист, 14:05» */
export function shortDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${months[d.getMonth()]}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
