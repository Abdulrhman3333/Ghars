import ar from '@/messages/ar.json';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { assignTeacher, setRole } from '@/lib/actions/admin';
import { FormMessage } from '@/components/form-feedback';
import { toArabicDigits } from '@/lib/utils';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: users }, { data: roles }] = await Promise.all([
    supabase.from('v_users_admin').select('id, name, email, user_code').order('register_date', { ascending: false }).limit(200),
    supabase.from('user_roles').select('user_id, role'),
  ]);

  const rolesOf = new Map<string, string[]>();
  for (const r of roles ?? []) rolesOf.set(r.user_id, [...(rolesOf.get(r.user_id) ?? []), r.role]);

  const error = params.error ? (ar.admin.errors[params.error as keyof typeof ar.admin.errors] ?? ar.common.unexpected) : null;
  const saved = params.saved ? ar.admin.saved : null;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark">{ar.admin.users.title}</h1>
        <p className="text-sm text-ink/70">{ar.admin.users.subtitle}</p>
      </header>

      <FormMessage error={error ?? undefined} success={saved ?? undefined} />

      <section className="card space-y-4">
        <h2 className="font-bold text-gold-dark">{ar.admin.users.assign}</h2>
        <form action={assignTeacher} className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <div>
            <label className="field-label" htmlFor="studentCode">{ar.admin.users.studentCode}</label>
            <input id="studentCode" name="studentCode" dir="ltr" inputMode="numeric" maxLength={6} required className="field-input" />
          </div>
          <div>
            <label className="field-label" htmlFor="teacherCode">{ar.admin.users.teacherCode}</label>
            <input id="teacherCode" name="teacherCode" dir="ltr" inputMode="numeric" maxLength={6} required className="field-input" />
          </div>
          <div>
            <label className="field-label" htmlFor="juz">{ar.admin.users.juz}</label>
            <input id="juz" name="juz" type="number" min={1} max={30} required className="field-input" />
          </div>
          <button type="submit" className="btn-primary">{ar.admin.users.assignSubmit}</button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-gold-dark">{ar.admin.users.list}</h2>
        <ul className="divide-y divide-sand rounded-xl border border-sand bg-white">
          {(users ?? []).map((u) => {
            const mine = rolesOf.get(u.id) ?? [];
            return (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-bold">{u.name}</p>
                  <p className="font-mono text-xs text-ink/60" dir="ltr">{toArabicDigits(u.user_code)} · {u.email}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['examiner', 'admin'] as const).map((role) => {
                    const has = mine.includes(role);
                    return (
                      <form key={role} action={setRole}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="role" value={role} />
                        <input type="hidden" name="grant" value={has ? 'false' : 'true'} />
                        <button type="submit" className={`rounded-full border px-3 py-1 text-xs font-bold ${has ? 'border-amber-brand bg-amber-brand text-white' : 'border-sand bg-white text-gold-dark'}`}>
                          {ar.admin.users.roles[role]} {has ? '✓' : '+'}
                        </button>
                      </form>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
