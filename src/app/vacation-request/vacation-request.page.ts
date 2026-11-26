import type { OnInit } from '@angular/core';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonInput, IonTextarea, ToastController } from '@ionic/angular';
import { getFirestore, doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore'; // <-- Añadido collection, addDoc, serverTimestamp

import { addDays, formatShortDate } from '../admin-dashboard/admin-dates';
import { HALF_DAY_STARTS, halfDayEnd, halfDayText, timeLabel } from '../admin-dashboard/admin-requests';
import { localDateTime } from '../notices/notice-utils';
import { reportChange } from '../services/push-relay';
import { RequestsStore } from '../services/requests-store';
import { dayCount, dayNumber } from '../shared/day-count';

import { holidaysBetween } from './holidays';
import type { VacationDay } from './vacation-days';
import {
  MAX_REQUEST_DAYS,
  countDeductedDays,
  listVacationDays,
  overlappingRequest,
  rangeLength,
} from './vacation-days';

const WEEKDAYS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

@Component({
  selector: 'app-vacation-request',
  templateUrl: 'vacation-request.page.html',
  styleUrls: ['vacation-request.page.scss'],
  imports: [IonContent, IonInput, IonTextarea, IonButton],
})
export class VacationRequestPage implements OnInit {
  private readonly toast = inject(ToastController);
  readonly store = inject(RequestsStore);
  private readonly router = inject(Router);

  // Live from Firestore: saved balance minus the requests still pending (see RequestsStore).
  readonly hasBalance = computed(() => this.store.myAvailableDays() !== null);
  readonly availableDays = computed(() => this.store.myAvailableDays() ?? 0);
  readonly availableDaysText = computed(() => dayNumber(this.availableDays()));
  readonly pendingText = computed(() => dayCount(this.store.myPendingVacationDays()));
  readonly userEmail = signal<string | null>(null);
  readonly userName = signal<string>('Andrey Rojas'); // Para almacenar el nombre del colaborador

  readonly minStart = localDateTime(new Date()).slice(0, 10);
  readonly start = signal('');
  readonly end = signal('');
  readonly comment = signal('');
  readonly sending = signal(false);
  // Same first day and return day = a half day (4 hours) starting at halfDayFrom.
  readonly halfDayFrom = signal('');
  readonly halfDayStarts = HALF_DAY_STARTS.map((value) => ({ value, label: timeLabel(value) }));
  readonly sameDay = computed(() => this.start() !== '' && this.end() === this.start());

  // Helper to get the actual last vacation day (the day before the return date)
  private readonly lastVacationDay = computed(() => {
    const returnDateStr = this.end();
    if (!returnDateStr) return '';
    if (this.sameDay()) return this.start();
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
  readonly isHalfDay = computed(() => this.sameDay() && countDeductedDays(this.days()) === 1);
  readonly halfDayHint = computed(() => {
    const from = this.halfDayFrom();
    return from ? `No trabaja ${halfDayText(from)}. Vuelve a trabajar a las ${timeLabel(halfDayEnd(from))}.` : '';
  });
  readonly deducted = computed(() => (this.isHalfDay() ? 0.5 : countDeductedDays(this.days())));
  readonly remaining = computed(() => this.availableDays() - this.deducted());
  readonly dayRows = computed(() =>
    this.days().map((day) => {
      const row = toRow(day);
      return this.isHalfDay() && day.counts ? { ...row, status: 'Medio día · se descuenta 0,5' } : row;
    }),
  );
  readonly balanceLabel = computed(() => (this.remaining() < 0 ? 'Le faltarían' : 'Le quedarían'));
  readonly deductedText = computed(() => dayCount(this.deducted()));
  readonly balanceText = computed(() => dayCount(Math.abs(this.remaining())));

  // A pending or approved request of this person with a day in common: asking again would deduct it twice.
  readonly alreadyRequested = computed(() => {
    const mine = this.store.vacations().filter((r) => r.ownerId === this.store.myUid());
    const r = overlappingRequest(mine, this.start(), this.lastVacationDay());
    if (!r) return '';
    const last = r.returnDate > r.start ? addDays(r.returnDate, -1) : r.start;
    const when =
      last === r.start
        ? `el ${formatShortDate(r.start)}`
        : `del ${formatShortDate(r.start)} al ${formatShortDate(last)}`;
    const state = r.status === 'aprobada' ? 'aprobadas' : 'pendientes';
    return `Ya tiene vacaciones ${state} ${when}. No puede pedir los mismos días otra vez.`;
  });

  readonly error = computed(() => {
    if (!this.start() || !this.end()) return '';
    if (this.start() < this.minStart) return 'El primer día no puede ser una fecha pasada.';
    if (this.end() < this.start()) return 'La fecha de reincorporación no puede ser antes del primer día.';
    if (this.tooLong()) return 'Una solicitud no puede ser de más de un año. Divídala en varias solicitudes.';
    if (this.deducted() === 0) return 'Las fechas elegidas no incluyen días laborales.';
    if (this.alreadyRequested()) return this.alreadyRequested();
    if (!this.hasBalance()) return 'Todavía no tiene días de vacaciones registrados. Consulte con RH.';
    if (this.remaining() < 0) return `Solo tiene ${dayCount(this.availableDays())} disponibles.`;
    return '';
  });

  readonly canSubmit = computed(
    () => this.days().length > 0 && !this.error() && (!this.isHalfDay() || this.halfDayFrom() !== ''),
  );

  async ngOnInit(): Promise<void> {

    try {
      const worker = await this.store.currentWorker();

      if (worker && (worker as any).uid) {
        const uid = (worker as any).uid;

        // Obtener la instancia de Firestore y consultar directamente la colección 'colaboradores' usando el UID
        const db = getFirestore();
        const colaboradorRef = doc(db, 'colaboradores', uid);
        const snapshot = await getDoc(colaboradorRef);

        if (snapshot.exists()) {
          const colaboradorData = snapshot.data();

          // Extraer nombre si está disponible
          if (colaboradorData['nombre']) {
            this.userName.set(colaboradorData['nombre']);
          }

          // Extraer correo si está disponible
          if (colaboradorData['correo']) {
            this.userEmail.set(colaboradorData['correo']);
          }

        } else {
          console.warn(`[VacationRequest] No se encontró ningún documento en la colección 'colaboradores' con el ID: ${uid}`);
        }
      } else {
        console.warn('[VacationRequest] No se encontró un trabajador activo o el objeto no tiene UID.');
      }
    } catch (err) {
      console.error('[VacationRequest] Error al consultar Firestore en ngOnInit:', err);
    }
  }

  setStart(value: string | null | undefined): void {
    this.start.set(value ?? '');
  }

  setEnd(value: string | null | undefined): void {
    this.end.set(value ?? '');
  }

  setComment(value: string | null | undefined): void {
    this.comment.set(value ?? '');
  }

  setHalfDayFrom(value: string): void {
    this.halfDayFrom.set(HALF_DAY_STARTS.includes(value) ? value : '');
  }

  async submit(): Promise<void> {
    if (!this.canSubmit() || this.sending()) return;
    this.sending.set(true);
    const worker = await this.store.currentWorker();
    if (!worker) {
      this.sending.set(false);
      const expired = await this.toast.create({
        message: 'Su sesión se cerró. Inicie sesión de nuevo.',
        duration: 5000,
        position: 'bottom',
      });
      await expired.present();
      return;
    }
    const days = this.deductedText();
    

    // 2. Guardar en la colección 'vacations_requests' de Firestore
    try {
      const db = getFirestore();
      const requestsRef = collection(db, 'vacations_requests');

      const vacationRequestData = {
        fechaSolicitud: serverTimestamp(),
        diasSolicitados: this.deducted(),
        diaInicio: this.start(),
        // Día de reincorporación. El medio día (mismo día) se guarda como un día con medioDiaDesde.
        diaFin: this.sameDay() ? addDays(this.start(), 1) : this.end(),
        comentarioRRHH: this.comment() || '',
        nombreSolicitante: (worker as any).name || this.userName(),
        correoSolicitante: this.userEmail() || (worker as any).correo || '',
        uid: worker.uid,
        ...(this.isHalfDay() ? { medioDiaDesde: this.halfDayFrom() } : {}),
      };

      const created = await addDoc(requestsRef, vacationRequestData);
      reportChange('vacations_requests', created.id);
    } catch (firebaseError) {
      console.error('[VacationRequest] Error al guardar en Firestore vacations_requests:', firebaseError);
      const failed = await this.toast.create({
        message: 'No se pudo enviar la solicitud. Revise la conexión e intente de nuevo.',
        duration: 5000,
        position: 'bottom',
      });
      await failed.present();
      return;
    } finally {
      this.sending.set(false);
    }

    this.start.set('');
    this.end.set('');
    this.comment.set('');
    this.halfDayFrom.set('');
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
      ? 'Descanso · no se descuenta'
      : day.kind === 'mandatoryHoliday'
        ? `Feriado: ${day.holidayName} · no se descuenta`
        : day.kind === 'optionalHoliday'
          ? `Feriado no obligatorio: ${day.holidayName} · no se descuenta`
          : 'Se descuenta';
  return {
    key: day.date,
    kind: day.counts ? 'counted' : 'free',
    weekday: WEEKDAYS.at(day.weekday) ?? '',
    date: `${Number(day.date.slice(8))} ${month}`,
    status,
  };
}
