import { Injectable, computed, inject, signal } from '@angular/core';
import { getApps } from 'firebase/app';
import type { DocumentData, Query, QuerySnapshot, Unsubscribe } from 'firebase/firestore';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import type { OvertimeRequest, VacationRequest } from '../admin-dashboard/admin-requests';
import { vacationDays } from '../admin-dashboard/admin-requests';
import type { Approver } from '../admin-dashboard/decisions';
import { APPROVAL_FIELDS } from '../admin-dashboard/decisions';
import type { Notice, NoticeInput } from '../notices/notice-utils';
import { localDateTime, sortNotices, unseenNotices } from '../notices/notice-utils';
import type { Profile } from '../profile/profile-utils';
import { toProfile } from '../profile/profile-utils';
import type { ReportFile, WorkReport } from '../reports/report-utils';

import type { BankAccount, BankChangeRequest } from './bank-account';
import {
  BANK_REQUESTS,
  bankChangedEvent,
  bankDocPath,
  bankRequestEvents,
  toBankAccount,
  toBankChangeRequest,
} from './bank-account';
import type { Worker } from './current-worker';
import { currentWorker } from './current-worker';
import { FeatureFlagsService } from './feature-flags';
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
import type { ApproveResult, CancelResult } from './vacation-balance';
import {
  ApproveError,
  availableDays,
  balanceAfterCancel,
  canCancel,
  checkBalance,
  currentBalance,
  deductedDays,
} from './vacation-balance';

// Requests, notices and reports from Firestore, shared by the worker pages and the dashboard.
// The lists update live: a new request or a decision shows up without reloading.
// Admins (admin/rh) get every document; a worker only their own. The Firestore rules must enforce the same.
@Injectable({ providedIn: 'root' })
export class RequestsStore {
  private readonly notifications = inject(NotificationsService);
  private readonly featureFlags = inject(FeatureFlagsService);

