-- seed.sql · reference data (idempotent).
-- Quran data lives in supabase/seed/quran_snapshot.sql — generate it with:
--   npm run snapshot:quran
-- and apply it AFTER this file (it is too large for the CLI's default seed).

-- ============ error types (colors map 1:1 to the Mushaf toolbar) ============
insert into public.error_types (code, name_ar, color_hex, sort) values
  ('talqeen', 'تَلْقِين', '#ef4444', 1),   -- prompting: reciter needed to be prompted
  ('tanbeeh', 'تَنْبِيه', '#22c55e', 2),   -- alert: minor slip, self-corrected
  ('tajweed', 'تَجْوِيد', '#3b82f6', 3)    -- tajweed/pronunciation rule
on conflict (code) do nothing;

-- ============ tajweed subtypes ============
insert into public.error_subtypes (error_type_id, code, name_ar, sort)
select t.id, s.code, s.name_ar, s.sort
from public.error_types t
join (values
  ('madd',      'مَدّ نَاقِص',   1),
  ('qalqalah',  'قَلْقَلَة',     2),
  ('ghunnah',   'غُنَّة',        3),
  ('tafkheem',  'تَفْخِيم',      4),
  ('tarqeeq',   'تَرْقِيق',      5),
  ('noon_sakinah','نُون سَاكِنَة',6),
  ('meem_sakinah','مِيم سَاكِنَة',7),
  ('other',     'أُخْرَى',       99)
) as s(code, name_ar, sort) on t.code = 'tajweed'
on conflict (error_type_id, code) do nothing;

-- ============ common-error categories ============
insert into public.common_error_categories (name_ar, sort) values
  ('مَدّ', 1), ('غُنَّة', 2), ('تَرْقِيق', 3), ('تَفْخِيم', 4),
  ('قَلْقَلَة', 5), ('تَشْكِيل', 6), ('وَقْف وَابْتِدَاء', 7), ('أُخْرَى', 99)
on conflict (name_ar) do nothing;

-- ============ first admin bootstrap ============
-- 1) Register the first account through the app.
-- 2) Then run (SQL editor or psql):
--      select public.grant_role_by_email('you@example.com', 'admin');
--    The first admin grant is allowed without an existing admin; afterwards only admins may grant.
-- Examiners:  select public.grant_role_by_email('examiner@example.com', 'examiner');
