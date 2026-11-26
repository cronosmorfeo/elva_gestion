import { getAuth } from 'firebase/auth';

import { environment } from '../../environments/environment';

// Push notifications with the page closed (see worker/README.md). After a change is saved, the page tells
// the push Worker which document changed; the Worker reads it from Firestore and decides who to notify.
// Without pushWorkerUrl in environment.ts this does nothing, and notifications still work with the page open.

export type ChangedCollection =
  | 'vacations_requests'
  | 'overtime_requests'
  | 'notices'
  | 'bank_change_requests'
  | 'pago' // colaboradores/{uid}/privado/pago; the id is the worker's uid
  | 'colaboradores' // a new employee (welcome e-mail); the id is their uid
  | 'contrasena'; // the person changed their own password (warning e-mail); the id is their uid

// Never throws and never blocks the page: a failed push must not look like a failed request.
export function reportChange(collection: ChangedCollection, id: string): void {
  const url = workerUrl();
  const user = getAuth().currentUser;
  if (!url || !user) return;
  void user
    .getIdToken()
    .then((token) => fetch(...relayRequest(url, token, collection, id)))
    .then((res) => {
      if (!res.ok) console.warn(`[PushRelay] The push Worker answered ${res.status}.`);
    })
    .catch((err: unknown) => console.warn('[PushRelay] Could not reach the push Worker:', err));
}

export function relayRequest(
  url: string,
  token: string,
  collection: ChangedCollection,
  id: string,
): [string, RequestInit] {
  return [
    `${url.replace(/\/+$/, '')}/notify`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ collection, id }),
      keepalive: true, // still sent if the person closes the tab right after
    },
  ];
}

// Address of the Worker (push and report files), or '' when this installation has none.
export function workerUrl(): string {
  const url = (environment as { pushWorkerUrl?: unknown }).pushWorkerUrl;
  return typeof url === 'string' && /^https?:\/\//.test(url) ? url : '';
}
