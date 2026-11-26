-- =====================================================================
--  Нові категорії: «Ножі та точила» (knives) і «Мультитули та інструменти» (tools)
--  — під товари Atlantmarket (Ganzo, Ruike, Civivi, Work Sharp, Roxon, NexTool…).
--
--  Як запустити: Supabase → SQL Editor → New query → вставити весь файл → Run.
-- =====================================================================

begin;

alter table public.products drop constraint if exists products_category_check;
alter table public.products add constraint products_category_check check (category in (
  'tents','backpacks','sleeping-bags','cookware','furniture','lighting','grills','hammocks','accessories',
  'picnic','thermos','clothing','tactical','fishing','electronics','knives','tools'));

commit;
