# Security notes

What each role may do, and what still has to be enforced. The app's guards only hide pages; **the Firestore rules are what really protects the data**.

## Current state

- `firestore.rules` allows everything (`allow read, write: if true`). **Development only.** It must be replaced before loading real data, since Firestore holds salaries and bank accounts.
- `environment.ts` and `environment.prod.ts` are never committed.

## What the rules must enforce

| Data                                      | Read                                  | Write                                                                                       |
| ----------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `colaboradores/{uid}`                     | The owner, admin/HR                   | Admin/HR. Nobody changes their own role, `activo`, balance, `acumulaDesde` or `diasAnuales` |
| `colaboradores/{uid}/privado/pago`        | The owner, admin/HR                   | Admin/HR, never on their own account                                                        |
| `bank_change_requests`                    | The owner, admin/HR                   | The owner creates it as pending; admin/HR mark it done                                      |
| `vacations_requests`, `overtime_requests` | The owner, admin/HR                   | The owner creates with their own `uid` and can only cancel; admin/HR decide                 |
| `weekly_reports`                          | The owner, admin/HR (never coworkers) | The owner creates; admin/HR set `visto`                                                     |
| `notices`                                 | Any active collaborator               | Admin/HR                                                                                    |
| `users/{uid}/fcmTokens`                   | Cloud Functions                       | Each user, only their own tokens                                                            |
| `config/featureFlags`                     | Any active collaborator               | Only `admin` (the jefatura), from Administrar sistema and the seeds                         |
| `config/seguridad`                        | Any active collaborator               | Only `admin` (the jefatura), from the seeds                                                 |

Admin/HR means `colaboradores/{uid}.tipo_colaborador` is `admin` or `rh` and `activo` is `true`. **Only `admin` (the jefatura) changes `tipo_colaborador` or deactivates an `admin` account**; otherwise HR could make an account admin and approve as the jefatura, or lock Félix or Vanessa out. The page enforces it (`editPermissions` in `decisions.ts`); the rules must too. Vacations and overtime: HR writes only `aprobacionRh` (a check, the request stays pending) and `admin` (the jefatura) only `aprobacionJefatura`; `estado` becomes `aprobada` only together with `aprobacionJefatura`. Either can reject.

## Administrar sistema and seeds

Only the jefatura (an active `admin` account) sees **Administrar sistema** in the dashboard. It turns the feature flags on and off and runs the seeds. HR and workers do not get the button, and `SystemAdminService` (`src/app/services/system-admin.ts`) reads the role from Firestore again before every write, so calling it from the browser console does not work either. That is still only the page: **the rules must allow writes in `config/` only to an active `admin`**, otherwise anyone could turn sections on or change the session timeout.

The seeds (`SEEDS` in the same file) create the configuration documents a Firebase project needs, with their defaults. They run when the jefatura opens the dashboard and with "Actualizar colecciones". They only add missing fields and never overwrite a value that is already there.

## Session timeout

After **30 minutes without use** the session closes and the page goes back to the login, for workers and for the dashboard. One minute before, a dialog asks "¿Sigue ahí?"; during that minute only its button keeps the session (moving the mouse does not). Activity in any open tab counts for all of them (shared through `localStorage`), and when the session closes in one tab the others go to the login too. A session left open (for example, the browser closed without signing out) is closed as soon as the page opens again after the time is up.

The minutes are in `config/seguridad.minutosInactividad` (whole number from 5 to 240; anything else uses 30), so they can be changed in the Firebase console without a deploy. Code: `src/app/shared/idle.ts` and `src/app/services/idle-logout.ts`. This only closes the session in the browser; it does not replace the Firestore rules.

## Known gaps

- **Vacation balance:** when a worker cancels, their browser returns the days to their own balance. The rules (or a Cloud Function) must only allow returning the `decision.diasDescontados` of that request.
- **Monthly accrual uses the device clock:** today's balance (`acumulaDesde` + full months) is computed with the browser's date, so moving the clock forward shows more days. Approval uses the admin's clock, so the risk is low today, but the rules should check the balance with `request.time` when a vacation is approved.
- **Own payment account and role:** the page blocks them in Edit employee, but only the rules can really enforce it.
- **Feature flags only hide:** a section that is off is hidden and its page redirects, but its data can still be read or written directly in Firestore. If a feature must be really off, the rules have to block it too.
- **Deactivated accounts:** the page blocks reactivation and signs the person out, but their Firebase Authentication user still exists. The rules must require `activo == true`, and nobody may set `activo` back to `true`.
- **Push test page** (`/tabs/tab2`) signs in anonymously; remove it and disable anonymous sign-in in Firebase.
- **No `console.log`:** it can print personal data in the browser. ESLint (`no-console`) only allows `console.warn` and `console.error`.
- **Notifications** must not include sensitive data, because they show on the lock screen.
