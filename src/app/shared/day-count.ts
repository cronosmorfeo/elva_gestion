// "9,5": vacation days can be halves since half days are allowed.
export function dayNumber(n: number): string {
  return String(n).replace('.', ',');
}

// "1 día", "0,5 días", "9,5 días".
export function dayCount(n: number): string {
  return `${dayNumber(n)} ${n === 1 ? 'día' : 'días'}`;
}

// What an admin types as a balance: whole or half days, with a comma or a dot ("9,5"). '' when it is not valid.
export function parseDays(value: string): number | null {
  if (!/^\d{1,3}([.,][05])?$/.test(value.trim())) return null;
  return Number(value.trim().replace(',', '.'));
}
