import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import type { NotificationCard } from '../services/notifications';
import { NotificationsService } from '../services/notifications';

// Our own notification cards, shown in a corner while the person is looking at the page.
@Component({
  selector: 'app-notification-cards',
  templateUrl: 'notification-cards.component.html',
  styleUrls: ['notification-cards.component.scss'],
})
export class NotificationCardsComponent {
  private readonly notifications = inject(NotificationsService);
  private readonly router = inject(Router);

  readonly cards = this.notifications.cards;

  open(card: NotificationCard): void {
    this.notifications.dismiss(card.key);
    void this.router.navigateByUrl(card.url);
  }

  dismiss(key: number): void {
    this.notifications.dismiss(key);
  }
}
