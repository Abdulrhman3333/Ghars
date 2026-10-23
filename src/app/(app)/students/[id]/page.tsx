import { notFound } from 'next/navigation';
import ar from '@/messages/ar.json';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { toArabicDigits, formatArabicDate } from '@/lib/utils';

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const me = await getCurrentProfile();
  const supabase = await createClient();

  const { data: progress } = await supabase
    .from('progress')
    .select('id, juz_number, state, teacher_id')
    .eq('student_id', id)
    .eq('teacher_id', me.id)
    .order('juz_number');
  if (!progress || progress.length === 0) notFound();

  const { data: student } = await supabase
    .from('users')
    .select('name, user_code')
    .eq('id', id)
    .single();
  if (!student) notFound();

  const { data: exams } = await supabase
    .from('exams')
    .select('id, juz_number, state, result, completed_at, created_at')
    .eq('student_id', id)
    .eq('nominated_by', me.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark">{student.name}</h1>
        <p className="font-mono text-xs text-ink/60" dir="ltr">{toArabicDigits(student.user_code)}</p>
      </header>

      <section className="card space-y-3">
        <h2 className="font-bold text-gold-dark">{ar.students.detail.progress}</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {progress.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl border border-sand bg-white px-3 py-2 text-sm">
              <span className="font-bold">{ar.students.juz} {toArabicDigits(p.juz_number)}</span>
              <span className="text-ink/60">{ar.students.detail.states[p.state as keyof typeof ar.students.detail.states]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold text-gold-dark">{ar.students.detail.exams}</h2>
        {!exams || exams.length === 0 ? (
          <p className="text-sm text-ink/60">{ar.students.detail.none}</p>
        ) : (
          <ul className="divide-y divide-sand">
            {exams.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="font-bold">{ar.students.juz} {toArabicDigits(e.juz_number)}</span>
                <span className="text-ink/60">{ar.exams.states[e.state as keyof typeof ar.exams.states]}</span>
                {e.result && (
                  <span className={e.result === 'pass' ? 'font-bold text-success' : 'font-bold text-danger'}>
                    {ar.exams.results[e.result as keyof typeof ar.exams.results]}
                  </span>
                )}
                {e.completed_at && <span className="text-xs text-ink/50">{formatArabicDate(e.completed_at)}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
