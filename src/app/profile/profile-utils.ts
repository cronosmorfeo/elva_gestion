import type { DocumentData } from 'firebase/firestore';

import { formatLongDate } from '../admin-dashboard/admin-dates';
import { SCHEDULES, countryLabel, roleLabel } from '../shared/employee-labels';
import { currencySymbol, formatThousands } from '../tab3/employee-form';

// The signed-in person's own data from colaboradores/{uid}, ready to show. Read only.
export interface Profile {
  name: string;
  email: string;
  role: string;
  country: string;
  startDate: string; // YYYY-MM-DD, or '' if not on record
  schedule: string;
  hours: string;
  salary: string;
  active: boolean;
}

export function toProfile(data: DocumentData | undefined): Profile | null {
  if (!data) return null;
  const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
  const salary = typeof data['salario'] === 'number' ? data['salario'] : null;
  return {
    name: text(data['nombre']) || '—',
    email: text(data['correo']) || '—',
    role: roleLabel(data['tipo_colaborador']),
    country: countryLabel(data['pais']),
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(text(data['fechaIngreso'])) ? text(data['fechaIngreso']) : '',
    schedule: SCHEDULES[text(data['jornada'])] ?? '—',
    hours: text(data['horarioLaborado']) || '—',
    salary: salary === null ? '—' : `${currencySymbol(text(data['moneda']))}${formatThousands(salary)}`,
    active: data['activo'] === true,
  };
}

// "Lunes 1 de diciembre de 2025"
export function longDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return formatLongDate(new Date(y, m - 1, d));
}

// Time at ELVA: "1 año y 2 meses", "3 meses", "Menos de un mes", or when they start if it is in the future.
export function seniority(start: string, today: string): string {
  if (!start) return '';
  if (start > today) return `Empieza el ${longDay(start).toLowerCase()}`;
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const months = (ty - sy) * 12 + (tm - sm) - (td < sd ? 1 : 0);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years ? `${years} ${years === 1 ? 'año' : 'años'}` : '';
  const m = rest ? `${rest} ${rest === 1 ? 'mes' : 'meses'}` : '';
  return [y, m].filter(Boolean).join(' y ') || 'Menos de un mes';
}
