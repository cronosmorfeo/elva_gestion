// ELVA Gestión push Worker: push notifications with the page closed, without Cloud Functions (which need
// the Blaze plan). After a change (a new request, a decision, a cancellation...) the page calls
// POST /notify with { collection, id } and the user's Firebase ID token. The Worker:
//   1. checks the token and that the caller is an active colaborador,
//   2. reads the document from Firestore itself (it never trusts texts sent by the page),
//   3. decides who gets what (events.ts) and saves push_log/{key} so the same change is sent only once,
//   4. sends the push with FCM to every browser of those people and deletes tokens that stopped working,
//   5. and, when Resend is set up, an e-mail to each of them (mail.ts).
// Setup: worker/README.md.

import {
  URL_SECONDS,
  checkUpload,
  contentTypeOf,
  downloadName,
  ownerOf,
  reportPath,
} from './files';
import { Firestore, accessToken, sendPush, verifyIdToken, type ServiceAccount } from './google';
import { ensurePasswordPolicy } from './auth-config';
import { mailFor, sendMails, validEmail } from './mail';
import { presign } from './sigv4';
import {
  BANK_ACCOUNT,
  BANK_REQUESTS,
  NEW_EMPLOYEE,
  NOTICES,
  PASSWORD_CHANGED,
  OVERTIME,
  VACATIONS,
  isPanel,
  pushFor,
  roleOf,
  type Audience,
  type Flags,
  type Push,
  type Role,
} from './events';

export interface Env {
  FIREBASE_PROJECT_ID: string;
  // Secret: the whole JSON of a Firebase service account key. Never in the code or in wrangler.toml.
  FIREBASE_SERVICE_ACCOUNT: string;
  // Comma-separated origins of the page, e.g. "http://localhost:4200,https://elva-gestion.web.app".
  ALLOWED_ORIGINS: string;
  // Backblaze B2 (report attachments). Without them the /files routes answer 501.
  B2_ENDPOINT?: string; // e.g. s3.us-east-005.backblazeb2.com
  B2_BUCKET?: string;
  B2_KEY_ID?: string; // secret
  B2_APPLICATION_KEY?: string; // secret, an application key limited to that bucket
  // E-mails with Resend. Without RESEND_API_KEY or MAIL_FROM no e-mail is sent; push works the same.
  RESEND_API_KEY?: string; // secret, a key with "Sending access" only
  MAIL_FROM?: string; // e.g. "ELVA Gestión <noreply@elvaai.com>"
  APP_URL?: string; // the page, for the button in the e-mail, e.g. https://elva-gestion.web.app
}

const COLLECTIONS = new Set([VACATIONS, OVERTIME, NOTICES, BANK_REQUESTS, BANK_ACCOUNT, NEW_EMPLOYEE, PASSWORD_CHANGED]);
const ID = /^[A-Za-z0-9_-]{1,128}$/;
// The free plan allows 50 outside requests per call; about 8 go to Google before sending.
// The e-mails take one more (a single batch call).
const MAX_SENDS = 35;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin') ?? '';
    const allowed = allowedOrigin(origin, env.ALLOWED_ORIGINS);
    const cors: Record<string, string> = allowed
      ? {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-max-age': '86400',
          vary: 'origin',
        }
      : {};
    const reply = (status: number, body?: unknown): Response =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { ...cors, 'content-type': 'application/json' },
      });

    const route = ROUTES[new URL(request.url).pathname];
    if (!route) return reply(404);
    if (request.method === 'OPTIONS') return allowed ? reply(204) : reply(403);
    if (request.method !== 'POST') return reply(405);
    if (!allowed) return reply(403);

    try {
      return reply(200, await route(request, env));
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      // Details only in the Worker logs, never in the answer.
      console.error(new URL(request.url).pathname, err instanceof Error ? err.message : err);
      return reply(status, { error: status === 500 ? 'internal' : 'rejected' });
    }
  },
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function allowedOrigin(origin: string, list: string): boolean {
  if (!origin) return false;
  return list
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .includes(origin);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    if (typeof body === 'object' && body !== null) return body as Record<string, unknown>;
  } catch {
    // falls through
  }
  throw new HttpError(400, 'bad json');
}

