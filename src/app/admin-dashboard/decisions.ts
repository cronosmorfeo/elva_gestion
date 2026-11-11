import { addDays, formatShortDate } from './admin-dates';
import type { VacationRequest } from './admin-requests';

export const MAX_REASON = 200;

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
