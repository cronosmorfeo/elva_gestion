import { addDays, formatShortDate, formatTime } from '../admin-dashboard/admin-dates';
import type { OvertimeRequest, VacationRequest } from '../admin-dashboard/admin-requests';
import { upcomingHolidays, vacationDays } from '../admin-dashboard/admin-requests';
import type { WorkReport } from '../reports/report-utils';
import { mondayOf } from '../reports/report-utils';

export type UpcomingKind = 'vacaciones' | 'horas' | 'feriado';

export interface UpcomingItem {
  key: string;
  date: string; // YYYY-MM-DD, for the chip and the order
  kind: UpcomingKind;
  title: string;
  detail: string;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function greeting(hour: number): string {
  if (hour < 12) return 'Buenos días';
  return hour < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

// Chip text: "10" and "nov".
export function chipDay(date: string): string {
  return String(Number(date.slice(8, 10)));
}

export function chipMonth(date: string): string {
  return MONTHS[Number(date.slice(5, 7)) - 1] ?? '';
}

export function pendingCount(vacations: VacationRequest[], overtime: OvertimeRequest[], uid: string): number {
  const mine = (r: { ownerId?: string; status: string }): boolean => r.ownerId === uid && r.status === 'pendiente';
  return vacations.filter(mine).length + overtime.filter(mine).length;
}

export function reportSentThisWeek(reports: WorkReport[], uid: string, today: string): boolean {
  const monday = mondayOf(today);
  return reports.some((r) => r.employeeId === uid && r.weekStart === monday);
}

// The worker's approved vacations and overtime that have not ended, and the next holidays. Soonest first.
export function upcomingItems(
  vacations: VacationRequest[],
  overtime: OvertimeRequest[],
  uid: string,
  today: string,
  max = 5,
): UpcomingItem[] {
  const items: UpcomingItem[] = [];
  for (const r of vacations) {
    const lastDay = addDays(r.returnDate, -1);
    if (r.ownerId !== uid || r.status !== 'aprobada' || lastDay < today) continue;
    const days = vacationDays(r);
    const now = r.start <= today;
    items.push({
      key: `v-${r.id}`,
      date: now ? today : r.start,
      kind: 'vacaciones',
      title: now ? 'De vacaciones' : 'Vacaciones',
      detail: now
        ? `Vuelve el ${formatShortDate(r.returnDate)}`
        : `Del ${formatShortDate(r.start)} al ${formatShortDate(lastDay)} · ${days} ${days === 1 ? 'día' : 'días'}`,
    });
  }
  for (const r of overtime) {
    if (r.ownerId !== uid || r.status !== 'aprobada' || r.end.slice(0, 10) < today) continue;
    items.push({
      key: `o-${r.id}`,
      date: r.start.slice(0, 10),
      kind: 'horas',
      title: 'Horas extra',
      detail: `${formatTime(r.start)} – ${formatTime(r.end)} · ${r.task}`,
    });
  }
  for (const h of upcomingHolidays(today, max)) {
    items.push({
      key: `f-${h.date}`,
      date: h.date,
      kind: 'feriado',
      title: h.name,
      detail: h.mandatory ? 'Feriado' : 'Feriado no obligatorio',
    });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, max);
}
