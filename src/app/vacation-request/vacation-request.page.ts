import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonInput, IonTextarea, ToastController } from '@ionic/angular';

import { RequestsStore } from '../services/requests-store';

import { holidaysBetween } from './holidays';
import type { VacationDay } from './vacation-days';
import { MAX_REQUEST_DAYS, countDeductedDays, listVacationDays, rangeLength } from './vacation-days';

// TODO: read the employee's real balance from Firestore once the login is connected.
const EXAMPLE_AVAILABLE_DAYS = 12;

const WEEKDAYS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

@Component({
  selector: 'app-vacation-request',
  templateUrl: 'vacation-request.page.html',
  styleUrls: ['vacation-request.page.scss'],
  imports: [IonContent, IonInput, IonTextarea, IonButton],
})
export class VacationRequestPage {
  private readonly toast = inject(ToastController);
  private readonly store = inject(RequestsStore);
  private readonly router = inject(Router);

  readonly availableDays = EXAMPLE_AVAILABLE_DAYS;
  readonly start = signal('');
  readonly end = signal('');
  readonly comment = signal('');

  // Helper to get the actual last vacation day (the day before the return date)
  private readonly lastVacationDay = computed(() => {
    const returnDateStr = this.end();
    if (!returnDateStr) return '';
    const date = new Date(returnDateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return '';
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
  });

  readonly tooLong = computed(() => (rangeLength(this.start(), this.lastVacationDay()) ?? 0) > MAX_REQUEST_DAYS);
  readonly days = computed(() => {
    const lastDay = this.lastVacationDay();
    if (!this.start() || !lastDay || this.tooLong()) return [];
    return listVacationDays(this.start(), lastDay, holidaysBetween(this.start(), lastDay));
  });
  readonly deducted = computed(() => countDeductedDays(this.days()));
  readonly remaining = computed(() => this.availableDays - this.deducted());
  readonly dayRows = computed(() => this.days().map((day) => toRow(day)));
  readonly balanceLabel = computed(() => (this.remaining() < 0 ? 'Le faltarían' : 'Le quedarían'));
  readonly deductedText = computed(() => dayCount(this.deducted()));
  readonly balanceText = computed(() => dayCount(Math.abs(this.remaining())));

  readonly error = computed(() => {
    if (!this.start() || !this.end()) return '';
    if (this.end() < this.start()) return 'La fecha de reincorporación no puede ser antes del primer día.';
    if (this.end() === this.start()) return 'La fecha de reincorporación debe ser posterior al primer día.';
    if (this.tooLong()) return 'Una solicitud no puede ser de más de un año. Divídala en varias solicitudes.';
    if (this.deducted() === 0) return 'Las fechas elegidas no incluyen días laborales.';
    if (this.remaining() < 0) return `Solo tiene ${this.availableDays} días disponibles.`;
    return '';
  });

  readonly canSubmit = computed(() => this.days().length > 0 && !this.error());

  setStart(value: string | null | undefined): void {
    this.start.set(value ?? '');
  }

  setEnd(value: string | null | undefined): void {
    this.end.set(value ?? '');
  }

  setComment(value: string | null | undefined): void {
    this.comment.set(value ?? '');
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    const worker = (await this.store.currentWorker()) ?? { uid: 'local', name: 'Vos' };
    const days = this.deductedText();
    this.store.addVacation(worker, {
      start: this.start(),
      returnDate: this.end(),
      balance: this.availableDays,
      comment: this.comment(),
    });
    this.start.set('');
    this.end.set('');
    this.comment.set('');
    const toast = await this.toast.create({
      message: `Solicitud de ${days} enviada. Puede verla en Mis solicitudes.`,
      duration: 5000,
      position: 'bottom',
      buttons: [{ text: 'Ver', handler: () => void this.router.navigateByUrl('/tabs/solicitudes') }],
    });
    await toast.present();
  }
}

function toRow(day: VacationDay): { key: string; kind: string; weekday: string; date: string; status: string } {
  const month = MONTHS.at(Number(day.date.slice(5, 7)) - 1) ?? '';
  const status =
    day.kind === 'weekend'
      ? 'Descanso'
      : day.kind === 'mandatoryHoliday'
        ? `Feriado: ${day.holidayName}`
        : day.kind === 'optionalHoliday'
          ? `Cuenta (${day.holidayName})`
          : 'Cuenta';
  return {
    key: day.date,
    kind: day.kind,
    weekday: WEEKDAYS.at(day.weekday) ?? '',
    date: `${Number(day.date.slice(8))} ${month}`,
    status,
  };
}

function dayCount(n: number): string {
  return `${n} ${n === 1 ? 'día' : 'días'}`;
}
