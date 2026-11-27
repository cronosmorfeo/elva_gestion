# Modelo de datos de ELVA Gestión

El modelo completo está en **`modelo-de-datos.json`**, en esta misma carpeta. Esta versión (2.0, 11 nov 2026) describe **lo que la página usa hoy**. La versión 1.0 era una propuesta: varios nombres cambiaron (por ejemplo, `vacations_requests` en vez de `solicitudes_vacaciones`).

## Buscar rápido

| Si buscás…                          | En el JSON está en                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Empleados y saldo de vacaciones     | `colecciones.colaboradores`, `pantallas` → `dashboard.editarEmpleado`, `trabajador.perfil`                                          |
| Cuenta de pago (IBAN)               | `colecciones.pago_privado`, `colecciones.bank_change_requests`, `pantallas` → `dashboard.cambiosDeCuenta`                           |
| Vacaciones                          | `colecciones.vacations_requests`, `pantallas` → `dashboard.aprobarVacaciones`, `trabajador.vacaciones`, `trabajador.misSolicitudes` |
| Horas extra                         | `colecciones.overtime_requests`, `pantallas` → `dashboard.horasExtra`, `trabajador.horasExtra`                                      |
| Avisos                              | `colecciones.notices`                                                                                                               |
| Reportes                            | `colecciones.weekly_reports`                                                                                                        |
| Notificaciones                      | `colecciones.fcm_tokens`, `notificaciones`                                                                                          |
| Lo que todavía no está en Firestore | `todaviaNoEnFirestore` (pagos, actividad)                                                                                           |
| Permisos                            | `reglasFirestore` (resumen; las reglas reales están en `firestore.rules`)                                                           |

**Cómo buscar:** en VS Code, `Ctrl+Shift+O` muestra las secciones del JSON y `Ctrl+F` busca una palabra. En GitHub, `Ctrl+F`.

## Colecciones

| Colección                          | Para qué                                      |
| ---------------------------------- | --------------------------------------------- |
| `colaboradores/{uid}`              | Empleados; incluye `vacaciones_disponibles`   |
| `colaboradores/{uid}/privado/pago` | Cédula, IBAN y moneda de la cuenta de pago    |
| `bank_change_requests/{id}`        | Pedidos del trabajador para cambiar su cuenta |
| `vacations_requests/{id}`          | Pedidos de vacaciones                         |
| `overtime_requests/{id}`           | Pedidos de horas extra                        |
| `notices/{id}`                     | Avisos para todos                             |
| `weekly_reports/{id}`              | Reportes semanales (adjuntos en Backblaze B2) |
| `users/{uid}/fcmTokens/{token}`    | Navegadores con notificaciones activadas      |
| `push_log/{clave}`                 | Avisos ya enviados por el Worker (solo él)    |
| `config/featureFlags`              | Feature flags: qué secciones se ven           |
| `config/seguridad`                 | Minutos sin uso antes de cerrar la sesión     |

## Reglas generales

- Las solicitudes guardan el `uid` de quien las pidió y también el nombre y el correo para mostrarlos rápido.
- `colaboradores.correo` es el correo personal con el que la persona inicia sesión; ahí le llegan los correos de ELVA Gestión (Resend, desde el Worker).
- `estado` puede ser `pendiente`, `aprobada`, `rechazada` o `cancelada`. Si falta, cuenta como pendiente.
- No se guarda lo que se puede calcular (feriados, horas, pago 1.5x/doble/triple, choques, antigüedad), salvo los días descontados, que quedan en la solicitud para poder devolverlos al cancelar.
- Vacaciones y horas extra se aprueban igual: hacen falta las dos aprobaciones, RH (`aprobacionRh`) y jefatura (`aprobacionJefatura`), en cualquier orden. La primera deja la solicitud pendiente; la segunda la aprueba (y descuenta los días). Cualquiera rechaza.
- Aprobar, rechazar y cancelar usan transacciones: si dos personas actúan a la vez, el saldo cambia una sola vez.

## Pendiente

- **Reglas de Firestore**: escritas en `firestore.rules` con pruebas en `firestore-tests/`. Cada proyecto de Firebase tiene que publicarlas (un pull no las publica).
- **Pagos y actividad** todavía no están en Firestore (`todaviaNoEnFirestore`).
