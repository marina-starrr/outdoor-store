import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    agentUpgrade: "security",
  },
  cacheComponents: true,
  // Драйвери бази завантажуються з node_modules як є (PGlite містить WASM і файли даних)
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
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
