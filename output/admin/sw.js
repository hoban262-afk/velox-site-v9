/* Velox Admin service worker — install + web push for order alerts. */
var VERSION = 'velox-admin-v2';
var PREFS_CACHE = 'velox-push-prefs-v1';

self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'push-prefs') {
    event.waitUntil(savePrefs(event.data.prefs || {}));
  }
});

function savePrefs(prefs) {
  return caches.open(PREFS_CACHE).then(function (cache) {
    var r = new Response(JSON.stringify(prefs), { headers: { 'Content-Type': 'application/json' } });
    return cache.put('/_push_prefs', r);
  });
}

function loadPrefs() {
  return caches.open(PREFS_CACHE).then(function (cache) {
    return cache.match('/_push_prefs');
  }).then(function (r) {
    return r ? r.json() : null;
  }).catch(function () { return null; });
}

// Show a notification when a push arrives.
self.addEventListener('push', function (event) {
  var data = { title: 'Velox Peptides', body: 'New activity', url: '/admin/' };
  try { if (event.data) data = Object.assign(data, event.data.json()); } catch (e) {}

  var cat = data.category || '';
  if (!cat || cat === 'test') {
    event.waitUntil(showNotif(data));
    return;
  }

  event.waitUntil(
    loadPrefs().then(function (prefs) {
      if (prefs && prefs[cat] === false) return;
      return showNotif(data);
    })
  );
});

function showNotif(data) {
  return self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/assets/images/icon-192.png',
    badge: '/assets/images/icon-192.png',
    tag: data.category ? ('velox-' + data.category) : 'velox-order',
    renotify: true,
    data: { url: data.url || '/admin/' },
  });
}

// Focus or open the admin when the notification is tapped.
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/admin/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf('/admin') > -1 && 'focus' in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
