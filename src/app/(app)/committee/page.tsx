import { notFound } from 'next/navigation';
import ar from '@/messages/ar.json';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { cancelExam, claimExam, completeExam } from '@/lib/actions/committee';
import { formatArabicDate, toArabicDigits } from '@/lib/utils';
import { ScheduleForm } from './schedule-form';

type ExamRow = {
  id: string;
  student_id: string;
  juz_number: number;
  state: 'nominated' | 'scheduled' | 'completed' | 'cancelled';
  examiner_id: string | null;
  nominated_by: string;
  scheduled_at: string | null;
  meeting_url: string | null;
  created_at: string;
};

const FLASH: Record<string, string> = {
  claimed: ar.committee.flash.claimed,
  scheduled: ar.committee.flash.scheduled,
  completed: ar.committee.flash.completed,
  cancelled: ar.committee.flash.cancelled,
};

export default async function CommitteePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const me = await getCurrentProfile();
  const supabase = await createClient();

  const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', me.id);
  const isCommittee = (roles ?? []).some((r) => r.role === 'examiner' || r.role === 'admin');
  if (!isCommittee) notFound();

  const { data } = await supabase
    .from('exams')
    .select('id, student_id, juz_number, state, examiner_id, nominated_by, scheduled_at, meeting_url, created_at')
    .in('state', ['nominated', 'scheduled'])
    .order('created_at', { ascending: true })
    .returns<ExamRow[]>();
  const exams = data ?? [];

  const queue = exams.filter((e) => e.state === 'nominated' && e.examiner_id === null);
  const mine = exams.filter((e) => e.examiner_id === me.id);

  const personIds = [...new Set(exams.flatMap((e) => [e.student_id, e.nominated_by]))];
  const { data: people } = personIds.length
    ? await supabase.from('users').select('id, user_code').in('id', personIds)
    : { data: [] as { id: string; user_code: string }[] };
  const codeOf = new Map((people ?? []).map((p) => [p.id, p.user_code]));

  const flash = Object.keys(FLASH).find((k) => params[k] === '1');
  const error = params.error;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark">{ar.committee.title}</h1>
        <p className="text-sm text-ink/70">{ar.committee.subtitle}</p>
      </header>

      {flash && <p className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-success">{FLASH[flash]}</p>}
      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-bold text-danger">{ar.committee.errors.generic}</p>}

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink/80">{ar.committee.queue}</h2>
        {queue.length === 0 ? (
          <p className="text-sm text-ink/60">{ar.committee.emptyQueue}</p>
        ) : (
          <ul className="space-y-3">
            {queue.map((e) => (
              <li key={e.id} className="card flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-bold text-gold-dark" dir="ltr">
                    {toArabicDigits(codeOf.get(e.student_id) ?? '')} · {ar.students.juz} {toArabicDigits(e.juz_number)}
                  </p>
                  <p className="text-xs text-ink/60">
                    {ar.committee.nominatedBy}: {toArabicDigits(codeOf.get(e.nominated_by) ?? '')} · {formatArabicDate(e.created_at)}
                  </p>
                </div>
                <form action={claimExam}>
                  <input type="hidden" name="examId" value={e.id} />
                  <button type="submit" className="btn-secondary">{ar.committee.claim}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink/80">{ar.committee.mine}</h2>
        {mine.length === 0 ? (
          <p className="text-sm text-ink/60">{ar.committee.emptyMine}</p>
        ) : (
          <ul className="space-y-4">
            {mine.map((e) => (
              <li key={e.id} className="card space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <p className="font-bold text-gold-dark" dir="ltr">
                    {toArabicDigits(codeOf.get(e.student_id) ?? '')} · {ar.students.juz} {toArabicDigits(e.juz_number)}
                  </p>
                  <span className="rounded-full bg-sand px-2.5 py-0.5 text-xs font-bold text-gold-dark">
                    {ar.exams.states[e.state]}
                  </span>
                </div>

                {e.state === 'nominated' && <ScheduleForm examId={e.id} />}

                {e.state === 'scheduled' && (
                  <div className="space-y-1 text-sm text-ink/70">
                    {e.scheduled_at && <p>{ar.exams.scheduledAt}: {formatArabicDate(e.scheduled_at)}</p>}
                    {e.meeting_url && (
                      <a href={e.meeting_url} target="_blank" rel="noreferrer" className="font-bold text-amber-brand hover:underline" dir="ltr">
                        {e.meeting_url}
                      </a>
                    )}
                  </div>
                )}

                {e.state === 'scheduled' && (
                  <form action={completeExam} className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-end">
                    <input type="hidden" name="examId" value={e.id} />
                    <div>
                      <label className="field-label" htmlFor={`res-${e.id}`}>{ar.committee.result}</label>
                      <select id={`res-${e.id}`} name="result" required defaultValue="" className="field-input">
                        <option value="" disabled>{ar.auth.selectPlaceholder}</option>
                        <option value="pass">{ar.exams.results.pass}</option>
                        <option value="fail">{ar.exams.results.fail}</option>
                      </select>
                    </div>
                    <div>
                      <label className="field-label" htmlFor={`notes-${e.id}`}>{ar.committee.notes}</label>
                      <input id={`notes-${e.id}`} name="notes" type="text" maxLength={2000} className="field-input" />
                    </div>
                    <button type="submit" className="btn-primary">{ar.committee.record}</button>
                  </form>
                )}

                <form action={cancelExam} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="examId" value={e.id} />
                  <div className="grow">
                    <label className="field-label" htmlFor={`reason-${e.id}`}>{ar.committee.cancelReason}</label>
                    <input id={`reason-${e.id}`} name="reason" type="text" required minLength={2} maxLength={300} className="field-input" />
                  </div>
                  <button type="submit" className="btn-secondary text-danger">{ar.committee.cancel}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
