import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonContent, ToastController } from '@ionic/angular';
import { getAuth } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, getFirestore, serverTimestamp, updateDoc } from 'firebase/firestore';

import type { NoticeInput } from '../notices/notice-utils';
import { MAX_NOTICE_MESSAGE, MAX_NOTICE_TITLE, noticeProblem } from '../notices/notice-utils';
import { fileKind, formatFileSize, unseenCount, weekLabel } from '../reports/report-utils';
import { AuthService } from '../services/auth';
import { bankProblem, updatedText } from '../services/bank-account';
import { NotificationsService, notifyMessage } from '../services/notifications';
import { RequestsStore } from '../services/requests-store';
import type { ApproveResult } from '../services/vacation-balance';
import { ApproveError, approveProblemText } from '../services/vacation-balance';
import { COUNTRY_OPTIONS, CURRENCY_OPTIONS, ROLE_OPTIONS, SCHEDULES, roleLabel } from '../shared/employee-labels';
import {
  currencySymbol,
  formatCedula,
  formatThousands,
  groupIban,
  hoursText,
  isValidCedula,
  isValidCrIban,
  normalizeIban,
  parseAmount,
  parseScheduleText,
  scheduleText,
  shiftMinutes,
} from '../tab3/employee-form';

import {
  formatClock,
  formatLongDate,
  formatShortDate,
  formatTime,
  localIsoDate,
  msUntilMidnight,
  quincenaLabel,
} from './admin-dates';
import type { Payee, PendingPayment, RequestStatus, VacationRequest } from './admin-requests';
import {
  formatColones,
  formatHours,
  formatIban,
  maskIban,
  onVacationThisWeek,
  overtimeMinutes,
  overtimePay,
  paymentTotals,
  upcomingHolidays,
  vacationDays,
} from './admin-requests';
import { MAX_REASON, reasonProblem, vacationConflicts } from './decisions';
import { ALL_MONTHS, matchesRequest, requestMonths } from './request-filter';

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  schedule: string;
  startDate: string;
  active: boolean;
  // Raw values, used by the edit window.
  tipo: string;
  jornada: string;
  horario: string;
  fechaIngreso: string;
  salario: number | null;
  moneda: string;
  pais: string;
  vacationBalance: number | null;
}

interface EditForm {
  id: string;
  self: boolean;
  email: string;
  nombre: string;
  tipo: string;
  pais: string;
  fechaIngreso: string;
  salario: number | null;
  salarioTexto: string;
  moneda: string;
  jornada: string;
  horaInicio: string;
  horaFin: string;
  vacaciones: string; // vacation balance as typed; '' = not on record
  activo: boolean;
  cedula: string;
  iban: string;
  monedaCuenta: string;
}

type EditField =
  'nombre' | 'tipo' | 'pais' | 'fechaIngreso' | 'moneda' | 'jornada' | 'horaInicio' | 'horaFin' | 'monedaCuenta';

const SECTIONS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'vacaciones', label: 'Vacaciones' },
  { id: 'horas-extra', label: 'Horas extra' },
  { id: 'pagos', label: 'Pagos pendientes' },
  { id: 'empleados', label: 'Empleados' },
  { id: 'avisos', label: 'Avisos' },
];

