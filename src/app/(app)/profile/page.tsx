import { redirect } from 'next/navigation';
import ar from '@/messages/ar.json';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/types';
import { ProfileForm } from './profile-form';
import { CopyCode } from './copy-code';
import { AutoAcceptSection, type AutoAcceptItem } from './auto-accept';
import { formatArabicDate, toArabicDigits } from '@/lib/utils';

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', user.id)
    .single<Profile>();

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
    ? await supabase.from('users').select('id, name, user_code').in('id', listenerIds)
    : { data: [] as { id: string; name: string; user_code: string }[] };

  const items: AutoAcceptItem[] = (listeners ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    code: l.user_code,
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
    </div>
  );
}
