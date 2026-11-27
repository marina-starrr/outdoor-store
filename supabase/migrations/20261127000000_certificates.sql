-- =====================================================================
--  Сертифікати на ножі — висновок експерта, що ніж не є холодною зброєю
--
--  - certificate        — адреса PDF / скану (Supabase Storage, кошик certificates);
--  - certificate_exempt — товару в «Ножах» документ не потрібен (напр., точильний камінь).
--    Чохли, кліпси й темляки сайт розпізнає сам за назвою — їм нічого ставити не треба.
--
--  Ніж без сертифіката покупцям не показується (рішення власника).
--  Файли завантажуються в адмін-панелі: «Товари» → «Сертифікати ножів».
--  Кошик для файлів (Storage → certificates) сайт створить сам під час першого завантаження.
--
--  Як запустити: Supabase → SQL Editor → New query → вставити весь файл → Run.
--  Повторний запуск нічого не ламає.
-- =====================================================================

begin;

alter table public.products
  add column if not exists certificate text
    check (certificate is null or certificate like 'https://%' or certificate like '/api/uploads/cert-%'),
  add column if not exists certificate_exempt boolean not null default false;

commit;
