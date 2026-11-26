// Firebase Authentication settings the code needs, applied by the Worker so every Firebase project gets
// them without anyone clicking in the console (like the Firestore seeds). Called by the jefatura's page.
//
// Password policy, following NIST SP 800-63B rev. 4: at least 15 characters when the password is the only
// factor, long passwords allowed, and no composition rules (no "one uppercase, one number..."), which
// research shows people answer in predictable ways. New passwords must comply (enforced); existing ones keep
// working until their owner changes them (no forced upgrade at sign-in, so nobody gets locked out).
//
// Not here: where Firebase's e-mail links open. Firebase refuses to change it by API in projects without
// Identity Platform (EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED) and blocks editing the templates in the console too,
// so the links open Firebase's own page. The page's /tabs/restablecer is ready for when that is allowed.

export const MIN_PASSWORD_LENGTH = 15;
export const MAX_PASSWORD_LENGTH = 4096;

const CONFIG_URL = (projectId: string) => `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;

type Json = Record<string, unknown>;

export const PASSWORD_POLICY = {
  passwordPolicyEnforcementState: 'ENFORCE',
  forceUpgradeOnSignin: false,
  passwordPolicyVersions: [
    {
      customStrengthOptions: {
        minPasswordLength: MIN_PASSWORD_LENGTH,
        maxPasswordLength: MAX_PASSWORD_LENGTH,
        containsLowercaseCharacter: false,
        containsUppercaseCharacter: false,
        containsNumericCharacter: false,
        containsNonAlphanumericCharacter: false,
      },
    },
  ],
};

// True when the project already has this policy (missing booleans count as false, as Google omits them).
export function policyMatches(config: Json | null): boolean {
  const p = (config?.['passwordPolicyConfig'] ?? {}) as Json;
  if (p['passwordPolicyEnforcementState'] !== 'ENFORCE' || p['forceUpgradeOnSignin'] === true) return false;
  const versions = Array.isArray(p['passwordPolicyVersions']) ? (p['passwordPolicyVersions'] as Json[]) : [];
  const o = (versions[0]?.['customStrengthOptions'] ?? {}) as Json;
  return (
    o['minPasswordLength'] === MIN_PASSWORD_LENGTH &&
    o['maxPasswordLength'] === MAX_PASSWORD_LENGTH &&
    !o['containsLowercaseCharacter'] &&
    !o['containsUppercaseCharacter'] &&
    !o['containsNumericCharacter'] &&
    !o['containsNonAlphanumericCharacter']
  );
}

// Reads the project's Authentication settings and sets the password policy only if it is different.
export async function ensurePasswordPolicy(projectId: string, token: string): Promise<'ok' | 'updated'> {
  // No x-goog-user-project header: it needs an extra permission (serviceusage) the Firebase service account lacks.
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const current = await fetch(CONFIG_URL(projectId), { headers });
  if (!current.ok) throw new Error(`auth config read ${current.status} ${await googleReason(current)}`);
  if (policyMatches((await current.json()) as Json)) return 'ok';

  const res = await fetch(`${CONFIG_URL(projectId)}?updateMask=passwordPolicyConfig`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ passwordPolicyConfig: PASSWORD_POLICY }),
  });
  if (!res.ok) throw new Error(`auth config update ${res.status} ${await googleReason(res)}`);
  return 'updated';
}

// Google's reason for an error (it never contains the token), for the Worker logs only.
async function googleReason(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: unknown } };
    return String(body.error?.message ?? '').slice(0, 300);
  } catch {
    return '';
  }
}
