import Link from 'next/link';
import ar from '@/messages/ar.json';
import { requireAdmin } from '@/lib/auth';

const SECTIONS = [
  { href: '/admin/users', key: 'users' },
  { href: '/admin/common-errors', key: 'commonErrors' },
  { href: '/admin/resources', key: 'resources' },
  { href: '/admin/taxonomy', key: 'taxonomy' },
  { href: '/admin/exams', key: 'exams' },
] as const;

export default async function AdminHome() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark">{ar.admin.title}</h1>
        <p className="text-sm text-ink/70">{ar.admin.subtitle}</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="card transition hover:border-gold">
            <h2 className="font-bold text-gold-dark">{ar.admin.sections[s.key].title}</h2>
            <p className="mt-1 text-sm text-ink/70">{ar.admin.sections[s.key].desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
