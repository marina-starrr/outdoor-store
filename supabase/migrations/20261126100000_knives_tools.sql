-- =====================================================================
--  Нові категорії під товари Atlantmarket:
--  «Пальники та обладнання» (burners), «Ножі» (knives), «Точильні системи» (sharpeners),
--  «Мультитули» (multitools), «Інструменти» (tools), «Масла і мастила» (lubricants).
--
--  Як запустити: Supabase → SQL Editor → New query → вставити весь файл → Run.
--  Повторний запуск нічого не ламає.
-- =====================================================================

begin;

alter table public.products drop constraint if exists products_category_check;
alter table public.products add constraint products_category_check check (category in (
  'tents','backpacks','sleeping-bags','cookware','furniture','lighting','grills','hammocks','accessories',
  'picnic','thermos','clothing','tactical','fishing','electronics',
  'burners','knives','sharpeners','multitools','tools','lubricants'));

commit;
