import { Component, computed, inject, signal } from '@angular/core';
import { IonButton, IonContent, IonInput, IonTextarea, ToastController } from '@ionic/angular';

import { holidaysBetween } from '../vacation-request/holidays';

import type { OvertimeDay, PayPart } from './overtime-hours';
import { MAX_DAILY_HOURS, SHIFT_HOURS, overtimeDays } from './overtime-hours';

const WEEKDAYS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const RATE_NAMES = new Map([
  [1.5, '1.5x'],
  [2, 'doble'],
  [3, 'triple'],
]);

@Component({
  selector: 'app-overtime-request',
  templateUrl: 'overtime-request.page.html',
  styleUrls: ['overtime-request.page.scss'],
  imports: [IonContent, IonInput, IonTextarea, IonButton],
})
export class OvertimeRequestPage {
  private readonly toast = inject(ToastController);

  readonly minStart = `${localToday()}T00:00`;
  readonly start = signal('');
  readonly end = signal('');
  readonly task = signal('');

  readonly days = computed(() => overtimeDays(this.start(), this.end(), holidaysBetween(this.start(), this.end())));
  readonly totalMinutes = computed(() => this.days().reduce((sum, day) => sum + day.minutes, 0));
  readonly totalText = computed(() => duration(this.totalMinutes()));
  readonly dayRows = computed(() => this.days().map((day) => toRow(day)));

  readonly error = computed(() => {
    if (!this.start() || !this.end()) return '';
    if (this.start() < this.minStart) return 'Solo se pueden pedir horas extra para hoy o una fecha futura.';
    if (this.days().length === 0) return 'La hora de fin tiene que ser después de la hora de inicio.';
    const over = this.days().find((day) => day.overLimit);
    if (over) {
      const allowed =
        over.kind === 'workday' || over.kind === 'optionalHoliday' ? MAX_DAILY_HOURS - SHIFT_HOURS : MAX_DAILY_HOURS;
      return `El ${toRow(over).date} pasa el tope legal de ${MAX_DAILY_HOURS} horas al día. Ese día caben hasta ${allowed} horas.`;
    }
    return '';
  });

  readonly canSubmit = computed(() => this.days().length > 0 && !this.error() && this.task().trim().length > 0);

  setStart(value: string | null | undefined): void {
    this.start.set(value ?? '');
  }

  setEnd(value: string | null | undefined): void {
    this.end.set(value ?? '');
  }

  setTask(value: string | null | undefined): void {
    this.task.set(value ?? '');
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    // TODO: save the request in Firestore once the login is connected.
    const toast = await this.toast.create({
      message: `Solicitud de ${this.totalText()} lista. Todavía no se guarda: falta conectar el inicio de sesión.`,
      duration: 4000,
      position: 'bottom',
    });
    await toast.present();
  }
}

function toRow(day: OvertimeDay): { key: string; kind: string; weekday: string; date: string; status: string } {
  const month = MONTHS.at(Number(day.date.slice(5, 7)) - 1) ?? '';
  const pay = day.pay.map((part) => payText(part)).join(', ');
  const label =
    day.kind === 'restDay'
      ? 'Descanso'
      : day.kind === 'mandatoryHoliday'
        ? `Feriado: ${day.holidayName}`
        : day.kind === 'optionalHoliday'
          ? `${day.holidayName} (no obligatorio)`
          : '';
  return {
    key: day.date,
    kind: day.overLimit ? `${day.kind} over` : day.kind,
    weekday: WEEKDAYS.at(day.weekday) ?? '',
    date: `${Number(day.date.slice(8))} ${month}`,
    status: label ? `${label} · ${pay}` : pay,
  };
}

function payText(part: PayPart): string {
  return `${duration(part.minutes)} ${RATE_NAMES.get(part.rate) ?? `${part.rate}x`}`;
}

function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
