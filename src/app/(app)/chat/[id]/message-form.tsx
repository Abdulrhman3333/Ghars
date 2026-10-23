'use client';

import { useFormStatus } from 'react-dom';
import ar from '@/messages/ar.json';
import { sendMessage } from '@/lib/actions/chat';
import { useRef } from 'react';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary px-4 py-2">
      {ar.chat.send}
    </button>
  );
}

export function MessageForm({ partnerId }: { partnerId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        await sendMessage(formData);
        formRef.current?.reset();
      }}
      className="flex flex-col gap-2 sm:flex-row"
    >
      <input type="hidden" name="recipientId" value={partnerId} />
      <label htmlFor="chat-body" className="sr-only">{ar.chat.placeholder}</label>
      <input
        id="chat-body"
        name="body"
        type="text"
        maxLength={2000}
        required
        autoComplete="off"
        placeholder={ar.chat.placeholder}
        className="field-input grow"
      />
      <SubmitButton />
    </form>
  );
}
