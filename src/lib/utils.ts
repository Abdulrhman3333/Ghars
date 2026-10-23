const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Renders ASCII digits with Arabic-Indic digits, e.g. "482173" → "٤٨٢١٧٣". */
export function toArabicDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);
}

/** Converts Arabic-Indic digits back to ASCII, e.g. "٤٨٢١٧٣" → "482173". */
export function toAsciiDigits(value: string): string {
  return value.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

export function formatArabicDate(iso: string): string {
  return new Intl.DateTimeFormat('ar', { dateStyle: 'long' }).format(new Date(iso));
}

/** 12-hour clock only, e.g. "٣:٤٥ م" — shown beside the date in the sessions list. */
export function formatArabicTime12(iso: string): string {
  return new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
}

export function formatArabicTime(iso: string): string {
  return new Intl.DateTimeFormat('ar', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}
