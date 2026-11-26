// Talking to Google from the Worker with nothing but fetch and Web Crypto (no Firebase Admin SDK, which
// does not run on Workers): check Firebase ID tokens, get an OAuth token for the service account,
// and read/write Firestore through its REST API.

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

type Json = Record<string, unknown>;

// ---------- Firebase ID tokens (who is calling) ----------

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwks: { keys: Map<string, CryptoKey>; until: number } | undefined;

// Returns the uid when the token was signed by Firebase for this project and is still valid.
export async function verifyIdToken(token: string, projectId: string, now = Date.now()): Promise<string> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('bad token');
  const header = decodeJson(parts[0]);
  const claims = decodeJson(parts[1]);
  if (header['alg'] !== 'RS256' || typeof header['kid'] !== 'string') throw new Error('bad token');
  const key = (await signingKeys(now)).get(header['kid']);
  if (!key) throw new Error('unknown key');
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64UrlBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!ok) throw new Error('bad signature');
  return checkClaims(claims, projectId, now);
}

// The checks Firebase documents for ID tokens. Separate so it can be tested without real signatures.
export function checkClaims(claims: Json, projectId: string, now: number): string {
  const seconds = Math.floor(now / 1000);
  const exp = Number(claims['exp']);
  const iat = Number(claims['iat']);
  const authTime = Number(claims['auth_time']);
  const sub = claims['sub'];
  if (claims['aud'] !== projectId) throw new Error('wrong audience');
  if (claims['iss'] !== `https://securetoken.google.com/${projectId}`) throw new Error('wrong issuer');
  if (!(exp > seconds)) throw new Error('expired');
  if (!(iat <= seconds + 60) || !(authTime <= seconds + 60)) throw new Error('issued in the future');
  if (typeof sub !== 'string' || sub.length === 0 || sub.length > 128) throw new Error('no subject');
  return sub;
}

async function signingKeys(now: number): Promise<Map<string, CryptoKey>> {
  if (jwks && jwks.until > now) return jwks.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  const body = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys) {
    keys.set(
      jwk.kid,
      await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']),
    );
  }
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  jwks = { keys, until: now + maxAge * 1000 };
  return keys;
}

// ---------- Service account (what the Worker is allowed to do) ----------

// cloud-platform: the Authentication settings (password policy and e-mail link, auth-config.ts); the same
// scope the Firebase Admin SDK uses. What the token can really do is still limited by the service account's role.
const SCOPES = [
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/firebase.messaging',
  'https://www.googleapis.com/auth/cloud-platform',
].join(' ');
let access: { token: string; until: number; email: string } | undefined;

