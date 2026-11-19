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
| `notices`                                 | Anyone signed in                      | Admin/HR                                                                                    |
| `users/{uid}/fcmTokens`                   | Cloud Functions                       | Each user, only their own tokens                                                            |
| `config/featureFlags`                     | Anyone signed in                      | Nobody from the app (Firebase console only)                                                 |

Admin/HR means `colaboradores/{uid}.tipo_colaborador` is `admin` or `rh` and `activo` is `true`. Vacations: HR writes only `aprobacionRh` (a check, the request stays pending) and `admin` (the jefatura) only `aprobacionJefatura`; `estado` becomes `aprobada` only together with `aprobacionJefatura`. Either can reject.

## Known gaps

- **Vacation balance:** when a worker cancels, their browser returns the days to their own balance. The rules (or a Cloud Function) must only allow returning the `decision.diasDescontados` of that request.
- **Monthly accrual uses the device clock:** today's balance (`acumulaDesde` + full months) is computed with the browser's date, so moving the clock forward shows more days. Approval uses the admin's clock, so the risk is low today, but the rules should check the balance with `request.time` when a vacation is approved.
- **Own payment account and role:** the page blocks them in Edit employee, but only the rules can really enforce it.
- **Feature flags only hide:** a section that is off is hidden and its page redirects, but its data can still be read or written directly in Firestore. If a feature must be really off, the rules have to block it too.
- **Deactivated accounts:** the page blocks reactivation and signs the person out, but their Firebase Authentication user still exists. The rules must require `activo == true`, and nobody may set `activo` back to `true`.
- **Push test page** (`/tabs/tab2`) signs in anonymously; remove it and disable anonymous sign-in in Firebase.
- **Notifications** must not include sensitive data, because they show on the lock screen.
