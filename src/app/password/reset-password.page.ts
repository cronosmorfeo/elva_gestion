import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonInput, IonItem } from '@ionic/angular';
import { confirmPasswordReset, getAuth, verifyPasswordResetCode } from 'firebase/auth';
import { addIcons } from 'ionicons';
import { lockClosedOutline } from 'ionicons/icons';

import { MIN_PASSWORD, newPasswordProblem, resetError } from '../services/password';

// Where Firebase's e-mail link opens (new account or "¿Olvidó su contraseña?"), instead of Firebase's plain
// white page. The Worker sets this address in Firebase (worker/src/auth-config.ts). The link brings
// ?mode=resetPassword&oobCode=...; the code is single-use and expires, Firebase checks it.
@Component({
  selector: 'app-reset-password',
  templateUrl: 'reset-password.page.html',
  styleUrls: ['../login/login.page.scss'],
  standalone: true,
  imports: [FormsModule, IonContent, IonItem, IonInput, IonIcon, IonButton],
})
export class ResetPasswordPage {
  private readonly router = inject(Router);
  private readonly code: string;

  readonly min = MIN_PASSWORD;
  readonly state = signal<'checking' | 'form' | 'done' | 'invalid'>('checking');
  readonly email = signal('');
  readonly saving = signal(false);
  readonly error = signal('');

  next = '';
  repeat = '';

  constructor() {
    addIcons({ lockClosedOutline });
    const params = inject(ActivatedRoute).snapshot.queryParamMap;
    this.code = params.get('mode') === 'resetPassword' ? (params.get('oobCode') ?? '') : '';
    // The code should not stay in the address bar or the browser history.
    history.replaceState(history.state, '', location.pathname);
    void this.check();
  }

  private async check(): Promise<void> {
    if (!this.code) {
      this.state.set('invalid');
      return;
    }
    try {
      this.email.set(await verifyPasswordResetCode(getAuth(), this.code));
      this.state.set('form');
    } catch {
      this.state.set('invalid');
    }
  }

  async save(): Promise<void> {
    const problem = newPasswordProblem(this.next, this.repeat);
    this.error.set(problem ?? '');
    if (problem || this.saving()) return;
    this.saving.set(true);
    try {
      await confirmPasswordReset(getAuth(), this.code, this.next);
      this.next = this.repeat = '';
      this.state.set('done');
    } catch (err) {
      const message = resetError((err as { code?: unknown }).code);
      if (message === null) this.state.set('invalid');
      else this.error.set(message);
    } finally {
      this.saving.set(false);
    }
  }

  async toLogin(): Promise<void> {
    await this.router.navigateByUrl('/tabs/login', { replaceUrl: true });
  }
}
