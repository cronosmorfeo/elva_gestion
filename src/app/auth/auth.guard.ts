import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import type { User } from 'firebase/auth';
import { getAuth } from 'firebase/auth';

// The anonymous user from the push test page does not count as signed in.
export const isSignedIn = (user: User | null): boolean => !!user && !user.isAnonymous;

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = getAuth();
  await auth.authStateReady();
  return isSignedIn(auth.currentUser) ? true : router.parseUrl('/tabs/login');
};
