-- =====================================================================
--  Адміністратори, яких додає власник з адмін-панелі
--
--  Власник — адреса з ADMIN_EMAILS у Vercel (його не можна прибрати з
--  панелі). Інших адміністраторів власник додає за email:
--    - акаунт уже є           → users.is_admin = true
--    - акаунта ще немає       → запрошення в admin_invites; права
--                               з'являться під час реєстрації з цією адресою
--  В обох випадках адмін-панель відкривається лише після підтвердження email.
--
--  Як запустити: Supabase → SQL Editor → New query → вставити весь файл → Run.
-- =====================================================================

begin;

alter table public.users
  add column if not exists is_admin boolean not null default false;

create table if not exists public.admin_invites (
  email       citext primary key check (length(email) <= 254),
  invited_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Доступ — лише сервер сайту (як і для решти таблиць)
alter table public.admin_invites enable row level security;
revoke all on public.admin_invites from anon, authenticated;
grant all on public.admin_invites to service_role;

commit;
