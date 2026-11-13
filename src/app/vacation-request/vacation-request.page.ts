import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonInput, IonTextarea, ToastController } from '@ionic/angular';
import { getFirestore, doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore'; // <-- Añadido collection, addDoc, serverTimestamp

import { localDateTime } from '../notices/notice-utils';
import { RequestsStore } from '../services/requests-store';

import { holidaysBetween } from './holidays';
import type { VacationDay } from './vacation-days';
import { MAX_REQUEST_DAYS, countDeductedDays, listVacationDays, rangeLength } from './vacation-days';

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
  readonly userEmail = signal<string | null>(null);
  readonly userName = signal<string>('Andrey Rojas'); // Para almacenar el nombre del colaborador

  readonly minStart = localDateTime(new Date()).slice(0, 10);
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
  readonly remaining = computed(() => this.availableDays() - this.deducted());
  readonly dayRows = computed(() => this.days().map((day) => toRow(day)));
  readonly balanceLabel = computed(() => (this.remaining() < 0 ? 'Le faltarían' : 'Le quedarían'));
  readonly deductedText = computed(() => dayCount(this.deducted()));
  readonly balanceText = computed(() => dayCount(Math.abs(this.remaining())));

  readonly error = computed(() => {
    if (!this.start() || !this.end()) return '';
    if (this.start() < this.minStart) return 'El primer día no puede ser una fecha pasada.';
    if (this.end() < this.start()) return 'La fecha de reincorporación no puede ser antes del primer día.';
    if (this.end() === this.start()) return 'La fecha de reincorporación debe ser posterior al primer día.';
    if (this.tooLong()) return 'Una solicitud no puede ser de más de un año. Divídala en varias solicitudes.';
    if (this.deducted() === 0) return 'Las fechas elegidas no incluyen días laborales.';
    if (!this.hasBalance()) return 'Todavía no tiene días de vacaciones registrados. Consulte con RH.';
    if (this.remaining() < 0) return `Solo tiene ${this.availableDays()} días disponibles.`;
    return '';
  });

  readonly canSubmit = computed(() => this.days().length > 0 && !this.error());

  async ngOnInit(): Promise<void> {
    console.log('[VacationRequest] ngOnInit: Obteniendo colaborador actual desde el store...');

    try {
      const worker = await this.store.currentWorker();
      console.log('[VacationRequest] Datos del colaborador obtenidos del store:', worker);

      if (worker && (worker as any).uid) {
        const uid = (worker as any).uid;
        console.log(`[VacationRequest] UID del usuario logueado detectado: ${uid}`);

        // Obtener la instancia de Firestore y consultar directamente la colección 'colaboradores' usando el UID
        const db = getFirestore();
        const colaboradorRef = doc(db, 'colaboradores', uid);
        const snapshot = await getDoc(colaboradorRef);

        if (snapshot.exists()) {
          const colaboradorData = snapshot.data();
          console.log('[VacationRequest] MATCH ENCONTRADO en Firestore - Datos del colaborador:', colaboradorData);

          // Extraer nombre si está disponible
          if (colaboradorData['nombre']) {
            this.userName.set(colaboradorData['nombre']);
          }

          // Extraer correo si está disponible
          if (colaboradorData['correo']) {
            console.log(`[VacationRequest] Correo detectado: ${colaboradorData['correo']}`);
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

  async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    const worker = (await this.store.currentWorker()) ?? { uid: 'local', name: 'Vos' };
    const days = this.deductedText();
    
    console.log('[VacationRequest] Enviando solicitud de vacaciones con balance:', this.availableDays());

    // 2. Guardar en la colección 'vacations_requests' de Firestore
    try {
      const db = getFirestore();
      const requestsRef = collection(db, 'vacations_requests');

      const vacationRequestData = {
        fechaSolicitud: serverTimestamp(),
        diasSolicitados: this.deducted(),
        diaInicio: this.start(),
        diaFin: this.end(), // Corresponde al día de reincorporación seleccionado
        comentarioRRHH: this.comment() || '',
        nombreSolicitante: (worker as any).name || this.userName(),
        correoSolicitante: this.userEmail() || (worker as any).correo || '',
        uid: worker.uid,
      };

      await addDoc(requestsRef, vacationRequestData);
      console.log('[VacationRequest] Solicitud guardada exitosamente en Firestore (vacations_requests).');
    } catch (firebaseError) {
      console.error('[VacationRequest] Error al guardar en Firestore vacations_requests:', firebaseError);
    }

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