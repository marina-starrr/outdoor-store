-- =====================================================================
--  Порядок елементів у списках
--
--  Кошик, обране й рядки замовлення зберігаються цілим списком за раз,
--  тож час додавання однаковий — порядок задає position.
--  Сповіщення можуть з'явитися кілька в одній транзакції — seq зростає завжди.
--  Товари в каталозі показуються в порядку додавання (seq).
--
--  Як запустити: Supabase → SQL Editor → New query → вставити → Run.
-- =====================================================================

begin;

alter table public.cart_items  add column position integer not null default 0;
alter table public.favorites   add column position integer not null default 0;
alter table public.order_items add column position integer not null default 0;

-- Порядок товарів у каталозі — у порядку додавання
alter table public.products add column seq bigint generated always as identity;

alter table public.notifications add column seq bigint generated always as identity;
drop index if exists public.notifications_user_idx;
create index notifications_user_idx on public.notifications(user_id, seq desc);

-- Нова послідовність теж недоступна публічним ролям
revoke all on all sequences in schema public from anon, authenticated;
grant all on all sequences in schema public to service_role;

commit;
