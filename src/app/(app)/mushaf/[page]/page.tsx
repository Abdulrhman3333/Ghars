import { notFound } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth';
import { loadMushafPage } from '@/lib/mushaf/load';
import { loadMarks } from '@/lib/mushaf/marks';
import { buildPageModel } from '@/lib/mushaf/model';
import { MushafView } from '@/components/mushaf/mushaf-view';

export default async function SelfMushafPage({ params }: { params: Promise<{ page: string }> }) {
  const { page: raw } = await params;
  const page = Number(raw);
  if (!Number.isInteger(page) || page < 1 || page > 604) notFound();

  const me = await getCurrentProfile();
  const loaded = await loadMushafPage(page);
  if (!loaded) notFound();

  const lines = buildPageModel(loaded.input);
  const initialMarks = await loadMarks({ kind: 'self', userId: me.id }, loaded.locations);

  return (
    <MushafView
      page={page}
      lines={lines}
      chapterNames={loaded.chapterNames}
      types={loaded.types}
      subtypes={loaded.subtypes}
      initialMarks={initialMarks}
      hrefBase="/mushaf/"
      sessionId={null}
      canEdit
    />
  );
}
