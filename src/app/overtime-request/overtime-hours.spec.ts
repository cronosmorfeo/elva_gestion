import { holidaysBetween } from '../vacation-request/holidays';

import { overtimeDays } from './overtime-hours';

const days = (start: string, end: string) => overtimeDays(start, end, holidaysBetween(start, end));

describe('overtime days', () => {
  it('pays 1.5x on a workday evening', () => {
    expect(days('2026-11-04T17:00', '2026-11-04T20:00')).toEqual([
      {
        date: '2026-11-04',
        weekday: 3,
        kind: 'workday',
        minutes: 180,
        pay: [{ rate: 1.5, minutes: 180 }],
        overLimit: false,
        holidayName: undefined,
      },
    ]);
  });

  it('splits a request that crosses midnight', () => {
    const result = days('2026-11-06T22:00', '2026-11-07T02:30');
    expect(result.map((d) => [d.date, d.kind, d.minutes])).toEqual([
      ['2026-11-06', 'workday', 120],
      ['2026-11-07', 'workday', 150],
    ]);
  });

  it('pays double on Sunday up to a shift, then triple', () => {
    const [sunday] = days('2026-11-08T08:00', '2026-11-08T18:00');
    expect(sunday.kind).toBe('restDay');
    expect(sunday.pay).toEqual([
      { rate: 2, minutes: 480 },
      { rate: 3, minutes: 120 },
    ]);
  });

  it('treats mandatory holidays like a rest day', () => {
    const [christmas] = days('2026-12-25T18:00', '2026-12-25T22:00');
    expect(christmas.kind).toBe('mandatoryHoliday');
    expect(christmas.holidayName).toBe('Navidad');
    expect(christmas.pay).toEqual([{ rate: 2, minutes: 240 }]);
  });

  it('pays optional holidays like a workday', () => {
    const [dec1] = days('2026-12-01T17:00', '2026-12-01T19:00');
    expect(dec1.kind).toBe('optionalHoliday');
    expect(dec1.pay).toEqual([{ rate: 1.5, minutes: 120 }]);
  });

  it('applies the 12-hour daily limit', () => {
    expect(days('2026-11-04T17:00', '2026-11-04T21:00')[0].overLimit).toBe(false);
    expect(days('2026-11-04T17:00', '2026-11-04T21:30')[0].overLimit).toBe(true);
    expect(days('2026-11-08T06:00', '2026-11-08T18:00')[0].overLimit).toBe(false);
    expect(days('2026-11-08T06:00', '2026-11-08T18:30')[0].overLimit).toBe(true);
  });

  it('rejects invalid ranges', () => {
    expect(days('2026-11-04T20:00', '2026-11-04T17:00')).toEqual([]);
    expect(days('2026-11-04T17:00', '2026-11-04T17:00')).toEqual([]);
    expect(days('2026-02-30T17:00', '2026-03-01T17:00')).toEqual([]);
    expect(days('', '')).toEqual([]);
  });
});
