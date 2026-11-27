# ELVA Gestión

Internal HR app for ELVA IA. Employees request vacations and overtime; admins and HR review them. The first version covers Costa Rica only.

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Firebase setup](#firebase-setup)
- [Scripts](#scripts)
- [Project structure](#project-structure)
- [Documentation](#documentation)
- [Security](#security)
- [Contributing](#contributing)

## Features

**Workers**

- **Inicio:** summary of available vacation days, pending requests, new notices and this week's report, plus upcoming dates.
- **Vacaciones** and **Horas extra:** request them with a day-by-day breakdown (weekends and Costa Rica holidays are not deducted; half days of 4 hours; overtime shows its pay rate).
- **Mis solicitudes:** status of each request, filter by month, cancel pending or approved ones that have not started.
- **Avisos**, **Mi reporte** (optional weekly report, with attachments in Backblaze B2) and **Mi perfil** (own data and payment account, read only).
- **Passwords:** nobody else ever knows them: a new person chooses theirs from an e-mail link; change it any time (with an e-mail warning afterwards); **¿Olvidó su contraseña?** on the login sends a reset link.

**Admins and HR** (`/tabs/dashboard`)

- Approve or reject requests (a reason is required), with search, month filter and a warning when vacations overlap. Vacations and overtime need both HR's and the jefatura's (role `admin`) approval, in any order.
- Vacation balance grows 1 day per full month (12 per year by default), is deducted on approval and returned if the worker cancels.
- Manage employees and their payment accounts, publish notices and read weekly reports.
- **Mi menú:** admins and HR are workers too; it opens the worker pages (Inicio, Vacaciones, Horas extra, Mi reporte, Mis solicitudes, Avisos, Mi perfil) for their own requests, only the sections that are on. Their requests go through the same approval as anyone else's.

Notifications reach admins (new or cancelled requests, account change requests), the jefatura and HR (requests the other side already approved) and workers (decisions, notices, account changes), by push and by e-mail to each person's address (important notices only). Pending payments are not connected yet.

The session closes after 30 minutes without use, with a warning one minute before (see [Security](docs/security.md#session-timeout)).

## Tech stack

- **Ionic 9 + Angular 22** (standalone components, zoneless with signals)
- **Firebase:** Authentication, Firestore and Cloud Messaging (`firebase` 12.19.0)
- **Cloudflare Worker** for push notifications with the page closed, e-mails with **Resend** and report files (`worker/`, free plans, no card)
- **Vitest**, **Playwright**, **ESLint** and **Prettier**

## Getting started

Requirements: **Node.js 24** (or 22.22.3+), **npm**, **Git** and a **Firebase project** (see [Firebase setup](#firebase-setup)).

```bash
git clone https://github.com/cronosmorfeo/elva_gestion.git
cd elva_gestion
npm ci --legacy-peer-deps
```

Create the config files from the template. The app does not compile without them:

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

Fill both files with your Firebase project's values (`production: true` in `environment.prod.ts`), then run:

```bash
npm start
```

Open `http://localhost:4200`. Both environment files are in `.gitignore` and are never committed.

## Firebase setup

1. Create a project in [console.firebase.google.com](https://console.firebase.google.com) (free Spark plan).
2. Add a **web app** and copy its `firebaseConfig` into `environment.firebase`.
3. In **Project settings > Cloud Messaging > Web Push certificates**, generate a key and copy it into `firebaseVapidKey`.
4. In **Authentication > Sign-in method**, enable **Email/Password**.
5. Create a **Firestore Database**.
6. Sign in with an `admin` account and open the dashboard: the configuration documents (`config/featureFlags` with only `vacaciones` on, and `config/seguridad` with 30 minutes) are created on their own. **Administrar sistema** turns sections on and off and has "Actualizar colecciones" to create what is missing. To add a setting, add it to `SEEDS` in `src/app/services/system-admin.ts`; every project gets it the next time the jefatura comes in (see [Security](docs/security.md#administrar-sistema-and-seeds)).

### Publishing (Firebase Hosting, free, no card)

```bash
npx ng build --configuration production
npx firebase-tools login
npx firebase-tools deploy --only hosting --project <your-project-id>
```

The page goes to `https://<project-id>.web.app`. `firebase.json` sends the security headers (Content-Security-Policy, no framing, nosniff, HSTS). If your push Worker has another address, change it in the CSP `connect-src` and add the page's address to `ALLOWED_ORIGINS` in `worker/wrangler.toml`. What to configure in each service: [docs/deployment.md](docs/deployment.md).

Push notifications with the page closed need the push Worker (free, no card); see [`worker/README.md`](worker/README.md). Without it, notifications only arrive while the page is open. E-mails (Resend) and report attachments (Backblaze B2) go through the same Worker. **Setting it up for a company account:** [docs/deployment.md](docs/deployment.md#automatic-vs-once-by-hand) says what is automatic and what to do once, in order.

## Scripts

| Command             | What it does                           |
| ------------------- | -------------------------------------- |
| `npm start`         | Development server at `localhost:4200` |
| `npm run build`     | Production build in `www/`             |
| `npm run test:unit` | Unit tests (Vitest)                    |
| `npm run test:e2e`  | End-to-end tests (Playwright)          |
| `npm run lint`      | ESLint, type check and Prettier check  |
| `npm run lint:fix`  | Fixes what can be fixed automatically  |

## Project structure

```
src/app/
├── tabs/               # Navbar and routes
├── auth/               # Sign-in and admin guards
├── login/              # Sign-in page
├── home/               # Inicio (worker summary)
├── vacation-request/   # Vacation page and Costa Rica holidays
├── overtime-request/   # Overtime page and pay rates
├── my-requests/        # Mis solicitudes
├── notices/            # Avisos
├── reports/            # Weekly report
├── profile/            # Mi perfil
├── admin-dashboard/    # Admin dashboard
├── tab3/               # Create employee
├── shared/             # Labels shared by several pages
└── services/           # Firestore data, notifications, vacation balance, payment accounts
worker/                 # Cloudflare Worker: push with the page closed, e-mails, report files
functions/              # Same push with Cloud Functions (needs Blaze; kept as an alternative)
docs/                   # Data model, business rules and security notes
```

## Documentation

- [Service setup](docs/deployment.md): what to configure in Firebase, Cloudflare, Backblaze B2 and Resend.
- [Data model](docs/modelo-de-datos.md): Firestore collections, fields and which page reads or writes each one.
- [Business rules](docs/business-rules.md): how vacation days, overtime pay and notifications work.
- [Security](docs/security.md): what each role may do and what is still pending.
- [Security review, Nov 2026](docs/security-review-2026-11.md): what was scanned and checked, what was fixed and what was ruled out.
- [Push Worker](worker/README.md): push notifications with the page closed, e-mails and report files, and how to set them up.

## Security

> **Firestore rules:** `firestore.rules` restricts access by user and role and has emulator tests in `firestore-tests/`. A pull does not publish them: each Firebase project publishes its own (`firebase deploy --only firestore:rules` or the Firebase console). See [docs/security.md](docs/security.md).

Never commit credentials: `environment.ts` and `environment.prod.ts` stay local.

## Contributing

1. Update `main` and create a branch: `git checkout -b feature/short-description`.
2. Write commits in English, short and in the imperative mood (`Add vacation request page`).
3. Run `npm run lint` and `npm run test:unit` before pushing.
4. Open a Pull Request to `main`.

Code and comments are in English; user-facing text is in Spanish.
