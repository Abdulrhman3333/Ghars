'use client';

import { useState } from 'react';
import ar from '@/messages/ar.json';

export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" onClick={copy} className="btn-secondary px-3 py-1.5 text-xs">
      {copied ? ar.profile.copied : ar.profile.copy}
    </button>
  );
}
