'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Messages appear automatically: the server list refreshes every few seconds. */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
