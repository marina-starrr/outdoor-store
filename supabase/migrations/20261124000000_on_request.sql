-- =====================================================================
--  Товари «під замовлення»
--
--  Кількість у постачальника не відома точно (напр. у Ranger: чужий бренд і
--  залишок «1» = можна замовити будь-яку кількість, якщо є в постачальника).
--  - покупець оформлює потрібну кількість (не обмежену залишком);
--  - адміністратор уточнює в постачальника й лише тоді підтверджує;
--  - склад для таких позицій не списується й не повертається.
--
--  Як запустити: Supabase → SQL Editor → New query → вставити весь файл → Run.
-- =====================================================================

begin;

alter table public.products
  add column if not exists on_request boolean not null default false;

-- Знімок у замовленні: позиція була «під замовлення» на момент оформлення
alter table public.order_items
  add column if not exists on_request boolean not null default false;

-- Правило постачальника: товар не його бренду з залишком 1 — «під замовлення»
alter table public.suppliers
  add column if not exists other_brands_on_request boolean not null default false;
update public.suppliers set other_brands_on_request = true where name ilike 'ranger%';

commit;
