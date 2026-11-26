import { Injectable } from '@angular/core';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';

import { IDLE_DEFAULT_MINUTES } from '../shared/idle';

import type { FeatureFlag } from './feature-flags';
import { DEFAULT_FLAGS } from './feature-flags';
import { workerUrl } from './push-relay';

// Configuration documents the page needs, with their default values. Each Firebase project (the company's,
// each developer's) gets them the first time the jefatura opens the dashboard, or with "Actualizar
// colecciones". To add a setting, add it here: whoever pulls the code gets it too.
export interface Seed {
  collection: string;
  document: string;
  values: Readonly<Record<string, unknown>>;
}

export const SEEDS: readonly Seed[] = [
  { collection: 'config', document: 'featureFlags', values: { ...DEFAULT_FLAGS } },
  { collection: 'config', document: 'seguridad', values: { minutosInactividad: IDLE_DEFAULT_MINUTES } },
];

// Names shown in "Administrar sistema". Every flag needs one.
export const FLAG_LABELS: Readonly<Record<FeatureFlag, string>> = {
  vacaciones: 'Vacaciones',
  horasExtra: 'Horas extra',
  reportes: 'Reportes semanales',
  avisos: 'Avisos',
  pagos: 'Pagos y datos de pago',
};

export interface SeedResult {
  created: string[]; // documents that did not exist
  completed: string[]; // documents that existed but lacked a field, e.g. 'config/featureFlags (avisos)'
}

// Only the fields that are missing: what is already there (a flag someone turned on) is never overwritten.
export function missingFields(
  current: Readonly<Record<string, unknown>> | undefined,
  defaults: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const missing: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (!current || !(key in current)) missing[key] = value;
  }
  return missing;
}

export class NotJefaturaError extends Error {
  constructor() {
    super('Solo la jefatura puede administrar el sistema.');
  }
}

// "Administrar sistema": seeds and feature flags. Only the jefatura (an active account of type admin).
// The page hides the button from everyone else and every action checks the role again here, but the real
// protection is the Firestore rules: only admin may write in config/ (see docs/security.md).
@Injectable({ providedIn: 'root' })
export class SystemAdminService {
  async seed(): Promise<SeedResult> {
    await this.assertJefatura();
    const db = getFirestore();
    const result: SeedResult = { created: [], completed: [] };
    for (const s of SEEDS) {
      const ref = doc(db, s.collection, s.document);
      const snap = await getDoc(ref);
      const missing = missingFields(snap.data(), s.values);
      const keys = Object.keys(missing);
      if (keys.length === 0) continue;
      await setDoc(ref, missing, { merge: true });
      const path = `${s.collection}/${s.document}`;
      if (snap.exists()) result.completed.push(`${path} (${keys.join(', ')})`);
      else result.created.push(path);
    }
    return result;
  }

  // Firebase Authentication settings the code needs (the password policy), set by the Worker with the service
  // account, since the page cannot change them. Like the seeds, it runs when the jefatura opens the panel, so
  // every Firebase project gets them. 'unavailable' without a Worker or if it fails (details in the console).
  async applyAuthSettings(): Promise<'ok' | 'updated' | 'unavailable'> {
    const url = workerUrl();
    const user = getAuth().currentUser;
    if (!url || !user) return 'unavailable';
    try {
      const res = await fetch(`${url.replace(/\/+$/, '')}/setup`, {
        method: 'POST',
        headers: { authorization: `Bearer ${await user.getIdToken()}`, 'content-type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error(`Worker answered ${res.status}`);
      const body = (await res.json()) as { passwordPolicy?: unknown };
      return body.passwordPolicy === 'updated' ? 'updated' : 'ok';
    } catch (err) {
      console.warn('[SystemAdmin] Could not check the password policy:', err);
      return 'unavailable';
    }
  }

  async setFlag(flag: FeatureFlag, value: boolean): Promise<void> {
    if (!(flag in DEFAULT_FLAGS)) throw new Error(`Unknown flag: ${flag}`);
    await this.assertJefatura();
    await setDoc(doc(getFirestore(), 'config', 'featureFlags'), { [flag]: value }, { merge: true });
  }

  // Reads the role from Firestore each time instead of trusting what the page already has in memory.
  private async assertJefatura(): Promise<void> {
    const uid = getAuth().currentUser?.uid;
    if (!uid) throw new NotJefaturaError();
    const data = (await getDoc(doc(getFirestore(), 'colaboradores', uid))).data();
    const tipo = typeof data?.['tipo_colaborador'] === 'string' ? data['tipo_colaborador'].trim().toLowerCase() : '';
    if (tipo !== 'admin' || data?.['activo'] === false) throw new NotJefaturaError();
  }
}
