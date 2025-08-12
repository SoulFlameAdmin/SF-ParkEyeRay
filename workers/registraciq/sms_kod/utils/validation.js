// utils/validation.js
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export const now = () => Date.now();
export const genCode = () => Math.floor(100000 + Math.random()*900000).toString();

/**
 * Глобална валидация:
 * - ако номерът започва с +  → парсваме директно като E.164
 * - ако е локален (без +)    → използваме DEFAULT_COUNTRY_CODE (напр. "BG", "US", "DE")
 *   ВНИМАНИЕ: за libphonenumber-js тук е по-правилно да използваме
 *   ISO2 регион (BG, US, DE...), а не числов код 359/1/49.
 */
const DEFAULT_REGION = (process.env.DEFAULT_COUNTRY_CODE || 'BG').toUpperCase();

export const tryParse = (raw) => {
  if (typeof raw !== 'string') return null;
  const input = raw.trim();
  const phone = input.startsWith('+')
    ? parsePhoneNumberFromString(input)
    : parsePhoneNumberFromString(input, DEFAULT_REGION);

  if (!phone || !phone.isValid()) return null;
  return phone; // има .number (E.164), .country, .nationalNumber и т.н.
};

export const isValidPhone = (raw) => !!tryParse(raw);

// Връща нормализиран E.164 (+XXXXXXXXX) за Twilio
export const normalizeE164 = (raw) => {
  const phone = tryParse(raw);
  return phone ? phone.number : null;
};
