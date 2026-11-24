/* The family portal's service worker (portail.html only: registered with that scope).
   It keeps the portal's own files so the app opens even with a weak connection. It never stores what
   the API answers: messages, photos and account data always come fresh from the server and stay off
   the phone's cache. */
'use strict';
/* The files without their ?v= version: an app update needs no change here (offline, the version is
   ignored when looking in the cache; online, the network always comes first). */
var CACHE = 'bellatrix-portail-7';
var SHELL = ['portail.html', 'portail.webmanifest', 'css/portail.css', 'js/i18n.js', 'js/i18n-messages.js', 'js/portail.js',
  'js/portail-feed.js', 'js/portail-calls.js', 'css/portail-calls.css', 'img/suavia-cross.svg', 'img/suavia-cross-white.svg', 'icons/portail-192.png', 'icons/portail-512.png', 'icons/apple-touch-icon.png', 'css/brand.css', 'css/portail-feed.css', 'fonts/RobotoCondensed-Regular.ttf', 'fonts/RobotoCondensed-Medium.ttf', 'fonts/RobotoCondensed-Bold.ttf'];

self.addEventListener('install', function (e) {
  /* A cache that cannot be filled (full storage, private mode) must not stop the app: it then works online only. */
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).catch(function () { /* online only */ }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('bellatrix-portail-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  /* The API (except the icons): network only, never cached. */
  if (url.pathname.indexOf('/portal/api/') === 0 && !/\/icon[^/]*$/.test(url.pathname)) return;
  /* The portal's files: the network first (fresh after an update), the cache when offline.
     24 Nov (Rahma: the installed app must always open): when the robot is off or far away the network may
     hang instead of failing; after 4 s the kept copy is shown, and the late answer still updates the cache. */
  var net = fetch(req).then(function (res) {
    /* the tunnel's own error page (robot off) is no answer: the kept copy is better */
    if (res && res.status >= 502 && res.status <= 530) throw new Error('robot away');
    if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { return c.put(req, copy); }).catch(function () { /* not kept */ }); }
    return res;
  });
  net.catch(function () { /* answered from the cache below */ });
  var slow = new Promise(function (ok, no) { setTimeout(no, 4000); });
  e.respondWith(Promise.race([net, slow]).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || net.catch(function () { return caches.match('portail.html'); });
    });
  }));
});

/* ---------- notifications on the phone (1.16, agent N2: labland/family-notify.mjs, js/portail-calls.js) ----------
   A push arrives encrypted (aes128gcm, VAPID); the browser decrypts it and hands over the JSON
   { id, type, title, body, tag, url, sticky, at, lang }. It is shown at once (a call invitation stays
   until it is touched); an open portal is told so its bell updates. The same tag replaces the older
   notice (an invitation becomes "missed call"). A touch opens the call itself (famille.html#j=…) or
   the portal on that notice (portail.html#n=…); an open portal is used rather than a new window.
   A subscription the browser renews by itself is given to the server the next time the portal opens.
   A notice may carry buttons (d.actions: [{ action, title, url }]): the reminder "You have not talked with
   … for 7 days" has "Now" and "Plan a date"; a touch on a button opens its own address
   (portail.html#remind=<resident>&a=now|plan), or tells the open portal which button it was.
   15 Nov: a call from Bellatrix RINGS (d.ring): "Anna ruft an" with Annehmen and Ablehnen, a long vibration,
   it stays until touched. Annehmen (or a touch on the notice) opens the call itself (famille.html#j=…&go=1:
   it joins at once). Ablehnen opens nothing: it posts d.decline ({ invite, pid, k }, a key for this call and
   this person) to family/calls/decline, and tells an open portal to stop ringing. */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: e.data ? e.data.text() : '' }; }
  var opts = { body: d.body || '', tag: d.tag || d.id || 'bellatrix', renotify: true, icon: 'portal/api/icon-192.png', badge: 'portal/api/icon-192.png',
    lang: d.lang || '', timestamp: Date.parse(d.at) || Date.now(), requireInteraction: !!d.sticky, data: { id: d.id || '', url: d.url || 'portail.html', type: d.type || '' } };
  if (d.sticky) opts.vibrate = [200, 100, 200, 100, 400];
  if (d.ring) {
    opts.vibrate = [600, 300, 600, 300, 600, 300, 600, 300, 600];
    opts.requireInteraction = true;
    opts.data.ring = true;
    opts.data.decline = d.decline || null;
  }
  if (d.actions && d.actions.length) {
    opts.data.urls = {}; opts.data.rid = d.rid || '';
    opts.actions = d.actions.slice(0, 2).map(function (a) { opts.data.urls[a.action] = a.url; return { action: a.action, title: a.title }; });
  }
  e.waitUntil(self.registration.showNotification(d.title || 'Bellatrix', opts).then(function () {
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  }).then(function (list) {
    list.forEach(function (c) { try { c.postMessage({ type: 'bellatrix-notify-push', id: d.id || '', kind: d.type || '' }); } catch (x) { /* closed meanwhile */ } });
  }));
});
self.addEventListener('notificationclick', function (e) {
  var data = e.notification.data || {};
  /* Ablehnen: the robot is told, no window opens; an open portal stops ringing */
  if (e.action === 'decline' && data.decline) {
    e.notification.close();
    e.waitUntil(fetch(new URL('portal/api/family/calls/decline', self.registration.scope).href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data.decline), cache: 'no-store' })
      .catch(function () { /* the call ends as missed */ }).then(function () {
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      }).then(function (list) {
        list.forEach(function (c) { try { c.postMessage({ type: 'bellatrix-call-declined', invite: data.decline.invite }); } catch (x) { /* closed */ } });
      }));
    return;
  }
  var act = e.action && data.urls && data.urls[e.action] ? e.action : '';
  var target = new URL((act ? data.urls[act] : data.url) || 'portail.html', self.registration.scope).href, call = /famille\.html#j=/.test(target);
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!call && /portail\.html/.test(c.url) && 'focus' in c) { c.postMessage({ type: 'bellatrix-notify-open', id: data.id, action: act, rid: data.rid || '', kind: data.type || '' }); return c.focus(); }
    }
    return self.clients.openWindow ? self.clients.openWindow(target) : null;
  }));
});
