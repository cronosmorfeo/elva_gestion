import {
  addDays,
  formatClock,
  formatLongDate,
  formatShortDate,
  formatTime,
  localIsoDate,
  msUntilMidnight,
  quincenaLabel,
} from './admin-dates';

describe('admin dates', () => {
  it('writes the long date in Spanish', () => {
    expect(formatLongDate(new Date(2026, 10, 4))).toBe('Miércoles 4 de noviembre de 2026');
    expect(formatLongDate(new Date(2027, 0, 1))).toBe('Viernes 1 de enero de 2027');
  });

  it('writes short dates and times', () => {
    expect(formatShortDate('2026-12-14')).toBe('lun 14 dic');
    expect(formatShortDate('2027-01-04')).toBe('lun 4 ene');
    expect(formatTime('2026-11-15T08:00')).toBe('8:00 a. m.');
    expect(formatTime('2026-11-11T17:30')).toBe('5:30 p. m.');
    expect(formatTime('2026-11-14T00:15')).toBe('12:15 a. m.');
    expect(formatTime('2026-11-14T12:00')).toBe('12:00 p. m.');
    expect(formatClock(new Date(2026, 10, 4, 16, 5))).toBe('4:05 p. m.');
  });

  it('moves across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-11-09', -1)).toBe('2026-11-08');
    expect(localIsoDate(new Date(2026, 1, 5))).toBe('2026-02-05');
  });

  it('counts the time left until midnight', () => {
    expect(msUntilMidnight(new Date(2026, 10, 4, 23, 0, 0))).toBe(3_600_000);
    expect(msUntilMidnight(new Date(2026, 10, 4, 0, 0, 0))).toBe(86_400_000);
  });

  it('names the pay period', () => {
    expect(quincenaLabel(new Date(2026, 10, 4))).toBe('1.ª quincena de noviembre de 2026');
    expect(quincenaLabel(new Date(2026, 10, 15))).toBe('1.ª quincena de noviembre de 2026');
    expect(quincenaLabel(new Date(2026, 10, 16))).toBe('2.ª quincena de noviembre de 2026');
  });
});
