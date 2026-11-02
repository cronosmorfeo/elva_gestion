import { Component, inject, signal } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonButton } from '@ionic/angular';
import { getAuth, signInAnonymously } from 'firebase/auth';

import type { PushResult } from '../services/push-notification.service';
import { PushNotificationService } from '../services/push-notification.service';

const STATUS_TEXT: Record<PushResult, string> = {
  enabled: 'Avisos activados',
  denied: 'Permiso rechazado. Activalo desde el candado de la barra de direcciones.',
  unsupported: 'Este navegador no soporta avisos.',
  blocked: 'Tu navegador bloquea los avisos (por ejemplo, Brave). Activalos en su configuración o usá Chrome.',
};

// TEMP: push test page with anonymous auth until the login is wired up.
@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonButton],
})
export class Tab2Page {
  private readonly push = inject(PushNotificationService);
  readonly status = signal('Avisos desactivados');
  readonly token = signal('');
  readonly lastMessage = signal('');

  constructor() {
    this.push.foregroundMessages$.subscribe((m) => {
      this.lastMessage.set(`${m.title}: ${m.body}`);
    });
  }

  async activate(): Promise<void> {
    try {
      this.status.set('Activando...');
      const { user } = await signInAnonymously(getAuth());
      const result = await this.push.enable(user.uid);
      this.status.set(STATUS_TEXT[result]);
      this.token.set(this.push.token ?? '');
    } catch (err) {
      console.error(err);
      this.status.set(
        err instanceof Error && err.message === 'push-timeout'
          ? 'No se pudo activar a tiempo. Revisá tu conexión e intentá de nuevo.'
          : 'No se pudieron activar los avisos. Intentá de nuevo.',
      );
    }
  }
}
