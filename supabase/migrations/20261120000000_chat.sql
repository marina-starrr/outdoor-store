-- =====================================================================
--  Чат з консультантом
--
--  Замість однобічної форми звернень: покупець пише у віконці чату на
--  будь-якій сторінці (з акаунтом або без), адміністратор відповідає з
--  адмін-панелі. Одна розмова на покупця — уся історія в одному місці.
--
--  Як запустити: Supabase → SQL Editor → New query → вставити весь файл → Run.
-- =====================================================================

begin;

create table public.chats (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  -- Час останнього повідомлення — для сортування в адмінці
  last_message_at   timestamptz not null default now(),
  -- Покупець з акаунтом; null — гість
  user_id           uuid unique references public.users(id) on delete set null,
  -- Гість: SHA-256 від секретного токена з cookie його браузера
  visitor_hash      text unique,
  -- Як звертатись і куди написати, якщо покупець закрив сайт
  name              text not null default '' check (length(name) <= 60),
  phone             text check (phone is null or length(phone) <= 32),
  email             citext check (email is null or length(email) <= 254),
  -- Хто що прочитав (непрочитані — повідомлення іншої сторони після цього часу)
  admin_read_at     timestamptz,
  customer_read_at  timestamptz,
  -- Коли покупець востаннє був у чаті (щоб не дублювати відповідь листом, поки він тут)
  customer_seen_at  timestamptz,
  check (user_id is not null or visitor_hash is not null)
);
create index chats_last_message_idx on public.chats(last_message_at desc);

create table public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  seq         bigint generated always as identity,
  chat_id     uuid not null references public.chats(id) on delete cascade,
  created_at  timestamptz not null default now(),
  author      text not null check (author in ('customer', 'admin')),
  text        text not null check (length(text) between 1 and 2000),
  -- «Запитати про цей товар» — до якого товару питання
  product_id  text references public.products(id) on delete set null
);
create index chat_messages_chat_idx on public.chat_messages(chat_id, seq);

-- Доступ — лише сервер сайту (як і для решти таблиць)
alter table public.chats         enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.chats, public.chat_messages from anon, authenticated;
grant all on public.chats, public.chat_messages to service_role;
revoke all on all sequences in schema public from anon, authenticated;
grant all on all sequences in schema public to service_role;

commit;
