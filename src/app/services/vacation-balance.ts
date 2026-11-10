// What happens to a worker's vacation balance (colaboradores.vacaciones_disponibles) when a request is approved.
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
    return `${employee} tiene solo ${balance} ${balance === 1 ? 'día' : 'días'} de vacaciones. No se aprobó.`;
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