// Who is calling: a valid Firebase ID token of an active colaborador. Returns them and a Firestore client.
async function caller(request: Request, env: Env): Promise<{ uid: string; role: Role; db: Firestore; token: string }> {
  const auth = request.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) throw new HttpError(401, 'no token');
  const projectId = env.FIREBASE_PROJECT_ID;
  let uid: string;
  try {
    uid = await verifyIdToken(auth.slice(7), projectId);
  } catch (err) {
    throw new HttpError(401, `token: ${err instanceof Error ? err.message : 'invalid'}`);
  }

  let sa: ServiceAccount;
  try {
    sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount;
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON (was the whole file saved?)');
  }
  // The project id is not secret: logging it shows at once which key was saved.
  if (sa.project_id !== projectId) {
    throw new Error(`service account is for project "${String(sa.project_id)}", not "${projectId}"`);
  }
  const token = await accessToken(sa);
  const db = new Firestore(projectId, token);

  // Same as the Firestore rules: only an active colaborador counts.
  const me = await db.get(`colaboradores/${uid}`);
  if (!me || me['activo'] !== true) throw new HttpError(403, 'not an active colaborador');
  return { uid, role: roleOf(me['tipo_colaborador']), db, token };
}

async function notify(request: Request, env: Env): Promise<{ sent: number; mailed: number }> {
  const body = await readJson(request);
  const collection = String(body['collection'] ?? '');
  const id = String(body['id'] ?? '');
  if (!COLLECTIONS.has(collection) || !ID.test(id)) throw new HttpError(400, 'bad event');
  const { uid, role, db, token } = await caller(request, env);
  const projectId = env.FIREBASE_PROJECT_ID;
  const me = { uid, role };

  const path =
    collection === BANK_ACCOUNT
      ? `colaboradores/${id}/privado/pago`
      : collection === PASSWORD_CHANGED
        ? `colaboradores/${id}`
        : `${collection}/${id}`; // NEW_EMPLOYEE is colaboradores itself
  const [data, flags] = await Promise.all([db.get(path), db.get('config/featureFlags')]);
  const push = pushFor(collection, id, data, me, (flags ?? {}) as Flags);
  if (!push) return { sent: 0, mailed: 0 };

  // Only the first call for this change sends anything (the page may retry, or someone may call twice).
  const first = await db.createOnce('push_log', push.key.replace(/[^A-Za-z0-9_-]/g, '_'), {
    por: uid,
    tag: push.message.tag,
  });
  if (!first) return { sent: 0, mailed: 0 };

  const people = await db.activePeople();
  const targets = new Set(people.filter((p) => matches(push.to, p.uid, roleOf(p.tipo))).map((p) => p.uid));
  const tokens = (await db.allTokens()).filter((t) => targets.has(t.uid));
  if (tokens.length > MAX_SENDS) console.warn(`[notify] ${tokens.length} browsers, sending to the first ${MAX_SENDS}`);

  let sent = 0;
  for (const t of tokens.slice(0, MAX_SENDS)) {
    const result = await sendPush(projectId, token, t.token, { ...push.message });
    if (result === 'sent') sent++;
    if (result === 'dead') await db.delete(t.path);
  }
  console.log(`[notify] "${push.message.title}" to ${targets.size} people: ${sent}/${tokens.length} browsers`);

  const mailed = await mailPeople(env, push, people.filter((p) => targets.has(p.uid)).map((p) => p.correo));
  return { sent, mailed };
}

