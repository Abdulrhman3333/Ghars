import Link from 'next/link';
import ar from '@/messages/ar.json';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { toArabicDigits } from '@/lib/utils';

export default async function TeacherPage({ searchParams }: { searchParams: Promise<{ joined?: string }> }) {
  const { joined } = await searchParams;
  const me = await getCurrentProfile();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from('progress')
    .select('id, juz_number, state, teacher_id')
    .eq('student_id', me.id)
    .order('juz_number');

  const active = (rows ?? []).find((r) => r.state !== 'passed');

  // auto-assign (Phase 0 A1) when the current juz' has no teacher yet
  if (active && !active.teacher_id) {
    await supabase.rpc('auto_assign_teacher');
    active.teacher_id =
      (
        await supabase
          .from('progress')
          .select('teacher_id')
          .eq('student_id', me.id)
          .eq('juz_number', active.juz_number)
          .single()
      ).data?.teacher_id ?? null;
  }

  // privacy: only the public code + preferred channel are shared (migration 0013); talk via chat
  const { data: teacher } = active?.teacher_id
    ? await supabase
        .from('users')
        .select('id, user_code, preferred_contact')
        .eq('id', active.teacher_id)
        .single()
    : { data: null };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark">{ar.teacher.title}</h1>
        <p className="text-sm text-ink/70">{ar.teacher.subtitle}</p>
      </header>

      {joined === '1' && (
        <p className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-success">{ar.invite.done}</p>
      )}

      {!teacher || !active ? (
        <p className="card text-sm text-ink/70">{ar.teacher.none}</p>
      ) : (
        <section className="card space-y-4">
          <div>
            <p className="text-xs font-bold text-amber-brand">
              {ar.teacher.juz} {toArabicDigits(active.juz_number)}
            </p>
            <h2 className="text-xl font-bold text-gold-dark">
              {toArabicDigits(teacher.user_code)}
            </h2>
            <p className="text-sm text-ink/60">{ar.teacher.codeLabel}</p>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-bold text-gold-dark">{ar.teacher.contact}</dt>
              <dd>{ar.auth.contactMethods[teacher.preferred_contact as keyof typeof ar.auth.contactMethods]}</dd>
            </div>
          </dl>
          <Link href={`/chat/${teacher.id}`} className="btn-primary inline-block w-fit">
            {ar.chat.openWithTeacher}
          </Link>
        </section>
      )}
    </div>
  );
}
