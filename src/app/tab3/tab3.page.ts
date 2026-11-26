
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonIcon,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonButton,
  IonButtons,
  IonSpinner
} from '@ionic/angular';
import { getApp, initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  calendarOutline,
  cardOutline,
  peopleCircleOutline,
  peopleOutline,
  personAddOutline,
  personOutline,
  shieldCheckmarkOutline,
  timeOutline,
  walletOutline,
} from 'ionicons/icons';

import { localIsoDate } from '../admin-dashboard/admin-dates';
import { bankProblem } from '../services/bank-account';
import { randomPassword, sendPasswordLink } from '../services/password';
import { reportChange } from '../services/push-relay';
import { RequestsStore } from '../services/requests-store';
import { DEFAULT_DAYS_PER_YEAR } from '../services/vacation-balance';
import { parseDays } from '../shared/day-count';

import {
  currencySymbol,
  formatCedula,
  formatThousands,
  groupIban,
  hoursText,
  isValidCedula,
  isValidCrIban,
  normalizeIban,
  parseAmount,
  scheduleText,
  shiftMinutes,
} from './employee-form';

interface Colaborador {
  nombre: string;
  pais: string;
  salario: number | null;
  moneda: string;
  fechaIngreso: string;
  jornada: string;
  horarioLaborado: string;
  correo: string;
}

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonIcon,
    IonLabel,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonButtons,
    IonSpinner
  ]
})
export class Tab3Page {

  colaborador: Colaborador = {
    nombre: '',
    pais: '',
    salario: 0,
    moneda: '',
    fechaIngreso: '',
    jornada: '',
    horarioLaborado: '',
    correo: ''
  };

  guardando = false;

  // Display-only state for the formatted fields.
  salarioTexto = '';
  horaInicio = '';
  horaFin = '';
  // Saved apart, in colaboradores/{uid}/privado/pago.
  pago = { cedula: '', iban: '', monedaCuenta: '' };
  // Vacation days the person already has. From today they earn DEFAULT_DAYS_PER_YEAR a year.
  vacacionesIniciales = '';

  // Shown in the success window after the employee is created.
  creado: { nombre: string; correo: string } | null = null;

  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  private store = inject(RequestsStore);

  private app = getApp();
  private db = getFirestore(this.app);

  constructor() {
    addIcons({
      arrowBackOutline,
      calendarOutline,
      cardOutline,
      peopleCircleOutline,
      peopleOutline,
      personAddOutline,
      personOutline,
      shieldCheckmarkOutline,
      timeOutline,
      walletOutline,
    });
  }

  cambiarSalario(event: Event): void {
    const input = event.target as HTMLIonInputElement;
    this.colaborador.salario = parseAmount(String(input.value ?? ''));
    this.salarioTexto = formatThousands(this.colaborador.salario);
    input.value = this.salarioTexto;
  }

  simboloMoneda(): string {
    return currencySymbol(this.colaborador.moneda);
  }

  cambiarHora(cual: 'inicio' | 'fin', event: Event): void {
    const value = String((event.target as HTMLIonInputElement).value ?? '');
    if (cual === 'inicio') this.horaInicio = value;
    else this.horaFin = value;
    this.colaborador.horarioLaborado = scheduleText(this.horaInicio, this.horaFin);
  }

  horasTurno(): string {
    return hoursText(shiftMinutes(this.horaInicio, this.horaFin));
  }

  cambiarCedula(event: Event): void {
    const input = event.target as HTMLIonInputElement;
    this.pago.cedula = formatCedula(String(input.value ?? ''));
    input.value = this.pago.cedula;
  }

  cedulaValida(): boolean {
    return isValidCedula(this.pago.cedula);
  }

  cambiarIban(event: Event): void {
    const input = event.target as HTMLIonInputElement;
    this.pago.iban = groupIban(String(input.value ?? ''));
    input.value = this.pago.iban;
  }

  ibanCompleto(): boolean {
    return normalizeIban(this.pago.iban).length >= 22;
  }

  ibanValido(): boolean {
    return isValidCrIban(this.pago.iban);
  }

  cambiarVacaciones(event: Event): void {
    this.vacacionesIniciales = String((event.target as HTMLIonInputElement).value ?? '').trim();
  }

  vacacionesValidas(): boolean {
    return !this.vacacionesIniciales || parseDays(this.vacacionesIniciales) !== null;
  }

  irAlPanel(): void {
    this.creado = null;
    void this.router.navigateByUrl('/tabs/dashboard');
  }

  crearOtro(): void {
    this.creado = null;
    setTimeout(() => document.querySelector<HTMLInputElement>('ion-input[name="nombre"] input')?.focus());
  }

  // Opens the calendar when the date box is clicked, not only its small icon.
  abrirCalendario(event: Event): void {
    const input = (event.currentTarget as HTMLElement).querySelector('input');
    try {
      input?.showPicker();
    } catch {
      input?.focus();
    }
  }

