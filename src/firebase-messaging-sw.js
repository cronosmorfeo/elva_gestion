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

// A new version of this file takes over right away instead of waiting for every tab of the app to close.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only pages of our own origin.
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  const path = target.origin === self.location.origin ? target.pathname + target.search + target.hash : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      // Reuse a tab of the app (the visible one if there is one) instead of opening a second copy.
      const tabs = windows.filter((w) => new URL(w.url).origin === self.location.origin);
      const tab = tabs.find((w) => w.visibilityState === 'visible') || tabs[0];
      if (!tab) return clients.openWindow(path);
      const focused = await tab.focus().catch(() => tab);
      // The page moves with its own router (NotificationsService), so it does not reload.
      focused.postMessage({ type: 'elva-open', url: path });
      return focused;
    }),
  );
});
