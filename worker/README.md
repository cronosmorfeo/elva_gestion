# Worker: push notifications, e-mails and report files

A Cloudflare Worker that sends push notifications when the ELVA Gestión page is closed. It replaces the Cloud Functions in `functions/`, which need Firebase's Blaze plan (a card). Cloudflare Workers' free plan needs no card: 100,000 calls a day.

With the page open, the app already shows notifications by itself; the Worker adds the case where it is closed. Without the Worker (no `pushWorkerUrl` in `environment.ts`) everything else keeps working.

## How it works

1. After saving a change, the page calls `POST /notify` with `{ collection, id }` and the user's Firebase ID token (`src/app/services/push-relay.ts`).
2. The Worker checks the token (signed by Google for your project) and that the caller is an active `colaboradores` document.
3. It reads that document from Firestore with a service account. It never uses texts sent by the page.
4. `src/events.ts` decides who gets what. Only the right person can report each change: the owner reports a new or cancelled request, the panel reports decisions, notices and payment account changes.
5. It saves `push_log/{key}` so the same change is sent only once, then sends the push with FCM to every browser in `users/{uid}/fcmTokens` and deletes tokens that stopped working.
6. When Resend is set up, it also e-mails the same people (see [E-mails](#e-mails-resend)).

| Change                               | Who gets it              | Feature flag                |
| ------------------------------------ | ------------------------ | --------------------------- |
| New vacation or overtime request     | Active admin and rh      | `vacaciones` / `horasExtra` |
| RH approved, the jefatura has not    | Active admin (jefatura)  | same                        |
| Request approved (final) or rejected | The worker               | same                        |
| Request cancelled by the worker      | Active admin and rh      | same                        |
| Payment account change request       | Active admin and rh      | `pagos`                     |
| Payment account changed by the panel | That worker              | `pagos`                     |
| New employee (Crear empleado)        | That person (welcome)    | none                        |
| Password changed in the page         | That person (warning)    | none                        |
| New notice                           | Active workers (regular) | `avisos`                    |

Every row also goes by e-mail to the same people, except notices: only those marked **Importante** are e-mailed.

The welcome tells the new person their account exists and that Firebase sent them another e-mail to choose their password. It only goes within an hour of `colaboradores.createdAt`, once. The password warning can only be reported by the person about themselves, at most once every 10 minutes. The payment account saved while creating the employee does not send "your payment account changed".

## Setup (about 15 minutes, once per Firebase project)

You need a Cloudflare account (free, no card) and Node.js.

1. **Service account key.** Firebase console > Project settings > Service accounts > **Generate new private key**. It downloads a JSON file. Treat it like a password: never commit it, never paste it in a chat, and delete the file after step 4.
2. **Settings.** In `wrangler.toml` set `FIREBASE_PROJECT_ID` to your project id and `ALLOWED_ORIGINS` to the addresses your page runs on (comma-separated, exact, e.g. `http://localhost:4200,https://elva-gestion.web.app`).
3. **Install and sign in to Cloudflare:**

   ```bash
   cd worker
   npm ci --legacy-peer-deps
   npx wrangler login
   ```

4. **Save the key as a secret.** Run this and, when asked, paste the whole content of the JSON file:

   ```bash
   npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
   ```

   It is stored encrypted in Cloudflare; nobody can read it back, not even from the dashboard.

5. **Deploy:** `npx wrangler deploy`. It prints the address, like `https://elva-gestion-push.<your-subdomain>.workers.dev`.
6. **Point the page to it:** in `src/environments/environment.ts` (and `environment.prod.ts`) set `pushWorkerUrl` to that address.
7. **VAPID key:** `firebaseVapidKey` in the same files must be set (Firebase console > Project settings > Cloud Messaging > Web Push certificates), or browsers cannot register for push.

Each person tests with their own Firebase project and Cloudflare account: only the code is shared, never keys or data.

## Test it

1. Open the page, sign in as a worker and tap **Activar notificaciones**.
2. Close that tab (or the whole browser, as long as Chrome keeps running in the background).
3. From another browser or address (e.g. `http://[::1]:4200`, which keeps its own session) sign in as admin and approve or reject a request of that worker. The notification should arrive in a few seconds.
4. Logs: `npx wrangler tail`, or Cloudflare dashboard > Workers > elva-gestion-push > Logs.

## Report attachments (Backblaze B2)

The same Worker gives short-lived permissions for the weekly report files, which are kept in a private Backblaze B2 bucket (10 GB free, no card). The browser uploads and downloads directly from Backblaze; the key never leaves the Worker.

- `POST /files/upload` `{ name, size }`: for an active colaborador while the `reportes` section is on. Only `pdf, doc, docx, txt, xls, xlsx, csv, png, jpg, jpeg, jfif`, up to 10 MB. Answers `{ path, url, contentType }`: a 5-minute signed PUT URL whose signature includes the size and type, so Backblaze refuses anything else. The path is `reports/{uid}/{uuid}-{safe name}`.
- `POST /files/open` `{ path }`: for the file's owner (the uid in the path) or RH/the jefatura. Answers a 5-minute signed GET URL that always downloads (`Content-Disposition: attachment`).
- Without the B2 settings these routes answer 501 and the page saves only file names.

### Setup (once per Backblaze account)

1. In [backblaze.com](https://www.backblaze.com) (B2 Cloud Storage, free sign-up without a card) create a **private** bucket. Write its **Endpoint** (like `s3.us-east-005.backblazeb2.com`) and name in `B2_ENDPOINT` and `B2_BUCKET` in `wrangler.toml`.
2. **Application Keys > Add a New Application Key:** access to **that bucket only**, **Read and Write**. It shows `keyID` and `applicationKey` once. Save them as secrets (paste each when asked):

   ```bash
   npx wrangler secret put B2_KEY_ID
   npx wrangler secret put B2_APPLICATION_KEY
   ```

3. **CORS**, so the page can upload from the browser. The web console only has fixed options, so use the [B2 CLI](https://www.backblaze.com/docs/cloud-storage-command-line-tools) with the account's master key (it can change bucket settings; the bucket key cannot). First put your page addresses in [`b2-cors-rules.json`](b2-cors-rules.json) (it stays on one line on purpose; Backblaze does not accept IPv6 addresses like `http://[::1]:4200`, so uploads only work from the others). Then:

   ```powershell
   python -m pip install --upgrade b2
   b2 account authorize            # master keyID and key, typed here only
   # Windows PowerShell drops the quotes when passing JSON to a program, so they are escaped:
   $rules = (Get-Content .\b2-cors-rules.json -Raw).Trim().Replace('"','\"')
   b2 bucket update --cors-rules $rules <bucket> allPrivate
   b2 account clear                # forget the master key on this computer
   ```

   `allPrivate` at the end keeps the bucket private.

4. `npx wrangler deploy`. In `firebase.json`, the page's CSP already allows `https://*.backblazeb2.com` for uploads.
5. In the dashboard, **Administrar sistema > Reportes semanales** on.

## Firebase Authentication settings (`/setup`)

`POST /setup`, only for the jefatura (role `admin`): the page calls it when the jefatura opens the panel and with **Actualizar colecciones**. It reads the project's Authentication settings and, if the password policy is different, sets it (`src/auth-config.ts`): enforced, at least 15 characters, up to 4096, no composition rules, existing passwords keep working. So every Firebase project gets it without the console. Answers `{ passwordPolicy: 'ok' | 'updated' }`.

Where Firebase's e-mail links open cannot be set this way: Firebase refuses it by API in projects without Identity Platform (`EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`) and may block the templates in the console too. The links then open Firebase's own page; the page's `/tabs/restablecer` is ready for when the template can be edited (see [docs/deployment.md](../docs/deployment.md)). Uses the service account with the `cloud-platform` scope (as the Firebase Admin SDK does).

## E-mails (Resend)

The same change that sends a push also sends an e-mail, with [Resend](https://resend.com) (free plan, no card: 100 e-mails a day, 3,000 a month).

- **Who:** the same people as the push (table above), at their `colaboradores.correo`, the address they sign in with. The page never sends an address, a subject or HTML.
- **What:** a fixed template in `src/mail.ts`: the push title as subject, its text, and an **Abrir ELVA Gestión** button to `APP_URL`. Every text is escaped, so a name or a rejection reason cannot add links or HTML. The rejection reason is included; payment changes show only the last 4 digits.
- **Once:** all e-mails of one change go in a single call to Resend's batch API, with the `push_log` key as `Idempotency-Key`, in permissive mode (`x-batch-validation: permissive`): an address Resend refuses does not stop the others; it is logged by position.
- **If it fails:** the push is sent anyway; the error is only in the Worker logs and there is no retry. Without `RESEND_API_KEY` or `MAIL_FROM` no e-mail is sent.

### Setup (once per Resend account)

1. Sign up at [resend.com](https://resend.com). **API Keys > Create API Key** with permission **Sending access** (not Full access). It is shown once.
2. Save it as a secret (paste it when asked): `npx wrangler secret put RESEND_API_KEY`
3. In `wrangler.toml` set `MAIL_FROM` and `APP_URL` (the page address), then `npx wrangler deploy`.

**Sender.** For tests `MAIL_FROM = "ELVA Gestión <onboarding@resend.dev>"`: Resend only delivers it to the e-mail of the Resend account; the other addresses of a batch are refused and logged (`[mail] N of M not sent`). To send to everyone, verify the company domain in Resend (**Domains > Add Domain**, then add the DNS records it shows) and use an address of that domain, like `ELVA Gestión <noreply@elvaai.com>`.

**Test:** with `onboarding@resend.dev`, use a change that goes to one person: create a worker with the Resend account's e-mail, send a request with it and approve or reject it from the panel. Check the spam folder too. Logs: `npx wrangler tail`.

## Development

```bash
npm test          # vitest: events, e-mails, files and token checks
npm run typecheck
npm run dev       # local Worker on http://localhost:8787
```

## Limits and security

- **Free plan:** 100,000 calls a day and 50 outside requests per call. About 8 go to Google, so one call reaches at most 35 browsers; with ~25 people that is enough except for a notice to everyone with several browsers each (the rest are skipped and logged).
- **E-mails:** the Resend key only has Sending access; if it leaks, delete it in Resend (API Keys) and create another. One e-mail per person per change and only to addresses already in `colaboradores`, so the Worker cannot be used to e-mail anyone else. Resend's free plan allows 100 e-mails a day: that is why ordinary notices are not e-mailed.
- **Backblaze key:** limited to one bucket; if it leaks, delete it in Backblaze (Application Keys) and create another (step 2). Files are not scanned: the type comes from the extension and downloads never open as a page.
- **Who can call it:** only signed-in, active colaboradores, from the addresses in `ALLOWED_ORIGINS`. A caller can only trigger the push that matches the real state of a document they are allowed to report, and only once per change (`push_log`).
- **The service account can do anything in Firestore** (it skips the rules). It lives only as a Worker secret. If it leaks: Google Cloud console > IAM > Service accounts > delete that key, create a new one and repeat step 4.
- `push_log` has no Firestore rule, so the page cannot read or write it; only the Worker can.
