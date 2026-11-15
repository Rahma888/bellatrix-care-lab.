/* Care V1 module B: album themes, generic cards and the per-resident album store.

   window.Album is the contract with the other parts of the app:
   - Album.add(patientCode, { theme, src, caption, question, addedBy }) keeps one picture for one
     resident. src: a data URL (data:image/...) or a server URL; a server URL is copied into this
     device as a data URL as soon as it can be fetched, so the robot shows it offline too.
     addedBy: 'family' (the family portal, after the care team validated the photo), 'staff', or a
     name. Returns the picture ({ id, theme, src, caption, question, addedBy, family, hidden }) or
     null (Album.lastError: 'src' for a missing or unknown picture, 'full' when storage is full).
   - Album.list(patientCode) the pictures the resident may see (hidden pictures and hidden themes
     left out); Album.list(code, { all: true }) everything, for the care team.
   - likes, hidden pictures and themes, free notes, sessions, a small dashboard and "Photo du jour".
   Storage (shared by the patient screen and the Care Team app, same robot app):
   - 'bellatrix-album-v1' in localStorage: the metadata (JSON), read and written synchronously;
   - the pictures (resized JPEG data URLs) in IndexedDB 'bellatrix-album' (store 'img'), held in
     memory once read: Album.ready / 'bellatrix-album-ready', Album.img(id) (a Promise),
     Album.imgSync(id), Album.addAsync(), Album.erase(code). Old 'bellatrix-album-img-<id>'
     localStorage entries are moved there once; localStorage stays the fallback without IndexedDB.
   Plan B without personal data: 21 generic cards (3 per theme) drawn here as flat SVG, nothing
   downloaded. Free-licence photos (licence checked picture by picture) can replace them later.
   ES5 only (the robot's WebView is Chrome 95). */
