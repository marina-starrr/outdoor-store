-- =====================================================================
--  Family Camping — початкова схема бази даних (Supabase / PostgreSQL)
--
--  Як запустити: Supabase → SQL Editor → New query → вставити весь файл → Run.
--  Скрипт можна запускати лише на порожній базі (створює таблиці з нуля).
--
--  Модель доступу (конфіденційність):
--    * Сайт має власну авторизацію (scrypt-паролі + сесії в cookie), тому
--      до бази звертається ЛИШЕ сервер Next.js — через service_role key або
--      прямий Postgres-рядок підключення. Обидва обходять RLS.
--    * Для публічних ключів (anon / authenticated) доступ закрито повністю:
--      RLS увімкнено на кожній таблиці і НЕ створено жодної політики,
--      плюс відкликано всі права. Навіть якщо anon key потрапить у браузер,
--      через нього не прочитати ні email-и, ні телефони, ні замовлення.
-- =====================================================================

begin;

create extension if not exists citext;  -- email без урахування регістру

-- ---------------------------------------------------------------------
--  Користувачі та сесії
-- ---------------------------------------------------------------------

create table public.users (
  id                       uuid primary key default gen_random_uuid(),
  email                    citext not null unique check (length(email) <= 254),
  first_name               text   not null default '' check (length(first_name) <= 100),
  last_name                text   not null default '' check (length(last_name) <= 100),
  phone                    text   not null default '' check (length(phone) <= 32),
  password_hash            text   not null,
  created_at               timestamptz not null default now(),
  -- Коли власник підтвердив email (без цього — немає прав адміністратора)
  email_verified_at        timestamptz,
  -- Активне посилання підтвердження: SHA-256 від токена і строк дії
  email_verify_hash        text,
  email_verify_expires_at  timestamptz,
  -- Останні дані доставки {method, city, cityRef, branch, address}
  last_delivery            jsonb,
  -- Дублювати сповіщення на email
  email_notifications      boolean not null default true
);

