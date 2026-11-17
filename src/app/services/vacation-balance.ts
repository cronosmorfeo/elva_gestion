import { dayCount } from '../shared/day-count';

// Vacation balance rules (confirmed by HR, Nov 2026):
// - Everyone earns DEFAULT_DAYS_PER_YEAR (12) a year: one day per full month.
// - Days are earned from the day the employee's balance was entered in the app (colaboradores.acumulaDesde),
//   so days earned before that are not counted twice.
// - colaboradores.vacaciones_disponibles is the entered balance minus what was used; the current balance adds what was earned.

export const DEFAULT_DAYS_PER_YEAR = 12;

// Full months from `from` to `today` (both YYYY-MM-DD). A month is full on the same day of the month,
// or on the last day when that month is shorter (Jan 31 -> Feb 28).
export function fullMonths(from: string, today: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(today) || today < from) return 0;
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  const lastDayOfThisMonth = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  if (td < Math.min(fd, lastDayOfThisMonth)) months--;
  return Math.max(0, months);
}

// Days earned since `from`, rounded down to half days (the smallest amount that can be requested).
export function earnedDays(from: unknown, daysPerYear: unknown, today: string): number {
  if (typeof from !== 'string') return 0;
  const perYear = typeof daysPerYear === 'number' && daysPerYear > 0 ? daysPerYear : DEFAULT_DAYS_PER_YEAR;
  return Math.floor(((fullMonths(from, today) * perYear) / 12) * 2) / 2;
}

// The balance today from a colaboradores document, or null when it has no balance on record.
export function currentBalance(data: Record<string, unknown> | undefined, today: string): number | null {
  const stored = data?.['vacaciones_disponibles'];
  if (typeof stored !== 'number' || !Number.isFinite(stored)) return null;
  return stored + earnedDays(data?.['acumulaDesde'], data?.['diasAnuales'], today);
}

// What to save when an admin sets the current balance by hand: the stored part, so that stored + earned = balance.
// The first time, earning starts today.
export function storedBalance(
  balance: number,
  data: Record<string, unknown> | undefined,
  today: string,
): { vacaciones_disponibles: number; acumulaDesde: string } {
  const from = typeof data?.['acumulaDesde'] === 'string' ? data['acumulaDesde'] : today;
  return { vacaciones_disponibles: balance - earnedDays(from, data?.['diasAnuales'], today), acumulaDesde: from };
}

// What happens to a worker's vacation balance when a request is approved.
export type BalanceCheck =
  { kind: 'descontar'; next: number } | { kind: 'insuficiente'; balance: number } | { kind: 'sin-saldo' };

// No balance on record: the request is approved without deducting. Not enough days: it is not approved.
export function checkBalance(balance: unknown, days: number): BalanceCheck {
  if (typeof balance !== 'number' || !Number.isFinite(balance)) return { kind: 'sin-saldo' };
  if (balance < days) return { kind: 'insuficiente', balance };
  return { kind: 'descontar', next: balance - days };
}

// Days the worker can still ask for: the saved balance minus the requests still pending.
// Never below 0. null when the worker has no balance on record.
export function availableDays(balance: number | null, pendingDays: number): number | null {
  return balance === null ? null : Math.max(0, balance - pendingDays);
}

export type ApproveResult = { kind: 'descontado'; next: number } | { kind: 'sin-saldo' };

export type ApproveProblem = 'no-existe' | 'ya-decidida' | 'cancelada' | 'insuficiente';

// Thrown inside the approval transaction, so nothing is saved.
export class ApproveError extends Error {
  constructor(
    readonly problem: ApproveProblem,
    readonly balance = 0,
  ) {
    super(`Vacation approval stopped: ${problem}`);
  }
}

// Text for the admin when an approval could not be saved.
export function approveProblemText(problem: ApproveProblem, employee: string, balance: number): string {
  if (problem === 'insuficiente') {
    return `${employee} tiene solo ${dayCount(balance)} de vacaciones. No se aprobó.`;
  }
  if (problem === 'ya-decidida') return 'Esa solicitud ya fue decidida por otra persona.';
  if (problem === 'cancelada') return `${employee} canceló esa solicitud.`;
  return 'Esa solicitud ya no existe.';
}

// Whether the worker can still cancel a request. Pending or approved ones can be cancelled
// until they start: once vacations or overtime have started, those days were used.
// start is YYYY-MM-DD (vacations) or YYYY-MM-DDTHH:mm (overtime); now is YYYY-MM-DDTHH:mm.
export type CancelCheck = 'si' | 'ya-decidida' | 'ya-empezo';

export function canCancel(status: string, start: string, now: string): CancelCheck {
  if (status !== 'pendiente' && status !== 'aprobada') return 'ya-decidida';
  const started = start.length <= 10 ? start <= now.slice(0, 10) : start <= now;
  return started ? 'ya-empezo' : 'si';
}

export type CancelResult = { kind: 'cancelada'; returnedDays: number; wasApproved: boolean } | { kind: CancelCheck };

// Days a cancellation gives back: only an approved vacation, and only what its approval deducted
// (decision.diasDescontados). Pending requests and overtime never deducted anything.
export function deductedDays(kind: 'vacaciones' | 'horas', status: string, decision: unknown): number {
  if (kind !== 'vacaciones' || status !== 'aprobada') return 0;
  if (typeof decision !== 'object' || decision === null) return 0;
  const days = (decision as Record<string, unknown>)['diasDescontados'];
  return typeof days === 'number' && Number.isFinite(days) && days > 0 ? days : 0;
}

// The balance after giving the days back, or null when there is nothing to change
// (no days to give back, or the worker has no balance on record).
export function balanceAfterCancel(balance: unknown, days: number): number | null {
  if (days <= 0 || typeof balance !== 'number' || !Number.isFinite(balance)) return null;
  return balance + days;
}
