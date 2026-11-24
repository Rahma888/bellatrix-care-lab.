/* 14 Nov: (1) a family message is on the patient screen by itself: the patient screen asks the server every
   15 s, offers a new message by itself (on unless the care team turns it off in Family > Accounts >
   Settings) and the open "no new message" screen turns into "You have a message from …" when one arrives.
   New family ACCOUNTS still wait for the care team; messages never do. (2) A photo the family sent as a
   message can be put into the resident's Memories album by the care team, and taken out again
   (FamilyMessages.familyPhotos / albumAdd / albumRemove, used by js/album-staff.js).
   1.16 (BF-10 to 16): no approval any more. Every family message (text, photo, voice, short video)
   arrives straight on the robot; it is 'received' once here (with its file), 'read' once the resident
   opened it. Family album photos go straight into the life album (window.Album, agent G), hidden or
   removed again when the family hides or deletes them. The rules below stay: only the top-level
   patient.html offers messages by itself, never in "Personnel seulement" mode.
   Care V1 module A: family messages on the robot (version 1.14.0, agent M).
   FamilyMessages is shared by the patient screen and the Care Team (js/messages-staff.js):
   - the robot's identity on the family portal server (labland/family-portal.mjs): the robot id of
     the family calls (FamilyCall.robotId) and a random key of its own ('bellatrix-portal-key'), sent
     only in the Authorization header; the server address is the Family tab one (FamilyCall.server);
   - the cache of APPROVED messages for offline use: what is known in localStorage
     ('bellatrix-messages-cache'), the photos in IndexedDB ('bellatrix-messages'). Nothing that the care
     team has not approved is ever stored here: the feed only carries approved messages;
   - "shown" statuses wait in an outbox ('bellatrix-messages-outbox') until the server has them.
   The patient side: the activity 'messages' ("Vous avez un message de Sophie. Voulez-vous le voir ?",
   Oui / Plus tard, then the photo and the name big, the text read aloud, Réécouter / Suivant, and
   Back / Help / Stop from the core). While the waiting screen is idle, a due message is proposed by
   itself (9:00 to 20:00 unless the care team changes it). A message marked "à annoncer par l'équipe"
   is never presented by Bellatrix. Album photos go to the life album, never here. ES5 only. */