const STATUS_TABS: { id: RequestStatus; label: string }[] = [
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'aprobada', label: 'Aprobadas' },
  { id: 'rechazada', label: 'Rechazadas' },
  { id: 'cancelada', label: 'Canceladas' },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase();
}

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: 'admin-dashboard.page.html',
  styleUrls: ['admin-dashboard.page.scss'],
  imports: [IonContent, RouterLink],
})
export class AdminDashboardPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastController);
  private readonly store = inject(RequestsStore);
  private readonly notifications = inject(NotificationsService);

  readonly notifyState = this.notifications.state;
  readonly sections = SECTIONS;
  readonly roleOptions = ROLE_OPTIONS;
  readonly countryOptions = COUNTRY_OPTIONS;
  readonly currencyOptions = CURRENCY_OPTIONS;
  readonly scheduleOptions = Object.entries(SCHEDULES).map(([value, label]) => ({ value, label }));
  readonly statusTabs = STATUS_TABS;

  readonly now = signal(new Date());
  readonly today = computed(() => localIsoDate(this.now()));
  readonly todayText = computed(() => formatLongDate(this.now()));
  readonly activeSection = signal('resumen');

  readonly profileName = signal('');
  readonly profileRole = signal('');
  readonly profileInitials = computed(() => initials(this.profileName() || 'Admin'));

  // Live from Firestore, shared with the worker pages, so decisions show up in "Mis solicitudes".
  readonly vacations = this.store.vacations;
  readonly overtime = this.store.overtime;

  // Notices for every worker. Admins create, edit and delete them.
  readonly maxNoticeTitle = MAX_NOTICE_TITLE;
  readonly maxNoticeMessage = MAX_NOTICE_MESSAGE;
  readonly noticeForm = signal<(NoticeInput & { id: string | null }) | null>(null);
  readonly noticeError = computed(() => {
    const f = this.noticeForm();
    return f ? noticeProblem(f) : '';
  });
  readonly confirmDeleteId = signal<string | null>(null);
  readonly noticeRows = computed(() =>
    this.store.sortedNotices().map((n) => ({
      ...n,
      date: `${formatShortDate(n.createdAt)}, ${formatTime(n.createdAt)}`,
      edited: !!n.updatedAt,
    })),
  );
  readonly vacationTab = signal<RequestStatus>('pendiente');
  readonly overtimeTab = signal<RequestStatus>('pendiente');
  // TODO: load from Firestore once payroll is defined with HR. Until then the section stays empty.
  readonly payments = signal<PendingPayment[]>([]);
  readonly activity = signal<{ text: string; time: string }[]>([]);

  readonly openPaymentId = signal<string | null>(null);
  readonly ibanVisible = signal(false);
  readonly receipt = signal('');
  readonly paymentDetail = computed(() => {
    const payment = this.payments().find((p) => p.id === this.openPaymentId());
    if (!payment) return null;
    // TODO: read the account from colaboradores/{uid}/privado/pago when payments are real.
    const payee = undefined as Payee | undefined;
    return {
      id: payment.id,
      concept: payment.concept,
      title: payment.concept.toLowerCase(),
      period: quincenaLabel(this.now()),
      amount: formatColones(payment.amount),
      amountDigits: String(payment.amount),
      name: payee?.fullName ?? payment.employee,
      cedula: payee?.cedula ?? '—',
      email: payee?.email ?? '—',
      bank: payee?.bank ?? '—',
      ibanDigits: payee?.iban ?? '',
      ibanShown: payee ? (this.ibanVisible() ? formatIban(payee.iban) : maskIban(payee.iban)) : 'Sin cuenta registrada',
      hasIban: Boolean(payee),
    };
  });

  readonly employees = signal<Employee[]>([]);

  // Weekly reports from Firestore. Only the worker and the admins may read them (rules still to do).
  readonly reports = this.store.reports;
  readonly unseenReports = computed(() => this.reports().filter((r) => !r.seen).length);
  readonly openReportsId = signal<string | null>(null);
  readonly reportHistory = computed(() => {
    const id = this.openReportsId();
    const employee = this.employees().find((e) => e.id === id);
    if (!employee) return null;
    const items = this.reports()
      .filter((r) => r.employeeId === employee.id)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
      .map((r) => ({
        ...r,
        week: weekLabel(r.weekStart),
        sent: `${formatShortDate(r.sentAt.slice(0, 10))}, ${formatTime(r.sentAt)}`,
        attachments: r.files.map((f) => ({ name: f.name, kind: fileKind(f), size: formatFileSize(f.size) })),
      }));
    return { employee, items, unseen: items.filter((r) => !r.seen).length };
  });
  readonly editing = signal<EditForm | null>(null);
  readonly editOriginal = signal('');
  readonly editSaving = signal(false);
  readonly editError = signal('');
  readonly employeesState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly search = signal('');

  // Search by name or email and filter by month, in the vacation and overtime sections.
  readonly vacSearch = signal('');
  readonly vacMonth = signal(ALL_MONTHS);
  readonly otSearch = signal('');
  readonly otMonth = signal(ALL_MONTHS);
  readonly vacMonths = computed(() => requestMonths(this.vacations()));
  readonly otMonths = computed(() => requestMonths(this.overtime()));
  private readonly shownVacations = computed(() =>
    this.vacations().filter((r) => matchesRequest(r, this.vacSearch(), this.vacMonth())),
  );
  private readonly shownOvertime = computed(() =>
    this.overtime().filter((r) => matchesRequest(r, this.otSearch(), this.otMonth())),
  );
  readonly vacFiltered = computed(() => !!this.vacSearch().trim() || this.vacMonth() !== ALL_MONTHS);
  readonly otFiltered = computed(() => !!this.otSearch().trim() || this.otMonth() !== ALL_MONTHS);

  readonly vacationCounts = computed(() => countByStatus(this.shownVacations()));
  readonly overtimeCounts = computed(() => countByStatus(this.shownOvertime()));

  readonly summary = computed(() => {
    const vac = this.vacations();
    const ot = this.overtime();
    const pendingVac = vac.filter((r) => r.status === 'pendiente');
    const approvedVac = vac.filter((r) => r.status === 'aprobada');
    const pendingOt = ot.filter((r) => r.status === 'pendiente');
    const approvedOt = ot.filter((r) => r.status === 'aprobada');
    const waitingRh = pendingVac.filter((r) => !r.rhReviewed).length;
    return {
      pendingVacations: pendingVac.length,
      waitingRh: waitingRh === 1 ? '1 espera revisión de RH' : `${waitingRh} esperan revisión de RH`,
      approvedVacations: approvedVac.length,
      approvedVacationDays: dayCount(approvedVac.reduce((sum, r) => sum + vacationDays(r), 0)),
      pendingOvertime: pendingOt.length,
      pendingOvertimeHours: formatHours(pendingOt.reduce((sum, r) => sum + overtimeMinutes(r), 0)),
      approvedOvertime: approvedOt.length,
      approvedOvertimeHours: formatHours(approvedOt.reduce((sum, r) => sum + overtimeMinutes(r), 0)),
    };
  });

  readonly vacationRows = computed(() =>
    this.shownVacations()
      .filter((r) => r.status === this.vacationTab())
      .map((r) => ({
        id: r.id,
        employee: r.employee,
        balance: balanceText(r, this.employees()),
        start: formatShortDate(r.start),
        returnDate: formatShortDate(r.returnDate),
        days: vacationDays(r),
        rhReviewed: r.rhReviewed,
        canDecide: r.status === 'pendiente' && r.rhReviewed,
        waiting: r.status === 'pendiente' && !r.rhReviewed,
        status: r.status,
        conflicts: r.status === 'pendiente' ? vacationConflicts(r, this.vacations()).join(', ') : '',
        reason: r.reason ?? '',
      })),
  );

  readonly overtimeRows = computed(() =>
    this.shownOvertime()
      .filter((r) => r.status === this.overtimeTab())
      .map((r) => ({
        id: r.id,
        employee: r.employee,
        date:
          r.start.slice(0, 10) === r.end.slice(0, 10)
            ? formatShortDate(r.start)
            : `${formatShortDate(r.start)} → ${formatShortDate(r.end)}`,
        hours: `${formatTime(r.start)} – ${formatTime(r.end)}`,
        total: formatHours(overtimeMinutes(r)),
        pay: overtimePay(r),
        task: r.task,
        rhReviewed: r.rhReviewed,
        canDecide: r.status === 'pendiente' && r.rhReviewed,
        waiting: r.status === 'pendiente' && !r.rhReviewed,
        status: r.status,
        reason: r.reason ?? '',
      })),
  );

  readonly paymentSummary = computed(() => {
    const t = paymentTotals(this.payments());
    return {
      salaries: formatColones(t.salaries),
      salaryDetail: t.salaryCount === 1 ? '1 persona' : `${t.salaryCount} personas`,
      overtime: formatColones(t.overtime),
      overtimeDetail: t.overtimeCount === 1 ? '1 pago' : `${t.overtimeCount} pagos`,
      pendingCount: t.pendingCount,
      paidText: t.paidCount === 1 ? '1 pagado' : `${t.paidCount} pagados`,
    };
  });

  readonly pendingPayments = computed(() =>
    this.payments()
      .filter((p) => !p.paid)
      .map((p) => ({ id: p.id, concept: p.concept, employee: p.employee, amount: formatColones(p.amount) })),
  );

  readonly onVacation = computed(() =>
    onVacationThisWeek(this.vacations(), this.today()).map((r) => ({
      id: r.id,
      employee: r.employee,
      until: `vuelve el ${formatShortDate(r.returnDate)}`,
    })),
  );

  readonly holidays = computed(() =>
    upcomingHolidays(this.today(), 3).map((h) => ({ ...h, label: formatShortDate(h.date) })),
  );

  readonly filteredEmployees = computed(() => {
    const term = this.search().trim().toLowerCase();
    const list = this.employees();
    if (!term) return list;
    return list.filter((e) => e.name.toLowerCase().includes(term) || e.email.toLowerCase().includes(term));
  });

  readonly editState = computed(() => {
    const f = this.editing();
    if (!f) return null;
    const missing: string[] = [];
    if (f.nombre.trim().length < 3) missing.push('nombre completo');
    if (!f.pais) missing.push('país');
    if (!f.fechaIngreso) missing.push('fecha de ingreso');
    if (!f.salario) missing.push('salario');
    if (!f.moneda) missing.push('moneda');
    if (!f.jornada) missing.push('jornada');
    if (!scheduleText(f.horaInicio, f.horaFin)) missing.push('horario');
    const hadBalance = (JSON.parse(this.editOriginal() || '{}') as Partial<EditForm>).vacaciones;
    const vacationError =
      f.vacaciones === ''
        ? hadBalance
          ? 'Escribí los días de vacaciones (puede ser 0).'
          : ''
        : vacationProblem(f.vacaciones);
    const changed = JSON.stringify(f) !== this.editOriginal();
    return {
      symbol: currencySymbol(f.moneda),
      schedule: scheduleText(f.horaInicio, f.horaFin),
      hours: scheduleText(f.horaInicio, f.horaFin) ? hoursText(shiftMinutes(f.horaInicio, f.horaFin)) : '',
      cedulaError: Boolean(f.cedula) && !isValidCedula(f.cedula),
      bankError: bankProblem(f.cedula, f.iban, f.monedaCuenta),
      ibanComplete: normalizeIban(f.iban).length >= 22,
      ibanValid: isValidCrIban(f.iban),
      missing: missing.length ? `Falta: ${missing.join(', ')}.` : '',
      vacationError,
      canSave:
        missing.length === 0 &&
        !vacationError &&
        this.editBank() === 'ready' &&
        !bankProblem(f.cedula, f.iban, f.monedaCuenta) &&
        changed &&
        !this.editSaving(),
      changed,
    };
  });

  readonly employeeTotals = computed(() => {
    const list = this.employees();
    const active = list.filter((e) => e.active).length;
    return `${active} ${active === 1 ? 'activo' : 'activos'} · ${list.length - active} ${
      list.length - active === 1 ? 'inactivo' : 'inactivos'
    }`;
  });

  constructor() {
    this.scheduleMidnight(inject(DestroyRef));
    void this.loadProfile();
    void this.loadEmployees();
  }

  goTo(id: string): void {
    this.activeSection.set(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  setRequestFilter(target: 'vacSearch' | 'vacMonth' | 'otSearch' | 'otMonth', event: Event): void {
    this[target].set((event.target as HTMLInputElement | HTMLSelectElement).value);
  }

  clearRequestFilter(kind: 'vac' | 'ot'): void {
    if (kind === 'vac') {
      this.vacSearch.set('');
      this.vacMonth.set(ALL_MONTHS);
    } else {
      this.otSearch.set('');
      this.otMonth.set(ALL_MONTHS);
    }
  }

  setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  async decideVacation(id: string, status: RequestStatus): Promise<void> {
    const request = this.vacations().find((r) => r.id === id);
    if (!request) return;
    if (status === 'rechazada') {
      this.openReject('vacaciones', id, request.employee);
      return;
    }
    const owner = ownerOf(request, this.employees());
    const days = vacationDays(request);
    let result: ApproveResult;
    try {
      result = await this.store.approveVacation(id, owner?.id, days);
    } catch (err) {
      const message =
        err instanceof ApproveError
          ? approveProblemText(err.problem, request.employee, err.balance)
          : 'No se pudo guardar. Revisá la conexión e intentá de nuevo.';
      if (!(err instanceof ApproveError)) console.error('[AdminDashboard] Could not approve the vacation:', err);
      const toast = await this.toast.create({ message, duration: 5000, position: 'bottom' });
      await toast.present();
      return;
    }
    if (result.kind === 'descontado' && owner) {
      this.employees.update((list) =>
        list.map((e) => (e.id === owner.id ? { ...e, vacationBalance: result.next } : e)),
      );
    }
    await this.log(
      `${this.profileName() || 'Vos'} aprobó las vacaciones de ${request.employee}`,
      result.kind === 'descontado'
        ? `Aprobada. Se descontaron ${dayCount(days)}; a ${request.employee} le quedan ${dayCount(result.next)}.`
        : `Aprobada. ${request.employee} no tiene saldo registrado, así que no se descontaron días.`,
    );
  }

  async decideOvertime(id: string, status: RequestStatus): Promise<void> {
    const request = this.overtime().find((r) => r.id === id);
    if (!request) return;
    if (status === 'rechazada') {
      this.openReject('horas', id, request.employee);
      return;
    }
    try {
      await this.store.approveOvertime(id);
    } catch (err) {
      const message =
        err instanceof ApproveError
          ? approveProblemText(err.problem, request.employee, 0)
          : 'No se pudo guardar. Revisá la conexión e intentá de nuevo.';
      if (!(err instanceof ApproveError)) console.error('[AdminDashboard] Could not approve the overtime:', err);
      const toast = await this.toast.create({ message, duration: 5000, position: 'bottom' });
      await toast.present();
      return;
    }
    await this.logDecision(`las horas extra de ${request.employee}`, status);
  }

  // Rejecting asks for a reason in a small window; the worker sees it in "Mis solicitudes".
  readonly maxReason = MAX_REASON;
  readonly rejecting = signal<{ kind: 'vacaciones' | 'horas'; id: string; employee: string; reason: string } | null>(
    null,
  );
  readonly rejectError = computed(() => {
    const r = this.rejecting();
    return r ? reasonProblem(r.reason) : '';
  });
  readonly rejectSaving = signal(false);

  private openReject(kind: 'vacaciones' | 'horas', id: string, employee: string): void {
    this.rejecting.set({ kind, id, employee, reason: '' });
    setTimeout(() => document.getElementById('reject-reason')?.focus());
  }

  setRejectReason(event: Event): void {
    const reason = (event.target as HTMLTextAreaElement).value;
    this.rejecting.update((r) => (r ? { ...r, reason } : r));
  }

  closeReject(): void {
    this.rejecting.set(null);
  }

  async confirmReject(): Promise<void> {
    const r = this.rejecting();
    if (!r || this.rejectError() || this.rejectSaving()) return;
    this.rejectSaving.set(true);
    try {
      await this.store.rejectRequest(r.kind, r.id, r.reason);
    } catch (err) {
      const message =
        err instanceof ApproveError
          ? approveProblemText(err.problem, r.employee, 0)
          : 'No se pudo guardar. Revisá la conexión e intentá de nuevo.';
      if (!(err instanceof ApproveError)) console.error('[AdminDashboard] Could not reject:', err);
      const toast = await this.toast.create({ message, duration: 5000, position: 'bottom' });
      await toast.present();
      return;
    } finally {
      this.rejectSaving.set(false);
    }
    this.rejecting.set(null);
    const what = r.kind === 'vacaciones' ? 'las vacaciones' : 'las horas extra';
    await this.logDecision(`${what} de ${r.employee}`, 'rechazada');
  }

  openNotice(id?: string): void {
    const notice = id ? this.store.notices().find((n) => n.id === id) : undefined;
    this.confirmDeleteId.set(null);
    this.noticeForm.set(
      notice
        ? { id: notice.id, title: notice.title, message: notice.message, important: notice.important }
        : { id: null, title: '', message: '', important: false },
    );
    setTimeout(() => document.getElementById('notice-title')?.focus());
  }

  closeNotice(): void {
    const id = this.noticeForm()?.id;
    this.noticeForm.set(null);
    setTimeout(() => document.getElementById(id ? `notice-${id}` : 'notice-new')?.focus());
  }

  setNoticeText(field: 'title' | 'message', event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.noticeForm.update((f) => (f ? { ...f, [field]: value } : f));
  }

  setNoticeImportant(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.noticeForm.update((f) => (f ? { ...f, important: checked } : f));
  }

  async saveNotice(): Promise<void> {
    const f = this.noticeForm();
    if (!f || this.noticeError()) return;
    const author = this.profileName() || 'Administración';
    if (!(await this.saved(this.store.saveNotice(f, author, f.id ?? undefined)))) return;
    this.noticeForm.set(null);
    await this.log(
      `${this.profileName() || 'Vos'} ${f.id ? 'editó' : 'publicó'} el aviso "${f.title.trim()}"`,
      f.id ? 'Aviso actualizado.' : 'Aviso publicado. Ya lo ven los trabajadores en Avisos.',
    );
  }

  async deleteNotice(id: string): Promise<void> {
    const notice = this.store.notices().find((n) => n.id === id);
    this.confirmDeleteId.set(null);
    if (!notice) return;
    if (!(await this.saved(this.store.deleteNotice(id)))) return;
    await this.log(`${this.profileName() || 'Vos'} borró el aviso "${notice.title}"`, 'Aviso borrado.');
  }

  openPayment(id: string): void {
    this.ibanVisible.set(false);
    this.receipt.set('');
    this.openPaymentId.set(id);
    setTimeout(() => document.getElementById('pay-close')?.focus());
  }

  closePayment(): void {
    const id = this.openPaymentId();
    this.openPaymentId.set(null);
    this.ibanVisible.set(false);
    if (id) setTimeout(() => document.getElementById(`pay-${id}`)?.focus());
  }

  toggleIban(): void {
    const detail = this.paymentDetail();
    if (!detail) return;
    const show = !this.ibanVisible();
    this.ibanVisible.set(show);
    // Leaves a trace of who looked at the account.
    if (show) this.addActivity(`${this.profileName() || 'Vos'} vio la cuenta bancaria de ${detail.name}`);
  }

  setReceipt(event: Event): void {
    this.receipt.set((event.target as HTMLInputElement).value);
  }

  async copy(text: string, what: string): Promise<void> {
    let message = `${what} copiado.`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      message = `No se pudo copiar ${what.toLowerCase()}. Seleccionalo y copialo a mano.`;
    }
    const toast = await this.toast.create({ message, duration: 2000, position: 'bottom' });
    await toast.present();
  }

  async confirmPayment(): Promise<void> {
    const detail = this.paymentDetail();
    const receipt = this.receipt().trim();
    if (!detail || !receipt) return;
    this.payments.update((list) => list.map((p) => (p.id === detail.id ? { ...p, paid: true } : p)));
    this.openPaymentId.set(null);
    this.ibanVisible.set(false);
    await this.log(
      `${this.profileName() || 'Vos'} pagó ${detail.concept.toLowerCase()} a ${detail.name} (${detail.amount}, comprobante ${receipt})`,
      'Pago registrado. Todavía no se guarda en la base de datos.',
    );
  }

  unseenFor(employeeId: string): number {
    return unseenCount(this.reports(), employeeId);
  }

  openReports(id: string): void {
    this.openReportsId.set(id);
    setTimeout(() => document.getElementById('reports-close')?.focus());
  }

  closeReports(): void {
    const id = this.openReportsId();
    this.openReportsId.set(null);
    if (id) setTimeout(() => document.getElementById(`reports-${id}`)?.focus());
  }

  // Admins can only mark a report as seen. Questions go to the person by Slack.
  async markSeen(reportId: string): Promise<void> {
    const report = this.reports().find((r) => r.id === reportId);
    if (!report || report.seen) return;
    if (!(await this.saved(this.store.markReportsSeen([reportId])))) return;
    this.addActivity(
      `${this.profileName() || 'Vos'} vio el reporte de ${report.employee} (${weekLabel(report.weekStart).toLowerCase()})`,
    );
  }

  async markAllSeen(): Promise<void> {
    const history = this.reportHistory();
    if (!history || history.unseen === 0) return;
    const ids = history.items.filter((r) => !r.seen).map((r) => r.id);
    if (!(await this.saved(this.store.markReportsSeen(ids)))) return;
    this.addActivity(`${this.profileName() || 'Vos'} vio ${history.unseen} reporte(s) de ${history.employee.name}`);
  }

  openEdit(id: string): void {
    const e = this.employees().find((x) => x.id === id);
    if (!e) return;
    const times = parseScheduleText(e.horario);
    const form: EditForm = {
      id: e.id,
      self: e.id === getAuth().currentUser?.uid,
      email: e.email,
      nombre: e.name,
      tipo: e.tipo || 'regular',
      pais: e.pais,
      fechaIngreso: e.fechaIngreso,
      salario: e.salario,
      salarioTexto: formatThousands(e.salario),
      moneda: e.moneda,
      jornada: e.jornada,
      horaInicio: times?.start ?? '',
      horaFin: times?.end ?? '',
      vacaciones: e.vacationBalance === null ? '' : String(e.vacationBalance),
      activo: e.active,
      cedula: '',
      iban: '',
      monedaCuenta: '',
    };
    this.editing.set(form);
    this.editOriginal.set(JSON.stringify(form));
    this.editError.set('');
    setTimeout(() => document.getElementById('edit-close')?.focus());
    void this.loadEditBank(e.id);
  }

  // The payment account lives apart (colaboradores/{uid}/privado/pago), so it loads after the window opens.
  readonly editBank = signal<'loading' | 'ready' | 'error'>('ready');
  readonly editBankUpdated = signal('');

  private async loadEditBank(id: string): Promise<void> {
    this.editBank.set('loading');
    this.editBankUpdated.set('');
    try {
      const account = await this.store.loadBankAccount(id);
      const f = this.editing();
      if (!f || f.id !== id) return;
      const filled = {
        ...f,
        cedula: account?.cedula ?? '',
        iban: account ? groupIban(account.iban) : '',
        monedaCuenta: account?.currency ?? '',
      };
      // What was saved is the starting point, so only real changes enable "Guardar cambios".
      const original = JSON.parse(this.editOriginal()) as EditForm;
      this.editOriginal.set(
        JSON.stringify({ ...original, cedula: filled.cedula, iban: filled.iban, monedaCuenta: filled.monedaCuenta }),
      );
      this.editing.set(filled);
      this.editBankUpdated.set(updatedText(account?.updatedAt));
      this.editBank.set('ready');
    } catch (err) {
      console.error('[AdminDashboard] Could not load the payment account:', err);
      this.editBank.set('error');
    }
  }

  // Requests from workers to change their payment account. The admin agrees the new one by Slack.
  readonly bankRequests = computed(() =>
    this.store.bankRequests().map((r) => ({
      ...r,
      sent: r.sentAt ? `Enviada el ${formatShortDate(r.sentAt)}, ${formatTime(r.sentAt)}` : '',
    })),
  );

  editFromRequest(uid: string): void {
    if (this.employees().some((e) => e.id === uid)) this.openEdit(uid);
  }

  async resolveBankRequest(id: string, employee: string): Promise<void> {
    if (!(await this.saved(this.store.resolveBankRequest(id)))) return;
    await this.log(
      `${this.profileName() || 'Vos'} atendió la solicitud de cambio de cuenta de ${employee}`,
      'Solicitud marcada como atendida.',
    );
  }

  closeEdit(): void {
    const id = this.editing()?.id;
    this.editing.set(null);
    if (id) setTimeout(() => document.getElementById(`edit-${id}`)?.focus());
  }

  setEditField(field: EditField, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.editing.update((f) => (f ? { ...f, [field]: value } : f));
  }

  setEditVacation(event: Event): void {
    const input = event.target as HTMLInputElement;
    const vacaciones = input.value.replace(/\D/g, '').slice(0, 3);
    input.value = vacaciones;
    this.editing.update((f) => (f ? { ...f, vacaciones } : f));
  }

  setEditActive(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.editing.update((f) => (f ? { ...f, activo: checked } : f));
  }

  setEditSalary(event: Event): void {
    const input = event.target as HTMLInputElement;
    const salario = parseAmount(input.value);
    const salarioTexto = formatThousands(salario);
    input.value = salarioTexto;
    this.editing.update((f) => (f ? { ...f, salario, salarioTexto } : f));
  }

  setEditCedula(event: Event): void {
    const input = event.target as HTMLInputElement;
    const cedula = formatCedula(input.value);
    input.value = cedula;
    this.editing.update((f) => (f ? { ...f, cedula } : f));
  }

  setEditIban(event: Event): void {
    const input = event.target as HTMLInputElement;
    const iban = groupIban(input.value);
    input.value = iban;
    this.editing.update((f) => (f ? { ...f, iban } : f));
  }

  openPicker(event: Event): void {
    try {
      (event.target as HTMLInputElement).showPicker();
    } catch {
      // Not supported in this browser: the field still works by typing.
    }
  }

  async saveEdit(): Promise<void> {
    const f = this.editing();
    if (!f || !this.editState()?.canSave) return;
    const horario = scheduleText(f.horaInicio, f.horaFin);
    const changes = {
      nombre: f.nombre.trim(),
      tipo_colaborador: f.tipo,
      pais: f.pais,
      fechaIngreso: f.fechaIngreso,
      salario: f.salario,
      moneda: f.moneda,
      jornada: f.jornada,
      horarioLaborado: horario,
      activo: f.activo,
      // Only saved when it has a value, so employees without a balance stay that way.
      ...(f.vacaciones === '' ? {} : { vacaciones_disponibles: Number(f.vacaciones) }),
    };
    this.editSaving.set(true);
    this.editError.set('');
    let bankChanged = false;
    try {
      const before = JSON.parse(this.editOriginal()) as EditForm;
      bankChanged = before.cedula !== f.cedula || before.iban !== f.iban || before.monedaCuenta !== f.monedaCuenta;
      await updateDoc(doc(getFirestore(), 'colaboradores', f.id), { ...changes, updatedAt: serverTimestamp() });
      if (bankChanged) {
        await this.store.saveBankAccount(f.id, { cedula: f.cedula, iban: f.iban, currency: f.monedaCuenta });
      }
      this.employees.update((list) =>
        list.map((e) =>
          e.id === f.id
            ? {
                ...e,
                name: changes.nombre,
                role: roleLabel(changes.tipo_colaborador),
                schedule: SCHEDULES[changes.jornada] ?? '—',
                startDate: formatShortDate(changes.fechaIngreso),
                active: changes.activo,
                tipo: changes.tipo_colaborador,
                jornada: changes.jornada,
                horario,
                fechaIngreso: changes.fechaIngreso,
                salario: changes.salario,
                moneda: changes.moneda,
                pais: changes.pais,
                vacationBalance: f.vacaciones === '' ? e.vacationBalance : Number(f.vacaciones),
              }
            : e,
        ),
      );
      this.editing.set(null);
      await this.log(
        `${this.profileName() || 'Vos'} editó los datos de ${changes.nombre}${bankChanged ? ' (cambió la cuenta de pago)' : ''}`,
        'Cambios guardados.',
      );
    } catch {
      this.editError.set('No se pudieron guardar los cambios. Revisá la conexión y probá de nuevo.');
    } finally {
      this.editSaving.set(false);
    }
  }

  async enableNotifications(): Promise<void> {
    const uid = getAuth().currentUser?.uid;
    if (!uid) return;
    const toast = await this.toast.create({
      message: notifyMessage(await this.notifications.enable(uid)),
      duration: 5000,
      position: 'bottom',
    });
    await toast.present();
  }

  async logout(): Promise<void> {
    await this.notifications.disable();
    await this.auth.logout();
    this.store.forgetWorker();
    await this.router.navigateByUrl('/tabs/login', { replaceUrl: true });
  }

  // Waits for a Firestore write. On failure it warns the admin and returns false, so nothing is marked as done.
  private async saved(write: Promise<void>): Promise<boolean> {
    try {
      await write;
      return true;
    } catch (err) {
      console.error('[AdminDashboard] Could not save to Firestore:', err);
      const toast = await this.toast.create({
        message: 'No se pudo guardar. Revisá la conexión e intentá de nuevo.',
        duration: 4000,
        position: 'bottom',
      });
      await toast.present();
      return false;
    }
  }

  private async logDecision(what: string, status: RequestStatus): Promise<void> {
    const verb = status === 'aprobada' ? 'aprobó' : 'rechazó';
    await this.log(
      `${this.profileName() || 'Vos'} ${verb} ${what}`,
      `Listo (${status}). El trabajador lo ve en Mis solicitudes.`,
    );
  }

  // TODO: save each action in Firestore once the backend is ready.
  private addActivity(text: string): void {
    const time = formatClock(new Date());
    this.activity.update((list) => [{ text, time: `hoy, ${time}` }, ...list].slice(0, 8));
  }

  private async log(text: string, message: string): Promise<void> {
    this.addActivity(text);
    const toast = await this.toast.create({ message, duration: 3000, position: 'bottom' });
    await toast.present();
  }

  // Keeps the date in the header current, even if the page stays open overnight.
  private scheduleMidnight(destroyRef: DestroyRef): void {
    let timer: ReturnType<typeof setTimeout>;
    const tick = (): void => {
      this.now.set(new Date());
      timer = setTimeout(tick, msUntilMidnight(new Date()) + 1000);
    };
    timer = setTimeout(tick, msUntilMidnight(new Date()) + 1000);
    destroyRef.onDestroy(() => clearTimeout(timer));
  }

  private async loadProfile(): Promise<void> {
    const user = getAuth().currentUser;
    if (!user) return;
    try {
      const data = (await getDoc(doc(getFirestore(), 'colaboradores', user.uid))).data();
      this.profileName.set(String(data?.['nombre'] ?? user.displayName ?? ''));
      this.profileRole.set(roleLabel(data?.['tipo_colaborador']));
    } catch {
      this.profileName.set(user.displayName ?? '');
    }
  }

  private async loadEmployees(): Promise<void> {
    try {
      const snap = await getDocs(collection(getFirestore(), 'colaboradores'));
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: String(data['nombre'] ?? 'Sin nombre'),
          email: String(data['correo'] ?? ''),
          role: roleLabel(data['tipo_colaborador']),
          schedule: SCHEDULES[String(data['jornada'])] ?? '—',
          startDate: typeof data['fechaIngreso'] === 'string' ? formatShortDate(data['fechaIngreso']) : '—',
          active: data['activo'] === true,
          tipo: typeof data['tipo_colaborador'] === 'string' ? data['tipo_colaborador'] : 'regular',
          jornada: String(data['jornada'] ?? ''),
          horario: String(data['horarioLaborado'] ?? ''),
          fechaIngreso: typeof data['fechaIngreso'] === 'string' ? data['fechaIngreso'] : '',
          salario: typeof data['salario'] === 'number' ? data['salario'] : null,
          moneda: String(data['moneda'] ?? ''),
          pais: String(data['pais'] ?? ''),
          vacationBalance: typeof data['vacaciones_disponibles'] === 'number' ? data['vacaciones_disponibles'] : null,
        };
      });
      list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      this.employees.set(list);
      this.employeesState.set('ready');
    } catch {
      this.employeesState.set('error');
    }
  }
}

