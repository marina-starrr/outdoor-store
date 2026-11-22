-- НЕ міграція (тека manual: pg_cron є лише в Supabase, у тестовій базі його немає).
-- Щогодинне оновлення постачальників (ціни, залишки, копіювання фото) — з самої бази Supabase.
--
-- Чому не GitHub Actions: GitHub запускає розклад «коли зможе» — 22.11 «щогодинне»
-- оновлення спрацювало лише двічі за 14 годин. pg_cron у Supabase запускає вчасно.
-- GitHub-розклад лишається запасним (зайвий запуск нічого не ламає).
--
-- Виконати ОДИН раз у Supabase → SQL Editor, замінивши ВСТАВТЕ_CRON_SECRET на значення
-- CRON_SECRET (те саме, що у Vercel). Секрет зберігається у Vault (зашифровано).
-- Готова до вставки копія з секретом — у локальній теці backups (не в репозиторії).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Секрет (повторний запуск — оновлює значення)
select vault.create_secret('ВСТАВТЕ_CRON_SECRET', 'cron_secret', 'Bearer для /api/cron/suppliers')
where not exists (select 1 from vault.secrets where name = 'cron_secret');
select vault.update_secret(id, 'ВСТАВТЕ_CRON_SECRET') from vault.secrets where name = 'cron_secret';

-- Щогодини о :07 (повторний запуск замінює розклад з тією ж назвою)
select cron.schedule(
  'suppliers-hourly',
  '7 * * * *',
  $$
  select net.http_get(
    url := 'https://outdoor-store-ten.vercel.app/api/cron/suppliers',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);

-- Перевірка через годину:
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
--   select status_code, created from net._http_response order by created desc limit 5;
