// Helpers for the weekly work reports. Display only: nothing here talks to Firebase.

export interface ReportFile {
  name: string;
  size: number; // bytes
  type: string; // MIME type, may be empty
}

export interface WorkReport {
  id: string;
  employeeId: string;
  employee: string;
  weekStart: string; // Monday, YYYY-MM-DD
  sentAt: string; // YYYY-MM-DDTHH:mm
  text: string;
  files: ReportFile[];
  seen: boolean;
}

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pad = (n: number): string => String(n).padStart(2, '0');
const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string): Date => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Monday of the week of a YYYY-MM-DD date (weeks start on Monday).
export function mondayOf(date: string): string {
  const d = parse(date);
  const back = (d.getDay() + 6) % 7;
  return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - back));
}

export function addWeeks(monday: string, weeks: number): string {
  const d = parse(monday);
  return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + weeks * 7));
}

// "Semana del 2 al 6 nov", or "Semana del 30 nov al 4 dic" across months (Monday to Friday).
export function weekLabel(monday: string): string {
  const start = parse(monday);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 4);
  const startText =
    start.getMonth() === end.getMonth() ? `${start.getDate()}` : `${start.getDate()} ${MONTHS[start.getMonth()]}`;
  return `Semana del ${startText} al ${end.getDate()} ${MONTHS[end.getMonth()]}`;
}

// "1,2 MB", "350 KB".
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export function fileKind(file: { name: string; type: string }): string {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'PDF';
  if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/.test(name)) return 'Imagen';
  if (/\.(docx?|odt|txt|rtf)$/.test(name)) return 'Documento';
  if (/\.(xlsx?|ods|csv)$/.test(name)) return 'Hoja de cálculo';
  return 'Archivo';
}

// What is wrong with a report before sending it, or "" when it can be sent.
export function reportProblem(text: string, files: ReportFile[]): string {
  if (!text.trim() && files.length === 0) return 'Escribí qué hiciste o adjuntá al menos un archivo.';
  if (files.length > MAX_FILES) return `Podés adjuntar hasta ${MAX_FILES} archivos.`;
  const big = files.find((f) => f.size > MAX_FILE_BYTES);
  if (big) return `"${big.name}" pesa más de 10 MB.`;
  return '';
}

export function unseenCount(reports: WorkReport[], employeeId: string): number {
  return reports.filter((r) => r.employeeId === employeeId && !r.seen).length;
}