function countByStatus(list: { status: RequestStatus }[]): Record<RequestStatus, number> {
  const counts: Record<RequestStatus, number> = { pendiente: 0, aprobada: 0, rechazada: 0, cancelada: 0 };
  for (const r of list) counts[r.status]++;
  return counts;
}

// Requests from Firestore do not carry the balance; it comes from the employee, found by email.
function balanceText(request: VacationRequest, employees: Employee[]): string {
  const balance = Number.isFinite(request.balance) ? request.balance : ownerOf(request, employees)?.vacationBalance;
  return typeof balance === 'number' ? dayCount(balance) : 'sin dato';
}

// The real employee who sent a request: by uid, or by email for requests sent before the uid was saved.
function ownerOf(request: VacationRequest, employees: Employee[]): Employee | undefined {
  return (
    employees.find((e) => e.id === request.ownerId) ?? employees.find((e) => !!e.email && e.email === request.email)
  );
}

// Whole days, from 0 to 365. '' means it was left empty.
function vacationProblem(value: string): string {
  if (!/^\d{1,3}$/.test(value)) return 'Escribí solo números enteros.';
  return Number(value) > 365 ? 'No puede ser más de 365 días.' : '';
}

function dayCount(n: number): string {
  return `${n} ${n === 1 ? 'día' : 'días'}`;
}
