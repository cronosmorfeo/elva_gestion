// Copy this file to environment.ts and environment.prod.ts and fill in your own Firebase project.
// Values: Firebase console > Project settings > General (web app) and Cloud Messaging (Web Push certificates).
export const environment = {
  production: false, // true in environment.prod.ts
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  },
  firebaseVapidKey: '',
  // Optional: address of your push Worker (worker/README.md), e.g. 'https://elva-gestion-push.<you>.workers.dev'.
  // Empty: no push with the page closed.
  pushWorkerUrl: '',
};
