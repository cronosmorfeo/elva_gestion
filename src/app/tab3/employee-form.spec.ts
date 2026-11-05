import {
  currencySymbol,
  formatCedula,
  formatHour,
  formatThousands,
  groupIban,
  hoursText,
  isValidCedula,
  isValidCrIban,
  parseAmount,
  parseScheduleText,
  scheduleText,
  shiftMinutes,
} from './employee-form';

describe('employee form', () => {
  it('formats the salary with dots for thousands', () => {
    expect(formatThousands(1000000)).toBe('1.000.000');
    expect(formatThousands(450000)).toBe('450.000');
    expect(formatThousands(999)).toBe('999');
    expect(formatThousands(0)).toBe('');
    expect(formatThousands(null)).toBe('');
  });

  it('reads the salary back as a number', () => {
    expect(parseAmount('1.000.000')).toBe(1000000);
    expect(parseAmount('₡ 450.000')).toBe(450000);
    expect(parseAmount('abc')).toBe(null);
    expect(parseAmount('')).toBe(null);
    expect(parseAmount('0')).toBe(null);
    expect(parseAmount('000')).toBe(null);
  });

  it('builds the work schedule text', () => {
    expect(formatHour('07:00')).toBe('7:00 a. m.');
    expect(formatHour('16:30')).toBe('4:30 p. m.');
    expect(formatHour('00:00')).toBe('12:00 a. m.');
    expect(formatHour('12:00')).toBe('12:00 p. m.');
    expect(scheduleText('07:00', '16:00')).toBe('7:00 a. m. - 4:00 p. m.');
    expect(scheduleText('07:00', '')).toBe('');
    expect(scheduleText('08:00', '08:00')).toBe('');
  });

  it('counts the shift hours, including night shifts', () => {
    expect(hoursText(shiftMinutes('07:00', '16:00'))).toBe('9 h');
    expect(hoursText(shiftMinutes('22:00', '06:00'))).toBe('8 h');
    expect(hoursText(shiftMinutes('08:00', '12:30'))).toBe('4 h 30 min');
  });

  it('checks and formats the cédula', () => {
    expect(isValidCedula('1-1523-0847')).toBe(true);
    expect(isValidCedula('115230847')).toBe(true);
    expect(isValidCedula('155812345678')).toBe(true);
    expect(isValidCedula('1-1523')).toBe(false);
    expect(isValidCedula('1-1523-084a')).toBe(false);
    expect(formatCedula('115230847')).toBe('1-1523-0847');
  });

  it('checks Costa Rica IBAN accounts with the bank check digits', () => {
    expect(isValidCrIban('CR05015202001026284066')).toBe(true);
    expect(isValidCrIban('cr05 0152 0200 1026 2840 66')).toBe(true);
    expect(isValidCrIban('CR05015202001026284067')).toBe(false);
    expect(isValidCrIban('CR0501520200102628406')).toBe(false);
    expect(isValidCrIban('US05015202001026284066')).toBe(false);
    expect(groupIban('cr05015202001026284066')).toBe('CR05 0152 0200 1026 2840 66');
  });

  it('shows the symbol of the chosen currency', () => {
    expect(currencySymbol('CRC')).toBe('₡');
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('MXN')).toBe('MX$');
    expect(currencySymbol('COP')).toBe('COL$');
    expect(currencySymbol('PAB')).toBe('B/.');
    expect(currencySymbol('')).toBe('₡');
  });

  it('reads a saved schedule back for the time pickers', () => {
    expect(parseScheduleText('7:00 a. m. - 4:00 p. m.')).toEqual({ start: '07:00', end: '16:00' });
    expect(parseScheduleText('8:00 AM - 5:00 PM')).toEqual({ start: '08:00', end: '17:00' });
    expect(parseScheduleText('10:00 p. m. - 6:00 a. m.')).toEqual({ start: '22:00', end: '06:00' });
    expect(parseScheduleText('12:00 p. m. - 12:30 a. m.')).toEqual({ start: '12:00', end: '00:30' });
    expect(parseScheduleText('de lunes a viernes')).toBe(null);
    expect(parseScheduleText('')).toBe(null);
  });
});
