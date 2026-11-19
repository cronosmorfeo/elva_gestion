import { overtimeDays } from '../overtime-request/overtime-hours';
import { costaRicaHolidays, holidaysBetween } from '../vacation-request/holidays';
import { countDeductedDays, listVacationDays } from '../vacation-request/vacation-days';

import { addDays, formatShortDate, formatTime } from './admin-dates';

// 'cancelada': the worker cancelled it while it was pending. It is kept for the history.
export type RequestStatus = 'pendiente' | 'aprobada' | 'rechazada' | 'cancelada';

// Who approved or decided a request. Vacations and overtime follow the same flow (see decisions.ts).
export interface Approvals {
  decidedBy?: string; // uid of who made the final decision: decision.por
  decidedAs?: 'rh' | 'jefatura'; // which side rejected it: decision.rol
  rhApprovedBy?: string; // uid: aprobacionRh.por
  bossApprovedBy?: string; // uid of Félix or Vanessa: aprobacionJefatura.por
}

export interface VacationRequest extends Approvals {
  id: string;
  employee: string;
  balance: number;
  start: string; // first day off, YYYY-MM-DD
  returnDate: string; // first day back at work, YYYY-MM-DD
  rhReviewed: boolean;
  status: RequestStatus;
  // Set when a worker sends the request from the app.
  ownerId?: string;
  email?: string;
  deductedDays?: number; // days taken from the balance when it was approved (returned if cancelled)
  halfDayFrom?: string; // HH:mm: a half day off (4 hours from this time, one working day). Deducts 0.5
  reason?: string; // why it was rejected (the worker sees it)
  comment?: string;
  sentAt?: string; // YYYY-MM-DDTHH:mm
}

export interface OvertimeRequest extends Approvals {
  id: string;
  employee: string;
  start: string; // YYYY-MM-DDTHH:mm
  end: string; // YYYY-MM-DDTHH:mm
  task: string;
  rhReviewed: boolean;
  status: RequestStatus;
  ownerId?: string;
  email?: string;
  reason?: string; // why it was rejected (the worker sees it)
  sentAt?: string;
}

export interface UpcomingHoliday {
  date: string;
  name: string;
  mandatory: boolean;
}

// Days deducted from the balance: from the first day to the day before returning. A half day deducts 0.5.
export function vacationDays(request: VacationRequest): number {
  const lastDay = addDays(request.returnDate, -1);
  const days = countDeductedDays(listVacationDays(request.start, lastDay, holidaysBetween(request.start, lastDay)));
  return request.halfDayFrom && days === 1 ? 0.5 : days;
}

// A half day is 4 hours. It can start every 30 minutes, at 8:00 p. m. at the latest, so it ends the same day.
export const HALF_DAY_HOURS = 4;
export const HALF_DAY_STARTS = Array.from(
  { length: 41 },
  (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
);

// "7:00 a. m." for HH:mm.
export function timeLabel(time: string): string {
  return formatTime(`0000-00-00T${time}`);
}

// HH:mm when a half day that starts at `from` ends.
export function halfDayEnd(from: string): string {
  const [h, m] = from.split(':').map(Number);
  return `${String(h + HALF_DAY_HOURS).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// "de 7:00 a. m. a 11:00 a. m."
export function halfDayText(from: string): string {
  return `de ${timeLabel(from)} a ${timeLabel(halfDayEnd(from))}`;
}

// When the worker is back at work. After a half day, the same day when the 4 hours end.
export function returnDayText(request: VacationRequest): string {
  return request.halfDayFrom
    ? `${formatShortDate(request.start)} a las ${timeLabel(halfDayEnd(request.halfDayFrom))}`
    : formatShortDate(request.returnDate);
}

export function overtimeMinutes(request: OvertimeRequest): number {
  return overtimeDays(request.start, request.end, holidaysBetween(request.start, request.end)).reduce(
    (sum, day) => sum + day.minutes,
    0,
  );
}

// "8 h doble + 2 h triple", grouping the same rate across days.
export function overtimePay(request: OvertimeRequest): string {
  const byRate = new Map<number, number>();
  for (const day of overtimeDays(request.start, request.end, holidaysBetween(request.start, request.end))) {
    for (const part of day.pay) byRate.set(part.rate, (byRate.get(part.rate) ?? 0) + part.minutes);
  }
  const names = new Map([
    [1.5, '1.5x'],
    [2, 'doble'],
    [3, 'triple'],
  ]);
  return [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, minutes]) => `${formatHours(minutes)} ${names.get(rate) ?? `${rate}x`}`)
    .join(' + ');
}

export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// Approved vacations that overlap the 7 days starting today.
export function onVacationThisWeek(requests: VacationRequest[], today: string): VacationRequest[] {
  const weekEnd = addDays(today, 6);
  return requests.filter((r) => r.status === 'aprobada' && r.start <= weekEnd && addDays(r.returnDate, -1) >= today);
}

export function upcomingHolidays(today: string, count: number): UpcomingHoliday[] {
  const year = Number(today.slice(0, 4));
  return [...costaRicaHolidays(year), ...costaRicaHolidays(year + 1)].filter((h) => h.date >= today).slice(0, count);
}

export type PaymentKind = 'salario' | 'horas';

export interface PendingPayment {
  id: string;
  kind: PaymentKind;
  concept: string;
  employee: string;
  amount: number; // colones
  paid: boolean;
}

export interface PaymentTotals {
  salaries: number;
  salaryCount: number;
  overtime: number;
  overtimeCount: number;
  pendingCount: number;
  paidCount: number;
}

export function paymentTotals(payments: PendingPayment[]): PaymentTotals {
  const pending = payments.filter((p) => !p.paid);
  const sum = (list: PendingPayment[]): number => list.reduce((total, p) => total + p.amount, 0);
  const salaries = pending.filter((p) => p.kind === 'salario');
  const overtime = pending.filter((p) => p.kind === 'horas');
  return {
    salaries: sum(salaries),
    salaryCount: salaries.length,
    overtime: sum(overtime),
    overtimeCount: overtime.length,
    pendingCount: pending.length,
    paidCount: payments.length - pending.length,
  };
}

// "₡1.250.000" (Costa Rica style: dots for thousands, no decimals).
export function formatColones(amount: number): string {
  const rounded = Math.round(amount);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${rounded < 0 ? '-' : ''}₡${digits}`;
}

export interface Payee {
  fullName: string;
  cedula: string;
  email: string;
  bank: string;
  iban: string;
}

// "CR05 0152 0200 1026 2840 66".
export function formatIban(iban: string): string {
  return iban
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

// Shows only the country code and the last 4 digits: "CR•• •••• •••• •••• ••40 66".
export function maskIban(iban: string): string {
  const clean = iban.replace(/\s+/g, '').toUpperCase();
  const masked = [...clean].map((c, i) => (i < 2 || i >= clean.length - 4 ? c : '•')).join('');
  return formatIban(masked);
}
