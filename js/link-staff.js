/* Link, Care Team side (robot head, 1.17). A robot has two devices that share no data: the small head
   (this app) and the big portrait tablet (the patient screen). When the link is set (call server address
   bellatrix-link-server (http or https, 'local' = the relay on the head) else bellatrix-call-server, https, and bellatrix-link-code, 6 to 12 characters), "Start on the patient screen"
   sends the activity to the server for the tablet (POST link/api/<code>/run) instead of opening the patient
   page here. The head shows no activity, only a quiet status: On the way > With the patient > Finished,
   and a Cancel button. The finished session is put in the local inbox, so Results works as before.
   With the robot (window.BellatrixApp: robotPlaces/robotGo/robotNav/robotStop) the Position field is a list
   of the map's places; the robot drives there first (On the way), the tablet is told when it arrived, and
   at the end the robot goes back to the home place (localStorage bellatrix-home-place, Standby-Punkt).
   With js/places.js (15 Nov): the list shows the patient rooms only, '–' first (no driving), the resident's
   saved room preselected, else '–'; the robot goes back to the BASE (Places.base()).
   Without the robot nothing changes. Without both settings nothing changes. ES5. */
window.LinkStaff = (function () {
  'use strict';
  var CUR = 'bellatrix-link-current', PLACES = 'bellatrix-link-places', LASTPOS = 'bellatrix-link-position', INBOX = 'bellatrix-care-lab-inbox';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var S = function (k, v) { return window.ST ? ST(k, v) : k; };
  var cur = null, since = 0, loop = 0, clearT = null, finalAt = 0, navT = 0, placeSig = '', posWho = null;
  /* 16 Nov (testing): peek = the care team looks at the Care Team screens while a run goes on (3 taps in the top
     left corner, again to see the status); collect = the next send goes to the task list (js/tasks-staff.js). */
  var peek = false, collect = null, cornerTaps = [], CORNER_PX = 140, CORNER_TAPS = 3, CORNER_MS = 2500;

  if (window.ST && ST.add) {
    ST.add('fr', {
      'Link code': 'Code de liaison', 'Test the link': 'Tester la liaison', 'The link works.': 'La liaison fonctionne.', 'The link does not answer.': 'La liaison ne répond pas.',
      'Stopped.': 'Arrêté.',
      'Position': 'Position', 'e.g. Room 12': 'ex. Chambre 12', 'On the way': 'En route', 'With the patient': 'Chez le patient', 'Finished': 'Terminé', 'Cancelled': 'Annulé',
      '6 to 12 letters or digits.': '6 à 12 lettres ou chiffres.', 'The link needs an https server address.': 'La liaison demande une adresse de serveur en https.',
      'Link code saved.': 'Code de liaison enregistré.', 'Relay address': 'Adresse du relais', 'This head relay': 'Relais de la tête'
    });
    ST.add('de', {
      'Link code': 'Kopplungscode', 'Test the link': 'Verbindung testen', 'The link works.': 'Die Verbindung funktioniert.', 'The link does not answer.': 'Die Verbindung antwortet nicht.',
      'Stopped.': 'Angehalten.',
      'Position': 'Ort', 'e.g. Room 12': 'z. B. Zimmer 12', 'On the way': 'Unterwegs', 'With the patient': 'Beim Patienten', 'Finished': 'Beendet', 'Cancelled': 'Abgebrochen',
      '6 to 12 letters or digits.': '6 bis 12 Buchstaben oder Ziffern.', 'The link needs an https server address.': 'Die Verbindung braucht eine https-Serveradresse.',
      'Link code saved.': 'Kopplungscode gespeichert.', 'Relay address': 'Relais-Adresse', 'This head relay': 'Relais des Kopfes'
    });
  }

  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function put(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* this page only */ } }
  function codeOk(c) { return /^[A-Za-z0-9_-]{6,12}$/.test(c); }
  function serverOk(s) { return /^https:\/\//i.test(s) || /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(s); }
  /* The relay of the display link: 'bellatrix-link-server' first (http or https; 'local' or empty = the relay
     running on this head), else the call server (bellatrix-call-server, internet). */
  function headInfo() {
    try { var a = window.BellatrixApp; if (a && typeof a.linkServer === 'function') return JSON.parse(a.linkServer() || '{}') || {}; } catch (e) { /* no robot */ }
    return {};
  }
  function linkSrv() {
    var k = ls('bellatrix-link-server').trim().replace(/\/+$/, '');
    if (k && k.toLowerCase() !== 'local') return /^https?:\/\/[^\s\/]+/i.test(k) ? k : '';
    if (headInfo().running) return 'http://127.0.0.1:8765';
    return ls('bellatrix-call-server').trim().replace(/\/+$/, '');
  }
  function base() {
    var s = linkSrv(), c = ls('bellatrix-link-code').trim(), k = ls('bellatrix-link-server').trim();
    var ok = (k && k.toLowerCase() !== 'local') || headInfo().running ? /^https?:\/\//i.test(s) : serverOk(s);
    return codeOk(c) && s && ok ? s + '/link/api/' + encodeURIComponent(c) + '/' : '';
  }
  function req(method, path, body, wait) {
    var b = base();
    if (!b) return Promise.reject(new Error('no-link'));
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null, to = null;
    if (ctrl) to = setTimeout(function () { ctrl.abort(); }, wait ? 40000 : 10000);
    return fetch(b + path, { method: method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { clearTimeout(to); if (!r.ok) throw new Error('http ' + r.status); return r.json(); }, function (e) { clearTimeout(to); throw e; });
  }
  function toast(t) { if (window.Lab && Lab.toast) Lab.toast(t); }

  /* ---------- states: sent/received/absent -> 0, present/started -> 1, finished -> 2 ---------- */
  var STEP = { sent: 0, received: 0, absent: 0, present: 1, arrived: 1, 'waiting-seat': 1, seated: 1, started: 1, finished: 2 };
  function final(s) { return s === 'finished' || s === 'cancelled'; }

  /* ---------- the robot (Android bridge); every call is safe, no robot = nothing ---------- */
  function bell(fn, arg) {
    try {
      var a = window.BellatrixApp;
      if (!a || typeof a[fn] !== 'function') return null;
      var v = arg === undefined ? a[fn]() : a[fn](arg);
      if (typeof v !== 'string') return v == null ? null : v;
      try { return JSON.parse(v); } catch (e) { return v; }
    } catch (e) { return null; }
  }
  function robotPlaces() {
    var l = bell('robotPlaces'), out = [];
    if (!Array.isArray(l)) return out;
    l.forEach(function (p) { var n = p && typeof p === 'object' ? p.name : p; if (typeof n === 'string' && n && out.indexOf(n) < 0) out.push(n); });
    return out;
  }
  function robotOn() { var st = bell('robotState'); return !!(st && typeof st === 'object' && st.connected); }
  function homePlace() { return ls('bellatrix-home-place').trim() || 'Standby-Punkt'; }

  function places() { try { return JSON.parse(ls(PLACES) || '[]') || []; } catch (e) { return []; } }
  function remember(pos) {
    pos = String(pos || '').trim().slice(0, 40);
    if (!pos) return;
    var l = places().filter(function (p) { return p !== pos; });
    l.unshift(pos);
    put(PLACES, JSON.stringify(l.slice(0, 20)));
    put(LASTPOS, pos);
  }

  /* ---------- sending ---------- */
  function send(run, position) {
    var posEl = $('lkPos'), pos = String(position != null ? position : posEl ? posEl.value : '').trim().slice(0, 40);
    /* js/places.js strict mode only: with rooms on the map, '–' starts nothing */
    if (window.Places && Places.canStart && !Places.canStart(pos)) { toast(S('Choose a place.')); return Promise.resolve(); }
    if (collect && Date.now() < collect.until) { var cf = collect.fn; collect = null; cf(run, pos); return Promise.resolve(); }
    collect = null;
    run.position = pos;
    remember(pos);
    var drive = !!pos && robotPlaces().indexOf(pos) >= 0 && robotOn();   // the robot rolls there first
    var body = { id: run.id, key: run.key, patient: run.patient, opt: run.opt, position: pos, at: run.at, preview: !!run.preview };
    if (drive) body.place = pos;
    return req('POST', 'run', { run: body }).then(function () {
      cur = { id: run.id, state: 'sent', preview: !!run.preview, at: Date.now(), done: false };
      peek = false;
      if (drive) {
        var g = bell('robotGo', pos);
        /* 16 Nov: still on its way home (or to an earlier place): stop that trip and go to the new place */
        if (g === 'busy') { bell('robotStop'); g = bell('robotGo', pos); }
        cur.robot = true; cur.place = pos; cur.nav = g === 'ok' ? 'going' : 'failed';
      }
      since = 0; saveCur(); paint(); startLoop(); startNav();
    }, function () { toast(S('The link does not answer.')); });
  }
  /* the robot's trip: look at robotNav() every second */
  function startNav() {
    clearInterval(navT); navT = 0;
    if (!cur || !cur.robot || cur.nav !== 'going') return;
    navT = setInterval(navTick, 1000);
  }
  function navTick() {
    if (!cur || !cur.robot || cur.nav !== 'going' || final(cur.state)) { clearInterval(navT); navT = 0; return; }
    var n = bell('robotNav'), st = n && typeof n === 'object' ? n.state : '';
    if (st === 'arrived') {
      clearInterval(navT); navT = 0;
      cur.nav = 'arrived'; saveCur(); paint();
      var id = cur.id;
      req('POST', 'arrived', { id: id }).catch(function () { return req('POST', 'arrived', { id: id }).catch(function () { toast(S('The link does not answer.')); }); });
    } else if (st === 'failed') {
      clearInterval(navT); navT = 0;
      cur.nav = 'failed'; saveCur(); paint();
    }
  }
  /* the activity is over (finished, cancelled): stop the trip if any, then back to the home place */
  function goHome() {
    if (!cur || !cur.robot || cur.homed) return;
    cur.homed = true;
    clearInterval(navT); navT = 0;
    /* 15 Nov: a round (the meal round, js/meals-staff.js) goes on to the next resident: no trip to the base in between */
    try { if (window.LinkStaff && typeof LinkStaff.keepOut === 'function' && LinkStaff.keepOut(cur)) return; } catch (e) { /* home as usual */ }
    /* 16 Nov: the task list (js/tasks-staff.js) goes on to its next task: no trip to the base in between */
    try { if (window.LinkStaff && typeof LinkStaff.keepOutTasks === 'function' && LinkStaff.keepOutTasks(cur)) return; } catch (e) { /* home as usual */ }
    if (cur.nav === 'going') bell('robotStop');
    var b = window.Places && Places.base ? Places.base() : '';   /* the BASE (js/places.js), else the home place */
    bell('robotGo', b || homePlace());
  }
  function cancel() {
    if (!cur || final(cur.state)) return;
    var id = cur.id;
    req('POST', 'cancel', { id: id }).then(function () { apply({ id: id, state: 'cancelled' }); }, function () { toast(S('The link does not answer.')); });
  }
  function saveCur() { put(CUR, cur ? JSON.stringify(cur) : null); }

  /* ---------- the status long-poll ---------- */
  function startLoop() { loop++; poll(loop); }
  function poll(my) {
    if (my !== loop || !cur || final(cur.state)) return;
    req('GET', 'status?since=' + since + '&wait=25', null, true).then(function (j) {
      if (my !== loop) return;
      if (j && typeof j.seq === 'number') { since = j.seq; if (cur && j.id === cur.id) apply(j); }
      setTimeout(function () { poll(my); }, 200);
    }, function () { setTimeout(function () { poll(my); }, 3000); });
  }
  function apply(j) {
    if (!cur || j.id !== cur.id || final(cur.state)) return;
    if (j.state !== 'cancelled' && !Object.prototype.hasOwnProperty.call(STEP, j.state)) return;
    cur.state = j.state;
    if (j.state === 'finished' && !cur.done) { cur.done = true; toInbox(j.result); }
    saveCur(); paint();
    if (final(cur.state)) {
      goHome(); saveCur();
      loop++;
      clearTimeout(clearT);
      finalAt = Date.now(); /* stays until the care team taps the screen */
      try { if (window.LinkStaff && typeof LinkStaff.onFinal === 'function') LinkStaff.onFinal(cur); } catch (e) { /* the list stops */ }
    }
  }
  /* The same inbox the patient app fills on one device: Results takes it from there. */
  function toInbox(rec) {
    if (cur && cur.preview) return;
    if (!rec || !rec.id) return;
    var inbox = [];
    try { inbox = JSON.parse(ls(INBOX) || '[]') || []; } catch (e) { inbox = []; }
    if (inbox.some(function (r) { return r && r.id === rec.id; })) return;
    inbox.push(rec);
    put(INBOX, JSON.stringify(inbox));
    if (window.LabTakeInbox) { try { window.LabTakeInbox(); } catch (e) { /* taken at the next start */ } }
  }

  /* ---------- screen: position field and quiet status bar next to Start ---------- */
  function paint() { fillPos(); paint0(); topBar(); }
  /* Position: a real list of the map's places when the robot gives some, else the free field */
  function fillPos() {
    var el = $('lkPos');
    if (!el) return;
    var P = window.Places, who = window.Lab && Lab.patient ? String(Lab.patient) : '';
    var list = P ? P.rooms() : robotPlaces(), sig = list.join('|') + (P ? '#' + who : ''), isSel = el.tagName === 'SELECT';
    if (sig === placeSig && (list.length > 0) === isSel) return;
    placeSig = sig;
    var keep = el.value || ls(LASTPOS), n, prevWho = posWho;
    posWho = who;
    if (list.length) {
      n = document.createElement('select'); n.id = 'lkPos';
      n.innerHTML = '<option value="">\u2013</option>' + list.map(function (p) { return '<option value="' + esc(p) + '">' + esc(p) + '</option>'; }).join('');
      /* Places: the resident's room, else '–' (nothing by accident); the team's choice stays while the list changes */
      var pick = P ? (isSel && prevWho === who && el.value ? el.value : P.roomOf(who)) : keep;
      n.value = list.indexOf(pick) >= 0 ? pick : '';
    } else {
      n = document.createElement('input'); n.id = 'lkPos'; n.type = 'text'; n.maxLength = 40; n.setAttribute('list', 'lkPlaces'); n.setAttribute('autocomplete', 'off');
      n.placeholder = S('e.g. Room 12'); n.value = isSel ? ls(LASTPOS) : keep;
    }
    n.addEventListener('change', function () { if (n.value) put(LASTPOS, n.value); });
    el.parentNode.replaceChild(n, el);
  }
  /* a quiet strip on every tab while a run is under way (Rahma: the status must be seen) */
  function topBar() {
    var el = $('lkTop'), on = !!base() && cur && !peek;
    if (!on) { if (el) el.hidden = true; document.body.classList.remove('lk-full'); return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'lkTop'; el.className = 'lk-top'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
      el.addEventListener('click', function (e) {
        if (e.target && e.target.id === 'lkTopCancel') { cancel(); return; }
        if (cur && final(cur.state) && Date.now() - finalAt > 1500) { cur = null; saveCur(); paint(); }
      });
      document.body.appendChild(el);
    }
    el.hidden = false; document.body.classList.add('lk-full');
    var word = cur.state === 'cancelled' ? S('Cancelled') : cur.nav === 'failed' ? S('Could not reach the place') :
      [S('On the way'), S('With the patient'), S('Finished')][cur.nav === 'going' ? 0 : (STEP[cur.state] || 0)];
    el.innerHTML = '<div class="lk-word">' + esc(word) + '</div>' + (final(cur.state) ? '' : '<button type="button" id="lkTopCancel" class="lk-topcancel">' + esc(S('Cancel')) + '</button>');
  }
  function paint0() {
    var bar = $('lkBar');
    if (!bar) return;
    var on = !!base();
    bar.hidden = !on;
    if (!on) return;
    var st = $('lkStatus');
    if (!cur) { st.innerHTML = ''; return; }
    if (cur.state === 'cancelled') { st.innerHTML = '<span class="lk-cancelled">' + esc(S('Cancelled')) + '</span>'; return; }
    if (cur.nav === 'failed') { st.innerHTML = '<span class="lk-cancelled">' + esc(S('Could not reach the place')) + '</span> <button type="button" class="ghost sm" id="lkCancel">' + esc(S('Cancel')) + '</button>'; $('lkCancel').addEventListener('click', cancel); return; }
    var names = [S('On the way'), S('With the patient'), S('Finished')], at = cur.nav === 'going' ? 0 : (STEP[cur.state] || 0);
    st.innerHTML = names.map(function (n, i) { return '<span class="lk-step' + (i === at ? ' lk-on' : '') + '"' + (i === at ? ' aria-current="step"' : '') + '>' + esc(n) + '</span>'; }).join('<span class="lk-sep" aria-hidden="true"> › </span>') +
      (final(cur.state) ? '' : ' <button type="button" class="ghost sm" id="lkCancel">' + esc(S('Cancel')) + '</button>');
    if ($('lkCancel')) $('lkCancel').addEventListener('click', cancel);
  }
  function mountBar() {
    var sb = document.querySelector('.startbar');
    if (!sb || $('lkBar')) return;
    var d = document.createElement('div');
    d.id = 'lkBar'; d.className = 'lk-bar'; d.hidden = true;
    d.innerHTML = '<label class="lk-pos"><span>' + esc(S('Position')) + '</span><input id="lkPos" type="text" maxlength="40" list="lkPlaces" autocomplete="off" placeholder="' + esc(S('e.g. Room 12')) + '"></label>' +
      '<datalist id="lkPlaces"></datalist><div class="lk-status" id="lkStatus" role="status" aria-live="polite"></div>';
    sb.insertBefore(d, sb.firstChild);
    $('lkPos').value = ls(LASTPOS);
    $('lkPlaces').innerHTML = places().map(function (p) { return '<option value="' + esc(p) + '">'; }).join('');
    paint();
  }

  /* ---------- settings: code and test, below the call server address ---------- */
  function mountSettings() {
    var det = document.querySelector('.famsettings');
    if (!det || det.querySelector('.lk-set')) return;
    var d = document.createElement('div');
    d.className = 'lk-set';
    d.innerHTML = '<div class="row"><label class="field" style="flex:1 1 220px">' + esc(S('Link code')) +
      '<input id="lkCode" type="text" maxlength="12" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(ls('bellatrix-link-code')) + '"></label>' +
      '<button type="button" class="ghost" id="lkSave">' + esc(S('Save')) + '</button>' +
      '<button type="button" class="ghost" id="lkTest">' + esc(S('Test the link')) + '</button></div>' +
      '<div class="row"><label class="field" style="flex:1 1 220px">' + esc(S('Relay address')) +
      '<input id="lkSrv" type="text" maxlength="120" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="local" value="' + esc(ls('bellatrix-link-server')) + '"></label></div>' +
      '<small class="lk-hint" id="lkHead"></small>';
    var loud = det.querySelector('#famLoud');
    var anchor = loud ? loud.parentNode : null;
    if (anchor && anchor.parentNode === det) det.insertBefore(d, anchor); else det.appendChild(d);
    $('lkSave').addEventListener('click', function () {
      var c = $('lkCode').value.trim();
      if (c && !codeOk(c)) { toast(S('6 to 12 letters or digits.')); return; }
      var sv = $('lkSrv').value.trim().replace(/\/+$/, '');
      if (sv && sv.toLowerCase() !== 'local' && !/^https?:\/\/[^\s\/]+/i.test(sv)) { toast(S('The link needs an https server address.')); return; }
      put('bellatrix-link-code', c || null);
      put('bellatrix-link-server', sv || null);
      toast(S('Link code saved.')); paint();
    });
    var hi = headInfo();
    if (hi.running && hi.url) $('lkHead').textContent = S('This head relay') + ': ' + hi.url;
    $('lkTest').addEventListener('click', function () {
      if (!codeOk($('lkCode').value.trim())) { toast(S('6 to 12 letters or digits.')); return; }
      put('bellatrix-link-code', $('lkCode').value.trim());
      if (!base()) { toast(S('The link needs an https server address.')); return; }
      req('GET', 'ping').then(function (j) { toast(j && j.ok ? S('The link works.') : S('The link does not answer.')); }, function () { toast(S('The link does not answer.')); });
    });
  }

  /* 16 Nov (testing): 3 taps in the top left corner, any time: from the full-screen status back to the Care Team
     screens (the run goes on and still shows in the bar next to Start); 3 taps again: the status again. */
  /* 16 Nov (Rahma): the 3 taps also stop the robot at once, where it is: the trip stops, the run on the tablet is
     cancelled without a trip to the base, a task list stops, and the Care Team screens show. */
  function cornerTap(e) {
    var t = e.touches && e.touches[0] ? e.touches[0] : e;
    if (t.clientX > CORNER_PX || t.clientY > CORNER_PX) return;
    var now = Date.now();
    cornerTaps = cornerTaps.filter(function (x) { return now - x < CORNER_MS; });
    cornerTaps.push(now);
    if (cornerTaps.length < CORNER_TAPS) return;
    cornerTaps = [];
    bell('robotStop');
    clearInterval(navT); navT = 0;
    try { if (window.LinkStaff && typeof LinkStaff.onCornerStop === 'function') LinkStaff.onCornerStop(); } catch (err) { /* the list stops anyway */ }
    if (cur && !final(cur.state)) {
      if (cur.robot) { cur.homed = true; if (cur.nav === 'going') cur.nav = 'stopped'; }   /* stays where it stopped */
      saveCur();
      cancel();
    }
    peek = true;
    paint();
    toast(S('Stopped.'));
  }
  function boot() {
    mountBar();
    document.addEventListener('pointerdown', cornerTap, true);
    try {
      var c = JSON.parse(ls(CUR) || 'null');
      if (c && c.id && !final(c.state) && Date.now() - c.at < 6 * 3600000 && base()) { cur = c; startLoop(); startNav(); }
    } catch (e) { /* nothing to resume */ }
    paint();
    if (window.MutationObserver) {
      var busy = false;
      new MutationObserver(function () { if (busy) return; busy = true; setTimeout(function () { busy = false; mountSettings(); }, 50); }).observe(document.body, { childList: true, subtree: true });
    }
    setInterval(paint, 5000);
    /* connect to the robot at start, and again every 20 s if the link dropped (the places list then fills in) */
    function plug() { try { if (window.BellatrixApp && window.BellatrixApp.robotConnect && !robotOn()) { window.BellatrixApp.robotConnect(); } } catch (e) { /* no robot */ } }
    plug(); setInterval(function () { plug(); fillPos(); }, 20000);
  }
  if (typeof document !== 'undefined' && document.addEventListener && !window.__linkTest) document.addEventListener('DOMContentLoaded', boot);
  return { configured: function () { return !!base(); }, send: send, cancel: cancel, _apply: apply, _fillPos: fillPos, _cur: function () { return cur; }, _boot: boot,
    /* the next send (within 5 s) is handed to fn(run, position) instead of going out (js/tasks-staff.js) */
    collect: function (fn) { collect = fn ? { fn: fn, until: Date.now() + 5000 } : null; },
    peeking: function () { return peek; }, _corner: cornerTap };
})();
