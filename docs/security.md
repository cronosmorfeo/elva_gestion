# Security notes

What each role may do, and what still has to be enforced. The app's guards only hide pages; **the Firestore rules are what really protects the data**.

## Current state

- `firestore.rules` closes everything by default and opens only what each role needs (table below). Every rule requires an **active** `colaboradores` document, so an anonymous or self-registered Firebase account gets nothing.
- **Rules are not deployed by a pull or by the seeds.** Each Firebase project uses the rules published to it: `firebase deploy --only firestore:rules`, or paste `firestore.rules` in Firebase console → Firestore → Rules → Publish. Publish to a test project first.
- **Tests:** `firestore-tests/` runs `rules.test.mjs` against the Firestore emulator (needs Java 21+): `cd firestore-tests`, `npm install`, `npm test`. Run them after any change to the rules.
- Data written before these rules must fit them: `tipo_colaborador` exactly `regular`, `rh` or `admin` (lowercase) and `activo: true`, or that person loses access.
- `environment.ts` and `environment.prod.ts` are never committed.

## What the rules enforce

| Data                                      | Read                                  | Write                                                                                               |
| ----------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `colaboradores/{uid}`                     | The owner, admin/HR                   | Admin/HR. Nobody changes their own role, `activo`, salary, balance, `acumulaDesde` or `diasAnuales` |
| `colaboradores/{uid}/privado/pago`        | The owner, admin/HR                   | Admin/HR, never on their own account                                                                |
| `bank_change_requests`                    | The owner, admin/HR                   | The owner creates it as pending; admin/HR mark it done                                              |
| `vacations_requests`, `overtime_requests` | The owner, admin/HR                   | The owner creates with their own `uid` and can only cancel; admin/HR decide                         |
| `weekly_reports`                          | The owner, admin/HR (never coworkers) | The owner creates; admin/HR set `visto`                                                             |
| `notices`                                 | Any active collaborator               | Admin/HR                                                                                            |
| `users/{uid}/fcmTokens`                   | The push Worker                       | Each active user saves only their own tokens; removing them only needs their own session            |
| `config/featureFlags`                     | Any active collaborator               | Only `admin` (the jefatura), from Administrar sistema and the seeds                                 |
| `config/seguridad`                        | Any active collaborator               | Only `admin` (the jefatura), from the seeds                                                         |

Admin/HR means `colaboradores/{uid}.tipo_colaborador` is `admin` or `rh` and `activo` is `true`. **Only `admin` (the jefatura) changes `tipo_colaborador` or deactivates an `admin` account**; otherwise HR could make an account admin and approve as the jefatura, or lock Félix or Vanessa out. The page enforces it (`editPermissions` in `decisions.ts`); the rules must too. Vacations and overtime: HR writes only `aprobacionRh` (a check, the request stays pending) and `admin` (the jefatura) only `aprobacionJefatura`; `estado` becomes `aprobada` only together with `aprobacionJefatura`. Either can reject.

## Administrar sistema and seeds

Only the jefatura (an active `admin` account) sees **Administrar sistema** in the dashboard. It turns the feature flags on and off and runs the seeds. HR and workers do not get the button, and `SystemAdminService` (`src/app/services/system-admin.ts`) reads the role from Firestore again before every write, so calling it from the browser console does not work either. That is still only the page: **the rules must allow writes in `config/` only to an active `admin`**, otherwise anyone could turn sections on or change the session timeout.

The seeds (`SEEDS` in the same file) create the configuration documents a Firebase project needs, with their defaults. They run when the jefatura opens the dashboard and with "Actualizar colecciones". They only add missing fields and never overwrite a value that is already there.

## Session timeout

After **30 minutes without use** the session closes and the page goes back to the login, for workers and for the dashboard. One minute before, a dialog asks "¿Sigue ahí?"; during that minute only its button keeps the session (moving the mouse does not). Activity in any open tab counts for all of them (shared through `localStorage`), and when the session closes in one tab the others go to the login too. A session left open (for example, the browser closed without signing out) is closed as soon as the page opens again after the time is up.

The minutes are in `config/seguridad.minutosInactividad` (whole number from 5 to 240; anything else uses 30), so they can be changed in the Firebase console without a deploy. Code: `src/app/shared/idle.ts` and `src/app/services/idle-logout.ts`. This only closes the session in the browser; it does not replace the Firestore rules.

## Passwords

Whoever creates an account never knows its password: Crear empleado creates it with 32 random bytes that are not shown or kept, and Firebase sends the person a link to choose their own (`sendPasswordResetEmail`), which also proves they own that e-mail. Changing it in the page asks for the current password again (`reauthenticateWithCredential`), needs at least 15 characters and then e-mails the person "Se cambió su contraseña" through the Worker (only they can trigger it, about themselves). "¿Olvidó su contraseña?" shows the same message for any address (with e-mail enumeration protection on, Firebase does too). The project's password policy (Firebase Authentication) is set by the Worker with the service account: at least 15 characters, no composition rules, as NIST SP 800-63B rev. 4 asks when the password is the only factor; it is enforced for new passwords and does not lock out existing ones (`forceUpgradeOnSignin: false`). For that the Worker's token also has the `cloud-platform` scope (as the Firebase Admin SDK); what it can do is still limited by the service account's role. Not covered: checking new passwords against lists of leaked ones (Firebase does not offer it), confirming new sign-ins by e-mail, or MFA (pending, S6). If the project's e-mail template can be edited, its links can open the page's own `/tabs/restablecer` instead of Firebase's page: Firebase still checks the single-use, expiring code (`verifyPasswordResetCode`, `confirmPasswordReset`), and the page removes it from the address bar at once. Code: `src/app/services/password.ts`, `src/app/password/`.

