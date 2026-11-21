/*
 * Знижки на сайті: промокоди, стара (перекреслена) ціна, фільтри «Зі знижкою»
 * і сортування «Найбільша знижка».
 *
 * Зараз ВИМКНЕНО (рішення власника перед запуском: знижок немає; до того ж товари
 * Ranger продаються строго за РРЦ — див. fixedPrice). Увімкнути — змінна
 * NEXT_PUBLIC_DISCOUNTS=1 у Vercel і новий деплой (значення вбудовується під час збірки).
 * Тести вмикають знижки, щоб сама функція лишалася перевіреною.
 */
export const discountsEnabled = () => process.env.NEXT_PUBLIC_DISCOUNTS === "1";

/*
 * Інформація про обмін і повернення (сторінка /returns, посилання, згадки в
 * кошику, на сторінці товару, в оферті). Зараз СХОВАНО — рішення власника,
 * поки не узгоджено умови повернення з постачальником (Ranger).
 * Увімкнути — NEXT_PUBLIC_RETURNS=1 у Vercel і новий деплой.
 */
export const returnsInfoEnabled = () => process.env.NEXT_PUBLIC_RETURNS === "1";

/* ---------- Відправка ---------- */

/** До котрої години (за Києвом) замовлення в будні відправляємо того ж дня */
export const SHIP_CUTOFF_HOUR = 14;

/** Київський день тижня (0 — неділя … 6 — субота) і година */
function kyivNow(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")!.value);
  const hour = Number(parts.find((p) => p.type === "hour")!.value);
  return { weekday, hour };
}

/**
 * Коли відправимо замовлення, оформлене зараз: «сьогодні» (будні до 14:00),
 * «завтра» (будні після 14:00, крім п'ятниці) або «в понеділок»
 */
export function shipDay(now: Date = new Date()): "сьогодні" | "завтра" | "в понеділок" {
  const { weekday, hour } = kyivNow(now);
  if (weekday >= 1 && weekday <= 5 && hour < SHIP_CUTOFF_HOUR) return "сьогодні";
  if (weekday >= 0 && weekday <= 4) return "завтра";
  return "в понеділок";
}
