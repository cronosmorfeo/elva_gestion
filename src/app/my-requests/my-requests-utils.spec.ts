import type { OvertimeRequest, VacationRequest } from '../admin-dashboard/admin-requests';

import { exampleRequests, overtimeRows, statusText, vacationRows } from './my-requests-utils';

const vacation = (id: string, ownerId: string, sentAt: string): VacationRequest => ({
  id,
  ownerId,
  employee: 'x',
  balance: 10,
  start: '2026-11-16', // Monday
  returnDate: '2026-11-21', // Saturday: Monday to Friday off
  rhReviewed: true,
  status: 'pendiente',
  sentAt,
});

describe('my requests', () => {
  it('names the status', () => {
    expect(statusText('pendiente', false)).toBe('Pendiente · en revisión de RH');
    expect(statusText('pendiente', true)).toBe('Pendiente');
    expect(statusText('aprobada', true)).toBe('Aprobada');
    expect(statusText('rechazada', true)).toBe('Rechazada');
  });

  it('shows only my vacations, newest first', () => {
    const rows = vacationRows(
      [
        vacation('a', 'me', '2026-11-01T08:00'),
        vacation('b', 'other', '2026-11-03T08:00'),
        vacation('c', 'me', '2026-11-04T09:00'),
      ],
      'me',
    );
    expect(rows.map((r) => r.id)).toEqual(['c', 'a']);
    expect(rows[0].detail).toBe('5 días · vuelve el sáb 21 nov');
    expect(rows[0].title).toBe('Del lun 16 nov al vie 20 nov');
  });

  it('shows my overtime with hours and pay', () => {
    const r: OvertimeRequest = {
      id: 'o',
      ownerId: 'me',
      employee: 'x',
      start: '2026-11-18T17:00',
      end: '2026-11-18T20:00',
      task: 'Respaldo',
      rhReviewed: true,
      status: 'aprobada',
    };
    const [row] = overtimeRows([r], 'me');
    expect(row.title).toBe('mié 18 nov, 5:00 p. m. – 8:00 p. m.');
    expect(row.detail).toBe('3 h · 3 h 1.5x');
    expect(row.statusText).toBe('Aprobada');
    expect(overtimeRows([r], 'someone')).toHaveLength(0);
  });

  it('makes example requests for the worker', () => {
    const ex = exampleRequests({ uid: 'u1', name: 'Ana' }, '2026-11-05');
    expect(ex.vacations.every((v) => v.ownerId === 'u1' && v.sample === true)).toBe(true);
    expect(vacationRows(ex.vacations, 'u1')).toHaveLength(2);
    expect(overtimeRows(ex.overtime, 'u1').map((r) => r.status)).toEqual(['rechazada', 'aprobada']);
  });
});
