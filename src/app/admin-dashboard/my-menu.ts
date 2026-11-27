import type { FeatureFlags } from '../services/feature-flags';

export interface MyMenuLink {
  label: string;
  path: string;
}

// "Mi menú" in the panel: the same pages a worker sees in the navbar, since the jefatura and RH are
// workers too (their own vacations, overtime, report...). Each one only when its section is on.
export function myMenuLinks(flags: FeatureFlags): MyMenuLink[] {
  return [
    { label: 'Inicio', path: '/tabs/inicio', on: true },
    { label: 'Vacaciones', path: '/tabs/vacaciones', on: flags.vacaciones },
    { label: 'Horas extra', path: '/tabs/horas-extra', on: flags.horasExtra },
    { label: 'Mi reporte', path: '/tabs/reporte', on: flags.reportes },
    { label: 'Mis solicitudes', path: '/tabs/solicitudes', on: flags.vacaciones || flags.horasExtra },
    { label: 'Avisos', path: '/tabs/avisos', on: flags.avisos },
    { label: 'Mi perfil', path: '/tabs/perfil', on: true },
  ]
    .filter((l) => l.on)
    .map(({ label, path }) => ({ label, path }));
}