var FamilyMessages = (function () {
  'use strict';
  var META = 'bellatrix-messages-cache', OUTBOX = 'bellatrix-messages-outbox', KEY = 'bellatrix-portal-key', SNOOZE = 'bellatrix-messages-snooze',
    SETTINGS = 'bellatrix-messages-settings', PREMIUM = 'bellatrix-messages-premium', SERVER = 'bellatrix-call-server', ROBOT = 'bellatrix-family-robot';
  var KEEP_SHOWN_MS = 30 * 24 * 3600 * 1000;

  function getJ(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v === null ? d : v; } catch (e) { return d; } }
  function putJ(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function b64url(bytes) { return btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function random(n) { var a = new Uint8Array(n || 32); crypto.getRandomValues(a); return b64url(a); }

  /* ---------- the server and this robot's identity ---------- */
  function server() {
    if (window.FamilyCall && FamilyCall.server) return FamilyCall.server();
    var s = ''; try { s = localStorage.getItem(SERVER) || ''; } catch (e) { s = ''; } return s.trim().replace(/\/+$/, '');
  }
  function base() { var s = server(); return (s ? s + '/' : '') + 'portal/api/'; }
  function portalUrl() { var s = server(); return (s ? s + '/' : location.origin + location.pathname.replace(/[^/]*$/, '')) + 'portail.html'; }
  function robotId() {
    if (window.FamilyCall && FamilyCall.robotId) return FamilyCall.robotId();
    var id = ''; try { id = localStorage.getItem(ROBOT) || ''; } catch (e) { id = ''; }
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) { id = random(16); try { localStorage.setItem(ROBOT, id); } catch (e) { /* this page only */ } }
    return id;
  }
  function robotKey() {
    var k = ''; try { k = localStorage.getItem(KEY) || ''; } catch (e) { k = ''; }
    if (!/^[A-Za-z0-9_-]{32,86}$/.test(k)) { k = random(32); try { localStorage.setItem(KEY, k); } catch (e) { /* this page only */ } }
    return k;
  }
  var hello = null;
  function register() {
    if (!hello) hello = raw('POST', 'robot/hello', { robot: robotId(), key: robotKey() }, true).then(function (r) { return r; }, function (e) { hello = null; throw e; });
    return hello;
  }
  function raw(method, path, body, noAuth) {
    var o = { method: method, cache: 'no-store', headers: {} };
    if (!noAuth) o.headers.Authorization = 'Robot ' + robotId() + '.' + robotKey();
    if (body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return fetch(base() + path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || 'http-' + r.status); e.status = r.status; e.code = j.error || ''; throw e; }
        return j;
      });
    });
  }
  /* Every call: registered first (once per page), then with this robot's key. */
  function request(method, path, body) {
    if (!window.fetch) return Promise.reject(new Error('no fetch'));
    return register().then(function () { return raw(method, path, body); }).catch(function (e) {
      if (e && e.status === 401) { hello = null; return register().then(function () { return raw(method, path, body); }); }
      throw e;
    });
  }
  function photoBlob(id) {
    return register().then(function () {
      return fetch(base() + 'robot/photo?id=' + encodeURIComponent(id), { cache: 'no-store', headers: { Authorization: 'Robot ' + robotId() + '.' + robotKey() } });
    }).then(function (r) { if (!r.ok) throw new Error('photo ' + r.status); return r.blob(); });
  }

  /* ---------- photos in IndexedDB ---------- */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, ko) {
      if (!window.indexedDB) { ko(new Error('no IndexedDB')); return; }
      var rq = indexedDB.open('bellatrix-messages', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('photos'); };
      rq.onsuccess = function () { ok(rq.result); };
      rq.onerror = function () { ko(rq.error); };
    });
    dbp.catch(function () { dbp = null; });
    return dbp;
  }
  function idb(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (ok, ko) {
        var tx = d.transaction('photos', mode), st = tx.objectStore('photos'), rq = fn(st);
        tx.oncomplete = function () { ok(rq ? rq.result : undefined); };
        tx.onerror = function () { ko(tx.error); };
        tx.onabort = function () { ko(tx.error); };
      });
    });
  }
  function photoPut(id, blob) { return idb('readwrite', function (s) { return s.put(blob, id); }); }
  function photoGet(id) { return idb('readonly', function (s) { return s.get(id); }); }
  function photoDel(id) { return idb('readwrite', function (s) { return s.delete(id); }).catch(function () { /* nothing kept */ }); }
  var urls = {};
  /* An object URL for a cached photo; fetched from the server (and cached) when missing. */
  function photoUrl(id) {
    if (urls[id]) return Promise.resolve(urls[id]);
    return photoGet(id).then(function (b) { return b || Promise.reject(new Error('not cached')); })
      .catch(function () { return photoBlob(id).then(function (b) { return photoPut(id, b).catch(function () { /* shown anyway */ }).then(function () { return b; }); }); })
      .then(function (b) { urls[id] = URL.createObjectURL(b); return urls[id]; });
  }

  /* ---------- the cache of the messages on this robot ---------- */
  function cache() { var c = getJ(META, null); c = c && typeof c === 'object' ? c : {}; c.items = c.items && typeof c.items === 'object' ? c.items : {}; return c; }
  function saveCache(c) { return putJ(META, c); }
  function list() { var c = cache(); return Object.keys(c.items).map(function (k) { return c.items[k]; }); }
  function get(id) { return cache().items[id] || null; }
  function hasFile(m) { return !!(m && (m.hasPhoto || m.hasMedia)); }
  function isShown(m) { return m.status === 'read' || !!m.shownLocal; }
  function snoozes() { return getJ(SNOOZE, {}) || {}; }
  function settings() {
    var s = getJ(SETTINGS, {}) || {};
    return { auto: s.auto !== false, from: /^\d\d:\d\d$/.test(s.from || '') ? s.from : '09:00', to: /^\d\d:\d\d$/.test(s.to || '') ? s.to : '20:00' };
  }
  function setSettings(s) { putJ(SETTINGS, s); }
  function minutes(t) { var m = /^(\d\d):(\d\d)$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : -1; }
  function inHours(d) { var s = settings(), n = d.getHours() * 60 + d.getMinutes(), a = minutes(s.from), b = minutes(s.to); return a <= b ? n >= a && n < b : n >= a || n < b; }
  /* What Bellatrix may present now: not read yet, not put off by "Plus tard", and its file is here. */
  function due(code, o) {
    o = o || {};
    var t = Date.now(), sn = snoozes();
    return list().filter(function (m) {
      return m.kind !== 'album' && (m.status === 'sent' || m.status === 'received') && !m.shownLocal && (!code || m.code === code) &&
        (o.ignoreSnooze || !(sn[m.id] > t)) && (!hasFile(m) || m.cached || o.anyPhoto);
    }).sort(function (a, b) { return a.at < b.at ? -1 : 1; });
  }
  function recent(code, n) {
    return list().filter(function (m) { return isShown(m) && m.code === code && m.kind !== 'album'; })
      .sort(function (a, b) { return (b.shownLocal || b.readAt || '') > (a.shownLocal || a.readAt || '') ? 1 : -1; }).slice(0, n || 5);
  }
  function snooze(ids, mins) {
    var sn = snoozes(), until = Date.now() + (mins || 60) * 60000, t = Date.now();
    Object.keys(sn).forEach(function (k) { if (sn[k] < t) delete sn[k]; });
    ids.forEach(function (id) { sn[id] = until; });
    putJ(SNOOZE, sn);
  }
  /* Family album photos (BF-15/16): album picture id -> { p: portal id, c: resident code }. The album can
     report "seen" to the family: FamilyMessages.albumShown(albumPictureId). */
  var ALBUM_MAP = 'bellatrix-messages-album-map';
  function albumMap() { var m = getJ(ALBUM_MAP, {}) || {}; return m && typeof m === 'object' ? m : {}; }
  function albumLink(albumId, portalId, code) { var m = albumMap(); m[albumId] = { p: portalId, c: code || '' }; putJ(ALBUM_MAP, m); }
  function albumOf(portalId) { var m = albumMap(); for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k) && (m[k] === portalId || (m[k] && m[k].p === portalId))) return { id: k, code: m[k].c || '', team: !!m[k].team }; return null; }
  function albumShown(albumId) {
    var m = albumMap(), x = m[albumId], pid = x && (x.p || x);
    if (!pid || typeof pid !== 'string') return Promise.resolve(false);
    if (x && x.seen) return Promise.resolve(false);
    m[albumId] = { p: pid, c: (x && x.c) || '', seen: true }; putJ(ALBUM_MAP, m);
    return markShown(pid, 'robot').then(function () { return true; }, function () { return true; });
  }
  function showNow(id) { var c = cache(); if (c.items[id]) { c.items[id].showNow = true; saveCache(c); } }
  /* The team brought Bellatrix to the resident ("The robot is with P2", Care Team): the patient screen
     opens these messages for that resident (localStorage, the two pages are the same robot app). */
  var SHOW = 'bellatrix-messages-show';
  function showOnPatient(code, ids) { putJ(SHOW, { code: code, ids: ids || [], at: Date.now() }); }
  function takeShow() { var x = getJ(SHOW, null); try { localStorage.removeItem(SHOW); } catch (e) { /* nothing */ } return x && Date.now() - x.at < 10 * 60 * 1000 ? x : null; }
  function shrink(blob, max) {
    return new Promise(function (ok, ko) {
      var url = URL.createObjectURL(blob), img = new Image();
      img.onload = function () {
        var k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), cv = document.createElement('canvas');
        cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        ok(cv.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('image')); };
      img.src = url;
    });
  }
  function albumOn() { return !!(window.Album && typeof window.Album.add === 'function'); }
  function captionOf(a) { var t = String(a.text || ''), d = dateLabel(String(a.date || '')); return (d ? (t ? t + ' · ' + d : d) : t).slice(0, 90); }
  /* 24 Nov: the family app sends a real date (YYYY-MM-DD) now; older photos keep their free text */
  function dateLabel(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); if (!m) return d;
    var l = (window.Lab && Lab.opt && Lab.opt.lang) || 'en', loc = { fr: 'fr-FR', de: 'de-DE' }[l] || 'en-GB';
    try { return new Date(+m[1], +m[2] - 1, +m[3], 12).toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return d; }
  }
  /* ---------- the care team puts a photo MESSAGE of the family into the Memories album ----------
     One tap in Care Team > Activities > Memories > Personalise (js/album-staff.js). The album keeps its own copy
     (theme "Family", the message's words as the caption, the "Family" mark); 'bellatrix-messages-album-map'
     remembers which message it came from ({ p, c, seen, team }), so it can be taken out again and so it
     leaves the album when the family deletes the message. It stays when the message only got old. */
  function unlinkPortal(portalId) { var m = albumMap(), n = 0; Object.keys(m).forEach(function (k) { if (m[k] === portalId || (m[k] && m[k].p === portalId)) { delete m[k]; n++; } }); if (n) putJ(ALBUM_MAP, m); }
  function inAlbum(portalId) {
    var x = albumOf(portalId), pic = null;
    if (!x || !albumOn()) return null;
    try { pic = Album.get(x.code, x.id); } catch (e) { pic = null; }
    return pic ? x : null;
  }
  /* The photos the family sent to this resident as messages, newest first. */
  function familyPhotos(code) {
    return list().filter(function (m) { return m.code === code && m.hasPhoto && m.kind !== 'album'; }).sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  }
  /* 14 Nov: the head and the tablet are two devices with two albums. The team's choice is told to the
     server (robot/message/album, teamAlbum in the feed); the other device follows it at its next sync
     (syncTeamAlbum: auto, no server call). */
  function tellAlbum(portalId, on) { return request('POST', 'robot/message/album', { id: portalId, album: !!on }).then(function () { var c = cache(); if (c.items[portalId]) { c.items[portalId].teamAlbum = !!on; saveCache(c); } }, function () { /* the other device follows later */ }); }
  function albumAdd(portalId, o) {
    var m = get(portalId), x = inAlbum(portalId), auto = !!(o && o.auto);
    if (x) { if (!auto) tellAlbum(portalId, true); return Promise.resolve(x); }
    if (!m || !m.hasPhoto || !albumOn()) return Promise.reject(new Error('no-photo'));
    unlinkPortal(portalId);   /* a copy the team removed in the album itself */
    return photoGet(portalId).then(function (b) { return b || photoBlob(portalId); }, function () { return photoBlob(portalId); }).then(function (b) { return shrink(b, 1024); }).then(function (src) {
      var pic = Album.add(m.code, { theme: 'family', src: src, caption: String(m.text || '').slice(0, 90), question: '', addedBy: 'family' });
      return Promise.resolve(pic).then(function (pc) {
        if (!pc || !pc.id) throw new Error((window.Album && Album.lastError) || 'album');
        var map = albumMap(); map[pc.id] = auto ? { p: portalId, c: m.code, seen: true, team: true, auto: true } : { p: portalId, c: m.code, seen: true, team: true }; putJ(ALBUM_MAP, map);
        if (!auto) tellAlbum(portalId, true);
        return { id: pc.id, code: m.code, team: true };
      });
    });
  }
  function albumRemove(portalId, o) {
    var x = albumOf(portalId);
    if (!(o && o.auto)) tellAlbum(portalId, false);
    if (!x) return false;
    try { if (albumOn() || (window.Album && Album.remove)) Album.remove(x.code, x.id); } catch (e) { /* already gone */ }
    unlinkPortal(portalId);
    return true;
  }
  /* The photos the team put into the album on the OTHER device (the head): added here too; taken out when
     the team took them out there. Only the copies this sync made itself are ever removed by it. */
  function syncTeamAlbum() {
    if (!albumOn()) return Promise.resolve();
    var map = albumMap(), autoOf = {};
    Object.keys(map).forEach(function (k) { var v = map[k]; if (v && v.auto && v.p) autoOf[v.p] = true; });
    return list().filter(function (m) { return m.hasPhoto && m.kind !== 'album'; }).reduce(function (p, m) {
      return p.then(function () {
        if (m.teamAlbum && !albumOf(m.id)) return albumAdd(m.id, { auto: true }).catch(function () { /* next sync */ });
        if (!m.teamAlbum && autoOf[m.id]) albumRemove(m.id, { auto: true });
        return null;
      });
    }, Promise.resolve());
  }
  /* Into the album, straight away (no approval): a new photo is added, a hidden one hidden, a deleted one removed.
     expired: the ids that only ran out of the 30 days: a photo the care team chose for the album stays. */
  function syncAlbum(items, gone, expired) {
    var got = [];
    if (!albumOn()) return Promise.resolve(got);
    (gone || []).forEach(function (pid) { var x = albumOf(pid); if (x && x.team && (expired || []).indexOf(pid) >= 0) { unlinkPortal(pid); return; } if (x) { try { Album.remove(x.code, x.id); } catch (e) { /* already gone */ } var m = albumMap(); delete m[x.id]; putJ(ALBUM_MAP, m); } });
    return items.reduce(function (p, a) {
      return p.then(function () {
        var x = albumOf(a.id);
        if (x) {
          try { var cur = Album.get(a.code, x.id); if (cur && !!cur.hidden !== !!a.hidden && Album.update) Album.update(a.code, x.id, { hidden: !!a.hidden }); } catch (e) { /* the album decides */ }
          if (a.status === 'sent') got.push(a.id);
          return null;
        }
        return photoBlob(a.id).then(function (b) { return shrink(b, 1024); }).then(function (src) {
          var pic = Album.add(a.code, { theme: a.theme, src: src, caption: captionOf(a), question: a.question || '', addedBy: 'family' });
          return Promise.resolve(pic).then(function (pc) {
            if (!pc || !pc.id) return;
            albumLink(pc.id, a.id, a.code);
            if (a.hidden && Album.update) Album.update(a.code, pc.id, { hidden: true });
            got.push(a.id);
          });
        }).catch(function () { /* next sync */ });
      });
    }, Promise.resolve()).then(function () { return got; });
  }

  /* ---------- statuses back to the server: received (here) and read (opened) ---------- */
  function markShown(id, by) {
    var c = cache(), m = c.items[id], at = new Date().toISOString();
    if (m) { m.shownLocal = at; saveCache(c); }
    var box = getJ(OUTBOX, []) || [];
    if (!box.some(function (x) { return x.id === id; })) box.push({ id: id, at: at, by: by || 'robot' });
    putJ(OUTBOX, box);
    return flush();
  }
  var flushing = null;
  function flush() {
    var box = getJ(OUTBOX, []) || [];
    if (!box.length) return Promise.resolve(0);
    if (flushing) return flushing;
    flushing = request('POST', 'robot/shown', { items: box }).then(function (r) {
      var left = (getJ(OUTBOX, []) || []).filter(function (x) { return !box.some(function (y) { return y.id === x.id; }); });
      putJ(OUTBOX, left);
      flushing = null;
      return r.updated;
    }, function (e) { flushing = null; throw e; });
    return flushing;
  }

  /* ---------- sync: the messages from the server into this robot ---------- */
  var syncing = null, lastSync = 0, lastError = '';
  function sync() {
    if (syncing) return syncing;
    var albums = [], gone = [], expired = [];
    syncing = flush().catch(function () { /* again next time */ }).then(function () { return request('GET', 'robot/feed'); }).then(function (feed) {
      var c = cache(), keep = {}, need = [];
      (feed.messages || []).forEach(function (m) {
        if (m.kind === 'album') { albums.push(m); return; }
        var old = c.items[m.id] || {};
        var it = { id: m.id, code: m.code, from: m.from, relation: m.relation || '', lang: m.lang, kind: m.kind, text: m.text || '', hasPhoto: !!m.hasPhoto, hasMedia: !!m.hasMedia, mime: m.mime || '', teamAlbum: !!m.teamAlbum,
          at: m.at, status: m.status, readAt: m.readAt || null, shownLocal: old.shownLocal || null, showNow: !!old.showNow, cached: !!(old.cached || old.photoCached) };
        if (it.status === 'read' && Date.now() - Date.parse(it.readAt || it.at) > KEEP_SHOWN_MS) return;
        keep[m.id] = it;
        if (hasFile(it) && !it.cached) need.push(it.id);
      });
      /* Gone from the feed (withdrawn by the team, deleted by the family, older than the retention): gone here too. */
      Object.keys(c.items).forEach(function (id) { if (!keep[id]) { photoDel(id); if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; } } });
      gone = feed.gone || []; expired = feed.expired || [];
      gone.forEach(function (id) { delete keep[id]; photoDel(id); });
      c.items = keep; c.updated = new Date().toISOString();
      saveCache(c);
      lastSync = Date.now(); lastError = '';
      /* The files (photos, voice, video), one after the other, for offline use. */
      return need.reduce(function (p, id) {
        return p.then(function () {
          return photoBlob(id).then(function (b) { return photoPut(id, b); }).then(function () {
            var c2 = cache(); if (c2.items[id]) { c2.items[id].cached = true; saveCache(c2); }
          }).catch(function () { /* next sync */ });
        });
      }, Promise.resolve());
    }).then(function () { return syncAlbum(albums, gone, expired); }).then(function (albumGot) {
      return syncTeamAlbum().then(function () { return albumGot; }, function () { return albumGot; });
    }).then(function (albumGot) {
      /* BF-14: 'received' once the message and its file are on this robot. */
      var ids = list().filter(function (m) { return m.status === 'sent' && (!hasFile(m) || m.cached); }).map(function (m) { return m.id; }).concat(albumGot || []);
      if (!ids.length) return null;
      return request('POST', 'robot/received', { ids: ids }).then(function () {
        var c3 = cache(); ids.forEach(function (id) { if (c3.items[id] && c3.items[id].status === 'sent') c3.items[id].status = 'received'; }); saveCache(c3);
      }, function () { /* next sync */ });
    }).then(function () { syncing = null; return cache(); }, function (e) { syncing = null; lastError = String(e && (e.code || e.message) || e); throw e; });
    return syncing;
  }

  /* ---------- the family Premium gift on this device ----------
     Premium is per resident AND per product (window.Premium, js/premium.js, contract 1 of 1.16:
     'play' = Bellatrix Play Premium, 'books' = Books Premium; one never implies the other). The family
     of P1 gives Play (or Books) for P1 only; the care team presses Activer (js/messages-staff.js) and
     that product goes on for P1 alone, until the gift's end. 'bellatrix-messages-premium' remembers
     which gift each resident and product has: { P1: {offer, until, at} } for Play (the 1.15 shape),
     { 'P1|books': {...} } for Books. When a gift ends (stopped, cancelled, run out), that product goes
     off for that resident ONLY if it still comes from that gift (a team subscription stays).
     Works with Premium v3 (activate(code, product, opts)) and with the 1.15 Premium (Play only). */
  function PR() { return typeof Premium !== 'undefined' ? Premium : (window.Premium || null); }
  function v3(P) { return !!P && typeof P.requests === 'function'; }
  function norm(c) { return String(c == null ? '' : c).trim().toUpperCase(); }
  function prod(x) { return x === 'books' ? 'books' : 'play'; }
  function recKey(code, product) { var c = norm(code); return prod(product) === 'books' ? c + '|books' : c; }
  function premiumRecords() {
    var r = getJ(PREMIUM, null);
    if (!r || typeof r !== 'object') return {};
    /* 1.15 before per resident: one record { offer, code, until, wasOn, at } */
    if (r.offer && r.code) { var one = {}; one[norm(r.code)] = { offer: r.offer, until: r.until || null, at: r.at || '' }; return one; }
    return r;
  }
  function premiumRecord(code, product) { return premiumRecords()[recKey(code, product)] || null; }
  function setPremiumRecord(code, rec, product) {
    var all = premiumRecords(), k = recKey(code, product);
    if (!norm(code)) return false;
    if (rec) all[k] = { offer: rec.offer, until: rec.until || null, at: rec.at || new Date().toISOString() }; else delete all[k];
    if (Object.keys(all).length) return putJ(PREMIUM, all);
    try { localStorage.removeItem(PREMIUM); } catch (e) { /* nothing */ }
    return true;
  }
  function entryOf(P, c, product) { return v3(P) ? P.entry(c, product) : (product === 'play' ? P.entry(c) : null); }
  function storedOf(P, c, product) {
    if (v3(P)) return typeof P.stored === 'function' ? P.stored(c, product) : P.entry(c, product);
    return product === 'play' && typeof P.stored === 'function' ? P.stored(c) : null;
  }
  /* Activer: this product for this resident only, until the gift's end. A team subscription that
     already runs longer is kept as it is (the family's months do not shorten it). */
  function startFamilyPremium(code, offerId, months, until, product) {
    var P = PR(), c = norm(code), pr = prod(product);
    if (!P || !c || !offerId) return null;
    if (!v3(P) && pr !== 'play') return null;   /* Books Premium needs Premium v3 */
    var cur = entryOf(P, c, pr), keep = cur && cur.source !== 'family' && (!cur.until || !until || Date.parse(cur.until) >= Date.parse(until));
    setPremiumRecord(c, { offer: offerId, until: until }, pr);
    if (keep) return cur;
    var opts = { until: until || null, by: 'family', source: 'family', offer: offerId, months: months || 1 };
    return v3(P) ? P.activate(c, pr, opts) : P.activate(c, 'family-' + (months || 1), opts);
  }
  /* The gift ended: off for this resident and product only, and only when it came from that gift. */
  function endFamilyPremium(code, offerId, product) {
    var P = PR(), c = norm(code), pr = prod(product), rec = premiumRecord(c, pr), id = offerId || (rec && rec.offer), e = P ? storedOf(P, c, pr) : null, off = false;
    if (P && e && e.source === 'family' && (!e.offer || e.offer === id)) off = v3(P) ? P.deactivate(c, pr) : P.deactivate(c);
    if (rec && (!offerId || rec.offer === offerId)) setPremiumRecord(c, null, pr);
    return off;
  }
  function splitKey(k) { var i = k.indexOf('|'); return i < 0 ? { code: k, product: 'play' } : { code: k.slice(0, i), product: prod(k.slice(i + 1)) }; }
  /* The gifts the server knows (robot/state offers): those of a record that ended. Returns the codes ended
     ('P1' for Play, 'P1|books' for Books). */
  function reconcileFamilyPremium(offers) {
    var all = premiumRecords(), out = [];
    Object.keys(all).forEach(function (k) {
      var rec = all[k], o = (offers || []).filter(function (x) { return x.id === rec.offer; })[0], who = splitKey(k);
      /* No longer on the server (the resident's data was erased) counts as ended too. */
      var ended = !o || o.state === 'stopped' || o.state === 'expired' || o.state === 'cancelled' || (rec.until && Date.parse(rec.until) <= Date.now());
      if (ended) { endFamilyPremium(who.code, rec.offer, who.product); out.push(who.product === 'play' ? who.code : k); }
    });
    return out;
  }
  /* The end date passed (the patient screen checks every minute, even offline). Returns the codes ended. */
  function premiumExpired() {
    var all = premiumRecords(), out = [];
    Object.keys(all).forEach(function (k) {
      var r = all[k], who = splitKey(k);
      if (r && r.until && Date.parse(r.until) <= Date.now()) { endFamilyPremium(who.code, r.offer, who.product); out.push(who.product === 'play' ? who.code : k); }
    });
    return out;
  }

  /* ---------- the screen (the patient activity and the Care Team's exact preview) ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var ENVELOPE = '<svg class="msgart" viewBox="0 0 400 300" aria-hidden="true"><rect x="40" y="60" width="320" height="200" rx="26" fill="#FFFFFF" stroke="#E0E0E0" stroke-width="4"/>' +
    '<path d="M40 86 L200 190 L360 86" fill="none" stroke="#00519E" stroke-width="12" stroke-linejoin="round"/>' +
    '<path d="M200 168 C170 146 160 128 168 116 C176 104 192 106 200 118 C208 106 224 104 232 116 C240 128 230 146 200 168 Z" fill="#C0392B"/></svg>';
  function senderLine(names, T, count) {
    if (names.length === 1 && (count || 1) > 1) return T('You have {n} messages from {name}.', { n: count, name: names[0] });
    if (names.length === 1) return T('You have a message from {name}.', { name: names[0] });
    return T('You have messages from {names}.', { names: names.slice(0, -1).join(', ') + ' ' + T('and') + ' ' + names[names.length - 1] });
  }
  function uniqueNames(msgs) { var out = []; msgs.forEach(function (m) { if (out.indexOf(m.from) < 0) out.push(m.from); }); return out; }
  /* One message as a step: the name big, the photo big (or the text in a big card), the text read; a
     voice message or a short video plays after Bellatrix's short sentence. */
  var MIC = '<svg class="msgart" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="#9FD3F5"/><rect x="40" y="22" width="20" height="36" rx="10" fill="#00519E"/><path d="M30 48 a20 20 0 0 0 40 0 M50 68 V80" fill="none" stroke="#00519E" stroke-width="6" stroke-linecap="round"/></svg>';
  function stepParts(m, url, T) {
    var text = String(m.text || '');
    var writes = text ? T('{name} writes: {text}', { name: m.from, text: text }) : '';
    if (m.kind === 'voice') {
      return { title: m.from, pic: '<div class="msgvoice">' + MIC + (url ? '<audio class="msgmedia" preload="auto" src="' + esc(url) + '"></audio>' : '') + '</div>', picCls: 'msgvoicebox', media: 'audio',
        body: text ? '<p class="msgtext">' + esc(text) + '</p>' : '', say: T('A voice message from {name}.', { name: m.from }) };
    }
    if (m.kind === 'video') {
      return { title: m.from, pic: url ? '<video class="msgmedia msgvideo" playsinline preload="auto" src="' + esc(url) + '"></video>' : ENVELOPE, picCls: 'msgpic', media: 'video',
        body: text ? '<p class="msgtext">' + esc(text) + '</p>' : '', say: T('A video from {name}.', { name: m.from }) };
    }
    if (m.hasPhoto) {
      return { title: m.from, pic: url ? '<img class="own msgphoto" src="' + esc(url) + '" alt="">' : ENVELOPE, picCls: 'msgpic',
        body: text ? '<p class="msgtext">' + esc(text) + '</p>' : '', say: T('A photo from {name}.', { name: m.from }) + (writes ? ' ' + writes : '') };
    }
    return { title: m.from, pic: '<div class="msgquote"><p>' + esc(text) + '</p></div>', picCls: 'msgquotebox', body: '', say: writes };
  }
  /* The Care Team preview: the same markup and classes as the patient screen, 1080 x 1920. */
  function previewHtml(m, url, lang) {
    var T = function (s, v) { return I18N.t(lang, s, v); }, p = stepParts(m, url, T);
    var f = function (l, cls) { return '<span class="fbtn' + (cls ? ' ' + cls : '') + '">' + esc(T(l)) + '</span>'; };
    return '<div class="stage msgstage"><div class="top"><span class="facechip">' + (window.Lab && Lab.faceHtml ? Lab.faceHtml('mini') : '') + '</span></div>' +
      '<div class="msgscreen"><header><h2>' + esc(p.title) + '</h2></header>' +
      '<div class="picture ' + p.picCls + '">' + p.pic + '</div>' + p.body +
      '<div class="actions"><div class="pair"><span class="btn">' + esc(T('Listen again')) + '</span><span class="btn primary">' + esc(T('Next')) + '</span></div></div>' +
      '<div class="foot">' + f('Back', 'off') + f('Help') + f('Stop') + '</div></div></div>';
  }

  return {
    server: server, base: base, portalUrl: portalUrl, robotId: robotId, request: request, photoBlob: photoBlob, photoUrl: photoUrl, photoPut: photoPut,
    list: list, get: get, due: due, recent: recent, snooze: snooze, showNow: showNow, showOnPatient: showOnPatient, takeShow: takeShow, markShown: markShown, flush: flush, sync: sync, albumLink: albumLink, albumShown: albumShown,
    settings: settings, setSettings: setSettings, inHours: inHours, premiumRecord: premiumRecord, premiumRecords: premiumRecords, setPremiumRecord: setPremiumRecord, premiumExpired: premiumExpired,
    startFamilyPremium: startFamilyPremium, endFamilyPremium: endFamilyPremium, reconcileFamilyPremium: reconcileFamilyPremium,
    stepParts: stepParts, previewHtml: previewHtml, senderLine: senderLine, uniqueNames: uniqueNames, ENVELOPE: ENVELOPE, syncAlbum: syncAlbum, albumOf: albumOf,
    familyPhotos: familyPhotos, inAlbum: inAlbum, albumAdd: albumAdd, albumRemove: albumRemove, syncTeamAlbum: syncTeamAlbum,
    /* the tablet took the head's family identity (js/family-visit-patient.js): register again with it */
    resetIdentity: function () { hello = null; },
    status: function () { return { lastSync: lastSync, lastError: lastError }; }
  };
})();

