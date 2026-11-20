import { Injectable, signal } from '@angular/core';
import { getApps } from 'firebase/app';
import { doc, getFirestore, onSnapshot } from 'firebase/firestore';

import {
  IDLE_DEFAULT_MINUTES,
  IDLE_STORAGE_KEY,
  idleState,
  lastActivity,
  parseStoredActivity,
  toIdleMinutes,
} from '../shared/idle';

// Mouse, keyboard, touch and scrolling count as activity, in any open tab of the app.
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
// localStorage is written at most this often; the value in memory is always current.
const SAVE_EVERY_MS = 5_000;

@Injectable({ providedIn: 'root' })
export class IdleLogoutService {
  // Seconds left while the warning shows; null when it does not.
  readonly warningSeconds = signal<number | null>(null);

  private uid = '';
  private minutes = IDLE_DEFAULT_MINUTES;
  private last = 0;
  private savedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopConfig: (() => void) | null = null;
  private onTimeout: () => void = () => undefined;

  // While the warning shows, only "Sí, sigo aquí" keeps the session (or activity in another tab).
  private readonly onActivity = (): void => {
    if (this.warningSeconds() === null) this.touch(false);
  };
  private readonly onStorage = (event: StorageEvent): void => {
    if (event.key !== IDLE_STORAGE_KEY) return;
    const other = parseStoredActivity(event.newValue);
    if (other?.uid === this.uid && other.at > this.last) {
      this.last = other.at;
      this.check();
    }
  };
  // Browsers slow down timers in hidden tabs; check as soon as the tab is back.
  private readonly onVisible = (): void => this.check();

  // From sign-in until sign-out. signedInAt: when this account last signed in (Firebase user metadata).
  start(uid: string, signedInAt: number, onTimeout: () => void): void {
    this.stop(false);
    this.uid = uid;
    this.onTimeout = onTimeout;
    this.last = lastActivity(parseStoredActivity(readStorage()), uid, signedInAt);
    for (const name of ACTIVITY_EVENTS)
      document.addEventListener(name, this.onActivity, { capture: true, passive: true });
    window.addEventListener('storage', this.onStorage);
    document.addEventListener('visibilitychange', this.onVisible);
    this.timer = setInterval(() => this.check(), 1000);
    this.watchConfig();
    this.check();
  }

  // The "Sí, sigo aquí" button.
  stillHere(): void {
    this.touch(true);
  }

  // clear: forget the saved activity too (on sign-out), so the next sign-in starts fresh.
  stop(clear: boolean): void {
    for (const name of ACTIVITY_EVENTS) document.removeEventListener(name, this.onActivity, { capture: true });
    window.removeEventListener('storage', this.onStorage);
    document.removeEventListener('visibilitychange', this.onVisible);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stopConfig?.();
    this.stopConfig = null;
    this.warningSeconds.set(null);
    if (clear) writeStorage(null);
  }

  private touch(force: boolean): void {
    const now = Date.now();
    this.last = now;
    this.warningSeconds.set(null);
    if (force || now - this.savedAt >= SAVE_EVERY_MS) {
      this.savedAt = now;
      writeStorage(JSON.stringify({ uid: this.uid, at: now }));
    }
  }

  private check(): void {
    if (!this.timer) return;
    const state = idleState(this.last, Date.now(), this.minutes);
    if (state.kind === 'cerrar') {
      const timeout = this.onTimeout;
      this.stop(true);
      timeout();
      return;
    }
    this.warningSeconds.set(state.kind === 'aviso' ? state.seconds : null);
  }

  // Live, so a change in the console applies without reloading. Missing document or error: the default.
  private watchConfig(): void {
    this.minutes = IDLE_DEFAULT_MINUTES;
    if (getApps().length === 0) return;
    this.stopConfig = onSnapshot(
      doc(getFirestore(), 'config', 'seguridad'),
      (snap) => {
        this.minutes = toIdleMinutes(snap.data()?.['minutosInactividad']);
        this.check();
      },
      (err) => {
        console.error('[IdleLogout] Could not read config/seguridad:', err);
        this.minutes = IDLE_DEFAULT_MINUTES;
      },
    );
  }
}

// localStorage can be blocked (private mode, strict settings); then each tab counts on its own.
function readStorage(): string | null {
  try {
    return localStorage.getItem(IDLE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(IDLE_STORAGE_KEY);
    else localStorage.setItem(IDLE_STORAGE_KEY, value);
  } catch {
    // Nothing to do: the value in memory still works for this tab.
  }
}
