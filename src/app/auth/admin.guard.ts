import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';

import { isSignedIn } from './auth.guard';

// Values of colaboradores/{uid}.tipo_colaborador that may open the admin dashboard.
// TODO: confirm the final role names with the backend.
export const ADMIN_ROLES = ['admin', 'rh'];

export const isAdminRole = (tipo: unknown): boolean =>
  typeof tipo === 'string' && ADMIN_ROLES.includes(tipo.trim().toLowerCase());

// Hides the page in the app. Real protection must come from the Firestore rules.
export const adminGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = getAuth();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!isSignedIn(user)) return router.parseUrl('/tabs/login');

  try {
    const snap = await getDoc(doc(getFirestore(), 'colaboradores', user!.uid));
    const data = snap.data();
    if (data?.['activo'] === true && isAdminRole(data['tipo_colaborador'])) return true;
    return router.parseUrl('/tabs/inicio');
  } catch {
    return router.parseUrl('/tabs/login');
  }
};
