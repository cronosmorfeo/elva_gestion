import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonContent, ToastController } from '@ionic/angular';
import { getAuth } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, getFirestore, serverTimestamp, updateDoc } from 'firebase/firestore';

import type { NoticeInput } from '../notices/notice-utils';
import { MAX_NOTICE_MESSAGE, MAX_NOTICE_TITLE, noticeProblem } from '../notices/notice-utils';
import { fileKind, formatFileSize, unseenCount, weekLabel } from '../reports/report-utils';
import { AuthService } from '../services/auth';
import { NotificationsService, notifyMessage } from '../services/notifications';
import { RequestsStore } from '../services/requests-store';
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
import type { PendingPayment, RequestStatus, VacationRequest } from './admin-requests';
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
import { SAMPLE_EMPLOYEES, SAMPLE_PAYEES, SAMPLE_PAYMENTS } from './admin-sample-data';

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  schedule: string;
  startDate: string;
  active: boolean;
  sample: boolean;
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
  sample: boolean;
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
  activo: boolean;
  cedula: string;
  iban: string;
  monedaCuenta: string;
}

type EditField =
  'nombre' | 'tipo' | 'pais' | 'fechaIngreso' | 'moneda' | 'jornada' | 'horaInicio' | 'horaFin' | 'monedaCuenta';

const ROLE_OPTIONS = [
  { value: 'regular', label: 'Trabajador' },
  { value: 'rh', label: 'Recursos Humanos' },
  { value: 'admin', label: 'Administrador' },
];

const COUNTRY_OPTIONS = [
  { value: 'CR', label: 'Costa Rica' },
  { value: 'PA', label: 'Panamá' },
  { value: 'GT', label: 'Guatemala' },
  { value: 'SV', label: 'El Salvador' },
  { value: 'HN', label: 'Honduras' },
  { value: 'NI', label: 'Nicaragua' },
  { value: 'MX', label: 'México' },
  { value: 'US', label: 'Estados Unidos' },
  { value: 'CO', label: 'Colombia' },
];

const CURRENCY_OPTIONS = [
  { value: 'CRC', label: 'CRC - Colón costarricense' },
  { value: 'USD', label: 'USD - Dólar estadounidense' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'MXN', label: 'MXN - Peso mexicano' },
  { value: 'COP', label: 'COP - Peso colombiano' },
  { value: 'PAB', label: 'PAB - Balboa panameño' },
];

const SECTIONS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'vacaciones', label: 'Vacaciones' },
  { id: 'horas-extra', label: 'Horas extra' },
  { id: 'pagos', label: 'Pagos pendientes' },
  { id: 'empleados', label: 'Empleados' },
  { id: 'avisos', label: 'Avisos' },
];

const SCHEDULES: Record<string, string> = {
  completa: 'Tiempo completo',
  medio: 'Medio tiempo',
  parcial: 'Jornada parcial',
  nocturna: 'Jornada nocturna',
  flexible: 'Horario flexible',
};

const STATUS_TABS: { id: RequestStatus; label: string }[] = [
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'aprobada', label: 'Aprobadas' },
  { id: 'rechazada', label: 'Rechazadas' },
];

