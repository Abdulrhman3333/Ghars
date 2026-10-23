-- 0014 · the Quran snapshot is public: the cached Mushaf GET loader reads it
-- through a cookieless anon client, so anon needs SELECT on the three snapshot tables.
-- (The `chapters` anonymous landing page reads them the same way.)
-- Everything else stays private: `users` has no anon SELECT policy and RLS hides all rows.

create policy chapters_select_anon on public.chapters
  for select to anon
  using (true);

create policy quran_verses_select_anon on public.quran_verses
  for select to anon
  using (true);

create policy quran_words_select_anon on public.quran_words
  for select to anon
  using (true);
