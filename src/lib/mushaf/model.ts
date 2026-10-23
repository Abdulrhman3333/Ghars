/**
 * Pure page-layout model (port of buildModel() in error-hilighter.html).
 * Input comes from the local Quran snapshot, never from quran.com at runtime.
 */

export type Marker = 'hizb' | 'rub' | 'sajda';

export type WordItem = { kind: 'word'; location: string; codeV2: string; text: string };
export type BadgeItem = { kind: 'badge'; verseNumber: number };
export type LineItem = WordItem | BadgeItem;

export type Line =
  | { kind: 'words'; items: LineItem[]; markers: Marker[]; flush: boolean }
  | { kind: 'header'; chapterId: number }
  | { kind: 'basmala' };

export type PageWord = {
  location: string;
  verse_key: string;
  page: number;
  line_number: number;
  word_position: number;
  code_v2: string;
  text_uthmani: string;
};

export type VerseMeta = {
  verse_key: string;
  chapter_id: number;
  verse_number: number;
  hizb_number: number;
  rub_el_hizb_number: number;
  sajdah_number: number | null;
};

export type ChapterMeta = { id: number; verses_count: number; bismillah_pre: boolean };

export type PageInput = {
  page: number;
  /** all words whose page is `page`, in reading order */
  words: PageWord[];
  /** metadata of every verse that has a word on this page, in reading order */
  verses: VerseMeta[];
  prevLast: VerseMeta | null;
  chapters: ChapterMeta[];
  /** location of the last word of a verse that ends on this page → verse number for the badge */
  endLocations: Record<string, number>;
};

type Slot = {
  kind: 'words' | 'header' | 'basmala';
  chapterId?: number;
  items: LineItem[];
  markers: Marker[];
};

const emptySlot = (kind: Slot['kind'] = 'words'): Slot => ({ kind, items: [], markers: [] });

/** Returns every line of the page from the first to the last used line (gaps filled), in order. */
export function buildPageModel(input: PageInput): Array<[number, Line]> {
  const chapterById = new Map(input.chapters.map((c) => [c.id, c]));
  const verseByKey = new Map(input.verses.map((v) => [v.verse_key, v]));
  const slots = new Map<number, Slot>();
  const slot = (n: number) => {
    let s = slots.get(n);
    if (!s) {
      s = emptySlot();
      slots.set(n, s);
    }
    return s;
  };

  const pageWords = input.words.filter((w) => w.page === input.page);
  const groups = new Map<string, PageWord[]>();
  for (const w of pageWords) {
    const g = groups.get(w.verse_key);
    if (g) g.push(w);
    else groups.set(w.verse_key, [w]);
  }

  let prevEndLine: number | null = null;
  let prevVerse: VerseMeta | null = null;

  for (const [key, ws] of groups) {
    const v = verseByKey.get(key);
    if (!v) continue;
    const startLine = ws[0].line_number;

    // surah start: the reserved lines above it become the header (and basmala, if any)
    if (v.verse_number === 1) {
      const gapStart = prevEndLine === null ? 1 : prevEndLine + 1;
      const gapCount = startLine - gapStart;
      if (gapCount >= 1) {
        const header = slot(gapStart);
        header.kind = 'header';
        header.chapterId = v.chapter_id;
        if (gapCount >= 2 && chapterById.get(v.chapter_id)?.bismillah_pre !== false) {
          slot(gapStart + 1).kind = 'basmala';
        }
      }
    }

    if (v.sajdah_number != null) {
      slot(startLine).markers.push('sajda');
    } else {
      const ref = prevVerse ?? input.prevLast;
      if (ref && v.hizb_number !== ref.hizb_number) slot(startLine).markers.push('hizb');
      else if (ref && v.rub_el_hizb_number !== ref.rub_el_hizb_number) slot(startLine).markers.push('rub');
    }

    let lastLine = startLine;
    for (const w of ws) {
      slot(w.line_number).items.push({
        kind: 'word',
        location: w.location,
        codeV2: w.code_v2,
        text: w.text_uthmani,
      });
      lastLine = w.line_number;
      const endOf = input.endLocations[w.location];
      if (endOf !== undefined) {
        slot(lastLine).items.push({ kind: 'badge', verseNumber: endOf });
      }
    }
    prevEndLine = lastLine;
    prevVerse = v;
  }

  // flush (right-aligned, not stretched) lines: before a header/basmala row, at a surah end, or sparse lines
  const sortedKeys = [...slots.keys()].sort((a, b) => a - b);
  const lastPageVerse = input.verses[input.verses.length - 1];
  const lastChapter = lastPageVerse ? chapterById.get(lastPageVerse.chapter_id) : undefined;
  const flush = new Map<number, boolean>();
  sortedKeys.forEach((n, i) => {
    const cur = slots.get(n)!;
    if (cur.kind !== 'words') return;
    const next = slots.get(sortedKeys[i + 1]);
    const nextIsBreak = !next || next.kind === 'header' || next.kind === 'basmala';
    const isLast = i === sortedKeys.length - 1;
    const surahEndsHere =
      isLast && !!lastPageVerse && !!lastChapter && lastPageVerse.verse_number === lastChapter.verses_count;
    flush.set(n, nextIsBreak || surahEndsHere || cur.items.length <= 2);
  });

  if (sortedKeys.length === 0) return [];
  const result: Array<[number, Line]> = [];
  for (let n = sortedKeys[0]; n <= sortedKeys[sortedKeys.length - 1]; n++) {
    const s = slots.get(n) ?? emptySlot();
    if (s.kind === 'header') {
      result.push([n, { kind: 'header', chapterId: s.chapterId ?? 0 }]);
    } else if (s.kind === 'basmala') {
      result.push([n, { kind: 'basmala' }]);
    } else {
      result.push([n, { kind: 'words', items: s.items, markers: s.markers, flush: flush.get(n) ?? false }]);
    }
  }
  return result;
}
