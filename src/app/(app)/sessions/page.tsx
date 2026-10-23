import Link from 'next/link';
import ar from '@/messages/ar.json';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { respondToSession } from '@/lib/actions/sessions';
import { formatArabicDate, formatArabicTime12 } from '@/lib/utils';
import { NewSessionForm } from './new-session-form';

type SessionRow = {
  id: string;
  state: 'draft' | 'awaiting_reciter_approval' | 'accepted' | 'rejected';
  reciter_id: string;
  listener_id: string;
  session_date: string;
};

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;
  const me = await getCurrentProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from('mushaf_sessions')
    .select('id, state, reciter_id, listener_id, session_date')
    .order('session_date', { ascending: false })
    .limit(100)
    .returns<SessionRow[]>();
  const sessions = data ?? [];

  // the partner's code is visible only once a session has left its draft state (RLS);
  // names stay private — users are addressed by user_code (migration 0013)
  const otherIds = [
    ...new Set(
      sessions
        .filter((s) => s.state !== 'draft')
        .map((s) => (s.reciter_id === me.id ? s.listener_id : s.reciter_id)),
    ),
  ];
  const { data: others } = otherIds.length
    ? await supabase.from('users').select('id, user_code').in('id', otherIds)
    : { data: [] as { id: string; user_code: string }[] };
  const codeOf = new Map((others ?? []).map((u) => [u.id, u.user_code]));

  const incoming = sessions.filter((s) => s.reciter_id === me.id && s.state === 'awaiting_reciter_approval');
  const received = sessions.filter(
    (s) => s.reciter_id === me.id && (s.state === 'accepted' || s.state === 'rejected'),
  );
  const sentByMe = sessions.filter((s) => s.listener_id === me.id && s.state !== 'draft');
  const drafts = sessions.filter((s) => s.listener_id === me.id && s.state === 'draft');

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark">{ar.sessions.title}</h1>
        <p className="text-sm text-ink/70">{ar.sessions.subtitle}</p>
      </header>

      {sent === 'accepted' && <p className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-success">{ar.sessions.sentAccepted}</p>}
      {sent === 'pending' && <p className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-success">{ar.sessions.sentPending}</p>}

      <section className="card space-y-3">
        <h2 className="font-bold text-gold-dark">{ar.sessions.newTitle}</h2>
        <p className="text-sm text-ink/70">{ar.sessions.newHint}</p>
        <NewSessionForm />
      </section>

      {incoming.length > 0 && (
        <Group title={ar.sessions.incoming}>
          {incoming.map((s) => (
            <Item key={s.id} date={s.session_date} who={`${ar.sessions.from}: ${codeOf.get(s.listener_id) ?? ''}`} reviewHref={`/mushaf/session/${s.id}/review`}>
              <form action={respondToSession} className="flex gap-2">
                <input type="hidden" name="sessionId" value={s.id} />
                <button name="accept" value="true" className="btn-primary px-3 py-1.5 text-xs">{ar.sessions.accept}</button>
                <button name="accept" value="false" className="btn-secondary px-3 py-1.5 text-xs">{ar.sessions.reject}</button>
              </form>
            </Item>
          ))}
        </Group>
      )}

      <Group title={ar.sessions.drafts}>
        {drafts.map((s) => (
          <Item key={s.id} date={s.session_date} who={ar.sessions.draftLabel} reviewHref={`/mushaf/session/${s.id}/review`}>
            <Link href={`/mushaf/session/${s.id}/1`} className="text-sm font-bold text-amber-brand hover:underline">
              {ar.sessions.continue}
            </Link>
          </Item>
        ))}
      </Group>

      <Group title={ar.sessions.sent}>
        {sentByMe.map((s) => (
          <Item key={s.id} date={s.session_date} who={`${ar.sessions.to}: ${codeOf.get(s.reciter_id) ?? ''}`} reviewHref={`/mushaf/session/${s.id}/review`}>
            <StateBadge state={s.state} />
          </Item>
        ))}
      </Group>

      <Group title={ar.sessions.received}>
        {received.map((s) => (
          <Item key={s.id} date={s.session_date} who={`${ar.sessions.from}: ${codeOf.get(s.listener_id) ?? ''}`} reviewHref={`/mushaf/session/${s.id}/review`}>
            <StateBadge state={s.state} />
          </Item>
        ))}
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const empty = Array.isArray(items) && items.length === 0;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-ink/80">{title}</h2>
      {empty ? (
        <p className="text-sm text-ink/60">{ar.sessions.empty}</p>
      ) : (
        <ul className="divide-y divide-sand rounded-xl border border-sand bg-white">{children}</ul>
      )}
    </section>
  );
}

function Item({
  date,
  who,
  children,
  reviewHref,
}: {
  date: string;
  who: string;
  children?: React.ReactNode;
  /** when set, the who/date block links to the session's error review page */
  reviewHref?: string;
}) {
  const block = (
    <>
      <p className="font-bold text-ink">{who}</p>
      <p className="text-xs text-ink/60">
        {formatArabicDate(date)} · {formatArabicTime12(date)}
      </p>
    </>
  );
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div>
        {reviewHref ? (
          <Link href={reviewHref} className="block hover:text-amber-brand hover:underline">
            {block}
          </Link>
        ) : (
          block
        )}
      </div>
      {children}
    </li>
  );
}

function StateBadge({ state }: { state: SessionRow['state'] }) {
  const tone =
    state === 'accepted'
      ? 'bg-emerald-100 text-success'
      : state === 'rejected'
        ? 'bg-red-100 text-danger'
        : 'bg-sand text-gold-dark';
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}>{ar.sessions.states[state]}</span>;
}
