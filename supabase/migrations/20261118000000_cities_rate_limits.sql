-- =====================================================================
--  Довідник міст Нової пошти і лічильники обмежень частоти запитів
--
--  На Vercel сайт працює в короткоживучих екземплярах без запису на диск,
--  тому і довідник міст (раніше — файл .data/np-cities.json), і лічильники
--  лімітів (раніше — у пам'яті кожного екземпляра) зберігаються в базі.
--
--  Як запустити: Supabase → SQL Editor → New query → вставити весь файл → Run.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
--  Населені пункти, куди доставляє Нова пошта (~11 тис.)
--  Оновлюються раз на тиждень: Vercel Cron → /api/cron/np-cities
-- ---------------------------------------------------------------------

create table public.np_cities (
  ref   text primary key,            -- Ref Нової пошти
  name  text not null,               -- «Полтава»
  type  text not null default '',    -- «місто», «село», …
  area  text not null default '',    -- «Полтавська»
  note  text                         -- уточнення для однакових назв
);

-- Коли довідник востаннє завантажено (один рядок)
create table public.np_cities_meta (
  id          smallint primary key default 1 check (id = 1),
  fetched_at  timestamptz not null,
  count       integer not null
);

-- ---------------------------------------------------------------------
--  Обмеження частоти: вхід, гостьові замовлення, форма контактів, …
--  key — «назва ліміту|IP або акаунт»; лічильник діє до reset_at
-- ---------------------------------------------------------------------

create table public.rate_limits (
  key       text primary key check (length(key) <= 400),
  count     integer not null,
  reset_at  timestamptz not null
);
create index rate_limits_reset_idx on public.rate_limits(reset_at);

-- ---------------------------------------------------------------------
--  Доступ — лише сервер сайту (як і для решти таблиць)
-- ---------------------------------------------------------------------

alter table public.np_cities      enable row level security;
alter table public.np_cities_meta enable row level security;
alter table public.rate_limits    enable row level security;

revoke all on public.np_cities, public.np_cities_meta, public.rate_limits from anon, authenticated;
grant all on public.np_cities, public.np_cities_meta, public.rate_limits to service_role;

commit;
