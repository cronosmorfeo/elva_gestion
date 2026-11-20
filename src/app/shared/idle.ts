// Closes the session after a while without use, so a page left open is not there for anyone who sits down.
// The minutes live in Firestore (config/seguridad.minutosInactividad) and can be changed in the Firebase console.
export const IDLE_DEFAULT_MINUTES = 30;
export const IDLE_MIN_MINUTES = 5;
export const IDLE_MAX_MINUTES = 240;
// How long before closing the page asks "¿Sigue ahí?".
export const IDLE_WARNING_SECONDS = 60;

// Saved in localStorage so every open tab shares the same last activity.
export const IDLE_STORAGE_KEY = 'elva.ultimaActividad';

export interface StoredActivity {
  uid: string;
  at: number; // ms since epoch
}

export type IdleState = { kind: 'activo' } | { kind: 'aviso'; seconds: number } | { kind: 'cerrar' };

// Only a whole number of minutes between the limits counts; anything else (0, text, 9999) uses the default,
// so a typo in the console cannot turn the protection off.
export function toIdleMinutes(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= IDLE_MIN_MINUTES && value <= IDLE_MAX_MINUTES
    ? value
    : IDLE_DEFAULT_MINUTES;
}

export function parseStoredActivity(raw: string | null): StoredActivity | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredActivity>;
    return typeof value.uid === 'string' && typeof value.at === 'number' && Number.isFinite(value.at)
      ? { uid: value.uid, at: value.at }
      : null;
  } catch {
    return null;
  }
}

// The last time this account was used: the latest of what any tab saved and the sign-in itself.
// A session that was left open and comes back after the time is up is closed right away;
// a fresh sign-in always starts the count again.
export function lastActivity(stored: StoredActivity | null, uid: string, signedInAt: number): number {
  const saved = stored?.uid === uid ? stored.at : 0;
  return Math.max(saved, Number.isFinite(signedInAt) ? signedInAt : 0);
}

export function idleState(last: number, now: number, minutes: number): IdleState {
  const left = last + minutes * 60_000 - now;
  if (left <= 0) return { kind: 'cerrar' };
  if (left <= IDLE_WARNING_SECONDS * 1000) return { kind: 'aviso', seconds: Math.ceil(left / 1000) };
  return { kind: 'activo' };
}
