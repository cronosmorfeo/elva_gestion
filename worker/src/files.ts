// Report attachments in Backblaze B2. Pure rules (no network), so they have tests.

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const URL_SECONDS = 300;

// Only these types. The content type comes from the extension, never from what the browser says,
// and downloads are always "attachment", so a file can never run as a page.
const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
};

export const ALLOWED_EXTENSIONS = Object.keys(TYPES);

export type UploadCheck = { ok: true; name: string; contentType: string } | { ok: false; error: string };

export function checkUpload(name: unknown, size: unknown): UploadCheck {
  if (typeof name !== 'string' || !name.trim()) return { ok: false, error: 'missing name' };
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) return { ok: false, error: 'bad size' };
  if (size > MAX_FILE_BYTES) return { ok: false, error: 'too big' };
  const clean = safeName(name);
  const ext = clean.split('.').pop()?.toLowerCase() ?? '';
  const contentType = TYPES[ext];
  if (!clean.includes('.') || !contentType) return { ok: false, error: 'type not allowed' };
  return { ok: true, name: clean, contentType };
}

// Letters, digits, dot, dash and underscore only (accents removed), at most 80 characters, extension kept.
export function safeName(name: string): string {
  const plain = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+/, '');
  if (plain.length <= 80) return plain || 'archivo';
  const dot = plain.lastIndexOf('.');
  const ext = dot > 0 ? plain.slice(dot) : '';
  return plain.slice(0, 80 - ext.length) + ext;
}

// reports/{uid}/{uuid}-{name}: the owner is part of the path, so the Worker can check it without Firestore.
export function reportPath(uid: string, id: string, name: string): string {
  return `reports/${uid}/${id}-${name}`;
}

// The owner's uid if the path is a report file, or null.
export function ownerOf(path: unknown): string | null {
  if (typeof path !== 'string' || path.length > 300) return null;
  const m = /^reports\/([A-Za-z0-9_-]{1,128})\/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,80}$/.exec(path);
  return m ? m[1] : null;
}

// Name for the download: the original name without the uuid.
export function downloadName(path: string): string {
  return path.split('/').pop()!.slice(37);
}

export function contentTypeOf(path: string): string {
  return TYPES[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}
