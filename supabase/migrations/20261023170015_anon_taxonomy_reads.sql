-- 0015 · the cached Mushaf loader (unstable_cache through the cookieless anon
-- client) also reads the error taxonomy for the toolbar, so anon needs SELECT
-- here too. Taxonomy is public reference data, exactly like the Quran snapshot.

create policy error_types_select_anon on public.error_types
  for select to anon
  using (true);

create policy error_subtypes_select_anon on public.error_subtypes
  for select to anon
  using (true);

create policy ce_categories_select_anon on public.common_error_categories
  for select to anon
  using (true);
