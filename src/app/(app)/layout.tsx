import Link from 'next/link';
import ar from '@/messages/ar.json';
import { logout } from '@/lib/actions/auth';
import { createClient } from '@/lib/supabase/server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: roles } = user
    ? await supabase.from('user_roles').select('role')
    : { data: [] as { role: string }[] };
  const isCommittee = (roles ?? []).some((r) => r.role === 'examiner' || r.role === 'admin');
  const isAdmin = (roles ?? []).some((r) => r.role === 'admin');

  return (
    <div className="min-h-dvh">
      <header className="border-b border-sand bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3">
          <Link href="/home" className="font-quran text-2xl font-bold text-gold-dark">
            {ar.brand.name}
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm font-bold">
            <Link href="/home" className="text-ink/80 hover:text-amber-brand">{ar.nav.home}</Link>
            <Link href="/mushaf/1" className="text-ink/80 hover:text-amber-brand">{ar.nav.mushaf}</Link>
            <Link href="/sessions" className="text-ink/80 hover:text-amber-brand">{ar.nav.sessions}</Link>
            <Link href="/chat" className="text-ink/80 hover:text-amber-brand">{ar.nav.chat}</Link>
            {isCommittee && (
              <Link href="/committee" className="text-ink/80 hover:text-amber-brand">{ar.nav.committee}</Link>
            )}
            {isAdmin && (
              <Link href="/admin" className="text-ink/80 hover:text-amber-brand">{ar.nav.admin}</Link>
            )}
            <Link href="/profile" className="text-ink/80 hover:text-amber-brand">{ar.nav.profile}</Link>
            <form action={logout}>
              <button type="submit" className="text-amber-brand hover:underline">{ar.nav.logout}</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-8">{children}</main>
    </div>
  );
}
