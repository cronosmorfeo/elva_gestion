# Security review — elva_gestion, 26 Nov 2026

Scope: `main` at `67f90e3` plus the Mi menú changes: the page (`src/`), the Cloudflare Worker (`worker/`), `firestore.rules`, `firebase.json` and the git history. Out of scope: `functions/` (not deployed; the Worker replaces it) and the settings of each Firebase / Google Cloud / Cloudflare console.

**Result: 1 real issue (low), fixed.** Everything else the tools reported was checked by hand and ruled out (below).

## Fixed

1. **[Low] The dashboard showed the name a worker typed in their request** — `src/app/admin-dashboard/admin-dashboard.page.ts` (CWE-451, UI misrepresentation).
   - Source: any active worker. `vacations_requests.nombreSolicitante` / `correoSolicitante`, `overtime_requests` (same fields) and `bank_change_requests.nombre` are written by the browser, and the rules do not check them.
   - Path: `firestore-mappers.ts` → `employee` → dashboard lists, approval and reject windows, "De vacaciones esta semana", account change requests.
   - Impact: a worker could send a request under a coworker's name, so the panel approves it believing it is someone else's. Days are still deducted from the real owner (by `uid`), and "Editar cuenta" opens the real owner, so no balance or account moves to another person.
   - Fix: the dashboard takes the name and e-mail from the owner's `colaboradores` record by `uid` (`admin-dashboard/owner-names.ts`, with a test).
   - Still open: the Worker's push and e-mail to the panel use the typed name (`worker/src/events.ts`, `who()`). Fixing it means reading the owner's `colaboradores` document in the Worker and deploying it again.

## Checked by hand

- **Worker** (`/notify`, `/setup`, `/files/upload`, `/files/open`): ID token (RS256, Google keys, `aud`, `iss`, `exp`, `iat`), active colaborador on every route, CORS allow-list, input validation (`collection` list, id regex), who may report each change (`events.ts`), one send per change (`push_log`), `/setup` only for `admin`, B2 paths (`ownerOf` regex: no `..`, owner checked, panel only otherwise), file types by extension, downloads always as attachment, e-mails from a fixed template with every value escaped, errors only in logs.
- **Firestore rules**: every collection, read and write per role; own salary, balance, type and payment account blocked; days returned only with the cancelled request; no deletes; `push_log` and any other path closed.
- **Page**: no `innerHTML` / `bypassSecurityTrust` / `eval`; Angular escapes every value; random passwords with `crypto.getRandomValues`; signed URL only from the Worker; tokens and personal data not logged (`no-console`).
- **Hosting** (`firebase.json`): CSP without `unsafe-inline` for scripts, `frame-ancestors 'none'`, HSTS, nosniff, Referrer-Policy, Permissions-Policy.
- **CI**: there are no workflows in the repo.

## Ruled out

- **gitleaks (7)**: Firebase web config and VAPID key in old commits (public by design: every browser receives them; protect with API key restrictions and the rules), a private key generated inside a Worker test, and variable names in `worker/src/index.ts`.
- **npm audit / OSV**: `@grpc/grpc-js` through `firebase` (Node only, the browser does not use gRPC); `eslint`, `glob`, `minimatch`, `rimraf` and `typescript-eslint` (development tools only); `firestore-tests/` (local emulator only). Worker: none.
- **Semgrep (45)**: `window.location.href = url` in `report-files.ts` (the URL comes from the Worker, signed for Backblaze; not user input), `alert()` in `tab3`, HTML in template strings in `mail.ts` (values escaped), `ROUTES[pathname]` (a pathname always starts with `/`, so no prototype keys), test keys, style warnings in `functions/`.

## Hardening still pending (not vulnerabilities)

- Disable the Firebase Authentication user when someone is deactivated (today the rules and the Worker already block them).
- Restrict the browser API key in Google Cloud (`docs/deployment.md`).
- Create users from the server and close self-registration (S1), MFA for the panel (S6), App Check (S5).
- Check vacation balances in the rules with `request.time`.

Tools: gitleaks 8.21, OSV-Scanner 1.9 / npm audit, Semgrep (TypeScript, JavaScript and secrets rules), manual review.
