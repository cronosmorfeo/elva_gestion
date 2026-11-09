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
    return added(before, list).map((r) => ({
      tag: `${COLLECTIONS.vacations}-${r.id}-pendiente`,
      title: 'Nueva solicitud de vacaciones',
      body: `${r.employee} pide vacaciones ${dates(r)}.`,
      url: '/tabs/dashboard',
    }));
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
    return added(before, list).map((r) => ({
      tag: `${COLLECTIONS.overtime}-${r.id}-pendiente`,
      title: 'Nueva solicitud de horas extra',
      body: `${r.employee} pide horas extra ${when(r)}.`,
      url: '/tabs/dashboard',
    }));
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

function added<T extends { id: string; status: RequestStatus }>(before: LastSeen, list: T[]): T[] {
  if (!before) return [];
  return list.filter((r) => !before.has(r.id) && r.status === 'pendiente');
}

function decided<T extends { id: string; status: RequestStatus }>(before: LastSeen, list: T[]): T[] {
  if (!before) return [];
  return list.filter((r) => r.status !== 'pendiente' && before.get(r.id) === 'pendiente');
}
