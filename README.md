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
| `NOVA_POSHTA_API_KEY` | Необов'язково. Довідник міст Нової пошти зараз працює й без ключа; задайте, якщо НП почне його вимагати |

Поле «Місто» при оформленні перевіряється за довідником Нової пошти: список міст завантажується
раз на тиждень у `.data/np-cities.json`. Якщо Нова пошта недоступна, замовлення приймається з містом
як звичайним текстом — продажі не блокуються.

Без `RESEND_API_KEY` сайт працює повністю, лише без листів: сповіщення покупці бачать на сайті
(дзвіночок у шапці, сторінка `/notifications`), а для звернень гостей без акаунта адмін-панель
пропонує відповісти через Gmail.

**Важливо:** дані (акаунти, замовлення, сповіщення) зберігаються у файлі `.data/db.json`.
На Vercel та інших serverless-хостингах файлова система не зберігається між запусками —
для продакшену потрібна справжня база даних (див. `app/lib/server/db.ts`).

## Тести

`yarn test` — модульні та API-тести, `yarn test:e2e` — у браузері (Playwright), `yarn test:all` — усе разом.

## Резервні копії бази

Тариф Supabase Free копій не робить, тому їх робить GitHub Actions
([.github/workflows/db-backup.yml](.github/workflows/db-backup.yml)): щодня о 01:30 UTC
`pg_dump` схеми `public`, шифрування AES-256 паролем `BACKUP_PASSPHRASE`, зберігання 30 днів
як артефакт запуску (Actions → «Резервна копія бази» → запуск → Artifacts). Якщо копія не вдалася —
повідомлення в Telegram. Запустити вручну: Actions → «Резервна копія бази» → Run workflow.

Секрети репозиторію (Settings → Secrets and variables → Actions): `DATABASE_URL` — рядок
**Session pooler** із Supabase (Connect → Session pooler, порт 5432, з паролем бази),
`BACKUP_PASSPHRASE` — від 16 символів, зберігається окремо (без нього копію не відкрити),
`TELEGRAM_BOT_TOKEN` і `TELEGRAM_CHAT_ID` — ті самі, що у Vercel.

GitHub вимикає розклад, якщо в репозиторії 60 днів не було комітів (попереджає листом) —
тоді треба натиснути «Enable workflow» в Actions.

Відновлення (потрібні `gpg` і клієнт PostgreSQL 17, напр. Docker-образ `postgres:17`):

```sh
gpg --decrypt family-camping-db-2026-11-20.dump.gpg > db.dump
# у порожню базу (новий проєкт Supabase або локальний Postgres):
pg_restore --no-owner --no-privileges --dbname "$DATABASE_URL" db.dump
# поверх існуючої бази — замінює таблиці public даними з копії:
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$DATABASE_URL" db.dump
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
