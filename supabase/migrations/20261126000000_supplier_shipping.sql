-- =====================================================================
--  Умови відправки постачальника (склад)
--
--  Кожен постачальник — окремий склад: якщо в кошику товари з різних
--  складів, оформлюється окреме замовлення на кожен.
--  - cod_allowed   — чи можна накладений платіж (Atlantmarket — ні, лише 100% передоплата);
--  - np_only       — відправляє лише Новою поштою (Укрпошту для таких товарів сховано);
--  - dispatch_days — за скільки робочих днів відправляє після оплати
--                    (0 — як зараз: у будні до 14:00 того ж дня).
--
--  Як запустити: Supabase → SQL Editor → New query → вставити весь файл → Run.
-- =====================================================================

begin;

alter table public.suppliers
  add column if not exists cod_allowed boolean not null default true,
  add column if not exists np_only boolean not null default false,
  add column if not exists dispatch_days int not null default 0;

alter table public.suppliers drop constraint if exists suppliers_dispatch_days_check;
alter table public.suppliers
  add constraint suppliers_dispatch_days_check check (dispatch_days between 0 and 10);

-- Умови Atlantmarket з договору поставки: лише Нова пошта, 100% передоплата,
-- відправка протягом 3 робочих днів після оплати (якщо постачальника вже додано)
update public.suppliers set cod_allowed = false, np_only = true, dispatch_days = 3
where name ilike 'atlant%';

commit;
