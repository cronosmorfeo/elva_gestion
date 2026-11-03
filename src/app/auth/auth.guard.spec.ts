import type { User } from 'firebase/auth';

import { isSignedIn } from './auth.guard';

describe('isSignedIn', () => {
  it('accepts only a non-anonymous user', () => {
    expect(isSignedIn(null)).toBe(false);
    expect(isSignedIn({ isAnonymous: true } as User)).toBe(false);
    expect(isSignedIn({ isAnonymous: false } as User)).toBe(true);
  });
});