  async crearColaborador(): Promise<void> {

    if (this.guardando) return;

    if (
      !this.colaborador.nombre.trim() ||
      !this.colaborador.pais ||
      this.colaborador.salario === null ||
      this.colaborador.salario === undefined ||
      !this.colaborador.moneda ||
      !this.colaborador.fechaIngreso ||
      !this.colaborador.jornada ||
      !this.colaborador.horarioLaborado.trim() ||
      !this.colaborador.correo.trim()
    ) {
      alert('Por favor, completa todos los campos.');
      return;
    }

    if (
      !Number.isFinite(Number(this.colaborador.salario)) ||
      Number(this.colaborador.salario) < 0
    ) {
      alert('El salario no es válido.');
      return;
    }

    if (!this.vacacionesValidas()) {
      alert('Revisá los días de vacaciones: solo números, pueden ser medios días (ej. 9,5).');
      return;
    }

    // Payment data is optional, but if something is typed it must be valid.
    const problemaPago = bankProblem(this.pago.cedula, this.pago.iban, this.pago.monedaCuenta);
    if (problemaPago) {
      alert(problemaPago);
      return;
    }

    this.guardando = true;

    let secondaryApp: ReturnType<typeof initializeApp> | null = null;

    try {

      // Crear una instancia secundaria de Firebase
      // para conservar la sesión del administrador.

      secondaryApp = initializeApp(
        this.app.options,
        `colaborador-${Date.now()}`
      );

      const secondaryAuth = getAuth(secondaryApp);

      // Crear usuario directamente en Firebase Authentication, con una contraseña al azar que nadie ve:
      // la persona elige la suya desde el enlace que le llega al correo (más abajo).

      const credential = await createUserWithEmailAndPassword(
        secondaryAuth,
        this.colaborador.correo.trim().toLowerCase(),
        randomPassword()
      );

      const user = credential.user;

      // Actualizar nombre del usuario.

      await updateProfile(user, {
        displayName: this.colaborador.nombre.trim()
      });

      // Guardar información del colaborador en Firestore.

      await setDoc(
        doc(this.db, 'colaboradores', user.uid),
        {
          uid: user.uid,
          nombre: this.colaborador.nombre.trim(),
          pais: this.colaborador.pais,
          salario: Number(this.colaborador.salario),
          moneda: this.colaborador.moneda,
          fechaIngreso: this.colaborador.fechaIngreso,
          jornada: this.colaborador.jornada,
          horarioLaborado: this.colaborador.horarioLaborado.trim(),
          correo: user.email,
          tipo_colaborador: 'regular',
          activo: true,
          // Vacation days earned from today on: what they already had is entered here, so nothing counts twice.
          vacaciones_disponibles: parseDays(this.vacacionesIniciales) ?? 0,
          acumulaDesde: localIsoDate(new Date()),
          diasAnuales: DEFAULT_DAYS_PER_YEAR,
          createdAt: serverTimestamp()
        }
      );

      this.creado = {
        nombre: this.colaborador.nombre.trim(),
        correo: this.colaborador.correo.trim().toLowerCase(),
      };

      // The user already exists, so a failure here must not look like the whole creation failed.
      if (normalizeIban(this.pago.iban)) {
        try {
          await this.store.saveBankAccount(user.uid, {
            cedula: this.pago.cedula,
            iban: this.pago.iban,
            currency: this.pago.monedaCuenta
          }, false);
        } catch (errorPago) {
          console.error('Error guardando la cuenta de pago:', errorPago);
          alert('El usuario se creó, pero no se pudo guardar la cuenta de pago. Agregala desde Editar empleado.');
        }
      }

      // The person chooses their own password from Firebase's e-mail link, so nobody else ever knows it.
      try {
        await sendPasswordLink(user.email ?? this.colaborador.correo);
      } catch (errorEnlace) {
        console.error('Error enviando el enlace de contraseña:', errorEnlace);
        alert('El usuario se creó, pero no se pudo enviar el correo para crear la contraseña. Pídale que use "¿Olvidó su contraseña?" en la entrada.');
      }

      // Welcome e-mail (Resend), instead of "your payment account changed".
      reportChange('colaboradores', user.uid);

      this.limpiarFormulario();

    } catch (error: any) {

      console.error('Error creando colaborador:', error);

      const codigo = error?.code;

      if (codigo === 'auth/email-already-in-use') {
        alert('Ya existe un usuario con ese correo electrónico.');
      } else if (codigo === 'auth/invalid-email') {
        alert('El correo electrónico no es válido.');
      } else if (codigo === 'auth/weak-password') {
        alert('La contraseña es demasiado débil.');
      } else if (codigo === 'permission-denied') {
        alert('No tienes permisos para guardar el colaborador en Firestore.');
      } else {
        alert(error?.message || 'Ocurrió un error al crear el colaborador.');
      }

    } finally {

      // Eliminar la instancia secundaria.

      if (secondaryApp) {
        await deleteApp(secondaryApp).catch(console.error);
      }

      this.guardando = false;
      // The app runs without zone.js, so the screen must be told that saving finished.
      this.cdr.markForCheck();
    }
  }

  limpiarFormulario(): void {
    this.colaborador = {
      nombre: '',
      pais: '',
      salario: 0,
      moneda: '',
      fechaIngreso: '',
      jornada: '',
      horarioLaborado: '',
      correo: ''
    };
    this.salarioTexto = '';
    this.horaInicio = '';
    this.horaFin = '';
    this.pago = { cedula: '', iban: '', monedaCuenta: '' };
    this.vacacionesIniciales = '';
  }
}
