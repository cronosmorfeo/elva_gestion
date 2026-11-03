import { costaRicaHolidays, easterSunday, holidaysBetween } from './holidays';
import { MAX_REQUEST_DAYS, countDeductedDays, listVacationDays } from './vacation-days';

const days = (start: string, end: string) => listVacationDays(start, end, holidaysBetween(start, end));
const count = (start: string, end: string) => countDeductedDays(days(start, end));

describe('Costa Rica holidays', () => {
  it('calculates Easter Sunday', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(easterSunday(2028)).toBe('2028-04-16');
    expect(easterSunday(2030)).toBe('2030-04-21');
  });

  it('matches the official 2026 list', () => {
    const list = costaRicaHolidays(2026).map((h) => `${h.date} ${h.mandatory ? 'O' : 'N'}`);
    expect(list).toEqual([
      '2026-01-01 O',
      '2026-04-02 O',
      '2026-04-03 O',
      '2026-04-11 O',
      '2026-05-01 O',
      '2026-07-25 O',
      '2026-08-02 N',
      '2026-08-15 O',
      '2026-08-31 N',
      '2026-09-15 O',
      '2026-12-01 N',
      '2026-12-25 O',
    ]);
  });

  it('applies holidays moved by law', () => {
    const list = costaRicaHolidays(2026, [{ original: '2026-07-25', moved: '2026-07-27' }]);
    expect(list.some((h) => h.date === '2026-07-25')).toBe(false);
    expect(list.find((h) => h.date === '2026-07-27')?.name).toBe('Anexión de Guanacaste');
  });
});

describe('vacation days', () => {
  it('skips weekends and mandatory holidays (Christmas to New Year)', () => {
    expect(count('2026-12-21', '2027-01-01')).toBe(8);
  });

  it('skips Holy Thursday and Good Friday in any year', () => {
    expect(count('2026-03-30', '2026-04-03')).toBe(3);
    expect(count('2027-03-22', '2027-03-26')).toBe(3);
    // 2028: April 11 (Juan Santamaría) falls the same week, so only Monday and Wednesday count.
    expect(count('2028-04-10', '2028-04-14')).toBe(2);
  });

  it('deducts optional holidays like a normal day', () => {
    expect(count('2026-11-30', '2026-12-01')).toBe(2);
    const dec1 = days('2027-12-01', '2027-12-01')[0];
    expect(dec1.kind).toBe('optionalHoliday');
    expect(dec1.holidayName).toBe('Abolición del Ejército');
  });

  it('marks every holiday across a whole year', () => {
    const year = days('2027-01-01', '2027-12-31');
    expect(year).toHaveLength(365);
    const holidays = year.filter((d) => d.holidayName).map((d) => d.date);
    expect(holidays).toEqual(costaRicaHolidays(2027).map((h) => h.date));
  });

  it('counts a single working day and nothing for a weekend', () => {
    expect(count('2026-11-04', '2026-11-04')).toBe(1);
    expect(count('2026-11-07', '2026-11-08')).toBe(0);
  });

  it('returns no days for invalid ranges', () => {
    expect(days('2026-11-10', '2026-11-09')).toEqual([]);
    expect(days('', '2026-11-09')).toEqual([]);
    expect(days('2026-02-30', '2026-03-02')).toEqual([]);
    expect(MAX_REQUEST_DAYS).toBe(366);
    expect(days('2026-01-01', '2028-01-01')).toEqual([]);
  });

  it('does not shift days across the month change', () => {
    const list = days('2026-10-30', '2026-11-02');
    expect(list.map((d) => d.date)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(list.map((d) => d.weekday)).toEqual([5, 6, 0, 1]);
  });
});
