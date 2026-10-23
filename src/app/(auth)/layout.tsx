import Link from 'next/link';
import ar from '@/messages/ar.json';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <Link href="/" className="text-center font-quran text-4xl font-bold text-gold-dark">
        {ar.brand.name}
      </Link>
      <div className="card">{children}</div>
    </main>
  );
}
