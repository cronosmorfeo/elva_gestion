import { Component, computed, inject, signal } from '@angular/core';
import { IonButton, IonContent, IonTextarea, ToastController } from '@ionic/angular';

import { RequestsStore } from '../services/requests-store';

import { MAX_FILES, addWeeks, fileKind, formatFileSize, mondayOf, reportProblem, weekLabel } from './report-utils';

const pad = (n: number): string => String(n).padStart(2, '0');
const localToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Optional weekly report, saved in Firestore (weekly_reports). Only the worker and the admins can read it.
// TODO: upload the files to Firebase Storage (needs the Blaze plan); today only their names are saved.
@Component({
  selector: 'app-weekly-report',
  templateUrl: 'weekly-report.page.html',
  styleUrls: ['weekly-report.page.scss'],
  imports: [IonContent, IonTextarea, IonButton],
})
export class WeeklyReportPage {
  private readonly toast = inject(ToastController);
  private readonly store = inject(RequestsStore);
  private readonly thisWeek = mondayOf(localToday());

  readonly maxFiles = MAX_FILES;
  readonly weeks = [0, 1, 2, 3].map((back) => {
    const monday = addWeeks(this.thisWeek, -back);
    const name = back === 0 ? 'Esta semana' : back === 1 ? 'La semana pasada' : weekLabel(monday);
    return { value: monday, label: back < 2 ? `${name} (${weekLabel(monday).replace('Semana del ', '')})` : name };
  });

  readonly week = signal(this.thisWeek);
  readonly text = signal('');
  readonly files = signal<File[]>([]);
  readonly sending = signal(false);
  readonly uid = signal('');

  readonly fileRows = computed(() =>
    this.files().map((f, i) => ({ index: i, name: f.name, kind: fileKind(f), size: formatFileSize(f.size) })),
  );
  readonly problem = computed(() => reportProblem(this.text(), this.files()));
  // Shows the problem only once the person started; an empty form just keeps the button off.
  readonly visibleProblem = computed(() => (this.text() || this.files().length ? this.problem() : ''));
  readonly sentRows = computed(() =>
    this.store
      .reports()
      .filter((r) => r.employeeId === this.uid())
      .map((r) => ({
        id: r.id,
        week: weekLabel(r.weekStart),
        text: r.text,
        seen: r.seen,
        attachments: r.files.map((f) => `${f.name} · ${formatFileSize(f.size)}`),
      })),
  );

  constructor() {
    void this.store.currentWorker().then((w) => this.uid.set(w?.uid ?? ''));
  }

  setWeek(event: Event): void {
    this.week.set((event.target as HTMLSelectElement).value);
  }

  setText(value: string | null | undefined): void {
    this.text.set(value ?? '');
  }

  addFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    this.files.update((list) => [...list, ...picked]);
    input.value = ''; // lets the person pick the same file again after removing it
  }

  removeFile(index: number): void {
    this.files.update((list) => list.filter((_, i) => i !== index));
  }

  async submit(): Promise<void> {
    if (this.problem() || this.sending()) return;
    const files = this.files().map((f) => ({ name: f.name, size: f.size, type: f.type }));
    this.sending.set(true);
    let message = files.length
      ? 'Reporte enviado. Los archivos todavía no se suben: por ahora solo se guarda su nombre.'
      : 'Reporte enviado.';
    try {
      await this.store.sendReport({ week: this.week(), text: this.text(), files });
      this.text.set('');
      this.files.set([]);
    } catch (err) {
      console.error('[WeeklyReport] Could not save the report:', err);
      message = 'No se pudo enviar el reporte. Revise la conexión e intente de nuevo.';
    } finally {
      this.sending.set(false);
    }
    const toast = await this.toast.create({ message, duration: 5000, position: 'bottom' });
    await toast.present();
  }
}
