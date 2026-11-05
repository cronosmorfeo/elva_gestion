// Formatting and checks for the create-employee form. Display only: nothing here talks to Firebase.

// "1.000.000" for 1000000; "" for 0 or an empty value.
export function formatThousands(value: number | null | undefined): string {
  if (!value) return '';
  return String(Math.trunc(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Keeps only the digits: "₡1.000.000" -> 1000000. Empty or 0 -> null (a salary must be more than 0).
export function parseAmount(text: string | null | undefined): number | null {
  const digits = String(text ?? '')
    .replace(/\D/g, '')
    .slice(0, 12);
  const amount = Number(digits);
  return digits && amount > 0 ? amount : null;
}

const pad = (n: number): string => String(n).padStart(2, '0');

// "07:30" -> "7:30 a. m."
export function formatHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

// Minutes worked between two times; a night shift can end the next day.
export function shiftMinutes(start: string, end: string): number {
  const toMin = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const diff = toMin(end) - toMin(start);
  return diff > 0 ? diff : diff + 24 * 60;
}

// The text saved in horarioLaborado: "7:00 a. m. - 4:00 p. m.". Empty until both times are set.
export function scheduleText(start: string, end: string): string {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start === end) return '';
  return `${formatHour(start)} - ${formatHour(end)}`;
}

export function hoursText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// Cédula física (9 digits) or DIMEX (11 or 12 digits).
export function isValidCedula(text: string): boolean {
  const digits = text.replace(/\D/g, '');
  return /^\d+$/.test(text.replace(/[\s-]/g, '')) && [9, 11, 12].includes(digits.length);
}

// "115230847" -> "1-1523-0847"; other lengths stay as digits.
export function formatCedula(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 12);
  return digits.length === 9 ? `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5)}` : digits;
}

export function normalizeIban(text: string): string {
  return text.replace(/\s+/g, '').toUpperCase();
}

// "CR05 0152 0200 1026 2840 66".
export function groupIban(text: string): string {
  return normalizeIban(text)
    .slice(0, 22)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

// Costa Rica IBAN: CR + 20 digits, with the ISO 13616 check (mod 97 = 1).
export function isValidCrIban(text: string): boolean {
  const iban = normalizeIban(text);
  if (!/^CR\d{20}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  const numeric = moved.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const digit of numeric) rest = (rest * 10 + Number(digit)) % 97;
  return rest === 1;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  CRC: '₡',
  USD: '$',
  EUR: '€',
  MXN: 'MX$',
  COP: 'COL$',
  PAB: 'B/.',
};

// Symbol shown before the salary; colones until a currency is chosen.
export function currencySymbol(code: string | null | undefined): string {
  return CURRENCY_SYMBOLS[String(code ?? '')] ?? '₡';
}

// Reads a saved schedule back into two HH:mm values, for the time pickers.
// Accepts "7:00 a. m. - 4:00 p. m." (what this form saves) and older text like "8:00 AM - 5:00 PM".
export function parseScheduleText(text: string | null | undefined): { start: string; end: string } | null {
  const times = [...String(text ?? '').matchAll(/(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?/gi)];
  if (times.length !== 2) return null;
  const [start, end] = times.map(([, h, m, ap]) => {
    let hour = Number(h) % 12;
    if (ap.toLowerCase() === 'p') hour += 12;
    return `${pad(hour)}:${m}`;
  });
  return { start, end };
}
