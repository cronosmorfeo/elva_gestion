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
 * Only working days are deducted: weekends and every holiday, mandatory or optional, are not (confirmed by HR).
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
      counts: kind === 'workday',
      holidayName: holiday?.name,
    });
  }
  return days;
}

export function countDeductedDays(days: VacationDay[]): number {
  return days.filter((d) => d.counts).length;
}

// One of the person's own vacation requests, as far as overlapping goes.
export interface OwnRequest {
  start: string; // first day off
  returnDate: string; // first day back (same day as start for a half day)
  status: string;
}

// The first pending or approved request of the person that shares a day off with start..lastDay
// (both YYYY-MM-DD, inclusive). Rejected and cancelled ones do not count: those days can be asked again.
export function overlappingRequest<T extends OwnRequest>(mine: T[], start: string, lastDay: string): T | undefined {
  if (!start || !lastDay) return undefined;
  return mine.find((r) => {
    if (r.status !== 'pendiente' && r.status !== 'aprobada') return false;
    const last = r.returnDate > r.start ? dayBefore(r.returnDate) : r.start;
    return r.start <= lastDay && last >= start;
  });
}

function dayBefore(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - 1));
  return date.toISOString().slice(0, 10);
}
