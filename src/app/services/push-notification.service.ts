import { Injectable } from '@angular/core';
import type { FirebaseApp } from 'firebase/app';
import { getApp, getApps, initializeApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';
import { deleteDoc, doc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import type { Messaging } from 'firebase/messaging';
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { Subject } from 'rxjs';

import { environment } from '../../environments/environment';

export type PushResult = 'enabled' | 'denied' | 'unsupported' | 'blocked';

const TIMEOUT_MS = 15000;

export interface ForegroundMessage {
  title: string;
  body: string;
  url: string;
}

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private readonly app: FirebaseApp = getApps().length ? getApp() : initializeApp(environment.firebase);
  private readonly db: Firestore = getFirestore(this.app);
  private messaging?: Messaging;
  private currentToken?: string;

  readonly foregroundMessages$ = new Subject<ForegroundMessage>();

  // Must be called from a user gesture (browsers block the permission prompt otherwise).
  async enable(uid: string): Promise<PushResult> {
    if (!(await isSupported()) || !('serviceWorker' in navigator)) return 'unsupported';

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';

    const { apiKey, authDomain, projectId, messagingSenderId, appId } = environment.firebase;
    const config = new URLSearchParams({ apiKey, authDomain, projectId, messagingSenderId, appId });
    const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${config}`);
    this.messaging = getMessaging(this.app);

    let token: string;
    try {
      token = await withTimeout(
        getToken(this.messaging, {
          vapidKey: environment.firebaseVapidKey,
          serviceWorkerRegistration: registration,
        }),
      );
    } catch (err) {
      // Brave and some privacy settings disable the browser push service.
      if (err instanceof DOMException && err.name === 'AbortError') return 'blocked';
      throw err;
    }

    await withTimeout(
      setDoc(doc(this.db, 'users', uid, 'fcmTokens', token), {
        createdAt: serverTimestamp(),
        userAgent: navigator.userAgent.slice(0, 200),
      }),
    );
    this.currentToken = token;

    onMessage(this.messaging, (payload) => {
      const d = payload.data ?? {};
      this.foregroundMessages$.next({
        title: payload.notification?.title ?? d['title'] ?? 'ELVA Gestión',
        body: payload.notification?.body ?? d['body'] ?? '',
        url: d['url'] ?? '/',
      });
    });

    return 'enabled';
  }

  // For testing only.
  get token(): string | undefined {
    return this.currentToken;
  }

  // Also call on logout.
  async disable(uid: string): Promise<void> {
    if (!this.messaging || !this.currentToken) return;
    await deleteDoc(doc(this.db, 'users', uid, 'fcmTokens', this.currentToken));
    await deleteToken(this.messaging);
    this.currentToken = undefined;
  }
}

function withTimeout<T>(promise: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('push-timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
