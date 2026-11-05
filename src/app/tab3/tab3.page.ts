
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
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
  password: string;
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
    correo: '',
    password: ''
  };

  guardando = false;

  // Display-only state for the formatted fields.
  salarioTexto = '';
  horaInicio = '';
  horaFin = '';
  // TODO: payment data is not saved yet; the backend decides where (a private document).
  pago = { cedula: '', iban: '', monedaCuenta: '' };

  // Shown in the success window after the employee is created.
  creado: { nombre: string; correo: string } | null = null;

  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

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

  async crearColaborador() {

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
      !this.colaborador.correo.trim() ||
      !this.colaborador.password
    ) {
      alert('Por favor, completa todos los campos.');
      return;
    }

    if (this.colaborador.password.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (
      !Number.isFinite(Number(this.colaborador.salario)) ||
      Number(this.colaborador.salario) < 0
    ) {
      alert('El salario no es válido.');
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

      // Crear usuario directamente en Firebase Authentication.

      const credential = await createUserWithEmailAndPassword(
        secondaryAuth,
        this.colaborador.correo.trim().toLowerCase(),
        this.colaborador.password
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
          activo: true,
          createdAt: serverTimestamp()
        }
      );

      this.creado = {
        nombre: this.colaborador.nombre.trim(),
        correo: this.colaborador.correo.trim().toLowerCase(),
      };

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

  limpiarFormulario() {
    this.colaborador = {
      nombre: '',
      pais: '',
      salario: 0,
      moneda: '',
      fechaIngreso: '',
      jornada: '',
      horarioLaborado: '',
      correo: '',
      password: ''
    };
    this.salarioTexto = '';
    this.horaInicio = '';
    this.horaFin = '';
    this.pago = { cedula: '', iban: '', monedaCuenta: '' };
  }
}
