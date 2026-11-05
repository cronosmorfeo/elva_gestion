import { Component, computed, inject, signal } from '@angular/core';
import { IonButton, IonContent, IonTextarea, ToastController } from '@ionic/angular';

import type { ReportFile } from './report-utils';
import { MAX_FILES, addWeeks, fileKind, formatFileSize, mondayOf, reportProblem, weekLabel } from './report-utils';

interface SentReport {
  id: string;
  week: string;
  text: string;
  files: ReportFile[];
  seen: boolean;
  sample: boolean;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const localToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Optional weekly report. Only the worker and the admins can read it.
// TODO: save the text in Firestore (reportes) and the files in Firebase Storage
// (reportes/{uid}/...). The rules must let only the owner and admin/rh read them.
@Component({
  selector: 'app-weekly-report',
  templateUrl: 'weekly-report.page.html',
  styleUrls: ['weekly-report.page.scss'],
  imports: [IonContent, IonTextarea, IonButton],
})
export class WeeklyReportPage {
  private readonly toast = inject(ToastController);
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
  readonly sent = signal<SentReport[]>([
    {
      id: 'ejemplo',
      week: weekLabel(addWeeks(this.thisWeek, -1)),
      text: 'Ejemplo: terminé el informe de tiquetes y lo compartí con el equipo.',
      files: [{ name: 'tiquetes.pdf', size: 310 * 1024, type: 'application/pdf' }],
      seen: true,
      sample: true,
    },
  ]);

  readonly fileRows = computed(() =>
    this.files().map((f, i) => ({ index: i, name: f.name, kind: fileKind(f), size: formatFileSize(f.size) })),
  );
  readonly problem = computed(() => reportProblem(this.text(), this.files()));
  // Shows the problem only once the person started; an empty form just keeps the button off.
  readonly visibleProblem = computed(() => (this.text() || this.files().length ? this.problem() : ''));
  readonly sentRows = computed(() =>
    this.sent().map((r) => ({
      ...r,
      attachments: r.files.map((f) => `${f.name} · ${formatFileSize(f.size)}`),
    })),
  );

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
    if (this.problem()) return;
    const report: SentReport = {
      id: String(Date.now()),
      week: weekLabel(this.week()),
      text: this.text().trim(),
      files: this.files().map((f) => ({ name: f.name, size: f.size, type: f.type })),
      seen: false,
      sample: false,
    };
    this.sent.update((list) => [report, ...list]);
    this.text.set('');
    this.files.set([]);
    const toast = await this.toast.create({
      message: 'Reporte listo. Todavía no se guarda: falta conectar la base de datos.',
      duration: 4000,
      position: 'bottom',
    });
    await toast.present();
  }
}
