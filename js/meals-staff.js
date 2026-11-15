/* "Menu" on the robot HEAD (Care Team, 15 Nov): the daily menu round with ONE button, and the meal settings of a
   resident. The tablet does the rest (js/meals.js), the kitchen sees the orders (cuisine.html), the server keeps
   everything (labland/meals.mjs).
   - The line under the header, like the family notification (same look):
       "Menüwahl: 6 Bewohner ohne Auswahl für morgen"   [Runde starten]   ×
     shown when tomorrow has a menu, the kitchen still takes orders, and residents have not answered yet.
   - The round: resident after resident, through the usual link (js/link-staff.js): the run carries the
     activity 'meals', the resident's settings and opt.meal = { date, ticket, diet, portion }; the robot drives
     to the resident's room (js/places.js: Places.roomOf, asked once with "Where is …?" and the '–' picker),
     the tablet waits for the person and the posture check, the head shows only the status screen. After a
     resident the robot goes on to the next one (LinkStaff.keepOut: no trip to the base in between); after the
     last one, or when the team taps Cancel, it goes back to the base. Nobody in front of the tablet for
     4 minutes after arriving: that resident is skipped (the kitchen sees "not chosen yet").
   - One resident: the "Menu" tile and Start, as any activity; the run gets its ticket on the way
     (LinkStaff.send is wrapped for the key 'meals').
   - Menu > Personalise: vegetarian, no pork, soft food, diabetic, allergies, portion, room, "takes part in the
     round" (Care Team prefs 'diet' and 'place'), sent to the server for the kitchen's tray list; and the
     kitchen's address with the team's code, and a button that opens the kitchen page here.
   Resident names stay in the request bodies (the kitchen needs them for the trays), never in a URL or a log.
   ES5 (Chrome 95). */
