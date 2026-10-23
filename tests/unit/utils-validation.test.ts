import { describe, expect, it } from 'vitest';
import { toArabicDigits, toAsciiDigits } from '@/lib/utils';
import { registerSchema, userCodeSchema } from '@/lib/validation/auth';

describe('digit helpers', () => {
  it('converts ASCII digits to Arabic-Indic and back', () => {
    expect(toArabicDigits('482173')).toBe('٤٨٢١٧٣');
    expect(toAsciiDigits('٤٨٢١٧٣')).toBe('482173');
    expect(toAsciiDigits(toArabicDigits('000042'))).toBe('000042');
  });
});

describe('userCodeSchema', () => {
  it('accepts a 6-digit code typed with Arabic-Indic digits', () => {
    expect(userCodeSchema.parse(' ٤٨٢١٧٣ ')).toBe('482173');
  });

  it('rejects codes that are not exactly six digits', () => {
    expect(userCodeSchema.safeParse('12345').success).toBe(false);
    expect(userCodeSchema.safeParse('12a456').success).toBe(false);
  });
});

describe('registerSchema', () => {
  const valid = {
    name: 'عبدالرحمن',
    email: 'user@example.com',
    phone: '',
    preferred_contact: 'whatsapp',
    age_range: '25_34',
    password: 'secret123',
    confirmPassword: 'secret123',
  };

  it('accepts a complete registration', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects mismatched passwords', () => {
    const r = registerSchema.safeParse({ ...valid, confirmPassword: 'other123' });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown contact method and an unknown age range', () => {
    expect(registerSchema.safeParse({ ...valid, preferred_contact: 'fax' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, age_range: '99' }).success).toBe(false);
  });

  it('requires a password of at least 8 characters', () => {
    expect(registerSchema.safeParse({ ...valid, password: 'short', confirmPassword: 'short' }).success).toBe(false);
  });
});
