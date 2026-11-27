// What to send for each change the page reports. Pure functions (no network), so they have tests.
// The texts and tags match the in-page notifications (src/app/services/notification-events.ts),
// so if both arrive the browser keeps only one.

export const VACATIONS = 'vacations_requests';
export const OVERTIME = 'overtime_requests';
export const NOTICES = 'notices';
export const BANK_REQUESTS = 'bank_change_requests';
export const BANK_ACCOUNT = 'pago'; // colaboradores/{uid}/privado/pago; the id is the worker's uid
export const NEW_EMPLOYEE = 'colaboradores'; // colaboradores/{uid}, right after Crear empleado
export const PASSWORD_CHANGED = 'contrasena'; // the person changed their own password; the id is their uid

export type Role = 'regular' | 'rh' | 'admin';
export type Audience = { panel: true } | { jefatura: true } | { rh: true } | { workers: true } | { uid: string };

export interface PushMessage {
  tag: string;
  title: string;
  body: string;
  url: string;
}

export interface Push {
  to: Audience;
  // Saved once in push_log/{key}; a second call for the same change sends nothing.
  key: string;
  message: PushMessage;
  // Also by e-mail (worker/src/mail.ts) to the same people. Off for ordinary notices (daily e-mail limit).
  email: boolean;
  // E-mail subject when the push title alone says too little (notices).
  subject?: string;
}

export interface Caller {
  uid: string;
  role: Role;
}

export type Flags = Partial<Record<'vacaciones' | 'horasExtra' | 'avisos' | 'pagos' | 'reportes', boolean>>;

type Data = Record<string, unknown>;

// The welcome e-mail only goes for an account created in the last hour.
const WELCOME_WINDOW_MS = 60 * 60 * 1000;
// At most one "your password changed" e-mail per person every 10 minutes.
const PASSWORD_WINDOW_MS = 10 * 60 * 1000;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
// Same defaults as src/app/services/feature-flags.ts: only vacations are on unless config says otherwise.
const DEFAULT_FLAGS: Required<Flags> = { vacaciones: true, horasExtra: false, avisos: false, pagos: false, reportes: false };

export function roleOf(tipo: unknown): Role {
  const t = typeof tipo === 'string' ? tipo.trim().toLowerCase() : '';
  return t === 'admin' || t === 'rh' ? t : 'regular';
}

export function isPanel(role: Role): boolean {
  return role === 'admin' || role === 'rh';
}

export function flagOn(flags: Flags, name: keyof Flags): boolean {
  return flags[name] ?? DEFAULT_FLAGS[name];
}

// The push for this change, or null when there is nothing to send or the caller has no business reporting it.
// `data` is the document as it is now in Firestore, never what the page says.
export function pushFor(
  collection: string,
  id: string,
  data: Data | null,
  caller: Caller,
  flags: Flags,
  now = Date.now(),
): Push | null {
  if (!data) return null;
  if (collection === NEW_EMPLOYEE) return welcomePush(id, data, caller, now);
  if (collection === PASSWORD_CHANGED) return passwordPush(id, data, caller, now);
  if (collection === VACATIONS || collection === OVERTIME) return requestPush(collection, id, data, caller, flags);
  if (collection === BANK_REQUESTS) return bankRequestPush(id, data, caller, flags);
  if (collection === BANK_ACCOUNT) return bankAccountPush(id, data, caller, flags);
  if (collection === NOTICES) return noticePush(id, data, caller, flags);
  return null;
}

