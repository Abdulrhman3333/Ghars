import type { Metadata, Viewport } from 'next';
import { Amiri, IBM_Plex_Sans_Arabic } from 'next/font/google';
import ar from '@/messages/ar.json';
import './globals.css';

const uiFont = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700'],
  variable: '--font-ui',
  display: 'swap',
});

const quranFont = Amiri({
  subsets: ['arabic', 'latin'],
  weight: ['400', '700'],
  variable: '--font-quran',
  display: 'swap',
});

export const metadata: Metadata = {
  title: `${ar.brand.name} · ${ar.brand.tagline}`,
  description: ar.brand.intro,
};

export const viewport: Viewport = {
  themeColor: '#efe7d6',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${uiFont.variable} ${quranFont.variable}`}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
