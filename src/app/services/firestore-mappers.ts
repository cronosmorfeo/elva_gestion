import type { DocumentData } from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';

import type { OvertimeRequest, RequestStatus, VacationRequest } from '../admin-dashboard/admin-requests';
import type { Notice } from '../notices/notice-utils';
import { localDateTime } from '../notices/notice-utils';
import type { ReportFile, WorkReport } from '../reports/report-utils';

// Firestore collections used by the app. vacations_requests is the one Andrey created.
export const COLLECTIONS = {
  vacations: 'vacations_requests',
  overtime: 'overtime_requests',
  notices: 'notices',
  reports: 'weekly_reports',
} as const;

const STATUSES: readonly string[] = ['pendiente', 'aprobada', 'rechazada', 'cancelada'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// Each function turns a Firestore document into the shape the pages use.
// They return null when a required field is missing or wrong, so one bad document cannot break a page.
// RH review is not built yet, so every request counts as reviewed by RH.

export function toVacationRequest(id: string, data: DocumentData): VacationRequest | null {
  const start = text(data['diaInicio']);
  const returnDate = text(data['diaFin']);
  if (!DAY.test(start) || !DAY.test(returnDate) || returnDate <= start) return null;
  return {
    id,
    employee: text(data['nombreSolicitante']) || text(data['correoSolicitante']) || 'Sin nombre',
    email: text(data['correoSolicitante']) || undefined,
    balance: Number.NaN, // Not stored in the request; the dashboard reads it from colaboradores.
    start,
    returnDate,
    rhReviewed: true,
    status: status(data['estado']),
    ownerId: text(data['uid']) || undefined,
    deductedDays: deductedDays(data['decision']),
    reason: reason(data['decision']),
    comment: text(data['comentarioRRHH']) || undefined,
    sentAt: dateTime(data['fechaSolicitud']),
  };
}

export function toOvertimeRequest(id: string, data: DocumentData): OvertimeRequest | null {
  const start = text(data['inicio']);
  const end = text(data['fin']);
  if (!DAY_TIME.test(start) || !DAY_TIME.test(end) || end <= start) return null;
  return {
    id,
    employee: text(data['nombreSolicitante']) || text(data['correoSolicitante']) || 'Sin nombre',
    email: text(data['correoSolicitante']) || undefined,
    start,
    end,
    task: text(data['tarea']),
    rhReviewed: true,
    status: status(data['estado']),
    ownerId: text(data['uid']) || undefined,
    reason: reason(data['decision']),
    sentAt: dateTime(data['fechaSolicitud']),
  };
}

export function toNotice(id: string, data: DocumentData): Notice | null {
  const title = text(data['titulo']);
  const message = text(data['mensaje']);
  const createdAt = dateTime(data['createdAt']);
  if (!title || !message || !createdAt) return null;
  return {
    id,
    title,
    message,
    important: data['importante'] === true,
    author: text(data['autor']) || 'Administración',
    createdAt,
    updatedAt: dateTime(data['updatedAt']),
  };
}

export function toWorkReport(id: string, data: DocumentData): WorkReport | null {
  const employeeId = text(data['uid']);
  const weekStart = text(data['semana']);
  const sentAt = dateTime(data['fechaEnvio']);
  if (!employeeId || !DAY.test(weekStart) || !sentAt) return null;
  return {
    id,
    employeeId,
    employee: text(data['nombre']) || 'Sin nombre',
    weekStart,
    sentAt,
    text: text(data['texto']),
    files: files(data['archivos']),
    seen: data['visto'] != null,
  };
}

// Newest first; documents without a date go last.
export function sortBySent<T extends { sentAt?: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''));
}

function status(value: unknown): RequestStatus {
  const s = text(value);
  return STATUSES.includes(s) ? (s as RequestStatus) : 'pendiente';
}

function reason(decision: unknown): string | undefined {
  const value: unknown =
    typeof decision === 'object' && decision !== null ? (decision as Record<string, unknown>)['motivo'] : undefined;
  return text(value) || undefined;
}

function deductedDays(decision: unknown): number | undefined {
  const days: unknown =
    typeof decision === 'object' && decision !== null
      ? (decision as Record<string, unknown>)['diasDescontados']
      : undefined;
  return typeof days === 'number' ? days : undefined;
}

function dateTime(value: unknown): string | undefined {
  return value instanceof Timestamp ? localDateTime(value.toDate()) : undefined;
}

function files(value: unknown): ReportFile[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
    .map((f) => ({
      name: text(f['nombre']),
      size: typeof f['tamano'] === 'number' ? f['tamano'] : 0,
      type: text(f['tipo']),
    }))
    .filter((f) => f.name);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
