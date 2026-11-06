# Modelo de datos de ELVA Gestión

El modelo completo está en **`modelo-de-datos.json`**, en esta misma carpeta. Este archivo explica cómo leerlo.

## Buscar rápido

| Si buscás…                  | En el JSON está en                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Empleados y datos bancarios | `colecciones.colaboradores`, `colecciones.pago_privado`, `pantallas` → `dashboard.empleados`                                                 |
| Vacaciones                  | `colecciones.solicitudes_vacaciones`, `pantallas` → `dashboard.aprobarVacaciones`, `dashboard.vacacionesEstaSemana`, `trabajador.vacaciones` |
| Horas extra                 | `colecciones.solicitudes_horas`, `pantallas` → `dashboard.horasExtra`, `trabajador.horasExtra`                                               |
| Mis solicitudes             | `pantallas` → `trabajador.misSolicitudes`                                                                                                    |
| Pagos                       | `colecciones.pagos`, `pantallas` → `dashboard.pagos`                                                                                         |
| Reportes                    | `colecciones.reportes`, `pantallas` → `dashboard.reportes`, `trabajador.miReporte`                                                           |
| Avisos                      | `colecciones.avisos`, `pantallas` → `dashboard.avisos`, `trabajador.avisos`                                                                  |
| Actividad reciente          | `colecciones.actividad`, `pantallas` → `dashboard.actividad`                                                                                 |
| Resumen y feriados          | `calculadosSinGuardar`, `pantallas` → `dashboard.resumen`, `dashboard.feriados`                                                              |
| Notificaciones push         | `colecciones.tokens_push`                                                                                                                    |
| Permisos                    | `reglasFirestore`                                                                                                                            |

El mismo índice está al inicio del JSON, en `indice.porTema`.

**Cómo buscar:**

- **VS Code:** `Ctrl+Shift+O` muestra la lista de secciones del JSON; escribí, por ejemplo, `reportes` y salta ahí. `Ctrl+F` busca una palabra. Las flechitas a la izquierda de cada línea pliegan las secciones que no te interesan.
- **GitHub:** abrí el archivo y usá `Ctrl+F`.
- Cada colección tiene siempre el mismo orden: `ruta`, `descripcion`, `escribe`, `lee`, `campos` y `ejemplo`.

## Qué tiene el JSON

| Sección                     | Qué dice                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `convenciones`              | Formato de fechas y montos, estados, roles y la regla de no duplicar datos                                                              |
| `colecciones`               | Cada colección de Firestore: ruta, quién escribe, quién lee, campos (tipo, si es obligatorio, valores permitidos) y un ejemplo          |
| `calculadosSinGuardar`      | Lo que se calcula en el código y **no** se guarda (días, horas, totales, feriados)                                                      |
| `pantallas`                 | De qué colecciones sale cada parte del dashboard y de las páginas del trabajador, qué campo llena cada columna y qué escribe cada botón |
| `reglasFirestore`           | Quién puede leer y cambiar cada colección                                                                                               |
| `nombresFrontendAFirestore` | Cómo se llama cada dato en los tipos de TypeScript y en Firestore                                                                       |

## Sin datos duplicados

- Cada dato vive en **un solo lugar**. Las solicitudes, pagos, reportes, avisos y la actividad guardan solo el **`uid`**. El nombre, el correo, el rol y el saldo se leen de `colaboradores/{uid}`. El panel ya carga todos los colaboradores, así que se cruzan por `uid` sin consultas extra.
- **No se guarda** lo que se puede calcular: días descontados, horas, pago 1.5x / doble / triple, totales del resumen, conteos de "sin ver" y feriados. Las funciones ya existen en el código (`vacationDays`, `overtimeDays`, `overtimePay`, `costaRicaHolidays`).
- **Excepción a propósito:** `pagos.monto`. Es lo que se debía en ese momento, y no debe cambiar si después cambia el salario.
- Los datos bancarios van aparte, en `colaboradores/{uid}/privado/pago`, para que solo admin/rh los puedan leer.

## Colecciones

| Colección                          | Para qué                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `colaboradores/{uid}`              | Empleados (ya existe; se agregan `diasVacaciones` y `ultimaVisitaAvisos`) |
| `colaboradores/{uid}/privado/pago` | Cédula, IBAN, banco                                                       |
| `solicitudes_vacaciones/{id}`      | Pedidos de vacaciones                                                     |
| `solicitudes_horas/{id}`           | Pedidos de horas extra                                                    |
| `pagos/{id}`                       | Salarios y horas extra por pagar                                          |
| `reportes/{id}`                    | Reportes semanales (archivos en Storage)                                  |
| `avisos/{id}`                      | Avisos para todos                                                         |
| `actividad/{id}`                   | Bitácora de acciones de admins                                            |
| `tokens_push/{uid}`                | Tokens para las notificaciones push de admins                             |

## Cómo conectar el frontend

Hoy los datos salen de `RequestsStore` (en memoria) y de `admin-sample-data.ts` (ejemplos). Para conectarlo:

1. Cambiar el interior de `RequestsStore` para que lea y escriba estas colecciones.
2. Borrar los datos de ejemplo.

Las páginas casi no cambian.
