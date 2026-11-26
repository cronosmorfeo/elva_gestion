import {
  EmailAuthProvider,
  getAuth,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  updatePassword,
} from 'firebase/auth';

// Passwords: change your own, "¿Olvidó su contraseña?" and the first password of a new account.
// Firebase Authentication does the real work: it keeps the passwords and sends the e-mail with the link.
// Nobody but the person ever knows their password: Crear empleado uses a random one that nobody sees,
// and the person chooses theirs from the link Firebase sends to their e-mail.

// Same as the Firebase password policy the Worker sets (worker/src/auth-config.ts): NIST SP 800-63B rev. 4
// asks for at least 15 characters when the password is the only factor, and no "one uppercase, one number"
// rules. A short sentence is easier to remember than a mix of symbols.
export const MIN_PASSWORD = 15;

// Why the new password cannot be saved yet, or null when it can.
export function newPasswordProblem(next: string, repeat: string): string | null {
  if (next.length < MIN_PASSWORD) return `La contraseña nueva debe tener al menos ${MIN_PASSWORD} caracteres.`;
  if (next !== repeat) return 'Las contraseñas nuevas no coinciden.';
  return null;
}

// Same, when the current password is asked too (Cambiar contraseña).
export function passwordProblem(current: string, next: string, repeat: string): string | null {
  if (!current) return 'Escriba su contraseña actual.';
  const problem = newPasswordProblem(next, repeat);
  if (problem) return problem;
  if (next === current) return 'La contraseña nueva debe ser distinta de la actual.';
  return null;
}

// What to tell the person for a Firebase Authentication error. Never says whether an account exists.
export function passwordError(code: unknown): string {
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'La contraseña actual no es correcta.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espere unos minutos e intente de nuevo.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'Esa contraseña es muy débil. Use una más larga, con letras y números.';
    case 'auth/network-request-failed':
      return 'No hay conexión. Revise su internet e intente de nuevo.';
    default:
      return 'No se pudo cambiar la contraseña. Intente de nuevo.';
  }
}

// For the page the e-mail link opens: the text to show, or null when the link itself is no good (used or expired).
export function resetError(code: unknown): string | null {
  switch (code) {
    case 'auth/expired-action-code':
    case 'auth/invalid-action-code':
    case 'auth/user-disabled':
    case 'auth/user-not-found':
      return null;
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return `Esa contraseña no cumple las reglas: use al menos ${MIN_PASSWORD} caracteres.`;
    case 'auth/network-request-failed':
      return 'No hay conexión. Revise su internet e intente de nuevo.';
    default:
      return 'No se pudo guardar la contraseña. Intente de nuevo.';
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function looksLikeEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

// A long random password for a new account. Nobody sees it or keeps it: the person replaces it from the
// e-mail link, so not even whoever created the account can sign in as them.
export function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes));
}

// Checks the current password again (Firebase asks for a recent sign-in) and saves the new one.
// Throws the Firebase error; passwordError() turns it into text.
export async function changePassword(current: string, next: string): Promise<void> {
  const user = getAuth().currentUser;
  if (!user?.email) throw new Error('auth/no-user');
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
  await updatePassword(user, next);
}

// Firebase's e-mail with a link to choose a password, in Spanish. Used by Crear empleado (the first
// password) and by "¿Olvidó su contraseña?". Throws the Firebase error.
export async function sendPasswordLink(email: string): Promise<void> {
  const auth = getAuth();
  auth.languageCode = 'es';
  await sendPasswordResetEmail(auth, email.trim());
}

// "¿Olvidó su contraseña?": with e-mail enumeration protection on, Firebase answers the same whether the
// account exists or not, and so does the page. Only a bad address or too many tries are reported.
export async function sendPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordLink(email);
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (code === 'auth/invalid-email' || code === 'auth/too-many-requests' || code === 'auth/network-request-failed') {
      throw err;
    }
  }
}
