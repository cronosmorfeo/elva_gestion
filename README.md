# ELVA Gestión

Internal Human Resources app for ELVA IA. Employees submit requests (vacation and overtime) and administrators review and approve them. The first version covers Costa Rica only.

## Current status

| Section | Route | What it does |
| --- | --- | --- |
| Navbar | Top of the worker pages | Shown only after sign-in. Links to Inicio (also the ELVA logo), Vacaciones, Horas extra, Mi reporte, Mis solicitudes and Avisos (with the number of new notices), "Panel de administración" for admin/HR, and "Cerrar sesión". Hidden on login, the dashboard and Tab 3, which have their own header. |
| Home | `/tabs/inicio` | Signed-in users only. First page for workers after sign-in: greeting, available vacation days, pending requests, new notices and this week's report, plus "Próximamente" (approved vacations and overtime, and the next holidays). Each card links to its page. |
| Vacation request | `/tabs/vacaciones` | Pick a date range and see the deducted days, remaining balance and a day-by-day breakdown. Signed-in users only. Available days are the balance in `colaboradores.vacaciones_disponibles` (read live) minus the days of pending requests; it never shows below 0. Requests are saved in Firestore (`vacations_requests`) and show up in Mis solicitudes and in the dashboard. |
| Overtime request | `/tabs/horas-extra` | Pick a start and end (it can cross midnight), describe the work and see the hours per day with their pay rate. Signed-in users only. Requests are saved in Firestore (`overtime_requests`) and show up in Mis solicitudes and in the dashboard. |
| Admin dashboard | `/tabs/dashboard` | Admin and HR only. Fixed side menu, today's date, request summary, vacation and overtime approvals, pending payments, real employee list and upcoming holidays. Edit an employee's data and read each employee's weekly reports (mark them as seen). Approve or reject requests (approving vacations deducts the days from the balance and is blocked if they are not enough) and manage notices. Tabs: pending, approved, rejected and cancelled. Edit employee also sets the vacation balance. Requests, notices and reports are read from Firestore and update live (`RequestsStore`); payments are still sample data. |
| My requests | `/tabs/solicitudes` | Signed-in users only. The worker's own vacation and overtime requests (filter by type and month) with their status: pending, approved, rejected or cancelled. Pending or approved requests that have not started can be cancelled: approved vacation days go back to the balance and admins are notified. |
| Notices | `/tabs/avisos` | Signed-in users only. Notices published by admin/HR, important ones on top. Admins create, edit and delete them in the dashboard. |
| Weekly report | `/tabs/reporte` | Signed-in workers only. Optional: pick the week, write what they did and/or attach any files. Reports are saved in Firestore (`weekly_reports`); attached files are not uploaded yet, only their names are saved (Storage needs the Blaze plan). |
| Login (Tab 1) | `/tabs/login` | Sign-in with Firebase Authentication. Workers go to Inicio; admin/HR go to the dashboard. |
| Push test (Tab 2) | `/tabs/tab2` | **Temporary** page to test push notifications with an anonymous user. To be replaced once the login is connected. |
| Users (Tab 3) | `/tabs/tab3` | Admin panel to create employees in Firebase Authentication and Firestore. |

## Tech stack

- **Ionic 9 + Angular 22** (standalone components, zoneless: UI state uses *signals*).
- **Firebase:** Authentication, Firestore and Cloud Messaging (`firebase` SDK 12.19.0).
- **Capacitor 8** for the future mobile app.
- **Vitest** (unit tests), **Playwright** (e2e tests), **ESLint** and **Prettier**.

## Requirements

