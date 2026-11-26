import { DEFAULT_FLAGS } from '../services/feature-flags';

import { myMenuLinks } from './my-menu';

const labels = (flags: Parameters<typeof myMenuLinks>[0]) => myMenuLinks(flags).map((l) => l.label);

describe('my menu', () => {
  it('shows every worker page when all sections are on', () => {
    const all = { vacaciones: true, horasExtra: true, reportes: true, avisos: true, pagos: true };
    expect(labels(all)).toEqual([
      'Inicio',
      'Vacaciones',
      'Horas extra',
      'Mi reporte',
      'Mis solicitudes',
      'Avisos',
      'Mi perfil',
    ]);
  });

  it('hides the pages of sections that are off', () => {
    const none = { vacaciones: false, horasExtra: false, reportes: false, avisos: false, pagos: false };
    expect(labels(none)).toEqual(['Inicio', 'Mi perfil']);
    expect(labels({ ...none, horasExtra: true })).toEqual(['Inicio', 'Horas extra', 'Mis solicitudes', 'Mi perfil']);
  });

  it('matches the worker routes', () => {
    expect(myMenuLinks(DEFAULT_FLAGS).find((l) => l.label === 'Vacaciones')?.path).toBe('/tabs/vacaciones');
  });
});
