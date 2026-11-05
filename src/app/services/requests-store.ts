import { Injectable, computed, signal } from '@angular/core';

import { localIsoDate } from '../admin-dashboard/admin-dates';
import type { OvertimeRequest, RequestStatus, VacationRequest } from '../admin-dashboard/admin-requests';
import { SAMPLE_OVERTIME, SAMPLE_VACATIONS } from '../admin-dashboard/admin-sample-data';
import { exampleRequests } from '../my-requests/my-requests-utils';
import type { Notice, NoticeInput } from '../notices/notice-utils';
import { localDateTime, sampleNotices, sortNotices, unseenNotices } from '../notices/notice-utils';

import type { Worker } from './current-worker';
import { currentWorker } from './current-worker';

// Shared, in-memory state so a request sent by a worker shows up in the dashboard,
// and the admin's decision shows up in "Mis solicitudes". It is lost on reload.
// TODO: replace with Firestore (solicitudes_vacaciones, solicitudes_horas, avisos) once the backend is ready.
// Rules: a worker reads only their own requests; only admin/rh decide and write notices; every signed-in user reads notices.
@Injectable({ providedIn: 'root' })
export class RequestsStore {
  readonly vacations = signal<VacationRequest[]>([...SAMPLE_VACATIONS]);
  readonly overtime = signal<OvertimeRequest[]>([...SAMPLE_OVERTIME]);
  readonly notices = signal<Notice[]>(sampleNotices());
  readonly sortedNotices = computed(() => sortNotices(this.notices()));
  readonly noticesSeenAt = signal('');
  readonly unseenNotices = computed(() => unseenNotices(this.notices(), this.noticesSeenAt()));

  private worker: Promise<Worker | null> | null = null;
  private readonly seeded = new Set<string>();
  private nextId = 1;

  // Cached per session; cleared on logout.
  currentWorker(): Promise<Worker | null> {
    this.worker ??= currentWorker();
    return this.worker;
  }

  forgetWorker(): void {
    this.worker = null;
    this.noticesSeenAt.set('');
  }

  addExamplesFor(owner: Worker): void {
    if (this.seeded.has(owner.uid)) return;
    this.seeded.add(owner.uid);
    const examples = exampleRequests(owner, localIsoDate(new Date()));
    this.vacations.update((list) => [...list, ...examples.vacations]);
    this.overtime.update((list) => [...list, ...examples.overtime]);
  }

  // RH review is not built yet, so new requests go straight to the admins.
  addVacation(owner: Worker, request: { start: string; returnDate: string; balance: number; comment: string }): void {
    const vacation: VacationRequest = {
      ...request,
      id: this.id('v'),
      ownerId: owner.uid,
      employee: owner.name,
      comment: request.comment.trim(),
      rhReviewed: true,
      status: 'pendiente',
      sentAt: localDateTime(new Date()),
    };
    this.vacations.update((list) => [vacation, ...list]);
  }

  addOvertime(owner: Worker, request: { start: string; end: string; task: string }): void {
    const overtime: OvertimeRequest = {
      ...request,
      id: this.id('o'),
      ownerId: owner.uid,
      employee: owner.name,
      task: request.task.trim(),
      rhReviewed: true,
      status: 'pendiente',
      sentAt: localDateTime(new Date()),
    };
    this.overtime.update((list) => [overtime, ...list]);
  }

  decideVacation(id: string, status: RequestStatus): void {
    this.vacations.update((list) => list.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  decideOvertime(id: string, status: RequestStatus): void {
    this.overtime.update((list) => list.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  saveNotice(input: NoticeInput, author: string, id?: string): void {
    const clean = { title: input.title.trim(), message: input.message.trim(), important: input.important };
    const now = localDateTime(new Date());
    if (id) {
      this.notices.update((list) => list.map((n) => (n.id === id ? { ...n, ...clean, updatedAt: now } : n)));
      return;
    }
    this.notices.update((list) => [{ ...clean, id: this.id('n'), author, createdAt: now }, ...list]);
  }

  deleteNotice(id: string): void {
    this.notices.update((list) => list.filter((n) => n.id !== id));
  }

  markNoticesSeen(): void {
    this.noticesSeenAt.set(localDateTime(new Date()));
  }

  private id(prefix: string): string {
    return `${prefix}-${Date.now()}-${this.nextId++}`;
  }
}
