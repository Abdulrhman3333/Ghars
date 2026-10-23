import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { ChapterMeta, PageInput, PageWord, VerseMeta } from './model';

export type ErrorType = { id: number; code: string; name_ar: string; color_hex: string };
export type ErrorSubtype = { id: number; error_type_id: number; name_ar: string };

export type LoadedPage = {
  input: PageInput;
  locations: string[];
  chapterNames: Record<number, string>;
  types: ErrorType[];
  subtypes: ErrorSubtype[];
};

const WORD_COLUMNS = 'location, verse_key, page, line_number, word_position, code_v2, text_uthmani';

export async function loadMushafPage(page: number): Promise<LoadedPage | null> {
  const supabase = await createClient();

  const { data: rawWords, error: wordsError } = await supabase
    .from('quran_words')
    .select(WORD_COLUMNS)
    .eq('page', page);
  if (wordsError || !rawWords?.length) return null;

  const words = [...(rawWords as PageWord[])].sort((a, b) => {
    const [ca, va] = a.verse_key.split(':').map(Number);
    const [cb, vb] = b.verse_key.split(':').map(Number);
    return ca - cb || va - vb || a.word_position - b.word_position;
  });
  const keys = [...new Set(words.map((w) => w.verse_key))];

  const [verseRes, allWordsRes, chapterRes, typeRes, subtypeRes] = await Promise.all([
    supabase
      .from('quran_verses')
      .select('verse_key, chapter_id, verse_number, hizb_number, rub_el_hizb_number, sajdah_number')
      .in('verse_key', keys),
    // every word of the verses touching this page: needed to know where each verse ends
    supabase.from('quran_words').select('location, verse_key, page, word_position').in('verse_key', keys),
    supabase.from('chapters').select('id, verses_count, bismillah_pre, name_arabic'),
    supabase.from('error_types').select('id, code, name_ar, color_hex').order('sort'),
    supabase.from('error_subtypes').select('id, error_type_id, name_ar').order('sort'),
  ]);

  const verses = (verseRes.data ?? []) as VerseMeta[];
  const chapterRows = (chapterRes.data ?? []) as Array<ChapterMeta & { name_arabic: string }>;
  const chapters: ChapterMeta[] = chapterRows;
  const chapterById = new Map(chapters.map((c) => [c.id, c]));
  const chapterNames = Object.fromEntries(chapterRows.map((c) => [c.id, c.name_arabic]));

  const lastWordOf = new Map<string, { location: string; page: number; word_position: number }>();
  for (const w of allWordsRes.data ?? []) {
    const cur = lastWordOf.get(w.verse_key);
    if (!cur || w.word_position > cur.word_position) lastWordOf.set(w.verse_key, w);
  }
  const endLocations: Record<string, number> = {};
  const verseNumberByKey = new Map(verses.map((v) => [v.verse_key, v.verse_number]));
  for (const [key, last] of lastWordOf) {
    if (last.page === page && verseNumberByKey.has(key)) {
      endLocations[last.location] = verseNumberByKey.get(key)!;
    }
  }

  // the verse before the page's first verse: the same verse if this page starts mid-verse
  const first = words[0];
  let prevLast: VerseMeta | null = null;
  if (page > 1) {
    let prevKey: string | null = null;
    if (first.word_position > 1) {
      prevKey = first.verse_key;
    } else {
      const [ch, n] = first.verse_key.split(':').map(Number);
      if (n > 1) prevKey = `${ch}:${n - 1}`;
      else if (ch > 1) prevKey = `${ch - 1}:${chapterById.get(ch - 1)?.verses_count ?? 0}`;
    }
    if (prevKey) {
      const { data } = await supabase
        .from('quran_verses')
        .select('verse_key, chapter_id, verse_number, hizb_number, rub_el_hizb_number, sajdah_number')
        .eq('verse_key', prevKey)
        .maybeSingle();
      prevLast = (data as VerseMeta | null) ?? null;
    }
  }

  const pageVerses = keys
    .map((k) => verses.find((v) => v.verse_key === k))
    .filter((v): v is VerseMeta => v !== undefined);

  return {
    input: { page, words, verses: pageVerses, prevLast, chapters, endLocations },
    locations: words.map((w) => w.location),
    chapterNames,
    types: (typeRes.data ?? []) as ErrorType[],
    subtypes: (subtypeRes.data ?? []) as ErrorSubtype[],
  };
}
