import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/*
 * Політика безпеки вмісту (CSP). Без nonce: сторінки кешуються й віддаються
 * статично, тому вбудовані скрипти Next дозволені через 'unsafe-inline'.
 * Головне, що вона дає: сторінку не вбудувати в чужий сайт (frame-ancestors),
 * форми й запити йдуть лише на наш сервер, сторонні скрипти не завантажуються.
 * Фото товарів можуть бути з будь-якого https-сайту (посилання з адмінки).
 * vercel.live — панель коментарів Vercel на preview-збірках.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://vercel.live${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://vercel.live${isDev ? " ws: wss:" : ""}`,
  "frame-src https://vercel.live",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Лише HTTPS протягом двох років (браузер ігнорує заголовок на http://localhost)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

/*
 * Стара адреса Vercel → власний домен (301/308), щоб Google не бачив двох однакових сайтів.
 * Крім /api/: щогодинне оновлення постачальників (pg_cron у Supabase, GitHub Actions)
 * і далі звертається до outdoor-store-ten.vercel.app.
 */
const LEGACY_HOST = "outdoor-store-ten.vercel.app";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
const redirectLegacyHost = /^https:\/\//.test(SITE_URL) && !SITE_URL.includes(LEGACY_HOST);

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    if (!redirectLegacyHost) return [];
    return [
      {
        source: "/:path((?!api/).*)",
        has: [{ type: "host", value: LEGACY_HOST }],
        destination: `${SITE_URL}/:path`,
        permanent: true,
      },
    ];
  },
  /* config options here */
  experimental: {
    agentFeedback: true,
    agentUpgrade: "security",
  },
  cacheComponents: true,
  // Драйвери бази завантажуються з node_modules як є (PGlite містить WASM і файли даних)
  serverExternalPackages: ["pg", "@electric-sql/pglite", "nodemailer"],
  // Міграції читаються вбудованою базою під час роботи — додаємо їх до серверних функцій
  outputFileTracingIncludes: { "/**": ["./supabase/migrations/*.sql"] },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
