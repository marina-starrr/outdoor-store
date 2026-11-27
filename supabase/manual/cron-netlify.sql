-- НЕ міграція (тека manual: pg_cron є лише в Supabase).
-- Розклад запитів до сайту на Netlify. Netlify обриває запит за ~10 с, тож
-- щогодинне оновлення розбите на короткі виклики, а задачі, які раніше запускав
-- Vercel Cron (vercel.json), тепер теж запускає pg_cron.
--
-- Виконати ОДИН раз у Supabase → SQL Editor ПІСЛЯ того, як сайт запрацює на
-- Netlify за адресою https://www.familycamping.pp.ua (домен переведено на Netlify).
-- Секрет cron_secret уже лежить у Vault (див. cron-suppliers.sql) — CRON_SECRET у
-- Netlify має бути тим самим значенням.
-- Повторний запуск замінює розклади з тими самими назвами.

-- Старий єдиний виклик (усе разом, до 60 с) на Netlify не вкладається
select cron.unschedule('suppliers-hourly') where exists (select 1 from cron.job where jobname = 'suppliers-hourly');

-- Один виклик за розкладом: GET на сайт з Authorization: Bearer <cron_secret>
create or replace function public.call_site(path text) returns bigint
language sql security definer set search_path = public as $$
  select net.http_get(
    url := 'https://www.familycamping.pp.ua' || path,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 30000
  );
$$;
revoke all on function public.call_site(text) from public, anon, authenticated;

-- Ціни й залишки — щогодини, кожен постачальник окремо (~5 с кожен)
select cron.schedule('suppliers-ranger', '7 * * * *', $$ select public.call_site('/api/cron/suppliers?supplier=Ranger') $$);
select cron.schedule('suppliers-atlantmarket', '9 * * * *', $$ select public.call_site('/api/cron/suppliers?supplier=Atlantmarket') $$);
-- Порція фото постачальників у наше сховище (до 7 с) — щогодини
select cron.schedule('supplier-photos', '12 * * * *', $$ select public.call_site('/api/cron/suppliers?photos=1') $$);
-- Неоплачені за 3 дні замовлення — щодня о 7:00 UTC (раніше — Vercel Cron)
select cron.schedule('orders-daily', '0 7 * * *', $$ select public.call_site('/api/cron/orders') $$);
-- Довідник міст Нової пошти — щопонеділка о 3:00 UTC (раніше — Vercel Cron)
select cron.schedule('np-cities-weekly', '0 3 * * 1', $$ select public.call_site('/api/cron/np-cities') $$);

-- Перевірка через годину:
--   select jobname, schedule from cron.job order by jobname;
--   select status_code, left(content, 200), created from net._http_response order by created desc limit 10;
