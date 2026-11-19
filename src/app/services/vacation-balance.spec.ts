import {
  ApproveError,
  approveProblemText,
  availableDays,
  balanceAfterCancel,
  canCancel,
  checkBalance,
  currentBalance,
  deductedDays,
  earnedDays,
  fullMonths,
  storedBalance,
} from './vacation-balance';

describe('checkBalance', () => {
  it('deducts the days when the balance is enough', () => {
    expect(checkBalance(12, 5)).toEqual({ kind: 'descontar', next: 7 });
    expect(checkBalance(5, 5)).toEqual({ kind: 'descontar', next: 0 });
  });

  it('stops when the balance is not enough', () => {
    expect(checkBalance(3, 5)).toEqual({ kind: 'insuficiente', balance: 3 });
  });

  it('approves without deducting when there is no balance on record', () => {
    expect(checkBalance(undefined, 5)).toEqual({ kind: 'sin-saldo' });
    expect(checkBalance('12', 5)).toEqual({ kind: 'sin-saldo' });
    expect(checkBalance(Number.NaN, 5)).toEqual({ kind: 'sin-saldo' });
  });
});

describe('availableDays', () => {
  it('subtracts the pending days and never goes below 0', () => {
    expect(availableDays(7, 0)).toBe(7);
    expect(availableDays(7, 5)).toBe(2);
    expect(availableDays(7, 12)).toBe(0);
    expect(availableDays(null, 3)).toBeNull();
  });
});

describe('canCancel', () => {
  const now = '2026-11-10T14:00';

  it('lets the worker cancel pending or approved requests that have not started', () => {
    expect(canCancel('pendiente', '2026-11-23', now)).toBe('si');
    expect(canCancel('aprobada', '2026-11-11', now)).toBe('si');
    expect(canCancel('aprobada', '2026-11-10T17:00', now)).toBe('si');
  });

  it('stops once it started or was already rejected or cancelled', () => {
    expect(canCancel('aprobada', '2026-11-10', now)).toBe('ya-empezo');
    expect(canCancel('aprobada', '2026-11-10T13:00', now)).toBe('ya-empezo');
    expect(canCancel('rechazada', '2026-11-23', now)).toBe('ya-decidida');
    expect(canCancel('cancelada', '2026-11-23', now)).toBe('ya-decidida');
  });
});

describe('approveProblemText', () => {
  it('explains each problem', () => {
    expect(approveProblemText('insuficiente', 'Ana Solís', 3)).toBe(
      'Ana Solís tiene solo 3 días de vacaciones. No se aprobó.',
    );
    expect(approveProblemText('insuficiente', 'Ana Solís', 1)).toBe(
      'Ana Solís tiene solo 1 día de vacaciones. No se aprobó.',
    );
    expect(approveProblemText('ya-decidida', 'Ana Solís', 0)).toBe('Esa solicitud ya fue decidida por otra persona.');
    expect(approveProblemText('ya-aprobo', 'Ana Solís', 0)).toBe('Esa aprobación ya la había dado otra persona.');
  });

  it('keeps the problem in the error', () => {
    const err = new ApproveError('insuficiente', 3);
    expect(err.problem).toBe('insuficiente');
    expect(err.balance).toBe(3);
  });
});

describe('deductedDays', () => {
  it('gives back what an approved vacation deducted', () => {
    expect(deductedDays('vacaciones', 'aprobada', { por: 'admin', diasDescontados: 5 })).toBe(5);
  });

  it('gives back nothing for pending requests or overtime', () => {
    expect(deductedDays('vacaciones', 'pendiente', { diasDescontados: 5 })).toBe(0);
    expect(deductedDays('horas', 'aprobada', { diasDescontados: 5 })).toBe(0);
  });

  it('gives back nothing when the approval did not deduct or the data is broken', () => {
    expect(deductedDays('vacaciones', 'aprobada', { diasDescontados: 0 })).toBe(0);
    expect(deductedDays('vacaciones', 'aprobada', { por: 'admin' })).toBe(0);
    expect(deductedDays('vacaciones', 'aprobada', undefined)).toBe(0);
    expect(deductedDays('vacaciones', 'aprobada', { diasDescontados: '5' })).toBe(0);
    expect(deductedDays('vacaciones', 'aprobada', { diasDescontados: -3 })).toBe(0);
    expect(deductedDays('vacaciones', 'aprobada', { diasDescontados: Number.NaN })).toBe(0);
  });
});

