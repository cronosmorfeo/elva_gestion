import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';

import { formatLongDate, localIsoDate } from '../admin-dashboard/admin-dates';
import { mondayOf, weekLabel } from '../reports/report-utils';
import { FeatureFlagsService } from '../services/feature-flags';
import { RequestsStore } from '../services/requests-store';
import { dayNumber } from '../shared/day-count';

import { chipDay, chipMonth, firstName, greeting, pendingCount, reportSentThisWeek, upcomingItems } from './home-utils';

// First page after signing in: a short summary, so each person sees what matters and moves on.
@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  imports: [IonContent, RouterLink],
})
export class HomePage {
  private readonly store = inject(RequestsStore);
  readonly flags = inject(FeatureFlagsService).flags;
  // Vacations and overtime are left out of the summary while they are turned off.
  private readonly vacations = computed(() => (this.flags().vacaciones ? this.store.vacations() : []));
  private readonly overtime = computed(() => (this.flags().horasExtra ? this.store.overtime() : []));

  readonly name = signal('');
  readonly now = signal(new Date());
  readonly today = computed(() => localIsoDate(this.now()));
  readonly todayText = computed(() => formatLongDate(this.now()));
  readonly hello = computed(() => greeting(this.now().getHours()));

  readonly available = computed(() => this.store.myAvailableDays());
  readonly availableText = computed(() => {
    const available = this.available();
    return available === null ? '—' : dayNumber(available);
  });
  readonly pending = computed(() => pendingCount(this.vacations(), this.overtime(), this.store.myUid()));
  readonly unseenNotices = this.store.unseenNotices;
  readonly latestNotice = computed(() => this.store.sortedNotices().at(0)?.title ?? 'No hay avisos');
  readonly pendingText = computed(() => {
    const n = this.pending();
    return n === 0 ? 'todo al día' : n === 1 ? 'espera respuesta' : 'esperan respuesta';
  });
  readonly reportSent = computed(() => reportSentThisWeek(this.store.reports(), this.store.myUid(), this.today()));
  readonly weekText = computed(() => weekLabel(mondayOf(this.today())));
  readonly upcoming = computed(() =>
    upcomingItems(this.vacations(), this.overtime(), this.store.myUid(), this.today()).map((item) => ({
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
