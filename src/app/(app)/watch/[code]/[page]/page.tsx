import { notFound } from 'next/navigation';
import ar from '@/messages/ar.json';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { loadMushafPage } from '@/lib/mushaf/load';
import { loadMarks } from '@/lib/mushaf/marks';
import { isAcceptedViewer } from '@/lib/mushaf/viewer-access';
import { buildPageModel } from '@/lib/mushaf/model';
import { MushafView } from '@/components/mushaf/mushaf-view';
import { toArabicDigits } from '@/lib/utils';

export default async function WatchMushafPage({
  params,
}: {
  params: Promise<{ code: string; page: string }>;
}) {
  const { code, page: raw } = await params;
  if (!/^\d{6}$/.test(code)) notFound();
  const page = Number(raw);
  if (!Number.isInteger(page) || page < 1 || page > 604) notFound();

  const me = await getCurrentProfile();
  const supabase = await createClient();

  const { data: ownerData } = await supabase.rpc('lookup_user_by_code', { p_code: code });
  const owner = ownerData as unknown as string | null;
  if (!owner) notFound();
  if (!(await isAcceptedViewer(supabase, owner, me.id))) notFound();

  const loaded = await loadMushafPage(page);
  if (!loaded) notFound();

  const lines = buildPageModel(loaded.input);
  const initialMarks = await loadMarks({ kind: 'of', userId: owner }, loaded.locations);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gold-dark">
          {ar.watch.title} <span className="font-mono" dir="ltr">{toArabicDigits(code)}</span>
        </h1>
        <p className="text-xs font-bold text-amber-brand">{ar.watch.readonlyTag}</p>
      </header>
      <MushafView
        page={page}
        lines={lines}
        chapterNames={loaded.chapterNames}
        types={loaded.types}
        subtypes={loaded.subtypes}
        initialMarks={initialMarks}
        hrefBase={`/watch/${code}/`}
        sessionId={null}
        canEdit={false}
      />
    </div>
  );
}
