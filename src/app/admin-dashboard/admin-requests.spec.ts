import type { OvertimeRequest, PendingPayment, VacationRequest } from './admin-requests';
import {
  formatColones,
  formatIban,
  maskIban,
  onVacationThisWeek,
  overtimeMinutes,
  overtimePay,
  paymentTotals,
  upcomingHolidays,
  vacationDays,
} from './admin-requests';

const vacation = (
  start: string,
  returnDate: string,
  status: VacationRequest['status'] = 'aprobada',
): VacationRequest => ({
  id: 'x',
  employee: 'Test',
  balance: 10,
  start,
  returnDate,
  rhReviewed: true,
  status,
});

const overtime = (start: string, end: string): OvertimeRequest => ({
  id: 'x',
  employee: 'Test',
  start,
  end,
  task: 'Test',
  rhReviewed: true,
  status: 'pendiente',
});

describe('admin requests', () => {
  it('counts vacation days up to the day before returning', () => {
    expect(vacationDays(vacation('2026-12-14', '2026-12-21'))).toBe(5);
    // Christmas and New Year are mandatory holidays and are not deducted.
    expect(vacationDays(vacation('2026-12-22', '2027-01-04'))).toBe(7);
    expect(vacationDays(vacation('2026-12-02', '2026-12-03'))).toBe(1);
  });

  it('sums overtime and groups the pay rate', () => {
    expect(overtimeMinutes(overtime('2026-11-15T08:00', '2026-11-15T18:00'))).toBe(600);
    expect(overtimePay(overtime('2026-11-15T08:00', '2026-11-15T18:00'))).toBe('8 h doble + 2 h triple');
    expect(overtimePay(overtime('2026-11-13T22:00', '2026-11-14T02:00'))).toBe('4 h 1.5x');
  });

  it('finds approved vacations in the next 7 days', () => {
    const list = [
      vacation('2026-11-02', '2026-11-09'),
      vacation('2026-11-20', '2026-11-23'),
      vacation('2026-11-05', '2026-11-06', 'pendiente'),
    ];
    expect(onVacationThisWeek(list, '2026-11-04').map((r) => r.start)).toEqual(['2026-11-02']);
    expect(onVacationThisWeek(list, '2026-11-17').map((r) => r.start)).toEqual(['2026-11-20']);
  });

  it('lists the next holidays, crossing into next year', () => {
    expect(upcomingHolidays('2026-11-04', 3).map((h) => h.date)).toEqual(['2026-12-01', '2026-12-25', '2027-01-01']);
    expect(upcomingHolidays('2026-12-26', 1)[0].name).toBe('Año Nuevo');
  });

  it('formats colones the Costa Rica way', () => {
    expect(formatColones(1250000)).toBe('₡1.250.000');
    expect(formatColones(35000)).toBe('₡35.000');
    expect(formatColones(999)).toBe('₡999');
    expect(formatColones(0)).toBe('₡0');
  });

  it('adds up only the payments still pending', () => {
    const pay = (id: string, kind: PendingPayment['kind'], amount: number, paid = false): PendingPayment => ({
      id,
      kind,
      concept: 'Test',
      employee: 'Test',
      amount,
      paid,
    });
    const totals = paymentTotals([
      pay('1', 'salario', 400000),
      pay('2', 'salario', 300000, true),
      pay('3', 'horas', 20000),
      pay('4', 'horas', 15000, true),
    ]);
    expect(totals.salaries).toBe(400000);
    expect(totals.salaryCount).toBe(1);
    expect(totals.overtime).toBe(20000);
    expect(totals.overtimeCount).toBe(1);
    expect(totals.pendingCount).toBe(2);
    expect(totals.paidCount).toBe(2);
  });

  it('formats and hides IBAN accounts', () => {
    expect(formatIban('CR05015202001026284066')).toBe('CR05 0152 0200 1026 2840 66');
    expect(formatIban('cr05 0152 0200 1026 2840 66')).toBe('CR05 0152 0200 1026 2840 66');
    expect(maskIban('CR05015202001026284066')).toBe('CR•• •••• •••• •••• ••40 66');
  });
});
