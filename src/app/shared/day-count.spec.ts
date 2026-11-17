import { dayCount, parseDays } from './day-count';

describe('dayCount', () => {
  it('writes whole and half days with a comma', () => {
    expect(dayCount(1)).toBe('1 día');
    expect(dayCount(0)).toBe('0 días');
    expect(dayCount(0.5)).toBe('0,5 días');
    expect(dayCount(9.5)).toBe('9,5 días');
    expect(dayCount(12)).toBe('12 días');
  });
});

describe('parseDays', () => {
  it('reads whole and half days', () => {
    expect(parseDays('12')).toBe(12);
    expect(parseDays('9,5')).toBe(9.5);
    expect(parseDays('9.5')).toBe(9.5);
    expect(parseDays('0')).toBe(0);
  });

  it('rejects anything else', () => {
    expect(parseDays('9,3')).toBeNull();
    expect(parseDays('-1')).toBeNull();
    expect(parseDays('1000')).toBeNull();
    expect(parseDays('')).toBeNull();
    expect(parseDays('doce')).toBeNull();
  });
});
