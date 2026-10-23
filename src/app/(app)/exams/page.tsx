import ar from '@/messages/ar.json';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatArabicDate, toArabicDigits } from '@/lib/utils';

type ExamRow = {
  id: string;
  juz_number: number;
  state: 'nominated' | 'scheduled' | 'completed' | 'cancelled';
  result: 'pass' | 'fail' | null;
  scheduled_at: string | null;
  meeting_url: string | null;
  completed_at: string | null;
  created_at: string;
};

export default async function ExamsPage() {
  const me = await getCurrentProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from('exams')
    .select('id, juz_number, state, result, scheduled_at, meeting_url, completed_at, created_at')
    .eq('student_id', me.id)
    .order('created_at', { ascending: false })
    .returns<ExamRow[]>();
  const exams = data ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark">{ar.exams.title}</h1>
        <p className="text-sm text-ink/70">{ar.exams.subtitle}</p>
      </header>

      {exams.length === 0 ? (
        <p className="text-sm text-ink/60">{ar.exams.empty}</p>
      ) : (
        <ul className="space-y-3">
          {exams.map((e) => (
            <li key={e.id} className="card space-y-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-gold-dark">{ar.students.juz} {toArabicDigits(e.juz_number)}</span>
                <span className="rounded-full bg-sand px-2.5 py-0.5 text-xs font-bold text-gold-dark">{ar.exams.states[e.state]}</span>
              </div>
              {e.result && (
                <p className={e.result === 'pass' ? 'font-bold text-success' : 'font-bold text-danger'}>
                  {ar.exams.results[e.result]}
                </p>
              )}
              {e.state === 'scheduled' && e.scheduled_at && (
                <p className="text-ink/70">{ar.exams.scheduledAt}: {formatArabicDate(e.scheduled_at)}</p>
              )}
              {e.state === 'scheduled' && e.meeting_url && (
                <a href={e.meeting_url} target="_blank" rel="noreferrer" className="font-bold text-amber-brand hover:underline">
                  {ar.exams.join}
                </a>
              )}
              <p className="text-xs text-ink/50">{formatArabicDate(e.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
