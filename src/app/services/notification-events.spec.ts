import type { OvertimeRequest, VacationRequest } from '../admin-dashboard/admin-requests';
import type { Notice } from '../notices/notice-utils';

import { lastSeen, noticeEvents, overtimeEvents, vacationEvents } from './notification-events';

const vac = (id: string, status: VacationRequest['status']): VacationRequest => ({
  id,
  employee: 'Ana Solís',
  balance: 12,
  start: '2026-11-23',
  returnDate: '2026-11-30',
  rhReviewed: true,
  status,
});

const ot = (id: string, status: OvertimeRequest['status']): OvertimeRequest => ({
  id,
  employee: 'Ana Solís',
  start: '2026-11-14T08:00',
  end: '2026-11-14T12:00',
  task: 'Migración',
  rhReviewed: true,
  status,
});

describe('vacationEvents', () => {
  it('says nothing on the first load', () => {
    expect(vacationEvents(null, [vac('a', 'pendiente')], true)).toEqual([]);
    expect(vacationEvents(null, [vac('a', 'aprobada')], false)).toEqual([]);
  });

  it('tells admins about new pending requests only', () => {
    const before = lastSeen([vac('a', 'pendiente')]);
    const events = vacationEvents(before, [vac('a', 'pendiente'), vac('b', 'pendiente'), vac('c', 'aprobada')], true);
    expect(events.map((e) => e.tag)).toEqual(['vacations_requests-b-pendiente']);
    expect(events[0].body).toBe('Ana Solís pide vacaciones del lun 23 nov al dom 29 nov.');
  });

  it('tells the worker when a pending request is decided', () => {
    const before = lastSeen([vac('a', 'pendiente'), vac('b', 'pendiente'), vac('c', 'aprobada')]);
    const events = vacationEvents(before, [vac('a', 'aprobada'), vac('b', 'pendiente'), vac('c', 'aprobada')], false);
    expect(events).toEqual([
      {
        tag: 'vacations_requests-a-aprobada',
        title: 'Sus vacaciones fueron aprobadas',
        body: 'Vacaciones del lun 23 nov al dom 29 nov.',
        url: '/tabs/solicitudes',
      },
    ]);
  });

  it('tells admins, not the worker, about cancellations', () => {
    expect(vacationEvents(lastSeen([vac('a', 'pendiente')]), [vac('a', 'cancelada')], false)).toEqual([]);
    const approved = { ...vac('a', 'cancelada'), deductedDays: 5 };
    expect(vacationEvents(lastSeen([vac('a', 'aprobada')]), [approved], true)).toEqual([
      {
        tag: 'vacations_requests-a-cancelada',
        title: 'Vacaciones canceladas',
        body: 'Ana Solís canceló sus vacaciones del lun 23 nov al dom 29 nov (estaban aprobadas; se le devolvieron 5 días).',
        url: '/tabs/dashboard',
      },
    ]);
    expect(vacationEvents(lastSeen([vac('a', 'pendiente')]), [vac('a', 'cancelada')], true)[0].body).toBe(
      'Ana Solís canceló sus vacaciones del lun 23 nov al dom 29 nov.',
    );
  });

  it('does not tell the worker about their own new request', () => {
    expect(vacationEvents(lastSeen([]), [vac('a', 'pendiente')], false)).toEqual([]);
  });
});

describe('overtimeEvents', () => {
  it('tells admins about new requests and workers about decisions', () => {
    expect(overtimeEvents(lastSeen([]), [ot('a', 'pendiente')], true)[0].title).toBe('Nueva solicitud de horas extra');
    const rejected = overtimeEvents(lastSeen([ot('a', 'pendiente')]), [ot('a', 'rechazada')], false);
    expect(rejected[0].title).toBe('Sus horas extra fueron rechazadas');
    expect(rejected[0].tag).toBe('overtime_requests-a-rechazada');
  });
});

describe('noticeEvents', () => {
  const notice = (id: string, important = false): Notice => ({
    id,
    title: 'Cierre de planilla',
    message: 'Hasta el viernes',
    important,
    author: 'RH',
    createdAt: '2026-11-09T09:00',
  });

  it('tells workers about new notices, not admins', () => {
    const before = lastSeen([notice('a')]);
    const list = [notice('a'), notice('b', true)];
    expect(noticeEvents(before, list, false)).toEqual([
      { tag: 'notices-b', title: 'Aviso importante', body: 'Cierre de planilla', url: '/tabs/avisos' },
    ]);
    expect(noticeEvents(before, list, true)).toEqual([]);
    expect(noticeEvents(null, list, false)).toEqual([]);
  });
});
