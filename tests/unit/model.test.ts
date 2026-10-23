import { describe, expect, it } from 'vitest';
import { buildPageModel, type PageInput, type PageWord, type VerseMeta } from '@/lib/mushaf/model';

const chapters = [
  { id: 1, verses_count: 7, bismillah_pre: false },
  { id: 2, verses_count: 286, bismillah_pre: true },
];

function word(verse_key: string, position: number, line: number, page = 1): PageWord {
  return {
    location: `${verse_key}:${position}`,
    verse_key,
    page,
    line_number: line,
    word_position: position,
    code_v2: `g${verse_key}${position}`,
    text_uthmani: `t${position}`,
  };
}

function verse(key: string, hizb = 1, rub = 1, sajdah: number | null = null): VerseMeta {
  const [ch, n] = key.split(':').map(Number);
  return {
    verse_key: key,
    chapter_id: ch,
    verse_number: n,
    hizb_number: hizb,
    rub_el_hizb_number: rub,
    sajdah_number: sajdah,
  };
}

function build(input: Partial<PageInput> & Pick<PageInput, 'words' | 'verses'>) {
  return new Map(
    buildPageModel({
      page: 1,
      prevLast: null,
      chapters,
      endLocations: {},
      ...input,
    }),
  );
}

describe('buildPageModel', () => {
  it('places each word on its own line and keeps reading order', () => {
    const model = build({
      words: [word('2:2', 1, 3), word('2:2', 2, 3), word('2:3', 1, 4)],
      verses: [verse('2:2'), verse('2:3')],
      endLocations: { '2:2:2': 2 },
    });
    const line3 = model.get(3);
    expect(line3?.kind).toBe('words');
    if (line3?.kind !== 'words') throw new Error('expected words line');
    expect(line3.items.map((i) => (i.kind === 'word' ? i.location : `badge${i.verseNumber}`))).toEqual([
      '2:2:1',
      '2:2:2',
      'badge2',
    ]);
  });

  it('fills the reserved lines above a surah start with a header and basmala', () => {
    // page starts with verse 2:1 at line 3: lines 1 = header, 2 = basmala
    const model = build({
      words: [word('2:1', 1, 3), word('2:1', 2, 3)],
      verses: [verse('2:1')],
    });
    expect(model.get(1)).toEqual({ kind: 'header', chapterId: 2 });
    expect(model.get(2)).toEqual({ kind: 'basmala' });
    expect(model.get(3)?.kind).toBe('words');
  });

  it('adds only a header (no basmala) for surahs without bismillah_pre', () => {
    // al-Fatihah has bismillah_pre=false: one reserved line is only the header
    const model = build({
      words: [word('1:1', 1, 2), word('1:1', 2, 2)],
      verses: [verse('1:1')],
    });
    expect(model.get(1)).toEqual({ kind: 'header', chapterId: 1 });
    expect(model.get(2)?.kind).toBe('words');
  });

  it('marks a hizb boundary against the previous verse', () => {
    const model = build({
      page: 1,
      words: [word('2:5', 1, 2), word('2:6', 1, 3)],
      verses: [verse('2:5', 1), verse('2:6', 2)],
    });
    expect(model.get(3)?.kind === 'words' && model.get(3)!.markers).toEqual(['hizb']);
    expect(model.get(2)?.kind === 'words' && model.get(2)!.markers).toEqual([]);
  });

  it('uses the previous page verse as reference for the first verse on a page', () => {
    const model = build({
      words: [word('2:5', 1, 2)],
      verses: [verse('2:5', 2)],
      prevLast: verse('2:4', 1),
    });
    expect(model.get(2)?.kind === 'words' && model.get(2)!.markers).toEqual(['hizb']);
  });

  it('marks sajdah verses with the sajda marker only', () => {
    const model = build({
      words: [word('2:6', 1, 2)],
      verses: [verse('2:6', 1, 1, 1)],
      prevLast: verse('2:5', 2),
    });
    expect(model.get(2)?.kind === 'words' && model.get(2)!.markers).toEqual(['sajda']);
  });

  it('flushes a line that is followed by a header', () => {
    const model = build({
      words: [word('1:7', 1, 2), word('1:7', 2, 2), word('1:7', 3, 2), word('1:7', 4, 2), word('2:1', 1, 4), word('2:1', 2, 4), word('2:1', 3, 4), word('2:1', 4, 4)],
      verses: [verse('1:7'), verse('2:1')],
    });
    // line 2 is followed by the reserved line 3 (surah start gap), so it is flushed
    const line2 = model.get(2);
    expect(line2?.kind === 'words' && line2.flush).toBe(true);
  });

  it('returns an empty list for a page without words', () => {
    expect(buildPageModel({ page: 1, words: [], verses: [], prevLast: null, chapters, endLocations: {} })).toEqual([]);
  });
});