- **Node.js** 22.22.3+ or 24.15+. Node 24 is recommended.
- **npm** (ships with Node).
- **Git.**
- Your own **Firebase project** (see [Firebase setup](#firebase-setup)).

## Getting started

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/cronosmorfeo/elva_gestion.git
   cd elva_gestion
   npm ci
   ```

   `npm ci` installs the exact versions from `package-lock.json`.

2. Create the config files from the template. **The app does not compile without this step** (error `Could not resolve "./environments/environment"`):

   ```bash
   # Linux / macOS
   cp src/environments/environment.example.ts src/environments/environment.ts
   cp src/environments/environment.example.ts src/environments/environment.prod.ts
   ```

   ```powershell
   # Windows (PowerShell)
   copy src\environments\environment.example.ts src\environments\environment.ts
   copy src\environments\environment.example.ts src\environments\environment.prod.ts
   ```

3. Fill both files with the credentials of **your** Firebase project. In `environment.prod.ts`, set `production` to `true`.

4. Start the app and open `http://localhost:4200`:

   ```bash
   npm start
   ```

`environment.ts` and `environment.prod.ts` are in `.gitignore`: each developer uses their own credentials and they are never committed. Only the `environment.example.ts` template is in the repository.

## Firebase setup

Each developer can use their own Firebase project (free Spark plan):

1. In [console.firebase.google.com](https://console.firebase.google.com), create a project. Google Analytics is not needed.
2. Add a **web app** (`</>`) and copy the `firebaseConfig` block into `environment.firebase`.
3. In **Project settings > Cloud Messaging > Web Push certificates**, generate a key pair and copy the key into `firebaseVapidKey`.
4. In **Authentication > Sign-in method**, enable **Email/Password** (used by the users panel) and **Anonymous** (only for the push test page).
5. Create a **Firestore Database** (Standard edition).

The Firebase web config is not secret, but it is kept out of the repository so each developer uses their own.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Development server at `localhost:4200`. |
| `npm run build` | Production build in `www/`. |
| `npm run test:unit` | Unit tests with Vitest. |
| `npm run test:e2e` | E2E tests with Playwright. |
| `npm run lint` | ESLint, e2e type check and Prettier format check. |
| `npm run lint:fix` | Fixes what can be fixed automatically. |

## Project structure

```
src/
├── main.ts                        # Bootstrap: initializes Firebase and Angular
├── firebase-messaging-sw.js       # Notifications service worker (push, image and button)
├── environments/
│   └── environment.example.ts     # Config template (copy it, see Getting started)
├── assets/
│   ├── icon/logo.png              # ELVA logo
│   └── notifications/banner.png   # Image shown inside system notifications
└── app/
    ├── app.routes.ts              # Main routes
    ├── tabs/                      # Tab bar, navbar and their routes
    ├── home/                      # Home page (Inicio) for workers
    ├── auth/                      # Sign-in guard (not connected yet)
    ├── vacation-request/          # Vacation request page and Costa Rica holidays
    ├── overtime-request/          # Overtime request page
    ├── admin-dashboard/           # Admin dashboard (payments are sample data)
    ├── reports/                   # Weekly report page and helpers
    ├── my-requests/               # My requests page (worker)
    ├── notices/                   # Notices page and helpers
    ├── login/                     # Sign-in screen (Tab 1)
    ├── tab2/                      # Push test page, temporary (Tab 2)
    ├── tab3/                      # Users panel (Tab 3)
    ├── notification-cards/        # In-page notification cards
    └── services/
        ├── requests-store.ts          # Live Firestore data: requests, notices, reports
        ├── firestore-mappers.ts       # Firestore documents -> page types
        ├── notification-events.ts     # What to notify, and to whom
        ├── vacation-balance.ts        # Vacation balance and cancel rules
        ├── notifications.ts           # Shows cards and system notifications
        └── push-notification.service.ts
functions/                         # Cloud Functions for push with the page closed (not deployed)
```

## Notifications

| Who | When |
| --- | --- |
| Admin/HR | A worker sends or cancels a vacation or overtime request. |
| Worker | One of their requests is approved or rejected, or a new notice is published. |

Weekly reports do not notify; admins read them in the dashboard.

1. **Enable:** the user taps **Activar notificaciones** (navbar or dashboard) and grants permission. If push is set up, the browser also gets a **token** and `PushNotificationService` saves it in `users/{uid}/fcmTokens/{token}`.
2. **With the page open:** `RequestsStore` sees the change in Firestore and `NotificationsService` shows it. If the page is visible, it is an in-page card (`notification-cards`); otherwise, a system notification with the banner image and a "Ver solicitud" button.
3. **With the page closed:** the Cloud Functions in `functions/` send a push and the service worker shows it. They are **not deployed yet**: they need the Blaze plan and a VAPID key (see `functions/README.md`).

Both ways use the same notification tag, so the browser shows only one. The service worker holds no credentials: it receives them in its URL when registered, from `environment.firebase`. The look of system notifications (colors, corners, font) is set by the operating system; only the image and the button can be added.

**To test it:** open the app in two browsers (for example Chrome as a worker and Edge as an admin), tap **Activar notificaciones** in both, then send a request from the worker and decide it from the admin.

## Vacation days

- Weekends and mandatory Costa Rica holidays are not deducted. Optional holidays (Aug 2, Aug 31, Dec 1) are deducted, pending HR confirmation.
- Holidays are calculated for any year, including Holy Thursday and Good Friday. Holidays moved by law go in `MOVED_HOLIDAYS` in `holidays.ts`.
- The balance is set by admins in Edit employee. How days are earned (for example, per month worked) is still to be defined with HR, so for now admins add them by hand.
- Approving deducts the days; cancelling an approved vacation that has not started returns them. Employees without a balance on record cannot request vacations until an admin sets it.

## Overtime hours

- Requests can only start today or later. A request that crosses midnight is split by calendar day.
- Workdays and optional holidays pay 1.5x. Sundays and mandatory holidays pay double up to an 8-hour shift, then triple. Whether Saturday is also a rest day is pending HR confirmation (`REST_WEEKDAYS` in `overtime-hours.ts`).
- Shift plus overtime cannot exceed 12 hours a day, so a workday allows up to 4 overtime hours and a rest day up to 12.
- A request can cover up to one year.

## Firestore data

| Collection | What it stores | Written by |
| --- | --- | --- |
| `colaboradores/{uid}` | Name, country, salary, currency, start date, work schedule, email and `vacaciones_disponibles` (vacation balance, whole days). | Users panel (Tab 3) and Edit employee. The balance also changes when a vacation is approved or cancelled. |
| `vacations_requests/{id}` | Vacation request: `uid`, `nombreSolicitante`, `correoSolicitante`, `diaInicio`, `diaFin` (return day), `diasSolicitados`, `comentarioRRHH`, `fechaSolicitud`, `estado`, `decision`, `cancelacion`. | Worker (vacation page, and cancelling); admin/HR set `estado` and `decision`. |
| `overtime_requests/{id}` | Overtime request: `uid`, `nombreSolicitante`, `correoSolicitante`, `inicio`, `fin`, `tarea`, `estado`, `fechaSolicitud`, `decision`, `cancelacion`. | Worker (overtime page, and cancelling); admin/HR decide. |
| `notices/{id}` | Notice: `titulo`, `mensaje`, `importante`, `autor`, `autorUid`, `createdAt`, `updatedAt`. | Admin/HR (dashboard). |
| `weekly_reports/{id}` | Weekly report: `uid`, `nombre`, `semana` (Monday), `texto`, `archivos` (name, size, type), `visto`, `fechaEnvio`. | Worker; admin/HR set `visto`. |
| `users/{uid}/fcmTokens/{token}` | Notification token per browser (`createdAt`, `userAgent`). | `PushNotificationService`. |

`estado` is `pendiente`, `aprobada`, `rechazada` or `cancelada` (missing means pending). `decision` and `visto` are `{ por: uid, fecha }`; an approved vacation's `decision` also has `diasDescontados`. `cancelacion` is `{ por, fecha, estabaAprobada, diasDevueltos }`.

Approving a vacation and cancelling a request run in Firestore transactions, so the balance changes exactly once even if two people act at the same time.

## Security

- **Credentials:** `environment.ts` and `environment.prod.ts` are not committed (see [Getting started](#getting-started)).
- **Firestore rules:** the repository's `firestore.rules` allows all reads and writes (`allow read, write: if true`). It is for development only. **Before loading real data**, publish rules that restrict access by user and role, since `colaboradores` stores salaries.
- **Sign-in:** the navbar and the worker pages need a session (`authGuard`).
- **Admin dashboard:** `adminGuard` only lets in users whose `tipo_colaborador` is `admin` or `rh`. It hides the page in the app, but the Firestore rules must also restrict `colaboradores` and the requests to those roles.
- **Requests and notices:** a worker may read only their own requests; only admin/HR may decide requests and write notices; every signed-in user may read notices. The app already asks only for the worker's own documents (`where uid == me`), but only the Firestore rules can enforce it.
- **Vacation balance:** today the worker's browser returns the days to their own balance when cancelling. The Firestore rules (or a Cloud Function) must only allow returning the `diasDescontados` of that request, and only admin/HR may change the balance otherwise.
- **Weekly reports:** only the worker who sent a report and admin/HR may read it, never coworkers. The Firestore rules (`weekly_reports`), and the Storage rules once files are uploaded, must enforce that.
- **Anonymous sign-in:** disable it in Firebase once the push test page is removed.
- **Notifications:** notification text must not include sensitive data, because it shows on the lock screen. The rules must let each user write only their own tokens in `users/{uid}/fcmTokens`.

## Contributing

1. Update `main` and create a branch for each change:

   ```bash
   git pull origin main
   git checkout -b feature/short-description
   ```

2. Write commit messages in English, short and in the imperative mood. For example: `Add vacation request page`.
3. Before pushing, run `npm run lint` and `npm run test:unit`.
4. Push the branch and open a Pull Request to `main`.

Conventions: code (variables, functions and comments) is in English; user-facing text is in Spanish.
