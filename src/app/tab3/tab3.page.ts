
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

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

interface Colaborador {
  nombre: string;
  pais: string;
  salario: number;
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

  private app = getApp();
  private db = getFirestore(this.app);

  constructor() {}

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

      alert('El colaborador fue creado correctamente.');

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
  }
}
