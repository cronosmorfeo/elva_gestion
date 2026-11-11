// Labels for employee data, shared by the dashboard and the worker's profile page.

export const ROLE_OPTIONS = [
  { value: 'regular', label: 'Trabajador' },
  { value: 'rh', label: 'Recursos Humanos' },
  { value: 'admin', label: 'Administrador' },
];

export const COUNTRY_OPTIONS = [
  { value: 'CR', label: 'Costa Rica' },
  { value: 'PA', label: 'Panamá' },
  { value: 'GT', label: 'Guatemala' },
  { value: 'SV', label: 'El Salvador' },
  { value: 'HN', label: 'Honduras' },
  { value: 'NI', label: 'Nicaragua' },
  { value: 'MX', label: 'México' },
  { value: 'US', label: 'Estados Unidos' },
  { value: 'CO', label: 'Colombia' },
];

export const CURRENCY_OPTIONS = [
  { value: 'CRC', label: 'CRC - Colón costarricense' },
  { value: 'USD', label: 'USD - Dólar estadounidense' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'MXN', label: 'MXN - Peso mexicano' },
  { value: 'COP', label: 'COP - Peso colombiano' },
  { value: 'PAB', label: 'PAB - Balboa panameño' },
];

export const SCHEDULES: Record<string, string> = {
  completa: 'Tiempo completo',
  medio: 'Medio tiempo',
  parcial: 'Jornada parcial',
  nocturna: 'Jornada nocturna',
  flexible: 'Horario flexible',
};

export function roleLabel(tipo: unknown): string {
  const value = typeof tipo === 'string' ? tipo.trim().toLowerCase() : '';
  if (value === 'admin') return 'Administrador';
  if (value === 'rh') return 'Recursos Humanos';
  return 'Trabajador';
}

export function countryLabel(code: unknown): string {
  return COUNTRY_OPTIONS.find((c) => c.value === code)?.label ?? '—';
}