create table public.sessions (
  -- SHA-256 від токена сесії (сам токен — лише в cookie браузера)
  token_hash  text primary key,
  user_id     uuid not null references public.users(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index sessions_user_id_idx    on public.sessions(user_id);
create index sessions_expires_at_idx on public.sessions(expires_at);

-- ---------------------------------------------------------------------
--  Каталог
-- ---------------------------------------------------------------------

create table public.products (
  id            text primary key,
  name          text not null,
  category      text not null check (category in (
                  'tents','backpacks','sleeping-bags','cookware','furniture',
                  'lighting','grills','hammocks','accessories')),
  brand         text not null default '',
  price         numeric(12,2) not null check (price >= 0),
  old_price     numeric(12,2) check (old_price is null or old_price >= 0),
  hit           boolean not null default false,
  is_new        boolean not null default false,
  stock         integer not null default 0 check (stock >= 0),
  -- Прихований: не видно в каталозі, але лишається в історії замовлень
  hidden        boolean not null default false,
  description   text,
  custom_image  text check (custom_image is null or custom_image like 'https://%'),
  popularity    integer not null default 0,
  specs         text not null default '',
  capacity      integer check (capacity is null or capacity > 0),
  image         text not null,
  photo         text not null,
  -- Таблиця характеристик: [["Вага","3,1 кг"], ...]
  attrs         jsonb not null default '[]'::jsonb check (jsonb_typeof(attrs) = 'array'),
  updated_at    timestamptz
);
create index products_category_idx on public.products(category) where not hidden;

-- ---------------------------------------------------------------------
--  Кошик, обране, «повідомити про наявність»  (багато-до-багатьох)
-- ---------------------------------------------------------------------

create table public.cart_items (
  user_id     uuid not null references public.users(id) on delete cascade,
  product_id  text not null references public.products(id) on delete cascade,
  qty         integer not null check (qty between 1 and 20),  -- MAX_QTY
  added_at    timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.favorites (
  user_id     uuid not null references public.users(id) on delete cascade,
  product_id  text not null references public.products(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.stock_alerts (
  user_id     uuid not null references public.users(id) on delete cascade,
  product_id  text not null references public.products(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index stock_alerts_product_idx on public.stock_alerts(product_id);

-- ---------------------------------------------------------------------
--  Замовлення (і покупців з акаунтом, і гостей)
-- ---------------------------------------------------------------------

create table public.orders (
  number            text primary key,                     -- FC-1234567
  -- Власник; null — замовлення гостя (ще не перенесене в акаунт)
  user_id           uuid references public.users(id) on delete set null,
  -- Гість: SHA-256 від секретного токена з його браузера; після перенесення в акаунт — null
  claim_hash        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,                           -- остання зміна статусу адміністратором
  status            text not null default 'new'
                      check (status in ('new','confirmed','shipped','done','cancelled')),
  subtotal          numeric(12,2) not null check (subtotal >= 0),
  promo             text,
  promo_discount    numeric(12,2) not null default 0 check (promo_discount >= 0),
  shipping          numeric(12,2) not null default 0 check (shipping >= 0),
  total             numeric(12,2) not null check (total >= 0),
  delivery_method   text not null check (delivery_method in ('np-branch','np-courier','ukrposhta')),
  delivery_city     text,
  delivery_city_ref text,
  delivery_branch   text,
  delivery_address  text,
  payment           text not null check (payment in ('cod','invoice','card','parts')),
  first_name        text not null,
  last_name         text not null,
  phone             text not null,
  email             citext,
  comment           text check (comment is null or length(comment) <= 1000),
  no_call           boolean not null default false
);
create index orders_user_id_idx    on public.orders(user_id, created_at desc);
create index orders_status_idx     on public.orders(status, created_at desc);
create unique index orders_claim_idx on public.orders(claim_hash) where claim_hash is not null;

create table public.order_items (
  order_number  text not null references public.orders(number) on delete cascade,
  -- Товари не видаляються (лише приховуються); restrict — щоб історія не втратила зв'язок
  product_id    text not null references public.products(id) on delete restrict,
  -- Знімок на момент покупки: назва й ціна могли змінитися пізніше
  name          text not null,
  price         numeric(12,2) not null check (price >= 0),
  qty           integer not null check (qty between 1 and 20),
  primary key (order_number, product_id)
);
create index order_items_product_idx on public.order_items(product_id);

-- ---------------------------------------------------------------------
--  Сповіщення покупців
-- ---------------------------------------------------------------------

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('reply','stock','order','price')),
  title       text not null,
  text        text not null,
  href        text,
  read        boolean not null default false
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);

-- ---------------------------------------------------------------------
--  Звернення з форми «Контакти» та відповіді адміністратора
-- ---------------------------------------------------------------------

create table public.messages (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  topic         text not null,
  name          text not null,
  email         citext not null,
  phone         text,
  -- Номер замовлення, як його ввів покупець (може бути з помилкою — тому без FK)
  order_number  text,
  message       text not null check (length(message) <= 5000),
  -- Автор, якщо був увійшов у акаунт
  user_id       uuid references public.users(id) on delete set null,
  done          boolean not null default false
);
create index messages_created_idx on public.messages(done, created_at desc);
create index messages_user_idx    on public.messages(user_id);

create table public.message_replies (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages(id) on delete cascade,
  created_at  timestamptz not null default now(),
  text        text not null,
  on_site     boolean not null default false,  -- покупець отримав сповіщення на сайті
  emailed     boolean not null default false   -- лист надіслано
);
create index message_replies_message_idx on public.message_replies(message_id, created_at);

-- ---------------------------------------------------------------------
--  Відгуки (з модерацією)
-- ---------------------------------------------------------------------

create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  product_id  text not null references public.products(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  author      text not null,                      -- «Олена К.»
  rating      smallint not null check (rating between 1 and 5),
  text        text not null,
  created_at  timestamptz not null default now(),
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  verified    boolean not null default false,     -- автор справді купував товар
  unique (product_id, user_id)                    -- один відгук на товар від покупця
);
create index reviews_status_idx on public.reviews(status, created_at desc);

-- ---------------------------------------------------------------------
--  Товари з обчисленими полями: rating, reviews, sold, in_stock
-- ---------------------------------------------------------------------

create view public.products_with_stats
with (security_invoker = true) as
select
  p.*,
  p.stock > 0                                   as in_stock,
  coalesce(r.avg_rating, 0)::numeric(3,2)       as rating,
  coalesce(r.cnt, 0)::integer                   as reviews,
  coalesce(s.sold, 0)::integer                  as sold
from public.products p
left join (
  select product_id, avg(rating) as avg_rating, count(*) as cnt
  from public.reviews where status = 'approved' group by product_id
) r on r.product_id = p.id
left join (
  select oi.product_id, sum(oi.qty) as sold
  from public.order_items oi
  join public.orders o on o.number = oi.order_number
  where o.status <> 'cancelled' group by oi.product_id
) s on s.product_id = p.id;

-- ---------------------------------------------------------------------
--  Конфіденційність: Row Level Security + відкликання прав
-- ---------------------------------------------------------------------

alter table public.users           enable row level security;
alter table public.sessions        enable row level security;
alter table public.products        enable row level security;
alter table public.cart_items      enable row level security;
alter table public.favorites       enable row level security;
alter table public.stock_alerts    enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.notifications   enable row level security;
alter table public.messages        enable row level security;
alter table public.message_replies enable row level security;
alter table public.reviews         enable row level security;

-- Жодних прав для публічних ролей (ні читання, ні запису)
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- Те саме для таблиць, які з'являться в майбутніх міграціях
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- Сервер працює через service_role
grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;

commit;
