// Notices that admins publish for every worker.
export interface Notice {
  id: string;
  title: string;
  message: string;
  important: boolean;
  author: string;
  createdAt: string; // YYYY-MM-DDTHH:mm
  updatedAt?: string;
}

export interface NoticeInput {
  title: string;
  message: string;
  important: boolean;
}

export const MAX_NOTICE_TITLE = 80;
export const MAX_NOTICE_MESSAGE = 600;

// Important ones on top, then the newest first.
export function sortNotices(notices: Notice[]): Notice[] {
  return [...notices].sort(
    (a, b) => Number(b.important) - Number(a.important) || b.createdAt.localeCompare(a.createdAt),
  );
}

// What is wrong with a notice before publishing it, or "" when it can be published.
export function noticeProblem(input: NoticeInput): string {
  if (!input.title.trim()) return 'Escribí un título.';
  if (!input.message.trim()) return 'Escribí el mensaje.';
  if (input.title.trim().length > MAX_NOTICE_TITLE) return `El título puede tener hasta ${MAX_NOTICE_TITLE} letras.`;
  if (input.message.trim().length > MAX_NOTICE_MESSAGE)
    return `El mensaje puede tener hasta ${MAX_NOTICE_MESSAGE} letras.`;
  return '';
}

// Notices published after the worker last opened the notices page.
export function unseenNotices(notices: Notice[], lastSeen: string): number {
  return notices.filter((n) => n.createdAt > lastSeen).length;
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function localDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
