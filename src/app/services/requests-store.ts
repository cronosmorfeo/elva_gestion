import { Injectable, computed, inject, signal } from '@angular/core';
import { getApps } from 'firebase/app';
import type { DocumentData, Query, QuerySnapshot, Unsubscribe } from 'firebase/firestore';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import type { OvertimeRequest, RequestStatus, VacationRequest } from '../admin-dashboard/admin-requests';
import type { Notice, NoticeInput } from '../notices/notice-utils';
import { localDateTime, sortNotices, unseenNotices } from '../notices/notice-utils';
import type { ReportFile, WorkReport } from '../reports/report-utils';

import type { Worker } from './current-worker';
import { currentWorker } from './current-worker';
import {
  COLLECTIONS,
  sortBySent,
  toNotice,
  toOvertimeRequest,
  toVacationRequest,
  toWorkReport,
} from './firestore-mappers';
import type { BrowserNotice, LastSeen } from './notification-events';
import { lastSeen, noticeEvents, overtimeEvents, vacationEvents } from './notification-events';
import { NotificationsService } from './notifications';

// Requests, notices and reports from Firestore, shared by the worker pages and the dashboard.
// The lists update live: a new request or a decision shows up without reloading.
// Admins (admin/rh) get every document; a worker only their own. The Firestore rules must enforce the same.
@Injectable({ providedIn: 'root' })
export class RequestsStore {
  private readonly notifications = inject(NotificationsService);

  readonly vacations = signal<VacationRequest[]>([]);
  readonly overtime = signal<OvertimeRequest[]>([]);
  readonly notices = signal<Notice[]>([]);
  readonly reports = signal<WorkReport[]>([]);
  readonly loadError = signal(false);
  readonly sortedNotices = computed(() => sortNotices(this.notices()));
  readonly noticesSeenAt = signal('');
  readonly unseenNotices = computed(() => unseenNotices(this.notices(), this.noticesSeenAt()));

  private worker: Promise<Worker | null> | null = null;
  private watching = '';
  private uid = '';
  private stops: Unsubscribe[] = [];

  // Cached per session; cleared on logout.
  currentWorker(): Promise<Worker | null> {
    this.worker ??= currentWorker();
    return this.worker;
  }

  // Called by the navbar once it knows who signed in and whether they are admin/rh.
  watch(uid: string, admin: boolean): void {
    const key = `${uid}:${admin}`;
    if (this.watching === key || getApps().length === 0) return;
    this.stopWatching();
    this.watching = key;
    this.uid = uid;
    this.noticesSeenAt.set(readSeen(uid));
    const db = getFirestore();
    const scoped = (name: string): Query =>
      admin ? collection(db, name) : query(collection(db, name), where('uid', '==', uid));
    // Each list remembers how it looked last time, to notify only what changed after the first load.
    let vacationsSeen: LastSeen = null;
    let overtimeSeen: LastSeen = null;
    let noticesSeen: LastSeen = null;
    this.listen(scoped(COLLECTIONS.vacations), (s) => {
      const list = sortBySent(mapDocs(s, toVacationRequest));
      this.vacations.set(list);
      this.notify(vacationEvents(vacationsSeen, list, admin));
      vacationsSeen = lastSeen(list);
    });
    this.listen(scoped(COLLECTIONS.overtime), (s) => {
      const list = sortBySent(mapDocs(s, toOvertimeRequest));
      this.overtime.set(list);
      this.notify(overtimeEvents(overtimeSeen, list, admin));
      overtimeSeen = lastSeen(list);
    });
    this.listen(scoped(COLLECTIONS.reports), (s) => this.reports.set(sortBySent(mapDocs(s, toWorkReport))));
    this.listen(collection(db, COLLECTIONS.notices), (s) => {
      const list = mapDocs(s, toNotice);
      this.notices.set(list);
      this.notify(noticeEvents(noticesSeen, list, admin));
      noticesSeen = lastSeen(list);
    });
  }

  forgetWorker(): void {
    this.worker = null;
    this.stopWatching();
    this.uid = '';
    this.vacations.set([]);
    this.overtime.set([]);
    this.notices.set([]);
    this.reports.set([]);
    this.noticesSeenAt.set('');
    this.loadError.set(false);
  }