  readonly vacations = signal<VacationRequest[]>([]);
  readonly overtime = signal<OvertimeRequest[]>([]);
  readonly notices = signal<Notice[]>([]);
  readonly reports = signal<WorkReport[]>([]);
  readonly loadError = signal(false);
  // The signed-in person's vacation balance today (stored + earned since acumulaDesde), live. null = not on record.
  readonly myBalance = signal<number | null>(null);
  // The signed-in person's own data (colaboradores/{uid}), live, for "Mi perfil".
  readonly myProfile = signal<Profile | null>(null);
  // The signed-in person's payment account (read only for them) and their latest change request.
  readonly myBank = signal<BankAccount | null>(null);
  readonly myBankLoaded = signal(false);
  readonly myBankRequest = signal<BankChangeRequest | null>(null);
  // For admins: requests from workers to change their payment account.
  readonly bankRequests = signal<BankChangeRequest[]>([]);
  readonly myUid = signal('');
  readonly myPendingVacationDays = computed(() =>
    this.vacations()
      .filter((r) => r.ownerId === this.myUid() && r.status === 'pendiente')
      .reduce((sum, r) => sum + vacationDays(r), 0),
  );
  readonly myAvailableDays = computed(() => availableDays(this.myBalance(), this.myPendingVacationDays()));
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
    this.myUid.set(uid);
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
      if (this.featureFlags.flags().vacaciones) this.notify(vacationEvents(vacationsSeen, list, admin));
      vacationsSeen = lastSeen(list);
    });
    this.listen(scoped(COLLECTIONS.overtime), (s) => {
      const list = sortBySent(mapDocs(s, toOvertimeRequest));
      this.overtime.set(list);
      if (this.featureFlags.flags().horasExtra) this.notify(overtimeEvents(overtimeSeen, list, admin));
      overtimeSeen = lastSeen(list);
    });
    this.listen(scoped(COLLECTIONS.reports), (s) => this.reports.set(sortBySent(mapDocs(s, toWorkReport))));
    const stopBalance = onSnapshot(
      doc(db, 'colaboradores', uid),
      (snap) => {
        this.myBalance.set(currentBalance(snap.data(), localDateTime(new Date()).slice(0, 10)));
        this.myProfile.set(toProfile(snap.data()));
      },
      (err) => console.error('[RequestsStore] Could not read my profile:', err),
    );
    this.stops.push(stopBalance);
    let bankBefore: string | null | undefined;
    const stopBank = onSnapshot(
      doc(db, bankDocPath(uid)[0], ...bankDocPath(uid).slice(1)),
      (snap) => {
        const account = toBankAccount(snap.data());
        const changed = bankChangedEvent(bankBefore, account);
        if (changed && this.featureFlags.flags().pagos) void this.notifications.show(changed);
        bankBefore = account?.iban ?? null;
        this.myBank.set(account);
        this.myBankLoaded.set(true);
      },
      (err) => {
        console.error('[RequestsStore] Could not read my payment account:', err);
        this.myBankLoaded.set(true);
      },
    );
    this.stops.push(stopBank);
    let bankRequestsSeen: LastSeen = null;
    this.listen(scoped(BANK_REQUESTS), (s) => {
      const list = sortBySent(mapDocs(s, toBankChangeRequest));
      this.myBankRequest.set(list.find((r) => r.uid === uid) ?? null);
      if (admin) {
        this.bankRequests.set(list.filter((r) => r.status === 'pendiente'));
        if (this.featureFlags.flags().pagos) this.notify(bankRequestEvents(bankRequestsSeen, list));
        bankRequestsSeen = lastSeen(list.map((r) => ({ id: r.id })));
      }
    });
    this.listen(collection(db, COLLECTIONS.notices), (s) => {
      const list = mapDocs(s, toNotice);
      this.notices.set(list);
      if (this.featureFlags.flags().avisos) this.notify(noticeEvents(noticesSeen, list, admin));
      noticesSeen = lastSeen(list);
    });
  }

  forgetWorker(): void {
    this.worker = null;
    this.stopWatching();
    this.uid = '';
    this.myUid.set('');
    this.myBalance.set(null);
    this.myProfile.set(null);
    this.myBank.set(null);
    this.myBankLoaded.set(false);
    this.myBankRequest.set(null);
    this.bankRequests.set([]);
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

  // Rejects with a reason the worker will read. In a transaction, so a request the worker just
  // cancelled, or another admin just decided, is not overwritten.
  // `as` says which side rejects it (RH or the jefatura); either one is enough.
  rejectRequest(kind: 'vacaciones' | 'horas', id: string, reason: string, as: Approver): Promise<void> {
    return this.decidePending(kind === 'vacaciones' ? COLLECTIONS.vacations : COLLECTIONS.overtime, id, {
      estado: 'rechazada',
      decision: { por: this.uid, fecha: serverTimestamp(), motivo: reason.trim(), rol: as },
    });
  }

  // RH's approval is a check before the jefatura: it is saved and the request stays pending.
  // The jefatura's approval is final (with or without RH's): it approves and deducts the days from
  // colaboradores/{uid}.vacaciones_disponibles in one transaction, so everything is saved or nothing is,
  // and two people approving at once only deduct once.
  async approveVacation(id: string, ownerUid: string | undefined, days: number, as: Approver): Promise<ApproveResult> {
    const db = getFirestore();
    const requestRef = doc(db, COLLECTIONS.vacations, id);
    return runTransaction(db, async (tx) => {
      const request = await tx.get(requestRef);
      if (!request.exists()) throw new ApproveError('no-existe');
      const data = request.data();
      const estado: unknown = data['estado'];
      if (estado === 'cancelada') throw new ApproveError('cancelada');
      if (estado && estado !== 'pendiente') throw new ApproveError('ya-decidida');
      const field = APPROVAL_FIELDS[as];
      if (data[field]) throw new ApproveError('ya-aprobo');
      const approval = { por: this.uid, fecha: serverTimestamp() };
      if (as === 'rh') {
        tx.update(requestRef, { [field]: approval });
        return { kind: 'parcial' };
      }
      const ownerRef = ownerUid ? doc(db, 'colaboradores', ownerUid) : null;
      const owner = ownerRef ? await tx.get(ownerRef) : null;
      const ownerData = owner?.data();
      const check = checkBalance(currentBalance(ownerData, localDateTime(new Date()).slice(0, 10)), days);
      if (check.kind === 'insuficiente') throw new ApproveError('insuficiente', check.balance);
      // The stored part goes down; what was earned since acumulaDesde keeps being added on top.
      if (ownerRef && check.kind === 'descontar') {
        tx.update(ownerRef, { vacaciones_disponibles: (ownerData?.['vacaciones_disponibles'] as number) - days });
      }
      const deducted = check.kind === 'descontar' ? days : 0;
      tx.update(requestRef, {
        [field]: approval,
        estado: 'aprobada',
        decision: { por: this.uid, fecha: serverTimestamp(), diasDescontados: deducted },
      });
      return check.kind === 'descontar' ? { kind: 'descontado', next: check.next } : { kind: 'sin-saldo' };
    });
  }

  // The worker cancels a pending or approved request that has not started. It stays saved, marked as
  // cancelada. If approved vacations had days deducted, the same days go back to the balance.
  // All in one transaction, so a decision made a moment before is not overwritten and the days return once.
  async cancelRequest(kind: 'vacaciones' | 'horas', id: string): Promise<CancelResult> {
    const db = getFirestore();
    const ref = doc(db, kind === 'vacaciones' ? COLLECTIONS.vacations : COLLECTIONS.overtime, id);
    const now = localDateTime(new Date());
    return runTransaction(db, async (tx): Promise<CancelResult> => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return { kind: 'ya-decidida' };
      const data = snap.data();
      const estado = typeof data['estado'] === 'string' ? data['estado'] : 'pendiente';
      const start = String(data[kind === 'vacaciones' ? 'diaInicio' : 'inicio'] ?? '');
      const check = canCancel(estado, start, now);
      if (check !== 'si') return { kind: check };
      const wasApproved = estado === 'aprobada';
      const days = deductedDays(kind, estado, data['decision']);
      const ownerRef = days && typeof data['uid'] === 'string' ? doc(db, 'colaboradores', data['uid']) : null;
      const owner = ownerRef ? await tx.get(ownerRef) : null;
      const next = ownerRef ? balanceAfterCancel(owner?.data()?.['vacaciones_disponibles'], days) : null;
      if (ownerRef && next !== null) tx.update(ownerRef, { vacaciones_disponibles: next });
      const returnedDays = next === null ? 0 : days;
      tx.update(ref, {
        estado: 'cancelada',
        cancelacion: {
          por: this.uid,
          fecha: serverTimestamp(),
          estabaAprobada: wasApproved,
          diasDevueltos: returnedDays,
        },
      });
      return { kind: 'cancelada', returnedDays, wasApproved };
    });
  }

  // The worker asks RH to change their payment account. The new account is agreed by Slack.
  async requestBankChange(note: string): Promise<void> {
    const owner = await this.signedInWorker();
    await addDoc(collection(getFirestore(), BANK_REQUESTS), {
      uid: owner.uid,
      nombre: owner.name,
      nota: note.trim(),
      estado: 'pendiente',
      fecha: serverTimestamp(),
    });
  }

  async resolveBankRequest(id: string): Promise<void> {
    await updateDoc(doc(getFirestore(), BANK_REQUESTS, id), {
      estado: 'atendida',
      atendida: { por: this.uid, fecha: serverTimestamp() },
    });
  }

  // Admin/RH only (Edit employee). TODO: the Firestore rules must enforce that.
  async loadBankAccount(uid: string): Promise<BankAccount | null> {
    const [col, ...rest] = bankDocPath(uid);
    return toBankAccount((await getDoc(doc(getFirestore(), col, ...rest))).data());
  }

  async saveBankAccount(uid: string, account: { cedula: string; iban: string; currency: string }): Promise<void> {
    // Nobody changes the account they get paid to; another admin does it.
    if (uid === this.uid) throw new Error('An admin cannot change their own payment account.');
    const [col, ...rest] = bankDocPath(uid);
    await setDoc(doc(getFirestore(), col, ...rest), {
      cedula: account.cedula.trim(),
      iban: account.iban.replace(/\s+/g, '').toUpperCase(),
      monedaCuenta: account.currency,
      updatedAt: serverTimestamp(),
      updatedBy: this.uid,
    });
  }

  // Same flow as vacations, without a balance: RH's approval is saved and the request stays pending;
  // the jefatura's approval is final, with or without RH's. One transaction, so two people approving
  // at once cannot overwrite each other or a cancellation.
  async approveOvertime(id: string, as: Approver): Promise<'parcial' | 'aprobada'> {
    const db = getFirestore();
    const ref = doc(db, COLLECTIONS.overtime, id);
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new ApproveError('no-existe');
      const data = snap.data();
      const estado: unknown = data['estado'];
      if (estado === 'cancelada') throw new ApproveError('cancelada');
      if (estado && estado !== 'pendiente') throw new ApproveError('ya-decidida');
      const field = APPROVAL_FIELDS[as];
      if (data[field]) throw new ApproveError('ya-aprobo');
      const approval = { por: this.uid, fecha: serverTimestamp() };
      if (as === 'rh') {
        tx.update(ref, { [field]: approval });
        return 'parcial';
      }
      tx.update(ref, { [field]: approval, estado: 'aprobada', decision: { por: this.uid, fecha: serverTimestamp() } });
      return 'aprobada';
    });
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

  // Saves a decision only while the request is still pending, in one transaction,
  // so it never overwrites a cancellation or another admin's decision.
  private async decidePending(name: string, id: string, changes: DocumentData): Promise<void> {
    const db = getFirestore();
    const ref = doc(db, name, id);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new ApproveError('no-existe');
      const estado: unknown = snap.data()['estado'];
      if (estado === 'cancelada') throw new ApproveError('cancelada');
      if (estado && estado !== 'pendiente') throw new ApproveError('ya-decidida');
      tx.update(ref, changes);
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