## Known gaps

- **Vacation balance:** when a worker cancels approved vacations, their browser returns the days. The rules only allow it in the same write that cancels that request (named in `colaboradores.devolucion.solicitud`), for exactly its `decision.diasDescontados`, and only before it starts.
- **Monthly accrual uses the device clock:** today's balance (`acumulaDesde` + full months) is computed with the browser's date, so moving the clock forward shows more days. Approval uses the admin's clock, so the risk is low today, but the rules should check the balance with `request.time` when a vacation is approved.
- **Own payment account and role:** blocked by the page and by the rules.
- **Feature flags only hide:** a section that is off is hidden and its page redirects, but its data can still be read or written directly in Firestore within each role's rules. If a feature must be really off, the rules have to block it too.
- **Deactivated accounts:** the rules block them (only their own `colaboradores` document stays readable) and nobody can set `activo` back to `true`, but their Firebase Authentication user still exists; disable it in Authentication too.
- **Push test page** (`/tabs/tab2`): removed. Keep anonymous sign-in off in Firebase.
- **Self-registration:** Crear empleado creates users from the browser, so sign-up stays open in Firebase Authentication. The rules give such an account nothing; creating users with a Cloud Function would let sign-up be turned off.
- **Self-approval:** the jefatura can approve their own requests and RH can review their own. Not blocked (decided with the company, 23 and 26 nov).
- **Names in requests:** the name and e-mail saved in a request (`nombreSolicitante`, `correoSolicitante`, `nombre`) are typed by the worker's browser and the rules do not check them. The dashboard shows the owner's own name from `colaboradores` (by `uid`) instead (`admin-dashboard/owner-names.ts`), and approving always deducts from the owner by `uid`. The Worker's e-mails and push to the panel still use the typed name: to fix it, the Worker should read the owner's `colaboradores` document.
- **No `console.log`:** it can print personal data in the browser. ESLint (`no-console`) only allows `console.warn` and `console.error`.
- **Notifications** must not include sensitive data, because they show on the lock screen.
- **Login messages:** a wrong e-mail and a wrong password show the same message, so the page does not tell which accounts exist. Firebase Authentication must also have **Email enumeration protection** on (console → Authentication → Settings; on by default in new projects), or its API still tells.
- **Dependency warnings in `firestore-tests/`:** `npm audit` lists about 17 issues in `firebase-tools` and `@firebase/rules-unit-testing` (`@grpc/grpc-js`, `glob`, `minimatch`, `uuid`...). They only run on a developer's computer against the emulator with a demo project, never in the page. The fix npm suggests is downgrading, so do **not** run `npm audit fix --force`; update `firebase-tools` from time to time instead.
- **Push Worker** (`worker/`): it uses a Firebase service account, which skips the Firestore rules, stored only as a Cloudflare secret (`FIREBASE_SERVICE_ACCOUNT`). It only answers the page addresses in `ALLOWED_ORIGINS`, checks the caller's Firebase ID token and that they are an active colaborador, reads the document itself instead of trusting the page, only lets the right person report each change, and sends each change once (`push_log`, which has no rule, so only the Worker can touch it). Errors show only in the Worker logs. If the key leaks, delete it in Google Cloud > IAM > Service accounts and create a new one.
- **E-mails (Resend):** sent by the same Worker after the same checks, only to the `colaboradores.correo` of the people the push goes to; the page never chooses the address, subject or content. The text comes from a fixed template with every value escaped (no HTML from anyone). The key has Sending access only and lives as a Worker secret (`RESEND_API_KEY`). E-mails carry no salary, ID number or full IBAN (payment changes show the last 4 digits), but they do carry names, dates and rejection reasons.

## Before publishing

Done in the code:

- `firebase.json` sends Content-Security-Policy (only this site's scripts; data only to Google APIs and the push Worker; `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` and HSTS. Angular's critical-CSS inline script is off (`inlineCritical: false`) so the CSP needs no `unsafe-inline` for scripts; styles keep `unsafe-inline` because Ionic sets styles at run time.
- Tab 2 (anonymous push test page) is no longer routed.
- Crear empleado has no password field: the account gets a random one and the person chooses theirs from Firebase's e-mail link (at least 15 characters, Firebase password policy).

In each Firebase / Google Cloud project (console, not code):

1. Firestore rules published (`firestore.rules`) and their tests passing.
2. Authentication > Sign-in method: **Anonymous off** (only Email/Password).
3. Authentication > Settings > User actions: **Email enumeration protection on**.
4. Google Cloud console > APIs & Services > Credentials: restrict the browser API key to the page's addresses (HTTP referrers) and to the Firebase APIs it uses.
5. Push Worker: the published address in `ALLOWED_ORIGINS`.

- **Report attachments (Backblaze B2):** the bucket is private and its key (limited to that bucket) is only a Worker secret. The Worker gives 5-minute signed links: uploads only for active colaboradores while `reportes` is on, with the type taken from the extension (allow-list) and the size and type inside the signature, so Backblaze itself refuses anything else; downloads only for the file's owner (the uid is in the path) or RH/the jefatura, always as a download (`Content-Disposition: attachment`), never shown as a page. The bucket's CORS (`worker/b2-cors-rules.json`) only allows the page addresses. Not checked: the real content of a file (a renamed file keeps its extension's type).

Still open (see the pending list): App Check, MFA for the panel, self sign-up in Firebase Auth (needed by Crear empleado until users are created by a server), and the Firebase password policy for existing accounts.