  async addOvertime(request: { start: string; end: string; task: string }): Promise<void> {
    const owner = await this.signedInWorker();
    await addDoc(collection(getFirestore(), COLLECTIONS.overtime), {
      uid: owner.uid,
      nombreSolicitante: owner.name,
      correoSolicitante: owner.email ?? '',
      inicio: request.start,
      fin: request.end,
      tarea: request.task.trim(),
      estado: 'pendiente',
      fechaSolicitud: serverTimestamp(),
    });
  }

  decideVacation(id: string, status: RequestStatus): Promise<void> {
    return this.decide(COLLECTIONS.vacations, id, status);
  }

  decideOvertime(id: string, status: RequestStatus): Promise<void> {
    return this.decide(COLLECTIONS.overtime, id, status);
  }

  async saveNotice(input: NoticeInput, author: string, id?: string): Promise<void> {
    const clean = { titulo: input.title.trim(), mensaje: input.message.trim(), importante: input.important };
    const db = getFirestore();
    if (id) {
      await updateDoc(doc(db, COLLECTIONS.notices, id), { ...clean, updatedAt: serverTimestamp() });
      return;
    }
    await addDoc(collection(db, COLLECTIONS.notices), {
      ...clean,
      autor: author,
      autorUid: this.uid,
      createdAt: serverTimestamp(),
      updatedAt: null,
    });
  }

  async deleteNotice(id: string): Promise<void> {
    await deleteDoc(doc(getFirestore(), COLLECTIONS.notices, id));
  }

  // Saved in this browser only, per user. Enough for the "new notices" number in the navbar.
  markNoticesSeen(): void {
    const now = localDateTime(new Date());
    this.noticesSeenAt.set(now);
    if (this.uid) writeSeen(this.uid, now);
  }

  // Files are not uploaded yet (Storage needs the Blaze plan): only their name, size and type are saved.
  async sendReport(report: { week: string; text: string; files: ReportFile[] }): Promise<void> {
    const owner = await this.signedInWorker();
    await addDoc(collection(getFirestore(), COLLECTIONS.reports), {
      uid: owner.uid,
      nombre: owner.name,
      semana: report.week,
      texto: report.text.trim(),
      archivos: report.files.map((f) => ({ nombre: f.name, tamano: f.size, tipo: f.type })),
      visto: null,
      fechaEnvio: serverTimestamp(),
    });
  }

  async markReportsSeen(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = getFirestore();
    const batch = writeBatch(db);
    for (const id of ids) {
      batch.update(doc(db, COLLECTIONS.reports, id), { visto: { por: this.uid, fecha: serverTimestamp() } });
    }
    await batch.commit();
  }

  private async decide(name: string, id: string, status: RequestStatus): Promise<void> {
    await updateDoc(doc(getFirestore(), name, id), {
      estado: status,
      decision: { por: this.uid, fecha: serverTimestamp() },
    });
  }

  private async signedInWorker(): Promise<Worker> {
    const worker = await this.currentWorker();
    if (!worker) throw new Error('No hay sesión iniciada.');
    return worker;
  }

  private listen(source: Query, next: (snap: QuerySnapshot) => void): void {
    const stop = onSnapshot(
      source,
      (snap) => {
        next(snap);
        this.loadError.set(false);
      },
      (err) => {
        console.error('[RequestsStore] Firestore read failed:', err);
        this.loadError.set(true);
      },
    );
    this.stops.push(stop);
  }

  private notify(events: BrowserNotice[]): void {
    for (const event of events) void this.notifications.show(event);
  }

  private stopWatching(): void {
    for (const stop of this.stops) stop();
    this.stops = [];
    this.watching = '';
  }
}

// "estimate" gives a time to our own writes before the server confirms them, so they show up at once.
function mapDocs<T>(snap: QuerySnapshot, map: (id: string, data: DocumentData) => T | null): T[] {
  return snap.docs
    .map((d) => map(d.id, d.data({ serverTimestamps: 'estimate' })))
    .filter((item): item is T => item !== null);
}

const SEEN_KEY = 'elva.avisosVistos.';

// Browser storage can be blocked (private mode); then every notice just counts as new.
function readSeen(uid: string): string {
  try {
    return localStorage.getItem(SEEN_KEY + uid) ?? '';
  } catch {
    return '';
  }
}

function writeSeen(uid: string, value: string): void {
  try {
    localStorage.setItem(SEEN_KEY + uid, value);
  } catch {
    // Not saved; the count resets on reload.
  }
}
