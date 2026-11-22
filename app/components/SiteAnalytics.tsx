"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/*
 * Статистика відвідувань — Vercel Web Analytics: без cookie й без персональних даних
 * (тому банер згоди не потрібен). Дані — у Vercel → проєкт → Analytics.
 * Адмін-панель не рахуємо: інакше власниця бачила б у статистиці переважно себе.
 * Працює лише на Vercel (локально й у тестах нічого не надсилає).
 */
const skipAdmin = (event: BeforeSendEvent) => (new URL(event.url).pathname.startsWith("/admin") ? null : event);

export default function SiteAnalytics() {
  return <Analytics beforeSend={skipAdmin} />;
}
