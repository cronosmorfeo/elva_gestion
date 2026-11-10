import { Timestamp } from 'firebase/firestore';

import { sortBySent, toNotice, toOvertimeRequest, toVacationRequest, toWorkReport } from './firestore-mappers';

const at = (d: number, h: number, m = 0): Timestamp => Timestamp.fromDate(new Date(2026, 10, d, h, m));

const vacation = {
  comentarioRRHH: ' Viaje familiar ',
  correoSolicitante: 'ana@elva.ai',
  diaFin: '2026-11-30',
  diaInicio: '2026-11-23',
  diasSolicitados: 5,
  fechaSolicitud: at(9, 10, 55),
  nombreSolicitante: 'Ana Solís',
};

describe('toVacationRequest', () => {
  it('maps the Firestore fields', () => {
    expect(toVacationRequest('abc', vacation)).toEqual({
      id: 'abc',
      employee: 'Ana Solís',
      email: 'ana@elva.ai',
      balance: Number.NaN,
      start: '2026-11-23',
      returnDate: '2026-11-30',
      rhReviewed: true,
      status: 'pendiente',
      ownerId: undefined,
      deductedDays: undefined,
      comment: 'Viaje familiar',
      sentAt: '2026-11-09T10:55',
    });
  });

  it('keeps a valid estado and the uid, and treats an unknown estado as pending', () => {
    const r = toVacationRequest('abc', { ...vacation, estado: 'aprobada', uid: 'u1' });
    expect(r?.status).toBe('aprobada');
    expect(r?.ownerId).toBe('u1');
    expect(toVacationRequest('abc', { ...vacation, estado: 'otra' })?.status).toBe('pendiente');
  });

  it('reads the days deducted at approval', () => {
    const r = toVacationRequest('abc', { ...vacation, estado: 'aprobada', decision: { por: 'x', diasDescontados: 5 } });
    expect(r?.deductedDays).toBe(5);
  });

  it('uses the email when there is no name', () => {
    expect(toVacationRequest('abc', { ...vacation, nombreSolicitante: '' })?.employee).toBe('ana@elva.ai');
  });

  it('skips documents with missing or reversed dates', () => {
    expect(toVacationRequest('a', { ...vacation, diaInicio: '' })).toBeNull();
    expect(toVacationRequest('b', { ...vacation, diaFin: '2026-11-20' })).toBeNull();
    expect(toVacationRequest('c', { ...vacation, diaFin: '2026-11-23' })).toBeNull();
  });
});

describe('toOvertimeRequest', () => {
  const overtime = {
    uid: 'u1',
    nombreSolicitante: 'Ana Solís',
    correoSolicitante: 'ana@elva.ai',
    inicio: '2026-11-14T08:00',
    fin: '2026-11-14T12:00',
    tarea: ' Migración ',
    estado: 'rechazada',
    fechaSolicitud: at(9, 11),
  };

  it('maps the Firestore fields', () => {
    expect(toOvertimeRequest('o1', overtime)).toEqual({
      id: 'o1',
      employee: 'Ana Solís',
      email: 'ana@elva.ai',
      start: '2026-11-14T08:00',
      end: '2026-11-14T12:00',
      task: 'Migración',
      rhReviewed: true,
      status: 'rechazada',
      ownerId: 'u1',
      sentAt: '2026-11-09T11:00',
    });
  });

  it('skips documents with wrong times', () => {
    expect(toOvertimeRequest('a', { ...overtime, inicio: '2026-11-14' })).toBeNull();
    expect(toOvertimeRequest('b', { ...overtime, fin: '2026-11-14T07:00' })).toBeNull();
  });
});

describe('toNotice', () => {
  const notice = { titulo: 'Cierre', mensaje: 'Hasta el viernes', importante: true, autor: 'RH', createdAt: at(9, 9) };

  it('maps the Firestore fields', () => {
    expect(toNotice('n1', notice)).toEqual({
      id: 'n1',
      title: 'Cierre',
      message: 'Hasta el viernes',
      important: true,
      author: 'RH',
      createdAt: '2026-11-09T09:00',
      updatedAt: undefined,
    });
  });

  it('skips notices without title, message or date', () => {
    expect(toNotice('a', { ...notice, titulo: ' ' })).toBeNull();
    expect(toNotice('b', { ...notice, createdAt: null })).toBeNull();
  });
});

describe('toWorkReport', () => {
  const report = {
    uid: 'u1',
    nombre: 'Ana Solís',
    semana: '2026-11-09',
    texto: 'Terminé',
    archivos: [{ nombre: 'a.pdf', tamano: 2048, tipo: 'application/pdf' }, { nombre: '' }, 'x'],
    visto: null,
    fechaEnvio: at(9, 16, 40),
  };

  it('maps the Firestore fields and ignores broken files', () => {
    expect(toWorkReport('r1', report)).toEqual({
      id: 'r1',
      employeeId: 'u1',
      employee: 'Ana Solís',
      weekStart: '2026-11-09',
      sentAt: '2026-11-09T16:40',
      text: 'Terminé',
      files: [{ name: 'a.pdf', size: 2048, type: 'application/pdf' }],
      seen: false,
    });
  });

  it('marks it seen when visto is set', () => {
    expect(toWorkReport('r1', { ...report, visto: { por: 'admin' } })?.seen).toBe(true);
  });

  it('skips reports without owner or week', () => {
    expect(toWorkReport('a', { ...report, uid: '' })).toBeNull();
    expect(toWorkReport('b', { ...report, semana: 'x' })).toBeNull();
  });
});

describe('sortBySent', () => {
  it('puts the newest first and undated last', () => {
    expect(sortBySent([{ sentAt: '2026-11-01T08:00' }, {}, { sentAt: '2026-11-09T10:00' }])).toEqual([
      { sentAt: '2026-11-09T10:00' },
      { sentAt: '2026-11-01T08:00' },
      {},
    ]);
  });
});
