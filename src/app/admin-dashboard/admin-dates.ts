const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const pad = (n: number): string => String(n).padStart(2, '0');

// "Miércoles 4 de noviembre de 2026", in local time.
export function formatLongDate(date: Date): string {
  const text = `${WEEKDAYS[date.getDay()]} ${date.getDate()} de ${MONTHS[date.getMonth()]} de ${date.getFullYear()}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// "lun 14 dic" for a YYYY-MM-DD date.
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()].slice(0, 3)} ${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

// "5:00 p. m." for the time part of YYYY-MM-DDTHH:mm.
export function formatTime(dateTime: string): string {
  const [h, min] = dateTime.slice(11, 16).split(':').map(Number);
  const suffix = h < 12 ? 'a. m.' : 'p. m.';
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(min)} ${suffix}`;
}

// "4:15 p. m." for a local time.
export function formatClock(date: Date): string {
  return formatTime(`${localIsoDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`);
}

// Local YYYY-MM-DD.
export function localIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// YYYY-MM-DD plus n days.
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return localIsoDate(new Date(y, m - 1, d + days));
}

// Milliseconds until the next local midnight.
export function msUntilMidnight(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
}

// "1.ª quincena de noviembre de 2026".
export function quincenaLabel(date: Date): string {
  return `${date.getDate() <= 15 ? '1.ª' : '2.ª'} quincena de ${MONTHS[date.getMonth()]} de ${date.getFullYear()}`;
}
