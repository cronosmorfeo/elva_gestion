import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';

import { formatLongDate, localIsoDate } from '../admin-dashboard/admin-dates';
import { mondayOf, weekLabel } from '../reports/report-utils';
import { RequestsStore } from '../services/requests-store';

import { chipDay, chipMonth, firstName, greeting, pendingCount, reportSentThisWeek, upcomingItems } from './home-utils';

// First page after signing in: a short summary, so each person sees what matters and moves on.
@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  imports: [IonContent, RouterLink],
})
export class HomePage {
  private readonly store = inject(RequestsStore);

  readonly name = signal('');
  readonly now = signal(new Date());
  readonly today = computed(() => localIsoDate(this.now()));
  readonly todayText = computed(() => formatLongDate(this.now()));
  readonly hello = computed(() => greeting(this.now().getHours()));

  readonly available = computed(() => this.store.myAvailableDays());
  readonly pending = computed(() => pendingCount(this.store.vacations(), this.store.overtime(), this.store.myUid()));
  readonly unseenNotices = this.store.unseenNotices;
  readonly latestNotice = computed(() => this.store.sortedNotices().at(0)?.title ?? 'No hay avisos');
  readonly pendingText = computed(() => {
    const n = this.pending();
    return n === 0 ? 'todo al día' : n === 1 ? 'espera respuesta' : 'esperan respuesta';
  });
  readonly reportSent = computed(() => reportSentThisWeek(this.store.reports(), this.store.myUid(), this.today()));
  readonly weekText = computed(() => weekLabel(mondayOf(this.today())));
  readonly upcoming = computed(() =>
    upcomingItems(this.store.vacations(), this.store.overtime(), this.store.myUid(), this.today()).map((item) => ({
      ...item,
      day: chipDay(item.date),
      month: chipMonth(item.date),
    })),
  );

  constructor() {
    void this.store.currentWorker().then((w) => this.name.set(firstName(w?.name ?? '')));
  }

  // Ionic keeps the page alive, so refresh the greeting and the date on every visit.
  ionViewWillEnter(): void {
    this.now.set(new Date());
  }
}
