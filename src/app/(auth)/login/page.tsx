'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import ar from '@/messages/ar.json';
import { login } from '@/lib/actions/auth';
import { FormMessage } from '@/components/form-feedback';
import type { ActionState } from '@/types';

const initial: ActionState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, initial);

  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-bold text-gold-dark">{ar.auth.loginTitle}</h1>

      <div>
        <label htmlFor="email" className="field-label">{ar.auth.email}</label>
        <input id="email" name="email" type="email" dir="ltr" autoComplete="email" required className="field-input" />
      </div>

      <div>
        <label htmlFor="password" className="field-label">{ar.auth.password}</label>
        <input id="password" name="password" type="password" dir="ltr" autoComplete="current-password" required className="field-input" />
      </div>

      <FormMessage error={state.error} />

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {ar.auth.loginSubmit}
      </button>

      <div className="flex flex-col gap-2 text-center text-sm">
        <Link href="/forgot-password" className="font-bold text-amber-brand hover:underline">
          {ar.auth.forgotLink}
        </Link>
        <p className="text-ink/70">
          {ar.auth.noAccount}{' '}
          <Link href="/register" className="font-bold text-amber-brand hover:underline">
            {ar.brand.registerCta}
          </Link>
        </p>
      </div>
    </form>
  );
}
