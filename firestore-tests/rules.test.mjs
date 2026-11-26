// Tests for ../firestore.rules. Run with `npm test` in this folder (starts the Firestore emulator; needs Java).
// Each test writes what the page writes (src/app/services/requests-store.ts, tab3, admin-dashboard) and checks
// that the right role can and the others cannot.
import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';

import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const now = () => firebase.firestore.FieldValue.serverTimestamp();
let env;

// felix: jefatura (admin) · katia: RH · ana, luis: workers · old: deactivated · stranger: signed in, no document
const people = {
  felix: { nombre: 'Félix', tipo_colaborador: 'admin', activo: true, vacaciones_disponibles: 10, salario: 1 },
  vanessa: { nombre: 'Vanessa', tipo_colaborador: 'admin', activo: true, vacaciones_disponibles: 10, salario: 1 },
  katia: { nombre: 'Katia', tipo_colaborador: 'rh', activo: true, vacaciones_disponibles: 10, salario: 1 },
  ana: { nombre: 'Ana', tipo_colaborador: 'regular', activo: true, vacaciones_disponibles: 5, salario: 1 },
  luis: { nombre: 'Luis', tipo_colaborador: 'regular', activo: true, vacaciones_disponibles: 5, salario: 1 },
  old: { nombre: 'Old', tipo_colaborador: 'regular', activo: false, vacaciones_disponibles: 5, salario: 1 },
};

const db = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-elva',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});

after(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    for (const [uid, data] of Object.entries(people)) {
      await f.doc(`colaboradores/${uid}`).set({ uid, correo: `${uid}@elva.ai`, ...data });
    }
    await f.doc('colaboradores/ana/privado/pago').set({ iban: 'CR05015202001026284066', monedaCuenta: 'CRC' });
    await f
      .doc('vacations_requests/pend')
      .set({ uid: 'ana', diaInicio: '2099-01-12', diaFin: '2099-01-13', diasSolicitados: 1, estado: 'pendiente' });
    await f.doc('vacations_requests/aprob').set({
      uid: 'ana',
      diaInicio: '2099-02-02',
      diaFin: '2099-02-05',
      diasSolicitados: 3,
      estado: 'aprobada',
      decision: { por: 'felix', diasDescontados: 3 },
    });
    await f.doc('vacations_requests/pasada').set({
      uid: 'ana',
      diaInicio: '2020-02-03',
      diaFin: '2020-02-04',
      diasSolicitados: 1,
      estado: 'aprobada',
      decision: { por: 'felix', diasDescontados: 1 },
    });
    await f
      .doc('vacations_requests/deLuis')
      .set({ uid: 'luis', diaInicio: '2099-03-02', diaFin: '2099-03-03', diasSolicitados: 1, estado: 'pendiente' });
    await f
      .doc('overtime_requests/he')
      .set({ uid: 'ana', inicio: '2099-01-10T17:00', fin: '2099-01-10T19:00', tarea: 'Respaldo', estado: 'pendiente' });
    await f
      .doc('notices/n1')
      .set({ titulo: 'Hola', mensaje: 'x', importante: false, autor: 'Félix', autorUid: 'felix' });
    await f
      .doc('weekly_reports/r1')
      .set({ uid: 'ana', nombre: 'Ana', semana: '2026-11-16', texto: 'x', archivos: [], visto: null });
    await f.doc('bank_change_requests/b1').set({ uid: 'ana', nombre: 'Ana', nota: '', estado: 'pendiente' });
    await f
      .doc('config/featureFlags')
      .set({ vacaciones: true, horasExtra: false, reportes: false, avisos: false, pagos: false });
  });
});

