"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./Auth";

export type NotificationKind = "reply" | "stock" | "order" | "price";

export type UserNotification = {
  id: string;
  createdAt: string;
  kind: NotificationKind;
  title: string;
  text: string;
  href?: string;
  read?: boolean;
};

type Payload = {
  notifications: UserNotification[];
  unread: number;
  stockAlerts: string[];
  emailNotifications: boolean;
  mailEnabled: boolean;
};

type Value = Payload & {
  /** Дані вже завантажені (для гостя — завжди порожні) */
  ready: boolean;
  markAllRead: () => Promise<void>;
  setEmailNotifications: (on: boolean) => Promise<void>;
  isAlerted: (productId: string) => boolean;
  /** Підписатися / відписатися від «Повідомити про наявність». false — не вдалося */
  setStockAlert: (productId: string, on: boolean) => Promise<boolean>;
  refresh: () => Promise<void>;
};

const empty: Payload = { notifications: [], unread: 0, stockAlerts: [], emailNotifications: true, mailEnabled: false };

/** Як часто перевіряти нові сповіщення, поки вкладка відкрита */
const POLL_MS = 60_000;

const Ctx = createContext<Value | null>(null);

async function request(url: string, method = "GET", body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [data, setData] = useState<Payload & { for: string | null }>({ ...empty, for: null });

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const d = (await request("/api/notifications")) as Payload;
      setData({ ...d, for: userId });
    } catch {
      /* немає мережі — спробуємо пізніше */
    }
  }, [userId]);

  // Завантаження після входу, періодична перевірка та при поверненні на вкладку
  useEffect(() => {
    if (!userId) return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- перше завантаження після входу */
    refresh();
    const tick = () => document.visibilityState === "visible" && refresh();
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [userId, refresh]);

  // Дані попереднього користувача (після виходу) не показуємо
  const current = useMemo(() => (userId && data.for === userId ? data : { ...empty, for: null }), [userId, data]);

  const patch = useCallback(async (body: unknown) => {
    try {
      const d = (await request("/api/notifications", "PATCH", body)) as Payload;
      setData((prev) => ({ ...d, for: prev.for }));
    } catch {
      /* залишаємо як було */
    }
  }, []);

  const markAllRead = useCallback(() => patch({ read: "all" }), [patch]);
  const setEmailNotifications = useCallback((on: boolean) => patch({ emailNotifications: on }), [patch]);

  const setStockAlert = useCallback(async (productId: string, on: boolean) => {
    try {
      const d = await request("/api/stock-alerts", on ? "POST" : "DELETE", { productId });
      setData((prev) => ({ ...prev, stockAlerts: d.stockAlerts }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const stockAlerts = current.stockAlerts;
  const isAlerted = useCallback((id: string) => stockAlerts.includes(id), [stockAlerts]);

  const value = useMemo<Value>(
    () => ({
      notifications: current.notifications,
      unread: current.unread,
      stockAlerts,
      emailNotifications: current.emailNotifications,
      mailEnabled: current.mailEnabled,
      ready: !userId || current.for === userId,
      markAllRead,
      setEmailNotifications,
      isAlerted,
      setStockAlert,
      refresh,
    }),
    [current, stockAlerts, userId, markAllRead, setEmailNotifications, isAlerted, setStockAlert, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNotifications must be used inside <NotificationsProvider>");
  return ctx;
}
