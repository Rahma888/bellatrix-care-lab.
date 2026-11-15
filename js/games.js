/* The care team's own games ("Ajouter un jeu", labland/games.mjs), on the head (Care Team) and on the
   patient tablet. The server keeps the catalogue; every game in it becomes an activity of this page
   (key 'team-<id>'), so the head starts it like any other activity (patient + place, through the link)
   and the tablet, or one device without link, plays it.
   On the tablet the game runs full screen in a sandboxed frame (scripts only: no same origin, no top
   navigation, no popups) with one big Finish button. Pointing in the air works inside the game: when the
   air cursor is over the frame, js/core.js hands it over (Lab.airToFrame) and the game's page (the bridge
   the server injects) turns { type: 'bellatrix-air', x, y, kind: 'move' | 'click' } into pointer, mouse and
   click events. A click needs the cursor held still over something clickable for a moment, like a button
   of the patient screen. ES5. */
window.TeamGames = (function () {
  'use strict';
  var RUN = 'bellatrix-care-lab-run', DWELL_MS = 1100, HOLD_PX = 45, RELEASE_PX = 90;
  var list = [], sig = null, lastFetch = 0, fetching = null;
  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function headInfo() {
    try { var a = window.BellatrixApp; if (a && typeof a.linkServer === 'function') return JSON.parse(a.linkServer() || '{}') || {}; } catch (e) { /* no robot */ }
    return {};
  }
  /* The server that keeps the games: the link's relay (the robot head), else the server of this page,
     else the call server. */
  function server() {
    var k = ls('bellatrix-link-server').trim().replace(/\/+$/, '');
    if (k && k.toLowerCase() !== 'local' && /^https?:\/\/[^\s\/]+/i.test(k)) return k;
    if (headInfo().running) return 'http://127.0.0.1:8765';
    if (!window.BellatrixApp && typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) return location.protocol + '//' + location.host;
    var c = ls('bellatrix-call-server').trim().replace(/\/+$/, '');
    return /^https?:\/\/[^\s\/]+/i.test(c) ? c : '';
  }
  /* A call to the games API. -> Promise of { status, body } (never rejects on an HTTP error). */
  function api(method, path, body, headers) {
    var s = server();
    if (!s) return Promise.reject(new Error('no-server'));
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null, to = null, h = {}, k;
    if (ctrl) to = setTimeout(function () { ctrl.abort(); }, 10000);
    if (body) h['Content-Type'] = 'application/json';
    for (k in headers || {}) if (Object.prototype.hasOwnProperty.call(headers, k)) h[k] = headers[k];
    return fetch(s + '/games/api/' + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { clearTimeout(to); return r.json().then(function (j) { return { status: r.status, body: j || {} }; }, function () { return { status: r.status, body: {} }; }); },
        function (e) { clearTimeout(to); throw e; });
  }
  function frameUrl(g) { return server() + '/games/' + encodeURIComponent(g.id) + '/?v=' + encodeURIComponent(g.updated || g.date || ''); }

  /* ---------- every game of the catalogue is an activity ---------- */
  function art() {
    return '<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="400" height="300" fill="#F0F6FC"/>' +
      '<rect x="120" y="58" width="160" height="184" rx="5" fill="#FFFFFF" stroke="#00519E" stroke-width="8"/>' +
      '<path d="M178 112v76l62-38z" fill="#00519E"/></svg>';
  }
  function activity(g, n) {
    return {
      key: 'team-' + g.id, day: 950 + (n || 0), name: g.name, zone: 'TEAM', team: g.id, game: g,
      flow: 'A game made by the care team.', learn: '', art: art,
      start: function (L) {
        /* A game is in one language: the screen speaks it until the session ends (like the Atelier games). */
        if (window.Lab && Lab.opt && Lab.lang && Lab.lang() !== g.lang && /^(fr|de|en)$/.test(g.lang)) {
          Lab.opt.lang = g.lang;
          /* and the waiting screen after it, so that its "thank you" and the screen agree */
          try { localStorage.setItem('bellatrix-care-lab-lastlang', g.lang); } catch (e) { /* only the waiting screen */ }
          var chip = document.getElementById('chipPreview'), camText = document.getElementById('camText');
          if (chip) chip.textContent = Lab.t('Preview');
          if (camText) camText.textContent = Lab.t('Camera on · not recorded');
        }
        L.log('Team game: ' + g.name + ' (' + g.id + ')', 'team');
        var t0 = Date.now();
        var st = {
          id: 'teamgame', cls: 'teamgame', back: false, noStop: true, noHistory: true, noReprompt: true, airPointer: true, say: '',
          body: '<div class="tgspace" aria-hidden="true"></div>',
          actions: [{ label: L.t('Finish'), primary: true, cls: 'tgend', words: [], noLabelWords: true, run: function () {
            L.stat('teamGameSeconds', Math.round((Date.now() - t0) / 1000));
            if (air.clicks) L.stat('teamGameAirClicks', air.clicks);
            L.log('Activity completed', 'end');
            var S = Lab._t && Lab._t.state;
            if (S && S.rec) S.rec.outcome = 'completed';
            Lab.endSession();
          } }],
          after: function () { mount(g); },
          leave: function () { unmount(); }
        };
        return st;
      }
    };
  }
  function running() { var S = window.Lab && Lab._t && Lab._t.state; return !!(Lab.isOn && Lab.isOn() && S && S.act && S.act.team); }
  function apply(games) {
    if (typeof Lab === 'undefined' || !Lab.define) return false;
    var s = JSON.stringify(games.map(function (g) { return [g.id, g.name, g.lang, g.updated, g.entry]; }));
    if (s === sig) return false;
    if (running()) return false;   /* never while one of these games is on the screen */
    sig = s; list = games.slice();
    for (var i = Lab.activities.length - 1; i >= 0; i--) {
      if (Lab.activities[i].team) { delete Lab.byKey[Lab.activities[i].key]; Lab.activities.splice(i, 1); }
    }
    list.forEach(function (g, n) { Lab.define(activity(g, n)); });
    try { window.dispatchEvent(new CustomEvent('bellatrix-games')); } catch (e) { /* old browser */ }
    return true;
  }
  function refresh() {
    if (fetching) return fetching;
    lastFetch = Date.now();
    var key = ls('bellatrix-games-key');   /* the head's key (js/games-staff.js): it also sees "for whom" */
    fetching = api('GET', 'list', null, key ? { Authorization: 'Team ' + key } : null).then(function (r) {
      fetching = null;
      var games = r.status === 200 && r.body && Array.isArray(r.body.games) ? r.body.games.filter(function (g) { return g && typeof g.id === 'string' && /^[a-z0-9-]{3,41}$/.test(g.id) && typeof g.name === 'string'; }) : null;
      if (games) apply(games);
      return list;
    }, function () { fetching = null; return list; });
    return fetching;
  }
  /* A run for a game this page does not know yet (just added): ask at once. */
  function watchRun() {
    var run = null;
    try { run = JSON.parse(ls(RUN) || 'null'); } catch (e) { run = null; }
    if (run && /^team-/.test(String(run.key || '')) && !Lab.byKey[run.key] && Date.now() - lastFetch > 2500) refresh();
  }

  /* ---------- the game on the patient screen ---------- */
  var box = null, frame = null;
  function mount(g) {
    var stage = document.getElementById('stage');
    if (!stage || (box && box.parentNode === stage)) return;
    box = document.createElement('div');
    box.className = 'tgbox';
    frame = document.createElement('iframe');
    frame.className = 'tgframe';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('title', g.name);
    frame.src = frameUrl(g);
    box.appendChild(frame);
    var cur = document.getElementById('airCursor');
    stage.insertBefore(box, cur && cur.parentNode === stage ? cur : null);
    air.since = 0; air.guard = null; air.on = false; air.clicks = 0;
  }
  function unmount() {
    if (box && box.parentNode) box.parentNode.removeChild(box);
    box = null; frame = null;
  }

  /* ---------- pointing in the air inside the game ----------
     Called by js/core.js for each camera frame with the cursor in stage pixels. Returns true when the
     cursor is over the game (the game has it; core.js leaves its own buttons alone). */
  var air = { since: 0, ax: 0, ay: 0, guard: null, on: false, onAt: 0, clicks: 0 };
  function post(kind, x, y) { try { frame.contentWindow.postMessage({ type: 'bellatrix-air', x: x, y: y, kind: kind }, '*'); } catch (e) { /* the game is gone */ } }
  function airToFrame(x, y, now, r, s, ring) {
    if (!frame || !frame.isConnected) return false;
    var q = frame.getBoundingClientRect(), cx = r.left + x * s, cy = r.top + y * s;
    if (!q.width || cx < q.left || cx > q.right || cy < q.top || cy > q.bottom) {
      if (air.since) post('move', -1, -1);
      air.since = 0;
      return false;
    }
    var k = frame.clientWidth / q.width, ix = Math.round((cx - q.left) * k), iy = Math.round((cy - q.top) * k);
    post('move', ix, iy);
    if (air.guard) {
      if (Math.abs(x - air.guard.x) + Math.abs(y - air.guard.y) > RELEASE_PX) air.guard = null;
      else { ring(0); air.since = 0; return true; }
    }
    if (!air.since || Math.abs(x - air.ax) + Math.abs(y - air.ay) > HOLD_PX) { air.since = now; air.ax = x; air.ay = y; }
    /* only over something the game can be clicked on (its answer to the last move) */
    if (!(air.on && Date.now() - air.onAt < 700)) { air.since = now; ring(0); return true; }
    var p = Math.min(1, (now - air.since) / DWELL_MS);
    ring(p);
    if (p >= 1) { post('click', ix, iy); air.clicks++; air.guard = { x: x, y: y }; air.since = 0; ring(0); }
    return true;
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('message', function (m) {
      var d = m.data;
      if (!frame || m.source !== frame.contentWindow || !d || d.type !== 'bellatrix-air-hover') return;
      air.on = !!d.on; air.onAt = Date.now();
    });
  }

  if (typeof Lab !== 'undefined' && Lab.define && typeof document !== 'undefined') {
    Lab.airToFrame = airToFrame;
    refresh();
    setInterval(function () { if (Date.now() - lastFetch > 15000) refresh(); else watchRun(); }, 2000);
    window.addEventListener('focus', function () { if (Date.now() - lastFetch > 3000) refresh(); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && Date.now() - lastFetch > 3000) refresh(); });
  }
  return { server: server, api: api, refresh: refresh, list: function () { return list.slice(); }, frameUrl: frameUrl, activity: activity, apply: apply,
    airToFrame: airToFrame, esc: esc, _frame: function () { return frame; } };
})();
