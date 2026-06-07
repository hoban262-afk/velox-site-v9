/* Velox Command Centre service worker — install + web push. */
const VERSION = 'velox-command-v1';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (event) {
  let data = { title: 'Velox Command', body: 'New activity', url: '/command/' };
  try { if (event.data) data = Object.assign(data, event.data.json()); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/assets/images/icon-192.png',
      badge: '/assets/images/icon-192.png',
      tag: 'velox-command',
      renotify: true,
      data: { url: data.url || '/command/' },
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/command/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (const c of list) { if (c.url.indexOf('/command') > -1 && 'focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
