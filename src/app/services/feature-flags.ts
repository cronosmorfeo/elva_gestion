import { Injectable, signal } from '@angular/core';
import { getApps } from 'firebase/app';
import type { DocumentData } from 'firebase/firestore';
import { doc, getFirestore, onSnapshot } from 'firebase/firestore';

// Feature flags turn parts of the app on or off without changing the code.
// They live in Firestore at config/featureFlags (one boolean per flag) and are edited in the Firebase console.
// MVP for Costa Rica (Nov 2026): only vacations are on. A missing flag, a missing document or a read error
// uses these defaults, so a section that is off never shows up by mistake.
export interface FeatureFlags {
  vacaciones: boolean; // vacation requests; the only one on by default (the MVP)
  horasExtra: boolean; // overtime requests (worker pages and dashboard)
  reportes: boolean; // weekly reports
  avisos: boolean; // notices
  pagos: boolean; // pending payments and payment accounts (Mi perfil, Edit employee, account change requests)
}

export type FeatureFlag = keyof FeatureFlags;

export const DEFAULT_FLAGS: FeatureFlags = {
  vacaciones: true,
  horasExtra: false,
  reportes: false,
  avisos: false,
  pagos: false,
};

// Only booleans count; anything else keeps the default.
export function toFlags(data: DocumentData | undefined): FeatureFlags {
  const flags = { ...DEFAULT_FLAGS };
  for (const key of Object.keys(DEFAULT_FLAGS) as FeatureFlag[]) {
    const value: unknown = data?.[key];
    if (typeof value === 'boolean') flags[key] = value;
  }
  return flags;
}

@Injectable({ providedIn: 'root' })
export class FeatureFlagsService {
  readonly flags = signal<FeatureFlags>(DEFAULT_FLAGS);
  private loaded: Promise<void> | null = null;

  // Listens live from the first call (after sign-in). Resolves after the first read, so guards can wait for it.
  load(): Promise<void> {
    this.loaded ??= new Promise((resolve) => {
      if (getApps().length === 0) {
        resolve();
        return;
      }
      onSnapshot(
        doc(getFirestore(), 'config', 'featureFlags'),
        (snap) => {
          this.flags.set(toFlags(snap.data()));
          resolve();
        },
        (err) => {
          console.error('[FeatureFlags] Could not read config/featureFlags:', err);
          this.flags.set(DEFAULT_FLAGS);
          this.loaded = null; // try again on the next call
          resolve();
        },
      );
    });
    return this.loaded;
  }
}
