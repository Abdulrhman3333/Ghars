import ar from '@/messages/ar.json';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { addCategory, addSubtype } from '@/lib/actions/admin';
import { FormMessage } from '@/components/form-feedback';

export default async function AdminTaxonomyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: types }, { data: subtypes }, { data: categories }] = await Promise.all([
    supabase.from('error_types').select('id, name_ar, color_hex').order('sort'),
    supabase.from('error_subtypes').select('id, error_type_id, code, name_ar').order('sort'),
    supabase.from('common_error_categories').select('id, name_ar').order('sort'),
  ]);

  const error = params.error ? (ar.admin.errors[params.error as keyof typeof ar.admin.errors] ?? ar.common.unexpected) : null;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark">{ar.admin.taxonomy.title}</h1>
        <p className="text-sm text-ink/70">{ar.admin.taxonomy.subtitle}</p>
      </header>

      <FormMessage error={error ?? undefined} success={params.saved ? ar.admin.saved : undefined} />

      <section className="card space-y-4">
        <h2 className="font-bold text-gold-dark">{ar.admin.taxonomy.errorTypes}</h2>
        {(types ?? []).map((t) => (
          <div key={t.id} className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-bold">
              <span className="block h-3 w-3 rounded-full" style={{ background: t.color_hex }} />
              {t.name_ar}
            </p>
            <ul className="ms-5 flex flex-wrap gap-2 text-xs">
              {(subtypes ?? []).filter((s) => s.error_type_id === t.id).map((s) => (
                <li key={s.id} className="rounded-full border border-sand bg-white px-2.5 py-1">{s.name_ar}</li>
              ))}
            </ul>
          </div>
        ))}
        <form action={addSubtype} className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <div>
            <label className="field-label" htmlFor="errorTypeId">{ar.admin.taxonomy.type}</label>
            <select id="errorTypeId" name="errorTypeId" required defaultValue="" className="field-input">
              <option value="" disabled>{ar.auth.selectPlaceholder}</option>
              {(types ?? []).map((t) => <option key={t.id} value={t.id}>{t.name_ar}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="code">{ar.admin.taxonomy.code}</label>
            <input id="code" name="code" dir="ltr" pattern="[a-z_]{2,40}" required className="field-input" />
          </div>
          <div>
            <label className="field-label" htmlFor="nameAr">{ar.admin.taxonomy.nameAr}</label>
            <input id="nameAr" name="nameAr" required maxLength={100} className="field-input" />
          </div>
          <button type="submit" className="btn-primary">{ar.admin.taxonomy.addSubtype}</button>
        </form>
      </section>

      <section className="card space-y-4">
        <h2 className="font-bold text-gold-dark">{ar.admin.taxonomy.categories}</h2>
        <ul className="flex flex-wrap gap-2 text-xs">
          {(categories ?? []).map((c) => (
            <li key={c.id} className="rounded-full border border-sand bg-white px-2.5 py-1">{c.name_ar}</li>
          ))}
        </ul>
        <form action={addCategory} className="flex flex-wrap items-end gap-3">
          <div className="grow">
            <label className="field-label" htmlFor="catName">{ar.admin.taxonomy.nameAr}</label>
            <input id="catName" name="nameAr" required maxLength={100} className="field-input" />
          </div>
          <button type="submit" className="btn-secondary">{ar.admin.taxonomy.addCategory}</button>
        </form>
      </section>
    </div>
  );
}
