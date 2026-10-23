import ar from '@/messages/ar.json';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

type Resource = {
  id: string;
  title: string;
  type: 'youtube' | 'pdf';
  url: string | null;
  storage_path: string | null;
  category: string;
};

export default async function ResourcesPage() {
  await getCurrentProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from('resources')
    .select('id, title, type, url, storage_path, category')
    .order('category')
    .order('title')
    .returns<Resource[]>();
  const resources = data ?? [];

  const pdfPaths = resources.filter((r) => r.type === 'pdf' && r.storage_path).map((r) => r.storage_path!);
  const signed = new Map<string, string>();
  if (pdfPaths.length) {
    const { data: urls } = await supabase.storage.from('pdfs').createSignedUrls(pdfPaths, 3600);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }

  const byCategory = new Map<string, Resource[]>();
  for (const r of resources) {
    const list = byCategory.get(r.category) ?? [];
    list.push(r);
    byCategory.set(r.category, list);
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark">{ar.resources.title}</h1>
        <p className="text-sm text-ink/70">{ar.resources.subtitle}</p>
      </header>

      {resources.length === 0 && <p className="text-sm text-ink/60">{ar.resources.empty}</p>}

      {[...byCategory.entries()].map(([category, items]) => (
        <section key={category} className="space-y-3">
          <h2 className="text-lg font-bold text-gold-dark">{category}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {items.map((r) => {
              const href = r.type === 'youtube' ? r.url : r.storage_path ? signed.get(r.storage_path) : undefined;
              return (
                <li key={r.id} className="card flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">{r.title}</p>
                    <p className="text-xs text-ink/60">{ar.resources.types[r.type]}</p>
                  </div>
                  {href && (
                    <a href={href} target="_blank" rel="noreferrer" className="btn-secondary px-3 py-1.5 text-xs">
                      {r.type === 'youtube' ? ar.resources.open : ar.resources.download}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