/* ---------- the patient activity ---------- */
(function () {
  'use strict';
  if (typeof I18N !== 'undefined' && I18N.add) {
    var add = function (l, t) { var have = I18N.dict[l] || {}, out = {}; Object.keys(t).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(have, k)) out[k] = t[k]; }); I18N.add(l, out); };
    add('fr', { 'Before you go, I have a little surprise for you.': 'Avant de partir, j’ai une petite surprise pour toi.', 'See': 'Voir', 'A voice message from {name}.': 'Un message vocal de {name}.', 'A video from {name}.': 'Une vidéo de {name}.',
      'Photos, voice messages, short videos and texts from the family, shown big and read or played aloud.': 'Des photos, messages vocaux, petites vidéos et textes de la famille, montrés en grand et lus ou joués à voix haute.' });
    add('de', { 'Before you go, I have a little surprise for you.': 'Bevor du gehst, habe ich eine kleine Überraschung für dich.', 'See': 'Ansehen', 'A voice message from {name}.': 'Eine Sprachnachricht von {name}.', 'A video from {name}.': 'Ein Video von {name}.',
      'Photos, voice messages, short videos and texts from the family, shown big and read or played aloud.': 'Fotos, Sprachnachrichten, kurze Videos und Texte der Familie, groß gezeigt und vorgelesen oder abgespielt.' });
  }
  if (!window.Lab) return;
  var FM = FamilyMessages;
  var ICON_AGAIN = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M78 50 A28 28 0 1 1 64 26" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"/><path d="M58 12 L76 26 L56 38 Z" fill="currentColor"/></svg>';
  var ICON_NEXT = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M30 18 L72 50 L30 82 Z" fill="currentColor"/></svg>';

  Lab.define({
    key: 'messages', day: 17, name: 'Family messages', zone: 'ROSE_ROOM', noAgain: true,
    flow: 'Photos, voice messages, short videos and texts from the family, shown big and read or played aloud.',
    learn: 'Does the resident enjoy the family message, listen again and stop without help?',
    art: function () { return FM.ENVELOPE; },
    content: [],
    start: function (L) {
      var T = L.t, d = Lab.startData || {}, code = Lab.patient;
      /* 14 Nov: the care team sent the robot to this resident from the head ("Go to …", js/family-visit-*.js):
         a call visit asks "Call Sophie?" first; a call that could not start ends calmly. */
      var FV = window.FamilyVisit;
      if (d.callFailed && FV && FV.failedStep) return FV.failedStep(L);
      var visit = !d.ids && FV && FV.take ? FV.take(code) : null;
      if (visit && visit.call && FV.callStep) return FV.callStep(L, visit);
      /* Started by the patient screen itself (d.auto): the messages it chose. Started by the care team:
         every message of this resident not read yet. */
      var msgs = d.ids ? d.ids.map(FM.get).filter(function (m) { return m && (d.team || ((m.status === 'sent' || m.status === 'received') && !m.shownLocal)); })
        : FM.due(code, { ignoreSnooze: true, anyPhoto: true });
      var replay = false, urls = {}, ready = null;
      L.stat('messagesWaiting', msgs.length);
      function load(list) {
        return Promise.all(list.map(function (m) {
          if (!m.hasPhoto && !m.hasMedia) return null;
          return FM.photoUrl(m.id).then(function (u) { urls[m.id] = u; }, function () { urls[m.id] = ''; });
        }));
      }
      function later() {
        FM.snooze(msgs.map(function (m) { return m.id; }), 60);
        L.stat('messagesLater', true);
        L.log('Messages put off until later', 'result');
        var line = T('All right. Later, then.');
        L.go({ id: 'msg-later', final: true, center: true, title: line, say: line,
          actions: [{ label: T('Finish'), primary: true, noLabelWords: true, run: function () { Lab.endSession(); } }],
          enter: function () { L.later(function () { Lab.endSession(); }, 6000); } }, { clear: true });
      }
      function show(i) {
        var m = msgs[i];
        if (!m) { L.finish(); return; }
        /* A file that cannot be shown (not on this robot yet, no connection) is kept for later. */
        if ((m.hasPhoto || m.hasMedia) && !urls[m.id]) { show(i + 1); return; }
        var p = FM.stepParts(m, urls[m.id], T);
        var media = function () { var s = document.querySelector('#screen .msgmedia'); return s && s.play ? s : null; };
        var play = function () { var el = media(); if (el) { try { el.currentTime = 0; var pr = el.play(); if (pr && pr.catch) pr.catch(function () { /* a tap plays it */ }); } catch (e) { /* not playable */ } } };
        if (!replay) { FM.markShown(m.id, 'robot').catch(function () { /* the outbox keeps it */ }); L.stat('messagesShown'); }
        L.push('messagesFrom', m.from);
        L.log('Family message shown: from ' + m.from + ' (' + (m.kind || 'text') + ')', 'result');
        L.go({
          id: 'msg-' + i, title: p.title, pic: p.pic, picCls: p.picCls, body: p.body, cls: 'msgshow', back: i > 0, airPointer: true,
          say: p.say, afterSay: p.media ? play : null,
          leave: function () { var el = media(); if (el) try { el.pause(); } catch (e) { /* gone */ } },
          actions: [
            { label: T('Listen again'), icon: ICON_AGAIN, pair: true, gesture: 'thumb', words: ['again', 'listen again', 'repeat', 'once more', 'encore', 'nochmal'], noLabelWords: true,
              run: function () { L.stat('messageRepeats'); if (p.media) play(); else L.say(p.say); } },
            { label: T('Next'), icon: ICON_NEXT, pair: true, primary: true, gesture: 'open', words: ['next', 'continue', 'ok', 'okay', 'suivant', 'weiter'], noLabelWords: true,
              run: function () { show(i + 1); } }
          ]
        }, { replace: i === 0 });
      }
      function begin() {
        L.go({ id: 'msg-wait', title: T('One moment…'), pic: FM.ENVELOPE, picCls: 'msgenv', back: false, noHistory: true, say: '' }, { clear: true });
        (ready || (ready = load(msgs))).then(function () { if (L.step() && L.step().id === 'msg-wait') show(0); });
      }
      function ask() {
        var names = FM.uniqueNames(msgs), line = FM.senderLine(names, T, msgs.length), q = msgs.length > 1 ? T('Would you like to see them?') : T('Would you like to see it?');
        ready = load(msgs);
        return {
          id: 'msg-ask', title: line, lead: q, pic: FM.ENVELOPE, picCls: 'msgenv', back: false, noHistory: true, airPointer: true,
          say: line + ' ' + q,
          actions: [
            { label: T('Yes'), primary: true, gesture: 'open', words: ['yes', 'yeah', 'ok', 'okay', 'sure', 'oui', 'ja'], noLabelWords: true, run: function () { L.log('Wants to see the family message', 'consent'); begin(); } },
            { label: T('Later'), gesture: 'fist', words: ['later', 'not now', 'no', 'plus tard', 'non', 'später', 'nein'], noLabelWords: true, run: later }
          ]
        };
      }
      function none() {
        var old = FM.recent(code, 5), line = T('No new message right now.');
        /* A message that arrives while this screen is open is offered at once (no restart, no care team). */
        var watch = function () {
          L.later(function () {
            var fresh = FM.due(code, { ignoreSnooze: true, anyPhoto: true });
            if (!fresh.length) { watch(); return; }
            msgs = fresh; replay = false; ready = null;
            L.stat('messagesWaiting', msgs.length);
            L.go(ask(), { clear: true });
          }, 5000);
        };
        return {
          id: 'msg-none', title: line, pic: FM.ENVELOPE, picCls: 'msgenv', back: false, noHistory: true, say: line, enter: watch,
          actions: (old.length ? [{ label: T('See the last messages'), primary: true, noLabelWords: true, words: ['see', 'last', 'again', 'yes'],
            run: function () { replay = true; msgs = old.slice().reverse(); ready = null; L.stat('messagesReplayed', msgs.length); begin(); } }] : [])
            .concat([{ label: T('Finish'), primary: !old.length, noLabelWords: true, words: ['finish', 'stop', 'end', 'no'], run: function () { L.finish(); } }])
        };
      }
      /* From the closing "surprise": the resident said yes already, the messages follow one after the other. */
      if (d.now && msgs.length) {
        ready = load(msgs);
        ready.then(function () { if (L.step() && L.step().id === 'msg-wait') show(0); });
        return { id: 'msg-wait', title: T('One moment…'), pic: FM.ENVELOPE, picCls: 'msgenv', back: false, noHistory: true, say: '' };
      }
      /* A visit for messages this tablet does not have yet: fetched first (a few seconds), then offered. */
      if (visit && visit.ids && visit.ids.some(function (id) { return !FM.get(id); })) {
        var fetched = function () {
          FM.sync().catch(function () { /* the cache is used */ }).then(function () {
            if (!L.step() || L.step().id !== 'msg-sync') return;
            msgs = FM.due(code, { ignoreSnooze: true, anyPhoto: true }); ready = null;
            L.stat('messagesWaiting', msgs.length);
            L.go(msgs.length ? ask() : none(), { clear: true });
          });
        };
        return { id: 'msg-sync', title: T('One moment…'), pic: FM.ENVELOPE, picCls: 'msgenv', back: false, noHistory: true, say: '', enter: fetched };
      }
      return msgs.length ? ask() : none();
    }
  });

  /* ---------- the patient screen: sync, and propose a due message by itself ---------- */
  var KEY = 'bellatrix-care-lab-v1', RUN = 'bellatrix-care-lab-run', STAFF_ONLY = 'bellatrix-staff-only';
  /* Only the real patient screen (patient.html, the top page, not a demo or preview frame) syncs with
     the server and offers messages by itself. */
  function patientPage() {
    var top = true;
    try { top = window.top === window; } catch (e) { top = false; }
    return top && /(^|\/)patient\.html$/.test(location.pathname) && !!document.getElementById('stage') && !document.getElementById('setup');
  }
  /* "Personnel seulement" (js/staff-tools.js): nothing starts by itself for the resident. */
  function staffOnly() { try { var o = JSON.parse(localStorage.getItem(STAFF_ONLY) || 'null'); return !!(o && o.on); } catch (e) { return false; } }
  /* The resident's own settings, as the care team set them (as for a family call, js/patient.js). */
  function residentStart(code, ids, team, now) {
    var s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }
    var p = (s.patients || {})[code] || {}, pr = p.prefs || {}, st = s.settings || {}, o = Lab.opt, wasAir = o.camMode === 'air';
    o.participant = code; o.staff = st.staff || ''; o.zone = ''; o.mapRev = st.mapRev || ''; o.sw = st.sw || '';
    /* 16 Nov: messages opened right after an activity done by pointing (the closing "surprise") keep the pointing;
       on a robot with a head and a tablet, pointing is on by default (as for the family visit). */
    var linkedTablet = !!(window.LinkPatient && LinkPatient.configured && LinkPatient.configured());
    o.camMode = wasAir || linkedTablet ? 'air' : (st.camMode || 'off'); o.camMove = false; o.voice = false;   /* touch always works too */
    o.profile = pr.profile || ''; o.greet = pr.greet || ''; o.rate = pr.rate || 0.92; o.volume = pr.volume || 0.9;
    o.textSize = pr.textSize || 'normal'; o.subtitles = !!pr.subtitles; o.lang = I18N.valid(pr.lang); o.mood = pr.mood !== false;
    Lab.patient = code;
    Lab.content = p.content || {};
    try { localStorage.setItem('bellatrix-care-lab-lastlang', Lab.lang()); } catch (e) { /* only for the waiting screen */ }
    Lab.start('messages', { direct: true, data: { auto: !team, team: !!team, now: !!now, code: code, ids: ids } });
  }
  function maybePropose() {
    if (!patientPage() || Lab.isOn() || document.visibilityState === 'hidden' || staffOnly()) return;
    /* 14 Nov: a robot with a head and a tablet (the link is set) moves: the person in front of the tablet
       may be anybody. A message is shown only when the care team sent the robot to its resident
       ("Go to …" on the head, js/family-visit-staff.js), never offered by itself here. */
    if (window.LinkPatient && LinkPatient.configured && LinkPatient.configured()) return;
    /* 15 Nov: the robot HEAD (its link relay is 'local') never shows family messages itself: they belong on the tablet. */
    if (linkHead()) return;
    var run = null; try { run = JSON.parse(localStorage.getItem(RUN) || 'null'); } catch (e) { run = null; }
    if (run && Date.now() - run.at < 3600000) return;   /* a session (or a preview) from the care team is about to start */
    var set = FM.settings();
    if (!set.auto || !FM.inHours(new Date())) return;
    var all = FM.due(null);
    if (!all.length) return;
    var code = all[0].code, mine = all.filter(function (m) { return m.code === code; }).slice(0, 5);
    try { residentStart(code, mine.map(function (m) { return m.id; })); } catch (e) { if (window.console) console.error(e); }
  }
  function linkHead() { var k = ''; try { k = localStorage.getItem('bellatrix-link-server') || ''; } catch (e) { k = ''; } return k === 'local'; }
  FM.propose = maybePropose;
  /* The closing step of an activity (js/core.js endStep): "Before you go, I have a little surprise for you",
     one big "See" and a discreet "Later". Never in a call, a preview, a demo or the messages activity itself. */
  var NO_SURPRISE = { messages: 1, familycall: 1, callrequest: 1, stdemo: 1 };
  Lab.surprise = function (act, rec) {
    if (!patientPage() || staffOnly() || linkHead() || !act || NO_SURPRISE[act.key] || (rec && rec.preview) || location.protocol === 'file:') return null;
    var code = Lab.patient, T = Lab.t, msgs = code ? FM.due(code, { ignoreSnooze: true, anyPhoto: true }) : [];
    if (!msgs.length) return null;
    var ids = msgs.map(function (m) { return m.id; }), line = T('Before you go, I have a little surprise for you.');
    return {
      id: 'surprise', title: line, pic: FM.ENVELOPE, picCls: 'msgenv', back: false, noHistory: true, noStop: true, airPointer: true, say: line,
      actions: [
        { label: T('See'), primary: true, gesture: 'open', words: ['see', 'yes', 'ok', 'okay', 'voir', 'oui', 'ja', 'ansehen'], noLabelWords: true,
          run: function () { Lab.endSession(); try { residentStart(code, ids, false, true); } catch (e) { if (window.console) console.error(e); } } },
        { label: T('Later'), gesture: 'fist', words: ['later', 'not now', 'plus tard', 'später'], noLabelWords: true,
          run: function () { FM.snooze(ids, 60); Lab.endSession(); } }
      ]
    };
  };
  /* "The robot is with P2" from the Care Team: the message opens now, even outside the hours (the team is there). */
  function teamShow() {
    if (!patientPage() || linkHead()) return;   /* the head never shows family messages itself (15 Nov) */
    var x = FM.takeShow();
    if (!x || !x.code) return;
    var go = function () {
      if (Lab.isOn()) Lab.endSession('replaced: the care team shows a family message');
      if (Lab.isOn()) return;
      try { residentStart(x.code, x.ids, true); } catch (e) { if (window.console) console.error(e); }
    };
    if ((x.ids || []).every(function (id) { return !!FM.get(id); })) go();
    else FM.sync().catch(function () { /* shown from the cache */ }).then(go);
  }
  FM.teamShow = teamShow;
  document.addEventListener('DOMContentLoaded', function () {
    if (!patientPage() || location.protocol === 'file:') return;
    FM.premiumExpired();
    var tick = function () { FM.premiumExpired(); FM.sync().catch(function () { /* offline: the cache is used */ }).then(maybePropose); };
    setTimeout(tick, 4000);
    setInterval(tick, 15000);   /* a new family message is on this screen within seconds, by itself */
    setInterval(maybePropose, 20000);
    window.addEventListener('storage', function (e) { if (e.key === 'bellatrix-messages-cache') setTimeout(maybePropose, 1500); if (e.key === 'bellatrix-messages-show' && e.newValue) teamShow(); });
    setInterval(teamShow, 3000);
    setTimeout(teamShow, 1200);
  });
})();
