/* Velox Admin service worker — install + web push for order alerts. */
const VERSION = 'velox-admin-v1';

self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

// Show a notification when a push arrives.
self.addEventListener('push', function (event) {
  let data = { title: 'Velox Peptides', body: 'New activity', url: '/admin/' };
  try { if (event.data) data = Object.assign(data, event.data.json()); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/assets/images/icon-192.png',
      badge: '/assets/images/icon-192.png',
      tag: 'velox-order',
      renotify: true,
      data: { url: data.url || '/admin/' },
    })
  );
});

// Focus or open the admin when the notification is tapped.
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/admin/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (const c of list) {
        if (c.url.indexOf('/admin') > -1 && 'focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
