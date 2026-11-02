import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  airplaneOutline,
  chevronForwardOutline,
  documentTextOutline,
  notificationsOutline,
  timeOutline,
} from 'ionicons/icons';

interface MenuOption {
  title: string;
  description: string;
  icon: string;
  route?: string; // no route = coming soon
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonContent, IonIcon, RouterLink],
})
export class HomePage {
  readonly options: MenuOption[] = [
    {
      title: 'Solicitar vacaciones',
      description: 'Elija las fechas y vea cuántos días se descuentan.',
      icon: 'airplane-outline',
      route: '/tabs/inicio/vacaciones',
    },
    { title: 'Horas extra', description: 'Solicitar y registrar horas extra.', icon: 'time-outline' },
    { title: 'Mis solicitudes', description: 'Estado de sus solicitudes.', icon: 'document-text-outline' },
    { title: 'Avisos', description: 'Notificaciones de sus solicitudes.', icon: 'notifications-outline' },
  ];

  constructor() {
    addIcons({ airplaneOutline, timeOutline, documentTextOutline, notificationsOutline, chevronForwardOutline });
  }
}
