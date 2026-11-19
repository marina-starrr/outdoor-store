-- =====================================================================
--  Відновлення пароля і власні фото товарів
--
--  1. users: одноразове посилання «Забули пароль?» (у базі лише хеш
--     токена, діє 1 годину).
--  2. products.images: фото, завантажені в адмін-панелі (адреси файлів
--     у Supabase Storage, до 8 штук; перше — головне). Якщо список не
--     порожній, на сайті показуються лише ці фото, без фото з бібліотеки.
--
--  Кошик для файлів (Storage → product-photos) сайт створить сам під час
--  першого завантаження.
--
--  Як запустити: Supabase → SQL Editor → New query → вставити весь файл → Run.
-- =====================================================================

begin;

alter table public.users
  add column if not exists password_reset_hash       text,
  add column if not exists password_reset_expires_at timestamptz;

alter table public.products
  add column if not exists images jsonb not null default '[]'::jsonb
    check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 8);

commit;
