'use client';

import { useActionState } from 'react';
import ar from '@/messages/ar.json';
import { resetPassword } from '@/lib/actions/auth';
import { FormMessage } from '@/components/form-feedback';
import type { ActionState } from '@/types';

const initial: ActionState = {};

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState(resetPassword, initial);

  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-bold text-gold-dark">{ar.auth.resetTitle}</h1>

      <div>
        <label htmlFor="password" className="field-label">{ar.auth.passwordNew}</label>
        <input id="password" name="password" type="password" dir="ltr" autoComplete="new-password" required minLength={8} className="field-input" />
        <p className="mt-1 text-xs text-ink/60">{ar.auth.passwordHint}</p>
      </div>

      <div>
        <label htmlFor="confirmPassword" className="field-label">{ar.auth.passwordConfirm}</label>
        <input id="confirmPassword" name="confirmPassword" type="password" dir="ltr" autoComplete="new-password" required minLength={8} className="field-input" />
      </div>

      <FormMessage error={state.error} />

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {ar.auth.resetSubmit}
      </button>
    </form>
  );
}