describe('who gets in', () => {
  it('nobody without a session reads anything', async () => {
    await assertFails(db(null).doc('colaboradores/ana').get());
    await assertFails(db(null).doc('config/featureFlags').get());
    await assertFails(db(null).collection('notices').get());
  });

  it('an account without a colaboradores document (self-registered or anonymous) gets nothing', async () => {
    await assertFails(db('stranger').doc('colaboradores/ana').get());
    await assertFails(db('stranger').collection('notices').get());
    await assertFails(db('stranger').doc('config/featureFlags').get());
    await assertFails(
      db('stranger').collection('vacations_requests').add({
        uid: 'stranger',
        diaInicio: '2099-01-01',
        diaFin: '2099-01-02',
        diasSolicitados: 1,
        fechaSolicitud: now(),
      }),
    );
    await assertFails(
      db('stranger').doc('colaboradores/stranger').set({ uid: 'stranger', tipo_colaborador: 'admin', activo: true }),
    );
  });

  it('a deactivated account only reads its own document (so the page can sign it out)', async () => {
    await assertSucceeds(db('old').doc('colaboradores/old').get());
    await assertFails(db('old').collection('notices').get());
    await assertFails(
      db('old')
        .collection('vacations_requests')
        .add({ uid: 'old', diaInicio: '2099-01-01', diaFin: '2099-01-02', diasSolicitados: 1, fechaSolicitud: now() }),
    );
  });

  it('unknown collections are closed', async () => {
    await assertFails(db('felix').doc('otra/cosa').set({ a: 1 }));
    await assertFails(db('felix').doc('users/felix').set({ a: 1 }));
  });
});

describe('colaboradores', () => {
  it('a worker reads only their own document', async () => {
    await assertSucceeds(db('ana').doc('colaboradores/ana').get());
    await assertFails(db('ana').doc('colaboradores/luis').get());
    await assertFails(db('ana').collection('colaboradores').get());
    await assertSucceeds(db('katia').collection('colaboradores').get());
  });

  it('a worker cannot make themselves admin or raise their own balance', async () => {
    await assertFails(db('ana').doc('colaboradores/ana').update({ tipo_colaborador: 'admin' }));
    await assertFails(db('ana').doc('colaboradores/ana').update({ vacaciones_disponibles: 50 }));
  });

  it('Crear empleado: the panel creates workers only', async () => {
    const nuevo = { uid: 'nuevo', nombre: 'Nuevo', correo: 'n@elva.ai', tipo_colaborador: 'regular', activo: true };
    await assertSucceeds(db('katia').doc('colaboradores/nuevo').set(nuevo));
    await assertFails(
      db('katia')
        .doc('colaboradores/otro')
        .set({ ...nuevo, uid: 'otro', tipo_colaborador: 'admin' }),
    );
    await assertFails(
      db('ana')
        .doc('colaboradores/otro')
        .set({ ...nuevo, uid: 'otro' }),
    );
  });

  it('only the jefatura changes account types, never their own', async () => {
    await assertFails(db('katia').doc('colaboradores/luis').update({ tipo_colaborador: 'admin' }));
    await assertFails(db('katia').doc('colaboradores/felix').update({ tipo_colaborador: 'regular' }));
    await assertSucceeds(db('felix').doc('colaboradores/luis').update({ tipo_colaborador: 'rh' }));
    await assertFails(db('felix').doc('colaboradores/felix').update({ tipo_colaborador: 'rh' }));
  });

  it('RH deactivates workers but not the jefatura; nobody deactivates themselves or reactivates', async () => {
    await assertSucceeds(db('katia').doc('colaboradores/luis').update({ activo: false }));
    await assertFails(db('katia').doc('colaboradores/felix').update({ activo: false }));
    await assertSucceeds(db('vanessa').doc('colaboradores/felix').update({ activo: false }));
    await assertFails(db('katia').doc('colaboradores/katia').update({ activo: false }));
    await assertFails(db('felix').doc('colaboradores/old').update({ activo: true }));
  });

  it('the panel edits data and balances, but nobody raises their own salary or balance', async () => {
    await assertSucceeds(db('katia').doc('colaboradores/ana').update({ vacaciones_disponibles: 9.5, salario: 2 }));
    await assertFails(db('katia').doc('colaboradores/katia').update({ vacaciones_disponibles: 30 }));
    await assertFails(db('felix').doc('colaboradores/felix').update({ salario: 999 }));
    await assertSucceeds(db('felix').doc('colaboradores/felix').update({ nombre: 'Félix R.' }));
    await assertFails(db('felix').doc('colaboradores/ana').update({ correo: 'otro@x.com' }));
  });
});

