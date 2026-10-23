'use client';

import { useActionState } from 'react';
import ar from '@/messages/ar.json';
import { sendSession } from '@/lib/actions/sessions';
import type { ActionState } from '@/types';

const initial: ActionState = {};

export function SendSessionButton({ sessionId }: { sessionId: string }) {
  const [state, action, pending] = useActionState(sendSession, initial);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-xs">
        {ar.sessions.send}
      </button>
      {state.error && <span role="alert" className="text-xs font-bold text-danger">{state.error}</span>}
    </form>
  );
}
