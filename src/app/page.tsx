import Link from 'next/link';
import ar from '@/messages/ar.json';
import { CERTIFICATE_LABEL } from '@/lib/config';

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="space-y-3">
        <h1 className="font-quran text-6xl font-bold text-gold-dark sm:text-7xl">{ar.brand.name}</h1>
        <p className="text-lg font-bold text-amber-brand">{ar.brand.tagline}</p>
      </div>

      <p className="leading-loose text-ink/80">{ar.brand.intro}</p>

      <div className="card w-full space-y-1 text-sm text-gold-dark">
        <p className="font-bold">{CERTIFICATE_LABEL}</p>
        <p>{ar.brand.disclaimer}</p>
      </div>

      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href="/register" className="btn-primary sm:px-8">
          {ar.brand.registerCta}
        </Link>
        <Link href="/login" className="btn-secondary sm:px-8">
          {ar.brand.loginCta}
        </Link>
      </div>
    </main>
  );
}
