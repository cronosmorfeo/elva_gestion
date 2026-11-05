import {
  MAX_FILE_BYTES,
  addWeeks,
  fileKind,
  formatFileSize,
  mondayOf,
  reportProblem,
  unseenCount,
  weekLabel,
} from './report-utils';
import type { WorkReport } from './report-utils';

describe('report utils', () => {
  it('finds the Monday of any day', () => {
    expect(mondayOf('2026-11-05')).toBe('2026-11-02'); // Thursday
    expect(mondayOf('2026-11-02')).toBe('2026-11-02'); // Monday
    expect(mondayOf('2026-11-08')).toBe('2026-11-02'); // Sunday
    expect(mondayOf('2027-01-01')).toBe('2026-12-28'); // across years
    expect(addWeeks('2026-11-02', -1)).toBe('2026-10-26');
  });

  it('names the week from Monday to Friday', () => {
    expect(weekLabel('2026-11-02')).toBe('Semana del 2 al 6 nov');
    expect(weekLabel('2026-11-30')).toBe('Semana del 30 nov al 4 dic');
  });

  it('describes files', () => {
    expect(formatFileSize(350 * 1024)).toBe('350 KB');
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe('1,3 MB');
    expect(fileKind({ name: 'informe.PDF', type: '' })).toBe('PDF');
    expect(fileKind({ name: 'captura.png', type: 'image/png' })).toBe('Imagen');
    expect(fileKind({ name: 'notas.docx', type: '' })).toBe('Documento');
    expect(fileKind({ name: 'horas.xlsx', type: '' })).toBe('Hoja de cálculo');
    expect(fileKind({ name: 'datos.zip', type: '' })).toBe('Archivo');
  });

  it('checks the report before sending', () => {
    const file = (size: number) => ({ name: 'a.pdf', size, type: 'application/pdf' });
    expect(reportProblem('', []).length).toBeGreaterThan(0);
    expect(reportProblem('   ', []).length).toBeGreaterThan(0);
    expect(reportProblem('Terminé el informe', [])).toBe('');
    expect(reportProblem('', [file(1000)])).toBe('');
    expect(reportProblem('', [file(MAX_FILE_BYTES + 1)])).toContain('10 MB');
    expect(
      reportProblem(
        'x',
        Array.from({ length: 6 }, () => file(10)),
      ),
    ).toContain('5 archivos');
  });

  it('counts unseen reports per employee', () => {
    const r = (employeeId: string, seen: boolean): WorkReport => ({
      id: Math.random().toString(),
      employeeId,
      employee: 'x',
      weekStart: '2026-11-02',
      sentAt: '2026-11-06T16:00',
      text: 'x',
      files: [],
      seen,
    });
    const list = [r('a', false), r('a', false), r('a', true), r('b', false)];
    expect(unseenCount(list, 'a')).toBe(2);
    expect(unseenCount(list, 'b')).toBe(1);
    expect(unseenCount(list, 'c')).toBe(0);
  });
});
