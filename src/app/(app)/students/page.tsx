import Link from 'next/link';
import { headers } from 'next/headers';
import ar from '@/messages/ar.json';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createInvite, nominateStudent, resumeJuz } from '@/lib/actions/students';
import { toArabicDigits } from '@/lib/utils';

type ProgressRow = {
  id: string;
  student_id: string;
  juz_number: number;
  state: 'in_progress' | 'nominated' | 'exam_scheduled' | 'passed' | 'failed';
};

const STATE_LABEL: Record<ProgressRow['state'], string> = {
  in_progress: ar.students.inProgress,
  nominated: ar.exams.states.nominated,
  exam_scheduled: ar.exams.states.scheduled,
  passed: ar.exams.results.pass,
  failed: ar.exams.results.fail,
};

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ nominate?: string; invite?: string }>;
}) {
  const { nominate, invite } = await searchParams;
  const me = await getCurrentProfile();
  const supabase = await createClient();

  const { data: myPassed } = await supabase
    .from('progress')
    .select('juz_number')
    .eq('student_id', me.id)
    .eq('state', 'passed');
  const certified = new Set((myPassed ?? []).map((r) => r.juz_number));

  if (certified.size === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gold-dark">{ar.students.title}</h1>
        <p className="card text-sm text-ink/70">{ar.students.locked}</p>
      </div>
    );
  }

  const { data: rowsData } = await supabase
    .from('progress')
    .select('id, student_id, juz_number, state')
    .eq('teacher_id', me.id)
    .order('juz_number')
    .returns<ProgressRow[]>();
  const rows = rowsData ?? [];

  const studentIds = [...new Set(rows.map((r) => r.student_id))];
  const { data: students } = studentIds.length
    ? await supabase.from('users').select('id, user_code').in('id', studentIds)
    : { data: [] as { id: string; user_code: string }[] };
  const studentById = new Map((students ?? []).map((s) => [s.id, s]));

  const byStudent = new Map<string, ProgressRow[]>();
  for (const r of rows) {
    const list = byStudent.get(r.student_id) ?? [];
    list.push(r);
    byStudent.set(r.student_id, list);
  }

  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host')}`;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark">{ar.students.title}</h1>
        <p className="text-sm text-ink/70">{ar.students.subtitle}</p>
      </header>

      {nominate === 'done' && <p className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-success">{ar.students.nominateDone}</p>}
      {nominate === 'failed' && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-bold text-danger">{ar.students.nominateFailed}</p>}

      <section className="card space-y-3">
        <h2 className="font-bold text-gold-dark">{ar.students.invite.title}</h2>
        <p className="text-sm text-ink/70">{ar.students.invite.hint}</p>
        <form action={createInvite}>
          <button type="submit" className="btn-secondary">{ar.students.invite.create}</button>
        </form>
        {invite && invite !== 'failed' && (
          <p className="break-all rounded-xl bg-parchment p-3 text-xs" dir="ltr">
            {ar.students.invite.created} {origin}/invite/{invite}
          </p>
        )}
      </section>

      {byStudent.size === 0 ? (
        <p className="text-sm text-ink/60">{ar.students.empty}</p>
      ) : (
        <ul className="space-y-4">
          {[...byStudent.entries()].map(([studentId, list]) => {
            const s = studentById.get(studentId);
            return (
              <li key={studentId} className="card space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/students/${studentId}`} className="font-bold text-gold-dark hover:underline" dir="ltr">
                    {toArabicDigits(s?.user_code ?? '')}
                  </Link>
                  <div className="flex items-center gap-3">
                    <Link href={`/chat/${studentId}`} className="text-xs font-bold text-amber-brand hover:underline">
                      {ar.chat.openShort}
                    </Link>
                  </div>
                </div>
                <ul className="flex flex-wrap gap-2">
                  {list.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 rounded-xl border border-sand bg-white px-3 py-1.5 text-xs">
                      <span className="font-bold">{ar.students.juz} {toArabicDigits(r.juz_number)}</span>
                      <span className="text-ink/60">{STATE_LABEL[r.state]}</span>
                      {r.state === 'in_progress' && certified.has(r.juz_number) && (
                        <form action={nominateStudent}>
                          <input type="hidden" name="progressId" value={r.id} />
                          <button type="submit" className="font-bold text-amber-brand hover:underline">{ar.students.nominate}</button>
                        </form>
                      )}
                      {r.state === 'failed' && (
                        <form action={resumeJuz}>
                          <input type="hidden" name="progressId" value={r.id} />
                          <button type="submit" className="font-bold text-amber-brand hover:underline">{ar.students.resume}</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
