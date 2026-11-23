import type { VacationRequest } from './admin-requests';
import { MAX_REASON, approvalText, approverOf, editPermissions, reasonProblem, vacationConflicts } from './decisions';

const vac = (
  id: string,
  ownerId: string,
  employee: string,
  start: string,
  returnDate: string,
  status: VacationRequest['status'] = 'aprobada',
): VacationRequest => ({ id, ownerId, employee, balance: 10, start, returnDate, rhReviewed: true, status });

describe('vacation approvals', () => {
  it('rh gives the RH approval and admin the jefatura one', () => {
    expect(approverOf('rh')).toBe('rh');
    expect(approverOf(' Admin ')).toBe('jefatura');
    expect(approverOf('regular')).toBeNull();
    expect(approverOf(undefined)).toBeNull();
  });

  it('says who approved or rejected in each column', () => {
    expect(approvalText('pendiente', '', '')).toBe('Pendiente');
    expect(approvalText('pendiente', 'Katia Mora', '')).toBe('Aprobó Katia');
    expect(approvalText('aprobada', 'Félix Rojas', '')).toBe('Aprobó Félix');
    expect(approvalText('rechazada', '', 'Vanessa Mora')).toBe('Rechazó Vanessa');
    // The other column of a rejected request: approved before, or nothing.
    expect(approvalText('rechazada', 'Katia Mora', '')).toBe('Aprobó Katia');
    expect(approvalText('rechazada', '', '')).toBe('—');
    expect(approvalText('cancelada', '', '')).toBe('—');
  });
});

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

describe('editPermissions', () => {
  it('lets the jefatura change types and deactivate anyone but themselves', () => {
    expect(editPermissions('jefatura', 'regular', false)).toEqual({ canChangeRole: true, canDeactivate: true });
    expect(editPermissions('jefatura', 'admin', false)).toEqual({ canChangeRole: true, canDeactivate: true });
    expect(editPermissions('jefatura', 'admin', true)).toEqual({ canChangeRole: false, canDeactivate: false });
  });

  it('never lets RH change a type, so RH cannot make an account admin', () => {
    expect(editPermissions('rh', 'regular', false).canChangeRole).toBe(false);
    expect(editPermissions('rh', 'admin', false).canChangeRole).toBe(false);
  });

  it('lets RH deactivate workers and RH, but not Félix or Vanessa', () => {
    expect(editPermissions('rh', 'regular', false).canDeactivate).toBe(true);
    expect(editPermissions('rh', 'rh', false).canDeactivate).toBe(true);
    expect(editPermissions('rh', 'admin', false).canDeactivate).toBe(false);
    expect(editPermissions('rh', ' Admin ', false).canDeactivate).toBe(false);
  });

  it('gives nothing while the role is not known', () => {
    expect(editPermissions(null, 'regular', false)).toEqual({ canChangeRole: false, canDeactivate: false });
  });
});
