-- =====================================================================
--  Знімок каталогу — щоб сервери сайту не читали весь каталог з бази
--
--  Кожен сервер Vercel при запуску й кожні 10 хв читав увесь каталог (~2 МБ)
--  — так набігав трафік Supabase понад ліміт Free (5 ГБ на місяць).
--  Тепер сайт зберігає стиснутий знімок каталогу (~250 КБ) у Storage → catalog
--  (кошик створиться сам), а з бази читає лише цей рядок з номером версії.
--
--  - version        — зростає після кожної зміни товарів (сайт робить це сам);
--  - built_version  — для якої версії зібрано знімок;
--  - url            — адреса знімка.
--
--  Як запустити: Supabase → SQL Editor → New query → вставити весь файл → Run.
--  Повторний запуск нічого не ламає.
-- =====================================================================

begin;

create table if not exists public.catalog_snapshot (
  id            smallint primary key default 1 check (id = 1),
  version       bigint not null default 1,
  built_version bigint not null default 0,
  url           text,
  built_at      timestamptz
);

insert into public.catalog_snapshot (id) values (1) on conflict (id) do nothing;

-- Як і решта таблиць: лише для сервера сайту, не для публічного API Supabase
alter table public.catalog_snapshot enable row level security;
revoke all on public.catalog_snapshot from anon, authenticated;

commit;
