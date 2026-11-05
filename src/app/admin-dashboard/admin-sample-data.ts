// Sample data to try the dashboard until the requests are saved in Firestore.
// Dates are relative to today, so there is always something to approve.
// TODO: delete this file once the backend is ready.
import { addWeeks, mondayOf } from '../reports/report-utils';
import type { WorkReport } from '../reports/report-utils';

import { addDays, localIsoDate } from './admin-dates';
import type { OvertimeRequest, Payee, PendingPayment, VacationRequest } from './admin-requests';
import { upcomingHolidays } from './admin-requests';

export interface SampleEmployee {
  id: string;
  name: string;
  email: string;
  tipo: string;
  jornada: string;
  fechaIngreso: string;
  activo: boolean;
  salario?: number;
  horario?: string;
}

// Monthly salary and schedule of each sample employee, by id.
const SAMPLE_JOB: Record<string, { salario: number; horario: string }> = {
  e1: { salario: 850000, horario: '8:00 a. m. - 5:00 p. m.' },
  e2: { salario: 1020000, horario: '8:00 a. m. - 5:00 p. m.' },
  e3: { salario: 780000, horario: '7:00 a. m. - 4:00 p. m.' },
  e4: { salario: 455000, horario: '8:00 a. m. - 12:00 p. m.' },
  e5: { salario: 690000, horario: '10:00 p. m. - 6:00 a. m.' },
  e6: { salario: 1150000, horario: '8:00 a. m. - 5:00 p. m.' },
  e7: { salario: 380000, horario: '1:00 p. m. - 5:00 p. m.' },
  e8: { salario: 1400000, horario: '9:00 a. m. - 6:00 p. m.' },
  e9: { salario: 720000, horario: '8:00 a. m. - 5:00 p. m.' },
  e10: { salario: 800000, horario: '8:00 a. m. - 5:00 p. m.' },
  e11: { salario: 400000, horario: '8:00 a. m. - 12:00 p. m.' },
};

const today = localIsoDate(new Date());
const day = (offset: number): string => addDays(today, offset);
const at = (offset: number, time: string): string => `${day(offset)}T${time}`;

// Days from today to the next given weekday (0 = Sunday), at least `min` days ahead.
function next(weekday: number, min = 1): number {
  const [y, m, d] = today.split('-').map(Number);
  for (let i = min; i < min + 7; i++) {
    if (new Date(y, m - 1, d + i).getDay() === weekday) return i;
  }
  return min;
}

