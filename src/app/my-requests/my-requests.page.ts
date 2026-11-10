import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent, ToastController } from '@ionic/angular';

import type { Worker } from '../services/current-worker';
import { RequestsStore } from '../services/requests-store';

import { localIsoDate } from '../admin-dashboard/admin-dates';
import { localDateTime } from '../notices/notice-utils';
import type { CancelResult } from '../services/vacation-balance';
import { canCancel } from '../services/vacation-balance';

import type { RequestKind } from './my-requests-utils';
import { defaultMonth, inMonth, monthOptions, overtimeRows, vacationRows } from './my-requests-utils';

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
  private readonly toast = inject(ToastController);

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
  private readonly kindRows = computed(() => (this.kind() === 'vacaciones' ? this.vacations() : this.overtime()));

  // Month filter, so a long history does not mean scrolling forever. '' = the default month.
  readonly months = computed(() => monthOptions(this.kindRows()));
  private readonly pickedMonth = signal('');
  readonly month = computed(() => this.pickedMonth() || defaultMonth(this.months(), localIsoDate(new Date())));
  private readonly now = signal(localDateTime(new Date()));
  readonly rows = computed(() =>
    inMonth(this.kindRows(), this.month()).map((r) => ({
      ...r,
      cancellable: canCancel(r.status, r.start, this.now()) === 'si',
      confirmText: confirmText(r.status, r.returnDays, this.kind()),
    })),
  );

  constructor() {
    void this.load();
  }

  setKind(kind: RequestKind): void {
    this.kind.set(kind);
    this.pickedMonth.set('');
    this.confirmCancelId.set(null);
  }

  // Cancelling asks first, inside the card, to avoid a mistaken tap.
  readonly confirmCancelId = signal<string | null>(null);
  readonly cancelling = signal(false);

  askCancel(id: string): void {
    this.now.set(localDateTime(new Date()));
    this.confirmCancelId.set(id);
  }

  keepRequest(): void {
    this.confirmCancelId.set(null);
  }

  async cancelRequest(id: string): Promise<void> {
    if (this.cancelling()) return;
    this.cancelling.set(true);
    let message: string;
    try {
      message = cancelMessage(await this.store.cancelRequest(this.kind(), id));
    } catch (err) {
      console.error('[MyRequests] Could not cancel the request:', err);
      message = 'No se pudo cancelar. Revise la conexión e intente de nuevo.';
    } finally {
      this.cancelling.set(false);
      this.confirmCancelId.set(null);
    }
    const toast = await this.toast.create({ message, duration: 4000, position: 'bottom' });
    await toast.present();
  }

  // Ionic keeps the page alive; refresh "now" on every visit so started requests stop offering cancel.
  ionViewWillEnter(): void {
    this.now.set(localDateTime(new Date()));
  }

  setMonth(event: Event): void {
    this.pickedMonth.set((event.target as HTMLSelectElement).value);
  }

  private async load(): Promise<void> {
    this.worker.set(await this.store.currentWorker());
    this.loading.set(false);
  }
}

function confirmText(status: string, returnDays: number, kind: RequestKind): string {
  if (status !== 'aprobada') return '¿Seguro que quiere cancelar esta solicitud?';
  const back =
    kind === 'vacaciones' && returnDays
      ? `Se le ${returnDays === 1 ? 'devuelve 1 día' : `devuelven ${returnDays} días`} de vacaciones y se le avisa a la administración.`
      : 'Se le avisa a la administración.';
  return `Esta solicitud ya está aprobada. ${back} ¿Seguro que quiere cancelarla?`;
}

function cancelMessage(result: CancelResult): string {
  if (result.kind === 'ya-empezo') return 'No se puede cancelar porque ya empezó. Si necesita un cambio, hable con RH.';
  if (result.kind !== 'cancelada') return 'No se pudo cancelar: la administración ya la había decidido.';
  if (!result.wasApproved) return 'Solicitud cancelada.';
  const back = result.returnedDays
    ? ` Se le ${result.returnedDays === 1 ? 'devolvió 1 día' : `devolvieron ${result.returnedDays} días`}.`
    : '';
  return `Solicitud cancelada y la administración ya fue avisada.${back}`;
}
