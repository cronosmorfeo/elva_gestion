import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonInput, IonItem } from '@ionic/angular';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { addIcons } from 'ionicons';
import { lockClosedOutline } from 'ionicons/icons';

import { isAdminRole } from '../auth/admin.guard';
import { MIN_PASSWORD, changePassword, passwordError, passwordProblem } from '../services/password';
import { reportChange } from '../services/push-relay';

// Change your own password. Afterwards the person gets an e-mail saying so, in case it was not them.
@Component({
  selector: 'app-password',
  templateUrl: 'password.page.html',
  styleUrls: ['../login/login.page.scss'],
  standalone: true,
  imports: [FormsModule, IonContent, IonItem, IonInput, IonIcon, IonButton],
})
export class PasswordPage {
  private readonly router = inject(Router);

  readonly min = MIN_PASSWORD;
  readonly saving = signal(false);
  readonly error = signal('');
  readonly done = signal(false);

  current = '';
  next = '';
  repeat = '';

  constructor() {
    addIcons({ lockClosedOutline });
  }

  async save(): Promise<void> {
    const problem = passwordProblem(this.current, this.next, this.repeat);
    this.error.set(problem ?? '');
    if (problem || this.saving()) return;
    this.saving.set(true);
    try {
      await changePassword(this.current, this.next);
      this.current = this.next = this.repeat = '';
      this.done.set(true);
      // "Se cambió su contraseña" to their e-mail: if someone else did it, the owner finds out.
      const uid = getAuth().currentUser?.uid;
      if (uid) reportChange('contrasena', uid);
    } catch (err) {
      this.error.set(passwordError((err as { code?: unknown }).code));
    } finally {
      this.saving.set(false);
    }
  }

  // Back to where this person works: the panel or Inicio.
  async goBack(): Promise<void> {
    let url = '/tabs/inicio';
    const uid = getAuth().currentUser?.uid;
    if (uid) {
      try {
        const data = (await getDoc(doc(getFirestore(), 'colaboradores', uid))).data();
        if (isAdminRole(data?.['tipo_colaborador'])) url = '/tabs/dashboard';
      } catch {
        // Inicio works for everyone.
      }
    }
    await this.router.navigateByUrl(url, { replaceUrl: true });
  }
}