function daysUntil(iso: string): number {
  const [y1, m1, d1] = today.split('-').map(Number);
  const [y2, m2, d2] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

// The next mandatory holiday at least a week away, to test that it is not deducted.
const holiday = upcomingHolidays(day(7), 12).find((h) => h.mandatory) ?? { date: day(30) };
const h = daysUntil(holiday.date);

const mon = next(1, 14);
const wed = next(3, 5);
const fri = next(5, 9);

export const SAMPLE_VACATIONS: VacationRequest[] = [
  {
    id: 'v1',
    employee: 'Ana Solís',
    balance: 12,
    start: day(mon),
    returnDate: day(mon + 7),
    rhReviewed: true,
    status: 'pendiente',
  },
  {
    id: 'v2',
    employee: 'Daniela Vargas',
    balance: 9,
    start: day(h - 2),
    returnDate: day(h + 3),
    rhReviewed: true,
    status: 'pendiente',
  },
  {
    id: 'v3',
    employee: 'Luis Herrera',
    balance: 4,
    start: day(wed),
    returnDate: day(wed + 1),
    rhReviewed: true,
    status: 'pendiente',
  },
  {
    id: 'v4',
    employee: 'Carlos Mora',
    balance: 6,
    start: day(fri),
    returnDate: day(fri + 3),
    rhReviewed: false,
    status: 'pendiente',
  },
  {
    id: 'v5',
    employee: 'Valeria Castro',
    balance: 15,
    start: day(mon + 7),
    returnDate: day(mon + 21),
    rhReviewed: true,
    status: 'pendiente',
  },
  {
    id: 'v6',
    employee: 'Jorge Ramírez',
    balance: 2,
    start: day(next(3, 10)),
    returnDate: day(next(3, 10) + 5),
    rhReviewed: true,
    status: 'pendiente',
  },
  {
    id: 'v7',
    employee: 'Paula Méndez',
    balance: 8,
    start: day(next(4, 12)),
    returnDate: day(next(4, 12) + 4),
    rhReviewed: false,
    status: 'pendiente',
  },
  {
    id: 'v8',
    employee: 'Sofía Araya',
    balance: 7,
    start: day(-2),
    returnDate: day(next(1, 2)),
    rhReviewed: true,
    status: 'aprobada',
  },
  {
    id: 'v9',
    employee: 'Diego Campos',
    balance: 10,
    start: day(1),
    returnDate: day(next(1, 2)),
    rhReviewed: true,
    status: 'aprobada',
  },
  {
    id: 'v10',
    employee: 'Mario Quesada',
    balance: 3,
    start: day(20),
    returnDate: day(22),
    rhReviewed: true,
    status: 'rechazada',
  },
];

const sun = next(0, 2);
const friNight = next(5, 1);

export const SAMPLE_OVERTIME: OvertimeRequest[] = [
  {
    id: 'o1',
    employee: 'Pablo Jiménez',
    start: at(sun, '08:00'),
    end: at(sun, '18:00'),
    task: 'Migración del servidor de correo',
    rhReviewed: true,
    status: 'pendiente',
  },
  {
    id: 'o2',
    employee: 'Carlos Mora',
    start: at(friNight, '22:00'),
    end: at(friNight + 1, '02:00'),
    task: 'Monitoreo de la actualización del firewall',
    rhReviewed: true,
    status: 'pendiente',
  },
  {
    id: 'o3',
    employee: 'Ana Solís',
    start: at(next(3), '17:00'),
    end: at(next(3), '20:00'),
    task: 'Cierre del informe mensual',
    rhReviewed: false,
    status: 'pendiente',
  },
  {
    id: 'o4',
    employee: 'Valeria Castro',
    start: at(next(2), '17:00'),
    end: at(next(2), '21:00'),
    task: 'Pruebas de la nueva VPN',
    rhReviewed: true,
    status: 'pendiente',
  },
  {
    id: 'o5',
    employee: 'Jorge Ramírez',
    start: at(h, '09:00'),
    end: at(h, '13:00'),
    task: 'Soporte durante el feriado',
    rhReviewed: true,
    status: 'pendiente',
  },
  {
    id: 'o6',
    employee: 'Paula Méndez',
    start: at(next(6), '08:00'),
    end: at(next(6), '12:00'),
    task: 'Inventario de equipos',
    rhReviewed: false,
    status: 'pendiente',
  },
  {
    id: 'o7',
    employee: 'Luis Herrera',
    start: at(next(4), '17:00'),
    end: at(next(4), '18:30'),
    task: 'Reunión con el proveedor de nube',
    rhReviewed: true,
    status: 'pendiente',
  },
  {
    id: 'o8',
    employee: 'Luis Herrera',
    start: at(-1, '17:00'),
    end: at(-1, '20:00'),
    task: 'Respaldo de la base de datos',
    rhReviewed: true,
    status: 'aprobada',
  },
  {
    id: 'o9',
    employee: 'Sofía Araya',
    start: at(-6, '17:00'),
    end: at(-6, '19:00'),
    task: 'Revisión de alertas pendientes',
    rhReviewed: true,
    status: 'aprobada',
  },
  {
    id: 'o10',
    employee: 'Diego Campos',
    start: at(-3, '18:00'),
    end: at(-3, '22:00'),
    task: 'Actualización de servidores',
    rhReviewed: true,
    status: 'rechazada',
  },
];

export const SAMPLE_PAYMENTS: PendingPayment[] = [
  { id: 'p1', kind: 'salario', concept: 'Salario de quincena', employee: 'Ana Solís', amount: 425000, paid: false },
  { id: 'p2', kind: 'salario', concept: 'Salario de quincena', employee: 'Pablo Jiménez', amount: 510000, paid: false },
  {
    id: 'p3',
    kind: 'salario',
    concept: 'Salario de quincena',
    employee: 'Daniela Vargas',
    amount: 390000,
    paid: false,
  },
  { id: 'p4', kind: 'salario', concept: 'Salario de quincena', employee: 'Luis Herrera', amount: 455000, paid: false },
  {
    id: 'p5',
    kind: 'horas',
    concept: 'Horas extra (3 h a 1.5x)',
    employee: 'Luis Herrera',
    amount: 21300,
    paid: false,
  },
  { id: 'p6', kind: 'horas', concept: 'Horas extra (2 h a 1.5x)', employee: 'Sofía Araya', amount: 13100, paid: false },
  { id: 'p7', kind: 'salario', concept: 'Salario de quincena', employee: 'Carlos Mora', amount: 405000, paid: false },
  {
    id: 'p8',
    kind: 'salario',
    concept: 'Salario de quincena',
    employee: 'Valeria Castro',
    amount: 560000,
    paid: false,
  },
  { id: 'p9', kind: 'salario', concept: 'Salario de quincena', employee: 'Jorge Ramírez', amount: 430000, paid: false },
  {
    id: 'p10',
    kind: 'horas',
    concept: 'Horas extra (4 h a 1.5x)',
    employee: 'Pablo Jiménez',
    amount: 31900,
    paid: false,
  },
];

const SAMPLE_EMPLOYEE_LIST: SampleEmployee[] = [
  {
    id: 'e1',
    name: 'Ana Solís',
    email: 'ana.solis@ejemplo.com',
    tipo: 'regular',
    jornada: 'completa',
    fechaIngreso: '2023-02-13',
    activo: true,
  },
  {
    id: 'e2',
    name: 'Pablo Jiménez',
    email: 'pablo.jimenez@ejemplo.com',
    tipo: 'regular',
    jornada: 'completa',
    fechaIngreso: '2021-08-02',
    activo: true,
  },
  {
    id: 'e3',
    name: 'Daniela Vargas',
    email: 'daniela.vargas@ejemplo.com',
    tipo: 'regular',
    jornada: 'completa',
    fechaIngreso: '2022-05-16',
    activo: true,
  },
  {
    id: 'e4',
    name: 'Luis Herrera',
    email: 'luis.herrera@ejemplo.com',
    tipo: 'regular',
    jornada: 'medio',
    fechaIngreso: '2024-01-08',
    activo: true,
  },
  {
    id: 'e5',
    name: 'Carlos Mora',
    email: 'carlos.mora@ejemplo.com',
    tipo: 'regular',
    jornada: 'nocturna',
    fechaIngreso: '2023-10-02',
    activo: true,
  },
  {
    id: 'e6',
    name: 'Valeria Castro',
    email: 'valeria.castro@ejemplo.com',
    tipo: 'rh',
    jornada: 'completa',
    fechaIngreso: '2020-03-09',
    activo: true,
  },
  {
    id: 'e7',
    name: 'Jorge Ramírez',
    email: 'jorge.ramirez@ejemplo.com',
    tipo: 'regular',
    jornada: 'parcial',
    fechaIngreso: '2025-06-23',
    activo: true,
  },
  {
    id: 'e8',
    name: 'Paula Méndez',
    email: 'paula.mendez@ejemplo.com',
    tipo: 'admin',
    jornada: 'flexible',
    fechaIngreso: '2019-11-18',
    activo: true,
  },
  {
    id: 'e9',
    name: 'Sofía Araya',
    email: 'sofia.araya@ejemplo.com',
    tipo: 'regular',
    jornada: 'completa',
    fechaIngreso: '2022-09-05',
    activo: true,
  },
  {
    id: 'e10',
    name: 'Diego Campos',
    email: 'diego.campos@ejemplo.com',
    tipo: 'regular',
    jornada: 'completa',
    fechaIngreso: '2024-07-15',
    activo: true,
  },
  {
    id: 'e11',
    name: 'Mario Quesada',
    email: 'mario.quesada@ejemplo.com',
    tipo: 'regular',
    jornada: 'medio',
    fechaIngreso: '2021-04-12',
    activo: false,
  },
];

export const SAMPLE_EMPLOYEES: SampleEmployee[] = SAMPLE_EMPLOYEE_LIST.map((e) => ({ ...e, ...SAMPLE_JOB[e.id] }));

// Invented people and accounts, only to try the payment window.
export const SAMPLE_PAYEES: Record<string, Payee> = {
  'Ana Solís': {
    fullName: 'Ana María Solís Rojas',
    cedula: '1-1523-0847',
    email: 'ana.solis@ejemplo.com',
    bank: 'Banco Nacional de Costa Rica',
    iban: 'CR05015100010012345678',
  },
  'Pablo Jiménez': {
    fullName: 'Pablo Andrés Jiménez Mora',
    cedula: '2-0789-0412',
    email: 'pablo.jimenez@ejemplo.com',
    bank: 'Banco de Costa Rica',
    iban: 'CR21015201001098765432',
  },
  'Daniela Vargas': {
    fullName: 'Daniela Vargas Chacón',
    cedula: '1-1689-0233',
    email: 'daniela.vargas@ejemplo.com',
    bank: 'BAC Credomatic',
    iban: 'CR37010200009123456789',
  },
  'Luis Herrera': {
    fullName: 'Luis Fernando Herrera Soto',
    cedula: '4-0251-0918',
    email: 'luis.herrera@ejemplo.com',
    bank: 'Banco Popular',
    iban: 'CR44016111084000123456',
  },
  'Sofía Araya': {
    fullName: 'Sofía Araya Brenes',
    cedula: '3-0498-0721',
    email: 'sofia.araya@ejemplo.com',
    bank: 'Banco Nacional de Costa Rica',
    iban: 'CR58015100010076543210',
  },
  'Carlos Mora': {
    fullName: 'Carlos Eduardo Mora Vega',
    cedula: '1-1402-0556',
    email: 'carlos.mora@ejemplo.com',
    bank: 'Davivienda',
    iban: 'CR62010400012345678901',
  },
  'Valeria Castro': {
    fullName: 'Valeria Castro Quirós',
    cedula: '1-1210-0389',
    email: 'valeria.castro@ejemplo.com',
    bank: 'BAC Credomatic',
    iban: 'CR79010200009876543210',
  },
  'Jorge Ramírez': {
    fullName: 'Jorge Luis Ramírez Fallas',
    cedula: '6-0377-0164',
    email: 'jorge.ramirez@ejemplo.com',
    bank: 'Banco de Costa Rica',
    iban: 'CR83015201001011223344',
  },
};

// Weekly reports. The current and last week have some unseen ones.
const thisWeek = mondayOf(today);
const week = (back: number): string => addWeeks(thisWeek, -back);
const friday = (back: number, time: string): string => `${addDays(week(back), 4)}T${time}`;
const KB = 1024;

export const SAMPLE_REPORTS: WorkReport[] = [
  {
    id: 'r1',
    employeeId: 'e1',
    employee: 'Ana Solís',
    weekStart: week(1),
    sentAt: friday(1, '16:40'),
    text: 'Terminé la conciliación de facturas de octubre y revisé los pagos a proveedores. Quedó pendiente una factura de Grupo Ríos porque no tiene orden de compra.',
    files: [{ name: 'conciliacion-octubre.xlsx', size: 184 * KB, type: '' }],
    seen: false,
  },
  {
    id: 'r2',
    employeeId: 'e1',
    employee: 'Ana Solís',
    weekStart: week(2),
    sentAt: friday(2, '15:10'),
    text: 'Preparé el cierre de mes y actualicé el control de gastos.',
    files: [],
    seen: true,
  },
  {
    id: 'r3',
    employeeId: 'e2',
    employee: 'Pablo Jiménez',
    weekStart: week(1),
    sentAt: friday(1, '17:05'),
    text: '',
    files: [
      { name: 'avance-sprint-14.pdf', size: 1.4 * 1024 * KB, type: 'application/pdf' },
      { name: 'captura-tablero.png', size: 620 * KB, type: 'image/png' },
    ],
    seen: false,
  },
  {
    id: 'r4',
    employeeId: 'e2',
    employee: 'Pablo Jiménez',
    weekStart: week(2),
    sentAt: friday(2, '16:30'),
    text: 'Arreglé el error del inicio de sesión en móviles y documenté la API de vacaciones.',
    files: [{ name: 'notas-api.docx', size: 92 * KB, type: '' }],
    seen: true,
  },
  {
    id: 'r5',
    employeeId: 'e2',
    employee: 'Pablo Jiménez',
    weekStart: week(3),
    sentAt: friday(3, '16:00'),
    text: 'Reunión con el cliente y estimación de las tareas del próximo sprint.',
    files: [],
    seen: true,
  },
  {
    id: 'r6',
    employeeId: 'e3',
    employee: 'Daniela Vargas',
    weekStart: week(1),
    sentAt: friday(1, '14:20'),
    text: 'Atendí 38 tiquetes de soporte, 3 quedaron escalados a infraestructura. Adjunto el resumen.',
    files: [{ name: 'tiquetes-semana.pdf', size: 310 * KB, type: 'application/pdf' }],
    seen: true,
  },
  {
    id: 'r7',
    employeeId: 'e4',
    employee: 'Luis Herrera',
    weekStart: week(1),
    sentAt: friday(1, '18:15'),
    text: 'Visité a dos clientes en Heredia y cerré la renovación del contrato de mantenimiento.',
    files: [],
    seen: false,
  },
  {
    id: 'r8',
    employeeId: 'e5',
    employee: 'Carlos Mora',
    weekStart: week(2),
    sentAt: friday(2, '15:45'),
    text: 'Inventario de la bodega y pedido de materiales.',
    files: [{ name: 'inventario.csv', size: 12 * KB, type: 'text/csv' }],
    seen: true,
  },
  {
    id: 'r9',
    employeeId: 'e9',
    employee: 'Sofía Araya',
    weekStart: week(1),
    sentAt: friday(1, '16:55'),
    text: 'Diseñé las piezas de la campaña de diciembre. Las capturas tienen las tres versiones.',
    files: [
      { name: 'campana-v1.jpg', size: 880 * KB, type: 'image/jpeg' },
      { name: 'campana-v2.jpg', size: 910 * KB, type: 'image/jpeg' },
      { name: 'campana-v3.jpg', size: 860 * KB, type: 'image/jpeg' },
    ],
    seen: false,
  },
];
