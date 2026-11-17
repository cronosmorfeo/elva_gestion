# Business rules

How ELVA Gestión calculates vacation days, overtime pay and who gets notified. Items marked _pending HR_ still need confirmation.

## Vacation days

- Only working days are deducted. Weekends and Costa Rica holidays, **mandatory or optional** (Aug 2, Aug 31, Dec 1), are not (confirmed by HR).
- Holidays are calculated for any year, including Holy Thursday and Good Friday. Holidays moved by law go in `MOVED_HOLIDAYS` in `vacation-request/holidays.ts`.
- The worker picks the first day off and the **return day**; the last day off is the day before returning.
- **Half days:** a half day is 4 hours off on one working day and deducts 0.5. On the request page the worker picks the same day as first day and return day, then the start time (every 30 minutes, from 12:00 a. m. to 8:00 p. m., so it ends the same day); the end is 4 hours later. It is saved like a one-day request (`diaFin` = next day) with `vacations_requests.medioDiaDesde` = "HH:mm". Balances can have half days.
- **Earning days (confirmed by HR):** 12 days a year for everyone, earned **one per full month** (`colaboradores.diasAnuales`, default 12; it can be changed per employee in Edit employee). Days are earned from the day the balance is entered in the app (`colaboradores.acumulaDesde`), so days earned before are not counted twice. Other yearly amounts are rounded down to half days.
- **Balance today** = `colaboradores.vacaciones_disponibles` (entered balance minus what was used) + days earned since `acumulaDesde`. Admins set today's balance in Edit employee; the app stores the part that makes the total match. New employees get the days they already have when they are created. Workers without a balance cannot request vacations.
- **Available to request** = balance − days of pending requests (never below 0).
- **Approving** deducts the days in a transaction and is blocked if the balance is not enough. The days deducted are saved in the request (`decision.diasDescontados`).
- **Cancelling** an approved vacation that has not started returns those same days.

## Overtime

- Requests start today or later. A request that crosses midnight is split by calendar day.
- Workdays and optional holidays pay **1.5x**.
- Sundays and mandatory holidays pay **double** up to an 8-hour shift, then **triple**. Whether Saturday is also a rest day is _pending HR_ (`REST_WEEKDAYS` in `overtime-request/overtime-hours.ts`).
- Shift plus overtime cannot exceed **12 hours a day**: up to 4 overtime hours on a workday, up to 12 on a rest day.
- A request can cover up to one year.

## Requests

- Status: `pendiente`, `aprobada`, `rechazada` or `cancelada`. A request without status counts as pending.
- Rejecting requires a reason (up to 200 characters); the worker sees it.
- Workers can cancel pending or approved requests that have not started. Admins are notified.
- Pending vacations show a warning when they overlap someone else's approved vacations.
- Approving vacations, rejecting and cancelling run in Firestore transactions, so two people acting at once cannot apply a change twice.

## Notifications

| Who      | When                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| Admin/HR | A worker sends or cancels a request, or asks to change their payment account                                 |
| Worker   | A request is approved or rejected (with the reason), a notice is published, or their payment account changes |

- Workers enable them with **Activar notificaciones** (navbar or dashboard).
- **Page open:** the app shows an in-page card if the page is visible, or a system notification otherwise.
- **Page closed:** Cloud Functions send a push (needs the Blaze plan; see [`functions/README.md`](../functions/README.md)).
- Both use the same tag, so the browser shows only one. Weekly reports do not notify.
