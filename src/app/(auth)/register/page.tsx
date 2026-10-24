'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import ar from '@/messages/ar.json';
import { register } from '@/lib/actions/auth';
import { AGE_RANGES } from '@/lib/config';
import { FormMessage } from '@/components/form-feedback';
import type { ActionState } from '@/types';

const initial: ActionState = {};

export default function RegisterPage() {
  const [state, action, pending] = useActionState(register, initial);

  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-bold text-gold-dark">{ar.auth.registerTitle}</h1>

      <div>
        <label htmlFor="email" className="field-label">{ar.auth.email}</label>
        <input id="email" name="email" type="email" dir="ltr" autoComplete="email" required className="field-input" />
        <p className="mt-1 text-xs text-ink/60">{ar.auth.emailHint}</p>
      </div>

      <div>
        <label htmlFor="age_range" className="field-label">{ar.auth.ageRange}</label>
        <select id="age_range" name="age_range" required defaultValue="" className="field-input">
          <option value="" disabled>{ar.auth.selectPlaceholder}</option>
          {AGE_RANGES.map((a) => (
            <option key={a} value={a}>{ar.auth.ageRanges[a]}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink/60">{ar.auth.ageRangeHint}</p>
      </div>

      <div>
        <label htmlFor="password" className="field-label">{ar.auth.password}</label>
        <input id="password" name="password" type="password" dir="ltr" autoComplete="new-password" required minLength={8} className="field-input" />
        <p className="mt-1 text-xs text-ink/60">{ar.auth.passwordHint}</p>
      </div>

      <div>
        <label htmlFor="confirmPassword" className="field-label">{ar.auth.passwordConfirm}</label>
        <input id="confirmPassword" name="confirmPassword" type="password" dir="ltr" autoComplete="new-password" required minLength={8} className="field-input" />
      </div>

      <FormMessage error={state.error} success={state.success} />

      {!state.needsConfirmation && (
        <button type="submit" disabled={pending} className="btn-primary w-full">
          {ar.auth.registerSubmit}
        </button>
      )}

      <p className="text-center text-sm text-ink/70">
        {ar.auth.haveAccount}{' '}
        <Link href="/login" className="font-bold text-amber-brand hover:underline">
          {ar.auth.loginSubmit}
        </Link>
      </p>
    </form>
  );
}