function requestPush(collection: string, id: string, r: Data, caller: Caller, flags: Flags): Push | null {
  const vacation = collection === VACATIONS;
  if (!flagOn(flags, vacation ? 'vacaciones' : 'horasExtra')) return null;
  const owner = typeof r['uid'] === 'string' ? r['uid'] : '';
  if (!owner) return null;
  const estado = typeof r['estado'] === 'string' ? r['estado'] : 'pendiente';
  const what = vacation ? `vacaciones ${vacationDates(r)}` : `horas extra ${overtimeTime(r)}`;
  const tag = `${collection}-${id}-${estado}`;

  // New request (nobody approved it yet): the panel hears about it. Only its owner reports it.
  if (estado === 'pendiente' && !r['aprobacionRh'] && !r['aprobacionJefatura'] && caller.uid === owner) {
    return {
      to: { panel: true },
      key: tag,
      email: true,
      message: {
        tag,
        title: vacation ? 'Nueva solicitud de vacaciones' : 'Nueva solicitud de horas extra',
        body: `${who(r)} pide ${what}.`,
        url: '/tabs/dashboard',
      },
    };
  }

  // Both approvals are needed. When one side approved it, the other hears about it; only the approver reports it.
  if (estado === 'pendiente' && r['aprobacionJefatura'] && !r['aprobacionRh'] && caller.role === 'admin') {
    const bossTag = `${collection}-${id}-jefatura`;
    return {
      to: { rh: true },
      key: bossTag,
      email: true,
      message: {
        tag: bossTag,
        title: 'Solicitud lista para RH',
        body: `${who(r)} pide ${what}. La jefatura ya la aprobó; falta RH.`,
        url: '/tabs/dashboard',
      },
    };
  }
  if (estado === 'pendiente' && r['aprobacionRh'] && !r['aprobacionJefatura'] && caller.role === 'rh') {
    const rhTag = `${collection}-${id}-rh`;
    return {
      to: { jefatura: true },
      key: rhTag,
      email: true,
      message: {
        tag: rhTag,
        title: 'Solicitud lista para la jefatura',
        body: `${who(r)} pide ${what}. RH ya la aprobó; falta la jefatura.`,
        url: '/tabs/dashboard',
      },
    };
  }

  // Approved or rejected: the worker hears about it. Only the panel reports it.
  if ((estado === 'aprobada' || estado === 'rechazada') && isPanel(caller.role)) {
    const done = estado === 'aprobada' ? 'aprobadas' : 'rechazadas';
    return {
      to: { uid: owner },
      key: tag,
      email: true,
      message: {
        tag,
        title: vacation ? `Sus vacaciones fueron ${done}` : `Sus horas extra fueron ${done}`,
        body: `${capitalize(what)}.${reasonText(r)}`,
        url: '/tabs/solicitudes',
      },
    };
  }

  // Cancelled by the worker: the panel hears about it. Only its owner reports it.
  if (estado === 'cancelada' && caller.uid === owner) {
    const c = (r['cancelacion'] ?? {}) as Data;
    const wasApproved = c['estabaAprobada'] === true;
    const days = typeof c['diasDevueltos'] === 'number' ? c['diasDevueltos'] : 0;
    const note = !wasApproved
      ? '.'
      : days
        ? ` (estaban aprobadas; se le ${days === 1 ? 'devolvió 1 día' : `devolvieron ${days} días`}).`
        : ' (estaban aprobadas).';
    return {
      to: { panel: true },
      key: tag,
      email: true,
      message: {
        tag,
        title: vacation ? 'Vacaciones canceladas' : 'Horas extra canceladas',
        body: `${who(r)} canceló sus ${what}${note}`,
        url: '/tabs/dashboard',
      },
    };
  }
  return null;
}

function bankRequestPush(id: string, r: Data, caller: Caller, flags: Flags): Push | null {
  if (!flagOn(flags, 'pagos') || r['uid'] !== caller.uid || r['estado'] !== 'pendiente') return null;
  const tag = `${BANK_REQUESTS}-${id}`;
  const nota = typeof r['nota'] === 'string' && r['nota'] ? ` Nota: ${r['nota']}` : '';
  return {
    to: { panel: true },
    key: tag,
    email: true,
    message: {
      tag,
      title: 'Solicitud de cambio de cuenta',
      body: `${text(r['nombre']) || 'Un trabajador'} pidió cambiar su cuenta de pago.${nota}`,
      url: '/tabs/dashboard',
    },
  };
}

// The worker's payment account changed. Sent even if they did not ask, so they notice a change they did not expect.
function bankAccountPush(uid: string, p: Data, caller: Caller, flags: Flags): Push | null {
  if (!flagOn(flags, 'pagos') || !isPanel(caller.role) || caller.uid === uid) return null;
  const iban = text(p['iban']);
  if (!iban) return null;
  const last4 = iban.slice(-4);
  const tag = `bank-${last4}`;
  return {
    to: { uid },
    key: `bank-${uid}-${iban}`,
    email: true,
    message: {
      tag,
      title: 'Se cambió su cuenta de pago',
      body: `Ahora termina en ${last4}. Si no fue usted quien lo pidió, avise a RH de inmediato.`,
      url: '/tabs/perfil',
    },
  };
}

