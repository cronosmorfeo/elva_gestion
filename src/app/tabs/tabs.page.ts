import { Component, DestroyRef, EnvironmentInjector, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IonHeader, IonToolbar, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/angular';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { addIcons } from 'ionicons';
import { triangle, ellipse, square } from 'ionicons/icons';

import { isSignedIn } from '../auth/auth.guard';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [IonHeader, IonToolbar, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, RouterLink, RouterLinkActive],
})
export class TabsPage {
  public environmentInjector = inject(EnvironmentInjector);

  readonly signedIn = signal(false);
  readonly comingSoon = ['Horas extra', 'Mis solicitudes', 'Avisos'];

  constructor() {
    addIcons({ triangle, ellipse, square });

    const unsubscribe = onAuthStateChanged(getAuth(), (user) => this.signedIn.set(isSignedIn(user)));
    inject(DestroyRef).onDestroy(unsubscribe);
  }
}
