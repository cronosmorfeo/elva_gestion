import { Timestamp } from 'firebase/firestore';

import {
  bankChangedEvent,
  bankProblem,
  bankRequestEvents,
  maskCedula,
  toBankAccount,
  toBankChangeRequest,
} from './bank-account';

const VALID = 'CR05015202001026284066';

describe('bank account', () => {
  it('reads the saved account', () => {
    expect(
      toBankAccount({
        cedula: '1-1523-0847',
        iban: 'cr05 0152 0200 1026 2840 66',
        monedaCuenta: 'CRC',
        updatedAt: null,
      }),
    ).toEqual({ cedula: '1-1523-0847', iban: VALID, currency: 'CRC', updatedAt: undefined });
    expect(toBankAccount({ cedula: '1-1523-0847' })).toBeNull();
    expect(toBankAccount(undefined)).toBeNull();
  });

  it('checks the payment data before saving', () => {
    expect(bankProblem('', '', '')).toBe('');
    expect(bankProblem('1-1523-0847', VALID, 'CRC')).toBe('');
    expect(bankProblem('', 'CR00 1234', 'CRC')).toBe(
      'Revisá la cuenta IBAN: tiene que ser CR seguida de 20 números válidos.',
    );
    expect(bankProblem('12', VALID, 'CRC')).toBe('Revisá la cédula.');
    expect(bankProblem('', VALID, '')).toBe('Elegí la moneda de la cuenta.');
  });

  it('hides most of the cédula', () => {
    expect(maskCedula('1-1523-0847')).toBe('1-••••-0847');
    expect(maskCedula('155812345678')).toBe('••••••••5678');
  });

  it('tells the worker when their account changes, not on the first load', () => {
    const account = { cedula: '', iban: VALID, currency: 'CRC' };
    expect(bankChangedEvent(undefined, account)).toBeNull();
    expect(bankChangedEvent(VALID, account)).toBeNull();
    expect(bankChangedEvent('CR00000000000000000000', account)?.body).toBe(
      'Ahora termina en 4066. Si no fue usted quien lo pidió, avise a RH de inmediato.',
    );
    expect(bankChangedEvent(null, account)?.title).toBe('Se cambió su cuenta de pago');
  });

  it('tells admins about new change requests', () => {
    const r = toBankChangeRequest('r1', {
      uid: 'u1',
      nombre: 'Ana',
      nota: 'Cambié de banco',
      estado: 'pendiente',
      fecha: Timestamp.fromDate(new Date(2026, 10, 11, 9, 0)),
    });
    expect(r?.sentAt).toBe('2026-11-11T09:00');
    expect(bankRequestEvents(null, [r!])).toEqual([]);
    expect(bankRequestEvents(new Map(), [r!])[0].body).toBe(
      'Ana pidió cambiar su cuenta de pago. Nota: Cambié de banco',
    );
    expect(bankRequestEvents(new Map([['r1', 'pendiente']]), [r!])).toEqual([]);
  });
});
