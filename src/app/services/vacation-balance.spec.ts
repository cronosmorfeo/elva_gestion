import {
  ApproveError,
  approveProblemText,
  availableDays,
  balanceAfterCancel,
  canCancel,
  checkBalance,
  deductedDays,
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
