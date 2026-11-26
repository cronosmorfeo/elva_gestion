import { afterEach, describe, expect, it, vi } from 'vitest';

import { MIN_PASSWORD_LENGTH, PASSWORD_POLICY, ensurePasswordPolicy, policyMatches } from './auth-config';

afterEach(() => vi.unstubAllGlobals());

describe('password policy', () => {
  it('15 characters, no composition rules, existing passwords keep working', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(15);
    expect(PASSWORD_POLICY.forceUpgradeOnSignin).toBe(false);
    expect(policyMatches({ passwordPolicyConfig: PASSWORD_POLICY })).toBe(true);
    // Google leaves out booleans that are false.
    expect(
      policyMatches({
        passwordPolicyConfig: {
          passwordPolicyEnforcementState: 'ENFORCE',
          passwordPolicyVersions: [{ customStrengthOptions: { minPasswordLength: 15, maxPasswordLength: 4096 } }],
        },
      }),
    ).toBe(true);
    expect(policyMatches(null)).toBe(false);
    expect(policyMatches({ passwordPolicyConfig: { passwordPolicyEnforcementState: 'OFF' } })).toBe(false);
    expect(
      policyMatches({
        passwordPolicyConfig: {
          passwordPolicyEnforcementState: 'ENFORCE',
          passwordPolicyVersions: [{ customStrengthOptions: { minPasswordLength: 10, maxPasswordLength: 4096 } }],
        },
      }),
    ).toBe(false);
  });

  it('only writes when the project is different', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    let current: unknown = {};
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(current), { status: 200 });
    });
    expect(await ensurePasswordPolicy('demo', 't')).toBe('updated');
    expect(calls[1].init?.method).toBe('PATCH');
    expect(calls[1].url).toBe(
      'https://identitytoolkit.googleapis.com/admin/v2/projects/demo/config?updateMask=passwordPolicyConfig',
    );
    calls.length = 0;
    current = { passwordPolicyConfig: PASSWORD_POLICY };
    expect(await ensurePasswordPolicy('demo', 't')).toBe('ok');
    expect(calls).toHaveLength(1);
  });

  it('fails loudly if Google refuses', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('{"error":{"message":"Permission denied"}}', { status: 403 }),
    );
    await expect(ensurePasswordPolicy('demo', 't')).rejects.toThrow('auth config read 403 Permission denied');
  });
});
