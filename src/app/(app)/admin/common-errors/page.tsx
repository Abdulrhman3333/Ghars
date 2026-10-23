import ar from '@/messages/ar.json';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { editCommonError, reviewCommonError } from '@/lib/actions/admin';
import { FormMessage } from '@/components/form-feedback';

type Row = {
  id: string;
  correct_text: string;
  incorrect_text: string;
  notes: string | null;
  category_id: number;
  correct_audio_path: string | null;
  incorrect_audio_path: string | null;
  correct_image_path: string | null;
  incorrect_image_path: string | null;
};

export default async function AdminCommonErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const params = await searchParams;
  await requireAdmin();
  const supabase = await createClient();

  const [pendingRes, categoriesRes] = await Promise.all([
    supabase
      .from('common_errors')
      .select('id, correct_text, incorrect_text, notes, correct_audio_path, incorrect_audio_path, correct_image_path, incorrect_image_path, category_id')
      .eq('state', 'pending_review')
      .order('created_at', { ascending: true })
      .returns<Row[]>(),
    supabase.from('common_error_categories').select('id, name_ar'),
  ]);
  const pending = pendingRes.data ?? [];
  const categoryName = new Map((categoriesRes.data ?? []).map((c) => [c.id, c.name_ar]));

  // admins may play/listen to everything submitted (storage policy allows admins)
  const audioPaths = pending.flatMap((r) => [r.correct_audio_path, r.incorrect_audio_path]).filter(Boolean) as string[];
  const imagePaths = pending.flatMap((r) => [r.correct_image_path, r.incorrect_image_path]).filter(Boolean) as string[];
  const signed = new Map<string, string>();
  if (audioPaths.length) {
    const { data } = await supabase.storage.from('audio').createSignedUrls(audioPaths, 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) signed.set(d.path, d.signedUrl);
  }
  if (imagePaths.length) {
    const { data } = await supabase.storage.from('error-images').createSignedUrls(imagePaths, 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) signed.set(d.path, d.signedUrl);
  }

  const error = params.error ? (ar.admin.errors[params.error as keyof typeof ar.admin.errors] ?? ar.common.unexpected) : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark">{ar.admin.commonErrors.title}</h1>
        <p className="text-sm text-ink/70">{ar.admin.commonErrors.subtitle}</p>
      </header>
      {params.saved && <FormMessage success={ar.admin.saved} />}
      {error && <FormMessage error={error} />}

      {pending.length === 0 ? (
        <p className="text-sm text-ink/60">{ar.admin.commonErrors.empty}</p>
      ) : (
        <ul className="space-y-4">
          {pending.map((r) => (
            <li key={r.id} className="card space-y-4">
              <div className="flex flex-wrap gap-3">
                <Media
                  label={ar.commonErrors.correct}
                  text={r.correct_text}
                  src={r.correct_audio_path ? signed.get(r.correct_audio_path) : undefined}
                  img={r.correct_image_path ? signed.get(r.correct_image_path) : undefined}
                  tone="text-success"
                />
                <Media
                  label={ar.commonErrors.incorrect}
                  text={r.incorrect_text}
                  src={r.incorrect_audio_path ? signed.get(r.incorrect_audio_path) : undefined}
                  img={r.incorrect_image_path ? signed.get(r.incorrect_image_path) : undefined}
                  tone="text-danger"
                />
              </div>
              {r.notes && <p className="text-sm text-ink/70">{r.notes}</p>}

              <form action={editCommonError} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={r.id} />
                <div className="sm:col-span-2">
                  <label className="field-label" htmlFor={`cat-${r.id}`}>{ar.commonErrors.category}</label>
                  <select id={`cat-${r.id}`} name="category_id" defaultValue={r.category_id} className="field-input">
                    {(categoriesRes.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name_ar}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor={`correct-${r.id}`}>{ar.commonErrors.correctText}</label>
                  <input id={`correct-${r.id}`} name="correct_text" defaultValue={r.correct_text} required maxLength={300} dir="rtl" className="field-input font-quran text-lg" />
                </div>
                <div>
                  <label className="field-label" htmlFor={`incorrect-${r.id}`}>{ar.commonErrors.incorrectText}</label>
                  <input id={`incorrect-${r.id}`} name="incorrect_text" defaultValue={r.incorrect_text} required maxLength={300} dir="rtl" className="field-input font-quran text-lg" />
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label" htmlFor={`notes-${r.id}`}>{ar.commonErrors.notes}</label>
                  <textarea id={`notes-${r.id}`} name="notes" defaultValue={r.notes ?? ''} rows={2} maxLength={1000} className="field-input" />
                </div>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <button type="submit" className="btn-secondary px-3 py-1.5 text-xs">{ar.admin.commonErrors.edit}</button>
                </div>
              </form>

              <div className="flex flex-wrap gap-2">
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

function Media({ label, text, src, img, tone }: { label: string; text: string; src?: string; img?: string; tone: string }) {
  return (
    <div className="grow space-y-2 rounded-xl border border-sand bg-white p-3">
      <p className={`text-xs font-bold ${tone}`}>{label}</p>
      <p className="font-quran text-xl">{text}</p>
      {src && <audio controls preload="none" src={src} className="w-full" />}
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={label} className="max-h-40 w-auto rounded-xl border border-sand" />
      )}
    </div>
  );
}