var Album = (function () {
  'use strict';
  var META = 'bellatrix-album-v1', IMG = 'bellatrix-album-img-', EVT = 'bellatrix-album';
  var MAX_SIDE = 1024, QUALITY = 0.8, KEEP_SESSIONS = 80;
  var store = null;
  try { store = window.localStorage; } catch (e) { store = null; }

  var THEMES = [
    { id: 'family', label: 'Family' },
    { id: 'travel', label: 'Travels' },
    { id: 'childhood', label: 'Childhood' },
    { id: 'work', label: 'Work' },
    { id: 'animals', label: 'Animals' },
    { id: 'celebrations', label: 'Celebrations' },
    { id: 'town', label: 'My town' },
    /* 1.16: the landscapes of the memory postcards (sea, mountain, forest). */
    { id: 'nature', label: 'Nature' }
  ];
  /* Theme names as the family portal or a person may write them, in the three languages. */
  var ALIAS = {
    family: 'family', famille: 'family', familie: 'family', familles: 'family',
    travel: 'travel', travels: 'travel', voyage: 'travel', voyages: 'travel', reise: 'travel', reisen: 'travel', holidays: 'travel', vacances: 'travel', urlaub: 'travel',
    childhood: 'childhood', enfance: 'childhood', kindheit: 'childhood', school: 'childhood', ecole: 'childhood',
    work: 'work', job: 'work', metier: 'work', metiers: 'work', travail: 'work', beruf: 'work', arbeit: 'work',
    animals: 'animals', animal: 'animals', animaux: 'animals', tiere: 'animals', tier: 'animals', pets: 'animals',
    celebrations: 'celebrations', celebration: 'celebrations', fetes: 'celebrations', fete: 'celebrations', feste: 'celebrations', fest: 'celebrations', feiern: 'celebrations', parties: 'celebrations',
    town: 'town', city: 'town', 'my town': 'town', ville: 'town', 'ma ville': 'town', stadt: 'town', 'meine stadt': 'town', village: 'town', dorf: 'town',
    nature: 'nature', natur: 'nature', landscape: 'nature', landscapes: 'nature', paysage: 'nature', paysages: 'nature', landschaft: 'nature', landschaften: 'nature', postcards: 'nature'
  };
  function norm(s) {
    s = String(s == null ? '' : s).toLowerCase().trim();
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s.replace(/\s+/g, ' ');
  }
  function themeId(t) { var k = norm(t); return ALIAS[k] || ALIAS[k.replace(/^(ma|mon|my|meine|mein) /, '')] || 'family'; }
  function themeOf(id) { for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i]; return null; }
  function clip(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n); }
  function story(s) { return clip(s, 700); }
  function code(c) { return clip(c || 'P1', 40) || 'P1'; }
  function iso() { return new Date().toISOString(); }
  function newId() { return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function fire() { try { window.dispatchEvent(new CustomEvent(EVT)); } catch (e) { /* node tests, old browser */ } }
  function isFamily(r) { return /^famil/i.test((r && r.addedBy) || ''); }

  /* ---------- storage ---------- */
  function read() {
    var d = null;
    try { d = JSON.parse((store && store.getItem(META)) || 'null'); } catch (e) { d = null; }
    if (!d || typeof d !== 'object') d = {};
    d.patients = d.patients || {};
    d.photoDay = d.photoDay || { on: false, patient: '' };
    return d;
  }
  function write(d) {
    try { store.setItem(META, JSON.stringify(d)); fire(); return true; } catch (e) { api.lastError = 'full'; return false; }
  }
  function pat(d, c) {
    c = code(c);
    var p = d.patients[c] = d.patients[c] || {};
    p.photos = p.photos || []; p.hiddenThemes = p.hiddenThemes || []; p.likes = p.likes || {}; p.sessions = p.sessions || []; p.notes = p.notes || '';
    return p;
  }
  /* ---------- picture bytes: IndexedDB, localStorage only as the fallback ----------
     The metadata above stays in localStorage and is read synchronously, as before. The pictures
     (resized JPEG data URLs) live in IndexedDB 'bellatrix-album', store 'img', key = picture id.
     At start-up every picture is read into memory, so list(), get(), cardsFor() and photoOfDay()
     still give src synchronously; Album.ready (a Promise) and the 'bellatrix-album-ready' event say
     when that is done. Old 'bellatrix-album-img-<id>' localStorage entries are moved into IndexedDB
     once, then removed. Without IndexedDB (or when it refuses), localStorage is used as before.
     Another page of the app (Care Team / patient screen) may add a picture: the ids the metadata
     lists but memory lacks are read again on 'storage', focus, visibility and every few seconds. */
  var IDB_NAME = 'bellatrix-album', IDB_STORE = 'img', READY = 'bellatrix-album-ready';
  var mem = {}, db = null, where = 'pending', waiting = [], dropLater = [], lastSave = {};
  var idbf = null;
  try { idbf = window.indexedDB || null; } catch (e) { idbf = null; }
  var readyDone = null, ready = new Promise(function (r) { readyDone = r; });
  function demo() { try { return !!window.BellatrixDemo; } catch (e) { return false; } }
  function lsGet(id) { try { return (store && store.getItem(IMG + id)) || ''; } catch (e) { return ''; } }
  function lsSet(id, v) { try { store.setItem(IMG + id, v); return true; } catch (e) { return false; } }
  function lsDel(id) { try { store.removeItem(IMG + id); } catch (e) { /* nothing kept */ } }
  function lsIds() {
    var out = [];
    try { for (var i = 0; store && i < store.length; i++) { var k = store.key(i); if (k && k.indexOf(IMG) === 0) out.push(k.slice(IMG.length)); } } catch (e) { /* none */ }
    return out;
  }
  function quiet(e) { if (e && e.preventDefault) e.preventDefault(); }
  /* One IndexedDB transaction; resolves true when it completed, false otherwise (never rejects). */
  function idbRun(mode, work) {
    return new Promise(function (res) {
      if (!db) { res(false); return; }
      var tx = null;
      try {
        tx = db.transaction(IDB_STORE, mode);
        tx.oncomplete = function () { res(true); };
        tx.onabort = function () { res(false); };
        work(tx.objectStore(IDB_STORE));
      } catch (e) {
        /* A write refused at once (full, or the Care Team demo frame): nothing of it is kept. */
        try { if (tx) tx.abort(); } catch (x) { /* already over */ }
        res(false);
      }
    });
  }
  function idbPut(id, v) { return idbRun('readwrite', function (os) { os.put(v, id); }); }
  function idbDel(ids) { return ids.length ? idbRun('readwrite', function (os) { ids.forEach(function (id) { os['delete'](id); }); }) : Promise.resolve(true); }
  function idbGetMany(ids) {
    var got = {};
    return idbRun('readonly', function (os) {
      ids.forEach(function (id) { var g = os.get(id); g.onsuccess = function () { if (typeof g.result === 'string') got[id] = g.result; }; });
    }).then(function () { return got; });
  }
  function getImg(id) { return mem[id] || lsGet(id) || ''; }
  /* Keeps a picture: in memory at once (the screens read it synchronously), then in IndexedDB, or
     in localStorage when IndexedDB is not there or refuses. Resolves to true once it is kept. */
  function saveImg(id, v) {
    mem[id] = v;
    if (where === 'pending') return new Promise(function (res) { waiting.push({ id: id, done: res }); });
    if (where === 'idb') return idbPut(id, v).then(function (ok) { return ok || lsSet(id, v); });
    return Promise.resolve(lsSet(id, v));
  }
  function delImg(id) {
    delete mem[id];
    lsDel(id);
    if (where === 'pending') dropLater.push(id);
    else if (where === 'idb' && !demo()) idbDel([id]);
  }
  /* The writes asked for before IndexedDB answered. */
  function flush() {
    var w = waiting, drop = dropLater;
    waiting = []; dropLater = [];
    w.forEach(function (x) { if (mem[x.id]) saveImg(x.id, mem[x.id]).then(x.done); else x.done(true); });
    if (where === 'idb' && drop.length) idbDel(drop);
  }
  function referenced() {
    var d = read(), ids = {};
    Object.keys(d.patients).forEach(function (c) { (d.patients[c].photos || []).forEach(function (r) { if (r.img) ids[r.id] = 1; }); });
    return ids;
  }
  function announce(first) {
    fire();
    try { window.dispatchEvent(new CustomEvent(READY)); } catch (e) { /* node tests */ }
    /* js/album.js repaints its "photo du jour" on storage events whose key starts with bellatrix-album. */
    try { if (!first) return; window.dispatchEvent(new StorageEvent('storage', { key: READY })); } catch (e) { /* old browser */ }
  }
  /* Moves the old localStorage pictures into IndexedDB once; they leave localStorage only when the
     copy is complete (otherwise they stay, and are tried again at the next start). */
  function migrate() {
    var ids = lsIds();
    if (!ids.length || demo()) return Promise.resolve(0);
    var vals = {};
    ids.forEach(function (id) { vals[id] = lsGet(id); if (vals[id] && !mem[id]) mem[id] = vals[id]; });
    return idbRun('readwrite', function (os) { ids.forEach(function (id) { if (vals[id]) os.put(vals[id], id); }); }).then(function (ok) {
      if (ok) ids.forEach(lsDel);
      return ok ? ids.length : 0;
    });
  }
  /* Pictures in IndexedDB that no picture of any resident uses any more (a delete that failed). */
  function tidy() {
    if (demo()) return Promise.resolve(0);
    /* Careful: only with readable metadata that still lists pictures (never on a lost or reset index). */
    var rawMeta = null;
    try { rawMeta = JSON.parse((store && store.getItem(META)) || 'null'); } catch (e) { rawMeta = null; }
    if (!rawMeta || !rawMeta.patients) return Promise.resolve(0);
    var used = referenced();
    if (!Object.keys(used).length) return Promise.resolve(0);
    var gone = Object.keys(mem).filter(function (id) { return !used[id]; });
    gone.forEach(function (id) { delete mem[id]; });
    return idbDel(gone).then(function () { return gone.length; });
  }
  function loadAll() {
    return idbRun('readonly', function (os) {
      var cur = os.openCursor();
      cur.onsuccess = function () { var c = cur.result; if (!c) return; if (typeof c.value === 'string' && !mem[c.key]) mem[c.key] = c.value; c['continue'](); };
    });
  }
  /* Reads the pictures another page of the app added since the start. */
  var syncing = false;
  function sync() {
    if (syncing || where === 'pending') return Promise.resolve(0);
    var used = referenced(), miss = Object.keys(used).filter(function (id) { if (mem[id]) return false; var l = lsGet(id); if (l) { mem[id] = l; return false; } return true; });
    if (!miss.length || where !== 'idb') return Promise.resolve(0);
    syncing = true;
    return idbGetMany(miss).then(function (got) {
      syncing = false;
      var n = 0;
      Object.keys(got).forEach(function (id) { if (!mem[id]) { mem[id] = got[id]; n++; } });
      if (n) announce(true);
      return n;
    });
  }
  function start() {
    var settled = false;
    function done(how) {
      if (settled) return;
      settled = true; where = how;
      (how === 'idb' ? migrate().then(tidy) : Promise.resolve()).then(function () { flush(); readyDone(how); announce(true); });
    }
    if (!idbf) { done('local'); return; }
    try {
      var rq = idbf.open(IDB_NAME, 1);
      rq.onupgradeneeded = function () { try { if (!rq.result.objectStoreNames.contains(IDB_STORE)) rq.result.createObjectStore(IDB_STORE); } catch (e) { /* demo frame */ } };
      rq.onsuccess = function () {
        if (settled) { try { rq.result.close(); } catch (e) { /* fine */ } return; }
        db = rq.result;
        db.onversionchange = function () { try { db.close(); } catch (e) { /* fine */ } db = null; where = 'local'; };
        loadAll().then(function (ok) { if (ok) done('idb'); else { db = null; done('local'); } });
      };
      rq.onerror = function (e) { quiet(e); done('local'); };
      rq.onblocked = function () { done('local'); };
      setTimeout(function () { if (!db) done('local'); }, 6000);
    } catch (e) { done('local'); }
  }
  function view(r) {
    var o = {};
    Object.keys(r).forEach(function (k) { o[k] = r[k]; });
    o.src = r.img ? getImg(r.id) || r.url || '' : r.url || '';
    o.family = isFamily(r);
    o.own = true;
    return o;
  }
  function find(p, id) { for (var i = 0; i < p.photos.length; i++) if (p.photos[i].id === id) return p.photos[i]; return null; }
  function okSrc(s) {
    return /^data:image\/[a-z.+-]+;base64,/i.test(s) || /^https?:\/\/\S+$/i.test(s) || /^\/\/\S+$/.test(s) || /^[\w\-./]+\.(jpe?g|png|webp|gif)(\?\S*)?$/i.test(s);
  }

  /* ---------- pictures ---------- */
  /* A picture (File, Blob or URL) made smaller for the robot's screen and this device's storage:
     at most 1024 px on its longest side, JPEG. Drawing it again also drops its hidden data (GPS). */
  function shrink(input, maxSide) {
    maxSide = maxSide || MAX_SIDE;
    return new Promise(function (resolve, reject) {
      if (typeof document === 'undefined') { reject(new Error('no canvas here')); return; }
      var str = typeof input === 'string', url = str ? input : URL.createObjectURL(input), img = new Image();
      if (str && !/^data:/i.test(input)) img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var k = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
          var g = c.getContext('2d');
          g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, c.width, c.height);
          g.drawImage(img, 0, 0, c.width, c.height);
          if (!str) URL.revokeObjectURL(url);
          resolve(c.toDataURL('image/jpeg', QUALITY));
        } catch (e) { reject(e); }
      };
      img.onerror = function () { if (!str) URL.revokeObjectURL(url); reject(new Error('not a picture')); };
      img.src = url;
    });
  }
  /* A picture given as a server URL is copied into this device when possible (offline on the robot).
     Until then, and if the server does not allow it, the URL itself is used. */
  function cacheOne(c, id) {
    var d = read(), r = find(pat(d, c), id);
    if (!r || r.img || !r.url || typeof document === 'undefined' || !window.fetch) return Promise.resolve(false);
    return fetch(r.url, { mode: 'cors', credentials: 'omit' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.blob();
    }).then(function (b) { return shrink(b); }).then(function (data) {
      var d2 = read(), r2 = find(pat(d2, c), id);
      if (!r2) return false;
      return saveImg(id, data).then(function (ok) {
        var d3 = read(), r3 = find(pat(d3, c), id);
        if (!ok || !r3) { delete mem[id]; return false; }
        r3.img = 1; r3.cachedAt = iso();
        return write(d3);
      });
    }).catch(function () { return false; });
  }
  function cacheAll() {
    var d = read(), jobs = [];
    Object.keys(d.patients).forEach(function (c) { (d.patients[c].photos || []).forEach(function (r) { if (r.url && !r.img) jobs.push(cacheOne(c, r.id)); }); });
    return Promise.all(jobs);
  }
  function add(c, o) {
    o = o || {};
    var src = String(o.src || '').trim();
    if (!okSrc(src)) { api.lastError = 'src'; return null; }
    var d = read(), p = pat(d, c), id = newId(), saving = null;
    var r = { id: id, theme: themeId(o.theme), caption: clip(o.caption, 90), question: clip(o.question, 160), addedBy: clip(o.addedBy || 'staff', 40) || 'staff', addedAt: iso(), hidden: false };
    /* The told story (1.16, from the memory postcards): optional, read by Bellatrix with the picture. */
    if (o.story) r.story = story(o.story);
    if (o.from) r.from = clip(o.from, 40);
    /* A postcard taken over (1.16): the texts the team had not changed follow the resident's language. */
    if (o.pc && postcardOf(o.pc)) { r.pc = o.pc; r.auto = (o.auto || []).filter(function (k) { return ['caption', 'story', 'question'].indexOf(k) >= 0; }); }
    if (/^data:/i.test(src)) {
      /* Without IndexedDB, as before: localStorage says at once whether it is full. */
      if (where === 'local') { if (!lsSet(id, src)) { api.lastError = 'full'; return null; } mem[id] = src; saving = Promise.resolve(true); }
      else saving = saveImg(id, src);
      r.img = 1;
    } else { r.url = src; saving = Promise.resolve(true); }
    p.photos.push(r);
    if (!write(d)) { delImg(id); api.lastError = 'full'; return null; }
    api.lastError = '';
    /* IndexedDB answers later: a picture it could not keep (nor localStorage) is taken out again,
       so the album never lists a picture without its image. */
    lastSave[id] = saving.then(function (ok) {
      delete lastSave[id];
      if (ok) return true;
      var d2 = read(), p2 = d2.patients[code(c)];
      if (p2) { p2.photos = (p2.photos || []).filter(function (x) { return x.id !== id; }); write(d2); }
      delete mem[id];
      api.lastError = 'full';
      return false;
    });
    if (r.url) cacheOne(c, id);
    return view(r);
  }
  /* Like add(), but resolves once the picture is really kept (null when it could not be). */
  function addAsync(c, o) {
    var r = add(c, o);
    if (!r) return Promise.resolve(null);
    return (lastSave[r.id] || Promise.resolve(true)).then(function (ok) { return ok ? r : null; });
  }
  /* The image of a picture: at once from memory (imgSync), or once the store answered (img). */
  function imgSync(id) { return getImg(id); }
  function img(id) {
    return ready.then(function () {
      var v = getImg(id);
      if (v || where !== 'idb') return v;
      return idbGetMany([id]).then(function (got) { if (got[id]) mem[id] = got[id]; return got[id] || ''; });
    });
  }
  function list(c, opts) {
    opts = opts || {};
    var p = read().patients[code(c)];
    if (!p) return [];
    var hidden = p.hiddenThemes || [];
    return (p.photos || []).filter(function (r) {
      if (opts.theme && r.theme !== opts.theme) return false;
      return opts.all || (!r.hidden && hidden.indexOf(r.theme) < 0);
    }).map(view);
  }
  function get(c, id) { var d = read(), r = d.patients[code(c)] ? find(pat(d, c), id) : null; return r ? view(r) : null; }
  function update(c, id, f) {
    var d = read(), r = find(pat(d, c), id);
    if (!r) return null;
    if (f.theme !== undefined) r.theme = themeId(f.theme);
    if (f.caption !== undefined) r.caption = clip(f.caption, 90);
    if (f.question !== undefined) r.question = clip(f.question, 160);
    if (f.story !== undefined) { if (String(f.story).trim()) r.story = story(f.story); else delete r.story; }
    if (f.hidden !== undefined) r.hidden = !!f.hidden;
    write(d);
    return view(r);
  }
  /* A resident's own words on a generic card (the memory postcards' titles, captions, stories and
     questions the team had written, 1.16): { caption, story, question }, empty to drop. */
  function cardText(c, id) { var p = read().patients[code(c)]; return p && p.cardText && p.cardText[id] ? JSON.parse(JSON.stringify(p.cardText[id])) : null; }
  function setCardText(c, id, f) {
    var d = read(), p = pat(d, c), t = {};
    ['caption', 'story', 'question'].forEach(function (k) { var v = f && f[k]; if (v !== undefined && String(v).trim()) t[k] = k === 'story' ? story(v) : clip(v, k === 'caption' ? 90 : 160); });
    p.cardText = p.cardText || {};
    if (Object.keys(t).length) p.cardText[id] = t; else delete p.cardText[id];
    return write(d);
  }
  function remove(c, id) {
    var d = read(), p = pat(d, c), before = p.photos.length;
    p.photos = p.photos.filter(function (r) { return r.id !== id; });
    if (p.photos.length === before) return false;
    delete p.likes[id];
    delImg(id);
    return write(d);
  }
  /* Erase on request: every picture of a resident (or only those sent by the family, with
     { family: true }), from memory, IndexedDB and localStorage. Without { family: true } the
     resident's notes, hearts and sessions go too. Returns how many pictures were erased. */
  function erase(c, opts) {
    opts = opts || {};
    var d = read(), key = code(c), p = d.patients[key];
    if (!p) return 0;
    var gone = (p.photos || []).filter(function (r) { return !opts.family || isFamily(r); });
    gone.forEach(function (r) { delImg(r.id); if (p.likes) delete p.likes[r.id]; });
    if (opts.family) p.photos = (p.photos || []).filter(function (r) { return !isFamily(r); });
    else {
      delete d.patients[key];
      if (d.photoDay && d.photoDay.patient === key) d.photoDay.on = false;
    }
    write(d);
    return gone.length;
  }

  /* ---------- likes, hidden themes, notes ----------
     likes[id] counts the sessions in which the resident pressed the heart for that picture
     (personal pictures and generic cards alike). */
  function sessionOf(p, sid) { for (var i = p.sessions.length - 1; i >= 0; i--) if (p.sessions[i].id === sid) return p.sessions[i]; return null; }
  function like(c, id, on, sid) {
    var d = read(), p = pat(d, c), s = sid ? sessionOf(p, sid) : null;
    var already = s ? s.likes.indexOf(id) >= 0 : !!p.likes[id];
    var v = on === undefined ? !already : !!on;
    if (v && !already) { p.likes[id] = (p.likes[id] || 0) + 1; if (s) s.likes.push(id); }
    if (!v && already) {
      p.likes[id] = Math.max(0, (p.likes[id] || 0) - 1);
      if (!p.likes[id]) delete p.likes[id];
      if (s) s.likes = s.likes.filter(function (x) { return x !== id; });
    }
    write(d);
    return v;
  }
  function likes(c) { var p = read().patients[code(c)]; return p && p.likes ? JSON.parse(JSON.stringify(p.likes)) : {}; }
  function hideTheme(c, theme, on) {
    var d = read(), p = pat(d, c), t = themeId(theme), i = p.hiddenThemes.indexOf(t);
    if (on && i < 0) p.hiddenThemes.push(t);
    if (!on && i >= 0) p.hiddenThemes.splice(i, 1);
    write(d);
    return p.hiddenThemes.slice();
  }
  function hiddenThemes(c) { var p = read().patients[code(c)]; return p ? (p.hiddenThemes || []).slice() : []; }
  function setNotes(c, text) { var d = read(); pat(d, c).notes = String(text || '').slice(0, 2000); return write(d); }
  function notes(c) { var p = read().patients[code(c)]; return p ? p.notes || '' : ''; }
  function patients() { return Object.keys(read().patients).sort(); }

  /* ---------- sessions (for the dashboard) ---------- */
  function sessionStart(c, offered) {
    var d = read(), p = pat(d, c), sid = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), now = iso();
    p.sessions.push({ id: sid, at: now, end: now, offered: (offered || []).slice(), chosen: [], views: 0, likes: [] });
    if (p.sessions.length > KEEP_SESSIONS) p.sessions = p.sessions.slice(-KEEP_SESSIONS);
    write(d);
    return sid;
  }
  /* patch: { offered: [themes], chose: theme, view: true } */
  function sessionTouch(c, sid, patch) {
    patch = patch || {};
    var d = read(), s = sessionOf(pat(d, c), sid);
    if (!s) return false;
    if (patch.offered) patch.offered.forEach(function (t) { s.offered.push(t); });
    if (patch.chose) s.chosen.push(patch.chose);
    if (patch.view) s.views++;
    s.end = iso();
    return write(d);
  }
  function sessions(c) { var p = read().patients[code(c)]; return p ? JSON.parse(JSON.stringify(p.sessions || [])) : []; }
  function secs(s) { return Math.max(0, Math.round((new Date(s.end).getTime() - new Date(s.at).getTime()) / 1000)); }
  /* The care team's dashboard: most liked pictures, themes avoided (hidden by the team, or offered
     at least twice and never chosen), how long the sessions lasted. Family pictures count like any other. */
  function stats(c, lang) {
    var p = read().patients[code(c)] || {};
    var photos = p.photos || [], lk = p.likes || {}, ss = p.sessions || [], hid = p.hiddenThemes || [], byId = {};
    photos.forEach(function (r) { byId[r.id] = r; });
    GENERIC.forEach(function (g) { byId[g.id] = { id: g.id, theme: g.theme, caption: pick(lang, g.caption), generic: true }; });
    var top = Object.keys(lk).filter(function (id) { return byId[id] && lk[id] > 0; }).map(function (id) {
      var r = byId[id];
      return { id: id, n: lk[id], caption: r.caption || '', theme: r.theme, generic: !!r.generic, family: isFamily(r) };
    }).sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
    var th = {};
    THEMES.forEach(function (t) { th[t.id] = { id: t.id, offered: 0, chosen: 0, photos: 0, family: 0, hidden: hid.indexOf(t.id) >= 0 }; });
    photos.forEach(function (r) { if (th[r.theme]) { th[r.theme].photos++; if (isFamily(r)) th[r.theme].family++; } });
    var durations = [];
    ss.forEach(function (s) {
      s.offered.forEach(function (t) { if (th[t]) th[t].offered++; });
      s.chosen.forEach(function (t) { if (th[t]) th[t].chosen++; });
      if (s.views > 0) durations.push(secs(s));
    });
    var total = durations.reduce(function (a, b) { return a + b; }, 0);
    return {
      photos: photos.length,
      family: photos.filter(isFamily).length,
      hidden: photos.filter(function (r) { return r.hidden; }).length,
      topLiked: top,
      themes: THEMES.map(function (t) { var x = th[t.id]; x.avoided = x.hidden || (x.offered >= 2 && x.chosen === 0); return x; }),
      sessions: durations.length,
      lastS: durations.length ? durations[durations.length - 1] : 0,
      avgS: durations.length ? Math.round(total / durations.length) : 0
    };
  }

  /* ---------- Photo du jour (the robot's waiting screen) ----------
     Off by default. The care team chooses the resident; one of their visible pictures a day, or a
     generic card when they have none (or when the team prefers generic cards). */
  function photoDay(v) {
    var d = read();
    if (v) {
      d.photoDay = { on: !!v.on, patient: code(v.patient || d.photoDay.patient), generic: !!v.generic };
      write(d);
    }
    return JSON.parse(JSON.stringify(d.photoDay));
  }
  function dayNumber(date) { var x = date || new Date(); return Math.floor(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86400000); }
  function photoOfDay(date, lang) {
    var pd = read().photoDay;
    if (!pd || !pd.on) return null;
    var hidden = hiddenThemes(pd.patient), own = pd.generic ? [] : list(pd.patient).filter(function (r) { return r.img || r.url; });
    var n = dayNumber(date), r = own.length ? own[n % own.length] : null;
    /* Pictures still being read at start-up: nothing yet rather than a card that changes a moment later. */
    if (r && !r.src && where === 'pending') return null;
    if (r && !r.src) { own = own.filter(function (x) { return x.src; }); r = own.length ? own[n % own.length] : null; }
    if (r) return { id: r.id, src: r.src, caption: r.caption, theme: r.theme, own: true };
    var gen = GENERIC.filter(function (g) { return hidden.indexOf(g.theme) < 0; });
    if (!gen.length) return null;
    var g = gen[n % gen.length];
    return { id: g.id, art: g.art(), caption: pick(lang, g.caption), theme: g.theme, own: false };
  }

  /* ---------- the cards of a theme for a session ----------
     mode 'auto': the resident's pictures of that theme, or the generic cards when there are none;
     'own': only their pictures; 'generic': only the generic cards. */
  function pick(lang, v) { return v && typeof v === 'object' ? (v[lang] !== undefined ? v[lang] : v.en) : (v || ''); }
  function generic(theme) { return GENERIC.filter(function (g) { return !theme || g.theme === theme; }); }
  function cardsFor(c, theme, mode, lang) {
    var own = mode === 'generic' ? [] : list(c, { theme: theme }).filter(function (r) { return r.src; }).map(function (r) { return localize(r, lang); });
    if (own.length || mode === 'own') return own;
    var p = read().patients[code(c)] || {}, words = p.cardText || {};
    return generic(theme).map(function (g) {
      var w = words[g.id] || {};
      return { id: g.id, theme: g.theme, caption: w.caption || pick(lang, g.caption), story: w.story || pick(lang, g.story), question: w.question || pick(lang, g.question), art: g.art(), generic: true };
    });
  }
  /* Daily content (js/daily.js, agent D: Daily.get('memories', …)) made into album cards. Accepts an
     array or { items: [...] }; each item { id, theme, title or caption, story or text, question,
     art (SVG) or src or image }. Items without a picture get the drawing of a generic card of
     their theme; items without a known theme go to the themes in turn. */
  function fromDaily(batch, lang, themes) {
    var items = batch && typeof batch === 'object' ? (Array.isArray(batch) ? batch : batch.items || batch.memories || []) : [];
    themes = themes && themes.length ? themes : THEMES.map(function (t) { return t.id; });
    var used = {};
    return items.filter(function (it) { return it && typeof it === 'object' && (it.title || it.caption || it.story || it.text); }).map(function (it, k) {
      var raw = norm(it.theme || ''), th = ALIAS[raw] || ALIAS[raw.replace(/^(ma|mon|my|meine|mein) /, '')] || themes[k % themes.length];
      var src = typeof it.src === 'string' ? it.src : typeof it.image === 'string' && !/^\s*</.test(it.image) ? it.image : '';
      var art = typeof it.art === 'string' && /^\s*<svg/.test(it.art) ? it.art : typeof it.svg === 'string' ? it.svg : '';
      if (!src && !art) {
        var gs = generic(th), g = gs.length ? gs[(used[th] = (used[th] || 0) + 1) % gs.length] : GENERIC[k % GENERIC.length];
        art = g.art();
      }
      return { id: 'd-' + String(it.id || k), dailyId: it.id || null, theme: th, caption: clip(pick(lang, it.title || it.caption), 90), story: story(pick(lang, it.story || it.text || '')),
        question: clip(pick(lang, it.question || ''), 160), src: src && okSrc(src) ? src : '', art: src ? '' : art, generic: true, daily: true };
    });
  }

  /* ---------- 1.16: the memory postcards are part of the album ----------
     Nothing is lost. The 'postcards' key becomes 'album' in the Care Team's favourites, its last
     chosen activity and a session waiting to start. Per resident, once, the postcards' Personalise
     content is taken over: a postcard with the resident's own picture becomes an album photo (theme
     "family" when it had a caption saying who is on it, otherwise "nature"), with its title or
     caption, its own story and its question; a postcard without a picture but with the team's own
     words keeps them on the matching postcard card (Album.cardText). The old content and pictures
     stay where they were. */
  var STAFF = 'bellatrix-care-lab-v1', RUN = 'bellatrix-care-lab-run';
  function getJ(k) { try { return JSON.parse((store && store.getItem(k)) || 'null'); } catch (e) { return null; } }
  function putJ(k, v) { try { store.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function migrateKeys() {
    if (demo()) return false;
    var s = getJ(STAFF), changed = false;
    if (s && typeof s === 'object') {
      if (s.settings && s.settings.activity === 'postcards') { s.settings.activity = 'album'; changed = true; }
      Object.keys(s.patients || {}).forEach(function (c) {
        var pr = s.patients[c] && s.patients[c].prefs, f = pr && pr.favs;
        if (!f || !f.indexOf || f.indexOf('postcards') < 0) return;
        pr.favs = f.filter(function (k) { return k !== 'postcards'; });
        if (pr.favs.indexOf('album') < 0) pr.favs.push('album');
        changed = true;
      });
      if (changed) putJ(STAFF, s);
    }
    var run = getJ(RUN);
    if (run && run.key === 'postcards') { run.key = 'album'; putJ(RUN, run); changed = true; }
    return changed;
  }
  function custom(v, defaults) {
    var t = String(v == null ? '' : v).trim();
    if (!t) return '';
    var d = defaults ? [defaults.en, defaults.fr, defaults.de] : [];
    return d.indexOf(t) >= 0 ? '' : t;
  }
  function postcardOf(id) { for (var i = 0; i < POSTCARDS.length; i++) if (POSTCARDS[i].id === id) return POSTCARDS[i]; return null; }
  /* A picture in the resident's language: a taken-over postcard says its unchanged texts in that language. */
  function localize(r, lang) {
    var pc = r && r.pc && r.auto && r.auto.length ? postcardOf(r.pc) : null;
    if (!pc) return r;
    var o = {}, src = { caption: pc.title, story: pc.story, question: pc.q };
    Object.keys(r).forEach(function (k) { o[k] = r[k]; });
    r.auto.forEach(function (k) { o[k] = pick(lang, src[k]); });
    return o;
  }
  /* What the postcards of one resident leave to the album (pure: the tests use it as it is). */
  function postcardsPlan(content, lang) {
    content = content || {};
    return POSTCARDS.map(function (pc, k) {
      var n = k + 1, title = custom(content['title' + n], pc.title), cap = custom(content['caption' + n]),
        st = custom(content['story' + n], pc.story), q = custom(content['question' + n], pc.q);
      return {
        n: n, slot: 'pic' + n, card: 'g-postcard-' + pc.id,
        words: (title || cap || st || q) ? { caption: cap || title, story: st, question: q } : null,
        photo: { theme: cap ? 'family' : 'nature', caption: cap || title || pick(lang, pc.title), story: st || (cap ? '' : pick(lang, pc.story)), question: q || pick(lang, pc.q), addedBy: 'staff', from: 'postcards',
          pc: pc.id, auto: [cap || title ? '' : 'caption', st || cap ? '' : 'story', q ? '' : 'question'].filter(Boolean) }
      };
    });
  }
  /* opts.picture(code, slot) → Promise of a data URL, or '' when that postcard had no own picture.
     Resolves to { residents, photos, words }. */
  function migratePostcards(opts) {
    opts = opts || {};
    var done = { residents: 0, photos: 0, words: 0 };
    if (demo()) return Promise.resolve(done);
    var s = opts.staff || getJ(STAFF) || {}, jobs = [];
    Object.keys(s.patients || {}).forEach(function (c) {
      var p = s.patients[c] || {}, content = (p.content || {}).postcards;
      var d = read();
      d.migrated = d.migrated || {}; d.migrated.postcards = d.migrated.postcards || {};
      if (d.migrated.postcards[code(c)]) return;
      /* Marked first, so another page of the app starting at the same time does not do it twice. */
      d.migrated.postcards[code(c)] = iso();
      write(d);
      var lang = (p.prefs && p.prefs.lang) || 'en', plan = postcardsPlan(content, lang === 'fr' || lang === 'de' ? lang : 'en');
      done.residents++;
      plan.forEach(function (x) {
        var get = opts.picture ? Promise.resolve(opts.picture(c, x.slot)).catch(function () { return ''; }) : Promise.resolve('');
        jobs.push(get.then(function (src) {
          if (src) {
            var o = {}; Object.keys(x.photo).forEach(function (k) { o[k] = x.photo[k]; }); o.src = src;
            return addAsync(c, o).then(function (r) { if (r) done.photos++; else if (x.words) { setCardText(c, x.card, x.words); done.words++; } });
          }
          if (x.words) { setCardText(c, x.card, x.words); done.words++; }
        }));
      });
    });
    return Promise.all(jobs).then(function () { return done; });
  }

  /* ---------- the generic cards (Plan B), flat SVG drawn here ---------- */
  function svg(inner) { return '<svg class="albart" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' + inner + '</svg>'; }
  function lg(id, a, b) { return '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient></defs>'; }
  function R(x, y, w, h, f, rx, extra) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + f + '"' + (rx ? ' rx="' + rx + '"' : '') + (extra || '') + '/>'; }
  function C(x, y, r, f, extra) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + f + '"' + (extra || '') + '/>'; }
  function E(x, y, rx, ry, f, extra) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="' + f + '"' + (extra || '') + '/>'; }
  function P(d, f, extra) { return '<path d="' + d + '" fill="' + f + '"' + (extra || '') + '/>'; }
  function L(d, s, w, extra) { return '<path d="' + d + '" fill="none" stroke="' + s + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '/>'; }
  function sky(id, a, b) { return lg(id, a, b) + R(0, 0, 800, 600, 'url(#' + id + ')'); }
  function cloud(x, y, s) { return '<g transform="translate(' + x + ' ' + y + ') scale(' + (s || 1) + ')" opacity=".95">' + E(0, 0, 46, 24, '#FFFFFF') + E(40, -16, 38, 32, '#FFFFFF') + E(82, 0, 42, 22, '#FFFFFF') + '</g>'; }
  function tree(x, y, s, c1, c2) {
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + (s || 1) + ')">' + R(-9, -10, 18, 70, '#7A5232', 4) + C(0, -40, 46, c1 || '#5E9E4B') + C(-30, -14, 32, c1 || '#5E9E4B') + C(30, -14, 32, c2 || '#4E8A3E') + C(10, -62, 26, c2 || '#4E8A3E') + '</g>';
  }
  function pine(x, y, s, c) { return '<g transform="translate(' + x + ' ' + y + ') scale(' + (s || 1) + ')">' + R(-6, 0, 12, 22, '#6B4A2E') + P('M0 -96 L34 -30 L18 -30 L44 4 L-44 4 L-18 -30 L-34 -30 Z', c || '#2F6B4A') + '</g>'; }
  function windowBox(x, y, w, h, frame, glass) { return R(x, y, w, h, frame || '#FFFFFF', 4) + R(x + 6, y + 6, w - 12, h - 12, glass || '#BFE3F2', 2) + R(x + w / 2 - 3, y + 6, 6, h - 12, frame || '#FFFFFF') + R(x + 6, y + h / 2 - 3, w - 12, 6, frame || '#FFFFFF'); }
  function house(x, y, w, h, wall, roof) {
    var s = R(x, y, w, h, wall) + P('M' + (x - 10) + ' ' + y + ' L' + (x + w / 2) + ' ' + (y - h * 0.45) + ' L' + (x + w + 10) + ' ' + y + ' Z', roof);
    var cols = Math.max(1, Math.floor(w / 46)), gap = (w - cols * 26) / (cols + 1);
    for (var i = 0; i < cols; i++) { s += R(x + gap + i * (26 + gap), y + 18, 26, 34, '#FFF6D8', 3); s += R(x + gap + i * (26 + gap), y + 70, 26, 34, '#FFF6D8', 3); }
    return s;
  }
  function stripes(x, y, w, h, n, a, b) { var s = '', k = w / n; for (var i = 0; i < n; i++) s += R(x + i * k, y, k + 0.5, h, i % 2 ? b : a); return s; }
  function scallop(x, y, w, n, f) { var k = w / n, d = 'M' + x + ' ' + y; for (var i = 0; i < n; i++) d += ' q' + (k / 2) + ' ' + (k * 0.6) + ' ' + k + ' 0'; return P(d + ' Z', f); }
  function burst(x, y, r, c) {
    var s = '<g stroke="' + c + '" stroke-width="7" stroke-linecap="round">';
    for (var a = 0; a < 360; a += 30) { var t = a * Math.PI / 180; s += '<line x1="' + (x + Math.cos(t) * r * 0.3).toFixed(1) + '" y1="' + (y + Math.sin(t) * r * 0.3).toFixed(1) + '" x2="' + (x + Math.cos(t) * r).toFixed(1) + '" y2="' + (y + Math.sin(t) * r).toFixed(1) + '"/>'; }
    return s + '</g>' + C(x, y, r * 0.14, c);
  }
  function hen(x, y, s, body) {
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')">' + E(0, 0, 42, 32, body || '#FFFFFF') + C(34, -30, 18, body || '#FFFFFF') + P('M30 -50 q6 -12 12 0 q6 -12 10 2 Z', '#D9443A') + P('M50 -30 l14 4 l-14 5 Z', '#E8A21C') + C(38, -33, 3, '#2B2B2B') + P('M-40 -8 q-26 -26 -6 -36 q4 18 18 22 Z', body || '#FFFFFF') + L('M-6 30 v18 M10 30 v18', '#E8A21C', 5) + '</g>';
  }
  function tiles(w, h, tw, th, f, offset) { var s = ''; for (var y = 0; y < h; y += th) for (var x = (y / th) % 2 ? -offset : 0; x < w; x += tw) s += R(x + 2, y + 2, tw - 4, th - 4, f, 3); return s; }

  var ART = {
    'family-lunch': function () {
      return svg(R(0, 0, 800, 600, '#F4E4C9') + stripes(0, 0, 800, 330, 20, '#F4E4C9', '#EFDCBD') +
        windowBox(470, 50, 250, 210, '#FFFFFF', '#A9D8EE') + C(640, 110, 26, '#F6C453') + P('M440 40 h50 q-10 120 20 240 h-70 Z', '#C8553D') + P('M750 40 h-50 q10 120 -20 240 h70 Z', '#C8553D') + R(430, 30, 330, 14, '#8C5A3C', 7) +
        P('M70 330 L730 330 L780 380 L20 380 Z', '#FFFFFF') + R(20, 380, 760, 140, '#F7F2EA') + stripes(20, 380, 760, 140, 19, '#F7F2EA', '#EEC9BE') + scallop(20, 520, 760, 19, '#F7F2EA') +
        E(400, 350, 150, 30, '#FFFFFF', ' stroke="#D9D2C5" stroke-width="5"') + E(400, 318, 92, 52, '#C9772F') + E(372, 300, 30, 18, '#DB8E45') + C(318, 340, 20, '#B5652A') + C(482, 340, 20, '#B5652A') + C(304, 352, 9, '#FFFFFF') + C(496, 352, 9, '#FFFFFF') +
        E(160, 350, 70, 18, '#FFFFFF', ' stroke="#D9D2C5" stroke-width="4"') + E(640, 350, 70, 18, '#FFFFFF', ' stroke="#D9D2C5" stroke-width="4"') +
        R(560, 210, 34, 120, '#2F6B4F', 10) + R(568, 176, 18, 44, '#2F6B4F', 6) + R(562, 252, 30, 40, '#F1E3B5', 3) +
        P('M140 250 h44 l-8 80 h-28 Z', '#5BA4CF') + L('M156 250 v-30 M170 250 v-34', '#4E8A3E', 5) + C(150, 226, 18, '#E58FB0') + C(176, 220, 18, '#F2C14E') + C(162, 200, 18, '#E8684A') +
        P('M230 330 q40 -50 80 0 Z', '#E2B66B') + L('M242 316 l10 -14 M268 312 l8 -18 M292 318 l6 -14', '#C9954A', 4));
    },
    'family-picnic': function () {
      return svg(sky('fp-s', '#8FCDEE', '#E3F4FB') + C(130, 110, 50, '#F6C453') + cloud(470, 90, 1.1) + cloud(250, 150, 0.7) +
        P('M0 330 Q200 250 420 320 T800 300 V600 H0 Z', '#9CCB72') + P('M0 400 Q260 340 520 390 T800 380 V600 H0 Z', '#7DB65A') + tree(660, 330, 1.5) +
        '<defs><pattern id="fp-c" width="50" height="50" patternUnits="userSpaceOnUse" patternTransform="skewX(-35)">' + R(0, 0, 50, 50, '#FFFFFF') + R(0, 0, 25, 25, '#D9534F') + R(25, 25, 25, 25, '#D9534F') + R(25, 0, 25, 25, '#F2A6A0') + R(0, 25, 25, 25, '#F2A6A0') + '</pattern></defs>' +
        P('M170 450 L600 450 L680 560 L80 560 Z', 'url(#fp-c)') +
        P('M300 420 h140 l-16 80 h-108 Z', '#B8834A') + L('M300 420 q70 -70 140 0', '#8C5A3C', 9) + L('M306 446 h128 M300 472 h136', '#9A6A38', 5) +
        C(500, 500, 18, '#D9443A') + C(530, 512, 18, '#E8684A') + C(240, 500, 16, '#F2C14E') + R(560, 440, 22, 70, '#5BA4CF', 8) + R(565, 425, 12, 22, '#5BA4CF', 4) +
        E(380, 525, 60, 14, '#FFFFFF') + P('M350 520 q30 -24 60 0 Z', '#E2B66B'));
    },
    'family-wedding': function () {
      var garland = '';
      for (var i = 0; i < 9; i++) garland += C(40 + i * 92, 70 + (i % 2) * 18, 16, i % 2 ? '#E58FB0' : '#FFFFFF') + C(40 + i * 92, 70 + (i % 2) * 18, 6, '#F2C14E');
      return svg(R(0, 0, 800, 600, '#F8E3E8') + L('M0 60 Q100 110 200 70 T400 70 T600 70 T800 60', '#7DB65A', 6) + garland +
        R(0, 500, 800, 100, '#E8C9B6') + R(120, 490, 560, 22, '#FFFFFF', 8) +
        R(240, 380, 320, 115, '#FFF8EE', 14) + R(290, 280, 220, 105, '#FFF8EE', 12) + R(335, 195, 130, 90, '#FFF8EE', 10) +
        scallop(240, 380, 320, 8, '#F2B8C6') + scallop(290, 280, 220, 6, '#F2B8C6') + scallop(335, 195, 130, 4, '#F2B8C6') +
        R(240, 470, 320, 12, '#F2B8C6') + R(290, 372, 220, 10, '#F2B8C6') + R(335, 277, 130, 8, '#F2B8C6') +
        C(300, 420, 12, '#E58FB0') + C(400, 430, 12, '#E58FB0') + C(500, 420, 12, '#E58FB0') + C(350, 320, 10, '#F2C14E') + C(450, 320, 10, '#F2C14E') +
        L('M400 195 v-40', '#B5833F', 5) + P('M378 152 q-28 -30 0 -48 q28 18 0 48 Z', '#D9443A') + P('M422 152 q-28 -30 0 -48 q28 18 0 48 Z', '#E8684A') +
        C(160, 440, 30, '#FFFFFF') + C(190, 420, 22, '#E58FB0') + C(640, 440, 30, '#FFFFFF') + C(610, 420, 22, '#E58FB0'));
    },
    'travel-train': function () {
      var sleepers = '';
      for (var x = 0; x < 800; x += 40) sleepers += R(x, 484, 24, 26, '#8C6A4A');
      return svg(sky('tt-s', '#F7C98B', '#FCEBD2') + C(620, 150, 60, '#F59E0B', ' opacity=".85"') +
        P('M0 360 Q160 270 340 340 T800 320 V600 H0 Z', '#A9C77A') + P('M0 420 Q300 380 800 420 V600 H0 Z', '#8DB363') +
        sleepers + R(0, 478, 800, 10, '#5C5C5C') + R(0, 500, 800, 10, '#5C5C5C') +
        R(170, 330, 230, 120, '#2E5E4E', 12) + R(330, 270, 90, 180, '#2E5E4E', 10) + R(340, 286, 70, 60, '#F6E7B8', 6) + R(220, 270, 44, 64, '#1F3F35', 6) + R(210, 262, 64, 16, '#C8553D', 6) +
        P('M150 450 L170 400 L170 450 Z', '#C8553D') + R(160, 444, 270, 14, '#1F3F35') +
        C(220, 470, 30, '#C8553D') + C(300, 470, 30, '#C8553D') + C(380, 470, 30, '#C8553D') + C(220, 470, 10, '#2B2B2B') + C(300, 470, 10, '#2B2B2B') + C(380, 470, 10, '#2B2B2B') + L('M220 470 H380', '#E8E1D0', 7) +
        R(450, 320, 230, 130, '#B5473A', 10) + R(470, 340, 52, 50, '#F6E7B8', 6) + R(540, 340, 52, 50, '#F6E7B8', 6) + R(610, 340, 52, 50, '#F6E7B8', 6) + R(440, 446, 250, 12, '#5B2A22') + C(500, 470, 24, '#3A3A3A') + C(630, 470, 24, '#3A3A3A') + R(425, 420, 30, 10, '#3A3A3A') +
        C(250, 230, 30, '#FFFFFF', ' opacity=".9"') + C(290, 180, 40, '#FFFFFF', ' opacity=".85"') + C(350, 130, 50, '#FFFFFF', ' opacity=".75"') + C(430, 100, 40, '#FFFFFF', ' opacity=".6"'));
    },
    'travel-sea': function () {
      function hut(x, c) { return R(x, 340, 90, 120, '#FFFFFF') + stripes(x, 340, 90, 120, 6, '#FFFFFF', c) + P('M' + (x - 10) + ' 345 L' + (x + 45) + ' 300 L' + (x + 100) + ' 345 Z', c) + R(x + 30, 400, 30, 60, '#7A5232', 3); }
      return svg(sky('ts-s', '#7EC4EA', '#D8F0FB') + C(660, 110, 52, '#F6C453') + cloud(160, 90, 0.9) + cloud(420, 130, 0.6) +
        R(0, 250, 800, 120, '#2E86AB') + R(0, 250, 800, 30, '#3D9CC4') + L('M60 300 q20 -10 40 0 M400 330 q20 -10 40 0 M600 290 q20 -10 40 0', '#BFE6F5', 4) +
        P('M520 240 L520 160 L580 232 Z', '#FFFFFF') + P('M512 240 L512 175 L470 232 Z', '#F2C14E') + P('M460 240 h130 l-16 22 h-98 Z', '#B5473A') +
        L('M250 180 q12 -12 24 0 q12 -12 24 0 M330 150 q10 -10 20 0 q10 -10 20 0', '#3A4A55', 4) +
        P('M0 360 Q400 330 800 370 V600 H0 Z', '#F2D6A2') + hut(70, '#5BA4CF') + hut(200, '#E8684A') + hut(330, '#7DB65A') +
        L('M600 520 L640 360', '#7A5232', 8) + P('M540 380 Q640 300 740 380 Z', '#D9443A') + P('M590 380 Q640 330 690 380 Z', '#FFFFFF') + R(560, 520, 120, 14, '#E8684A', 6) + C(520, 540, 22, '#5BA4CF') + C(520, 540, 8, '#FFFFFF'));
    },
    'travel-mountain': function () {
      return svg(sky('tm-s', '#86C5EA', '#E6F5FC') + cloud(560, 80, 0.8) +
        P('M0 380 L160 170 L260 280 L380 120 L520 300 L620 200 L800 360 V600 H0 Z', '#7C93AE') + P('M160 170 L196 218 L176 214 L160 236 L142 214 L124 220 Z', '#FFFFFF') + P('M380 120 L428 184 L404 178 L384 204 L362 180 L334 182 Z', '#FFFFFF') + P('M620 200 L660 246 L640 244 L622 262 L604 244 L586 246 Z', '#FFFFFF') +
        P('M0 400 Q200 330 420 390 T800 370 V600 H0 Z', '#8CC46B') + P('M0 470 Q300 420 800 470 V600 H0 Z', '#74AE52') +
        L('M420 600 Q380 520 470 470 T560 390 T600 340', '#9C9C94', 46) + L('M420 600 Q380 520 470 470 T560 390 T600 340', '#E8E3D2', 4, ' stroke-dasharray="18 18"') +
        pine(120, 470, 1.1) + pine(190, 500, 0.9, '#3E7C55') + pine(700, 450, 1.2) + pine(650, 480, 0.8, '#3E7C55') +
        '<g transform="translate(450 455) rotate(-14)">' + P('M-62 0 Q-58 -40 -20 -46 Q20 -50 44 -20 L62 -16 Q70 -14 70 0 Z', '#4F9DDE') + R(-34, -40, 34, 22, '#D8EEF8', 6) + R(6, -40, 26, 22, '#D8EEF8', 6) + C(-36, 2, 16, '#2B2B2B') + C(40, 2, 16, '#2B2B2B') + C(-36, 2, 6, '#BFBFBF') + C(40, 2, 6, '#BFBFBF') + C(64, -8, 5, '#F6E7B8') + '</g>');
    },
    'childhood-school': function () {
      return svg(R(0, 0, 800, 600, '#EADBC4') + R(0, 430, 800, 170, '#B8875A') + L('M0 470 H800 M0 520 H800 M0 570 H800', '#A57549', 3) +
        R(110, 60, 580, 290, '#8C5A3C', 12) + R(126, 76, 548, 258, '#2F5A48', 6) +
        '<g fill="none" stroke="#F5F2E8" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M180 200 L210 120 L240 200 M192 170 H228"/><path d="M280 120 V200 M280 120 Q330 120 330 140 Q330 160 280 160 Q338 160 338 182 Q338 200 280 200"/><path d="M430 130 Q394 118 386 160 Q394 204 432 192"/><path d="M500 180 h40 M520 160 v40 M580 175 h36 M580 190 h36"/><path d="M640 170 q14 -20 24 0 t24 0" opacity=".6"/></g>' +
        R(140, 334, 520, 12, '#A57549') + R(170, 326, 40, 10, '#FFFFFF', 3) +
        P('M180 420 L620 420 L660 460 L140 460 Z', '#9A6A3E') + R(140, 460, 520, 20, '#7A5232') + R(160, 480, 18, 90, '#5C3D24') + R(622, 480, 18, 90, '#5C3D24') +
        R(240, 400, 130, 46, '#3A3A3A', 6) + R(248, 406, 114, 34, '#4B5A5E', 3) + L('M262 420 h30 M300 420 h20', '#D8D8D8', 3) +
        C(470, 420, 18, '#2F3E8C') + R(462, 398, 16, 10, '#2F3E8C', 2) + L('M480 404 l40 -40', '#C8A060', 4) +
        C(570, 418, 24, '#D9443A') + L('M570 394 q4 -12 12 -14', '#6B4A2E', 4) + P('M572 394 q14 -16 26 -6 q-12 10 -26 6 Z', '#5E9E4B'));
    },
    'childhood-toys': function () {
      return svg(R(0, 0, 800, 600, '#DCEBF2') + stripes(0, 0, 800, 380, 16, '#DCEBF2', '#D2E4EC') + R(0, 380, 800, 220, '#C89B6D') + L('M0 430 H800 M0 490 H800 M0 550 H800', '#B98C5F', 3) +
        '<g transform="translate(220 330)">' + C(-62, -150, 30, '#A8743F') + C(62, -150, 30, '#A8743F') + C(-62, -150, 15, '#E2B888') + C(62, -150, 15, '#E2B888') + E(0, 50, 96, 100, '#B8834A') + E(0, 60, 54, 62, '#E2B888') + E(-96, 0, 30, 46, '#A8743F') + E(96, 0, 30, 46, '#A8743F') + E(-58, 140, 40, 28, '#A8743F') + E(58, 140, 40, 28, '#A8743F') +
        C(0, -100, 82, '#B8834A') + E(0, -70, 34, 26, '#E2B888') + C(-28, -118, 9, '#2B2B2B') + C(28, -118, 9, '#2B2B2B') + E(0, -82, 12, 9, '#4A2E1C') + L('M-14 -60 q14 12 28 0', '#4A2E1C', 4) + P('M-30 -26 L0 -10 L30 -26 L30 6 L0 -10 L-30 6 Z', '#D9443A') + '</g>' +
        '<g transform="translate(520 360)">' + P('M-80 -30 Q0 -100 80 -30 Q40 60 0 110 Q-40 60 -80 -30 Z', '#E8684A') + P('M-80 -30 Q0 -70 80 -30 Q76 -6 70 6 Q0 -40 -70 6 Q-76 -6 -80 -30 Z', '#F2C14E') + P('M-56 30 Q0 0 56 30 Q50 44 44 54 Q0 26 -44 54 Q-50 44 -56 30 Z', '#5BA4CF') + R(-8, -110, 16, 50, '#7A5232', 6) + '</g>' +
        C(640, 520, 22, '#5BA4CF') + C(633, 513, 7, '#FFFFFF', ' opacity=".7"') + C(690, 540, 18, '#E58FB0') + C(684, 534, 6, '#FFFFFF', ' opacity=".7"') + C(600, 556, 16, '#7DB65A') + C(595, 551, 5, '#FFFFFF', ' opacity=".7"') +
        R(380, 470, 70, 70, '#F2C14E', 6) + R(450, 500, 60, 60, '#7DB65A', 6) + '<text x="415" y="522" font-size="46" font-weight="700" fill="#FFFFFF" text-anchor="middle">A</text><text x="480" y="546" font-size="40" font-weight="700" fill="#FFFFFF" text-anchor="middle">B</text>');
    },
    'childhood-bicycle': function () {
      return svg(sky('cb-s', '#9AD2EE', '#E9F6FC') + C(650, 100, 44, '#F6C453') + cloud(180, 100, 0.8) +
        P('M0 320 Q200 280 400 310 T800 300 V600 H0 Z', '#9CCB72') + tree(110, 300, 1.2) + tree(700, 290, 1.1, '#6BAA55', '#579445') + tree(560, 300, 0.8) +
        P('M260 600 Q360 420 400 310 Q440 420 540 600 Z', '#E8D6AE') +
        '<g transform="translate(400 470)">' +
        C(-130, 40, 70, 'none', ' stroke="#2B2B2B" stroke-width="12"') + C(130, 40, 70, 'none', ' stroke="#2B2B2B" stroke-width="12"') + C(-130, 40, 8, '#2B2B2B') + C(130, 40, 8, '#2B2B2B') +
        L('M-130 40 L-40 40 L60 -50 L-70 -50 Z M-40 40 L-80 -70 M130 40 L80 -90', '#C8553D', 12) + L('M-100 -74 h44', '#3A3A3A', 14) + L('M60 -96 h40', '#3A3A3A', 10) +
        P('M70 -110 h66 l-10 40 h-46 Z', '#B8834A', ' stroke="#8C5A3C" stroke-width="5"') + C(90, -116, 12, '#E58FB0') + C(112, -120, 12, '#F2C14E') + '</g>');
    },
    'work-baker': function () {
      function loaf(x, y) { return E(x, y, 34, 22, '#C9862F') + L('M' + (x - 14) + ' ' + (y - 8) + ' l8 12 M' + x + ' ' + (y - 12) + ' l8 12 M' + (x + 14) + ' ' + (y - 8) + ' l6 10', '#E8B35E', 4); }
      return svg(R(0, 0, 800, 600, '#F1E6D2') + tiles(800, 300, 60, 40, '#EADCC2', 30) +
        P('M60 420 V230 Q60 110 200 110 Q340 110 340 230 V420 Z', '#B5652A') + P('M100 420 V250 Q100 160 200 160 Q300 160 300 250 V420 Z', '#3A2418') + P('M120 420 Q140 330 200 300 Q260 330 280 420 Z', '#F59E0B') + P('M150 420 Q170 360 200 340 Q230 360 250 420 Z', '#F6C453') +
        R(380, 120, 360, 14, '#8C5A3C', 4) + R(380, 240, 360, 14, '#8C5A3C', 4) + loaf(430, 98) + loaf(510, 98) + loaf(590, 98) + loaf(670, 98) +
        '<g transform="rotate(-6 560 210)">' + R(400, 200, 300, 26, '#D69A45', 13) + L('M440 206 l14 14 M500 206 l14 14 M560 206 l14 14 M620 206 l14 14', '#F0C77E', 4) + '</g><g transform="rotate(4 560 228)">' + R(410, 216, 290, 24, '#C9862F', 12) + '</g>' +
        R(0, 420, 800, 180, '#9A6A3E') + R(0, 420, 800, 24, '#7A5232') +
        P('M480 560 Q470 470 520 450 Q580 440 600 470 Q630 540 610 560 Z', '#EFE7D6') + L('M545 548 V492', '#C9954A', 5) + E(533, 500, 9, 5, '#C9954A', ' transform="rotate(-35 533 500)"') + E(557, 500, 9, 5, '#C9954A', ' transform="rotate(35 557 500)"') + E(533, 516, 9, 5, '#C9954A', ' transform="rotate(-35 533 516)"') + E(557, 516, 9, 5, '#C9954A', ' transform="rotate(35 557 516)"') + E(545, 486, 5, 9, '#C9954A') +
        loaf(160, 500) + loaf(250, 520) + loaf(360, 500));
    },
    'work-sewing': function () {
      var spools = [['#D9443A', 520], ['#5BA4CF', 590], ['#F2C14E', 660]].map(function (s) { return R(s[1] - 18, 300, 36, 12, '#C8A060', 3) + R(s[1] - 14, 312, 28, 46, s[0]) + R(s[1] - 18, 358, 36, 12, '#C8A060', 3); }).join('');
      return svg(R(0, 0, 800, 600, '#E4EDE6') + stripes(0, 0, 800, 380, 10, '#E4EDE6', '#DCE7DF') + R(0, 370, 800, 230, '#9A6A3E') + R(0, 370, 800, 20, '#7A5232') +
        P('M0 470 Q200 420 360 470 T800 450 V600 H0 Z', '#C85A7A') + P('M0 520 Q240 480 420 530 T800 510 V600 H0 Z', '#A9446A') +
        '<g transform="translate(80 120)">' + P('M20 250 V140 Q20 60 110 60 H330 Q380 60 380 110 V200 H330 V120 Q330 110 320 110 H120 Q80 110 80 150 V250 Z', '#1F2A2E') + R(0, 250, 400, 20, '#1F2A2E', 6) + R(330, 200, 50, 50, '#1F2A2E') +
        L('M110 88 H320', '#D9B45A', 6) + L('M40 230 V150', '#D9B45A', 4) + R(345, 230, 20, 30, '#BFBFBF') + L('M355 260 v14', '#BFBFBF', 4) + C(390, 140, 26, 'none', ' stroke="#D9B45A" stroke-width="7"') + C(390, 140, 6, '#D9B45A') + '</g>' +
        spools + '<g transform="translate(560 430) rotate(-20)">' + L('M0 0 L90 -10 M0 0 L86 18', '#8A9AA4', 9) + C(-14, -10, 14, 'none', ' stroke="#D9443A" stroke-width="7"') + C(-14, 16, 14, 'none', ' stroke="#D9443A" stroke-width="7"') + '</g>' +
        L('M120 420 q60 30 140 0 t140 10', '#F2C14E', 10) + L('M140 420 v12 M170 432 v10 M200 436 v12 M230 432 v10', '#3A3A3A', 3));
    },
    'work-fields': function () {
      var rows = '';
      for (var i = 0; i < 9; i++) rows += L('M' + (i * 110 - 100) + ' 600 Q' + (i * 90) + ' 420 ' + (i * 100 + 20) + ' 300', '#D4AE45', 6);
      return svg(sky('wf-s', '#8FCDEE', '#EAF7FD') + C(150, 110, 46, '#F6C453') + cloud(500, 90, 1) +
        P('M0 300 Q300 250 800 290 V600 H0 Z', '#E5C25A') + rows +
        R(560, 210, 110, 80, '#D6573D') + P('M550 212 L615 160 L680 212 Z', '#8C3A2A') + R(600, 240, 30, 50, '#FFFFFF') +
        E(180, 380, 50, 40, '#C99A3E') + E(180, 380, 26, 22, '#B5862E') + E(280, 350, 40, 32, '#C99A3E') + E(280, 350, 20, 17, '#B5862E') +
        '<g transform="translate(470 470)">' + R(-150, -60, 170, 60, '#C8352B', 10) + R(-10, -130, 110, 130, '#C8352B', 12) + R(6, -116, 78, 60, '#CFE9F4', 6) + R(-130, -100, 18, 44, '#3A3A3A', 4) +
        C(-110, 20, 44, '#2B2B2B') + C(-110, 20, 18, '#E8A21C') + C(60, 0, 74, '#2B2B2B') + C(60, 0, 30, '#E8A21C') + L('M-150 -20 H-20', '#8C2A20', 6) + '</g>');
    },
    'animals-cat': function () {
      return svg(R(0, 0, 800, 600, '#E9DCEB') + R(140, 60, 520, 380, '#FFFFFF', 10) + lg('ac-s', '#9ED3F0', '#E3F4FB') + R(160, 80, 480, 340, 'url(#ac-s)') + tree(260, 360, 1.2) + cloud(430, 130, 0.8) + R(396, 80, 8, 340, '#FFFFFF') +
        R(110, 430, 580, 34, '#F7F3EC', 6) + R(0, 464, 800, 136, '#C9B49A') +
        P('M140 50 h70 q-20 200 10 380 h-80 Z', '#7A6FB3') + P('M660 50 h-70 q20 200 -10 380 h80 Z', '#7A6FB3') + R(120, 40, 560, 14, '#8C5A3C', 7) +
        '<g transform="translate(470 330)">' + L('M60 90 Q130 90 110 10', '#E8963E', 22) + E(0, 60, 74, 50, '#E8963E') + C(0, -10, 50, '#E8963E') + P('M-44 -36 L-36 -84 L-8 -52 Z', '#E8963E') + P('M44 -36 L36 -84 L8 -52 Z', '#E8963E') + P('M-34 -46 L-32 -70 L-16 -52 Z', '#F2B8A0') + P('M34 -46 L32 -70 L16 -52 Z', '#F2B8A0') +
        E(-18, -14, 7, 10, '#2F4F2F') + E(18, -14, 7, 10, '#2F4F2F') + P('M-6 4 h12 l-6 7 Z', '#C8553D') + L('M-30 8 h-30 M-30 14 l-28 8 M30 8 h30 M30 14 l28 8', '#8C5A3C', 2) + L('M-40 40 q40 20 80 0', '#D07A2C', 6) + '</g>' +
        R(220, 360, 80, 70, '#C8553D', 6) + R(212, 352, 96, 18, '#B5473A', 4) + L('M250 352 v-16 M266 352 v-24', '#4E8A3E', 5) + C(240, 330, 20, '#D9443A') + C(270, 318, 20, '#E8684A') + C(260, 300, 16, '#D9443A'));
    },
    'animals-dog': function () {
      var pickets = '';
      for (var x = 10; x < 800; x += 50) pickets += R(x, 250, 18, 90, '#FFFFFF', 6);
      return svg(sky('ad-s', '#9AD2EE', '#EAF7FC') + cloud(520, 90, 0.9) + P('M0 330 Q300 290 800 330 V600 H0 Z', '#8CC46B') +
        pickets + R(0, 270, 800, 10, '#FFFFFF') + R(0, 305, 800, 10, '#FFFFFF') +
        R(70, 300, 200, 160, '#C8553D') + P('M50 304 L170 210 L290 304 Z', '#8C3A2A') + P('M130 460 V380 Q170 340 210 380 V460 Z', '#3A2418') +
        '<g transform="translate(470 420)">' + L('M70 60 Q120 30 110 -10', '#C9954A', 18) + E(0, 40, 80, 70, '#C9954A') + E(0, 60, 40, 46, '#F5EBD8') + E(-40, 106, 26, 16, '#C9954A') + E(40, 106, 26, 16, '#C9954A') +
        C(0, -60, 62, '#C9954A') + E(-56, -60, 22, 44, '#8C5A3C', ' transform="rotate(16 -56 -60)"') + E(56, -60, 22, 44, '#8C5A3C', ' transform="rotate(-16 56 -60)"') + E(0, -36, 34, 26, '#F5EBD8') + C(-22, -74, 8, '#2B2B2B') + C(22, -74, 8, '#2B2B2B') + E(0, -48, 12, 9, '#2B2B2B') + P('M-8 -26 q8 26 16 0 Z', '#E8684A') + R(-40, -12, 80, 12, '#D9443A', 6) + C(0, 4, 8, '#F2C14E') + '</g>' +
        C(640, 520, 32, '#D9443A') + L('M612 508 q28 18 56 0', '#FFFFFF', 5));
    },
    'animals-farm': function () {
      var fence = '';
      for (var x = 380; x < 800; x += 60) fence += R(x, 330, 14, 90, '#9A6A3E', 3);
      return svg(sky('af-s', '#A6D8F0', '#EEF8FC') + C(680, 90, 40, '#F6C453') + P('M0 330 Q400 300 800 330 V600 H0 Z', '#B9D47E') + R(0, 420, 800, 180, '#D8BE8C') +
        R(60, 170, 280, 230, '#B5473A') + P('M40 176 L200 70 L360 176 Z', '#7A2E25') + R(140, 260, 120, 140, '#F5EBD8') + L('M140 260 L260 400 M260 260 L140 400', '#B5473A', 10) + R(170, 120, 60, 44, '#F5EBD8') +
        fence + R(370, 350, 430, 12, '#9A6A3E') + R(370, 390, 430, 12, '#9A6A3E') +
        hen(230, 500, 1.2) + hen(470, 480, 1, '#C9772F') +
        '<g transform="translate(610 500)">' + P('M-40 -6 Q-90 -60 -60 -90 Q-40 -40 -10 -30 Z', '#2F6B4A') + P('M-40 -10 Q-70 -80 -30 -96 Q-30 -40 -6 -30 Z', '#1F4F7A') + E(0, 0, 46, 34, '#B5473A') + C(36, -32, 20, '#E8A21C') + P('M28 -54 q6 -14 12 0 q6 -14 12 2 q4 -10 8 4 Z', '#D9443A') + P('M54 -32 l16 4 l-16 6 Z', '#F2C14E') + C(40, -36, 3, '#2B2B2B') + E(44, -14, 6, 10, '#D9443A') + L('M-6 32 v18 M10 32 v18', '#E8A21C', 5) + '</g>' +
        C(350, 540, 14, '#F6D65A') + C(380, 552, 12, '#F6D65A') + C(358, 536, 3, '#2B2B2B') + C(386, 548, 3, '#2B2B2B'));
    },
    'feast-christmas': function () {
      var baubles = [[400, 190, '#D9443A'], [360, 270, '#F2C14E'], [450, 300, '#5BA4CF'], [320, 380, '#E58FB0'], [480, 390, '#D9443A'], [400, 360, '#F2C14E'], [430, 230, '#E58FB0']].map(function (b) { return C(b[0], b[1], 14, b[2]) + C(b[0] - 4, b[1] - 4, 4, '#FFFFFF', ' opacity=".7"'); }).join('');
      return svg(R(0, 0, 800, 600, '#203A4C') + C(120, 90, 3, '#FFFFFF') + C(220, 60, 2, '#FFFFFF') + C(650, 70, 3, '#FFFFFF') + C(720, 160, 2, '#FFFFFF') + C(560, 40, 2, '#FFFFFF') +
        windowBox(560, 110, 170, 190, '#E9DCC8', '#2E4F66') + C(610, 170, 4, '#FFFFFF') + C(680, 200, 5, '#FFFFFF') + C(640, 250, 4, '#FFFFFF') + R(566, 270, 158, 24, '#FFFFFF', 4) +
        R(0, 470, 800, 130, '#8C5A3C') + R(0, 470, 800, 14, '#6B4226') +
        R(386, 430, 28, 50, '#6B4226') + P('M400 110 L470 230 L440 230 L500 330 L462 330 L530 440 L270 440 L338 330 L300 330 L360 230 L330 230 Z', '#2F7A4A') + P('M400 110 L470 230 L440 230 L500 330 L462 330 L530 440 L400 440 Z', '#286B40') +
        L('M350 230 Q400 260 452 228 M320 330 Q400 370 486 326', '#F2C14E', 5) + baubles + P('M400 70 l12 26 l28 3 l-21 19 l6 28 l-25 -14 l-25 14 l6 -28 l-21 -19 l28 -3 Z', '#F6C453') +
        R(200, 440, 110, 90, '#D9443A', 6) + R(248, 440, 14, 90, '#F2C14E') + R(200, 474, 110, 14, '#F2C14E') + L('M255 440 q-30 -30 -40 0 M255 440 q30 -30 40 0', '#F2C14E', 6) +
        R(500, 460, 120, 70, '#5BA4CF', 6) + R(553, 460, 14, 70, '#FFFFFF') + R(500, 488, 120, 12, '#FFFFFF') + R(130, 480, 60, 50, '#7DB65A', 5) + R(155, 480, 10, 50, '#FFFFFF'));
    },
    'feast-fair': function () {
      var bulbs = '', horses = '';
      for (var i = 0; i < 14; i++) bulbs += C(40 + i * 56, 64 + Math.round(Math.sin(i) * 10), 9, ['#F6C453', '#E8684A', '#7DD3C0', '#E58FB0'][i % 4]);
      [[300, '#FFFFFF'], [400, '#F2C14E'], [500, '#E58FB0']].forEach(function (h, k) {
        var y = 380 + (k % 2 ? -26 : 0);
        horses += L('M' + h[0] + ' 250 V' + (y + 70), '#D9B45A', 6) + '<g transform="translate(' + h[0] + ' ' + y + ')">' + L('M-24 14 l-8 34 M-10 16 l-2 34 M14 16 l6 32 M28 12 l12 30', h[1], 7) + E(0, 0, 40, 20, h[1]) + P('M30 -10 L52 -40 L62 -34 L48 -6 Z', h[1]) + P('M48 -40 l14 -2 l-6 14 Z', '#8C5A3C') + L('M-40 -4 q-20 10 -16 30', '#8C5A3C', 6) + R(-14, -24, 26, 10, '#D9443A', 4) + '</g>';
      });
      return svg(sky('ff-s', '#1E2A52', '#3A3F78') + L('M0 50 Q100 90 200 60 T400 60 T600 60 T800 50', '#11162E', 3) + bulbs +
        R(0, 500, 800, 100, '#2C2F4A') +
        P('M220 250 L400 140 L580 250 Z', '#D9443A') + P('M220 250 L250 250 L400 140 Z', '#FFFFFF') + P('M310 250 L340 250 L400 140 Z', '#FFFFFF') + P('M430 250 L460 250 L400 140 Z', '#FFFFFF') + P('M520 250 L550 250 L400 140 Z', '#FFFFFF') +
        scallop(220, 250, 360, 9, '#F2C14E') + R(392, 110, 16, 34, '#D9B45A') + C(400, 108, 12, '#F6C453') + R(392, 250, 16, 220, '#D9B45A') +
        horses + E(400, 500, 210, 24, '#5B2A22') + E(400, 470, 210, 34, '#7A5232') + E(400, 462, 200, 26, '#B5473A'));
    },
    'feast-fireworks': function () {
      var city = '';
      [[0, 90, 120], [90, 70, 170], [160, 110, 110], [270, 80, 200], [350, 120, 130], [470, 90, 180], [560, 100, 120], [660, 140, 160]].forEach(function (b) {
        city += R(b[0], 520 - b[2], b[1], b[2], '#1A2238');
        for (var y = 540 - b[2]; y < 500; y += 32) for (var x = b[0] + 14; x < b[0] + b[1] - 14; x += 26) if ((x + y) % 3) city += R(x, y, 10, 14, '#F6D88A', 1, ' opacity=".8"');
      });
      return svg(sky('fw-s', '#0E1430', '#2A2F63') + burst(200, 150, 90, '#F6C453') + burst(470, 110, 70, '#E58FB0') + burst(640, 200, 80, '#7DD3C0') + burst(350, 250, 50, '#E8684A') +
        C(100, 60, 2, '#FFFFFF') + C(560, 40, 2, '#FFFFFF') + C(740, 80, 2, '#FFFFFF') + city +
        R(0, 520, 800, 80, '#18234A') + L('M60 540 h60 M200 560 h80 M420 545 h50 M600 565 h90', '#F6C453', 4, ' opacity=".6"') + L('M150 580 h40 M500 585 h60', '#E58FB0', 4, ' opacity=".5"'));
    },
    'town-market': function () {
      function stall(x, c) {
        return R(x + 10, 360, 8, 150, '#7A5232') + R(x + 172, 360, 8, 150, '#7A5232') + stripes(x, 300, 190, 70, 7, '#FFFFFF', c) + scallop(x, 370, 190, 7, c) +
          R(x, 440, 190, 70, '#B8834A', 4) + L('M' + x + ' 470 h190', '#9A6A3E', 4);
      }
      var cobbles = '';
      for (var y = 420; y < 600; y += 30) for (var x = (y / 30) % 2 ? 0 : 30; x < 800; x += 60) cobbles += R(x, y, 56, 26, '#C2B8A8', 4);
      return svg(sky('tk-s', '#9AD2EE', '#EAF7FC') + cloud(600, 70, 0.8) +
        house(20, 170, 150, 230, '#F2C9A0', '#B5473A') + house(180, 140, 140, 260, '#C9DDE8', '#5C6E7A') + house(330, 180, 150, 220, '#F5E2A8', '#B5652A') + house(490, 150, 140, 250, '#E8B9B0', '#8C3A2A') + house(640, 175, 160, 225, '#D6E5C3', '#5E7A4A') +
        R(0, 400, 800, 200, '#CFC6B8') + cobbles +
        stall(40, '#D9443A') + stall(300, '#2E86AB') + stall(560, '#5E9E4B') +
        C(80, 430, 16, '#D9443A') + C(110, 430, 16, '#E8684A') + C(140, 430, 16, '#D9443A') + C(95, 412, 16, '#E8684A') + E(180, 432, 22, 14, '#F2C14E') +
        C(350, 432, 14, '#7DB65A') + C(380, 432, 14, '#7DB65A') + E(430, 430, 30, 16, '#E8A21C') + C(460, 432, 14, '#7DB65A') +
        E(610, 430, 26, 16, '#F6E7B8') + E(660, 430, 26, 16, '#F6E7B8') + C(710, 430, 14, '#9C5BB5') + C(730, 426, 14, '#9C5BB5'));
    },
    'town-tram': function () {
      return svg(sky('tr-s', '#B5DDF1', '#F0F9FD') + L('M0 80 H800', '#3A3A3A', 3) +
        house(-10, 170, 180, 240, '#E8D2B0', '#8C3A2A') + house(560, 160, 250, 250, '#C9D6E2', '#4F5F6B') + house(170, 200, 120, 210, '#F2C9A0', '#B5473A') +
        R(0, 410, 800, 190, '#9C9A94') + R(0, 410, 800, 20, '#C9C5BC') + L('M0 520 H800 M0 560 H800', '#6E6C66', 6) +
        L('M420 80 L380 170 M420 80 L460 170 M380 170 H460', '#2B2B2B', 5) +
        '<g transform="translate(250 170)">' + R(0, 0, 360, 330, '#F3E9C8', 26) + R(0, 210, 360, 94, '#C8352B') + P('M0 300 V304 Q0 330 26 330 H334 Q360 330 360 304 V300 Z', '#C8352B') +
        R(24, 40, 70, 110, '#BFE3F2', 10) + R(110, 40, 70, 110, '#BFE3F2', 10) + R(196, 40, 70, 110, '#BFE3F2', 10) + R(282, 40, 54, 150, '#BFE3F2', 10) + R(20, 176, 250, 18, '#E8D6A6', 4) +
        '<text x="140" y="268" font-size="44" font-weight="700" fill="#FFFFFF" text-anchor="middle">12</text>' + R(0, 0, 360, 22, '#C8352B', 11) + '</g>' +
        C(320, 516, 26, '#2B2B2B') + C(540, 516, 26, '#2B2B2B') + C(320, 516, 9, '#9C9A94') + C(540, 516, 9, '#9C9A94') +
        L('M700 410 V240', '#2F3E46', 10) + R(680, 210, 40, 40, '#2F3E46', 8) + C(700, 236, 12, '#F6D88A'));
    },
    'town-cafe': function () {
      function table(x) { return L('M' + x + ' 470 V560 M' + (x - 26) + ' 562 h52', '#2F3E46', 6) + E(x, 470, 54, 14, '#F5F2EA') + R(x - 16, 448, 20, 16, '#FFFFFF', 4) + E(x - 6, 466, 16, 4, '#FFFFFF') + R(x + 14, 450, 14, 14, '#C9772F', 3); }
      function chair(x, flip) { var k = flip ? -1 : 1; return L('M' + x + ' 470 v90 M' + (x + 30 * k) + ' 500 v60 M' + x + ' 500 h' + (30 * k) + ' M' + x + ' 470 q' + (-8 * k) + ' -40 ' + (6 * k) + ' -60', '#2F3E46', 6); }
      return svg(R(0, 0, 800, 600, '#E9D7B8') + R(0, 0, 800, 420, '#D9A066') + tiles(800, 420, 80, 30, '#D09458', 40) +
        R(70, 170, 300, 200, '#3A2A1E', 8) + R(84, 184, 272, 172, '#F6D88A', 4) + R(430, 170, 300, 200, '#3A2A1E', 8) + R(444, 184, 272, 172, '#F6D88A', 4) + R(218, 184, 4, 172, '#3A2A1E') + R(578, 184, 4, 172, '#3A2A1E') +
        R(300, 14, 200, 60, '#2F5A48', 8) + '<text x="400" y="58" font-size="40" font-weight="700" fill="#F6E7B8" text-anchor="middle">CAFÉ</text>' +
        stripes(40, 90, 720, 60, 12, '#C8352B', '#FFFFFF') + scallop(40, 150, 720, 12, '#C8352B') +
        R(0, 420, 800, 180, '#BDB3A3') + chair(120, false) + chair(280, true) + table(200) + chair(480, false) + chair(640, true) + table(560) +
        R(740, 370, 40, 50, '#B5652A', 4) + C(760, 350, 26, '#5E9E4B') + R(20, 370, 40, 50, '#B5652A', 4) + C(40, 350, 26, '#5E9E4B'));
    }
  };

  /* The told story of each generic card (1.16), written in-house in the style of the memory
     postcards: an image to imagine, then "perhaps you remember…". Never sad, never a test. */
  var STORIES = {
    'family-lunch': { en: 'Imagine a long table on a Sunday. A good smell comes from the kitchen, the bread is fresh and everyone takes a seat. Perhaps you remember a favourite dish, or the voices around the table.',
      fr: 'Imaginez une grande table un dimanche. Une bonne odeur vient de la cuisine, le pain est frais et chacun prend sa place. Vous vous souvenez peut-être d’un plat préféré, ou des voix autour de la table.',
      de: 'Stellen Sie sich einen langen Tisch an einem Sonntag vor. Aus der Küche duftet es, das Brot ist frisch, und alle nehmen Platz. Vielleicht erinnern Sie sich an ein Lieblingsgericht oder an die Stimmen am Tisch.' },
    'family-picnic': { en: 'Picture a blanket spread out on the grass. There is a basket with sandwiches, fruit and something cool to drink. Perhaps you remember the shade of a big tree and a quiet afternoon outdoors.',
      fr: 'Imaginez une couverture étendue dans l’herbe. Il y a un panier avec des sandwichs, des fruits et une boisson fraîche. Vous vous souvenez peut-être de l’ombre d’un grand arbre et d’un après-midi tranquille au grand air.',
      de: 'Stellen Sie sich eine Decke im Gras vor. Im Korb liegen belegte Brote, Obst und etwas Kühles zu trinken. Vielleicht erinnern Sie sich an den Schatten eines großen Baumes und an einen ruhigen Nachmittag im Freien.' },
    'family-wedding': { en: 'Imagine a tall white cake with flowers and ribbons. The guests are dressed up, there is music, and everyone is smiling. Perhaps you remember a beautiful celebration and the dance that followed.',
      fr: 'Imaginez un grand gâteau blanc décoré de fleurs et de rubans. Les invités sont élégants, il y a de la musique et tout le monde sourit. Vous vous souvenez peut-être d’une belle fête et de la danse qui a suivi.',
      de: 'Stellen Sie sich eine hohe weiße Torte mit Blumen und Schleifen vor. Die Gäste sind festlich gekleidet, es gibt Musik, und alle lächeln. Vielleicht erinnern Sie sich an ein schönes Fest und an den Tanz danach.' },
    'travel-train': { en: 'Picture an old steam train leaving the station. The whistle blows, white smoke rises, and the landscape rolls past the window. Perhaps you remember a journey and the sound of the wheels on the rails.',
      fr: 'Imaginez un vieux train à vapeur qui quitte la gare. Le sifflet retentit, la fumée blanche monte et le paysage défile derrière la fenêtre. Vous vous souvenez peut-être d’un voyage et du bruit des roues sur les rails.',
      de: 'Stellen Sie sich eine alte Dampflok vor, die den Bahnhof verlässt. Die Pfeife ertönt, weißer Dampf steigt auf, und die Landschaft zieht am Fenster vorbei. Vielleicht erinnern Sie sich an eine Reise und an das Rattern der Räder.' },
    'travel-sea': { en: 'Imagine colourful beach huts on the sand. A small sailing boat glides on the water and the umbrella gives a little shade. Perhaps you remember a summer holiday and an ice cream by the sea.',
      fr: 'Imaginez des cabines de plage colorées sur le sable. Un petit voilier glisse sur l’eau et le parasol donne un peu d’ombre. Vous vous souvenez peut-être de vacances d’été et d’une glace au bord de la mer.',
      de: 'Stellen Sie sich bunte Strandhäuschen im Sand vor. Ein kleines Segelboot gleitet über das Wasser, und der Sonnenschirm spendet etwas Schatten. Vielleicht erinnern Sie sich an einen Sommerurlaub und an ein Eis am Meer.' },
    'travel-mountain': { en: 'Picture a small car on a winding mountain road. The peaks are white with snow and the pine trees smell fresh. Perhaps you remember a trip with a beautiful view at every bend.',
      fr: 'Imaginez une petite voiture sur une route de montagne pleine de virages. Les sommets sont blancs de neige et les sapins sentent bon. Vous vous souvenez peut-être d’une excursion avec une belle vue à chaque virage.',
      de: 'Stellen Sie sich ein kleines Auto auf einer kurvigen Bergstraße vor. Die Gipfel sind schneeweiß, und die Tannen duften frisch. Vielleicht erinnern Sie sich an einen Ausflug mit einer schönen Aussicht in jeder Kurve.' },
    'childhood-school': { en: 'Imagine a classroom of long ago. The letters are written in chalk on the blackboard, with an inkwell and a slate on the desk. Perhaps you remember your first days at school or a song you learned there.',
      fr: 'Imaginez une salle de classe d’autrefois. Les lettres sont écrites à la craie au tableau, avec un encrier et une ardoise sur le pupitre. Vous vous souvenez peut-être de vos premiers jours d’école ou d’une chanson apprise en classe.',
      de: 'Stellen Sie sich ein Klassenzimmer von früher vor. Die Buchstaben stehen mit Kreide an der Tafel, auf dem Pult liegen Tintenfass und Schiefertafel. Vielleicht erinnern Sie sich an Ihre ersten Schultage oder an ein Lied aus der Schule.' },
    'childhood-toys': { en: 'Picture a teddy bear, a spinning top and a few shiny marbles. Toys like these could keep a child busy for hours. Perhaps you remember a favourite toy and the games you played with it.',
      fr: 'Imaginez un ours en peluche, une toupie et quelques billes brillantes. Ces jouets pouvaient occuper un enfant pendant des heures. Vous vous souvenez peut-être d’un jouet préféré et des jeux qui allaient avec.',
      de: 'Stellen Sie sich einen Teddybären, einen Kreisel und ein paar glänzende Murmeln vor. Mit solchem Spielzeug konnte ein Kind stundenlang spielen. Vielleicht erinnern Sie sich an ein Lieblingsspielzeug und die Spiele damit.' },
    'childhood-bicycle': { en: 'Imagine a red bicycle with a little basket of flowers. The path goes between the trees and the wind is soft. Perhaps you remember learning to ride, and the joy of going a little faster.',
      fr: 'Imaginez un vélo rouge avec un petit panier de fleurs. Le chemin passe entre les arbres et le vent est doux. Vous vous souvenez peut-être d’avoir appris à pédaler, et de la joie d’aller un peu plus vite.',
      de: 'Stellen Sie sich ein rotes Fahrrad mit einem kleinen Blumenkorb vor. Der Weg führt zwischen den Bäumen hindurch, und der Wind ist sanft. Vielleicht erinnern Sie sich, wie Sie Radfahren gelernt haben, und an die Freude, etwas schneller zu fahren.' },
    'work-baker': { en: 'Picture the baker’s shop early in the morning. The oven is warm, the loaves are golden and the whole street smells of fresh bread. Perhaps you remember buying bread on your way home.',
      fr: 'Imaginez la boulangerie tôt le matin. Le four est chaud, les pains sont dorés et toute la rue sent le pain frais. Vous vous souvenez peut-être d’acheter le pain en rentrant à la maison.',
      de: 'Stellen Sie sich die Bäckerei am frühen Morgen vor. Der Ofen ist warm, die Brote sind goldbraun, und die ganze Straße duftet nach frischem Brot. Vielleicht erinnern Sie sich, wie Sie auf dem Heimweg Brot gekauft haben.' },
    'work-sewing': { en: 'Imagine a black sewing machine with golden lines. Next to it are spools of thread in many colours and a pair of scissors. Perhaps you remember the sound of the machine and a piece of clothing made at home.',
      fr: 'Imaginez une machine à coudre noire aux lignes dorées. À côté, des bobines de fil de toutes les couleurs et une paire de ciseaux. Vous vous souvenez peut-être du bruit de la machine et d’un vêtement fait à la maison.',
      de: 'Stellen Sie sich eine schwarze Nähmaschine mit goldenen Linien vor. Daneben liegen Garnrollen in vielen Farben und eine Schere. Vielleicht erinnern Sie sich an das Surren der Maschine und an ein selbst genähtes Kleidungsstück.' },
    'work-fields': { en: 'Picture a golden field at harvest time. A red tractor is working and round bales of hay lie in the sun. Perhaps you remember the smell of the hay and the long summer evenings.',
      fr: 'Imaginez un champ doré au temps de la moisson. Un tracteur rouge travaille et des bottes de foin rondes sèchent au soleil. Vous vous souvenez peut-être de l’odeur du foin et des longues soirées d’été.',
      de: 'Stellen Sie sich ein goldenes Feld zur Erntezeit vor. Ein roter Traktor ist bei der Arbeit, und runde Heuballen liegen in der Sonne. Vielleicht erinnern Sie sich an den Duft von Heu und an lange Sommerabende.' },
    'animals-cat': { en: 'Imagine a ginger cat sitting by the window. It watches the garden, warm in the sun, and its tail moves slowly. Perhaps you remember a cat that liked to sit on your lap.',
      fr: 'Imaginez un chat roux assis près de la fenêtre. Il regarde le jardin, bien au chaud au soleil, et sa queue bouge doucement. Vous vous souvenez peut-être d’un chat qui aimait s’installer sur vos genoux.',
      de: 'Stellen Sie sich eine rote Katze am Fenster vor. Sie schaut in den Garten, schön warm in der Sonne, und ihr Schwanz bewegt sich langsam. Vielleicht erinnern Sie sich an eine Katze, die gern auf Ihrem Schoß saß.' },
    'animals-dog': { en: 'Picture a friendly dog in the garden, with a red ball at its feet. It waits happily for someone to throw the ball. Perhaps you remember a dog and the walks you took together.',
      fr: 'Imaginez un gentil chien dans le jardin, avec une balle rouge à ses pieds. Il attend joyeusement qu’on lui lance la balle. Vous vous souvenez peut-être d’un chien et de vos promenades ensemble.',
      de: 'Stellen Sie sich einen freundlichen Hund im Garten vor, mit einem roten Ball zu seinen Füßen. Er wartet fröhlich darauf, dass jemand den Ball wirft. Vielleicht erinnern Sie sich an einen Hund und an gemeinsame Spaziergänge.' },
    'animals-farm': { en: 'Imagine a farmyard in the morning. The hens are busy, the rooster stands proudly and little chicks follow their mother. Perhaps you remember collecting fresh eggs or the sounds of a farm.',
      fr: 'Imaginez une basse-cour le matin. Les poules s’affairent, le coq se tient fièrement et les poussins suivent leur mère. Vous vous souvenez peut-être d’avoir ramassé des œufs frais, ou des bruits de la ferme.',
      de: 'Stellen Sie sich einen Hühnerhof am Morgen vor. Die Hühner sind fleißig, der Hahn steht stolz da, und die Küken laufen ihrer Mutter nach. Vielleicht erinnern Sie sich ans Eiersammeln oder an die Geräusche auf dem Hof.' },
    'feast-christmas': { en: 'Picture a Christmas tree with a golden star and shiny baubles. Presents wait under the branches and snow falls outside. Perhaps you remember a Christmas song or a special treat.',
      fr: 'Imaginez un sapin de Noël avec une étoile dorée et des boules brillantes. Les cadeaux attendent sous les branches et la neige tombe dehors. Vous vous souvenez peut-être d’un chant de Noël ou d’une gourmandise de fête.',
      de: 'Stellen Sie sich einen Weihnachtsbaum mit goldenem Stern und glänzenden Kugeln vor. Unter den Zweigen warten Geschenke, und draußen fällt Schnee. Vielleicht erinnern Sie sich an ein Weihnachtslied oder an eine besondere Leckerei.' },
    'feast-fair': { en: 'Imagine a merry-go-round at the fair, with painted horses and little lights. There is music and a sweet smell in the air. Perhaps you remember a ride, a prize or some candy floss.',
      fr: 'Imaginez un manège à la fête foraine, avec des chevaux peints et de petites lumières. Il y a de la musique et une odeur sucrée dans l’air. Vous vous souvenez peut-être d’un tour de manège, d’un lot gagné ou d’une barbe à papa.',
      de: 'Stellen Sie sich ein Karussell auf dem Jahrmarkt vor, mit bemalten Pferden und kleinen Lichtern. Es gibt Musik, und in der Luft liegt ein süßer Duft. Vielleicht erinnern Sie sich an eine Karussellfahrt, einen Gewinn oder an Zuckerwatte.' },
    'feast-fireworks': { en: 'Picture fireworks over the town at night. Bright flowers of light open in the sky, gold, pink and green. Perhaps you remember a summer festival or a New Year’s Eve.',
      fr: 'Imaginez un feu d’artifice au-dessus de la ville, la nuit. Des fleurs de lumière s’ouvrent dans le ciel, dorées, roses et vertes. Vous vous souvenez peut-être d’une fête d’été ou d’un soir de réveillon.',
      de: 'Stellen Sie sich ein Feuerwerk über der Stadt in der Nacht vor. Leuchtende Blumen öffnen sich am Himmel, golden, rosa und grün. Vielleicht erinnern Sie sich an ein Sommerfest oder an eine Silvesternacht.' },
    'town-market': { en: 'Imagine the square on market day. The stalls have striped awnings and the crates are full of fruit and vegetables. Perhaps you remember a stallholder you knew, or something you liked to buy.',
      fr: 'Imaginez la place un jour de marché. Les étals ont des auvents rayés et les cagettes sont pleines de fruits et de légumes. Vous vous souvenez peut-être d’un marchand que vous connaissiez, ou de ce que vous aimiez acheter.',
      de: 'Stellen Sie sich den Marktplatz am Markttag vor. Die Stände haben gestreifte Markisen, und die Kisten sind voller Obst und Gemüse. Vielleicht erinnern Sie sich an einen Händler, den Sie kannten, oder an etwas, das Sie gern gekauft haben.' },
    'town-tram': { en: 'Picture an old tram rolling down the street. The bell rings and passengers wave from the windows. Perhaps you remember a ride into town and the stop where you got off.',
      fr: 'Imaginez un vieux tramway qui roule dans la rue. La cloche sonne et les passagers font signe par les fenêtres. Vous vous souvenez peut-être d’un trajet en ville et de l’arrêt où vous descendiez.',
      de: 'Stellen Sie sich eine alte Straßenbahn vor, die durch die Straße fährt. Die Glocke klingelt, und die Fahrgäste winken aus den Fenstern. Vielleicht erinnern Sie sich an eine Fahrt in die Stadt und an Ihre Haltestelle.' },
    'town-cafe': { en: 'Imagine a café terrace with a red and white awning. Small round tables wait in the sun, with a cup of coffee and a slice of cake. Perhaps you remember a café you liked and the people passing by.',
      fr: 'Imaginez une terrasse de café avec un auvent rouge et blanc. De petites tables rondes attendent au soleil, avec une tasse de café et une part de gâteau. Vous vous souvenez peut-être d’un café que vous aimiez et des passants dans la rue.',
      de: 'Stellen Sie sich ein Straßencafé mit rot-weißer Markise vor. Kleine runde Tische stehen in der Sonne, mit einer Tasse Kaffee und einem Stück Kuchen. Vielleicht erinnern Sie sich an ein Café, das Sie mochten, und an die Leute, die vorbeigingen.' }
  };
  /* The memory postcards, as js/activities.js had them until 1.15 (titles, stories, questions). */
  var POSTCARDS = [
    { id: 'sea', fallback: 'travel-sea', title: { en: 'The sea', fr: 'La mer', de: 'Das Meer' },
      q: { en: 'Have you ever spent time at the seaside?', fr: 'Avez-vous déjà passé du temps au bord de la mer ?', de: 'Waren Sie schon einmal am Meer?' },
      story: { en: 'Imagine a warm day at the seaside. The sun is bright, the water is calm, and the waves roll in slowly. Perhaps you remember the smell of salt in the air, a walk along the sand, or a small boat far away.',
        fr: 'Imaginez une belle journée chaude au bord de la mer. Le soleil brille, l’eau est calme et les vagues arrivent doucement. Vous vous souvenez peut-être de l’odeur du sel dans l’air, d’une promenade sur le sable ou d’un petit bateau au loin.',
        de: 'Stellen Sie sich einen warmen Tag am Meer vor. Die Sonne scheint hell, das Wasser ist ruhig, und die Wellen rollen langsam heran. Vielleicht erinnern Sie sich an den Duft von Salz in der Luft, an einen Spaziergang am Strand oder an ein kleines Boot in der Ferne.' } },
    { id: 'mountain', fallback: 'travel-mountain', title: { en: 'The mountain', fr: 'La montagne', de: 'Die Berge' },
      q: { en: 'Have you ever spent time in the mountains?', fr: 'Avez-vous déjà passé du temps à la montagne ?', de: 'Waren Sie schon einmal in den Bergen?' },
      story: { en: 'Picture a clear morning in the mountains. The air is fresh and quiet, and the snow shines on the high peaks. Perhaps you remember a long walk, a picnic by a lake, or something warm to drink at the end of the path.',
        fr: 'Imaginez un matin clair à la montagne. L’air est frais et calme, et la neige brille sur les hauts sommets. Vous vous souvenez peut-être d’une longue marche, d’un pique-nique au bord d’un lac ou d’une boisson chaude au bout du chemin.',
        de: 'Stellen Sie sich einen klaren Morgen in den Bergen vor. Die Luft ist frisch und still, und der Schnee glänzt auf den hohen Gipfeln. Vielleicht erinnern Sie sich an eine lange Wanderung, an ein Picknick an einem See oder an etwas Warmes zu trinken am Ende des Weges.' } },
    { id: 'forest', fallback: 'family-picnic', title: { en: 'The forest', fr: 'La forêt', de: 'Der Wald' },
      q: { en: 'Do you like walking in the forest?', fr: 'Aimez-vous vous promener en forêt ?', de: 'Gehen Sie gern im Wald spazieren?' },
      story: { en: 'Imagine a soft path through the forest. The trees are tall, the light comes through the leaves, and the ground is quiet under your feet. Perhaps you remember a family walk, picking mushrooms, or the smell of the woods after rain.',
        fr: 'Imaginez un chemin doux à travers la forêt. Les arbres sont grands, la lumière passe entre les feuilles et le sol est silencieux sous vos pieds. Vous vous souvenez peut-être d’une promenade en famille, de la cueillette des champignons ou de l’odeur des bois après la pluie.',
        de: 'Stellen Sie sich einen weichen Weg durch den Wald vor. Die Bäume sind hoch, das Licht fällt durch die Blätter, und der Boden ist still unter Ihren Füßen. Vielleicht erinnern Sie sich an einen Spaziergang mit der Familie, ans Pilzesammeln oder an den Duft des Waldes nach dem Regen.' } }
  ];

  /* 21 cards: a short caption, an opening question (both in the three languages) and the drawing;
     the three memory postcards are added after them (theme "nature"). */
  var GENERIC = [
    ['family', 'family-lunch', { en: 'Sunday lunch', fr: 'Le repas du dimanche', de: 'Das Sonntagsessen' },
      { en: 'What was cooked on Sundays at home?', fr: 'Que mangeait-on le dimanche à la maison ?', de: 'Was gab es sonntags zu Hause zu essen?' }],
    ['family', 'family-picnic', { en: 'A picnic in the country', fr: 'Un pique-nique à la campagne', de: 'Ein Picknick im Grünen' },
      { en: 'Where did you like to go for a picnic?', fr: 'Où aimiez-vous aller pique-niquer ?', de: 'Wohin sind Sie gern zum Picknick gegangen?' }],
    ['family', 'family-wedding', { en: 'A wedding cake', fr: 'Une pièce montée de mariage', de: 'Eine Hochzeitstorte' },
      { en: 'Do you remember a beautiful party?', fr: 'Vous souvenez-vous d’une belle fête ?', de: 'Erinnern Sie sich an ein schönes Fest?' }],
    ['travel', 'travel-train', { en: 'The steam train', fr: 'Le train à vapeur', de: 'Die Dampflok' },
      { en: 'Did you like travelling by train?', fr: 'Aimiez-vous voyager en train ?', de: 'Sind Sie gern mit dem Zug gefahren?' }],
    ['travel', 'travel-sea', { en: 'Holidays by the sea', fr: 'Les vacances à la mer', de: 'Urlaub am Meer' },
      { en: 'Which beach do you remember?', fr: 'De quelle plage vous souvenez-vous ?', de: 'An welchen Strand erinnern Sie sich?' }],
    ['travel', 'travel-mountain', { en: 'A mountain road', fr: 'Une route de montagne', de: 'Eine Bergstraße' },
      { en: 'Have you been to the mountains?', fr: 'Êtes-vous déjà allé à la montagne ?', de: 'Waren Sie schon einmal in den Bergen?' }],
    ['childhood', 'childhood-school', { en: 'The village school', fr: 'L’école du village', de: 'Die Dorfschule' },
      { en: 'What was your school like?', fr: 'Comment était votre école ?', de: 'Wie war Ihre Schule?' }],
    ['childhood', 'childhood-toys', { en: 'Toys of the past', fr: 'Les jouets d’autrefois', de: 'Spielzeug von früher' },
      { en: 'What did you like to play with?', fr: 'À quoi aimiez-vous jouer ?', de: 'Womit haben Sie gern gespielt?' }],
    ['childhood', 'childhood-bicycle', { en: 'The first bicycle', fr: 'Le premier vélo', de: 'Das erste Fahrrad' },
      { en: 'Did you ride a bicycle as a child?', fr: 'Faisiez-vous du vélo, enfant ?', de: 'Sind Sie als Kind Fahrrad gefahren?' }],
    ['work', 'work-baker', { en: 'The baker’s shop', fr: 'La boulangerie', de: 'Die Bäckerei' },
      { en: 'What bread did you like best?', fr: 'Quel pain préfériez-vous ?', de: 'Welches Brot mochten Sie am liebsten?' }],
    ['work', 'work-sewing', { en: 'The sewing machine', fr: 'La machine à coudre', de: 'Die Nähmaschine' },
      { en: 'Did someone sew at home?', fr: 'Quelqu’un cousait-il à la maison ?', de: 'Hat zu Hause jemand genäht?' }],
    ['work', 'work-fields', { en: 'Harvest in the fields', fr: 'La moisson aux champs', de: 'Die Ernte auf dem Feld' },
      { en: 'Have you ever seen a harvest?', fr: 'Avez-vous déjà vu une moisson ?', de: 'Haben Sie schon einmal eine Ernte gesehen?' }],
    ['animals', 'animals-cat', { en: 'A cat at the window', fr: 'Un chat à la fenêtre', de: 'Eine Katze am Fenster' },
      { en: 'Do you like cats?', fr: 'Aimez-vous les chats ?', de: 'Mögen Sie Katzen?' }],
    ['animals', 'animals-dog', { en: 'A faithful dog', fr: 'Un chien fidèle', de: 'Ein treuer Hund' },
      { en: 'Did you ever have a dog?', fr: 'Avez-vous eu un chien ?', de: 'Hatten Sie einmal einen Hund?' }],
    ['animals', 'animals-farm', { en: 'The farmyard', fr: 'La basse-cour', de: 'Der Hühnerhof' },
      { en: 'Have you been on a farm?', fr: 'Êtes-vous allé dans une ferme ?', de: 'Waren Sie schon auf einem Bauernhof?' }],
    ['celebrations', 'feast-christmas', { en: 'Christmas', fr: 'Noël', de: 'Weihnachten' },
      { en: 'How was Christmas at home?', fr: 'Comment fêtiez-vous Noël ?', de: 'Wie haben Sie Weihnachten gefeiert?' }],
    ['celebrations', 'feast-fair', { en: 'The fair', fr: 'La fête foraine', de: 'Der Jahrmarkt' },
      { en: 'Did you ride the merry-go-round?', fr: 'Êtes-vous monté sur un manège ?', de: 'Sind Sie Karussell gefahren?' }],
    ['celebrations', 'feast-fireworks', { en: 'Fireworks', fr: 'Le feu d’artifice', de: 'Das Feuerwerk' },
      { en: 'Do you like fireworks?', fr: 'Aimez-vous les feux d’artifice ?', de: 'Mögen Sie Feuerwerk?' }],
    ['town', 'town-market', { en: 'Market day', fr: 'Le jour du marché', de: 'Der Markttag' },
      { en: 'What did you buy at the market?', fr: 'Qu’achetiez-vous au marché ?', de: 'Was haben Sie auf dem Markt gekauft?' }],
    ['town', 'town-tram', { en: 'The old tram', fr: 'Le vieux tramway', de: 'Die alte Straßenbahn' },
      { en: 'Did your town have a tram?', fr: 'Y avait-il un tramway dans votre ville ?', de: 'Gab es in Ihrer Stadt eine Straßenbahn?' }],
    ['town', 'town-cafe', { en: 'A café terrace', fr: 'Une terrasse de café', de: 'Ein Straßencafé' },
      { en: 'Where did you like to have a coffee?', fr: 'Où aimiez-vous prendre un café ?', de: 'Wo haben Sie gern einen Kaffee getrunken?' }]
  ].map(function (g, k) {
    return { id: 'g-' + g[1], theme: g[0], caption: g[2], question: g[3], story: STORIES[g[1]], art: ART[g[1]], order: k };
  });
  /* The three memory postcards (1.16: the postcards activity is part of the album now): their
     landscapes from js/art.js, titles, told stories and questions, as they were. */
  POSTCARDS.forEach(function (pc, k) {
    GENERIC.push({ id: 'g-postcard-' + pc.id, theme: 'nature', caption: pc.title, question: pc.q, story: pc.story, postcard: k + 1,
      art: function () { var A = typeof window !== 'undefined' && window.ART; return A && A[pc.id] ? A[pc.id] : ART[pc.fallback](); }, order: GENERIC.length });
  });

  var api = {
    THEMES: THEMES, GENERIC: GENERIC, lastError: '', EVENT: EVT,
    themeId: themeId, themeOf: themeOf,
    add: add, list: list, get: get, update: update, remove: remove, shrink: shrink, cache: cacheAll,
    like: like, likes: likes, hideTheme: hideTheme, hiddenThemes: hiddenThemes, setNotes: setNotes, notes: notes, patients: patients,
    sessionStart: sessionStart, sessionTouch: sessionTouch, sessions: sessions, stats: stats,
    photoDay: photoDay, photoOfDay: photoOfDay, generic: generic, cardsFor: cardsFor, pick: pick,
    /* Picture storage (IndexedDB): */
    ready: ready, READY_EVENT: READY, addAsync: addAsync, img: img, imgSync: imgSync, erase: erase, sync: sync,
    storage: function () { return where; },
    /* 1.16 (memories: the album and the memory postcards together): */
    cardText: cardText, setCardText: setCardText, fromDaily: fromDaily, POSTCARDS: POSTCARDS, localize: localize,
    postcardsPlan: postcardsPlan, migratePostcards: migratePostcards, migrateKeys: migrateKeys,
    /* For the node tests: another storage object (getItem / setItem / removeItem / key / length). */
    _useStorage: function (s) { store = s; }
  };

  start();
  migrateKeys();
  /* Pictures added by another page of the app (Care Team ↔ patient screen) are read in when this
     page hears of them, comes back to the front, or at the latest within a few seconds. */
  try {
    if (window.addEventListener) {
      window.addEventListener('storage', function (e) { if (!e.key || e.key === META) sync(); });
      window.addEventListener('focus', function () { sync(); });
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') sync(); });
      setInterval(function () { if (typeof document === 'undefined' || document.visibilityState !== 'hidden') sync(); }, 4000);
    }
  } catch (e) { /* node tests */ }
  return api;
})();
if (typeof window !== 'undefined') window.Album = Album;
