export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  mandatory: boolean;
}

export interface MovedHoliday {
  original: string; // YYYY-MM-DD
  moved: string; // YYYY-MM-DD
}

// Código de Trabajo, art. 148. mandatory = feriado de pago obligatorio.
const FIXED_HOLIDAYS = [
  { month: 1, day: 1, name: 'Año Nuevo', mandatory: true },
  { month: 4, day: 11, name: 'Día de Juan Santamaría', mandatory: true },
  { month: 5, day: 1, name: 'Día del Trabajador', mandatory: true },
  { month: 7, day: 25, name: 'Anexión de Guanacaste', mandatory: true },
  { month: 8, day: 2, name: 'Virgen de los Ángeles', mandatory: false },
  { month: 8, day: 15, name: 'Día de la Madre', mandatory: true },
  { month: 8, day: 31, name: 'Día de la Persona Negra', mandatory: false },
  { month: 9, day: 15, name: 'Día de la Independencia', mandatory: true },
  { month: 12, day: 1, name: 'Abolición del Ejército', mandatory: false },
  { month: 12, day: 25, name: 'Navidad', mandatory: true },
];

// When a law moves a holiday to another day for a specific year, add it here.
export const MOVED_HOLIDAYS: MovedHoliday[] = [];

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

// Gregorian Easter Sunday (anonymous Gregorian algorithm).
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDate(year, month, day);
}

export function costaRicaHolidays(year: number, moved: MovedHoliday[] = MOVED_HOLIDAYS): Holiday[] {
  const easter = easterSunday(year);
  const holidays: Holiday[] = [
    ...FIXED_HOLIDAYS.map((h) => ({ date: isoDate(year, h.month, h.day), name: h.name, mandatory: h.mandatory })),
    { date: addDays(easter, -3), name: 'Jueves Santo', mandatory: true },
    { date: addDays(easter, -2), name: 'Viernes Santo', mandatory: true },
  ];

  const moves = new Map(moved.map((m) => [m.original, m.moved]));
  return holidays
    .map((h) => ({ ...h, date: moves.get(h.date) ?? h.date }))
    .sort((x, y) => x.date.localeCompare(y.date));
}

// Holidays for every year touched by the range (dates as YYYY-MM-DD).
export function holidaysBetween(start: string, end: string): Holiday[] {
  if (!/^\d{4}-/.test(start) || !/^\d{4}-/.test(end)) return [];
  const from = Number(start.slice(0, 4));
  const to = Number(end.slice(0, 4));
  if (from < 1900 || to < from) return [];
  const years = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return years.flatMap((year) => costaRicaHolidays(year));
}
