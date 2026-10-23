import Link from 'next/link';
import { notFound } from 'next/navigation';
import ar from '@/messages/ar.json';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAcceptedViewer } from '@/lib/mushaf/viewer-access';
import { formatArabicDate, formatArabicTime12, toArabicDigits } from '@/lib/utils';

type SessionRow = {
  id: string;
  state: 'draft' | 'awaiting_reciter_approval' | 'accepted' | 'rejected';
  session_date: string;
};

export default async function WatchHomePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^\d{6}$/.test(code)) notFound();

  const me = await getCurrentProfile();
  const supabase = await createClient();

  const { data: ownerData } = await supabase.rpc('lookup_user_by_code', { p_code: code });
  const owner = ownerData as unknown as string | null;
  if (!owner) notFound();

  // RLS determines what rows come back, but this check is the explicit gate for the UI
  if (!(await isAcceptedViewer(supabase, owner, me.id))) notFound();

  const { data } = await supabase
    .from('mushaf_sessions')
    .select('id, state, session_date')
    .eq('reciter_id', owner)
    .order('session_date', { ascending: false })
    .limit(100)
    .returns<SessionRow[]>();
  const sessions = data ?? [];

  const tone = (s: SessionRow['state']) =>
    s === 'accepted' ? 'bg-emerald-100 text-success' : s === 'rejected' ? 'bg-red-100 text-danger' : 'bg-sand text-gold-dark';

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark">
          {ar.watch.title} <span className="font-mono" dir="ltr">{toArabicDigits(code)}</span>
        </h1>
        <p className="text-sm text-ink/70">{ar.watch.readonlyHint}</p>
      </header>

      <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="space-y-1">
          <h2 className="font-bold text-gold-dark">{ar.watch.mushaf}</h2>
          <p className="text-sm text-ink/70">{ar.watch.mushafHint}</p>
        </div>
        <Link href={`/watch/${code}/1`} className="btn-primary text-sm">{ar.watch.open}</Link>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink/80">{ar.watch.sessionsTitle}</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-ink/60">{ar.watch.sessionEmpty}</p>
        ) : (
          <ul className="divide-y divide-sand rounded-xl border border-sand bg-white">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <p className="text-xs text-ink/60">
                  {formatArabicDate(s.session_date)} · {formatArabicTime12(s.session_date)}
                </p>
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone(s.state)}`}>
                    {ar.sessions.states[s.state]}
                  </span>
                  <Link href={`/mushaf/session/${s.id}/review`} className="text-sm font-bold text-amber-brand hover:underline">
                    {ar.sessions.reviewTitle}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
