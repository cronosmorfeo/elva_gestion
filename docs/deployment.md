# Service setup: Firebase, Cloudflare, Backblaze B2 and Resend

What to configure in each service so the page works with everything in this repo: Firestore rules, push notifications with the page closed and publishing. All four services are used on their free plans, without a card. Each Firebase project and Cloudflare account is set up once; only the code is shared, never keys or data.

## Automatic vs. once by hand

**Automatic, nothing to do:** when an `admin` (jefatura) opens the panel, the page creates the configuration it needs in Firestore (`config/featureFlags`, `config/seguridad`) and the Worker sets the Firebase password policy (15 characters). **Administrar sistema > Actualizar colecciones** does it again on demand. E-mail texts and templates are in the code.

**Once per company account, by hand** (keys and account settings cannot travel in the code). In this order:

1. **Firebase:** publish the Firestore rules; Authentication with only Email/Password, Anonymous off, e-mail enumeration protection on; copy the web config and the VAPID key into `src/environments/environment.ts` and `environment.prod.ts` (not in git). Details below.
2. **Backblaze B2:** private bucket, a key limited to it, and the CORS rules with the page addresses (below).
3. **Resend:** API key with Sending access, the company domain verified, a DMARC record, and `MAIL_FROM` with an address of that domain (below).
4. **Cloudflare Worker** ([worker/README.md](../worker/README.md)): in `worker/wrangler.toml` replace the test values with the company's: `FIREBASE_PROJECT_ID`, `ALLOWED_ORIGINS` (the page addresses), `B2_ENDPOINT`, `B2_BUCKET`, `MAIL_FROM`, `APP_URL`. Save the secrets `FIREBASE_SERVICE_ACCOUNT`, `B2_KEY_ID`, `B2_APPLICATION_KEY` and `RESEND_API_KEY`, then `npx wrangler deploy` and copy the Worker address.
5. **Page:** put that address in `pushWorkerUrl` (both environment files) and in the `connect-src` of the Content-Security-Policy in [`firebase.json`](../firebase.json) (it has the test Worker's address), then build and publish Hosting.
6. **First jefatura account** (only in a project with no `admin` yet, see [below](#first-jefatura-account)), then **open the panel as the jefatura** (step "automatic" above) and turn on the sections in **Administrar sistema**. Vacations and overtime need an HR **and** a jefatura approval, so keep at least one active `rh` and one active `admin` account.
7. **Recommended:** restrict the browser API key (below), and use a company domain such as `gestion.elvaai.com` (**Hosting > Add custom domain**, then add it to **Authentication > Settings > Authorized domains**, to `ALLOWED_ORIGINS` and as `APP_URL` in the Worker). The test address `elva-gestion.web.app` belongs to a developer's own Firebase project and cannot be moved to another one.

The [Checklist](#checklist) at the end repeats this to tick off.

## After each update (pull)

A `git pull` only updates the code on your computer; it publishes nothing. After pulling, publish what changed:

| Changed in the pull | Publish                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `firestore.rules`   | Run the rules tests (below), then `npx firebase-tools deploy --only firestore:rules --project <project-id>` |
| `worker/`           | `cd worker`, `npm install --legacy-peer-deps`, `npx wrangler deploy`                                        |
| `src/` (the page)   | `npm ci --legacy-peer-deps`, then the Hosting commands (below)                                              |

When a change touches more than one (for example the approval flow: rules, Worker and page), publish all of them together: the new page with the old rules, or the other way round, can fail. Each pull request says what to publish.

## Firebase

### Authentication

- **Sign-in method:** only **Email/Password** enabled. **Anonymous** off.
- **Settings > User actions:** **Email enumeration protection** on.
- **Settings > Password policy:** nothing to do. The Worker sets it (at least 15 characters, no composition rules) the first time the jefatura opens the panel, and **Administrar sistema > Actualizar colecciones** checks it again. To confirm, look there: **Enforce**, minimum 15. If the Worker is not deployed yet, set it by hand with those values.
- **Templates > Password reset (optional):** the e-mail with the link to choose a password (new accounts and "¿Olvidó su contraseña?"). It works as it comes, from `noreply@<project-id>.firebaseapp.com` with Firebase's own page, so tell people to check spam. If Firebase lets you edit it (it blocked it in the test project), set a Spanish subject such as "Cree o cambie su contraseña de ELVA Gestión" and **Customize action URL** → `https://<project-id>.web.app/tabs/restablecer`, the page's own screen with ELVA's look. Another way, without the console: the Worker creates the link (`accounts:sendOobCode` with `returnOobLink`) and sends it with Resend (not done yet). A custom domain must be in **Settings > Authorized domains** for the link to work.

### First jefatura account

New accounts are created from the panel, and only an `admin` can open it, so in a project with no `admin` yet the first one is made by hand:

1. **Authentication > Users > Add user:** the person's e-mail and a temporary password. Copy its **User UID**.
2. **Firestore Database > Data:** in `colaboradores`, add a document whose ID is that UID, with `nombre` (string), `correo` (string, the same e-mail), `activo` (boolean `true`) and `tipo_colaborador` (string `admin`).
3. Sign in with it, open the panel and change the password in **Mi menú > Mi perfil** (at least 15 characters). From then on, create everyone else, including RH, with **Crear empleado**, and give them their type with **Editar**. Another admin can later fill in this first account's salary and vacation balance (nobody edits their own).

### Firestore rules

Publish [`firestore.rules`](../firestore.rules): `npx firebase-tools deploy --only firestore:rules --project <project-id>`, or **Firestore Database > Rules**, paste the file and **Publish**. A pull does not publish them.

Existing data must fit the rules, or that person loses access: every `colaboradores/{uid}` needs `activo: true` (boolean) and `tipo_colaborador` exactly `regular`, `rh` or `admin` (lowercase; missing counts as `regular`).

Tests: `cd firestore-tests`, `npm ci --legacy-peer-deps`, `npm test` (needs Java 21+). Run them after any change to the rules.

### Cloud Messaging

**Project settings > Cloud Messaging > Web Push certificates:** the key goes in `firebaseVapidKey` in `environment.ts` and `environment.prod.ts`.

### Hosting

```bash
npx ng build --configuration production
npx firebase-tools login
npx firebase-tools deploy --only hosting --project <project-id>
```

The page is published at `https://<project-id>.web.app`. [`firebase.json`](../firebase.json) sends the security headers; its `Content-Security-Policy` names the push Worker address in `connect-src`, so change it if your Worker has another address. A custom domain (**Hosting > Add custom domain**) also has to be added in **Authentication > Settings > Authorized domains** and in the Worker's `ALLOWED_ORIGINS`.

### API key

[Google Cloud console](https://console.cloud.google.com) > the project > **APIs & Services > Credentials** > "Browser key (auto created by Firebase)" > **Application restrictions: Websites**: add `https://<project-id>.web.app/*`, `https://<project-id>.firebaseapp.com/*`, any custom domain and `http://localhost:4200/*` for development. Wait a few minutes and check that sign-in still works.

## Cloudflare (push notifications with the page closed)

Follow [worker/README.md](../worker/README.md): create a Firebase service account key, save it as the Worker secret `FIREBASE_SERVICE_ACCOUNT`, set `FIREBASE_PROJECT_ID` and `ALLOWED_ORIGINS` (the page addresses) in `worker/wrangler.toml` and run `npx wrangler deploy`. Then put the Worker address in `pushWorkerUrl` in both environment files and build again.

Without the Worker everything else works; notifications only arrive while the page is open.

## Backblaze B2 (report attachments)

A **private** bucket and an application key limited to it, used by the same Worker. Follow [worker/README.md](../worker/README.md#report-attachments-backblaze-b2): set `B2_ENDPOINT` and `B2_BUCKET` in `worker/wrangler.toml`, save `B2_KEY_ID` and `B2_APPLICATION_KEY` as Worker secrets, apply the CORS rules in `worker/b2-cors-rules.json` (with the page addresses) and deploy. Then turn on **Reportes semanales** in **Administrar sistema**.

## Resend (e-mails)

E-mails go with the push, from the same Worker. Follow [worker/README.md](../worker/README.md#e-mails-resend): create an API key with **Sending access** only, save it as the Worker secret `RESEND_API_KEY`, set `MAIL_FROM` and `APP_URL` in `worker/wrangler.toml` and deploy. To e-mail everyone, verify the company domain in Resend (**Domains**, DNS records) and set `MAIL_FROM` to an address of it; Resend's test sender (`onboarding@resend.dev`) only delivers to the e-mail of the Resend account.

Without `RESEND_API_KEY` everything else works; notifications only go by push.

**So e-mails do not land in spam:** with the test sender (`onboarding@resend.dev`, shared by many accounts) they usually do. Verify the company domain (Resend adds SPF and DKIM records) and also add a DMARC record to the domain's DNS, for example `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:<someone>@elvaai.com`. People can also mark the first one as "Not spam" or add the sender to their contacts.

## Checklist

- [ ] Firestore rules published and data checked (`activo`, `tipo_colaborador`).
- [ ] `worker/wrangler.toml` with the company's values (not the test ones) and the four Worker secrets saved.
- [ ] The company Worker address in `pushWorkerUrl` and in `firebase.json` (`connect-src`).
- [ ] A first `admin` account (if the project had none), at least one active `rh` and one active `admin`.
- [ ] Panel opened once as the jefatura: sections on, password policy 15 (Authentication > Settings).
- [ ] Anonymous sign-in off, email enumeration protection on.
- [ ] VAPID key and `pushWorkerUrl` in both environment files.
- [ ] Worker deployed with the page addresses in `ALLOWED_ORIGINS`; the service account key file deleted after saving the secret.
- [ ] Page published and, in the browser console (F12), no `Content Security Policy` or `permission-denied` errors.
- [ ] Backblaze bucket private, its key limited to that bucket and saved only as Worker secrets; CORS with the page addresses.
- [ ] Resend key with Sending access only, saved only as a Worker secret; company domain verified (SPF, DKIM) with a DMARC record, and `MAIL_FROM` with an address of it.
- [ ] Browser API key restricted to the page addresses.

More on what each role may do and what is still open: [security.md](security.md).