// Never throws: a failed e-mail must not undo the push. No retry; the error stays in the Worker logs.
async function mailPeople(env: Env, push: Push, addresses: unknown[]): Promise<number> {
  if (!push.email || !env.RESEND_API_KEY || !env.MAIL_FROM) return 0;
  const to = [...new Set(addresses.filter(validEmail).map((a) => a.trim().toLowerCase()))];
  if (!to.length) return 0;
  try {
    const mailed = await sendMails(
      env.RESEND_API_KEY,
      push.key,
      to.map((address) => mailFor(push, address, env.MAIL_FROM as string, env.APP_URL)),
    );
    console.log(`[notify] "${push.message.title}" e-mailed to ${mailed} people`);
    return mailed;
  } catch (err) {
    console.error('[notify] e-mail failed:', err instanceof Error ? err.message : err);
    return 0;
  }
}

function matches(to: Audience, uid: string, role: Role): boolean {
  if ('uid' in to) return to.uid === uid;
  if ('panel' in to) return isPanel(role);
  if ('jefatura' in to) return role === 'admin';
  return role === 'regular';
}

// ---------- Report attachments (Backblaze B2) ----------

function b2(env: Env) {
  if (!env.B2_ENDPOINT || !env.B2_BUCKET || !env.B2_KEY_ID || !env.B2_APPLICATION_KEY) {
    throw new HttpError(501, 'Backblaze B2 is not configured');
  }
  const host = env.B2_ENDPOINT.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const region = /^s3\.([a-z0-9-]+)\.backblazeb2\.com$/.exec(host)?.[1];
  if (!region) throw new Error(`B2_ENDPOINT "${host}" is not like s3.<region>.backblazeb2.com`);
  return { host, region, bucket: env.B2_BUCKET, accessKeyId: env.B2_KEY_ID, secretAccessKey: env.B2_APPLICATION_KEY };
}

// A 5-minute URL to upload one file. Its size and type are part of the signature, so Backblaze itself
// rejects a different size or type. Only while the "reportes" section is on.
async function uploadUrl(request: Request, env: Env): Promise<{ path: string; url: string; contentType: string }> {
  const body = await readJson(request);
  const check = checkUpload(body['name'], body['size']);
  if (!check.ok) throw new HttpError(400, check.error);
  const store = b2(env);
  const { uid, db } = await caller(request, env);
  const flags = ((await db.get('config/featureFlags')) ?? {}) as Flags;
  if (flags.reportes !== true) throw new HttpError(403, 'reports are off');
  const path = reportPath(uid, crypto.randomUUID(), check.name);
  const url = await presign({
    method: 'PUT',
    ...store,
    path: `/${store.bucket}/${path}`,
    expiresSeconds: URL_SECONDS,
    now: new Date(),
    headers: { 'content-type': check.contentType, 'content-length': String(body['size']) },
  });
  return { path, url, contentType: check.contentType };
}

// A 5-minute URL to download one file: its owner or the panel. Always as a download, never shown as a page.
async function openUrl(request: Request, env: Env): Promise<{ url: string }> {
  const body = await readJson(request);
  const path = body['path'];
  const owner = ownerOf(path);
  if (!owner) throw new HttpError(400, 'bad path');
  const store = b2(env);
  const { uid, role } = await caller(request, env);
  if (uid !== owner && !isPanel(role)) throw new HttpError(403, 'not yours');
  const name = downloadName(path as string);
  const url = await presign({
    method: 'GET',
    ...store,
    path: `/${store.bucket}/${path as string}`,
    expiresSeconds: URL_SECONDS,
    now: new Date(),
    query: {
      'response-content-disposition': `attachment; filename="${name}"`,
      'response-content-type': contentTypeOf(name),
    },
  });
  return { url };
}

// ---------- Firebase Authentication settings ----------

// Called by the jefatura's page with the seeds: applies the settings the code needs (auth-config.ts).
async function setup(request: Request, env: Env): Promise<{ passwordPolicy: 'ok' | 'updated' }> {
  const { role, token } = await caller(request, env);
  if (role !== 'admin') throw new HttpError(403, 'jefatura only');
  return { passwordPolicy: await ensurePasswordPolicy(env.FIREBASE_PROJECT_ID, token) };
}

const ROUTES: Record<string, (request: Request, env: Env) => Promise<unknown>> = {
  '/notify': notify,
  '/setup': setup,
  '/files/upload': uploadUrl,
  '/files/open': openUrl,
};
