import { describe, expect, it } from 'vitest';

import {
  BANK_ACCOUNT,
  BANK_REQUESTS,
  NEW_EMPLOYEE,
  NOTICES,
  OVERTIME,
  PASSWORD_CHANGED,
  VACATIONS,
  flagOn,
  pushFor,
  roleOf,
  vacationDates,
  withOwnerName,
} from './events';

const ana = { uid: 'ana', role: 'regular' as const };
const rh = { uid: 'katia', role: 'rh' as const };
const boss = { uid: 'felix', role: 'admin' as const };
const allOn = { vacaciones: true, horasExtra: true, avisos: true, pagos: true };

const vacation = (extra: Record<string, unknown> = {}) => ({
  uid: 'ana',
  nombreSolicitante: 'Ana Solís',
  diaInicio: '2026-12-14',
  diaFin: '2026-12-21',
  ...extra,
});

describe('requests', () => {
  it('a new request goes to the panel, reported only by its owner', () => {
    const push = pushFor(VACATIONS, 'v1', vacation({ estado: 'pendiente' }), ana, {});
    expect(push).toEqual({
      to: { panel: true },
      key: 'vacations_requests-v1-pendiente',
      email: true,
      message: {
        tag: 'vacations_requests-v1-pendiente',
        title: 'Nueva solicitud de vacaciones',
        body: 'Ana Solís pide vacaciones del 14 dic al 20 dic.',
        url: '/tabs/dashboard',
      },
    });
    // Old requests have no estado: they count as pending.
    expect(pushFor(VACATIONS, 'v1', vacation(), ana, {})?.to).toEqual({ panel: true });
    // Someone else cannot report it (and so cannot spam the panel with it).
    expect(pushFor(VACATIONS, 'v1', vacation(), { uid: 'luis', role: 'regular' }, {})).toBeNull();
  });

  it("RH's approval tells the jefatura, reported only by RH", () => {
    const reviewed = vacation({ estado: 'pendiente', aprobacionRh: { por: 'katia' } });
    const push = pushFor(VACATIONS, 'v1', reviewed, rh, {});
    expect(push?.to).toEqual({ jefatura: true });
    expect(push?.key).toBe('vacations_requests-v1-rh');
    expect(push?.email).toBe(true);
    expect(push?.message.body).toBe(
      'Ana Solís pide vacaciones del 14 dic al 20 dic. RH ya la aprobó; falta la jefatura.',
    );
    // Not the owner, not the jefatura, and not once the jefatura already decided.
    expect(pushFor(VACATIONS, 'v1', reviewed, ana, {})).toBeNull();
    expect(pushFor(VACATIONS, 'v1', reviewed, boss, {})).toBeNull();
    expect(pushFor(VACATIONS, 'v1', { ...reviewed, aprobacionJefatura: { por: 'felix' } }, rh, {})).toBeNull();
  });

  it("the jefatura's approval tells RH when RH has not approved yet, reported only by the jefatura", () => {
    const first = vacation({ estado: 'pendiente', aprobacionJefatura: { por: 'felix' } });
    const push = pushFor(VACATIONS, 'v1', first, boss, {});
    expect(push?.to).toEqual({ rh: true });
    expect(push?.key).toBe('vacations_requests-v1-jefatura');
    expect(push?.email).toBe(true);
    expect(push?.message.body).toBe(
      'Ana Solís pide vacaciones del 14 dic al 20 dic. La jefatura ya la aprobó; falta RH.',
    );
    // Not RH, not the owner (no "new request" again), and not once RH already approved.
    expect(pushFor(VACATIONS, 'v1', first, rh, {})).toBeNull();
    expect(pushFor(VACATIONS, 'v1', first, ana, {})).toBeNull();
    expect(pushFor(VACATIONS, 'v1', { ...first, aprobacionRh: { por: 'katia' } }, boss, {})).toBeNull();
  });

  it('a decision goes to the worker, reported only by the panel', () => {
    const approved = pushFor(VACATIONS, 'v1', vacation({ estado: 'aprobada' }), boss, {});
    expect(approved?.to).toEqual({ uid: 'ana' });
    expect(approved?.message.title).toBe('Sus vacaciones fueron aprobadas');
    expect(approved?.message.body).toBe('Vacaciones del 14 dic al 20 dic.');
    const rejected = pushFor(
      VACATIONS,
      'v1',
      vacation({ estado: 'rechazada', decision: { motivo: 'Cierre de mes' } }),
      rh,
      {},
    );
    expect(rejected?.message.title).toBe('Sus vacaciones fueron rechazadas');
    expect(rejected?.message.body).toBe('Vacaciones del 14 dic al 20 dic. Motivo: Cierre de mes');
    expect(pushFor(VACATIONS, 'v1', vacation({ estado: 'aprobada' }), ana, {})).toBeNull();
  });

  it('a cancellation goes to the panel and says if days came back', () => {
    const push = pushFor(
      VACATIONS,
      'v1',
      vacation({ estado: 'cancelada', cancelacion: { estabaAprobada: true, diasDevueltos: 5 } }),
      ana,
      {},
    );
    expect(push?.to).toEqual({ panel: true });
    expect(push?.message.body).toBe(
      'Ana Solís canceló sus vacaciones del 14 dic al 20 dic (estaban aprobadas; se le devolvieron 5 días).',
    );
    expect(pushFor(VACATIONS, 'v1', vacation({ estado: 'cancelada' }), boss, {})).toBeNull();
  });

  it('overtime uses its own texts and flag', () => {
    const r = { uid: 'ana', nombreSolicitante: 'Ana', inicio: '2026-11-14T08:00', fin: '2026-11-14T12:00' };
    expect(pushFor(OVERTIME, 'h1', r, ana, {})).toBeNull(); // horasExtra is off by default
    expect(pushFor(OVERTIME, 'h1', r, ana, allOn)?.message.body).toBe('Ana pide horas extra el 14 nov, 08:00 – 12:00.');
  });

  it('nothing for a section that is off, a missing document or a request without owner', () => {
    expect(pushFor(VACATIONS, 'v1', vacation(), ana, { vacaciones: false })).toBeNull();
    expect(pushFor(VACATIONS, 'v1', null, ana, {})).toBeNull();
    expect(pushFor(VACATIONS, 'v1', vacation({ uid: '' }), ana, {})).toBeNull();
    expect(pushFor('colaboradores', 'ana', {}, boss, allOn)).toBeNull();
  });
});

