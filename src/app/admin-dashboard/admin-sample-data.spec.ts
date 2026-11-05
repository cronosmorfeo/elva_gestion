import { overtimeDays } from '../overtime-request/overtime-hours';
import { mondayOf } from '../reports/report-utils';
import { holidaysBetween } from '../vacation-request/holidays';

import { localIsoDate } from './admin-dates';
import { onVacationThisWeek, overtimeMinutes, vacationDays } from './admin-requests';
import {
  SAMPLE_EMPLOYEES,
  SAMPLE_OVERTIME,
  SAMPLE_PAYEES,
  SAMPLE_PAYMENTS,
  SAMPLE_REPORTS,
  SAMPLE_VACATIONS,
} from './admin-sample-data';

const today = localIsoDate(new Date());

describe('sample data', () => {
  it('has 10 vacation and 10 overtime requests with unique ids', () => {
    expect(SAMPLE_VACATIONS.length).toBe(10);
    expect(SAMPLE_OVERTIME.length).toBe(10);
    const ids = [...SAMPLE_VACATIONS, ...SAMPLE_OVERTIME, ...SAMPLE_PAYMENTS, ...SAMPLE_EMPLOYEES].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps pending vacations in the future and always deducts at least one day', () => {
    for (const r of SAMPLE_VACATIONS) {
      expect(r.returnDate > r.start).toBe(true);
      expect(vacationDays(r)).toBeGreaterThan(0);
      if (r.status === 'pendiente') expect(r.start > today).toBe(true);
    }
  });

  it('includes someone on vacation this week', () => {
    expect(onVacationThisWeek(SAMPLE_VACATIONS, today).length).toBeGreaterThan(0);
  });

  it('keeps every overtime request valid and within the daily limit', () => {
    for (const r of SAMPLE_OVERTIME) {
      const days = overtimeDays(r.start, r.end, holidaysBetween(r.start, r.end));
      expect(days.length).toBeGreaterThan(0);
      expect(days.some((d) => d.overLimit)).toBe(false);
      expect(overtimeMinutes(r)).toBeGreaterThan(0);
    }
  });

  it('has pending payments to pay', () => {
    expect(SAMPLE_PAYMENTS.filter((p) => !p.paid).length).toBe(10);
    expect(SAMPLE_PAYMENTS.every((p) => p.amount > 0)).toBe(true);
  });

  it('has bank details for everyone who gets paid', () => {
    for (const p of SAMPLE_PAYMENTS) {
      const payee = SAMPLE_PAYEES[p.employee];
      expect(Boolean(payee)).toBe(true);
      expect(/^CR\d{20}$/.test(payee.iban)).toBe(true);
    }
  });

  it('has reports only from sample employees, from past weeks, some unseen', () => {
    const ids = SAMPLE_EMPLOYEES.map((e) => e.id);
    for (const r of SAMPLE_REPORTS) {
      expect(ids).toContain(r.employeeId);
      expect(r.weekStart < mondayOf(today)).toBe(true);
      expect(r.text.trim().length + r.files.length).toBeGreaterThan(0);
    }
    expect(SAMPLE_REPORTS.filter((r) => !r.seen).length).toBeGreaterThan(0);
  });
});
