/* Bellatrix Library, the robot's side (version 1.9).
   Care homes get activities in packs. Bellatrix Basics is always included; the other packs need the
   care home's licence. A licence, the catalog and every downloadable pack are signed by LabLand
   (ECDSA P-256), and this file accepts them only after checking the signature with LabLand's
   public key (js/store-key.js). A pack that was changed after signing is refused and never runs.

   Everything is kept on this device: the licence, the catalog, the packs (localStorage), so the
   activities work without internet. Only the care home code goes to the Library, never patient data.
   Before a licence is loaded, the activities built into the app work as before. */
var Store = (function () {
  'use strict';
  var K = { packs: 'bellatrix-store-packs', licence: 'bellatrix-store-licence', catalog: 'bellatrix-store-catalog',
    config: 'bellatrix-store-config', requests: 'bellatrix-store-requests' };
  /* The activities built into the app and the pack each belongs to. */
  var BUILTIN = { hello: 'basics', choice: 'basics', quiz: 'basics', sayings: 'memory', pairs: 'memory',
    move: 'movement', song: 'music' };
  var state = { licence: null, catalog: null, installed: {}, loaded: {}, requests: [], problems: [] };
  /* PC test mode (start.bat opens the pages with ?allgames): every activity, the packs straight from
     their sources in labland/packs, no Library and no licence. Only on this computer (localhost);
     a robot's pages come from app.bellatrix, where it never applies. It lasts for this browser tab. */
  var SOURCE_PACKS = ['board-games'];
  var TEST = (function () {
    if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return false;
    try {
      if (/[?&]allgames(&|=|$)/.test(location.search)) sessionStorage.setItem('bellatrix-all-games', '1');
      return sessionStorage.getItem('bellatrix-all-games') === '1';
    } catch (e) { return /[?&]allgames(&|=|$)/.test(location.search); }
  })();

  function get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function fire() { try { window.dispatchEvent(new CustomEvent('bellatrix-store')); } catch (e) { /* old browser */ } }

  /* ---------- signatures ---------- */
  var keyPromise = null;
  function canCheck() { return !!(window.crypto && crypto.subtle && typeof BELLATRIX_STORE_KEY !== 'undefined'); }
  function bytes(t) { return new TextEncoder().encode(t); }
  function unbase64(s) { var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  function verify(text, signature) {
    if (!canCheck() || typeof text !== 'string' || typeof signature !== 'string') return Promise.resolve(false);
    if (!keyPromise) keyPromise = crypto.subtle.importKey('jwk', BELLATRIX_STORE_KEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return keyPromise.then(function (key) { return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unbase64(signature), bytes(text)); })
      .catch(function () { return false; });
  }
  function sha256(text) {
    return crypto.subtle.digest('SHA-256', bytes(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
    });
  }

  /* ---------- where the Library is, and who we are ---------- */
  function config() { return get(K.config) || { server: '', code: '' }; }
  function base() { return String(config().server || '').replace(/\/+$/, ''); }
  function fetchJson(p, opts) {
    return fetch(base() + p, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.message || j.error || 'The Library answered ' + r.status + '.'); e.code = j.error; throw e; }
        return j;
      });
    }, function () { throw new Error('The Library cannot be reached. Check the address and the Wi-Fi.'); });
  }

  /* ---------- licence and packs ---------- */
  function catalogPack(id) {
    var c = state.catalog;
    if (!c) return null;
    for (var i = 0; i < c.packs.length; i++) if (c.packs[i].id === id) return c.packs[i];
    return null;
  }
  function packFor(key) {
    if (BUILTIN[key]) return BUILTIN[key];
    var c = state.catalog;
    if (c) for (var i = 0; i < c.packs.length; i++) if (c.packs[i].games.indexOf(key) >= 0) return c.packs[i].id;
    for (var id in state.installed) if (state.installed[id].manifest && state.installed[id].manifest.games.indexOf(key) >= 0) return id;
    return null;
  }
  /* included | active | trial | expired | off | none, or 'unlicensed' on a robot that was never
     connected to the Library (the built-in activities then work as before version 1.9). Once it was
     connected, a missing or refused licence unlocks nothing: editing or deleting it cannot help. */
  function status(packId) {
    if (packId === 'basics') return 'included';
    if (TEST) return 'test';
    var lic = state.licence;
    if (!lic) return config().code || state.licenceRefused ? 'none' : 'unlicensed';
    var p = lic.packs[packId];
    if (!p) return 'none';
    if (p.status === 'included') return 'included';
    if (p.until && Date.parse(p.until) < Date.now()) return 'expired';
    return p.status;
  }
  function packAllowed(packId) { var s = status(packId); return s === 'included' || s === 'active' || s === 'trial' || s === 'test'; }
  /* A pack that came inside the robot app (signed by LabLand) works like the built-in activities
     until the robot is connected to the Library; then its licence decides. */
  function bundled(packId) { var i = state.installed[packId]; return !!(i && i.ok && i.bundled); }
  function usable(packId) { return packAllowed(packId) || (status(packId) === 'unlicensed' && bundled(packId)); }
  /* May this activity be started here? */
  function allowed(key) {
    var pack = packFor(key);
    if (!pack) return true;
    if (usable(pack)) return true;
    return status(pack) === 'unlicensed' && !!BUILTIN[key];
  }
  function daysLeft(packId) {
    var lic = state.licence, p = lic && lic.packs[packId];
    if (!p || !p.until) return null;
    return Math.max(0, Math.ceil((Date.parse(p.until) - Date.now()) / 86400000));
  }

  /* A pack is accepted only when its code is exactly what LabLand signed (and, when we know it,
     the version the catalog lists). */
  function checkPackage(pkg, expect) {
    var manifest;
    try { manifest = JSON.parse(pkg.manifest); } catch (e) { return Promise.resolve({ ok: false, reason: 'The pack cannot be read.' }); }
    if (!canCheck()) return Promise.resolve({ ok: false, manifest: manifest, reason: 'This screen cannot check signatures.' });
    return Promise.all([sha256(String(pkg.code)), verify(pkg.manifest + '\n' + pkg.code, pkg.signature)]).then(function (r) {
      if (r[0] !== manifest.sha256) return { ok: false, manifest: manifest, reason: 'Its code was changed after LabLand signed it.' };
      if (!r[1]) return { ok: false, manifest: manifest, reason: 'It is not signed by LabLand.' };
      if (expect && expect.sha256 !== manifest.sha256) return { ok: false, manifest: manifest, reason: 'It is not the version the Library lists.' };
      return { ok: true, manifest: manifest };
    });
  }
  function run(id, code) {
    if (state.loaded[id]) return;
    state.loaded[id] = true;
    var s = document.createElement('script');
    s.text = code + '\n//# sourceURL=bellatrix-pack-' + id + '.js\n';
    document.head.appendChild(s);
  }
  function runAllowed() {
    var packs = get(K.packs) || {};
    Object.keys(state.installed).forEach(function (id) {
      if (state.installed[id].ok && usable(id) && packs[id]) run(id, packs[id].code);
    });
  }
  function loadInstalled() {
    var packs = get(K.packs) || {};
    return Promise.all(Object.keys(packs).map(function (id) {
      return checkPackage(packs[id]).then(function (r) {
        state.installed[id] = { manifest: r.manifest || null, ok: r.ok, reason: r.reason || '', bundled: !!packs[id].bundled };
        if (!r.ok) state.problems.push('The ' + id + ' pack on this device was refused: ' + r.reason);
      });
    }));
  }
  /* The robot app carries LabLand's signed catalog and packs (assets/web/store). At the first start,
     and when the app brings a newer version, they are installed from there, checked exactly like a
     download: Chess and Ludo work on the robot without any server. */
  function preinstall() {
    if (!window.BellatrixApp || TEST || !canCheck()) return Promise.resolve();
    return fetch('store/catalog.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (raw) {
      if (!raw) return null;
      return verify(raw.catalog, raw.signature).then(function (ok) {
        if (!ok) { state.problems.push('The catalog inside the app is not signed by LabLand.'); return null; }
        var cat = JSON.parse(raw.catalog);
        if (!state.catalog || String(state.catalog.published || '') < String(cat.published || '')) { state.catalog = cat; put(K.catalog, raw); }
        return Promise.all(cat.packs.filter(function (p) { return p.package; }).map(function (p) {
          var have = state.installed[p.id];
          if (have && have.ok && have.manifest && have.manifest.version === p.package.version) return null;
          if (have && have.ok && !have.bundled) return null; /* a pack from the Library is kept */
          return fetch('store/' + p.package.file, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (pkg) {
            if (!pkg) return null;
            return checkPackage(pkg, p.package).then(function (res) {
              if (!res.ok) { state.problems.push('The ' + p.id + ' pack inside the app was refused: ' + res.reason); return; }
              var packs = get(K.packs) || {};
              pkg.bundled = true;
              packs[p.id] = pkg;
              put(K.packs, packs);
              state.installed[p.id] = { manifest: res.manifest, ok: true, reason: '', bundled: true };
            });
          });
        }));
      });
    }).catch(function () { /* no bundled store: a browser */ });
  }
  /* Test mode: the pack files themselves, in their order, like the pages load the built-in ones. */
  function loadSources() {
    return Promise.all(SOURCE_PACKS.map(function (id) {
      var dir = 'labland/packs/' + id + '/';
      return fetch(dir + 'pack.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (def) {
        if (!def) { state.problems.push('Test mode: the ' + id + ' sources are not on this server (use start.bat).'); return null; }
        return new Promise(function (resolve) {
          var left = def.files.length;
          def.files.forEach(function (f) {
            var s = document.createElement('script');
            s.src = dir + f + '?t=' + Date.now();
            s.async = false;
            s.onload = s.onerror = function () { if (--left === 0) resolve(); };
            document.head.appendChild(s);
          });
        }).then(function () {
          state.loaded[id] = true;
          state.installed[id] = { manifest: { id: id, version: def.version + ' (sources)', games: def.games }, ok: true, reason: '' };
        });
      }).catch(function () { state.problems.push('Test mode: the ' + id + ' sources could not be loaded.'); });
    }));
  }
  /* Test mode: the catalog LabLand signed last (labland/store, or /store on the store server), checked
     like any other, so the Library tab shows the store on this PC too. It is not kept. */
  function loadTestCatalog() {
    function one(url) { return fetch(url, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; }); }
    return one('labland/store/catalog.json').then(function (raw) { return raw || one('store/catalog.json'); }).then(function (raw) {
      if (!raw) return null;
      return verify(raw.catalog, raw.signature).then(function (ok) {
        if (!ok) { state.problems.push('Test mode: the catalog on this server is not signed by LabLand.'); return; }
        var cat = JSON.parse(raw.catalog);
        if (!state.catalog || String(state.catalog.published || '') <= String(cat.published || '')) state.catalog = cat;
      });
    }).catch(function () { /* no catalog on this server */ });
  }
  function acceptCatalog(raw) {
    return verify(raw && raw.catalog, raw && raw.signature).then(function (ok) {
      if (!ok) throw new Error('The catalog is not signed by LabLand. It was refused.');
      state.catalog = JSON.parse(raw.catalog);
      put(K.catalog, raw);
    });
  }
  function acceptLicence(raw) {
    return verify(raw && raw.licence, raw && raw.signature).then(function (ok) {
      if (!ok) throw new Error('The licence is not signed by LabLand. It was refused.');
      var lic = JSON.parse(raw.licence);
      if (lic.careHome.code !== config().code) throw new Error('This licence is for another care home.');
      state.licence = lic;
      state.licenceRefused = false;
      put(K.licence, raw);
      runAllowed();
    });
  }

  /* ---------- what the Library tab asks ---------- */
  function connect(server, code) {
    var c = config();
    c.server = String(server || '').trim();
    c.code = String(code || '').trim().toUpperCase();
    put(K.config, c);
    return refresh();
  }
  function refresh() {
    var c = config();
    if (!c.code) return Promise.reject(new Error('Enter the care home code from LabLand.'));
    return fetchJson('/store/catalog.json').then(acceptCatalog)
      .then(function () { return fetchJson('/store/api/licence?code=' + encodeURIComponent(c.code)); }).then(acceptLicence)
      .then(function () { return fetchJson('/store/api/requests?code=' + encodeURIComponent(c.code)).catch(function () { return { requests: state.requests }; }); })
      .then(function (r) {
        state.requests = r.requests || [];
        put(K.requests, state.requests);
        c.checked = new Date().toISOString();
        put(K.config, c);
        fire();
      });
  }
  function request(packId, kind) {
    var c = config();
    return fetchJson('/store/api/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: c.code, pack: packId, kind: kind }) })
      .then(function (r) { return (r.licence ? acceptLicence(r) : Promise.resolve()).then(function () { return refresh(); }).then(function () { return r; }); });
  }
  function install(packId) {
    var entry = catalogPack(packId);
    if (!entry || !entry.package) return Promise.reject(new Error('This pack has nothing to download.'));
    return fetchJson('/store/' + entry.package.file).then(function (pkg) {
      return checkPackage(pkg, entry.package).then(function (r) {
        if (!r.ok) {
          var e = new Error('Refused: ' + r.reason + ' Nothing was installed; this robot is safe.');
          e.code = 'refused';
          throw e;
        }
        var packs = get(K.packs) || {};
        packs[packId] = pkg;
        if (!put(K.packs, packs)) throw new Error('This device has no room left to keep the pack.');
        state.installed[packId] = { manifest: r.manifest, ok: true, reason: '' };
        if (usable(packId)) run(packId, pkg.code);
        fire();
        return r.manifest;
      });
    });
  }
  /* The code of a removed pack stays in this page until it is opened again (the Library reloads it). */
  function remove(packId) {
    var packs = get(K.packs) || {};
    delete packs[packId];
    put(K.packs, packs);
    delete state.installed[packId];
    fire();
  }

  var ready = Promise.resolve().then(function () {
    var raw = get(K.catalog);
    state.requests = get(K.requests) || [];
    return (raw ? acceptCatalog(raw).catch(function (e) { state.problems.push(e.message); }) : Promise.resolve())
      .then(function () {
        var lic = get(K.licence);
        return lic ? acceptLicence(lic).catch(function (e) { state.licence = null; state.licenceRefused = true; state.problems.push('The saved licence was ignored: ' + e.message + ' Press “Connect” to get it again from LabLand.'); }) : null;
      })
      .then(TEST ? function () { return loadSources().then(loadTestCatalog); } : function () { return loadInstalled().then(preinstall).then(runAllowed); });
  }).catch(function (e) { state.problems.push(String(e && e.message || e)); }).then(function () { fire(); });

  return {
    ready: ready, BUILTIN: BUILTIN, testMode: TEST,
    status: status, allowed: allowed, packFor: packFor, packAllowed: packAllowed, usable: usable, bundled: bundled, daysLeft: daysLeft,
    catalog: function () { return state.catalog; }, licence: function () { return state.licence; },
    installed: function () { return state.installed; }, requests: function () { return state.requests; },
    problems: function () { return state.problems.slice(); }, config: config,
    connect: connect, refresh: refresh, request: request, install: install, remove: remove
  };
})();
