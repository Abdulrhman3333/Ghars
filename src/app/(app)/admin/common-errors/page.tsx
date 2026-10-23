import ar from '@/messages/ar.json';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { reviewCommonError } from '@/lib/actions/admin';

export default async function AdminCommonErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const params = await searchParams;
  await requireAdmin();
  const supabase = await createClient();

  const { data: pending } = await supabase
    .from('common_errors')
    .select('id, correct_text, incorrect_text, notes, correct_audio_path, incorrect_audio_path, category_id')
    .eq('state', 'pending_review')
    .order('created_at', { ascending: true });

  const { data: categories } = await supabase.from('common_error_categories').select('id, name_ar');
  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name_ar]));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark">{ar.admin.commonErrors.title}</h1>
        <p className="text-sm text-ink/70">{ar.admin.commonErrors.subtitle}</p>
      </header>
      {params.saved && <p className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-success">{ar.admin.saved}</p>}

      {(pending ?? []).length === 0 ? (
        <p className="text-sm text-ink/60">{ar.admin.commonErrors.empty}</p>
      ) : (
        <ul className="space-y-3">
          {(pending ?? []).map((r) => (
            <li key={r.id} className="card space-y-3">
              <p className="text-xs font-bold text-amber-brand">{categoryName.get(r.category_id)}</p>
              <p className="font-quran text-xl">
                <span className="text-success">{r.correct_text}</span> ← <span className="text-danger">{r.incorrect_text}</span>
              </p>
              {r.notes && <p className="text-sm text-ink/70">{r.notes}</p>}
              <div className="flex gap-2">
                <form action={reviewCommonError}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="approved" />
                  <button type="submit" className="btn-primary px-3 py-1.5 text-xs">{ar.admin.commonErrors.approve}</button>
                </form>
                <form action={reviewCommonError}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="rejected" />
                  <button type="submit" className="btn-secondary px-3 py-1.5 text-xs">{ar.admin.commonErrors.reject}</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
