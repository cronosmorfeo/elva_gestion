import { afterEach, describe, expect, it, vi } from 'vitest';

import { accessToken, checkClaims, fromFields, verifyIdToken } from './google';
import { allowedOrigin } from './index';

const NOW = Date.UTC(2026, 10, 23, 18, 0, 0);
const SECONDS = NOW / 1000;

function b64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let s = '';
  for (const b of raw) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function keyPair() {
  return (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
}

async function signedToken(privateKey: CryptoKey, kid: string, claims: Record<string, unknown>): Promise<string> {
  const head = b64url(JSON.stringify({ alg: 'RS256', kid }));
  const body = b64url(JSON.stringify(claims));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

const goodClaims = {
  aud: 'elva-gestion',
  iss: 'https://securetoken.google.com/elva-gestion',
  sub: 'uid-ana',
  iat: SECONDS - 60,
  auth_time: SECONDS - 600,
  exp: SECONDS + 3000,
};

afterEach(() => vi.unstubAllGlobals());

describe('Firebase ID tokens', () => {
  it('accepts a token signed by a Google key for this project, rejects anything else', async () => {
    const google = await keyPair();
    const attacker = await keyPair();
    const jwk = { ...(await crypto.subtle.exportKey('jwk', google.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'max-age=60' } })),
    );

    expect(await verifyIdToken(await signedToken(google.privateKey, 'k1', goodClaims), 'elva-gestion', NOW)).toBe(
      'uid-ana',
    );
    // Same claims, signed with another key that claims to be k1.
    await expect(
      verifyIdToken(await signedToken(attacker.privateKey, 'k1', goodClaims), 'elva-gestion', NOW),
    ).rejects.toThrow('bad signature');
    await expect(
      verifyIdToken(await signedToken(google.privateKey, 'k9', goodClaims), 'elva-gestion', NOW),
    ).rejects.toThrow('unknown key');
    await expect(
      verifyIdToken(await signedToken(google.privateKey, 'k1', goodClaims), 'otro-proyecto', NOW),
    ).rejects.toThrow('wrong audience');
    await expect(verifyIdToken('not.a.token', 'elva-gestion', NOW)).rejects.toThrow();
  });

  it('checks audience, issuer, dates and subject', () => {
    expect(checkClaims(goodClaims, 'elva-gestion', NOW)).toBe('uid-ana');
    expect(() => checkClaims({ ...goodClaims, exp: SECONDS - 1 }, 'elva-gestion', NOW)).toThrow('expired');
    expect(() => checkClaims({ ...goodClaims, iss: 'https://evil' }, 'elva-gestion', NOW)).toThrow('wrong issuer');
    expect(() => checkClaims({ ...goodClaims, iat: SECONDS + 3600 }, 'elva-gestion', NOW)).toThrow('future');
    expect(() => checkClaims({ ...goodClaims, sub: '' }, 'elva-gestion', NOW)).toThrow('no subject');
  });
});

describe('service account', () => {
  it('signs a valid assertion and reuses the token until it expires', async () => {
    const pair = await keyPair();
    const pkcs8 = new Uint8Array((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer);
    let b64 = '';
    for (const b of pkcs8) b64 += String.fromCharCode(b);
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(b64)}\n-----END PRIVATE KEY-----\n`;
    const sa = {
      project_id: 'elva-gestion',
      client_email: 'push@elva-gestion.iam.gserviceaccount.com',
      private_key: pem,
    };

    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const assertion = new URLSearchParams(init.body as string).get('assertion')!;
      const [h, c, s] = assertion.split('.');
      const sig = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
      const ok = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        pair.publicKey,
        sig,
        new TextEncoder().encode(`${h}.${c}`),
      );
      const claims = JSON.parse(atob(c.replace(/-/g, '+').replace(/_/g, '/')));
      expect(ok).toBe(true);
      expect(claims.iss).toBe(sa.client_email);
      expect(claims.scope).toContain('firebase.messaging');
      return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await accessToken(sa, NOW)).toBe('ya29.test');
    expect(await accessToken(sa, NOW + 60_000)).toBe('ya29.test');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('helpers', () => {
  it('reads Firestore REST values', () => {
    expect(
      fromFields({
        nombre: { stringValue: 'Ana' },
        activo: { booleanValue: true },
        dias: { integerValue: '12' },
        saldo: { doubleValue: 1.5 },
        decision: { mapValue: { fields: { motivo: { stringValue: 'x' } } } },
        vacio: { nullValue: null },
      }),
    ).toEqual({ nombre: 'Ana', activo: true, dias: 12, saldo: 1.5, decision: { motivo: 'x' }, vacio: null });
  });

  it('only answers the page addresses in ALLOWED_ORIGINS', () => {
    const list = 'http://localhost:4200, https://elva-gestion.web.app';
    expect(allowedOrigin('http://localhost:4200', list)).toBe(true);
    expect(allowedOrigin('https://elva-gestion.web.app', list)).toBe(true);
    expect(allowedOrigin('https://evil.example', list)).toBe(false);
    expect(allowedOrigin('', list)).toBe(false);
  });
});
