'use client';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import ar from '@/messages/ar.json';
import { applyMark, type SavedMark } from '@/lib/actions/marks';
import type { ErrorSubtype, ErrorType } from '@/lib/mushaf/load';
import type { Line, LineItem, WordItem } from '@/lib/mushaf/model';
import { planLetter, planWord, type MarkPlan, type MarkRow, type Tool } from '@/lib/mushaf/plan';
import { fitLines } from './fit';
import './mushaf.css';

export type { MarkRow };

type Props = {
  page: number;
  lines: Array<[number, Line]>;
  chapterNames: Record<number, string>;
  types: ErrorType[];
  subtypes: ErrorSubtype[];
  initialMarks: MarkRow[];
  hrefBase: string;
  sessionId: string | null;
  canEdit: boolean;
};

const FONT_BASE = 'https://verses.quran.foundation/fonts/quran/hafs/v2/woff2';
const LONG_PRESS_MS = 500;
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const toAr = (n: number | string) => String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);

/** base letter + its combining marks stay together (port of clusterize()) */
function clusterize(text: string): string[] {
  const out: string[] = [];
  for (const ch of text) {
    if (out.length && /\p{M}|\u200D/u.test(ch)) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

const fontFaces = new Map<number, FontFace>();

async function loadPageFont(page: number): Promise<string> {
  const family = `QCFV2 P${page}`;
  if (!fontFaces.has(page)) {
    const face = new FontFace(family, `url(${FONT_BASE}/p${page}.woff2) format('woff2')`);
    await face.load();
    document.fonts.add(face);
    fontFaces.set(page, face);
    while (fontFaces.size > 3) {
      const oldest = fontFaces.keys().next().value;
      if (oldest === undefined || oldest === page) break;
      document.fonts.delete(fontFaces.get(oldest)!);
      fontFaces.delete(oldest);
    }
  }
  return family;
}

const toRow = (r: SavedMark): MarkRow => ({
  id: r.id,
  location: r.location,
  letterIndex: r.letter_indexes?.[0] ?? null,
  typeId: r.error_type_id,
  subtypeId: r.subtype_id,
  readonly: false,
});

export function MushafView(props: Props) {
  const { page, lines, chapterNames, types, subtypes, initialMarks, hrefBase, sessionId, canEdit } = props;
  const router = useRouter();

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const tajweed = types.find((t) => t.code === 'tajweed');
  const defaultTool: Tool = types[0]?.id ?? 'erase';

  const [rows, setRows] = useState<MarkRow[]>(initialMarks);
  const rowsRef = useRef<MarkRow[]>(initialMarks);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const [tool, setTool] = useState<Tool>(defaultTool);
  const [subtypeId, setSubtypeId] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fontFor, setFontFor] = useState<number | null>(null);
  const [fontError, setFontError] = useState(false);
  const [modal, setModal] = useState<{ location: string; text: string } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressLong = useRef(false);

  const editable = canEdit;

  function commit(next: MarkRow[]) {
    rowsRef.current = next;
    setRows(next);
  }

  useEffect(() => {
    commit(initialMarks);
  }, [initialMarks]);

  useEffect(() => {
    let cancelled = false;
    setFontError(false);
    loadPageFont(page)
      .then(() => !cancelled && setFontFor(page))
      .catch(() => !cancelled && setFontError(true));
    return () => {
      cancelled = true;
    };
  }, [page]);

  const fontReady = fontFor === page;
  const familyStyle = { '--qcf': `'QCFV2 P${page}'` } as CSSProperties;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!fontReady || !el) return;
    fitLines(el);
    const ro = new ResizeObserver(() => fitLines(el));
    ro.observe(el);
    const t = setTimeout(() => fitLines(el), 400);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [fontReady, lines]);

  /* serialized writes: each plan reads the latest rows, so rapid taps never race */
  function enqueue(build: () => MarkPlan | null) {
    if (!editable) return;
    chain.current = chain.current.then(async () => {
      const plan = build();
      if (!plan) return;
      setBusy(true);
      const res = await applyMark({ ...plan, sessionId });
      setBusy(false);
      if (res.error) {
        setBanner(res.error);
        router.refresh();
        return;
      }
      const kept = rowsRef.current.filter((r) => !plan.removeIds.includes(r.id));
      commit(res.row ? [...kept, toRow(res.row)] : kept);
    });
  }

  function flashBanner(text: string) {
    setBanner(text);
    setTimeout(() => setBanner(null), 3000);
  }

  function onWordTap(item: WordItem) {
    if (item.location.startsWith('1:1:')) return flashBanner(ar.mushaf.bismillahBlocked);
    enqueue(() => planWord(rowsRef.current, item.location, tool, subtypeId));
  }

  function startPress(item: WordItem) {
    pressLong.current = false;
    pressTimer.current = setTimeout(() => {
      pressLong.current = true;
      if (navigator.vibrate) navigator.vibrate(10);
      if (item.location.startsWith('1:1:')) return flashBanner(ar.mushaf.bismillahBlocked);
      setModal({ location: item.location, text: item.text });
    }, LONG_PRESS_MS);
  }

  function endPress(item: WordItem) {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    if (!pressLong.current) onWordTap(item);
  }

  function cancelPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  const rowsByLoc = useMemo(() => {
    const m = new Map<string, MarkRow[]>();
    for (const r of rows) {
      const list = m.get(r.location);
      if (list) list.push(r);
      else m.set(r.location, [r]);
    }
    return m;
  }, [rows]);

  const colorOf = (typeId: number) => typeById.get(typeId)?.color_hex ?? '';

  function wordColors(loc: string) {
    const list = [...(rowsByLoc.get(loc) ?? [])].sort((a, b) => Number(a.readonly) - Number(b.readonly));
    let word: string | null = null;
    const letters = new Map<number, string>();
    for (const r of list) {
      if (r.letterIndex === null) {
        if (word === null) word = colorOf(r.typeId);
      } else if (!letters.has(r.letterIndex)) {
        letters.set(r.letterIndex, colorOf(r.typeId));
      }
    }
    return { word, letters };
  }

  function renderItem(item: LineItem, key: number) {
    if (item.kind === 'badge') {
      return (
        <span key={`b${key}`} className="ayah" title={toAr(item.verseNumber)}>
          {toAr(item.verseNumber)}
        </span>
      );
    }
    const blocked = item.location.startsWith('1:1:');
    const { word, letters } = wordColors(item.location);
    const cls = `qw${letters.size ? ' lm' : ''}${blocked ? ' blocked' : ''}`;
    const common = {
      'data-loc': item.location,
      onPointerDown: () => !blocked && editable && startPress(item),
      onPointerUp: () => !blocked && editable && endPress(item),
      onPointerLeave: cancelPress,
      onPointerCancel: cancelPress,
      onClick: blocked ? () => flashBanner(ar.mushaf.bismillahBlocked) : undefined,
      onContextMenu: (e: MouseEvent) => e.preventDefault(),
    };
    if (letters.size) {
      const clusters = clusterize(item.text);
      return (
        <span key={`w${key}`} className={cls} style={{ color: word ?? undefined }} {...common}>
          {clusters.map((cl, i) => (
            <b key={i} style={{ color: letters.get(i) ?? word ?? undefined }}>
              {cl}
            </b>
          ))}
        </span>
      );
    }
    return (
      <span key={`w${key}`} className={cls} style={{ color: word ?? undefined }} {...common}>
        {item.codeV2}
      </span>
    );
  }

  function renderLine(n: number, line: Line) {
    if (line.kind === 'header') {
      return (
        <div key={n} className="hrow" data-line={n}>
          <span className="hrow-name">﴿ سُورَةُ {chapterNames[line.chapterId] ?? ''} ﴾</span>
        </div>
      );
    }
    if (line.kind === 'basmala') {
      return (
        <div key={n} className="hrow" data-line={n}>
          <span className="font-quran text-ink">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</span>
        </div>
      );
    }
    return (
      <div key={n} data-line={n} className={`mline${line.flush ? ' flush' : ''}`}>
        {line.markers.map((m) => (
          <span
            key={m}
            data-fit="no"
            className={`mark mark-${m}`}
            title={m === 'sajda' ? 'موضع سجدة' : m === 'hizb' ? 'بداية الحزب' : 'بداية الربع'}
          >
            {m === 'sajda' ? '۩' : m === 'hizb' ? '۞' : ''}
          </span>
        ))}
        {line.items.map((item, i) => renderItem(item, i))}
      </div>
    );
  }

  const modalWordColors = modal ? wordColors(modal.location) : null;
  const modalClusters = modal ? clusterize(modal.text) : [];
  const toolColor = tool === 'erase' ? '#7c5a10' : colorOf(tool);
  const prev = Math.max(1, page - 1);
  const next = Math.min(604, page + 1);

  return (
    <div className="space-y-3">
      {banner && (
        <p role="status" className="rounded-xl bg-[#20342c] px-4 py-2 text-center text-xs font-bold text-white">
          {banner}
        </p>
      )}
      {!editable && <p className="text-center text-xs font-bold text-amber-brand">{ar.mushaf.sessionReadonly}</p>}

      <div className="mushaf-frame" style={familyStyle}>
        {fontError && (
          <p role="alert" className="py-10 text-center text-sm font-bold text-danger">
            {ar.mushaf.fontError}
          </p>
        )}
        {!fontError && !fontReady && (
          <p className="py-10 text-center text-sm font-bold text-gold-dark">{ar.mushaf.loading}</p>
        )}
        <div ref={containerRef} className="mushaf-lines" style={{ display: fontReady ? undefined : 'none' }}>
          <div className="flex flex-col">{lines.map(([n, line]) => renderLine(n, line))}</div>
          <p className="pt-1 text-center text-sm font-bold text-amber-brand">{toAr(page)}</p>
        </div>
      </div>

      <nav className="sticky bottom-2 z-20 mx-auto flex max-w-[820px] flex-wrap items-center justify-between gap-2 rounded-2xl border border-sand bg-card/95 p-2 shadow-lg backdrop-blur">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => router.push(`${hrefBase}${prev}`)} disabled={page <= 1} className="btn-secondary px-2 py-1 text-xs">
            {ar.mushaf.prev}
          </button>
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const v = Number(new FormData(e.currentTarget).get('page'));
              if (v >= 1 && v <= 604) router.push(`${hrefBase}${v}`);
            }}
          >
            <input name="page" type="number" min={1} max={604} key={page} defaultValue={page} dir="ltr" aria-label={ar.mushaf.pageLabel} className="field-input w-16 py-1 text-center text-xs" />
          </form>
          <button type="button" onClick={() => router.push(`${hrefBase}${next}`)} disabled={page >= 604} className="btn-secondary px-2 py-1 text-xs">
            {ar.mushaf.next}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {types.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tool === t.id}
              onClick={() => setTool(t.id)}
              className="flex items-center gap-1 rounded-lg border border-sand bg-white px-2 py-1 text-xs font-bold text-gold-dark aria-pressed:ring-2 aria-pressed:ring-amber-brand"
            >
              <span className="block h-3 w-3 rounded-full" style={{ background: t.color_hex }} />
              {t.name_ar}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={tool === 'erase'}
            onClick={() => setTool('erase')}
            className="rounded-lg border border-sand bg-white px-2 py-1 text-xs font-bold text-gold-dark aria-pressed:ring-2 aria-pressed:ring-amber-brand"
          >
            {ar.mushaf.erase}
          </button>
          {tool !== 'erase' && tajweed && tool === tajweed.id && (
            <select
              aria-label={ar.mushaf.tajweedSubtype}
              value={subtypeId ?? ''}
              onChange={(e) => setSubtypeId(e.target.value ? Number(e.target.value) : null)}
              className="field-input w-auto py-1 text-xs"
            >
              <option value="">{ar.mushaf.anySubtype}</option>
              {subtypes
                .filter((s) => s.error_type_id === tajweed.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name_ar}
                  </option>
                ))}
            </select>
          )}
          {busy && <span className="text-xs text-ink/50">{ar.mushaf.saving}</span>}
        </div>
      </nav>

      {modal && modalWordColors && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModal(null)}>
          <div className="card w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-gold-dark" dir="ltr">{modal.location}</p>
              <button type="button" onClick={() => setModal(null)} className="btn-secondary px-3 py-1 text-xs">
                {ar.mushaf.close}
              </button>
            </div>
            <div className="flex flex-wrap justify-center gap-2 py-2 font-quran text-3xl" dir="rtl" style={{ fontFamily: 'var(--font-quran), serif' }}>
              {modalClusters.map((cl, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={!editable}
                  onClick={() => enqueue(() => planLetter(rowsRef.current, modal.location, i, tool, subtypeId))}
                  className="rounded-xl border-2 border-sand bg-white px-2 py-1 leading-loose transition active:scale-95 disabled:opacity-60"
                  style={{ color: modalWordColors.letters.get(i) ?? modalWordColors.word ?? undefined }}
                >
                  {cl}
                </button>
              ))}
            </div>
            <p className="text-center text-xs text-ink/60">{ar.mushaf.letterHint}</p>
            <p className="text-center text-xs" style={{ color: toolColor }}>
              {tool === 'erase' ? ar.mushaf.erase : typeById.get(tool)?.name_ar}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
