'use client';

import { useActionState, useTransition } from 'react';
import ar from '@/messages/ar.json';
import { addAutoAccept, removeAutoAccept } from '@/lib/actions/profile';
import { FormMessage } from '@/components/form-feedback';
import { toArabicDigits } from '@/lib/utils';
import type { ActionState } from '@/types';

export type AutoAcceptItem = { id: string; code: string };

const initial: ActionState = {};

export function AutoAcceptSection({ items }: { items: AutoAcceptItem[] }) {
  const [state, action, pending] = useActionState(addAutoAccept, initial);
  const [isRemoving, startRemove] = useTransition();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-gold-dark">{ar.profile.autoAccept.title}</h2>
        <p className="text-sm text-ink/70">{ar.profile.autoAccept.hint}</p>
      </div>

      <form action={action} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="code" className="sr-only">{ar.profile.autoAccept.placeholder}</label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          dir="ltr"
          autoComplete="off"
          maxLength={6}
          placeholder={ar.profile.autoAccept.placeholder}
          required
          className="field-input sm:max-w-xs"
        />
        <button type="submit" disabled={pending} className="btn-secondary">
          {ar.profile.autoAccept.add}
        </button>
      </form>

      <FormMessage error={state.error} success={state.success} />

      {items.length === 0 ? (
        <p className="text-sm text-ink/60">{ar.profile.autoAccept.empty}</p>
      ) : (
        <ul className="divide-y divide-sand rounded-xl border border-sand bg-white">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="font-mono text-lg font-bold text-ink" dir="ltr">
                {toArabicDigits(item.code)}
              </p>
              <button
                type="button"
                disabled={isRemoving}
                onClick={() => startRemove(() => removeAutoAccept(item.id))}
                className="text-sm font-bold text-danger hover:underline disabled:opacity-60"
              >
                {ar.profile.autoAccept.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