describe('payment account', () => {
  it('a change request goes to the panel', () => {
    const push = pushFor(BANK_REQUESTS, 'b1', { uid: 'ana', nombre: 'Ana', estado: 'pendiente' }, ana, allOn);
    expect(push?.to).toEqual({ panel: true });
    expect(pushFor(BANK_REQUESTS, 'b1', { uid: 'ana', estado: 'pendiente' }, ana, {})).toBeNull(); // pagos off
  });

  it('a changed account goes to its owner, reported by someone else in the panel', () => {
    const push = pushFor(BANK_ACCOUNT, 'ana', { iban: 'CR05015202001026284066' }, boss, allOn);
    expect(push?.to).toEqual({ uid: 'ana' });
    expect(push?.message.body).toContain('Ahora termina en 4066.');
    expect(push?.key).toBe('bank-ana-CR05015202001026284066');
    expect(pushFor(BANK_ACCOUNT, 'ana', { iban: 'CR05015202001026284066' }, ana, allOn)).toBeNull();
    expect(pushFor(BANK_ACCOUNT, 'felix', { iban: 'CR05015202001026284066' }, boss, allOn)).toBeNull();
  });
});

describe('notices', () => {
  it('go to the workers when avisos is on, reported by the panel', () => {
    const push = pushFor(NOTICES, 'n1', { titulo: 'Cierre', importante: true }, boss, allOn);
    expect(push?.to).toEqual({ workers: true });
    expect(push?.message.title).toBe('Aviso importante');
    expect(push?.email).toBe(true);
    expect(push?.subject).toBe('Aviso importante: Cierre');
    // Ordinary notices go by push only (Resend's free plan allows 100 e-mails a day).
    expect(pushFor(NOTICES, 'n1', { titulo: 'Cierre' }, boss, allOn)?.email).toBe(false);
    expect(pushFor(NOTICES, 'n1', { titulo: 'Cierre' }, ana, allOn)).toBeNull();
    expect(pushFor(NOTICES, 'n1', { titulo: 'Cierre' }, boss, {})).toBeNull();
  });
});

