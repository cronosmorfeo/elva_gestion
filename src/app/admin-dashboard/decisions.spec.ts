import type { VacationRequest } from './admin-requests';
import { MAX_REASON, reasonProblem, vacationConflicts } from './decisions';

const vac = (
  id: string,
  ownerId: string,
  employee: string,
  start: string,
  returnDate: string,
  status: VacationRequest['status'] = 'aprobada',
): VacationRequest => ({ id, ownerId, employee, balance: 10, start, returnDate, rhReviewed: true, status });

describe('rejection reason', () => {
  it('is required and short', () => {
    expect(reasonProblem('  ')).toBe('Escribí el motivo. Lo va a ver el trabajador.');
    expect(reasonProblem('Ya hay dos personas afuera esa semana')).toBe('');
    expect(reasonProblem('x'.repeat(MAX_REASON + 1))).toBe(`El motivo puede tener hasta ${MAX_REASON} letras.`);
  });
});

describe('vacationConflicts', () => {
  const request = vac('r', 'me', 'Jimmy', '2026-11-23', '2026-11-30', 'pendiente');

  it('lists other people with approved vacations on the same days', () => {
    const all = [
      request,
      vac('a', 'ana', 'Ana Solís', '2026-11-26', '2026-11-28'),
      vac('b', 'luis', 'Luis Mora', '2026-11-16', '2026-11-24'),
      vac('c', 'eva', 'Eva', '2026-11-30', '2026-12-03'), // starts the day Jimmy returns
      vac('d', 'max', 'Max', '2026-11-24', '2026-11-26', 'pendiente'),
      vac('e', 'me', 'Jimmy', '2026-11-24', '2026-11-25'), // his own
    ];
    expect(vacationConflicts(request, all)).toEqual([
      'Luis Mora (lun 16 nov – lun 23 nov)',
      'Ana Solís (jue 26 nov – vie 27 nov)',
    ]);
  });

  it('is empty when nobody overlaps', () => {
    expect(vacationConflicts(request, [request])).toEqual([]);
  });
});
