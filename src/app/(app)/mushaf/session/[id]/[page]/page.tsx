import { notFound } from 'next/navigation';
import ar from '@/messages/ar.json';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { loadMushafPage } from '@/lib/mushaf/load';
import { loadMarks } from '@/lib/mushaf/marks';
import { buildPageModel } from '@/lib/mushaf/model';
import { MushafView } from '@/components/mushaf/mushaf-view';
import { SendSessionButton } from '../../../../sessions/send-session-button';
import { isAcceptedViewer } from '@/lib/mushaf/viewer-access';

export default async function SessionMushafPage({
  params,
}: {
  params: Promise<{ id: string; page: string }>;
}) {
  const { id, page: raw } = await params;
  const page = Number(raw);
  if (!Number.isInteger(page) || page < 1 || page > 604) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const me = await getCurrentProfile();
  const supabase = await createClient();
  const { data: session } = await supabase
    .from('mushaf_sessions')
    .select('id, state, listener_id, reciter_id')
    .eq('id', id)
    .single();
  if (!session) notFound();
  // participants open this view; an accepted viewer on the reciter's list may too (read-only)
  const viewer =
    session.listener_id !== me.id &&
    session.reciter_id !== me.id &&
    (await isAcceptedViewer(supabase, session.reciter_id, me.id));
  if (!viewer && session.listener_id !== me.id && session.reciter_id !== me.id) notFound();

  const loaded = await loadMushafPage(page);
  if (!loaded) notFound();

  // only the listener can mark, and only while the session is a draft;
  // the reciter/accepted viewer opens the same view read-only to study/practice the marks
  const editable = session.state === 'draft' && session.listener_id === me.id;
  const lines = buildPageModel(loaded.input);
  const initialMarks = await loadMarks(
    { kind: 'session', sessionId: id, editable },
    loaded.locations,
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gold-dark">{ar.mushaf.sessionTitle}</h1>
        {editable && <SendSessionButton sessionId={id} />}
      </header>
      <MushafView
        page={page}
        lines={lines}
        chapterNames={loaded.chapterNames}
        types={loaded.types}
        subtypes={loaded.subtypes}
        initialMarks={initialMarks}
        hrefBase={`/mushaf/session/${id}/`}
        sessionId={id}
        canEdit={editable}
      />
    </div>
  );
}
