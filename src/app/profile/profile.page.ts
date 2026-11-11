import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, ToastController } from '@ionic/angular';

import { formatShortDate, formatTime, localIsoDate } from '../admin-dashboard/admin-dates';
import { maskIban } from '../admin-dashboard/admin-requests';
import { MAX_BANK_NOTE, ibanText, maskCedula, updatedText } from '../services/bank-account';
import { RequestsStore } from '../services/requests-store';

import { longDay, seniority } from './profile-utils';

// The worker's own data, read only. Changes go through HR.
@Component({
  selector: 'app-profile',
  templateUrl: 'profile.page.html',
  imports: [IonContent],
})
export class ProfilePage {
  private readonly store = inject(RequestsStore);
  private readonly toast = inject(ToastController);

  readonly profile = this.store.myProfile;
  readonly balance = this.store.myBalance;
  readonly available = this.store.myAvailableDays;
  readonly pendingDays = this.store.myPendingVacationDays;
  readonly today = signal(localIsoDate(new Date()));
  readonly startText = computed(() => {
    const start = this.profile()?.startDate ?? '';
    return start ? longDay(start) : '—';
  });
  readonly seniorityText = computed(() => seniority(this.profile()?.startDate ?? '', this.today()));

  // Payment account: the same one the admins pay to. Read only; changes are asked to RH.
  readonly bankLoaded = this.store.myBankLoaded;
  readonly showIban = signal(false);
  readonly bank = computed(() => {
    const b = this.store.myBank();
    if (!b) return null;
    return {
      cedula: maskCedula(b.cedula) || '—',
      currency: b.currency === 'USD' ? 'Dólares (USD)' : b.currency === 'CRC' ? 'Colones (CRC)' : '—',
      iban: this.showIban() ? ibanText(b.iban) : maskIban(b.iban),
      updated: updatedText(b.updatedAt),
    };
  });
  readonly pendingRequest = computed(() => {
    const r = this.store.myBankRequest();
    return r && r.status === 'pendiente' ? r : null;
  });
  readonly requestSent = computed(() => {
    const at = this.pendingRequest()?.sentAt;
    return at ? `${formatShortDate(at)}, ${formatTime(at)}` : '';
  });
  readonly maxNote = MAX_BANK_NOTE;
  readonly asking = signal(false);
  readonly note = signal('');
  readonly sending = signal(false);

  toggleIban(): void {
    this.showIban.update((v) => !v);
  }

  askChange(): void {
    this.note.set('');
    this.asking.set(true);
  }

  setNote(event: Event): void {
    this.note.set((event.target as HTMLTextAreaElement).value);
  }

  async sendRequest(): Promise<void> {
    if (this.sending() || this.note().length > MAX_BANK_NOTE) return;
    this.sending.set(true);
    let message = 'Solicitud enviada. RH lo va a contactar por Slack para confirmar la cuenta nueva.';
    try {
      await this.store.requestBankChange(this.note());
      this.asking.set(false);
    } catch (err) {
      console.error('[Profile] Could not send the request:', err);
      message = 'No se pudo enviar. Revise la conexión e intente de nuevo.';
    } finally {
      this.sending.set(false);
    }
    const toast = await this.toast.create({ message, duration: 5000, position: 'bottom' });
    await toast.present();
  }

  // Ionic keeps the page alive; refresh the date used for the time at ELVA on every visit,
  // and hide the account again.
  ionViewWillEnter(): void {
    this.today.set(localIsoDate(new Date()));
    this.showIban.set(false);
  }
}