describe('new employee', () => {
  const now = Date.parse('2026-11-25T16:00:00Z');
  const created = { activo: true, createdAt: '2026-11-25T15:58:00Z' };

  it('welcomes the new person, reported only by the panel, right after creating the account', () => {
    const push = pushFor(NEW_EMPLOYEE, 'ana', created, rh, {}, now);
    expect(push?.to).toEqual({ uid: 'ana' });
    expect(push?.key).toBe('welcome-ana');
    expect(push?.email).toBe(true);
    expect(push?.message.title).toBe('Su cuenta de ELVA Gestión está lista');
    expect(pushFor(NEW_EMPLOYEE, 'ana', created, ana, {}, now)).toBeNull();
    expect(pushFor(NEW_EMPLOYEE, 'ana', { ...created, activo: false }, rh, {}, now)).toBeNull();
    // An old account gets nothing, so nobody can re-send it later.
    expect(pushFor(NEW_EMPLOYEE, 'ana', { activo: true, createdAt: '2026-11-20T15:00:00Z' }, rh, {}, now)).toBeNull();
    expect(pushFor(NEW_EMPLOYEE, 'ana', { activo: true }, rh, {}, now)).toBeNull();
  });
});

describe('password changed', () => {
  const now = Date.parse('2026-11-25T16:00:00Z');

  it('warns only the person, reported only by themselves, at most once every 10 minutes', () => {
    const push = pushFor(PASSWORD_CHANGED, 'ana', { activo: true }, ana, {}, now);
    expect(push?.to).toEqual({ uid: 'ana' });
    expect(push?.email).toBe(true);
    expect(push?.message.title).toBe('Se cambió su contraseña');
    expect(pushFor(PASSWORD_CHANGED, 'ana', { activo: true }, ana, {}, now + 60_000)?.key).toBe(push?.key);
    expect(pushFor(PASSWORD_CHANGED, 'ana', { activo: true }, ana, {}, now + 11 * 60_000)?.key).not.toBe(push?.key);
    // Nobody can send it to someone else, not even the panel.
    expect(pushFor(PASSWORD_CHANGED, 'ana', { activo: true }, rh, {}, now)).toBeNull();
    expect(pushFor(PASSWORD_CHANGED, 'ana', { activo: false }, ana, {}, now)).toBeNull();
  });
});

describe('helpers', () => {
  it('roles and flags', () => {
    expect(roleOf('admin')).toBe('admin');
    expect(roleOf(' RH ')).toBe('rh');
    expect(roleOf(undefined)).toBe('regular');
    expect(flagOn({}, 'vacaciones')).toBe(true);
    expect(flagOn({}, 'avisos')).toBe(false);
  });

  it('half days', () => {
    expect(vacationDates({ diaInicio: '2026-12-14', diaFin: '2026-12-15', medioDiaDesde: '07:00' })).toBe(
      'el 14 dic, medio día',
    );
  });
});

describe('owner name', () => {
  it("uses the owner's own name and e-mail, not the ones typed in the request", () => {
    const fake = { uid: 'luis', nombreSolicitante: 'Ana Solís', correoSolicitante: 'ana@elva.ai', nombre: 'Ana Solís' };
    const fixed = withOwnerName(fake, { nombre: 'Luis Mora', correo: 'luis@elva.ai' });
    expect(fixed).toMatchObject({
      nombreSolicitante: 'Luis Mora',
      nombre: 'Luis Mora',
      correoSolicitante: 'luis@elva.ai',
    });
    const push = pushFor(
      VACATIONS,
      'v1',
      { ...vacation({ estado: 'pendiente' }), ...fixed },
      { uid: 'luis', role: 'regular' },
      {},
    );
    expect(push?.message.body).toContain('Luis Mora pide');
  });

  it('keeps the request as it is when the owner has no name', () => {
    const r = { uid: 'ana', nombreSolicitante: 'Ana' };
    expect(withOwnerName(r, null)).toBe(r);
    expect(withOwnerName(null, { nombre: 'Ana' })).toBeNull();
  });
});
