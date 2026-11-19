import { env } from '../config/env';

const ARABIC_INDIC = /[\u0660-\u0669]/g;
const EASTERN_ARABIC_INDIC = /[\u06F0-\u06F9]/g;

/**
 * Normalises user-typed phone numbers to E.164. Accepts +249912345678, 00249912345678,
 * 0912345678 and 912345678 (default country code applies), and Arabic-Indic digits.
 * Returns null when the number is not plausible.
 */
export function normalizePhone(raw: string, countryCode: string = env.DEFAULT_PHONE_COUNTRY_CODE): string | null {
  const ascii = raw
    .trim()
    .replace(/[\s\-().]/g, '')
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EASTERN_ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0));

  let e164: string;
  if (/^\+\d+$/.test(ascii)) e164 = ascii;
  else if (/^00\d+$/.test(ascii)) e164 = `+${ascii.slice(2)}`;
  else if (/^0\d+$/.test(ascii)) e164 = `+${countryCode}${ascii.slice(1)}`;
  else if (/^\d+$/.test(ascii)) {
    e164 =
      ascii.startsWith(countryCode) && ascii.length >= countryCode.length + 8 ? `+${ascii}` : `+${countryCode}${ascii}`;
  } else return null;

  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}