describe('balanceAfterCancel', () => {
  it('adds the days back to the balance', () => {
    expect(balanceAfterCancel(7, 5)).toBe(12);
    expect(balanceAfterCancel(0, 3)).toBe(3);
  });

  it('changes nothing when there are no days or no balance on record', () => {
    expect(balanceAfterCancel(7, 0)).toBeNull();
    expect(balanceAfterCancel(undefined, 5)).toBeNull();
    expect(balanceAfterCancel('7', 5)).toBeNull();
  });
});

describe('fullMonths', () => {
  it('counts a month on the same day of the next month', () => {
    expect(fullMonths('2026-11-17', '2026-12-16')).toBe(0);
    expect(fullMonths('2026-11-17', '2026-12-17')).toBe(1);
    expect(fullMonths('2026-11-17', '2027-11-17')).toBe(12);
  });

  it('uses the last day when the month is shorter', () => {
    expect(fullMonths('2027-01-31', '2027-02-27')).toBe(0);
    expect(fullMonths('2027-01-31', '2027-02-28')).toBe(1);
    expect(fullMonths('2028-01-31', '2028-02-29')).toBe(1); // leap year
    expect(fullMonths('2027-01-31', '2027-03-30')).toBe(1);
    expect(fullMonths('2027-01-31', '2027-03-31')).toBe(2);
  });

  it('is 0 before the start or with bad dates', () => {
    expect(fullMonths('2026-11-17', '2026-11-17')).toBe(0);
    expect(fullMonths('2026-11-17', '2026-10-01')).toBe(0);
    expect(fullMonths('17/11/2026', '2026-12-17')).toBe(0);
  });
});

describe('earnedDays', () => {
  it('gives one day per full month with 12 days a year (the default)', () => {
    expect(earnedDays('2026-11-17', 12, '2027-02-17')).toBe(3);
    expect(earnedDays('2026-11-17', undefined, '2027-02-17')).toBe(3);
  });

  it('rounds down to half days with other amounts', () => {
    // 10 a year = 0.83 a month: 1 month -> 0.5, 2 months -> 1.5, 6 months -> 5
    expect(earnedDays('2026-01-01', 10, '2026-02-01')).toBe(0.5);
    expect(earnedDays('2026-01-01', 10, '2026-03-01')).toBe(1.5);
    expect(earnedDays('2026-01-01', 10, '2026-07-01')).toBe(5);
  });

  it('earns nothing without a start date', () => {
    expect(earnedDays(undefined, 12, '2027-02-17')).toBe(0);
  });
});

describe('currentBalance', () => {
  it('adds what was earned to the stored balance', () => {
    const data = { vacaciones_disponibles: 7, acumulaDesde: '2026-11-17', diasAnuales: 12 };
    expect(currentBalance(data, '2026-11-30')).toBe(7);
    expect(currentBalance(data, '2027-01-17')).toBe(9);
  });

  it('keeps half days', () => {
    expect(currentBalance({ vacaciones_disponibles: 9.5 }, '2027-01-17')).toBe(9.5);
  });

  it('is null when there is no balance on record', () => {
    expect(currentBalance({ acumulaDesde: '2026-11-17' }, '2027-01-17')).toBeNull();
    expect(currentBalance(undefined, '2027-01-17')).toBeNull();
  });
});

describe('storedBalance', () => {
  it('starts earning today the first time', () => {
    expect(storedBalance(10, { nombre: 'Ana' }, '2026-11-17')).toEqual({
      vacaciones_disponibles: 10,
      acumulaDesde: '2026-11-17',
    });
  });

  it('keeps the start date and subtracts what was already earned', () => {
    const data = { vacaciones_disponibles: 7, acumulaDesde: '2026-11-17' };
    // 2 months earned: the admin sets 15, so 13 is stored and 13 + 2 = 15.
    expect(storedBalance(15, data, '2027-01-20')).toEqual({ vacaciones_disponibles: 13, acumulaDesde: '2026-11-17' });
  });
});
