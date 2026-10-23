import { redirect } from 'next/navigation';
import ar from '@/messages/ar.json';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/types';
import { ProfileForm } from './profile-form';
import { CopyCode } from './copy-code';
import { AutoAcceptSection, type AutoAcceptItem } from './auto-accept';
import { ViewersSection, type ViewerRow } from './viewers';
import { formatArabicDate, toArabicDigits } from '@/lib/utils';

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // names/emails are private; my_profile() returns the OWN row (migration 0013)
  const { data: profile } = await supabase.rpc('my_profile').single<Profile>();

  if (!profile) {
    return <p className="text-danger">{ar.common.unexpected}</p>;
  }

  // two plain queries (no FK-name guessing); RLS limits listeners to what the reciter may see
  const { data: links } = await supabase
    .from('auto_accept_list')
    .select('listener_id')
    .eq('reciter_id', profile.id);

  const listenerIds = (links ?? []).map((l) => l.listener_id);
  const { data: listeners } = listenerIds.length
    ? await supabase.from('users').select('id, user_code').in('id', listenerIds)
    : { data: [] as { id: string; user_code: string }[] };

  const items: AutoAcceptItem[] = (listeners ?? []).map((l) => ({
    id: l.id,
    code: l.user_code,
  }));

  /* my viewer list: ones I invited (I am the owner) + invitations sent to me (I am the viewer) */
  const [ownedRes, receivedRes] = await Promise.all([
    supabase.from('viewer_list').select('id, viewer_id, state, created_at').eq('owner_id', profile.id).order('created_at'),
    supabase.from('viewer_list').select('id, owner_id, state, created_at').eq('viewer_id', profile.id).order('created_at'),
  ]);
  const counterpartIds = [
    ...new Set([
      ...(ownedRes.data ?? []).map((r: { viewer_id: string }) => r.viewer_id),
      ...(receivedRes.data ?? []).map((r: { owner_id: string }) => r.owner_id),
    ]),
  ];
  const { data: counterparts } = counterpartIds.length
    ? await supabase.from('users').select('id, user_code').in('id', counterpartIds)
    : { data: [] as { id: string; user_code: string }[] };
  const codeOfViewer = new Map((counterparts ?? []).map((u) => [u.id, u.user_code]));
  const stateOf = (state: unknown): 'pending' | 'accepted' => (state === 'accepted' ? 'accepted' : 'pending');

  const managed: ViewerRow[] = (ownedRes.data ?? []).map((r: { id: string; viewer_id: string; state: unknown }) => ({
    id: r.id,
    code: codeOfViewer.get(r.viewer_id) ?? '',
    state: stateOf(r.state),
  }));
  const received: ViewerRow[] = (receivedRes.data ?? []).map((r: { id: string; owner_id: string; state: unknown }) => ({
    id: r.id,
    code: codeOfViewer.get(r.owner_id) ?? '',
    state: stateOf(r.state),
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark">{ar.profile.title}</h1>
        <p className="text-sm text-ink/70">{ar.profile.subtitle}</p>
      </header>

      <section className="card space-y-3 text-center">
        <p className="text-sm font-bold text-gold-dark">{ar.profile.yourCode}</p>
        <p className="font-mono text-4xl font-bold tracking-[0.3em] text-ink" dir="ltr">
          {toArabicDigits(profile.user_code)}
        </p>
        <p className="text-xs text-ink/60">{ar.profile.codeHint}</p>
        <CopyCode code={profile.user_code} />
        <p className="text-xs text-ink/50">
          {ar.profile.registeredAt}: {formatArabicDate(profile.register_date)}
        </p>
      </section>

      <section className="card">
        <ProfileForm profile={profile} />
      </section>

      <section className="card">
        <AutoAcceptSection items={items} />
      </section>

      <ViewersSection managed={managed} received={received} />
    </div>
  );
}
