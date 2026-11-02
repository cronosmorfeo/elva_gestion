import type { Holiday } from './holidays';

export type DayKind = 'workday' | 'weekend' | 'mandatoryHoliday' | 'optionalHoliday';

export interface VacationDay {
  date: string; // YYYY-MM-DD
  weekday: number; // 0 = Sunday
  kind: DayKind;
  counts: boolean;
  holidayName?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

// Dates are handled in UTC so the local time zone never shifts a day.
function toUtc(date: string): number | null {
  if (!ISO_DATE.test(date)) return null;
  const time = Date.parse(`${date}T00:00:00Z`);
  // Rejects impossible dates such as Feb 30.
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== date) return null;
  return time;
}

// Longest range a single request can cover.
export const MAX_REQUEST_DAYS = 366;

// Calendar days from start to end (inclusive), or null for invalid dates or end before start.
export function rangeLength(start: string, end: string): number | null {
  const from = toUtc(start);
  const to = toUtc(end);
  if (from === null || to === null || to < from) return null;
  return (to - from) / DAY_MS + 1;
}

/**
 * Lists every day between start and end (inclusive) and whether it is deducted.
 * Weekends and mandatory holidays are not deducted; optional holidays are.
 * Returns an empty list for invalid dates, end before start, or ranges longer than MAX_REQUEST_DAYS.
 */
export function listVacationDays(start: string, end: string, holidays: Holiday[]): VacationDay[] {
  const from = toUtc(start);
  const to = toUtc(end);
  const length = rangeLength(start, end);
  if (from === null || to === null || length === null || length > MAX_REQUEST_DAYS) return [];

  const byDate = new Map(holidays.map((h) => [h.date, h]));
  const days: VacationDay[] = [];

  for (let time = from; time <= to; time += DAY_MS) {
    const date = new Date(time).toISOString().slice(0, 10);
    const weekday = new Date(time).getUTCDay();
    const holiday = byDate.get(date);

    let kind: DayKind = 'workday';
    if (weekday === 0 || weekday === 6) kind = 'weekend';
    else if (holiday?.mandatory) kind = 'mandatoryHoliday';
    else if (holiday) kind = 'optionalHoliday';

    days.push({
      date,
      weekday,
      kind,
      counts: kind === 'workday' || kind === 'optionalHoliday',
      holidayName: holiday?.name,
    });
  }
  return days;
}

export function countDeductedDays(days: VacationDay[]): number {
  return days.filter((d) => d.counts).length;
}