describe('payment account', () => {
  it('the owner and the panel read it; coworkers do not', async () => {
    await assertSucceeds(db('ana').doc('colaboradores/ana/privado/pago').get());
    await assertSucceeds(db('katia').doc('colaboradores/ana/privado/pago').get());
    await assertFails(db('luis').doc('colaboradores/ana/privado/pago').get());
  });

  it('the panel writes valid accounts, never their own', async () => {
    const pago = (by) => ({
      cedula: '1',
      iban: 'CR05015202001026284066',
      monedaCuenta: 'CRC',
      updatedAt: now(),
      updatedBy: by,
    });
    await assertSucceeds(db('katia').doc('colaboradores/ana/privado/pago').set(pago('katia')));
    await assertFails(db('ana').doc('colaboradores/ana/privado/pago').set(pago('ana')));
    await assertFails(db('felix').doc('colaboradores/felix/privado/pago').set(pago('felix')));
    await assertFails(
      db('katia')
        .doc('colaboradores/ana/privado/pago')
        .set({ ...pago('katia'), iban: 'XX123' }),
    );
    await assertFails(
      db('katia')
        .doc('colaboradores/ana/privado/pago')
        .set({ ...pago('katia'), updatedBy: 'felix' }),
    );
  });
});

describe('vacation requests', () => {
  const nueva = (uid) => ({
    uid,
    nombreSolicitante: 'Ana',
    correoSolicitante: 'ana@elva.ai',
    diaInicio: '2099-05-04',
    diaFin: '2099-05-05',
    diasSolicitados: 1,
    comentarioRRHH: '',
    fechaSolicitud: now(),
  });

  it('a worker asks for their own, as pending only', async () => {
    await assertSucceeds(db('ana').collection('vacations_requests').add(nueva('ana')));
    await assertFails(db('ana').collection('vacations_requests').add(nueva('luis')));
    await assertFails(
      db('ana')
        .collection('vacations_requests')
        .add({ ...nueva('ana'), estado: 'aprobada' }),
    );
    await assertFails(
      db('ana')
        .collection('vacations_requests')
        .add({ ...nueva('ana'), decision: { por: 'ana' } }),
    );
  });

  it('a worker sees only their own requests', async () => {
    await assertSucceeds(db('ana').collection('vacations_requests').where('uid', '==', 'ana').get());
    await assertFails(db('ana').collection('vacations_requests').get());
    await assertFails(db('ana').doc('vacations_requests/deLuis').get());
    await assertSucceeds(db('katia').collection('vacations_requests').get());
  });

  it('RH approves first without deciding; RH cannot give the final approval', async () => {
    await assertSucceeds(
      db('katia')
        .doc('vacations_requests/pend')
        .update({ aprobacionRh: { por: 'katia', fecha: now() } }),
    );
    await assertFails(
      db('katia')
        .doc('vacations_requests/deLuis')
        .update({
          estado: 'aprobada',
          aprobacionJefatura: { por: 'katia', fecha: now() },
          decision: { por: 'katia', fecha: now(), diasDescontados: 1 },
        }),
    );
  });

  it('the jefatura gives the final approval and deducts in the same write', async () => {
    const r = db('felix');
    const batch = r.batch();
    batch.update(r.doc('vacations_requests/pend'), {
      estado: 'aprobada',
      aprobacionJefatura: { por: 'felix', fecha: now() },
      decision: { por: 'felix', fecha: now(), diasDescontados: 1 },
    });
    batch.update(r.doc('colaboradores/ana'), { vacaciones_disponibles: 4 });
    await assertSucceeds(batch.commit());
  });

  it('a worker cannot approve, and nobody signs for someone else', async () => {
    await assertFails(
      db('ana')
        .doc('vacations_requests/pend')
        .update({ aprobacionRh: { por: 'ana', fecha: now() } }),
    );
    await assertFails(
      db('katia')
        .doc('vacations_requests/pend')
        .update({ aprobacionRh: { por: 'felix', fecha: now() } }),
    );
  });

  it('RH or the jefatura rejects, each with their own role and a reason', async () => {
    await assertSucceeds(
      db('katia')
        .doc('vacations_requests/pend')
        .update({
          estado: 'rechazada',
          decision: { por: 'katia', fecha: now(), motivo: 'Ya hay dos personas', rol: 'rh' },
        }),
    );
    await assertFails(
      db('katia')
        .doc('vacations_requests/deLuis')
        .update({
          estado: 'rechazada',
          decision: { por: 'katia', fecha: now(), motivo: 'x', rol: 'jefatura' },
        }),
    );
    await assertFails(
      db('felix')
        .doc('vacations_requests/deLuis')
        .update({
          estado: 'rechazada',
          decision: { por: 'felix', fecha: now(), motivo: '', rol: 'jefatura' },
        }),
    );
  });

  it('nothing changes a request that was already decided', async () => {
    await assertFails(
      db('felix')
        .doc('vacations_requests/aprob')
        .update({
          estado: 'rechazada',
          decision: { por: 'felix', fecha: now(), motivo: 'x', rol: 'jefatura' },
        }),
    );
  });

  it('a worker cancels a pending request that has not started', async () => {
    await assertSucceeds(
      db('ana')
        .doc('vacations_requests/pend')
        .update({
          estado: 'cancelada',
          cancelacion: { por: 'ana', fecha: now(), estabaAprobada: false, diasDevueltos: 0 },
        }),
    );
    await assertFails(
      db('luis')
        .doc('vacations_requests/deLuis')
        .update({
          estado: 'cancelada',
          cancelacion: { por: 'luis', fecha: now(), estabaAprobada: false, diasDevueltos: 5 },
        }),
    );
  });

  it('cancelling approved vacations gives back exactly the deducted days, once', async () => {
    const r = db('ana');
    const cancel = (dias) => ({
      estado: 'cancelada',
      cancelacion: { por: 'ana', fecha: now(), estabaAprobada: true, diasDevueltos: dias },
    });

    const tooMany = r.batch();
    tooMany.update(r.doc('vacations_requests/aprob'), cancel(3));
    tooMany.update(r.doc('colaboradores/ana'), { vacaciones_disponibles: 9, devolucion: { solicitud: 'aprob' } });
    await assertFails(tooMany.commit());

    const noCancel = r.batch();
    noCancel.update(r.doc('colaboradores/ana'), { vacaciones_disponibles: 8, devolucion: { solicitud: 'aprob' } });
    await assertFails(noCancel.commit());

    const ok = r.batch();
    ok.update(r.doc('vacations_requests/aprob'), cancel(3));
    ok.update(r.doc('colaboradores/ana'), { vacaciones_disponibles: 8, devolucion: { solicitud: 'aprob' } });
    await assertSucceeds(ok.commit());

    await assertFails(
      r.doc('colaboradores/ana').update({ vacaciones_disponibles: 11, devolucion: { solicitud: 'aprob' } }),
    );
  });

  it('vacations that already started cannot be cancelled (no days back after taking them)', async () => {
    const r = db('ana');
    const b = r.batch();
    b.update(r.doc('vacations_requests/pasada'), {
      estado: 'cancelada',
      cancelacion: { por: 'ana', fecha: now(), estabaAprobada: true, diasDevueltos: 1 },
    });
    b.update(r.doc('colaboradores/ana'), { vacaciones_disponibles: 6, devolucion: { solicitud: 'pasada' } });
    await assertFails(b.commit());
  });

  it('nobody deletes requests', async () => {
    await assertFails(db('felix').doc('vacations_requests/pend').delete());
  });
});

