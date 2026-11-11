import { ALL_MONTHS, monthLabel } from '../my-requests/my-requests-utils';

export { ALL_MONTHS };

export interface FilterableRequest {
  employee: string;
  email?: string;
  start: string; // YYYY-MM-DD or YYYY-MM-DDTHH:mm
}

// Lower case and without accents, so "jose" finds "José".
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Name or email contains the search, and the request is in the month (by its date, not when it was sent).
export function matchesRequest(r: FilterableRequest, search: string, month: string): boolean {
  if (month !== ALL_MONTHS && r.start.slice(0, 7) !== month) return false;
  const term = normalize(search);
  return !term || normalize(r.employee).includes(term) || normalize(r.email ?? '').includes(term);
}

// "All months" first, then every month that has requests, newest first.
export function requestMonths(list: FilterableRequest[]): { value: string; label: string }[] {
  const months = [...new Set(list.map((r) => r.start.slice(0, 7)))].sort((a, b) => b.localeCompare(a));
  return [{ value: ALL_MONTHS, label: 'Todos los meses' }, ...months.map((m) => ({ value: m, label: monthLabel(m) }))];
}
