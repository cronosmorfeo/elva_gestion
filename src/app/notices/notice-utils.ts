// Notices that admins publish for every worker.
export interface Notice {
  id: string;
  title: string;
  message: string;
  important: boolean;
  author: string;
  createdAt: string; // YYYY-MM-DDTHH:mm
  updatedAt?: string;
  sample?: boolean;
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

function daysAgo(days: number, time: string): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${localDateTime(d).slice(0, 10)}T${time}`;
}

export function sampleNotices(): Notice[] {
  return [
    {
      id: 'n1',
      title: 'El 1 de enero sí se trabaja, con pago doble',
      message:
        'Ejemplo: por el cierre del proyecto, el 1 de enero se trabaja normal. Como es feriado obligatorio, esas horas se pagan doble (y triple después de 8 horas). Si no puede venir, avísele a RH antes del 20 de diciembre.',
      important: true,
      author: 'Recursos Humanos',
      createdAt: daysAgo(1, '09:15'),
      sample: true,
    },
    {
      id: 'n2',
      title: 'Cierre de planilla de noviembre',
      message:
        'Ejemplo: las solicitudes de horas extra de noviembre se reciben hasta el viernes 27. Lo que llegue después se paga en la planilla de diciembre.',
      important: false,
      author: 'Administración',
      createdAt: daysAgo(3, '14:40'),
      sample: true,
    },
    {
      id: 'n3',
      title: 'Nuevo reporte semanal',
      message:
        'Ejemplo: ya pueden mandar su reporte semanal desde "Mi reporte". Es opcional: escriban qué hicieron o adjunten archivos.',
      important: false,
      author: 'Administración',
      createdAt: daysAgo(6, '08:30'),
      sample: true,
    },
  ];
}
