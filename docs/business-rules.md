# Business rules

How ELVA Gestión calculates vacation days, overtime pay and who gets notified. Items marked _pending HR_ still need confirmation.

## Vacation days

- Only working days are deducted. Weekends and **mandatory** Costa Rica holidays are not.
- Optional holidays (Aug 2, Aug 31, Dec 1) are deducted. _Pending HR._
- Holidays are calculated for any year, including Holy Thursday and Good Friday. Holidays moved by law go in `MOVED_HOLIDAYS` in `vacation-request/holidays.ts`.
- The worker picks the first day off and the **return day**; the last day off is the day before returning.
- **Balance:** `colaboradores.vacaciones_disponibles`, set by admins in Edit employee. Workers without a balance cannot request vacations.
- **Available to request** = balance − days of pending requests (never below 0).
- **Approving** deducts the days in a transaction and is blocked if the balance is not enough. The days deducted are saved in the request (`decision.diasDescontados`).
- **Cancelling** an approved vacation that has not started returns those same days.
- How days are earned over time (for example, per month worked) is not defined yet. _Pending HR._

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