describe('overtime requests', () => {
  it('a worker asks for their own; the jefatura approves; RH only reviews', async () => {
    await assertSucceeds(
      db('ana').collection('overtime_requests').add({
        uid: 'ana',
        nombreSolicitante: 'Ana',
        correoSolicitante: '',
        inicio: '2099-01-11T17:00',
        fin: '2099-01-11T19:00',
        tarea: 'Respaldo',
        estado: 'pendiente',
        fechaSolicitud: now(),
      }),
    );
    await assertSucceeds(
      db('katia')
        .doc('overtime_requests/he')
        .update({ aprobacionRh: { por: 'katia', fecha: now() } }),
    );
    await assertSucceeds(
      db('felix')
        .doc('overtime_requests/he')
        .update({
          estado: 'aprobada',
          aprobacionJefatura: { por: 'felix', fecha: now() },
          decision: { por: 'felix', fecha: now() },
        }),
    );
  });

  it('a worker cancels overtime that has not started', async () => {
    await assertSucceeds(
      db('ana')
        .doc('overtime_requests/he')
        .update({
          estado: 'cancelada',
          cancelacion: { por: 'ana', fecha: now(), estabaAprobada: false, diasDevueltos: 0 },
        }),
    );
  });
});

describe('notices, reports, account changes, tokens', () => {
  it('everyone active reads notices; only the panel writes them', async () => {
    await assertSucceeds(db('ana').collection('notices').get());
    await assertFails(db('ana').collection('notices').add({ titulo: 'x', mensaje: 'x', autorUid: 'ana' }));
    await assertSucceeds(
      db('katia').collection('notices').add({
        titulo: 'x',
        mensaje: 'x',
        importante: false,
        autor: 'Katia',
        autorUid: 'katia',
        createdAt: now(),
        updatedAt: null,
      }),
    );
    await assertSucceeds(db('katia').doc('notices/n1').delete());
  });

  it('weekly reports: the worker sends, only the panel marks them seen', async () => {
    await assertSucceeds(
      db('ana').collection('weekly_reports').add({
        uid: 'ana',
        nombre: 'Ana',
        semana: '2026-11-16',
        texto: 'x',
        archivos: [],
        visto: null,
        fechaEnvio: now(),
      }),
    );
    await assertFails(
      db('ana')
        .doc('weekly_reports/r1')
        .update({ visto: { por: 'ana', fecha: now() } }),
    );
    await assertFails(db('luis').doc('weekly_reports/r1').get());
    await assertSucceeds(
      db('katia')
        .doc('weekly_reports/r1')
        .update({ visto: { por: 'katia', fecha: now() } }),
    );
  });

  it('account change requests: the worker asks, the panel marks them done', async () => {
    await assertSucceeds(
      db('ana')
        .collection('bank_change_requests')
        .add({ uid: 'ana', nombre: 'Ana', nota: 'Cambié de banco', estado: 'pendiente', fecha: now() }),
    );
    await assertFails(
      db('ana')
        .doc('bank_change_requests/b1')
        .update({ estado: 'atendida', atendida: { por: 'ana', fecha: now() } }),
    );
    await assertSucceeds(
      db('katia')
        .doc('bank_change_requests/b1')
        .update({ estado: 'atendida', atendida: { por: 'katia', fecha: now() } }),
    );
  });

  it('push tokens: only your own', async () => {
    await assertSucceeds(db('ana').doc('users/ana/fcmTokens/t1').set({ createdAt: now(), userAgent: 'x' }));
    await assertFails(db('ana').doc('users/luis/fcmTokens/t1').set({ createdAt: now(), userAgent: 'x' }));
  });

  it('push tokens: a self-registered or deactivated account cannot save one, but can remove its own', async () => {
    await assertFails(db('extrano').doc('users/extrano/fcmTokens/t1').set({ createdAt: now(), userAgent: 'x' }));
    await assertFails(db('old').doc('users/old/fcmTokens/t1').set({ createdAt: now(), userAgent: 'x' }));
    await env.withSecurityRulesDisabled((ctx) =>
      ctx.firestore().doc('users/old/fcmTokens/t2').set({ createdAt: now(), userAgent: 'x' }),
    );
    await assertSucceeds(db('old').doc('users/old/fcmTokens/t2').delete());
  });
});

describe('config (feature flags and settings)', () => {
  it('everyone active reads it; only the jefatura writes it', async () => {
    await assertSucceeds(db('ana').doc('config/featureFlags').get());
    await assertFails(db('ana').doc('config/featureFlags').update({ horasExtra: true }));
    await assertFails(db('katia').doc('config/featureFlags').update({ horasExtra: true }));
    await assertSucceeds(db('felix').doc('config/featureFlags').update({ horasExtra: true }));
  });

  it('only valid values: booleans for flags, 5 to 240 minutes', async () => {
    await assertFails(db('felix').doc('config/featureFlags').update({ horasExtra: 'si' }));
    await assertSucceeds(db('felix').doc('config/seguridad').set({ minutosInactividad: 30 }));
    await assertFails(db('felix').doc('config/seguridad').set({ minutosInactividad: 0 }));
    await assertFails(db('felix').doc('config/otra').set({ a: 1 }));
  });
});
