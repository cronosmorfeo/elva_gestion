import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
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

  private authService = inject(AuthService);
  private router = inject(Router);
  private loadingController = inject(LoadingController);
  private toastController = inject(ToastController);

  constructor() {
    addIcons({ mailOutline, lockClosedOutline });
  }

  async onLogin() {
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
        this.router.navigateByUrl('/tabs/vacaciones', { replaceUrl: true });
      } else {
        // Redirección por defecto si es otro rol (ej. admin)
        this.router.navigateByUrl('/tabs/dashboard', { replaceUrl: true });
      }
    } else {
      this.showToast(result.error || 'Ocurrió un error al iniciar sesión.', 'danger');
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