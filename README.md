# ELVA Gestión

Internal Human Resources app for ELVA IA. Employees submit requests (vacation and overtime) and administrators review and approve them. The first version covers Costa Rica only.

## Current status

| Section | Route | What it does |
| --- | --- | --- |
| Home (Inicio) | `/tabs/inicio` | Main menu. "Solicitar vacaciones" works; the other options are marked as coming soon. |
| Vacation request | `/tabs/inicio/vacaciones` | Pick a date range and see the deducted days, remaining balance and a day-by-day breakdown. The balance is example data and requests are not saved yet. |
| Login (Tab 1) | `/tabs/login` | Sign-in screen with the ELVA logo. Not yet connected to Firebase Authentication. |
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
├── firebase-messaging-sw.js       # Push notifications service worker
├── environments/
│   └── environment.example.ts     # Config template (copy it, see Getting started)
├── assets/icon/logo.png           # ELVA logo
└── app/
    ├── app.routes.ts              # Main routes
    ├── tabs/                      # Tab bar and its routes
    ├── home/                      # Home menu (Inicio tab)
    ├── vacation-request/          # Vacation request page and Costa Rica holidays
    ├── login/                     # Sign-in screen (Tab 1)
    ├── tab2/                      # Push test page, temporary (Tab 2)
    ├── tab3/                      # Users panel (Tab 3)
    └── services/
        └── push-notification.service.ts
```

## Push notifications

Notifications use Firebase Cloud Messaging (FCM) and work even when the page is closed.

1. **Enable:** the user taps "Activar avisos" and grants permission. The browser gets a **token** (its address for receiving notifications) and `PushNotificationService` saves it in `users/{uid}/fcmTokens/{token}`.
2. **Send:** FCM delivers the notification to that token. Today it is sent manually from the Firebase console; later a Cloud Function will send it when a request changes.
3. **Receive:** with the page open, the notification shows inside the app. With the page closed, the service worker shows it. Tapping it opens the page.

The service worker holds no credentials: it receives them in its URL when registered, from `environment.firebase`.

**To test it:**

1. Open `localhost:4200/tabs/tab2` in **Chrome or Edge**. It does not work by default in Brave or in incognito windows.
2. Tap **Activar avisos** and grant permission.
3. In Firebase, go to **Messaging**, create a campaign and use **Send test message** with the token shown on the page.

## Vacation days

- Weekends and mandatory Costa Rica holidays are not deducted. Optional holidays (Aug 2, Aug 31, Dec 1) are deducted, pending HR confirmation.
- Holidays are calculated for any year, including Holy Thursday and Good Friday. Holidays moved by law go in `MOVED_HOLIDAYS` in `holidays.ts`.
- A request can cover up to one year.

## Firestore data

| Collection | What it stores | Written by |
| --- | --- | --- |
| `colaboradores/{uid}` | Name, country, salary, currency, start date, work schedule and email. | Users panel (Tab 3). |
| `users/{uid}/fcmTokens/{token}` | Notification token per browser (`createdAt`, `userAgent`). | `PushNotificationService`. |

## Security

- **Credentials:** `environment.ts` and `environment.prod.ts` are not committed (see [Getting started](#getting-started)).
- **Firestore rules:** the repository's `firestore.rules` allows all reads and writes (`allow read, write: if true`). It is for development only. **Before loading real data**, publish rules that restrict access by user and role, since `colaboradores` stores salaries.
- **Anonymous sign-in:** disable it in Firebase once the push test page is removed.
- **Notifications:** notification text must not include sensitive data, because it shows on the lock screen.

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
