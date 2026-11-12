# Security notes

What each role may do, and what still has to be enforced. The app's guards only hide pages; **the Firestore rules are what really protects the data**.

## Current state

- `firestore.rules` allows everything (`allow read, write: if true`). **Development only.** It must be replaced before loading real data, since Firestore holds salaries and bank accounts.
- `environment.ts` and `environment.prod.ts` are never committed.

## What the rules must enforce

| Data                                      | Read                                  | Write                                                                       |
| ----------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| `colaboradores/{uid}`                     | The owner, admin/HR                   | Admin/HR. Nobody changes their own role, `activo` or balance                |
| `colaboradores/{uid}/privado/pago`        | The owner, admin/HR                   | Admin/HR, never on their own account                                        |
| `bank_change_requests`                    | The owner, admin/HR                   | The owner creates it as pending; admin/HR mark it done                      |
| `vacations_requests`, `overtime_requests` | The owner, admin/HR                   | The owner creates with their own `uid` and can only cancel; admin/HR decide |
| `weekly_reports`                          | The owner, admin/HR (never coworkers) | The owner creates; admin/HR set `visto`                                     |
| `notices`                                 | Anyone signed in                      | Admin/HR                                                                    |
| `users/{uid}/fcmTokens`                   | Cloud Functions                       | Each user, only their own tokens                                            |

Admin/HR means `colaboradores/{uid}.tipo_colaborador` is `admin` or `rh` and `activo` is `true`.

## Known gaps

- **Vacation balance:** when a worker cancels, their browser returns the days to their own balance. The rules (or a Cloud Function) must only allow returning the `decision.diasDescontados` of that request.
- **Own payment account:** an admin can still change their own account in Edit employee. Another admin should do it.
- **Create employee** (`/tabs/tab3`) has no route guard yet.
- **Deactivated users** keep their session until they sign out.
- **Push test page** (`/tabs/tab2`) signs in anonymously; remove it and disable anonymous sign-in in Firebase.
- **Notifications** must not include sensitive data, because they show on the lock screen.
