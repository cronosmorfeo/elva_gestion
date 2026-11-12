import { addDays, formatShortDate, formatTime } from '../admin-dashboard/admin-dates';
import type { OvertimeRequest, RequestStatus, VacationRequest } from '../admin-dashboard/admin-requests';
import { formatHours, overtimeMinutes, overtimePay, vacationDays } from '../admin-dashboard/admin-requests';

export type RequestKind = 'vacaciones' | 'horas';

export const ALL_MONTHS = 'todos';

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export interface RequestRow {
  id: string;
  title: string;
  detail: string;
  note: string;
  sent: string;
  status: RequestStatus;
  statusText: string;
  month: string; // YYYY-MM of the vacation or overtime date (not of when it was sent)
  start: string; // YYYY-MM-DD (vacations) or YYYY-MM-DDTHH:mm (overtime), to know if it can still be cancelled
  returnDays: number; // days that go back to the balance if an approved vacation is cancelled
  reason: string; // why it was rejected, written by the admin
}

export interface MonthOption {
  value: string;
  label: string;
}

// Months that have requests, newest first, with how many there are and how many are pending.
export function monthOptions(rows: RequestRow[]): MonthOption[] {
  const byMonth = new Map<string, { total: number; pending: number }>();
  for (const r of rows) {
    const m = byMonth.get(r.month) ?? { total: 0, pending: 0 };
    m.total++;
    if (r.status === 'pendiente') m.pending++;
    byMonth.set(r.month, m);
  }
  const months = [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([value, { total, pending }]) => ({
      value,
      label:
        `${monthLabel(value)} · ${total} ${total === 1 ? 'solicitud' : 'solicitudes'}` +
        (pending ? ` · ${pending} ${pending === 1 ? 'pendiente' : 'pendientes'}` : ''),
    }));
  return [...months, { value: ALL_MONTHS, label: 'Todos los meses' }];
}

// The current month if it has requests; otherwise the newest month that has any.
export function defaultMonth(options: MonthOption[], today: string): string {
  const current = today.slice(0, 7);
  return options.find((o) => o.value === current)?.value ?? options[0]?.value ?? ALL_MONTHS;
}

export function inMonth(rows: RequestRow[], month: string): RequestRow[] {
  return month === ALL_MONTHS ? rows : rows.filter((r) => r.month === month);
}

// "2026-11" -> "Noviembre 2026"
export function monthLabel(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? ''} ${month.slice(0, 4)}`;
}

const newestFirst = <T extends { start: string; sentAt?: string }>(a: T, b: T): number =>
  (b.sentAt ?? b.start).localeCompare(a.sentAt ?? a.start);

export function statusText(status: RequestStatus, rhReviewed: boolean): string {
  if (status === 'aprobada') return 'Aprobada';
  if (status === 'rechazada') return 'Rechazada';
  if (status === 'cancelada') return 'Cancelada';
  return rhReviewed ? 'Pendiente' : 'Pendiente · en revisión de RH';
}

function sentText(sentAt?: string): string {
  return sentAt ? `Enviada el ${formatShortDate(sentAt)}, ${formatTime(sentAt)}` : '';
}

export function vacationRows(list: VacationRequest[], ownerId: string): RequestRow[] {
  return list
    .filter((r) => r.ownerId === ownerId)
    .sort(newestFirst)
    .map((r) => {
      const days = vacationDays(r);
      return {
        id: r.id,
        title: `Del ${formatShortDate(r.start)} al ${formatShortDate(addDays(r.returnDate, -1))}`,
        detail: `${days} ${days === 1 ? 'día' : 'días'} · vuelve el ${formatShortDate(r.returnDate)}`,
        note: r.comment ?? '',
        sent: sentText(r.sentAt),
        status: r.status,
        statusText: statusText(r.status, r.rhReviewed),
        month: r.start.slice(0, 7),
        start: r.start,
        returnDays: r.status === 'aprobada' ? (r.deductedDays ?? 0) : 0,
        reason: r.status === 'rechazada' ? (r.reason ?? '') : '',
      };
    });
}

export function overtimeRows(list: OvertimeRequest[], ownerId: string): RequestRow[] {
  return list
    .filter((r) => r.ownerId === ownerId)
    .sort(newestFirst)
    .map((r) => ({
      id: r.id,
      title:
        r.start.slice(0, 10) === r.end.slice(0, 10)
          ? `${formatShortDate(r.start)}, ${formatTime(r.start)} – ${formatTime(r.end)}`
          : `${formatShortDate(r.start)} ${formatTime(r.start)} → ${formatShortDate(r.end)} ${formatTime(r.end)}`,
      detail: `${formatHours(overtimeMinutes(r))} · ${overtimePay(r)}`,
      note: r.task,
      sent: sentText(r.sentAt),
      status: r.status,
      statusText: statusText(r.status, r.rhReviewed),
      month: r.start.slice(0, 7),
      start: r.start,
      returnDays: 0,
      reason: r.status === 'rechazada' ? (r.reason ?? '') : '',
    }));
}
