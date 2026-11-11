import type { OvertimeRequest, VacationRequest } from '../admin-dashboard/admin-requests';

import type { RequestRow } from './my-requests-utils';
import {
  ALL_MONTHS,
  defaultMonth,
  exampleRequests,
  inMonth,
  monthLabel,
  monthOptions,
  overtimeRows,
  statusText,
  vacationRows,
} from './my-requests-utils';

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
    expect(statusText('cancelada', true)).toBe('Cancelada');
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

const row = (id: string, month: string, status: RequestRow['status']): RequestRow => ({
  id,
  title: '',
  detail: '',
  note: '',
  sent: '',
  status,
  statusText: '',
  sample: false,
  month,
  start: `${month}-15`,
  returnDays: 0,
  reason: '',
});

describe('month filter', () => {
  const rows = [row('a', '2026-11', 'aprobada'), row('b', '2026-12', 'pendiente'), row('c', '2026-11', 'pendiente')];

  it('lists the months with requests, newest first, plus all months', () => {
    expect(monthOptions(rows)).toEqual([
      { value: '2026-12', label: 'Diciembre 2026 · 1 solicitud · 1 pendiente' },
      { value: '2026-11', label: 'Noviembre 2026 · 2 solicitudes · 1 pendiente' },
      { value: ALL_MONTHS, label: 'Todos los meses' },
    ]);
  });

  it('opens on the current month when it has requests, otherwise the newest', () => {
    const options = monthOptions(rows);
    expect(defaultMonth(options, '2026-11-10')).toBe('2026-11');
    expect(defaultMonth(options, '2027-02-01')).toBe('2026-12');
    expect(defaultMonth(monthOptions([]), '2026-11-10')).toBe(ALL_MONTHS);
  });

  it('filters by month', () => {
    expect(inMonth(rows, '2026-11').map((r) => r.id)).toEqual(['a', 'c']);
    expect(inMonth(rows, ALL_MONTHS)).toHaveLength(3);
  });

  it('uses the vacation date for the month', () => {
    expect(vacationRows([vacation('a', 'me', '2026-10-30T08:00')], 'me')[0].month).toBe('2026-11');
    expect(monthLabel('2026-01')).toBe('Enero 2026');
  });
});
