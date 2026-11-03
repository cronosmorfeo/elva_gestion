import { Component, EnvironmentInjector, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IonHeader, IonToolbar, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { triangle, ellipse, square } from 'ionicons/icons';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [IonHeader, IonToolbar, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, RouterLink, RouterLinkActive],
})
export class TabsPage {
  public environmentInjector = inject(EnvironmentInjector);

  // TODO: show the navbar only after sign-in (isSignedIn in ../auth/auth.guard).
  readonly comingSoon = ['Horas extra', 'Mis solicitudes', 'Avisos'];

  constructor() {
    addIcons({ triangle, ellipse, square });
  }
}
