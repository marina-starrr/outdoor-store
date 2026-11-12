"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CartLine, DeliveryId } from "./cart-logic";
import { FAVORITES_STORAGE_KEY, readCartStorage, readIds } from "./cart-storage";

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  createdAt: string;
  lastDelivery: { method: DeliveryId; city?: string; branch?: string; address?: string } | null;
  /** Має доступ до адмін-панелі */
  isAdmin?: boolean;
};

/**
 * Подія для кошика: після відновлення сесії, входу чи виходу кошик
 * має взяти дані з акаунта (або очиститися)
 */
export type AuthEvent =
  | { seq: number; type: "restore" | "login"; cart: CartLine[]; favorites: string[] }
  | { seq: number; type: "logout" }
  | { seq: 0; type: "none" };

type Result = { error?: string };

type AuthContextValue = {
  status: "loading" | "guest" | "user";
  user: AuthUser | null;
  event: AuthEvent;
  login: (email: string, password: string) => Promise<Result>;
  register: (data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
  }) => Promise<Result>;
  logout: () => Promise<void>;
  updateProfile: (data: Record<string, string>) => Promise<Result>;
  /** Перечитати користувача з сервера (напр. після замовлення) */
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function api<T>(url: string, init?: RequestInit): Promise<T & Result> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    return (await res.json()) as T & Result;
  } catch {
    return { error: "Немає з'єднання з сервером. Спробуйте ще раз." } as T & Result;
  }
}

type SessionPayload = {
  user: AuthUser | null;
  cart: CartLine[] | null;
  favorites: string[] | null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [event, setEvent] = useState<AuthEvent>({ seq: 0, type: "none" });

  const emit = useCallback(
    (e: Omit<Extract<AuthEvent, { type: "restore" | "login" }>, "seq"> | { type: "logout" }) =>
      setEvent((prev) => ({ ...e, seq: prev.seq + 1 }) as AuthEvent),
    [],
  );

  const applySession = useCallback(
    (data: SessionPayload, type: "restore" | "login") => {
      setUser(data.user);
      setStatus(data.user ? "user" : "guest");
      if (data.user) emit({ type, cart: data.cart ?? [], favorites: data.favorites ?? [] });
    },
    [emit],
  );

  // Відновлюємо сесію при завантаженні сторінки
  useEffect(() => {
    let cancelled = false;
    api<SessionPayload>("/api/auth/me").then((data) => {
      if (cancelled) return;
      if (data.error) setStatus("guest");
      else applySession(data, "restore");
    });
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const login = useCallback<AuthContextValue["login"]>(
    async (email, password) => {
      const data = await api<SessionPayload>("/api/auth/login", {
        method: "POST",
        // Кошик і обране гостя відправляємо разом із входом — сервер додасть їх до акаунта
        body: JSON.stringify({
          email,
          password,
          cart: readCartStorage(),
          favorites: readIds(FAVORITES_STORAGE_KEY),
        }),
      });
      if (data.error) return { error: data.error };
      applySession(data, "login");
      return {};
    },
    [applySession],
  );

  const register = useCallback<AuthContextValue["register"]>(
    async (form) => {
      const data = await api<SessionPayload>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          cart: readCartStorage(),
          favorites: readIds(FAVORITES_STORAGE_KEY),
        }),
      });
      if (data.error) return { error: data.error };
      applySession(data, "login");
      return {};
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    setStatus("guest");
    emit({ type: "logout" });
  }, [emit]);

  const updateProfile = useCallback<AuthContextValue["updateProfile"]>(async (form) => {
    const data = await api<{ user: AuthUser }>("/api/account", {
      method: "PATCH",
      body: JSON.stringify(form),
    });
    if (data.error) return { error: data.error };
    setUser(data.user);
    return {};
  }, []);

  const refresh = useCallback(async () => {
    const data = await api<SessionPayload>("/api/auth/me");
    if (!data.error) {
      setUser(data.user);
      setStatus(data.user ? "user" : "guest");
    }
  }, []);

  const value = useMemo(
    () => ({ status, user, event, login, register, logout, updateProfile, refresh }),
    [status, user, event, login, register, logout, updateProfile, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