window.MealsStaff = (function () {
  'use strict';
  var KEY = 'bellatrix-care-lab-v1', RUN = 'bellatrix-care-lab-run', ROUND = 'bellatrix-meals-round', HIDE = 'bellatrix-meals-hidden', GKEY = 'bellatrix-games-key';
  var WAIT_KEY = 'bellatrix-meals-wait-ms', WAIT_MS = 4 * 60000, ROUND_MAX_MS = 4 * 3600000;
  var DIET = ['veg', 'nopork', 'soft', 'diabetic'];
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var S = function (k, v) { return window.ST ? ST(k, v) : (window.I18N ? I18N.t('en', k, v) : k); };
  var st = { status: null, asking: '', sig: '', synced: '', syncT: 0, kitchen: null, hostFor: '', starting: false };
  var round = null;   /* { queue: [codes], i, runId, date, at, skipping, waitFrom, out } */

  if (window.ST && ST.add) {
    ST.add('fr', {
      'Menu: {n} residents without a choice for tomorrow': 'Menu : {n} résidents sans choix pour demain', 'Menu: 1 resident without a choice for tomorrow': 'Menu : 1 résident sans choix pour demain',
      'Start the round': 'Lancer la tournée', 'Where is {name}?': 'Où est {name} ?', 'Later': 'Plus tard',
      'Meals': 'Repas', 'Vegetarian': 'Végétarien', 'No pork': 'Sans porc', 'Soft food': 'Texture tendre', 'Diabetic': 'Diabétique', 'Allergies': 'Allergies',
      'e.g. nuts, gluten': 'ex. noix, gluten', 'Portion': 'Portion', 'Normal': 'Normale', 'Small': 'Petite', 'Room': 'Chambre',
      'Takes part in the daily menu round': 'Participe à la tournée des menus', 'Kitchen': 'Cuisine', 'Open the kitchen page': 'Ouvrir la page cuisine', 'Code': 'Code',
      'Tomorrow: chosen': 'Demain : choisi', 'Tomorrow: no choice yet': 'Demain : pas encore choisi', 'Tomorrow: no menu yet': 'Demain : pas encore de menu',
      'The menu server does not answer.': 'Le serveur des menus ne répond pas.', 'The patient screen did not answer.': 'L’écran patient n’a pas répondu.'
    });
    ST.add('de', {
      'Menu: {n} residents without a choice for tomorrow': 'Menüwahl: {n} Bewohner ohne Auswahl für morgen', 'Menu: 1 resident without a choice for tomorrow': 'Menüwahl: 1 Bewohner ohne Auswahl für morgen',
      'Start the round': 'Runde starten', 'Where is {name}?': 'Wo ist {name}?', 'Later': 'Später',
      'Meals': 'Essen', 'Vegetarian': 'Vegetarisch', 'No pork': 'Kein Schwein', 'Soft food': 'Weiche Kost', 'Diabetic': 'Diabetiker', 'Allergies': 'Allergien',
      'e.g. nuts, gluten': 'z. B. Nüsse, Gluten', 'Portion': 'Portion', 'Normal': 'Normal', 'Small': 'Klein', 'Room': 'Zimmer',
      'Takes part in the daily menu round': 'Nimmt an der Menüwahl teil', 'Kitchen': 'Küche', 'Open the kitchen page': 'Küchenseite öffnen', 'Code': 'Code',
      'Tomorrow: chosen': 'Morgen: gewählt', 'Tomorrow: no choice yet': 'Morgen: noch keine Wahl', 'Tomorrow: no menu yet': 'Morgen: noch kein Menü',
      'The menu server does not answer.': 'Der Menü-Server antwortet nicht.', 'The patient screen did not answer.': 'Der Patientenbildschirm hat nicht geantwortet.'
    });
  }

  /* ---------- small tools ---------- */
  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function getJ(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v === null ? d : v; } catch (e) { return d; } }
  function putJ(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* this page only */ } }
  function toast(t) { if (window.Lab && Lab.toast) Lab.toast(t); }
  function store() { return getJ(KEY, {}) || {}; }
  function prefsOf(code) { var p = (store().patients || {})[code]; return (p && p.prefs) || {}; }
  function setPref(code, k, v) {
    if (window.StaffUI && StaffUI.setPref) return StaffUI.setPref(code, k, v);
    var s = store(); s.patients = s.patients || {}; var p = s.patients[code] = s.patients[code] || { content: {}, prefs: {} };
    p.prefs = p.prefs || {}; if (v === undefined || v === null || v === '') delete p.prefs[k]; else p.prefs[k] = v; putJ(KEY, s); return true;
  }
  function nameOf(code) { var g = String(prefsOf(code).greet || '').trim(); return g || code; }
  function dietOf(code) { var d = prefsOf(code).diet; return d && typeof d === 'object' ? d : {}; }
  function currentCode() { var f = $('fParticipant'); return (f && f.value.trim()) || 'P1'; }
  function auth() { var k = ls(GKEY); return k ? { Authorization: 'Team ' + k } : {}; }
  function api(method, path, body) {
    if (!window.Meals || !Meals.api) return Promise.reject(new Error('no-meals'));
    return Meals.api(method, path, body, auth());
  }
  function bell(fn, arg) {
    try {
      var a = window.BellatrixApp;
      if (!a || typeof a[fn] !== 'function') return null;
      var v = arg === undefined ? a[fn]() : a[fn](arg);
      if (typeof v !== 'string') return v == null ? null : v;
      try { return JSON.parse(v); } catch (e) { return v; }
    } catch (e) { return null; }
  }
  /* the rooms of the map (js/places.js), else every map place, [] without a robot */
  function rooms() {
    if (window.Places && Places.rooms) { try { return Places.rooms() || []; } catch (e) { return []; } }
    var l = bell('robotPlaces'), out = [];
    if (Array.isArray(l)) l.forEach(function (p) { var n = p && typeof p === 'object' ? p.name : p; if (typeof n === 'string' && n && out.indexOf(n) < 0) out.push(n); });
    return out;
  }
  function roomOf(code) {
    if (window.Places && Places.roomOf) { try { return Places.roomOf(code) || ''; } catch (e) { return ''; } }
    var v = prefsOf(code).place;
    return typeof v === 'string' ? v : '';
  }
  function setRoom(code, p) {
    if (window.Places && Places.setRoom) return Places.setRoom(code, p);
    return setPref(code, 'place', p || '');
  }
  function base() { var b = window.Places && Places.base ? Places.base() : ''; return b || ls('bellatrix-home-place').trim() || 'Standby-Punkt'; }
  function picker(id, code, attrs) {
    if (window.Places && Places.pickerHtml) return Places.pickerHtml({ id: id, code: code, attrs: attrs || '' });
    var v = roomOf(code), list = rooms();
    return '<select id="' + id + '"' + (attrs || '') + '><option value="">–</option>' + list.map(function (p) { return '<option value="' + esc(p) + '"' + (p === v ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') + '</select>';
  }
  function linked() { return !!(window.LinkStaff && LinkStaff.configured && LinkStaff.configured()); }
  function cur() { try { return window.LinkStaff && LinkStaff._cur ? LinkStaff._cur() : null; } catch (e) { return null; } }
  function final(s) { return s === 'finished' || s === 'cancelled'; }
  function runBusy() { var c = cur(); return !!(c && !final(c.state)); }
  function hiddenUntil() { return +ls(HIDE) || 0; }

  /* ---------- the residents and the server ---------- */
  function residents(all) {
    return Object.keys(store().patients || {}).filter(function (c) { return all || !dietOf(c).off; });
  }
  var coll = typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator('de', { numeric: true, sensitivity: 'base' }) : null;
  function byRoom(a, b) {
    var ra = roomOf(a) || '￿', rb = roomOf(b) || '￿';
    return (coll ? coll.compare(ra, rb) : (ra < rb ? -1 : ra > rb ? 1 : 0)) || (a < b ? -1 : a > b ? 1 : 0);
  }
  function profiles() {
    return residents(true).map(function (c) {
      var d = dietOf(c);
      return { code: c, name: String(prefsOf(c).greet || '').trim(), room: roomOf(c), portion: d.portion === 'small' ? 'small' : 'normal', off: !!d.off,
        diet: { veg: !!d.veg, nopork: !!d.nopork, soft: !!d.soft, diabetic: !!d.diabetic, allergies: String(d.allergies || '') } };
    });
  }
  /* the kitchen's tray list: names, rooms and diets of the residents (only when they changed) */
  function sync(force) {
    var list = profiles(), sig = JSON.stringify(list);
    if (!force && sig === st.synced) return Promise.resolve(true);
    return api('POST', 'head/profiles', { residents: list }).then(function (r) { if (r.status === 200) st.synced = sig; return r.status === 200; }, function () { return false; });
  }
  function syncSoon() { clearTimeout(st.syncT); st.syncT = setTimeout(function () { sync().then(refresh); }, 700); }
  function refresh() {
    return api('GET', 'head/status').then(function (r) {
      st.status = r.status === 200 ? r.body : null;
      paint(); paintHost();
    }, function () { st.status = null; paint(); paintHost(); });
  }
  function missing() {
    var s = st.status;
    if (!s || !s.menu || !s.open) return [];
    var answered = s.answered || [];
    return residents().filter(function (c) { return answered.indexOf(c) < 0; }).sort(byRoom);
  }

  /* ---------- the run for the tablet ---------- */
  function runFor(code) {
    var pr = prefsOf(code), set = store().settings || {};
    /* the resident's own settings, as for a family visit; pointing in the air ON unless the team chose otherwise
       (15 Nov, robot: with 'off' the resident could not point at the buttons at all; touch always works too) */
    var opt = { participant: code, staff: set.staff || '', zone: 'DINING', voice: false, camMode: pr.camMode || set.camMode || 'air', profile: pr.profile || '', greet: pr.greet || '',
      rate: pr.rate || 0.92, volume: pr.volume || 0.9, textSize: pr.textSize || 'normal', subtitles: !!pr.subtitles,
      lang: window.I18N ? I18N.valid(pr.lang) : (pr.lang || 'en'), mood: false };
    return { id: 'R' + Date.now().toString(36), key: 'meals', preview: false, patient: code, opt: opt, at: Date.now() };
  }
  /* opt.meal: the day, the resident's diet and portion, and the ticket that lets the tablet order for this resident */
  function prepare(run, date) {
    var code = run.patient, d = dietOf(code);
    run.opt = run.opt || {};
    run.opt.meal = { date: date || (st.status && st.status.date) || '', ticket: '', portion: d.portion === 'small' ? 'small' : 'normal',
      diet: { veg: !!d.veg, nopork: !!d.nopork, soft: !!d.soft, diabetic: !!d.diabetic, allergies: String(d.allergies || '') } };
    return sync().then(function () {
      return api('POST', 'head/ticket', { code: code, date: run.opt.meal.date || undefined });
    }).then(function (r) {
      if (r && r.status === 200 && r.body.ticket) { run.opt.meal.ticket = r.body.ticket; run.opt.meal.date = r.body.date || run.opt.meal.date; }
      return run;
    }, function () { return run; });
  }
  /* One device (PC demo, no link): the run is handed over on this device, as "Start" does. */
  function local(run) {
    try { localStorage.setItem(RUN, JSON.stringify(run)); } catch (e) { return false; }
    if (window.BellatrixApp && window.BellatrixApp.openPatient) window.BellatrixApp.openPatient();
    else if (!window.__mealsTest) location.href = 'patient.html' + location.search;
    return true;
  }

  /* ---------- the round ---------- */
  function saveRound() { putJ(ROUND, round); }
  function waitMs() { var v = parseInt(ls(WAIT_KEY), 10); return v > 0 ? v : WAIT_MS; }
  function startRound() {
    if (round || st.starting || runBusy()) return;
    var list = missing();
    if (!list.length) return;
    /* the robot knows rooms: each resident of the round needs one (asked once, kept for the family visits too) */
    if (rooms().length) {
      for (var i = 0; i < list.length; i++) if (!roomOf(list[i])) { st.asking = list[i]; paint(true); return; }
    }
    st.asking = '';
    if (!linked()) {
      /* one device: the first resident here, the others with the next tap */
      st.starting = true;
      prepare(runFor(list[0]), st.status.date).then(function (run) { st.starting = false; local(run); });
      return;
    }
    round = { queue: list, i: -1, runId: '', date: st.status.date, at: Date.now(), skipping: false, waitFrom: 0, out: false };
    saveRound(); paint(true);
    next();
  }
  function next() {
    if (!round) return;
    round.i++; round.runId = ''; round.skipping = false; round.waitFrom = 0;
    if (round.i >= round.queue.length) { endRound(); return; }
    var code = round.queue[round.i], my = round;
    saveRound();
    prepare(runFor(code), round.date).then(function (run) {
      if (round !== my) return null;
      return Promise.resolve(LinkStaff.send(run, roomOf(code))).then(function () {
        if (round !== my) return;
        var c = cur();
        if (c && c.id === run.id) { round.runId = run.id; round.out = false; saveRound(); }
        else { toast(S('The patient screen did not answer.')); endRound(); }
      });
    }).catch(function () { endRound(); });
  }
  function endRound() {
    var r = round;
    round = null; saveRound();
    /* the robot was kept out for a next resident that will not come: back to the base */
    if (r && r.out) bell('robotGo', base());
    paint(true);
    refresh();
  }
  /* called by js/link-staff.js when a run ends: true = stay out, the round goes on */
  function keepOut(c) {
    var go = !!(round && c && c.id === round.runId && (c.state === 'finished' || round.skipping) && round.i + 1 < round.queue.length);
    if (go) { round.out = true; saveRound(); }
    return go;
  }
  function watch() {
    if (!round || !round.runId) return;
    if (Date.now() - round.at > ROUND_MAX_MS) { endRound(); return; }
    var c = cur();
    if (!c || c.id !== round.runId) { endRound(); return; }   /* the team started something else */
    if (c.state === 'finished') { round.runId = ''; saveRound(); setTimeout(next, 1500); return; }
    if (c.state === 'cancelled') {
      if (round.skipping) { round.runId = ''; saveRound(); setTimeout(next, 1500); }
      else endRound();                                       /* Cancel on the head: the round stops */
      return;
    }
    /* nobody in front of the tablet: after the drive, wait, then the next resident */
    var waiting = (c.state === 'sent' || c.state === 'received' || c.state === 'absent') && c.nav !== 'going';
    if (!waiting) { round.waitFrom = 0; return; }
    if (!round.waitFrom) round.waitFrom = Date.now();
    if (Date.now() - round.waitFrom > waitMs() && !round.skipping) { round.skipping = true; saveRound(); LinkStaff.cancel(); }
  }

  /* ---------- the line under the header ---------- */
  function mountNote() {
    var tray = $('bannerTray');
    if (!tray) return false;
    if ($('mlNote')) return true;
    var d = document.createElement('div');
    d.id = 'mlNote'; d.className = 'fv-notes ml-notes'; d.setAttribute('role', 'status'); d.setAttribute('aria-live', 'polite'); d.hidden = true;
    tray.parentNode.insertBefore(d, tray);
    d.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-ml]') : null;
      if (!b || b.disabled) return;
      var what = b.getAttribute('data-ml');
      if (what === 'go') startRound();
      else if (what === 'x') {
        if (st.asking) st.asking = '';
        else { try { localStorage.setItem(HIDE, String(Date.now() + 2 * 3600000)); } catch (x) { /* this page only */ } }
        paint(true);
      }
    });
    d.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || t.id !== 'mlWhere' || !t.value) return;
      setRoom(t.getAttribute('data-code'), t.value);
      syncSoon();
      startRound();   /* the next resident without a room, or the round */
    });
    return true;
  }
  function paint(force) {
    if (!mountNote()) return;
    var el = $('mlNote'), list = missing(), h = '';
    var show = list.length > 0 && !round && !runBusy() && (st.asking || Date.now() > hiddenUntil());
    if (show) {
      var text = list.length === 1 ? S('Menu: 1 resident without a choice for tomorrow') : S('Menu: {n} residents without a choice for tomorrow', { n: list.length });
      h = '<div class="fv-note ml-note"><span class="fv-text">' + esc(text) + '</span>';
      if (st.asking) {
        h += '<label class="fv-where"><span>' + esc(S('Where is {name}?', { name: nameOf(st.asking) })) + '</span>' + picker('mlWhere', st.asking, ' data-code="' + esc(st.asking) + '"') + '</label>';
      } else h += '<button type="button" class="go fv-go" data-ml="go"' + (st.starting ? ' disabled' : '') + '>' + esc(S('Start the round')) + '</button>';
      h += '<button type="button" class="fv-x" data-ml="x" aria-label="' + esc(S('Later')) + '" title="' + esc(S('Later')) + '">×</button></div>';
    }
    if (!force && h === st.sig) return;
    var a = document.activeElement;
    if (!force && a && a.id === 'mlWhere') return;
    st.sig = h;
    el.innerHTML = h;
    el.hidden = !h;
  }

  /* ---------- Menu > Personalise: the resident's meal settings, the kitchen ---------- */
  function mountHost() {
    if ($('mlHost')) return true;
    var box = $('persBox');
    if (!box) return false;
    var d = document.createElement('div');
    d.id = 'mlHost'; d.className = 'acthost ml-diet'; d.setAttribute('data-act-host', 'meals'); d.hidden = true;
    var reset = $('cReset'), row = reset ? reset.parentNode : null;
    if (row && row.parentNode === box) box.insertBefore(d, row); else box.appendChild(d);
    d.addEventListener('change', onForm);
    d.addEventListener('input', function (e) { if (e.target && e.target.id === 'mlAllergies') onForm(e); });
    d.addEventListener('click', function (e) { if (e.target && e.target.id === 'mlKitchen') openKitchen(); });
    return true;
  }
  function stateText(code) {
    var s = st.status;
    return !s ? S('The menu server does not answer.') : !s.menu ? S('Tomorrow: no menu yet') : (s.answered || []).indexOf(code) >= 0 ? S('Tomorrow: chosen') : S('Tomorrow: no choice yet');
  }
  function hostHtml(code) {
    var d = dietOf(code), hasRooms = rooms().length > 0;
    var h = '<h3 class="ph">' + esc(S('Meals')) + '</h3><div class="checks">';
    [['veg', 'Vegetarian'], ['nopork', 'No pork'], ['soft', 'Soft food'], ['diabetic', 'Diabetic']].forEach(function (x) {
      h += '<label class="check"><input type="checkbox" data-diet="' + x[0] + '"' + (d[x[0]] ? ' checked' : '') + '> <span>' + esc(S(x[1])) + '</span></label>';
    });
    h += '</div><div class="grid2">' +
      '<label class="field"><span>' + esc(S('Allergies')) + '</span><input id="mlAllergies" type="text" maxlength="120" autocomplete="off" value="' + esc(d.allergies || '') + '" placeholder="' + esc(S('e.g. nuts, gluten')) + '"></label>' +
      '<label class="field"><span>' + esc(S('Portion')) + '</span><select id="mlPortion"><option value="normal">' + esc(S('Normal')) + '</option><option value="small"' + (d.portion === 'small' ? ' selected' : '') + '>' + esc(S('Small')) + '</option></select></label>' +
      '<label class="field"><span>' + esc(S('Room')) + '</span>' + (hasRooms ? picker('mlRoom', code) : '<input id="mlRoom" type="text" maxlength="40" autocomplete="off" value="' + esc(roomOf(code)) + '">') + '</label></div>' +
      '<label class="check"><input type="checkbox" id="mlOn"' + (d.off ? '' : ' checked') + '> <span>' + esc(S('Takes part in the daily menu round')) + '</span></label>';
    h += '<p class="note ml-state" id="mlState">' + esc(stateText(code)) + '</p>';
    if (st.kitchen) h += '<p class="note ml-kitchen"><span>' + esc(S('Kitchen')) + ': <b>' + esc(st.kitchen.addr) + '</b> · ' + esc(S('Code')) + ' <b>' + esc(st.kitchen.code) + '</b></span> ' +
      '<button type="button" class="ghost sm" id="mlKitchen">' + esc(S('Open the kitchen page')) + '</button></p>';
    return h;
  }
  function paintHost(force) {
    if (!mountHost()) return;
    var box = $('mlHost'), code = currentCode();
    if (box.hidden && !force) return;
    var a = document.activeElement;
    if (!force && a && box.contains(a) && st.hostFor === code) { var s = $('mlState'); if (s) s.textContent = stateText(code); return; }
    st.hostFor = code;
    box.innerHTML = hostHtml(code);
  }
  function onForm(e) {
    var box = $('mlHost'), code = currentCode(), t = e && e.target;
    if (!box) return;
    if (t && t.id === 'mlRoom') { setRoom(code, t.value.trim().slice(0, 40)); syncSoon(); return; }
    var d = {};
    DIET.forEach(function (k) { var c = box.querySelector('[data-diet="' + k + '"]'); if (c && c.checked) d[k] = true; });
    var al = $('mlAllergies') ? $('mlAllergies').value.trim().slice(0, 120) : '';
    if (al) d.allergies = al;
    if ($('mlPortion') && $('mlPortion').value === 'small') d.portion = 'small';
    if ($('mlOn') && !$('mlOn').checked) d.off = true;
    setPref(code, 'diet', Object.keys(d).length ? d : null);
    syncSoon();
  }
  function local1(u) { return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(u); }
  /* the kitchen page's address for a PC of the kitchen, and the team's code (the head's own call) */
  function loadKitchen() {
    return api('POST', 'head/kitchen', {}).then(function (r) {
      if (r.status !== 200 || !r.body.code) return;
      var srv = window.Meals && Meals.server ? Meals.server() : '', hi = {};
      try { hi = window.BellatrixApp && BellatrixApp.linkServer ? JSON.parse(BellatrixApp.linkServer() || '{}') || {} : {}; } catch (e) { hi = {}; }
      if (local1(srv) && hi.url && !local1(hi.url)) srv = String(hi.url).replace(/\/+$/, '');
      st.kitchen = { code: r.body.code, token: r.body.token, addr: srv.replace(/^https?:\/\//i, '') + '/cuisine' };
      paintHost(true);
    }, function () { /* no server: no kitchen line */ });
  }
  function openKitchen() {
    if (!st.kitchen) return;
    /* the page of this app (on the robot: the app's own copy, which talks to the head's server) */
    location.href = 'cuisine.html#k=' + encodeURIComponent(st.kitchen.token);
  }

  /* ---------- one resident from the "Menu" tile: the run gets its ticket on the way ---------- */
  function wrapSend() {
    if (!window.LinkStaff || LinkStaff._mealsWrapped || typeof LinkStaff.send !== 'function') return;
    var send0 = LinkStaff.send;
    LinkStaff._mealsWrapped = true;
    LinkStaff.send = function (run, position) {
      if (run && run.key === 'meals' && !(run.opt && run.opt.meal)) return prepare(run, st.status && st.status.date).then(function (r) { return send0(r, position); });
      return send0(run, position);
    };
    LinkStaff.keepOut = keepOut;
  }

  function start() {
    wrapSend();
    mountNote(); mountHost();
    var r = getJ(ROUND, null);
    if (r && r.queue && Date.now() - r.at < ROUND_MAX_MS) round = r;
    sync(true).then(refresh);
    loadKitchen();
    setInterval(watch, 1000);
    setInterval(function () { if (document.visibilityState !== 'hidden') { sync().then(refresh); } }, 60000);
    setInterval(function () { paint(false); }, 2000);
    window.addEventListener('focus', function () { refresh(); });
    window.addEventListener('bellatrix-staff-act', function (e) { if (e.detail && e.detail.key === 'meals') setTimeout(function () { paintHost(true); }, 0); });
    var f = $('fParticipant');
    if (f) f.addEventListener('change', function () { setTimeout(function () { paintHost(true); }, 0); });
  }
  /* the host must exist before staff.js shows the activity's part (its first actHosts runs after DOMContentLoaded) */
  if (typeof document !== 'undefined') {
    mountHost();
    if (!window.__mealsNoStart) {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 0); }); else setTimeout(start, 0);
    }
  }
  return { missing: missing, refresh: refresh, sync: sync, startRound: startRound, keepOut: keepOut, prepare: prepare, runFor: runFor, paint: paint, paintHost: paintHost,
    _state: function () { return { status: st.status, asking: st.asking, round: round, kitchen: st.kitchen }; } };
})();
