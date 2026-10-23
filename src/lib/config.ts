/** Single source of truth for the certificate label. Change it here only. */
export const CERTIFICATE_LABEL = 'شهادة غرس';
export const CERTIFICATE_LABEL_EN = 'Ghars Certificate';

export const APP_NAME = 'غَرْس';

export const CONTACT_METHODS = ['telegram', 'whatsapp', 'zoom', 'google_meet', 'other'] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

export const AGE_RANGES = [
  'under_12',
  '12_17',
  '18_24',
  '25_34',
  '35_44',
  '45_54',
  '55_plus',
] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

export const PASSWORD_MIN_LENGTH = 8;
