-- =====================================================================
--  Оплата на рахунок і бронювання товару
--
--  Новий шлях замовлення: нове → підтверджене (товар заброньовано, чекаємо
--  оплату 3 дні) → оплачене → відправлене → виконане.
--  Товар списується зі складу не при оформленні, а коли адміністратор
--  підтверджує замовлення; при скасуванні — повертається.
--
--  Як запустити: Supabase → SQL Editor → New query → вставити весь файл → Run.
-- =====================================================================

begin;

-- Новий статус «оплачене»
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('new','confirmed','paid','shipped','done','cancelled'));

-- Чи списано товар зі складу під це замовлення (щоб скасування не повернуло зайве)
alter table public.orders add column stock_reserved boolean not null default false;
-- Коли підтверджено — від цього рахується строк оплати
alter table public.orders add column confirmed_at timestamptz;
-- Коли надійшла оплата
alter table public.orders add column paid_at timestamptz;

-- Замовлення, оформлені раніше: товар списувався одразу при оформленні
update public.orders set stock_reserved = true where status <> 'cancelled';
-- Уже підтверджені — 3 дні на оплату від сьогодні, а не від давньої дати
update public.orders set confirmed_at = now() where status = 'confirmed';

-- Пошук прострочених неоплачених замовлень
create index orders_unpaid_idx on public.orders(confirmed_at) where status = 'confirmed';

commit;
