import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';

import type { Worker } from '../services/current-worker';
import { RequestsStore } from '../services/requests-store';

import type { RequestKind } from './my-requests-utils';
import { overtimeRows, vacationRows } from './my-requests-utils';

// A worker's own vacation and overtime requests, with the admin's decision.
// Only the owner's requests are listed here (the Firestore rules must enforce the same).
@Component({
  selector: 'app-my-requests',
  templateUrl: 'my-requests.page.html',
  styleUrls: ['my-requests.page.scss'],
  imports: [IonContent, RouterLink],
})
export class MyRequestsPage {
  private readonly store = inject(RequestsStore);

  readonly worker = signal<Worker | null>(null);
  readonly loading = signal(true);
  readonly kind = signal<RequestKind>('vacaciones');

  readonly vacations = computed(() => {
    const w = this.worker();
    return w ? vacationRows(this.store.vacations(), w.uid) : [];
  });
  readonly overtime = computed(() => {
    const w = this.worker();
    return w ? overtimeRows(this.store.overtime(), w.uid) : [];
  });
  readonly rows = computed(() => (this.kind() === 'vacaciones' ? this.vacations() : this.overtime()));

  constructor() {
    void this.load();
  }

  setKind(kind: RequestKind): void {
    this.kind.set(kind);
  }

  private async load(): Promise<void> {
    const worker = (await this.store.currentWorker()) ?? { uid: 'local', name: 'Vos' };
    this.store.addExamplesFor(worker);
    this.worker.set(worker);
    this.loading.set(false);
  }
}
