This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Налаштування (`.env.local` або змінні середовища на хостингу)

| Змінна | Навіщо |
| --- | --- |
| `ADMIN_EMAILS` | Email-и адміністраторів через кому — їм відкривається `/admin` |
| `NEXT_PUBLIC_SITE_URL` | Адреса сайту (для SEO і посилань у листах), напр. `https://family-camping.ua` |
| `RESEND_API_KEY` | Ключ [Resend](https://resend.com) — вмикає листи (сповіщення, відповіді на звернення) |
| `MAIL_FROM` | Від кого листи, напр. `Family Camping <hello@ваш-домен.ua>` (домен підтверджується в Resend) |
| `MAIL_TRANSPORT=log` | Для розробки: листи не надсилаються, а пишуться в `.data/outbox.json` |

Без `RESEND_API_KEY` сайт працює повністю, лише без листів: сповіщення покупці бачать на сайті
(дзвіночок у шапці, сторінка `/notifications`), а для звернень гостей без акаунта адмін-панель
пропонує відповісти через Gmail.

**Важливо:** дані (акаунти, замовлення, сповіщення) зберігаються у файлі `.data/db.json`.
На Vercel та інших serverless-хостингах файлова система не зберігається між запусками —
для продакшену потрібна справжня база даних (див. `app/lib/server/db.ts`).

## Тести

`yarn test` — модульні та API-тести, `yarn test:e2e` — у браузері (Playwright), `yarn test:all` — усе разом.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
