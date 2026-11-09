// Keep in sync with the firebase version in package.json.
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js');

// The config comes from the registration URL (see PushNotificationService), so no keys live here.
// Without it (push not set up yet) the app still registers this worker to show notifications with image and button.
const config = Object.fromEntries(new URL(self.location.href).searchParams);

if (config.apiKey) {
  firebase.initializeApp(config);
  firebase.messaging().onBackgroundMessage((payload) => {
    // Notification payloads are shown by the SDK itself.
    if (payload.notification) return;
    const data = payload.data || {};
    self.registration.showNotification(data.title || 'ELVA Gestión', {
      body: data.body || '',
      icon: '/assets/icon/favicon.png',
      image: '/assets/notifications/banner.png',
      // Same tag as the in-page notification, so the browser replaces it instead of showing two.
      tag: data.tag || undefined,
      actions: [{ action: 'open', title: data.url === '/tabs/avisos' ? 'Ver aviso' : 'Ver solicitud' }],
      data: { url: data.url || '/' },
    });
  });
}

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
