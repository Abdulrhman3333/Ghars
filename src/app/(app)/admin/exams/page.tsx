import ar from '@/messages/ar.json';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatArabicDate, toArabicDigits } from '@/lib/utils';

export default async function AdminExamsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: exams } = await supabase
    .from('exams')
    .select('id, student_id, nominated_by, examiner_id, juz_number, state, result, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  const ids = [...new Set((exams ?? []).flatMap((e) => [e.student_id, e.nominated_by, e.examiner_id]).filter(Boolean))] as string[];
  const { data: people } = ids.length
    ? await supabase.from('users').select('id, name').in('id', ids)
    : { data: [] as { id: string; name: string }[] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.name]));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark">{ar.admin.exams.title}</h1>
        <p className="text-sm text-ink/70">{ar.admin.exams.subtitle}</p>
      </header>
      <ul className="divide-y divide-sand rounded-xl border border-sand bg-white">
        {(exams ?? []).map((e) => (
          <li key={e.id} className="space-y-1 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold">
                {nameOf.get(e.student_id)} · {ar.students.juz} {toArabicDigits(e.juz_number)}
              </span>
              <span className="text-xs font-bold text-gold-dark">
                {ar.exams.states[e.state as keyof typeof ar.exams.states]}
                {e.result ? ` · ${ar.exams.results[e.result as keyof typeof ar.exams.results]}` : ''}
              </span>
            </div>
            <p className="text-xs text-ink/60">
              {ar.admin.exams.nominatedBy}: {nameOf.get(e.nominated_by)}
              {e.examiner_id && ` · ${ar.admin.exams.examiner}: ${nameOf.get(e.examiner_id) ?? ''}`}
              {` · ${formatArabicDate(e.created_at)}`}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
