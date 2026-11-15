/* Pictures and songs that staff add for a patient: kept in this browser (IndexedDB), never uploaded.
   Each item belongs to one patient, one activity and one slot (for example the picture of postcard 2).
   Photos are scaled down to 1600 px on the way in, which also drops their hidden data (GPS, camera). */
var Media = (function () {
  'use strict';
  var DB = 'bellatrix-care-lab-media', STORE = 'media', OLD_DB = 'bellatrix-care-lab-clips';
  var items = [], db = null, persistent = false, listeners = [];

  function changed() { listeners.forEach(function (fn) { try { fn(); } catch (e) { /* a listener failing must not stop the others */ } }); }
  function req(r) { return new Promise(function (ok, no) { r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); }; }); }
  function tx(mode) { return db.transaction(STORE, mode).objectStore(STORE); }
  function withUrl(m) { if (!m.url && m.blob) m.url = URL.createObjectURL(m.blob); return m; }
  function newId() { return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  /* "03 - Moon_River.mp3" becomes "Moon River". */
  function titleFrom(name) { return name.replace(/\.[^.]+$/, '').replace(/^\s*\d+\s*[-._)]\s*/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || name; }
  function matches(m, q) { return Object.keys(q || {}).every(function (k) { return q[k] === undefined || m[k] === q[k]; }); }

  var ready = new Promise(function (resolve) {
    try {
      var open = indexedDB.open(DB, 1);
      open.onupgradeneeded = function () { open.result.createObjectStore(STORE, { keyPath: 'id' }); };
      open.onsuccess = function () {
        db = open.result; persistent = true;
        req(tx('readonly').getAll()).then(function (rows) {
          items = rows.map(withUrl).sort(function (a, b) { return a.added - b.added; });
          resolve(); changed();
        }, function () { resolve(); });
      };
      open.onerror = function () { resolve(); };
    } catch (e) { resolve(); }
  });

  function save(m) {
    if (!persistent) return Promise.resolve();
    var copy = {}; Object.keys(m).forEach(function (k) { if (k !== 'url') copy[k] = m[k]; });
    return req(tx('readwrite').put(copy)).catch(function () { persistent = false; changed(); });
  }
  function isAudio(f) { return /^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i.test(f.name); }
  function isImage(f) { return /^image\//.test(f.type) || /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(f.name); }
  /* Large photos would slow the robot's screen; 1600 px is plenty for a 1080 px wide display. */
  function shrink(file) {
    if (!window.createImageBitmap || /gif$/i.test(file.type)) return Promise.resolve(file);
    return createImageBitmap(file).then(function (bmp) {
      var k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      var c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (ok) { c.toBlob(function (b) { ok(b || file); }, 'image/jpeg', 0.86); });
    }).catch(function () { return file; });
  }

  var api = {
    ready: ready,
    persistent: function () { return persistent; },
    list: function (q) { return items.filter(function (m) { return matches(m, q); }); },
    first: function (q) { return items.filter(function (m) { return matches(m, q); })[0] || null; },
    onChange: function (fn) { listeners.push(fn); },
    /* meta: { patient, activity, slot, type: 'image' | 'audio', replace: true to keep only this one } */
    add: function (files, meta) {
      var list = Array.prototype.slice.call(files).filter(meta.type === 'image' ? isImage : isAudio);
      if (meta.replace) list = list.slice(0, 1);
      var start = meta.replace ? api.removeWhere({ patient: meta.patient, activity: meta.activity, slot: meta.slot, type: meta.type }) : Promise.resolve();
      return start.then(function () {
        return Promise.all(list.map(function (f, i) {
          return (meta.type === 'image' ? shrink(f) : Promise.resolve(f)).then(function (blob) {
            return withUrl({ id: newId() + i, patient: meta.patient, activity: meta.activity, slot: meta.slot, type: meta.type,
              name: f.name, title: titleFrom(f.name), kind: '', decade: '', blob: blob, added: Date.now() + i });
          });
        }));
      }).then(function (added) {
        items = items.concat(added);
        return Promise.all(added.map(save)).then(function () { changed(); return added.length; });
      });
    },
    update: function (id, fields) {
      var m = items.filter(function (x) { return x.id === id; })[0];
      if (!m) return Promise.resolve();
      Object.keys(fields).forEach(function (k) { m[k] = fields[k]; });
      return save(m);
    },
    remove: function (id) {
      var m = items.filter(function (x) { return x.id === id; })[0];
      items = items.filter(function (x) { return x.id !== id; });
      if (m && m.url) URL.revokeObjectURL(m.url);
      var done = persistent ? req(tx('readwrite').delete(id)).catch(function () {}) : Promise.resolve();
      return done.then(changed);
    },
    removeWhere: function (q) {
      return Promise.all(items.filter(function (m) { return matches(m, q); }).map(function (m) { return api.remove(m.id); }));
    },
    /* Copies every picture and song of one patient to another (used by "Copy from patient"). */
    copyPatient: function (from, to, activity) {
      var src = items.filter(function (m) { return m.patient === from && (!activity || m.activity === activity); });
      return api.removeWhere({ patient: to, activity: activity }).then(function () {
        var copies = src.map(function (m, i) {
          var c = {}; Object.keys(m).forEach(function (k) { if (k !== 'url') c[k] = m[k]; });
          c.id = newId() + i; c.patient = to;
          return withUrl(c);
        });
        items = items.concat(copies);
        return Promise.all(copies.map(save)).then(function () { changed(); return copies.length; });
      });
    },
    /* Items brought in from another computer (see the patient export in staff.js); each gets a new id. */
    addItems: function (list) {
      var added = list.map(function (m, i) {
        var c = {}; Object.keys(m).forEach(function (k) { if (k !== 'url' && k !== 'id') c[k] = m[k]; });
        c.id = newId() + i;
        return withUrl(c);
      });
      items = items.concat(added);
      return Promise.all(added.map(save)).then(function () { changed(); return added.length; });
    },
    /* Clips added in version 1.0.4 (one list for everybody) move to Guess the Song of this patient. */
    migrateOldClips: function (patient) {
      return ready.then(function () {
        return new Promise(function (resolve) {
          try {
            var open = indexedDB.open(OLD_DB);
            open.onsuccess = function () {
              var old = open.result;
              if (!old.objectStoreNames.contains('clips')) { old.close(); try { indexedDB.deleteDatabase(OLD_DB); } catch (e) { /* nothing to clean */ } resolve(0); return; }
              var r = old.transaction('clips', 'readonly').objectStore('clips').getAll();
              r.onsuccess = function () {
                var rows = r.result || [];
                old.close();
                if (!rows.length) { resolve(0); return; }
                var moved = rows.map(function (c, i) {
                  return withUrl({ id: newId() + i, patient: patient, activity: 'song', slot: 'clips', type: 'audio', name: c.name, title: c.title, kind: c.kind || '', decade: c.decade || '', blob: c.blob, added: c.added || Date.now() + i });
                });
                items = items.concat(moved);
                Promise.all(moved.map(save)).then(function () {
                  try { indexedDB.deleteDatabase(OLD_DB); } catch (e) { /* the copy is safe either way */ }
                  changed(); resolve(moved.length);
                });
              };
              r.onerror = function () { old.close(); resolve(0); };
            };
            open.onupgradeneeded = function () { /* no old database: nothing to move */ };
            open.onerror = function () { resolve(0); };
          } catch (e) { resolve(0); }
        });
      });
    },
    titleFrom: titleFrom
  };
  return api;
})();