function roleLabel(tipo: unknown): string {
  const value = typeof tipo === 'string' ? tipo.trim().toLowerCase() : '';
  if (value === 'admin') return 'Administrador';
  if (value === 'rh') return 'Recursos Humanos';
  return 'Trabajador';
}

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
  readonly payments = signal<PendingPayment[]>(SAMPLE_PAYMENTS);
  readonly activity = signal<{ text: string; time: string }[]>([]);

  readonly openPaymentId = signal<string | null>(null);
  readonly ibanVisible = signal(false);
  readonly receipt = signal('');
  readonly paymentDetail = computed(() => {
    const payment = this.payments().find((p) => p.id === this.openPaymentId());
    if (!payment) return null;
    const payee = SAMPLE_PAYEES[payment.employee];
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

  readonly vacationCounts = computed(() => countByStatus(this.vacations()));
  readonly overtimeCounts = computed(() => countByStatus(this.overtime()));

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
    this.vacations()
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
      })),
  );

  readonly overtimeRows = computed(() =>
    this.overtime()
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
    const changed = JSON.stringify(f) !== this.editOriginal();
    return {
      symbol: currencySymbol(f.moneda),
      schedule: scheduleText(f.horaInicio, f.horaFin),
      hours: scheduleText(f.horaInicio, f.horaFin) ? hoursText(shiftMinutes(f.horaInicio, f.horaFin)) : '',
      cedulaError: Boolean(f.cedula) && !isValidCedula(f.cedula),
      ibanComplete: normalizeIban(f.iban).length >= 22,
      ibanValid: isValidCrIban(f.iban),
      missing: missing.length ? `Falta: ${missing.join(', ')}.` : '',
      canSave: missing.length === 0 && changed && !this.editSaving(),
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

  setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  async decideVacation(id: string, status: RequestStatus): Promise<void> {
    const request = this.vacations().find((r) => r.id === id);
    if (!request) return;
    if (!(await this.saved(this.store.decideVacation(id, status)))) return;
    await this.logDecision(`las vacaciones de ${request.employee}`, status);
  }

  async decideOvertime(id: string, status: RequestStatus): Promise<void> {
    const request = this.overtime().find((r) => r.id === id);
    if (!request) return;
    if (!(await this.saved(this.store.decideOvertime(id, status)))) return;
    await this.logDecision(`las horas extra de ${request.employee}`, status);
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
      'Pago registrado. Son datos de ejemplo: todavía no se guarda.',
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
    const payee = e.sample ? SAMPLE_PAYEES[e.name] : undefined;
    const form: EditForm = {
      id: e.id,
      sample: e.sample,
      self: !e.sample && e.id === getAuth().currentUser?.uid,
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
      activo: e.active,
      cedula: payee?.cedula ?? '',
      iban: payee ? groupIban(payee.iban) : '',
      monedaCuenta: payee ? 'CRC' : '',
    };
    this.editing.set(form);
    this.editOriginal.set(JSON.stringify(form));
    this.editError.set('');
    setTimeout(() => document.getElementById('edit-close')?.focus());
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
    };
    this.editSaving.set(true);
    this.editError.set('');
    try {
      // Sample employees only change on screen. Payment data is not saved yet (the backend decides where).
      if (!f.sample) {
        await updateDoc(doc(getFirestore(), 'colaboradores', f.id), { ...changes, updatedAt: serverTimestamp() });
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
              }
            : e,
        ),
      );
      this.editing.set(null);
      await this.log(
        `${this.profileName() || 'Vos'} editó los datos de ${changes.nombre}`,
        f.sample ? 'Cambios aplicados. Es un empleado de ejemplo: no se guarda.' : 'Cambios guardados.',
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
          sample: false,
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
      const samples = SAMPLE_EMPLOYEES.map((e) => ({
        id: e.id,
        name: e.name,
        email: e.email,
        role: roleLabel(e.tipo),
        schedule: SCHEDULES[e.jornada] ?? '—',
        startDate: formatShortDate(e.fechaIngreso),
        active: e.activo,
        sample: true,
        tipo: e.tipo,
        jornada: e.jornada,
        horario: e.horario ?? '',
        fechaIngreso: e.fechaIngreso,
        salario: e.salario ?? null,
        moneda: 'CRC',
        pais: 'CR',
        vacationBalance: null,
      }));
      list.push(...samples);
      list.sort((a, b) => Number(a.sample) - Number(b.sample) || a.name.localeCompare(b.name, 'es'));
      this.employees.set(list);
      this.employeesState.set('ready');
    } catch {
      this.employeesState.set('error');
    }
  }
}

function countByStatus(list: { status: RequestStatus }[]): Record<RequestStatus, number> {
  const counts: Record<RequestStatus, number> = { pendiente: 0, aprobada: 0, rechazada: 0 };
  for (const r of list) counts[r.status]++;
  return counts;
}

// Requests from Firestore do not carry the balance; it comes from the employee, found by email.
function balanceText(request: VacationRequest, employees: Employee[]): string {
  const balance = Number.isFinite(request.balance)
    ? request.balance
    : employees.find((e) => e.email && e.email === request.email)?.vacationBalance;
  return typeof balance === 'number' ? dayCount(balance) : 'sin dato';
}

function dayCount(n: number): string {
  return `${n} ${n === 1 ? 'día' : 'días'}`;
}
