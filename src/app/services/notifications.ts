import { Injectable, Injector, inject, signal } from '@angular/core';

import type { BrowserNotice } from './notification-events';
import { PushNotificationService } from './push-notification.service';

export type NotifyState = 'off' | 'on' | 'denied' | 'unsupported';

export interface NotificationCard extends BrowserNotice {
  key: number;
  action: string;
}

const CARD_MS = 7000;
const MAX_CARDS = 3;
// Shown inside Windows/Android notifications (Chrome and Edge; other browsers ignore it).
const BANNER = '/assets/notifications/banner.png';

// Browser notifications for ELVA Gestión.
// - While the page is open, the store calls show() when Firestore brings a new request, a decision or a notice.
//   If the person is looking at the page, it shows our own card (NotificationCardsComponent); otherwise,
//   the system notification (its look is decided by Windows/Android, we can only add the image and a button).
// - When this browser is registered for push (FCM token), the Cloud Function can also notify with the page closed.
//   Until that function is deployed (needs the Blaze plan), only the first part works.
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly injector = inject(Injector);
  private pushUid = '';
  private nextKey = 1;

  readonly state = signal<NotifyState>(initialState());
  readonly cards = signal<NotificationCard[]>([]);

  // Must run from a click: browsers only show the permission prompt after a user gesture.
  async enable(uid: string): Promise<NotifyState> {
    if (!supported()) return this.setState('unsupported');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return this.setState(permission === 'denied' ? 'denied' : 'off');
    this.state.set('on');
    await this.registerPush(uid);
    return 'on';
  }

  // On sign-in: if the person already allowed notifications, refresh the push token quietly.
  async resume(uid: string): Promise<void> {
    this.state.set(initialState());
    if (this.state() === 'on') await this.registerPush(uid);
  }

  // On logout, so this browser stops getting push for that person.
  async disable(): Promise<void> {
    if (!this.pushUid) return;
    try {
      await this.injector.get(PushNotificationService).disable(this.pushUid);
    } catch (err) {
      console.warn('[Notifications] Could not remove the push token:', err);
    }
    this.pushUid = '';
  }

  async show(notice: BrowserNotice): Promise<void> {
    // The card needs no permission: it is part of the page.
    if (document.visibilityState === 'visible') {
      this.addCard(notice);
      return;
    }
    if (!supported() || Notification.permission !== 'granted') return;
    // Image and buttons only work through the service worker, which also opens the right page on click.
    const options: NotificationOptions & { image: string; actions: { action: string; title: string }[] } = {
      body: notice.body,
      tag: notice.tag,
      icon: '/assets/icon/favicon.png',
      image: BANNER,
      actions: [{ action: 'open', title: actionLabel(notice.url) }],
      data: { url: notice.url },
    };
    try {
      const registration = await this.worker();
      if (registration) {
        await registration.showNotification(notice.title, options);
        return;
      }
      const shown = new Notification(notice.title, { body: notice.body, tag: notice.tag, icon: options.icon });
      shown.onclick = () => {
        window.focus();
        window.location.assign(notice.url);
      };
    } catch (err) {
      console.warn('[Notifications] Could not show a notification:', err);
    }
  }

  dismiss(key: number): void {
    this.cards.update((list) => list.filter((c) => c.key !== key));
  }

  private addCard(notice: BrowserNotice): void {
    const card: NotificationCard = { ...notice, key: this.nextKey++, action: actionLabel(notice.url) };
    // Newest on top; the same request or notice replaces its older card.
    this.cards.update((list) => [card, ...list.filter((c) => c.tag !== notice.tag)].slice(0, MAX_CARDS));
    setTimeout(() => this.dismiss(card.key), CARD_MS);
  }

  // The push service worker, registered here too when push is not set up, so the image and button still work.
  private async worker(): Promise<ServiceWorkerRegistration | undefined> {
    if (!('serviceWorker' in navigator)) return undefined;
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
    await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    return navigator.serviceWorker.ready;
  }

  // Without push (no VAPID key, blocked by the browser, or offline) notifications still work with the page open.
  private async registerPush(uid: string): Promise<void> {
    try {
      const result = await this.injector.get(PushNotificationService).enable(uid);
      if (result === 'enabled') this.pushUid = uid;
    } catch (err) {
      console.warn('[Notifications] Push not registered; notifications only while the page is open.', err);
    }
  }

  private setState(state: NotifyState): NotifyState {
    this.state.set(state);
    return state;
  }
}

export function actionLabel(url: string): string {
  return url === '/tabs/avisos' ? 'Ver aviso' : 'Ver solicitud';
}

// Toast text after the person taps "Activar notificaciones".
export function notifyMessage(state: NotifyState): string {
  if (state === 'on') return 'Notificaciones activadas.';
  if (state === 'denied')
    return 'El navegador tiene las notificaciones bloqueadas. Actívelas desde el candado de la barra de direcciones.';
  if (state === 'unsupported') return 'Este navegador no permite notificaciones.';
  return 'No se activaron las notificaciones.';
}

function supported(): boolean {
  return typeof Notification !== 'undefined';
}

function initialState(): NotifyState {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'on';
  return Notification.permission === 'denied' ? 'denied' : 'off';
}
