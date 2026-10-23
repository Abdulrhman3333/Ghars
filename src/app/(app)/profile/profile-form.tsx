'use client';

import { useActionState } from 'react';
import ar from '@/messages/ar.json';
import { updateProfile } from '@/lib/actions/profile';
import { AGE_RANGES, CONTACT_METHODS } from '@/lib/config';
import { FormMessage } from '@/components/form-feedback';
import type { ActionState, Profile } from '@/types';

const initial: ActionState = {};

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(updateProfile, initial);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="name" className="field-label">{ar.auth.name}</label>
        <input id="name" name="name" type="text" defaultValue={profile.name} required minLength={2} maxLength={100} className="field-input" />
      </div>

      <div>
        <label htmlFor="email" className="field-label">{ar.auth.email}</label>
        <input id="email" type="email" dir="ltr" value={profile.email} disabled className="field-input opacity-70" />
        <p className="mt-1 text-xs text-ink/60">{ar.profile.emailReadonly}</p>
      </div>

      <div>
        <label htmlFor="phone" className="field-label">{ar.auth.phone}</label>
        <input id="phone" name="phone" type="tel" dir="ltr" defaultValue={profile.phone ?? ''} className="field-input" />
      </div>

      <div>
        <label htmlFor="preferred_contact" className="field-label">{ar.auth.preferredContact}</label>
        <select id="preferred_contact" name="preferred_contact" defaultValue={profile.preferred_contact} className="field-input">
          {CONTACT_METHODS.map((m) => (
            <option key={m} value={m}>{ar.auth.contactMethods[m]}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="age_range" className="field-label">{ar.auth.ageRange}</label>
        <select id="age_range" name="age_range" defaultValue={profile.age_range} className="field-input">
          {AGE_RANGES.map((a) => (
            <option key={a} value={a}>{ar.auth.ageRanges[a]}</option>
          ))}
        </select>
      </div>

      <FormMessage error={state.error} success={state.success} />

      <button type="submit" disabled={pending} className="btn-primary">
        {ar.profile.save}
      </button>
    </form>
  );
}
