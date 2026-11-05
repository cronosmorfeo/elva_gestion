import { Component, computed, inject } from '@angular/core';
import { IonContent } from '@ionic/angular';

import { formatShortDate, formatTime } from '../admin-dashboard/admin-dates';
import { RequestsStore } from '../services/requests-store';

// Read-only list of the notices published by the admins.
@Component({
  selector: 'app-notices',
  templateUrl: 'notices.page.html',
  styleUrls: ['notices.page.scss'],
  imports: [IonContent],
})
export class NoticesPage {
  private readonly store = inject(RequestsStore);

  readonly notices = computed(() =>
    this.store.sortedNotices().map((n) => ({
      ...n,
      date: `${formatShortDate(n.createdAt)}, ${formatTime(n.createdAt)}`,
      edited: !!n.updatedAt,
    })),
  );

  // Ionic keeps the page alive between visits, so this runs on every visit.
  ionViewWillEnter(): void {
    this.store.markNoticesSeen();
  }
}
