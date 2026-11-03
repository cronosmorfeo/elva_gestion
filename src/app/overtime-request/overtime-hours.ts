import type { Holiday } from '../vacation-request/holidays';

export type OvertimeDayKind = 'workday' | 'restDay' | 'mandatoryHoliday' | 'optionalHoliday';

export interface PayPart {
  rate: number; // multiplier of the ordinary hourly wage
  minutes: number;
}

export interface OvertimeDay {
  date: string; // YYYY-MM-DD
  weekday: number; // 0 = Sunday
  kind: OvertimeDayKind;
  minutes: number;
  pay: PayPart[];
  overLimit: boolean;
  holidayName?: string;
}

// Ordinary daily shift (40 hours a week).
export const SHIFT_HOURS = 8;
// Código de Trabajo, art. 140: shift plus overtime cannot exceed 12 hours a day.
export const MAX_DAILY_HOURS = 12;
// TODO: confirm with HR whether Saturday is also a rest day.
export const REST_WEEKDAYS = [0];

const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(:\d{2})?$/;
const DAY_MINUTES = 1440;

// Minutes since epoch, reading the value as wall-clock time so the time zone never shifts it.
function toMinutes(value: string): number | null {
  const match = DATE_TIME.exec(value);
  if (!match) return null;
  const [, date, hours, minutes] = match;
  const time = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== date) return null;
  if (Number(hours) > 23 || Number(minutes) > 59) return null;
  return time / 60_000 + Number(hours) * 60 + Number(minutes);
}

// Workdays pay 1.5x. Rest days and mandatory holidays pay double up to a shift, then triple.
function payFor(kind: OvertimeDayKind, minutes: number): PayPart[] {
  if (kind === 'workday' || kind === 'optionalHoliday') return [{ rate: 1.5, minutes }];
  const regular = Math.min(minutes, SHIFT_HOURS * 60);
  return [
    { rate: 2, minutes: regular },
    { rate: 3, minutes: minutes - regular },
  ].filter((part) => part.minutes > 0);
}

/**
 * Splits an overtime request into calendar days, with the pay rate and daily limit of each day.
 * Returns an empty list for invalid values or when end is not after start.
 */
export function overtimeDays(start: string, end: string, holidays: Holiday[]): OvertimeDay[] {
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (from === null || to === null || to <= from) return [];

  const byDate = new Map(holidays.map((h) => [h.date, h]));
  const days: OvertimeDay[] = [];

  for (let dayStart = from - (from % DAY_MINUTES); dayStart < to; dayStart += DAY_MINUTES) {
    const minutes = Math.min(to, dayStart + DAY_MINUTES) - Math.max(from, dayStart);
    const day = new Date(dayStart * 60_000);
    const date = day.toISOString().slice(0, 10);
    const weekday = day.getUTCDay();
    const holiday = byDate.get(date);

    let kind: OvertimeDayKind = 'workday';
    if (holiday?.mandatory) kind = 'mandatoryHoliday';
    else if (REST_WEEKDAYS.includes(weekday)) kind = 'restDay';
    else if (holiday) kind = 'optionalHoliday';

    const limit =
      (kind === 'restDay' || kind === 'mandatoryHoliday' ? MAX_DAILY_HOURS : MAX_DAILY_HOURS - SHIFT_HOURS) * 60;

    days.push({
      date,
      weekday,
      kind,
      minutes,
      pay: payFor(kind, minutes),
      overLimit: minutes > limit,
      holidayName: holiday?.name,
    });
  }
  return days;
}
