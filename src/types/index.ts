import type { AgeRange, ContactMethod } from '@/lib/config';

/** Mirrors public.users (see supabase/migrations/…0001). */
export type Profile = {
  id: string;
  auth_user_id: string;
  user_code: string;
  name: string;
  email: string;
  phone: string | null;
  preferred_contact: ContactMethod;
  age_range: AgeRange;
  register_date: string;
};

export type ActionState = {
  error?: string;
  success?: string;
  /** set after a successful sign-up when the account still needs e-mail confirmation */
  needsConfirmation?: boolean;
};
