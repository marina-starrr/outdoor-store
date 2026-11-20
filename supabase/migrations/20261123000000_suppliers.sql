-- =====================================================================
--  Постачальники: імпорт товарів з XML-файлів (формат YML — як для Prom і Rozetka)
--
--  - suppliers: посилання на файл, відповідність їхніх категорій нашим,
--    підсумок останнього оновлення
--  - products.supplier_id / supplier_sku: товар прийшов від постачальника;
--    щоденне оновлення змінює лише ціну (РРЦ) і залишок, а назву, опис і
--    фото, які власник міг поправити, не чіпає
--  - нові категорії: пікнік, термоси, одяг, тактичне, рибалка, електроніка
--
--  Як запустити: Supabase → SQL Editor → New query → вставити весь файл → Run.
-- =====================================================================

begin;

create table if not exists public.suppliers (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(name) between 1 and 80),
  feed_url           text not null check (feed_url like 'https://%' and length(feed_url) <= 500),
  created_at         timestamptz not null default now(),
  -- Їхня категорія → наша: {"7": "tents", "8": ""}; "" — не імпортувати
  category_map       jsonb not null default '{}'::jsonb check (jsonb_typeof(category_map) = 'object'),
  -- Категорії з файлу під час останньої перевірки: [{"id":"7","name":"Намети","inStock":18}]
  feed_categories    jsonb not null default '[]'::jsonb check (jsonb_typeof(feed_categories) = 'array'),
  last_sync_at       timestamptz,
  last_sync_ok       boolean,
  last_sync_message  text check (last_sync_message is null or length(last_sync_message) <= 2000)
);

alter table public.products
  add column if not exists supplier_id  uuid references public.suppliers(id) on delete set null,
  add column if not exists supplier_sku text check (supplier_sku is null or length(supplier_sku) <= 100);
create unique index if not exists products_supplier_sku_idx
  on public.products(supplier_id, supplier_sku) where supplier_id is not null;

alter table public.products drop constraint if exists products_category_check;
alter table public.products add constraint products_category_check check (category in (
  'tents','backpacks','sleeping-bags','cookware','furniture','lighting','grills','hammocks','accessories',
  'picnic','thermos','clothing','tactical','fishing','electronics'));

-- Доступ — лише сервер сайту (як і для решти таблиць)
alter table public.suppliers enable row level security;
revoke all on public.suppliers from anon, authenticated;
grant all on public.suppliers to service_role;

commit;
