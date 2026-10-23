'use client';

import { useActionState } from 'react';
import ar from '@/messages/ar.json';
import { createSession } from '@/lib/actions/sessions';
import { FormMessage } from '@/components/form-feedback';
import type { ActionState } from '@/types';

const initial: ActionState = {};

export function NewSessionForm() {
  const [state, action, pending] = useActionState(createSession, initial);

  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="code" className="field-label">{ar.sessions.codeLabel}</label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          dir="ltr"
          autoComplete="off"
          maxLength={6}
          required
          placeholder="000000"
          className="field-input sm:max-w-xs"
        />
      </div>
      <FormMessage error={state.error} />
      <button type="submit" disabled={pending} className="btn-primary">
        {ar.sessions.start}
      </button>
    </form>
  );
}
