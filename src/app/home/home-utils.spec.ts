import type { OvertimeRequest, VacationRequest } from '../admin-dashboard/admin-requests';
import type { WorkReport } from '../reports/report-utils';

import { chipDay, chipMonth, firstName, greeting, pendingCount, reportSentThisWeek, upcomingItems } from './home-utils';

const vacation = (
  id: string,
  status: VacationRequest['status'],
  start: string,
  returnDate: string,
): VacationRequest => ({
  id,
  ownerId: 'me',
  employee: 'Ana',
  balance: 10,
  start,
  returnDate,
  rhReviewed: true,
  status,
});

const overtime = (id: string, status: OvertimeRequest['status'], start: string, end: string): OvertimeRequest => ({
  id,
  ownerId: 'me',
  employee: 'Ana',
  start,
  end,
  task: 'Respaldo',
  rhReviewed: true,
  status,
});

describe('home', () => {
  it('greets by the time of day', () => {
    expect(greeting(8)).toBe('Buenos días');
    expect(greeting(14)).toBe('Buenas tardes');
    expect(greeting(20)).toBe('Buenas noches');
    expect(firstName(' Ana Solís ')).toBe('Ana');
  });

  it('writes the chip', () => {
    expect(chipDay('2026-11-09')).toBe('9');
    expect(chipMonth('2026-11-09')).toBe('nov');
  });

  it('counts my pending requests', () => {
    const vacs = [
      vacation('a', 'pendiente', '2026-12-01', '2026-12-03'),
      vacation('b', 'aprobada', '2026-12-01', '2026-12-03'),
    ];
    const ots = [overtime('c', 'pendiente', '2026-11-20T17:00', '2026-11-20T19:00')];
    expect(pendingCount(vacs, ots, 'me')).toBe(2);
    expect(pendingCount(vacs, ots, 'other')).toBe(0);
  });

  it('knows if this week report was sent', () => {
    const report = { employeeId: 'me', weekStart: '2026-11-09' } as WorkReport;
    expect(reportSentThisWeek([report], 'me', '2026-11-12')).toBe(true);
    expect(reportSentThisWeek([report], 'me', '2026-11-16')).toBe(false);
  });

  it('lists my approved dates and the holidays, soonest first', () => {
    const items = upcomingItems(
      [
        vacation('past', 'aprobada', '2026-10-05', '2026-10-10'),
        vacation('pending', 'pendiente', '2026-11-16', '2026-11-18'),
        vacation('dic', 'aprobada', '2026-11-23', '2026-11-30'),
        vacation('now', 'aprobada', '2026-11-09', '2026-11-12'),
      ],
      [overtime('ot', 'aprobada', '2026-11-20T17:00', '2026-11-20T19:00')],
      'me',
      '2026-11-10',
    );
    expect(items.map((i) => i.key)).toEqual(['v-now', 'o-ot', 'v-dic', 'f-2026-12-01', 'f-2026-12-25']);
    expect(items[0]).toEqual({
      key: 'v-now',
      date: '2026-11-10',
      kind: 'vacaciones',
      title: 'De vacaciones',
      detail: 'Vuelve el jue 12 nov',
    });
    expect(items[2].detail).toBe('Del lun 23 nov al dom 29 nov · 5 días');
  });
});
