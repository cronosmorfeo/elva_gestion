import { Component, computed, inject, signal } from '@angular/core';
import { IonButton, IonContent, IonTextarea, ToastController } from '@ionic/angular';

import { filesAvailable, openReportFile, uploadReportFile } from '../services/report-files';
import { RequestsStore } from '../services/requests-store';

import {
  FILE_ACCEPT,
  MAX_FILES,
  addWeeks,
  fileKind,
  formatFileSize,
  mondayOf,
  reportProblem,
  weekLabel,
  type ReportFile,
} from './report-utils';

const pad = (n: number): string => String(n).padStart(2, '0');
const localToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Optional weekly report, saved in Firestore (weekly_reports). Only the worker and the admins can read it.
// Attachments go to Backblaze B2 through the Worker before the report is saved (services/report-files.ts).
// Without a Worker in environment.ts, only their names are saved, as before.
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
  readonly accept = FILE_ACCEPT;
  readonly uploading = signal('');
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
        attachments: r.files.map((f) => ({ label: `${f.name} · ${formatFileSize(f.size)}`, path: f.path ?? '' })),
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
    const picked = this.files();
    const upload = picked.length > 0 && filesAvailable();
    this.sending.set(true);
    let message =
      picked.length && !upload
        ? 'Reporte enviado. Los archivos no se subieron: solo se guardó su nombre.'
        : 'Reporte enviado.';
    try {
      // Every file first: if one fails, the report is not saved and nothing the person wrote is lost.
      const files: ReportFile[] = [];
      for (const [i, f] of picked.entries()) {
        if (upload) this.uploading.set(`Subiendo archivo ${i + 1} de ${picked.length}…`);
        const path = upload ? await uploadReportFile(f) : undefined;
        files.push({ name: f.name, size: f.size, type: f.type, ...(path ? { path } : {}) });
      }
      this.uploading.set('');
      await this.store.sendReport({ week: this.week(), text: this.text(), files });
      this.text.set('');
      this.files.set([]);
    } catch (err) {
      console.error('[WeeklyReport] Could not send the report:', err);
      message = this.uploading()
        ? 'No se pudo subir un archivo. Revise la conexión e intente de nuevo.'
        : 'No se pudo enviar el reporte. Revise la conexión e intente de nuevo.';
      this.uploading.set('');
    } finally {
      this.sending.set(false);
    }
    const toast = await this.toast.create({ message, duration: 5000, position: 'bottom' });
    await toast.present();
  }

  async openFile(path: string): Promise<void> {
    try {
      await openReportFile(path);
    } catch (err) {
      console.error('[WeeklyReport] Could not open the file:', err);
      const toast = await this.toast.create({
        message: 'No se pudo abrir el archivo. Intente de nuevo.',
        duration: 4000,
        position: 'bottom',
      });
      await toast.present();
    }
  }
}
