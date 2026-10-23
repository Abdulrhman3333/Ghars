'use client';

import Link from 'next/link';
import { useActionState, useTransition } from 'react';
import ar from '@/messages/ar.json';
import { addViewer, acceptViewerInvite, removeViewer } from '@/lib/actions/viewers';
import { FormMessage } from '@/components/form-feedback';
import { toArabicDigits } from '@/lib/utils';
import type { ActionState } from '@/types';

export type ViewerRow = {
  id: string;
  code: string;
  state: 'pending' | 'accepted';
};

const initial: ActionState = {};

function RowCode({ code }: { code: string }) {
  return (
    <p className="font-mono text-lg font-bold text-ink" dir="ltr">
      {toArabicDigits(code)}
    </p>
  );
}

/** My list: accounts I invited (pending/accepted) that may read my mistakes and sessions. */
function ManagedList({ items }: { items: ViewerRow[] }) {
  const [state, action, pending] = useActionState(addViewer, initial);
  const [isRemoving, startRemove] = useTransition();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-gold-dark">{ar.profile.viewers.title}</h2>
        <p className="text-sm text-ink/70">{ar.profile.viewers.hint}</p>
      </div>

      <form action={action} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="viewer-code" className="sr-only">{ar.profile.viewers.codeLabel}</label>
        <input
          id="viewer-code"
          name="code"
          type="text"
          inputMode="numeric"
          dir="ltr"
          autoComplete="off"
          maxLength={6}
          placeholder={ar.profile.viewers.codeLabel}
          required
          className="field-input sm:max-w-xs"
        />
        <button type="submit" disabled={pending} className="btn-secondary">
          {ar.profile.viewers.add}
        </button>
      </form>

      <FormMessage error={state.error} success={state.success} />

      {items.length === 0 ? (
        <p className="text-sm text-ink/60">{ar.profile.viewers.empty}</p>
      ) : (
        <ul className="divide-y divide-sand rounded-xl border border-sand bg-white">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <RowCode code={item.code} />
              <span className="flex items-center gap-3">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${item.state === 'accepted' ? 'bg-emerald-100 text-success' : 'bg-sand text-gold-dark'}`}>
                  {ar.profile.viewers[item.state]}
                </span>
                <button
                  type="button"
                  disabled={isRemoving}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set('id', item.id);
                    startRemove(() => removeViewer(fd));
                  }}
                  className="text-sm font-bold text-danger hover:underline disabled:opacity-60"
                >
                  {ar.profile.viewers.remove}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Inbound: invitations other users sent me (e.g. my child's account). */
function ReceivedList({ items }: { items: ViewerRow[] }) {
  const [isWorking, startWork] = useTransition();
  const run = (fn: () => void) => startWork(() => fn());

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-gold-dark">{ar.profile.viewers.receivedTitle}</h2>
        <p className="text-sm text-ink/70">{ar.profile.viewers.receivedHint}</p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-ink/60">{ar.profile.viewers.receivedEmpty}</p>
      ) : (
        <ul className="divide-y divide-sand rounded-xl border border-sand bg-white">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="flex items-center gap-2">
                <RowCode code={item.code} />
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${item.state === 'accepted' ? 'bg-emerald-100 text-success' : 'bg-sand text-gold-dark'}`}>
                  {ar.profile.viewers[item.state]}
                </span>
              </span>
              <span className="flex items-center gap-3">
                {item.state === 'accepted' && (
                  <Link href={`/watch/${item.code}`} className="text-sm font-bold text-amber-brand hover:underline">
                    {ar.profile.viewers.view}
                  </Link>
                )}
                {item.state === 'pending' && (
                  <form action={acceptViewerInvite}>
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" disabled={isWorking} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-60">
                      {ar.profile.viewers.accept}
                    </button>
                  </form>
                )}
                <button
                  type="button"
                  disabled={isWorking}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set('id', item.id);
                    run(() => removeViewer(fd));
                  }}
                  className="text-sm font-bold text-danger hover:underline disabled:opacity-60"
                >
                  {item.state === 'pending' ? ar.profile.viewers.decline : ar.profile.viewers.leave}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ViewersSection({ managed, received }: { managed: ViewerRow[]; received: ViewerRow[] }) {
  return (
    <div className="space-y-6">
      <section className="card">
        <ManagedList items={managed} />
      </section>
      <section className="card">
        <ReceivedList items={received} />
      </section>
    </div>
  );
}
