import ar from '@/messages/ar.json';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { submitCommonError } from '@/lib/actions/common-errors';
import { FormMessage } from '@/components/form-feedback';

type Row = {
  id: string;
  category_id: number;
  correct_text: string;
  incorrect_text: string;
  notes: string | null;
  state: 'pending_review' | 'approved' | 'rejected';
  correct_audio_path: string | null;
  incorrect_audio_path: string | null;
  correct_image_path: string | null;
  incorrect_image_path: string | null;
  submitted_by: string;
};

const ERRORS: Record<string, string> = {
  invalid: ar.commonErrors.errors.invalid,
  audio: ar.commonErrors.errors.audio,
  image: ar.commonErrors.errors.image,
  upload: ar.commonErrors.errors.upload,
  save: ar.commonErrors.errors.save,
};

export default async function CommonErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; error?: string }>;
}) {
  const params = await searchParams;
  const me = await getCurrentProfile();
  const supabase = await createClient();

  const [{ data: categories }, { data: rows }] = await Promise.all([
    supabase.from('common_error_categories').select('id, name_ar').order('sort'),
    supabase
      .from('common_errors')
      .select('id, category_id, correct_text, incorrect_text, notes, state, correct_audio_path, incorrect_audio_path, correct_image_path, incorrect_image_path, submitted_by')
      .order('created_at', { ascending: false })
      .limit(100)
      .returns<Row[]>(),
  ]);

  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name_ar]));
  const approved = (rows ?? []).filter((r) => r.state === 'approved');
  // RLS returns non-approved rows only to their submitter (or an admin)
  const mine = (rows ?? []).filter((r) => r.state !== 'approved');

  // signed URLs: approved audio/images may be played/viewed by everyone; policy allows admins and submitters
  const audioPaths = approved.flatMap((r) => [r.correct_audio_path, r.incorrect_audio_path]).filter(Boolean) as string[];
  const imagePaths = approved.flatMap((r) => [r.correct_image_path, r.incorrect_image_path]).filter(Boolean) as string[];
  const signed = new Map<string, string>();
  if (audioPaths.length) {
    const { data } = await supabase.storage.from('audio').createSignedUrls(audioPaths, 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) signed.set(d.path, d.signedUrl);
  }
  if (imagePaths.length) {
    const { data } = await supabase.storage.from('error-images').createSignedUrls(imagePaths, 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) signed.set(d.path, d.signedUrl);
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark">{ar.commonErrors.title}</h1>
        <p className="text-sm text-ink/70">{ar.commonErrors.subtitle}</p>
      </header>

      {params.submitted === '1' && <FormMessage success={ar.commonErrors.submitted} />}
      {params.error && <FormMessage error={ERRORS[params.error] ?? ar.common.unexpected} />}

      <section className="card space-y-4">
        <h2 className="font-bold text-gold-dark">{ar.commonErrors.addTitle}</h2>
        <form action={submitCommonError} encType="multipart/form-data" className="space-y-4">
          <div>
            <label htmlFor="category_id" className="field-label">{ar.commonErrors.category}</label>
            <select id="category_id" name="category_id" required defaultValue="" className="field-input">
              <option value="" disabled>{ar.auth.selectPlaceholder}</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name_ar}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="correct_text" className="field-label">{ar.commonErrors.correctText}</label>
              <input id="correct_text" name="correct_text" type="text" required maxLength={300} className="field-input font-quran text-lg" />
            </div>
            <div>
              <label htmlFor="incorrect_text" className="field-label">{ar.commonErrors.incorrectText}</label>
              <input id="incorrect_text" name="incorrect_text" type="text" required maxLength={300} className="field-input font-quran text-lg" />
            </div>
            <div>
              <label htmlFor="correct_audio" className="field-label">{ar.commonErrors.correctAudio}</label>
              <input id="correct_audio" name="correct_audio" type="file" accept="audio/*" className="field-input" />
            </div>
            <div>
              <label htmlFor="incorrect_audio" className="field-label">{ar.commonErrors.incorrectAudio}</label>
              <input id="incorrect_audio" name="incorrect_audio" type="file" accept="audio/*" className="field-input" />
            </div>
            <div>
              <label htmlFor="correct_image" className="field-label">{ar.commonErrors.correctImage}</label>
              <input id="correct_image" name="correct_image" type="file" accept="image/png,image/jpeg,image/webp" className="field-input" />
            </div>
            <div>
              <label htmlFor="incorrect_image" className="field-label">{ar.commonErrors.incorrectImage}</label>
              <input id="incorrect_image" name="incorrect_image" type="file" accept="image/png,image/jpeg,image/webp" className="field-input" />
            </div>
          </div>
          <div>
            <label htmlFor="notes" className="field-label">{ar.commonErrors.notes}</label>
            <textarea id="notes" name="notes" rows={2} maxLength={1000} className="field-input" />
          </div>
          <button type="submit" className="btn-primary">{ar.commonErrors.submit}</button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink/80">{ar.commonErrors.library}</h2>
        {approved.length === 0 ? (
          <p className="text-sm text-ink/60">{ar.commonErrors.emptyLibrary}</p>
        ) : (
          <ul className="space-y-3">
            {approved.map((r) => (
              <li key={r.id} className="card space-y-3">
                <p className="text-xs font-bold text-amber-brand">{categoryName.get(r.category_id)}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Clip label={ar.commonErrors.correct} text={r.correct_text} src={r.correct_audio_path ? signed.get(r.correct_audio_path) : undefined} img={r.correct_image_path ? signed.get(r.correct_image_path) : undefined} tone="text-success" />
                  <Clip label={ar.commonErrors.incorrect} text={r.incorrect_text} src={r.incorrect_audio_path ? signed.get(r.incorrect_audio_path) : undefined} img={r.incorrect_image_path ? signed.get(r.incorrect_image_path) : undefined} tone="text-danger" />
                </div>
                {r.notes && <p className="text-sm text-ink/70">{r.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {mine.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-ink/80">{ar.commonErrors.mySubmissions}</h2>
          <ul className="divide-y divide-sand rounded-xl border border-sand bg-white">
            {mine.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="font-quran">{r.correct_text}</span>
                <span className="text-xs font-bold text-gold-dark">{ar.commonErrors.states[r.state]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Clip({ label, text, src, img, tone }: { label: string; text: string; src?: string; img?: string; tone: string }) {
  return (
    <div className="space-y-2 rounded-xl border border-sand bg-white p-3">
      <p className={`text-xs font-bold ${tone}`}>{label}</p>
      <p className="font-quran text-xl">{text}</p>
      {src && <audio controls preload="none" src={src} className="w-full" />}
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={label} className="max-h-48 w-auto rounded-xl border border-sand" />
      )}
    </div>
  );
}
