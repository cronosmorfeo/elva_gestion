import { addDays, formatShortDate } from './admin-dates';
import type { RequestStatus, VacationRequest } from './admin-requests';

export const MAX_REASON = 200;

// Vacations and overtime need two approvals: RH (role rh) and the jefatura (role admin, any of them), in any
// order. Only the second one approves the request (and deducts the vacation days). Either RH or the
// jefatura can reject it, and that is final.
export type Approver = 'rh' | 'jefatura';

export const APPROVAL_FIELDS: Record<Approver, string> = { rh: 'aprobacionRh', jefatura: 'aprobacionJefatura' };

// Message after the first of the two approvals.
export function partialText(as: Approver): string {
  return as === 'rh'
    ? 'Aprobación de RH guardada. Falta la jefatura.'
    : 'Aprobación de la jefatura guardada. Falta RH.';
}

// Which approval an account gives, or null if it gives none.
export function approverOf(tipo: unknown): Approver | null {
  const value = typeof tipo === 'string' ? tipo.trim().toLowerCase() : '';
  return value === 'admin' ? 'jefatura' : value === 'rh' ? 'rh' : null;
}

// What the signed-in account may change in Edit employee. Only the jefatura (role admin) changes account
// types and deactivates an Administrator, so RH cannot make an account admin (and then approve as the
// jefatura) or lock Félix or Vanessa out. Nobody changes their own type or deactivates themselves,
// and an account whose role is not known yet changes neither.
export function editPermissions(
  me: Approver | null,
  targetTipo: string,
  self: boolean,
): { canChangeRole: boolean; canDeactivate: boolean } {
  const boss = me === 'jefatura';
  const targetIsBoss = approverOf(targetTipo) === 'jefatura';
  return { canChangeRole: boss && !self, canDeactivate: me !== null && !self && (boss || !targetIsBoss) };
}

// One approval column (RH or Jefatura). The names are '' when unknown.
export function approvalText(status: RequestStatus, approvedBy: string, rejectedBy: string): string {
  const first = (name: string): string => name.trim().split(/\s+/)[0] ?? '';
  if (status === 'rechazada' && rejectedBy) return `Rechazó ${first(rejectedBy)}`;
  if (approvedBy) return `Aprobó ${first(approvedBy)}`;
  return status === 'pendiente' ? 'Pendiente' : '—';
}

// What is wrong with a rejection reason, or '' when it can be saved. The worker reads it.
export function reasonProblem(reason: string): string {
  const text = reason.trim();
  if (!text) return 'Escribí el motivo. Lo va a ver el trabajador.';
  return text.length > MAX_REASON ? `El motivo puede tener hasta ${MAX_REASON} letras.` : '';
}

// Other people's approved vacations that overlap this request, as "Ana Solís (23 nov – 27 nov)".
// Helps the admin avoid leaving a team empty.
export function vacationConflicts(request: VacationRequest, all: VacationRequest[]): string[] {
  const owner = ownerKey(request);
  const lastDay = addDays(request.returnDate, -1);
  return all
    .filter(
      (o) =>
        o.id !== request.id &&
        o.status === 'aprobada' &&
        ownerKey(o) !== owner &&
        o.start <= lastDay &&
        addDays(o.returnDate, -1) >= request.start,
    )
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((o) => `${o.employee} (${formatShortDate(o.start)} – ${formatShortDate(addDays(o.returnDate, -1))})`);
}

function ownerKey(r: VacationRequest): string {
  return r.ownerId || r.email || r.employee;
}
