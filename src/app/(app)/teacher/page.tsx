import ar from '@/messages/ar.json';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { toArabicDigits } from '@/lib/utils';
import type { ContactMethod } from '@/lib/config';

export default async function TeacherPage({ searchParams }: { searchParams: Promise<{ joined?: string }> }) {
  const { joined } = await searchParams;
  const me = await getCurrentProfile();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from('progress')
    .select('juz_number, state, teacher_id')
    .eq('student_id', me.id)
    .order('juz_number');

  const active = (rows ?? []).find((r) => r.state !== 'passed');

  // auto-assign (Phase 0 A1) when the current juz' has no teacher yet
  if (active && !active.teacher_id) {
    await supabase.rpc('auto_assign_teacher');
  }

  const current = active
    ? (await supabase
        .from('progress')
        .select('juz_number, teacher_id')
        .eq('student_id', me.id)
        .eq('juz_number', active.juz_number)
        .single()).data
    : null;

  const { data: teacher } = current?.teacher_id
    ? await supabase
        .from('users')
        .select('id, name, email, phone, preferred_contact, user_code')
        .eq('id', current.teacher_id)
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

      {!teacher || !current ? (
        <p className="card text-sm text-ink/70">{ar.teacher.none}</p>
      ) : (
        <section className="card space-y-4">
          <div>
            <p className="text-xs font-bold text-amber-brand">
              {ar.teacher.juz} {toArabicDigits(current.juz_number)}
            </p>
            <h2 className="text-xl font-bold text-gold-dark">{teacher.name}</h2>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-bold text-gold-dark">{ar.teacher.contact}</dt>
              <dd>{ar.auth.contactMethods[teacher.preferred_contact as ContactMethod]}</dd>
            </div>
            <div>
              <dt className="font-bold text-gold-dark">{ar.teacher.code}</dt>
              <dd className="font-mono" dir="ltr">{toArabicDigits(teacher.user_code)}</dd>
            </div>
            {teacher.phone && (
              <div>
                <dt className="font-bold text-gold-dark">{ar.teacher.phone}</dt>
                <dd dir="ltr"><a href={`tel:${teacher.phone}`} className="text-amber-brand hover:underline">{teacher.phone}</a></dd>
              </div>
            )}
            <div>
              <dt className="font-bold text-gold-dark">{ar.teacher.email}</dt>
              <dd dir="ltr"><a href={`mailto:${teacher.email}`} className="text-amber-brand hover:underline">{teacher.email}</a></dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}
