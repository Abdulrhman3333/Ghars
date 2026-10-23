-- 0002 · Quran snapshot: chapters / verses / words (Madani mushaf, QCF v2 pagination).
-- Populated by scripts/snapshot-quran.mjs → supabase/seed/quran_snapshot.sql (never fetched at runtime).

create table public.chapters (
  id            smallint primary key check (id between 1 and 114),
  name_arabic   text not null,
  name_simple   text not null,
  verses_count  smallint not null,
  bismillah_pre boolean not null default true
);

create table public.quran_verses (
  verse_key           text primary key,                       -- '2:255'
  chapter_id          smallint not null references public.chapters(id),
  verse_number        smallint not null,
  page                smallint not null check (page between 1 and 604),
  juz_number          smallint not null check (juz_number between 1 and 30),
  hizb_number         smallint not null,
  rub_el_hizb_number  smallint not null,
  sajdah_number       smallint,
  unique (chapter_id, verse_number)
);
create index quran_verses_page_idx on public.quran_verses(page);
create index quran_verses_juz_idx  on public.quran_verses(juz_number);

-- Only char_type_name='word' rows are stored ⇒ an FK to this table guarantees a markable word.
create table public.quran_words (
  location      text primary key,                             -- '2:255:3'
  verse_key     text not null references public.quran_verses(verse_key) on delete cascade,
  page          smallint not null check (page between 1 and 604),
  line_number   smallint not null check (line_number between 1 and 15),
  word_position smallint not null,                            -- 1-based index within the verse
  code_v2       text not null,                                -- QCF v2 page-font glyph
  text_uthmani  text not null,                                -- plain text (letter-level modal)
  v2_page       smallint not null
);
create index quran_words_page_idx  on public.quran_words(page);
create index quran_words_verse_idx on public.quran_words(verse_key);
