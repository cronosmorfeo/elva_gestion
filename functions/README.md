# Push notifications (Cloud Functions)

These functions send push notifications when the ELVA Gestión page is closed. While the page is open, the app already shows notifications by itself; these add the case where it is closed.

| Function             | When                                                                   | Who gets it                       |
| -------------------- | ---------------------------------------------------------------------- | --------------------------------- |
| `newVacationRequest` | A request is created in `vacations_requests`                           | Active admin and rh accounts      |
| `newOvertimeRequest` | A request is created in `overtime_requests`                            | Active admin and rh accounts      |
| `vacationDecided`    | `estado` changes from pending to `aprobada` or `rechazada`             | The worker (`uid` of the request) |
| `overtimeDecided`    | Same, in `overtime_requests`                                           | The worker                        |
| `vacationCancelled`  | A worker cancels a pending or approved request in `vacations_requests` | Active admin and rh accounts      |
| `overtimeCancelled`  | Same, in `overtime_requests`                                           | Active admin and rh accounts      |
| `newNotice`          | A notice is created in `notices`                                       | Active workers (`regular`)        |

Each person only gets push on the browsers where they tapped **Activar notificaciones**. The app saves those browser tokens in `users/{uid}/fcmTokens/{token}`; the functions delete tokens that stopped working.

## Before deploying

1. The Firebase project must be on the **Blaze** plan (pay as you go). Cloud Functions do not run on the free plan. With a few dozen users the cost should be close to zero, but it needs a card on file. Setting a budget alert in Google Cloud is recommended.
2. The web app needs a **VAPID key** (Firebase console > Project settings > Cloud Messaging > Web Push certificates) in `firebaseVapidKey` of `src/environments/environment.ts` and `environment.prod.ts`.
3. Firebase CLI installed and signed in: `npm install -g firebase-tools`, then `firebase login`.

## Deploy

A `firebase.json` at the repo root must point to this folder:

```json
{
  "functions": { "source": "functions" }
}
```

Then:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions --project <project-id>
```

Logs: Firebase console > Functions > Logs, or `firebase functions:log`.

## Security notes

- The functions use the Admin SDK, so they skip the Firestore rules. They only read `colaboradores` and the token collections, and only send what is already in the request or notice.
- The Firestore rules still have to stop people from writing other people's tokens or changing `estado` themselves (today they are open: `if true`).
