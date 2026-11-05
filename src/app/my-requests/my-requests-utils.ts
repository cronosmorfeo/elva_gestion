import { addDays, formatShortDate, formatTime } from '../admin-dashboard/admin-dates';
import type { OvertimeRequest, RequestStatus, VacationRequest } from '../admin-dashboard/admin-requests';
import { formatHours, overtimeMinutes, overtimePay, vacationDays } from '../admin-dashboard/admin-requests';

export type RequestKind = 'vacaciones' | 'horas';

export interface RequestRow {
  id: string;
  title: string;
  detail: string;
  note: string;
  sent: string;
  status: RequestStatus;
  statusText: string;
  sample: boolean;
}

const newestFirst = <T extends { start: string; sentAt?: string }>(a: T, b: T): number =>
  (b.sentAt ?? b.start).localeCompare(a.sentAt ?? a.start);

export function statusText(status: RequestStatus, rhReviewed: boolean): string {
  if (status === 'aprobada') return 'Aprobada';
  if (status === 'rechazada') return 'Rechazada';
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
        sample: r.sample === true,
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
      sample: r.sample === true,
    }));
}

// A few example requests for a worker who has not sent any yet, so the page is not empty.
export function exampleRequests(
  owner: { uid: string; name: string },
  today: string,
): { vacations: VacationRequest[]; overtime: OvertimeRequest[] } {
  const base = { ownerId: owner.uid, employee: owner.name, sample: true };
  return {
    vacations: [
      {
        ...base,
        id: `${owner.uid}-ev1`,
        balance: 12,
        start: addDays(today, 18),
        returnDate: addDays(today, 21),
        rhReviewed: false,
        status: 'pendiente',
        comment: 'Viaje familiar',
        sentAt: `${addDays(today, -1)}T10:20`,
      },
      {
        ...base,
        id: `${owner.uid}-ev2`,
        balance: 15,
        start: addDays(today, -30),
        returnDate: addDays(today, -27),
        rhReviewed: true,
        status: 'aprobada',
        sentAt: `${addDays(today, -45)}T08:05`,
      },
    ],
    overtime: [
      {
        ...base,
        id: `${owner.uid}-eo1`,
        start: `${addDays(today, -8)}T17:00`,
        end: `${addDays(today, -8)}T20:00`,
        task: 'Cierre del informe mensual',
        rhReviewed: true,
        status: 'aprobada',
        sentAt: `${addDays(today, -10)}T15:30`,
      },
      {
        ...base,
        id: `${owner.uid}-eo2`,
        start: `${addDays(today, -4)}T18:00`,
        end: `${addDays(today, -4)}T21:00`,
        task: 'Soporte a la actualización de equipos',
        rhReviewed: true,
        status: 'rechazada',
        sentAt: `${addDays(today, -6)}T09:45`,
      },
    ],
  };
}
