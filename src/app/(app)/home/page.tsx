import Link from 'next/link';
import ar from '@/messages/ar.json';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

type Card = { title: string; desc: string; href?: string };

export default async function HomePage() {
  const me = await getCurrentProfile();
  const supabase = await createClient();

  // the user always sees their own name (privacy: names are private to everyone else)
  const [profileRes, passedRes] = await Promise.all([
    supabase.rpc('my_profile'),
    supabase
      .from('progress')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', me.id)
      .eq('state', 'passed'),
  ]);
  const profile = profileRes.data;
  const passedCount = passedRes.count;
  const isCertified = (passedCount ?? 0) > 0;

  const active: Card[] = [
    { ...ar.home.mushaf, href: '/mushaf/1' },
    { ...ar.home.sessions, href: '/sessions' },
    { ...ar.home.teacher, href: '/teacher' },
    { ...ar.home.stats, href: '/stats' },
    { ...ar.home.exams, href: '/exams' },
    { ...ar.home.commonErrors, href: '/common-errors' },
    { ...ar.home.resources, href: '/resources' },
    { ...ar.home.profileCard, href: '/profile' },
  ];
  if (isCertified) active.splice(2, 0, { ...ar.home.students, href: '/students' });

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold text-gold-dark">
          {ar.home.welcome}، {profile?.name ?? me.user_code}
        </h1>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-ink/80">{ar.home.sections}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {active.map((c) => (
            <Link key={c.title} href={c.href!} className="card transition hover:border-gold">
              <h3 className="font-bold text-gold-dark">{c.title}</h3>
              <p className="mt-1 text-sm text-ink/70">{c.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
