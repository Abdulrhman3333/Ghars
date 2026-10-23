import ar from '@/messages/ar.json';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createResourceLink, deleteResource, uploadResourcePdf } from '@/lib/actions/admin';
import { FormMessage } from '@/components/form-feedback';

export default async function AdminResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const { data: resources } = await supabase
    .from('resources')
    .select('id, title, type, category')
    .order('category')
    .order('title');

  const error = params.error ? (ar.admin.errors[params.error as keyof typeof ar.admin.errors] ?? ar.common.unexpected) : null;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark">{ar.admin.resources.title}</h1>
        <p className="text-sm text-ink/70">{ar.admin.resources.subtitle}</p>
      </header>

      <FormMessage error={error ?? undefined} success={params.saved ? ar.admin.saved : undefined} />

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="font-bold text-gold-dark">{ar.admin.resources.addLink}</h2>
          <form action={createResourceLink} className="space-y-3">
            <Field id="title" label={ar.admin.resources.titleLabel} />
            <Field id="category" label={ar.admin.resources.category} />
            <Field id="url" label={ar.admin.resources.url} dir="ltr" type="url" placeholder="https://www.youtube.com/…" />
            <button type="submit" className="btn-primary">{ar.admin.resources.save}</button>
          </form>
        </section>

        <section className="card space-y-3">
          <h2 className="font-bold text-gold-dark">{ar.admin.resources.addPdf}</h2>
          <form action={uploadResourcePdf} encType="multipart/form-data" className="space-y-3">
            <Field id="pdf-title" name="title" label={ar.admin.resources.titleLabel} />
            <Field id="pdf-category" name="category" label={ar.admin.resources.category} />
            <div>
              <label className="field-label" htmlFor="file">{ar.admin.resources.file}</label>
              <input id="file" name="file" type="file" accept="application/pdf" required className="field-input" />
            </div>
            <button type="submit" className="btn-primary">{ar.admin.resources.save}</button>
          </form>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="font-bold text-gold-dark">{ar.admin.resources.list}</h2>
        <ul className="divide-y divide-sand rounded-xl border border-sand bg-white">
          {(resources ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span>
                <span className="font-bold">{r.title}</span>
                <span className="ms-2 text-xs text-ink/60">{r.category} · {ar.resources.types[r.type as 'youtube' | 'pdf']}</span>
              </span>
              <form action={deleteResource}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" className="font-bold text-danger hover:underline">{ar.admin.resources.delete}</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Field({ id, label, name, dir, type = 'text', placeholder }: { id: string; label: string; name?: string; dir?: string; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} name={name ?? id} type={type} dir={dir} placeholder={placeholder} required maxLength={300} className="field-input" />
    </div>
  );
}
