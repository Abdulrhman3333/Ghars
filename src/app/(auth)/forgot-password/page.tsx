'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import ar from '@/messages/ar.json';
import { requestPasswordReset } from '@/lib/actions/auth';
import { FormMessage } from '@/components/form-feedback';
import type { ActionState } from '@/types';

const initial: ActionState = {};

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-bold text-gold-dark">{ar.auth.forgotTitle}</h1>

      <div>
        <label htmlFor="email" className="field-label">{ar.auth.email}</label>
        <input id="email" name="email" type="email" dir="ltr" autoComplete="email" required className="field-input" />
      </div>

      <FormMessage error={state.error} success={state.success} />

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {ar.auth.forgotSubmit}
      </button>

      <p className="text-center text-sm">
        <Link href="/login" className="font-bold text-amber-brand hover:underline">
          {ar.auth.backToLogin}
        </Link>
      </p>
    </form>
  );
}
