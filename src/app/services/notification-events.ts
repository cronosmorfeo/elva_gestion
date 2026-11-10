import { addDays, formatShortDate, formatTime } from '../admin-dashboard/admin-dates';
import type { OvertimeRequest, RequestStatus, VacationRequest } from '../admin-dashboard/admin-requests';
import type { Notice } from '../notices/notice-utils';

import { COLLECTIONS } from './firestore-mappers';

// A notification to show in the browser. The tag is the same one the Cloud Function sends,
// so if both arrive the browser keeps only one.
export interface BrowserNotice {
  tag: string;
  title: string;
  body: string;
  url: string;
}

// What each list looked like in the previous update: id -> status (or just the ids for notices).
// null means "first load": nothing is announced then, so old items do not pop up on sign-in.
export type LastSeen = Map<string, string> | null;

export function lastSeen(list: { id: string; status?: RequestStatus }[]): Map<string, string> {
  return new Map(list.map((item) => [item.id, item.status ?? '']));
}

// Admins hear about new pending requests; a worker hears when one of theirs is decided.
export function vacationEvents(before: LastSeen, list: VacationRequest[], admin: boolean): BrowserNotice[] {
  const dates = (r: VacationRequest): string =>
    `del ${formatShortDate(r.start)} al ${formatShortDate(addDays(r.returnDate, -1))}`;
  if (admin) {
    const created = added(before, list).map((r) => ({
      tag: `${COLLECTIONS.vacations}-${r.id}-pendiente`,
      title: 'Nueva solicitud de vacaciones',
      body: `${r.employee} pide vacaciones ${dates(r)}.`,
      url: '/tabs/dashboard',
    }));
    const dropped = cancelled(before, list).map(({ request: r, wasApproved }) => ({
      tag: `${COLLECTIONS.vacations}-${r.id}-cancelada`,
      title: 'Vacaciones canceladas',
      body: `${r.employee} canceló sus vacaciones ${dates(r)}${wasApproved ? approvedNote(r.deductedDays) : '.'}`,
      url: '/tabs/dashboard',
    }));
    return [...created, ...dropped];
  }
  return decided(before, list).map((r) => ({
    tag: `${COLLECTIONS.vacations}-${r.id}-${r.status}`,
    title: `Sus vacaciones fueron ${r.status === 'aprobada' ? 'aprobadas' : 'rechazadas'}`,
    body: `Vacaciones ${dates(r)}.`,
    url: '/tabs/solicitudes',
  }));
}

export function overtimeEvents(before: LastSeen, list: OvertimeRequest[], admin: boolean): BrowserNotice[] {
  const when = (r: OvertimeRequest): string =>
    `el ${formatShortDate(r.start)}, ${formatTime(r.start)} – ${formatTime(r.end)}`;
  if (admin) {
    const created = added(before, list).map((r) => ({
      tag: `${COLLECTIONS.overtime}-${r.id}-pendiente`,
      title: 'Nueva solicitud de horas extra',
      body: `${r.employee} pide horas extra ${when(r)}.`,
      url: '/tabs/dashboard',
    }));
    const dropped = cancelled(before, list).map(({ request: r, wasApproved }) => ({
      tag: `${COLLECTIONS.overtime}-${r.id}-cancelada`,
      title: 'Horas extra canceladas',
      body: `${r.employee} canceló sus horas extra ${when(r)}${wasApproved ? ' (estaban aprobadas).' : '.'}`,
      url: '/tabs/dashboard',
    }));
    return [...created, ...dropped];
  }
  return decided(before, list).map((r) => ({
    tag: `${COLLECTIONS.overtime}-${r.id}-${r.status}`,
    title: `Sus horas extra fueron ${r.status === 'aprobada' ? 'aprobadas' : 'rechazadas'}`,
    body: `Horas extra ${when(r)}.`,
    url: '/tabs/solicitudes',
  }));
}

// Only workers: the admins are the ones who publish notices.
export function noticeEvents(before: LastSeen, list: Notice[], admin: boolean): BrowserNotice[] {
  if (admin || !before) return [];
  return list
    .filter((n) => !before.has(n.id))
    .map((n) => ({
      tag: `${COLLECTIONS.notices}-${n.id}`,
      title: n.important ? 'Aviso importante' : 'Nuevo aviso',
      body: n.title,
      url: '/tabs/avisos',
    }));
}

// Requests the worker cancelled since the last update, and whether they were already approved.
function cancelled<T extends { id: string; status: RequestStatus }>(
  before: LastSeen,
  list: T[],
): { request: T; wasApproved: boolean }[] {
  if (!before) return [];
  return list
    .filter((r) => r.status === 'cancelada' && ['pendiente', 'aprobada'].includes(before.get(r.id) ?? ''))
    .map((r) => ({ request: r, wasApproved: before.get(r.id) === 'aprobada' }));
}

function approvedNote(days: number | undefined): string {
  if (!days) return ' (estaban aprobadas).';
  return ` (estaban aprobadas; se le ${days === 1 ? 'devolvió 1 día' : `devolvieron ${days} días`}).`;
}

function added<T extends { id: string; status: RequestStatus }>(before: LastSeen, list: T[]): T[] {
  if (!before) return [];
  return list.filter((r) => !before.has(r.id) && r.status === 'pendiente');
}

function decided<T extends { id: string; status: RequestStatus }>(before: LastSeen, list: T[]): T[] {
  if (!before) return [];
  // A cancellation is the worker's own action, so it does not notify.
  return list.filter((r) => (r.status === 'aprobada' || r.status === 'rechazada') && before.get(r.id) === 'pendiente');
}
