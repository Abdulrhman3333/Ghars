import Link from 'next/link';
import { notFound } from 'next/navigation';
import ar from '@/messages/ar.json';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { clusterize } from '@/lib/mushaf/clusters';
import { isAcceptedViewer } from '@/lib/mushaf/viewer-access';
import { formatArabicDate, formatArabicTime12, toArabicDigits } from '@/lib/utils';

type SessionRow = {
  id: string;
  state: 'draft' | 'awaiting_reciter_approval' | 'accepted' | 'rejected';
  reciter_id: string;
  listener_id: string;
  session_date: string;
};

type ErrorRow = {
  location: string;
  letter_indexes: number[] | null;
  error_type_id: number;
  subtype_id: number | null;
};

type WordRow = { location: string; verse_key: string; page: number; text_uthmani: string };

export default async function SessionReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const me = await getCurrentProfile();
  const supabase = await createClient();

  const { data: sessionData } = await supabase
    .from('mushaf_sessions')
    .select('id, state, reciter_id, listener_id, session_date')
    .eq('id', id)
    .single();
  const session = sessionData as unknown as SessionRow | null;
  // the two participants can open the review; drafts are listener-only (RLS);
  // an accepted viewer on the reciter's list may review read-only too
  if (!session) notFound();
  const viewer =
    session.listener_id !== me.id &&
    session.reciter_id !== me.id &&
    (await isAcceptedViewer(supabase, session.reciter_id, me.id));
  if (!viewer && session.listener_id !== me.id && session.reciter_id !== me.id) notFound();

  const isReciter = session.reciter_id === me.id;

  /* partner's user_code is readable only once the session has left draft (RLS) */
  const otherId = isReciter ? session.listener_id : session.reciter_id;
  const { data: other } =
    session.state !== 'draft'
      ? await supabase.from('users').select('user_code').eq('id', otherId).single()
      : { data: null as { user_code: string } | null };

  const [typeRes, subtypeRes] = await Promise.all([
    supabase.from('error_types').select('id, name_ar, color_hex').order('sort'),
    supabase.from('error_subtypes').select('id, error_type_id, name_ar').order('sort'),
  ]);
  const typeById = new Map(((typeRes.data ?? []) as Array<{ id: number; name_ar: string; color_hex: string }>).map((t) => [t.id, t]));
  const subtypeById = new Map(((subtypeRes.data ?? []) as Array<{ id: number; error_type_id: number; name_ar: string }>).map((s) => [s.id, s]));

  const { data: errors } = await supabase
    .from('mushaf_errors')
    .select('location, letter_indexes, error_type_id, subtype_id')
    .eq('session_id', id)
    .returns<ErrorRow[]>();

  const locs = [...new Set((errors ?? []).map((e) => e.location))];
  const { data: words } = locs.length
    ? await supabase
        .from('quran_words')
        .select('location, verse_key, page, text_uthmani')
        .in('location', locs)
        .returns<WordRow[]>()
    : { data: [] as WordRow[] | null };
  const { data: chapters } = await supabase.from('chapters').select('id, name_arabic');
  const chapterName = new Map(((chapters ?? []) as Array<{ id: number; name_arabic: string }>).map((c) => [c.id, c.name_arabic]));

  const wordByLoc = new Map(((words ?? []) as WordRow[]).map((w) => [w.location, w]));
  const entries = (errors ?? [])
    .map((e) => ({ e, w: wordByLoc.get(e.location) ?? null }))
    .filter((x): x is { e: ErrorRow; w: WordRow } => x.w !== null)
    .sort((a, b) => {
      const [ca, va] = a.w.verse_key.split(':').map(Number);
      const [cb, vb] = b.w.verse_key.split(':').map(Number);
      return (
        ca - cb ||
        va - vb ||
        a.w.page - b.w.page ||
        (a.e.letter_indexes?.[0] ?? -1) - (b.e.letter_indexes?.[0] ?? -1)
      );
    });

  /* summary: how many errors of each kind */
  const counts = new Map<number, number>();
  for (const e of errors ?? []) counts.set(e.error_type_id, (counts.get(e.error_type_id) ?? 0) + 1);

  const tone =
    session.state === 'accepted'
      ? 'bg-emerald-100 text-success'
      : session.state === 'rejected'
        ? 'bg-red-100 text-danger'
        : 'bg-sand text-gold-dark';

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-gold-dark">{ar.sessions.reviewTitle}</h1>
        <p className="text-sm text-ink/70">
          {formatArabicDate(session.session_date)} · {formatArabicTime12(session.session_date)}
          <span className={`mr-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}>
            {ar.sessions.states[session.state]}
          </span>
          {session.state !== 'draft' && (other as { user_code: string } | null)?.user_code && (
            <span className="mr-2">{isReciter ? `${ar.sessions.from}: ${(other as { user_code: string }).user_code}` : `${ar.sessions.to}: ${(other as { user_code: string }).user_code}`}</span>
          )}
        </p>
      </header>

      {counts.size > 0 && (
        <section className="card flex flex-wrap items-center gap-2 p-4">
          <h2 className="text-sm font-bold text-gold-dark">{ar.sessions.errorKinds}:</h2>
          {[...counts.entries()].map(([typeId, n]) => {
            const t = typeById.get(typeId);
            if (!t) return null;
            return (
              <span key={typeId} className="flex items-center gap-1 rounded-lg border border-sand bg-white px-2 py-1 text-xs font-bold text-gold-dark">
                <span className="block h-3 w-3 rounded-full" style={{ background: t.color_hex }} />
                {t.name_ar} ({toArabicDigits(n)})
              </span>
            );
          })}
        </section>
      )}

      {entries.length === 0 ? (
        <p className="card p-6 text-center text-sm font-bold text-ink/60">{ar.sessions.reviewEmpty}</p>
      ) : (
        <ul className="divide-y divide-sand rounded-xl border border-sand bg-white">
          {entries.map(({ e, w }, i) => {
            const type = typeById.get(e.error_type_id);
            const subtype = e.subtype_id ? subtypeById.get(e.subtype_id) : null;
            const [chapterId, verseNumber] = w.verse_key.split(':').map(Number);
            return (
              <li key={i} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="mb-1 text-xs text-ink/60">
                    {chapterName.get(chapterId)} — {ar.sessions.verse} {toArabicDigits(verseNumber)}
                  </p>
                  <WordWithMarks word={w} letterIndexes={e.letter_indexes} color={type?.color_hex ?? ''} />
                </div>
                <div className="flex flex-col items-start gap-1">
                  {type && (
                    <span className="flex items-center gap-1 rounded-lg border border-sand bg-white px-2 py-1 text-xs font-bold text-gold-dark">
                      <span className="block h-3 w-3 rounded-full" style={{ background: type.color_hex }} />
                      {type.name_ar}
                    </span>
                  )}
                  {subtype && <span className="text-xs text-ink/70">{subtype.name_ar}</span>}
                  <Link href={`/mushaf/session/${session.id}/${w.page}`} className="text-xs font-bold text-amber-brand hover:underline">
                    {ar.sessions.openPage} {toArabicDigits(w.page)}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-center text-xs text-ink/60">{ar.sessions.reviewHint}</p>
    </div>
  );
}

/** The marked word: whole word colored, or only the marked letters (letter clusters). */
function WordWithMarks({
  word,
  letterIndexes,
  color,
}: {
  word: WordRow;
  letterIndexes: number[] | null;
  color: string;
}) {
  const clusters = clusterize(word.text_uthmani);
  const whole = letterIndexes === null;
  const marked = new Set(letterIndexes ?? []);
  return (
    <span dir="rtl" className="font-quran text-2xl leading-relaxed">
      {clusters.map((cl, i) =>
        whole || marked.has(i) ? (
          <b key={i} style={{ color }}>
            {cl}
          </b>
        ) : (
          <span key={i}>{cl}</span>
        ),
      )}
    </span>
  );
}
