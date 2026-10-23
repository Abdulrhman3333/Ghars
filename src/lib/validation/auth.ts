import { z } from 'zod';
import ar from '@/messages/ar.json';
import { AGE_RANGES, CONTACT_METHODS, PASSWORD_MIN_LENGTH } from '@/lib/config';
import { toAsciiDigits } from '@/lib/utils';

const e = ar.auth.errors;

const name = z
  .string()
  .trim()
  .min(2, e.nameShort)
  .max(100, e.nameLong);

const email = z.string().trim().email(e.emailInvalid).max(254);

const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{6,20}$/, e.phoneInvalid)
  .or(z.literal(''))
  .optional();

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, e.passwordShort)
  .max(72, e.passwordLong);

const preferredContact = z.enum(CONTACT_METHODS, { errorMap: () => ({ message: e.contactInvalid }) });
const ageRange = z.enum(AGE_RANGES, { errorMap: () => ({ message: e.ageInvalid }) });

export const registerSchema = z
  .object({
    name,
    email,
    phone,
    preferred_contact: preferredContact,
    age_range: ageRange,
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: e.passwordMismatch,
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, ar.common.required),
});

export const forgotSchema = z.object({ email });

export const resetSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: e.passwordMismatch,
    path: ['confirmPassword'],
  });

export const profileSchema = z.object({
  name,
  phone,
  preferred_contact: preferredContact,
  age_range: ageRange,
});

export const userCodeSchema = z
  .string()
  .transform((v) => toAsciiDigits(v.trim()))
  .pipe(z.string().regex(/^\d{6}$/, ar.profile.autoAccept.invalidCode));