// A new account: the person hears it exists and that Firebase sent them a separate e-mail to choose their
// password. Mostly an e-mail, since a new person has no browser registered for push yet. Only the panel
// reports it, once, and only right after creating it.
function welcomePush(uid: string, c: Data, caller: Caller, now: number): Push | null {
  if (!isPanel(caller.role) || caller.uid === uid || c['activo'] !== true) return null;
  const created = Date.parse(text(c['createdAt']));
  if (!Number.isFinite(created) || now - created > WELCOME_WINDOW_MS || created - now > WELCOME_WINDOW_MS) return null;
  const tag = `welcome-${uid}`;
  return {
    to: { uid },
    key: tag,
    email: true,
    message: {
      tag,
      title: 'Su cuenta de ELVA Gestión está lista',
      body:
        'Le enviamos otro correo con un enlace para crear su contraseña. Si no lo ve, revise la carpeta de ' +
        'spam o use "¿Olvidó su contraseña?" en la página.',
      url: '/',
    },
  };
}

// The person changed their password in the page: a warning to their own e-mail, so they notice if it was
// not them. Only they can report it, about themselves, so nobody can send it to someone else.
function passwordPush(uid: string, c: Data, caller: Caller, now: number): Push | null {
  if (caller.uid !== uid || c['activo'] !== true) return null;
  const tag = `password-${uid}`;
  return {
    to: { uid },
    key: `${tag}-${Math.floor(now / PASSWORD_WINDOW_MS)}`,
    email: true,
    message: {
      tag,
      title: 'Se cambió su contraseña',
      body:
        'La contraseña de su cuenta de ELVA Gestión se acaba de cambiar. Si no fue usted, use ' +
        '"¿Olvidó su contraseña?" en la página y avise a RH de inmediato.',
      url: '/',
    },
  };
}

function noticePush(id: string, n: Data, caller: Caller, flags: Flags): Push | null {
  if (!flagOn(flags, 'avisos') || !isPanel(caller.role)) return null;
  const titulo = text(n['titulo']);
  if (!titulo) return null;
  const tag = `${NOTICES}-${id}`;
  const important = n['importante'] === true;
  const title = important ? 'Aviso importante' : 'Nuevo aviso';
  return {
    to: { workers: true },
    key: tag,
    // About 40 e-mails per notice and 100 a day on Resend's free plan: only important ones go by e-mail.
    email: important,
    subject: `${title}: ${titulo}`,
    message: { tag, title, body: titulo, url: '/tabs/avisos' },
  };
}

function reasonText(r: Data): string {
  const motivo = ((r['decision'] ?? {}) as Data)['motivo'];
  return r['estado'] === 'rechazada' && typeof motivo === 'string' && motivo ? ` Motivo: ${motivo}` : '';
}

function who(r: Data): string {
  return text(r['nombreSolicitante']) || text(r['correoSolicitante']) || 'Un trabajador';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// "del 23 nov al 29 nov": diaFin is the day the person returns, so the last day off is the day before.
// A half day (medioDiaDesde) is "el 23 nov, medio día".
export function vacationDates(r: Data): string {
  if (!isDay(r['diaInicio']) || !isDay(r['diaFin'])) return '';
  if (r['medioDiaDesde']) return `el ${shortDate(r['diaInicio'])}, medio día`;
  return `del ${shortDate(r['diaInicio'])} al ${shortDate(addDays(r['diaFin'], -1))}`;
}

// "el 14 nov, 08:00 – 12:00"
export function overtimeTime(r: Data): string {
  const inicio = text(r['inicio']);
  const fin = text(r['fin']);
  if (!isDay(inicio) || !fin) return '';
  return `el ${shortDate(inicio)}, ${inicio.slice(11, 16)} – ${fin.slice(11, 16)}`;
}

function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value);
}

function shortDate(value: string): string {
  const [, month, day] = value.slice(0, 10).split('-').map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

function addDays(value: string, days: number): string {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
