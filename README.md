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
- **Vacaciones** and **Horas extra:** request them with a day-by-day breakdown (weekends and Costa Rica holidays are not deducted; overtime shows its pay rate).
- **Mis solicitudes:** status of each request, filter by month, cancel pending or approved ones that have not started.
- **Avisos**, **Mi reporte** (optional weekly report) and **Mi perfil** (own data and payment account, read only).

**Admins and HR** (`/tabs/dashboard`)

- Approve or reject requests (a reason is required), with search, month filter and a warning when vacations overlap.
- Vacation balance is deducted on approval and returned if the worker cancels.
- Manage employees and their payment accounts, publish notices and read weekly reports.

Notifications reach admins (new or cancelled requests, account change requests) and workers (decisions, notices, account changes). Pending payments are not connected yet.

## Tech stack

- **Ionic 9 + Angular 22** (standalone components, zoneless with signals)
- **Firebase:** Authentication, Firestore and Cloud Messaging (`firebase` 12.19.0)
- **Cloud Functions** for push notifications with the page closed (`functions/`, not deployed yet)
- **Vitest**, **Playwright**, **ESLint** and **Prettier**

## Getting started

Requirements: **Node.js 24** (or 22.22.3+), **npm**, **Git** and a **Firebase project** (see [Firebase setup](#firebase-setup)).

```bash
git clone https://github.com/cronosmorfeo/elva_gestion.git
cd elva_gestion
npm ci
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

Push notifications with the page closed and file uploads need the **Blaze** plan; see [`functions/README.md`](functions/README.md).

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
functions/              # Cloud Functions for push notifications
docs/                   # Data model, business rules and security notes
```

## Documentation

- [Data model](docs/modelo-de-datos.md): Firestore collections, fields and which page reads or writes each one.
- [Business rules](docs/business-rules.md): how vacation days, overtime pay and notifications work.
- [Security](docs/security.md): what each role may do and what is still pending.
- [Cloud Functions](functions/README.md): push notifications and how to deploy them.

## Security

> **The Firestore rules in this repository are open (`allow read, write: if true`) and are for development only.** Before loading real data, publish rules that restrict access by user and role. See [docs/security.md](docs/security.md).

Never commit credentials: `environment.ts` and `environment.prod.ts` stay local.

## Contributing

1. Update `main` and create a branch: `git checkout -b feature/short-description`.
2. Write commits in English, short and in the imperative mood (`Add vacation request page`).
3. Run `npm run lint` and `npm run test:unit` before pushing.
4. Open a Pull Request to `main`.

Code and comments are in English; user-facing text is in Spanish.
