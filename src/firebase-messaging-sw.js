// Keep in sync with the firebase version in package.json.
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCRSOFl5Ce_Khi_8x1onM24yXAsib9i6rM',
  authDomain: 'elva-gestion.firebaseapp.com',
  projectId: 'elva-gestion',
  messagingSenderId: '959436608336',
  appId: '1:959436608336:web:74badcd02db056c172d255',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // Notification payloads are shown by the SDK itself.
  if (payload.notification) return;
  const data = payload.data || {};
  self.registration.showNotification(data.title || 'ELVA Gestion', {
    body: data.body || '',
    icon: '/assets/icon/favicon.png',
    data: { url: data.url || '/' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only open URLs from our own origin.
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  const url = target.origin === self.location.origin ? target.href : self.location.origin + '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url === url && 'focus' in w) return w.focus();
      }
      return clients.openWindow(url);
    }),
  );
});
