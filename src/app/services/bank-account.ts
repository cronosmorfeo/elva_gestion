import type { DocumentData } from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';

import { formatShortDate, formatTime } from '../admin-dashboard/admin-dates';
import { localDateTime } from '../notices/notice-utils';
import { groupIban, isValidCedula, isValidCrIban, normalizeIban } from '../tab3/employee-form';

import type { BrowserNotice, LastSeen } from './notification-events';

// Where each employee's payment account lives. Kept apart from colaboradores/{uid}
// so the Firestore rules can protect it more than the rest of the profile.
export const bankDocPath = (uid: string): string[] => ['colaboradores', uid, 'privado', 'pago'];
export const BANK_REQUESTS = 'bank_change_requests';
export const MAX_BANK_NOTE = 200;

export interface BankAccount {
  cedula: string;
  iban: string; // CR + 20 digits, no spaces
  currency: string; // CRC or USD
  updatedAt?: string; // YYYY-MM-DDTHH:mm
}

// A worker asks to change their account. The new account is agreed by Slack, never typed here.
export interface BankChangeRequest {
  id: string;
  uid: string;
  employee: string;
  note: string;
  status: 'pendiente' | 'atendida';
  sentAt?: string;
}

export function toBankAccount(data: DocumentData | undefined): BankAccount | null {
  if (!data) return null;
  const iban = normalizeIban(typeof data['iban'] === 'string' ? data['iban'] : '');
  if (!iban) return null;
  return {
    cedula: typeof data['cedula'] === 'string' ? data['cedula'] : '',
    iban,
    currency: typeof data['monedaCuenta'] === 'string' ? data['monedaCuenta'] : '',
    updatedAt: data['updatedAt'] instanceof Timestamp ? localDateTime(data['updatedAt'].toDate()) : undefined,
  };
}

export function toBankChangeRequest(id: string, data: DocumentData): BankChangeRequest | null {
  const uid = typeof data['uid'] === 'string' ? data['uid'] : '';
  if (!uid) return null;
  return {
    id,
    uid,
    employee: typeof data['nombre'] === 'string' && data['nombre'].trim() ? data['nombre'].trim() : 'Sin nombre',
    note: typeof data['nota'] === 'string' ? data['nota'].trim() : '',
    status: data['estado'] === 'atendida' ? 'atendida' : 'pendiente',
    sentAt: data['fecha'] instanceof Timestamp ? localDateTime(data['fecha'].toDate()) : undefined,
  };
}

// What is wrong with the payment data in Edit employee, or ''. All empty is fine (nothing on record yet).
export function bankProblem(cedula: string, iban: string, currency: string): string {
  if (!cedula.trim() && !normalizeIban(iban) && !currency) return '';
  if (!isValidCrIban(iban)) return 'Revisá la cuenta IBAN: tiene que ser CR seguida de 20 números válidos.';
  if (cedula.trim() && !isValidCedula(cedula)) return 'Revisá la cédula.';
  if (!currency) return 'Elegí la moneda de la cuenta.';
  return '';
}

// "1-1523-0847" -> "1-••••-0847": enough to recognize it, not to copy it.
export function maskCedula(cedula: string): string {
  const digits = cedula.replace(/\D/g, '');
  if (digits.length < 5) return cedula ? '•'.repeat(digits.length) : '';
  return digits.length === 9
    ? `${digits[0]}-••••-${digits.slice(5)}`
    : `${'•'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

export function ibanText(iban: string): string {
  return groupIban(iban);
}

export function updatedText(updatedAt?: string): string {
  return updatedAt ? `Actualizada el ${formatShortDate(updatedAt)}, ${formatTime(updatedAt)}` : '';
}

// The worker is told when their account changes, so a change they did not ask for is caught at once.
export function bankChangedEvent(before: string | null | undefined, now: BankAccount | null): BrowserNotice | null {
  if (before === undefined) return null; // first load
  const current = now?.iban ?? null;
  if (current === before || !current) return null;
  return {
    tag: `bank-${current.slice(-4)}`,
    title: 'Se cambió su cuenta de pago',
    body: `Ahora termina en ${current.slice(-4)}. Si no fue usted quien lo pidió, avise a RH de inmediato.`,
    url: '/tabs/perfil',
  };
}

// Admins hear about new requests to change an account.
export function bankRequestEvents(before: LastSeen, list: BankChangeRequest[]): BrowserNotice[] {
  if (!before) return [];
  return list
    .filter((r) => r.status === 'pendiente' && !before.has(r.id))
    .map((r) => ({
      tag: `${BANK_REQUESTS}-${r.id}`,
      title: 'Solicitud de cambio de cuenta',
      body: `${r.employee} pidió cambiar su cuenta de pago.${r.note ? ` Nota: ${r.note}` : ''}`,
      url: '/tabs/dashboard',
    }));
}
