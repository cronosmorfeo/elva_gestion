import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { 
  IonContent, 
  IonItem, 
  IonInput, 
  IonIcon, 
  IonButton,
  LoadingController,
  ToastController
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { mailOutline, lockClosedOutline } from 'ionicons/icons';

import { AuthService } from '../services/auth';
import { looksLikeEmail, sendPasswordReset } from '../services/password';

@Component({
  selector: 'app-login',
  templateUrl: 'login.page.html',
  styleUrls: ['login.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent, 
    IonItem, 
    IonInput, 
    IonIcon, 
    IonButton
  ],
})
export class LoginPage {
  correo: string = '';
  password: string = '';
  // After sending a reset link, wait a minute before another one.
  resetWait = false;

  private authService = inject(AuthService);
  private router = inject(Router);
  private loadingController = inject(LoadingController);
  private toastController = inject(ToastController);

  constructor() {
    addIcons({ mailOutline, lockClosedOutline });
  }

  async onLogin(): Promise<void> {
    if (!this.correo || !this.password) {
      this.showToast('Por favor, ingresa tu correo y contraseña.', 'danger');
      return;
    }

    const loading = await this.loadingController.create({
      message: 'Verificando credenciales...',
      spinner: 'crescent'
    });
    await loading.present();

    const result = await this.authService.login(this.correo, this.password);
    await loading.dismiss();

    if (result.success) {
      this.showToast('¡Bienvenido de nuevo!', 'success');

      // Validación de redirección solicitada
      if (result.tipo_colaborador === 'regular') {
        this.router.navigateByUrl('/tabs/inicio', { replaceUrl: true });
      } else {
        // Redirección por defecto si es otro rol (ej. admin)
        this.router.navigateByUrl('/tabs/dashboard', { replaceUrl: true });
      }
    } else {
      this.showToast(result.error || 'Ocurrió un error al iniciar sesión.', 'danger');
    }
  }

  // "¿Olvidó su contraseña?": Firebase e-mails a link to choose a new one. Same answer whether the account
  // exists or not, so nobody can find out which e-mails are registered.
  async onForgot(): Promise<void> {
    if (this.resetWait) return;
    if (!looksLikeEmail(this.correo)) {
      this.showToast('Escriba su correo arriba y toque otra vez "¿Olvidó su contraseña?".', 'danger');
      return;
    }
    try {
      await sendPasswordReset(this.correo);
      this.resetWait = true;
      setTimeout(() => (this.resetWait = false), 60_000);
      this.showToast(
        'Si ese correo está registrado, le llegará un enlace para crear una contraseña nueva. Revise también la carpeta de spam.',
        'success',
      );
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      this.showToast(
        code === 'auth/invalid-email'
          ? 'El formato del correo electrónico no es válido.'
          : 'No se pudo enviar el enlace. Intente de nuevo en unos minutos.',
        'danger',
      );
    }
  }

  private async showToast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastController.create({
      message,
      duration: 3500,
      color,
      position: 'bottom',
      buttons: [
        {
          text: 'Cerrar',
          role: 'cancel'
        }
      ]
    });
    await toast.present();
  }
}