// Kept for about an hour, so most calls skip the RSA signature (the free plan has little CPU time per call).
export async function accessToken(sa: ServiceAccount, now = Date.now()): Promise<string> {
  if (access && access.email === sa.client_email && access.until > now) return access.token;
  const iat = Math.floor(now / 1000);
  const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const claims = base64UrlJson({
    iss: sa.client_email,
    scope: SCOPES,
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
  });
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemBytes(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${base64Url(new Uint8Array(signature))}`,
    }),
  });
  if (!res.ok) throw new Error(`oauth ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  access = { token: body.access_token, until: now + (body.expires_in - 300) * 1000, email: sa.client_email };
  return body.access_token;
}

// ---------- Firestore REST ----------

export class Firestore {
  private readonly base: string;

  constructor(
    private readonly projectId: string,
    private readonly token: string,
  ) {
    this.base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  }

  // The document as plain values, or null if it does not exist.
  async get(path: string): Promise<Json | null> {
    const res = await fetch(`${this.base}/${path}`, { headers: this.headers() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`firestore get ${res.status}`);
    return fromFields(((await res.json()) as { fields?: Json }).fields ?? {});
  }

  // Creates the document only if it does not exist yet. Returns false if it was already there.
  async createOnce(collection: string, id: string, data: Record<string, string>): Promise<boolean> {
    const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, { stringValue: v }]));
    const res = await fetch(`${this.base}/${collection}?documentId=${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ fields }),
    });
    if (res.status === 409) return false;
    if (!res.ok) throw new Error(`firestore create ${res.status}`);
    return true;
  }

  async delete(path: string): Promise<void> {
    await fetch(`${this.base}/${path}`, { method: 'DELETE', headers: this.headers() });
  }

  // Active colaboradores (id and tipo). One request for everyone: there are only a few dozen people.
  async activePeople(): Promise<{ uid: string; tipo: unknown; correo: unknown }[]> {
    const rows = await this.query({
      from: [{ collectionId: 'colaboradores' }],
      where: { fieldFilter: { field: { fieldPath: 'activo' }, op: 'EQUAL', value: { booleanValue: true } } },
    });
    return rows.map((r) => ({ uid: r.id, tipo: r.data['tipo_colaborador'], correo: r.data['correo'] }));
  }

  // Every push token of every person (users/{uid}/fcmTokens/{token}), in one request.
  async allTokens(): Promise<{ uid: string; token: string; path: string }[]> {
    const rows = await this.query({ from: [{ collectionId: 'fcmTokens', allDescendants: true }] });
    return rows
      .map((r) => {
        const m = /\/documents\/(users\/([^/]+)\/fcmTokens\/[^/]+)$/.exec(r.name);
        return m ? { uid: decodeURIComponent(m[2]), token: r.id, path: m[1] } : null;
      })
      .filter((x): x is { uid: string; token: string; path: string } => x !== null);
  }

  private async query(structuredQuery: Json): Promise<{ id: string; name: string; data: Json }[]> {
    const res = await fetch(`${this.base}:runQuery`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ structuredQuery }),
    });
    if (!res.ok) throw new Error(`firestore query ${res.status}`);
    const rows = (await res.json()) as { document?: { name: string; fields?: Json } }[];
    return rows
      .filter((r) => r.document)
      .map((r) => {
        const name = r.document!.name;
        return {
          name,
          id: decodeURIComponent(name.split('/').pop() ?? ''),
          data: fromFields(r.document!.fields ?? {}),
        };
      });
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' };
  }
}

// Firestore REST values ({ stringValue: 'x' }) to plain values. Timestamps stay as ISO strings.
export function fromFields(fields: Json): Json {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromValue(v as Json)]));
}

function fromValue(v: Json): unknown {
  if ('stringValue' in v) return v['stringValue'];
  if ('booleanValue' in v) return v['booleanValue'];
  if ('integerValue' in v) return Number(v['integerValue']);
  if ('doubleValue' in v) return Number(v['doubleValue']);
  if ('timestampValue' in v) return v['timestampValue'];
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return fromFields(((v['mapValue'] as Json)['fields'] ?? {}) as Json);
  if ('arrayValue' in v) return (((v['arrayValue'] as Json)['values'] ?? []) as Json[]).map(fromValue);
  return undefined;
}

// ---------- FCM HTTP v1 ----------

export type SendResult = 'sent' | 'dead' | 'failed';

// Data-only message: the app's service worker shows it (same tag as the in-page notification).
export async function sendPush(
  projectId: string,
  token: string,
  deviceToken: string,
  data: Record<string, string>,
): Promise<SendResult> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message: { token: deviceToken, data, webpush: { headers: { Urgency: 'high' } } } }),
  });
  if (res.ok) return 'sent';
  // The browser removed the subscription, or the token is not valid: delete it.
  if (res.status === 404) return 'dead';
  if (res.status === 400) {
    const detail = await res.text();
    if (detail.includes('registration token') || detail.includes('UNREGISTERED')) return 'dead';
  }
  return 'failed';
}

// ---------- Encoding ----------

function decodeJson(part: string): Json {
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(part))) as Json;
}

function base64UrlBytes(value: string): Uint8Array {
  const b64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function base64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlJson(value: Json): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemBytes(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
