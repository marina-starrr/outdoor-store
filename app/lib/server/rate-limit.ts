import "server-only";
import type { NextRequest } from "next/server";
import { sql } from "./db";

/*
 * Обмеження частоти запитів. Лічильники — у базі (таблиця rate_limits):
 * на Vercel кожен екземпляр функції має власну пам'ять і живе недовго,
 * тож лічильники в пам'яті скидались би й не бачили один одного.
 */

/**
 * IP клієнта. На Vercel — із заголовків, які ставить сама платформа
 * (клієнт не може їх підробити); локально — з x-forwarded-for
 */
export function clientIp(req: NextRequest) {
  const h = req.headers;
  const trusted = process.env.VERCEL ? (h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip")) : null;
  return (trusted ?? h.get("x-forwarded-for"))?.split(",")[0].trim() || "local";
}

/** Час до скидання — числом мілісекунд (явний тип: інакше Postgres не визначить тип параметра) */
const after = (param: string) => `now() + ${param}::double precision * interval '1 millisecond'`;

/** Зрідка прибираємо прострочені лічильники, щоб таблиця не росла */
async function cleanup() {
  if (Math.random() < 0.02) await sql("delete from rate_limits where reset_at < now() - interval '1 day'");
}

/**
 * Не більше max подій за windowMs для одного ключа.
 * Повертає функцію: true — ліміт вичерпано (запит треба відхилити)
 */
export function rateLimiter(name: string, max: number, windowMs: number) {
  return async (key: string): Promise<boolean> => {
    const [row] = await sql<{ count: number }>(
      `insert into rate_limits as r (key, count, reset_at) values ($1, 1, ${after("$2")})
       on conflict (key) do update set
         count    = case when r.reset_at <= now() then 1 else r.count + 1 end,
         reset_at = case when r.reset_at <= now() then excluded.reset_at else r.reset_at end
       returning count`,
      [`${name}|${key}`.slice(0, 400), windowMs],
    );
    await cleanup();
    return Number(row.count) > max;
  };
}

/** Обмеження спроб входу: 5 невдалих спроб для email+IP, блокування на 15 хвилин після останньої */
export function loginLimiter(req: NextRequest, email: string) {
  const key = `login|${clientIp(req)}|${email}`.slice(0, 400);
  return {
    async blocked() {
      const [row] = await sql("select 1 from rate_limits where key = $1 and count >= 5 and reset_at > now()", [key]);
      return !!row;
    },
    async fail() {
      await sql(
        `insert into rate_limits as r (key, count, reset_at) values ($1, 1, ${after("$2")})
         on conflict (key) do update set
           count    = case when r.reset_at <= now() then 1 else r.count + 1 end,
           reset_at = excluded.reset_at`,
        [key, 15 * 60_000],
      );
      await cleanup();
    },
    async reset() {
      await sql("delete from rate_limits where key = $1", [key]);
    },
  };
}
