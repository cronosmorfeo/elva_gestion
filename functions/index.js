// Push notifications for ELVA Gestión. Deploying them needs the Blaze plan (see README.md).
// - Admins (admin/rh): a new vacation or overtime request.
// - The worker: their request was approved or rejected.
// - Every active worker: a new notice.
// Tokens live in users/{uid}/fcmTokens/{token}, saved by PushNotificationService in the app.
// The tag matches the in-page notification, so the browser shows only one if both arrive.

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { setGlobalOptions } = require('firebase-functions/v2');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');

setGlobalOptions({ maxInstances: 5 });
initializeApp();

const db = getFirestore();

const VACATIONS = 'vacations_requests';
const OVERTIME = 'overtime_requests';
const NOTICES = 'notices';
const ADMIN_ROLES = ['admin', 'rh'];
const DECIDED = ['aprobada', 'rechazada'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
// FCM answers these when a token is no longer valid; those tokens are deleted.
const DEAD_TOKEN = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'];

exports.newVacationRequest = onDocumentCreated(`${VACATIONS}/{id}`, async (event) => {
  const r = event.data?.data();
  if (!r) return;
  await send(await uidsWithRole(ADMIN_ROLES), {
    tag: `${VACATIONS}-${event.params.id}-pendiente`,
    title: 'Nueva solicitud de vacaciones',
    body: `${who(r)} pide vacaciones ${vacationDates(r)}.`,
    url: '/tabs/dashboard',
  });
});

exports.newOvertimeRequest = onDocumentCreated(`${OVERTIME}/{id}`, async (event) => {
  const r = event.data?.data();
  if (!r) return;
  await send(await uidsWithRole(ADMIN_ROLES), {
    tag: `${OVERTIME}-${event.params.id}-pendiente`,
    title: 'Nueva solicitud de horas extra',
    body: `${who(r)} pide horas extra ${overtimeTime(r)}.`,
    url: '/tabs/dashboard',
  });
});

exports.vacationDecided = onDocumentUpdated(`${VACATIONS}/{id}`, async (event) => {
  const r = decidedNow(event);
  if (!r) return;
  await send([r.uid], {
    tag: `${VACATIONS}-${event.params.id}-${r.estado}`,
    title: `Sus vacaciones fueron ${r.estado === 'aprobada' ? 'aprobadas' : 'rechazadas'}`,
    body: `Vacaciones ${vacationDates(r)}.`,
    url: '/tabs/solicitudes',
  });
});

exports.overtimeDecided = onDocumentUpdated(`${OVERTIME}/{id}`, async (event) => {
  const r = decidedNow(event);
  if (!r) return;
  await send([r.uid], {
    tag: `${OVERTIME}-${event.params.id}-${r.estado}`,
    title: `Sus horas extra fueron ${r.estado === 'aprobada' ? 'aprobadas' : 'rechazadas'}`,
    body: `Horas extra ${overtimeTime(r)}.`,
    url: '/tabs/solicitudes',
  });
});

exports.newNotice = onDocumentCreated(`${NOTICES}/{id}`, async (event) => {
  const n = event.data?.data();
  if (!n || typeof n.titulo !== 'string') return;
  await send(await uidsWithRole(['regular']), {
    tag: `${NOTICES}-${event.params.id}`,
    title: n.importante === true ? 'Aviso importante' : 'Nuevo aviso',
    body: n.titulo,
    url: '/tabs/avisos',
  });
});

// The request after the change, only when it just went from pending to approved/rejected and has an owner.
function decidedNow(event) {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after || typeof after.uid !== 'string' || !after.uid) return null;
  if (before.estado === after.estado || !DECIDED.includes(after.estado)) return null;
  return after;
}

async function uidsWithRole(roles) {
  const snap = await db
    .collection('colaboradores')
    .where('tipo_colaborador', 'in', roles)
    .where('activo', '==', true)
    .get();
  return snap.docs.map((d) => d.id);
}

// Data-only message: the app's service worker shows it, with the tag and the link to open.
async function send(uids, message) {
  const entries = [];
  for (const uid of uids) {
    const snap = await db.collection('users').doc(uid).collection('fcmTokens').get();
    for (const d of snap.docs) entries.push({ token: d.id, ref: d.ref });
  }
  if (entries.length === 0) return;
  const result = await getMessaging().sendEachForMulticast({
    tokens: entries.map((e) => e.token),
    data: message,
    webpush: { headers: { Urgency: 'high' } },
  });
  const dead = result.responses
    .map((res, i) => (!res.success && DEAD_TOKEN.includes(res.error?.code) ? entries[i].ref : null))
    .filter(Boolean);
  await Promise.all(dead.map((ref) => ref.delete()));
  logger.info(`Push "${message.title}": ${result.successCount} sent, ${result.failureCount} failed.`);
}

function who(r) {
  return r.nombreSolicitante || r.correoSolicitante || 'Un trabajador';
}

// "del 23 nov al 29 nov": diaFin is the day the person returns, so the last day off is the day before.
function vacationDates(r) {
  if (!isDay(r.diaInicio) || !isDay(r.diaFin)) return '';
  return `del ${shortDate(r.diaInicio)} al ${shortDate(addDays(r.diaFin, -1))}`;
}

// "el 14 nov, 08:00 – 12:00"
function overtimeTime(r) {
  if (typeof r.inicio !== 'string' || typeof r.fin !== 'string') return '';
  return `el ${shortDate(r.inicio)}, ${r.inicio.slice(11, 16)} – ${r.fin.slice(11, 16)}`;
}

function isDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value);
}

function shortDate(value) {
  const [, month, day] = value.slice(0, 10).split('-').map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

function addDays(value, days) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}
