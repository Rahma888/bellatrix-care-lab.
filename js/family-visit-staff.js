/* Care Team on the robot HEAD, 14 Nov (Rahma): the family notifications with ONE button.
   The small head screen shows no family content any more: no messages, no photos, no call. Only a short
   notification, one per resident, under the header:
     "Message from Sophie for Anna"      (a family message arrived: MessagesStaff, robot/state notifications)
     "Sophie wants to call Anna"         (a call request from the portal: CallReqStaff, robot/calls)
     "Anna wants to call the family"     (the resident asked on the patient screen)
     "Planned call: Sophie and Anna"     (a planned call, 10 minutes before its time)
   and ONE button "Go to Anna". The rest is done by the patient activity "Family messages" (key
   'messages') on the TABLET, through the same link as every other activity (js/link-staff.js): the run
   carries the activity, the resident, the place; the robot drives there (retries in the robot bridge),
   the tablet waits for the person (presence) and the posture check, the head shows only the full-screen
   status (On the way / With the patient / Finished), the robot goes home at the end.
   - The place: once per resident, chosen from the robot's map (BellatrixApp.robotPlaces) and kept in the
     resident's Care Team prefs ('place', StaffUI.setPref). Without it the button first asks "Where is Anna?".
     Without a robot (PC demo) there is no place and the tablet starts when someone is in front of it.
     15 Nov (js/places.js): "Where is Anna?" offers the patient rooms only, '–' first; '–' + "Go to Anna"
     sends the visit without driving (to test the rest), nothing is saved; a room is saved and driven to.
   - The tablet and the head are two devices that share nothing: the run also carries, in opt.fam, this
     robot's family identity (its id and portal key, the call server, the resident's contacts without
     photos) so that the tablet reads the messages, reports "seen" (blue ticks) and places the call as
     the same robot. js/family-visit-patient.js takes it out of the run before anything is stored.
   - A call: the family's phone shows "Bellatrix is on the way to Anna…" (robot/calls/decide 'visit');
     once the robot is there and the resident agrees, the tablet starts the call and the family gets the
     invitation.
   - Photos from the family: a small "Family photos" link on a message notification opens the Memories
     photos of that resident (js/album-staff.js), where one tap adds a photo to the album.
   The old "1 new family message · Open" and call-request banners of the To-do tray are parked (hidden):
   this notification replaces them. ES5 (Chrome 95). */
window.FamilyVisitStaff = (function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var S = function (k, v) { return window.ST ? ST(k, v) : (window.I18N ? I18N.t('en', k, v) : k); };
  var KEY = 'bellatrix-care-lab-v1', RUN = 'bellatrix-care-lab-run', HIDE = 'bellatrix-visit-hidden';
  var st = { asking: '', busy: '', sig: '' };

  if (window.ST && ST.add) {
    ST.add('fr', {
      'Message from {from} for {name}': 'Message de {from} pour {name}', '{n} messages for {name}': '{n} messages pour {name}',
      '{from} wants to call {name}': '{from} veut appeler {name}', '{name} wants to call the family': '{name} veut appeler sa famille',
      'Planned call: {from} and {name}': 'Appel prévu : {from} et {name}', 'Go to {name}': 'Aller voir {name}',
      'Where is {name}?': 'Où est {name} ?', 'Family photos': 'Photos de la famille', 'Later': 'Plus tard',
      'Choose a place.': 'Choisissez un lieu.', 'The patient screen did not answer.': 'L’écran patient n’a pas répondu.'
    });
    ST.add('de', {
      'Message from {from} for {name}': 'Nachricht von {from} für {name}', '{n} messages for {name}': '{n} Nachrichten für {name}',
      '{from} wants to call {name}': '{from} möchte {name} anrufen', '{name} wants to call the family': '{name} möchte die Familie anrufen',
      'Planned call: {from} and {name}': 'Geplanter Anruf: {from} und {name}', 'Go to {name}': 'Zu {name} fahren',
      'Where is {name}?': 'Wo ist {name}?', 'Family photos': 'Familienfotos', 'Later': 'Später',
      'Choose a place.': 'Wählen Sie einen Ort.', 'The patient screen did not answer.': 'Der Patientenbildschirm hat nicht geantwortet.'
    });
  }

  function getJ(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v === null ? d : v; } catch (e) { return d; } }
  function putJ(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* this page only */ } }
  function toast(t) { if (window.Lab && Lab.toast) Lab.toast(t); }
  function store() { return getJ(KEY, {}) || {}; }
  function prefsOf(code) { var p = (store().patients || {})[code]; return (p && p.prefs) || {}; }
  /* The first name the team uses for the resident (the card's greeting), else the portal's word, else the code. */
  function nameOf(code, label) { var g = String(prefsOf(code).greet || '').trim(); return g || label || code; }
  function hidden() { var h = getJ(HIDE, {}) || {}, t = Date.now(), out = {}; Object.keys(h).forEach(function (k) { if (h[k] > t) out[k] = h[k]; }); return out; }
  function hideFor(id, ms) { var h = hidden(); h[id] = Date.now() + ms; putJ(HIDE, h); }

  /* ---------- the robot (Android bridge); no robot = no places ---------- */
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
  /* what "Where is …?" offers: the rooms (js/places.js), else every map place */
  function rooms() { return window.Places && Places.rooms ? Places.rooms() : robotPlaces(); }
  function placeOf(code) {
    var v = window.StaffUI && StaffUI.pref ? StaffUI.pref(code, 'place') : prefsOf(code).place;
    return typeof v === 'string' ? v : '';
  }
  function setPlace(code, place) {
    if (window.StaffUI && StaffUI.setPref) { StaffUI.setPref(code, 'place', place); return; }
    var s = store(); s.patients = s.patients || {}; var p = s.patients[code] = s.patients[code] || { content: {}, prefs: {} };
    p.prefs = p.prefs || {}; p.prefs.place = place; putJ(KEY, s);
  }

  /* ---------- what waits: one notice per resident ---------- */
  function notices() {
    var by = {}, h = hidden(), t = Date.now();
    function slot(code, label) {
      if (!by[code]) by[code] = { code: code, label: label || '', kind: 'message', rank: 1, msgs: [], notes: [], froms: [], photos: false, at: '', req: null, callFrom: '', byResident: false };
      if (!by[code].label && label) by[code].label = label;
      return by[code];
    }
    var ms = null;
    try { ms = window.MessagesStaff && MessagesStaff._state ? MessagesStaff._state() : null; } catch (e) { ms = null; }
    ((ms && ms.notifications) || []).forEach(function (n) {
      if (!n || n.seen || n.kind === 'album' || h['n:' + n.id] || !n.code) return;
      if (n.status === 'withdrawn' || n.status === 'deleted' || n.status === 'read') return;
      var s = slot(n.code, n.label);
      if (n.message && s.msgs.indexOf(n.message) < 0) s.msgs.push(n.message);
      s.notes.push(n.id);
      if (n.from && s.froms.indexOf(n.from) < 0) s.froms.push(n.from);
      if (n.hasPhoto) s.photos = true;
      if ((n.at || '') > s.at) s.at = n.at;
    });
    var reqs = [];
    try { reqs = window.CallReqStaff && CallReqStaff._waiting ? CallReqStaff._waiting() : []; } catch (e) { reqs = []; }
    reqs.forEach(function (q) {
      if (!q || !q.code || h['q:' + q.id]) return;
      if (q.visitAt && t - Date.parse(q.visitAt) < 90 * 60000) return;   /* the robot is already on its way */
      var planned = q.when === 'planned' && q.planAt, pt = planned ? Date.parse(q.planAt) : 0;
      if (planned && (pt - t > 10 * 60000 || t - pt > 6 * 3600000)) return;   /* a planned call shows 10 minutes before its time */
      var info = window.CallReqStaff && CallReqStaff.residentInfo ? CallReqStaff.residentInfo(q.code) : null, s = slot(q.code, q.label || (info && info.label) || '');
      if (s.req) return;   /* one call per resident at a time */
      s.req = q; s.kind = planned ? 'planned' : 'call'; s.rank = 2; s.callFrom = q.from === 'family' ? (q.name || '') : ''; s.byResident = q.from !== 'family';
      if ((q.at || '') > s.at) s.at = q.at;
    });
    return Object.keys(by).map(function (k) { return by[k]; }).filter(function (n) { return n.req || n.msgs.length || n.notes.length; })
      .sort(function (a, b) { return b.rank - a.rank || (a.at < b.at ? 1 : -1); });
  }
  function titleOf(n) {
    var name = nameOf(n.code, n.label);
    if (n.kind === 'planned') return S('Planned call: {from} and {name}', { from: n.callFrom || '…', name: name });
    if (n.kind === 'call') return n.byResident ? S('{name} wants to call the family', { name: name }) : S('{from} wants to call {name}', { from: n.callFrom || '…', name: name });
    return n.notes.length > 1 ? S('{n} messages for {name}', { n: n.notes.length, name: name }) : S('Message from {from} for {name}', { from: n.froms[0] || '…', name: name });
  }

  /* ---------- the run for the tablet ---------- */
  function contactsOf(code) {
    var F = window.FamilyCall;
    if (!F || !F.book) return [];
    var r = (F.book().residents || {})[code] || {};
    return Array.isArray(r.contacts) ? r.contacts : [];
  }
  /* The resident's contacts and call times for the tablet's own book, without the photos (size, privacy). */
  function bookFor(code) {
    var F = window.FamilyCall, r = F && F.book ? (F.book().residents || {})[code] || {} : {};
    var out = { contacts: contactsOf(code).map(function (c) { return { id: c.id, name: c.name || '', rel: c.rel || 'none', relText: c.relText || '', label: c.label || '', lang: c.lang || '', token: c.token || '', portalPid: c.portalPid || '' }; }) };
    if (Array.isArray(r.times)) out.times = r.times;
    if (r.acceptNow !== undefined) out.acceptNow = r.acceptNow;
    return out;
  }
  function identity(code) {
    var F = window.FamilyCall, key = '';
    try { key = localStorage.getItem('bellatrix-portal-key') || ''; } catch (e) { key = ''; }
    var o = { v: 1, robot: F && F.robotId ? F.robotId() : '', key: key, server: F && F.server ? F.server() : '', loud: !(F && F.loud) || F.loud() };
    o.book = {}; o.book[code] = bookFor(code);
    return o;
  }
  function runFor(n) {
    var code = n.code, pr = prefsOf(code), set = store().settings || {};
    /* The resident's own settings, as for a family call (js/patient.js); never the tablet's camera settings. */
    /* 15 Nov: pointing in the air is on for the visit (the resident answers "Yes", "Next", "Call" by pointing). */
    var opt = { participant: code, staff: set.staff || '', zone: '', voice: false, camMode: pr.camMode || set.camMode || 'air', profile: pr.profile || '', greet: pr.greet || '', rate: pr.rate || 0.92, volume: pr.volume || 0.9,
      textSize: pr.textSize || 'normal', subtitles: !!pr.subtitles, lang: window.I18N ? I18N.valid(pr.lang) : (pr.lang || 'en'), mood: pr.mood !== false };
    var fam = identity(code);
    fam.ids = n.msgs || [];
    if (n.kind === 'call' || n.kind === 'planned') {
      var pick = window.CallReqStaff && CallReqStaff.visitPick ? CallReqStaff.visitPick(n.req) : null, c = pick && pick.contact;
      if (c) {
        fam.call = { req: n.req.local ? '' : n.req.id, contact: c.id, name: c.name || n.callFrom || '', pid: pick.person ? pick.person.pid : '' };
        fam.book[code] = bookFor(code);   /* the contact may have just been made from the portal account */
      }
    }
    opt.fam = fam;
    return { id: 'R' + Date.now().toString(36), key: 'messages', preview: false, patient: code, opt: opt, at: Date.now() };
  }
  function linked() { return !!(window.LinkStaff && LinkStaff.configured && LinkStaff.configured()); }
  function go(code, placeChosen) {
    var n = notices().filter(function (x) { return x.code === code; })[0];
    if (!n || st.busy) return;
    var places = rooms(), here = placeChosen === '' || (placeChosen === undefined && !!(window.Places && Places.posNone && Places.posNone())), place = here ? '' : placeChosen || placeOf(code);   /* '' = '–' chosen: no driving */
    if (places.length && !here && (!place || places.indexOf(place) < 0)) { st.asking = code; paint(true); return; }
    st.asking = ''; st.busy = code; paint(true);
    var run = runFor(n);
    var sent = linked() ? Promise.resolve(LinkStaff.send(run, places.length ? place : '')).then(function () { return !!(LinkStaff._cur && LinkStaff._cur() && LinkStaff._cur().id === run.id); }) : local(run);
    sent.then(function (ok) {
      st.busy = '';
      if (!ok) { paint(true); return; }
      settle(n);
      paint(true);
    }, function () { st.busy = ''; paint(true); toast(S('The patient screen did not answer.')); });
  }
  /* One device (PC demo, no link): the run is handed over on this device, as "Start" does. */
  function local(run) {
    try { localStorage.setItem(RUN, JSON.stringify(run)); } catch (e) { return Promise.resolve(false); }
    if (window.BellatrixApp && window.BellatrixApp.openPatient) window.BellatrixApp.openPatient();
    else if (!window.__visitTest) location.href = 'patient.html' + location.search;
    return Promise.resolve(true);
  }
  /* After "Go": the message notices are seen; a call request says "on the way" to the family. */
  function settle(n) {
    var FM = window.FamilyMessages;
    if (n.notes && n.notes.length) {
      n.notes.forEach(function (id) { hideFor('n:' + id, 6 * 3600000); });
      if (FM && FM.request) FM.request('POST', 'robot/notification/seen', { ids: n.notes }).then(function () { if (window.MessagesStaff && MessagesStaff.refresh) MessagesStaff.refresh(); }, function () { /* kept hidden here */ });
    }
    if (n.req) {
      hideFor('q:' + n.req.id, 90 * 60000);
      if (!n.req.local && FM && FM.request) FM.request('POST', 'robot/calls/decide', { id: n.req.id, decision: 'visit' }).then(function () { if (window.CallReqStaff && CallReqStaff.refresh) CallReqStaff.refresh(); }, function () { /* the family is told at the invitation */ });
    }
  }
  function dismiss(code) {
    var n = notices().filter(function (x) { return x.code === code; })[0];
    if (!n) return;
    if (n.req) hideFor('q:' + n.req.id, 2 * 3600000);
    if (n.notes) {
      n.notes.forEach(function (id) { hideFor('n:' + id, 6 * 3600000); });
      var FM = window.FamilyMessages;
      if (FM && FM.request) FM.request('POST', 'robot/notification/seen', { ids: n.notes }).catch(function () { /* hidden here */ });
    }
    paint(true);
  }

  /* ---------- the strip under the header ---------- */
  function mount() {
    var tray = $('bannerTray');
    if (!tray || $('fvNotes')) return !!$('fvNotes');
    var d = document.createElement('div');
    d.id = 'fvNotes'; d.className = 'fv-notes'; d.setAttribute('role', 'status'); d.setAttribute('aria-live', 'polite'); d.hidden = true;
    tray.parentNode.insertBefore(d, tray);
    d.addEventListener('click', onClick);
    d.addEventListener('change', function (e) { if (e.target && e.target.id === 'fvPlace' && e.target.value) { var c = e.target.getAttribute('data-code'); setPlace(c, e.target.value); go(c, e.target.value); } });
    /* the old family banners of "To do" are replaced by this strip: parked in a hidden box */
    var list = $('trayList');
    if (list && !$('fvParked')) {
      var park = document.createElement('div');
      park.id = 'fvParked'; park.hidden = true;
      ['famWaitBanner', 'callReqBanner'].forEach(function (id) { var b = $(id); if (b) park.appendChild(b); });
      list.appendChild(park);
    }
    return true;
  }
  function itemHtml(n) {
    var name = nameOf(n.code, n.label), code = esc(n.code);
    var h = '<div class="fv-note" data-code="' + code + '" data-kind="' + esc(n.kind) + '"><span class="fv-text">' + esc(titleOf(n)) + '</span>';
    if (st.asking === n.code) {
      var strict = !!(window.Places && Places.strict && Places.strict());
      h += '<label class="fv-where"><span>' + esc(S('Where is {name}?', { name: name })) + '</span><select id="fvPlace" data-code="' + code + '"><option value="" selected>–</option>' +
        rooms().map(function (p) { return '<option value="' + esc(p) + '">' + esc(p) + '</option>'; }).join('') + '</select></label>' +
        '<button type="button" class="go fv-go" data-fv="here"' + (st.busy || strict ? ' disabled' : '') + '>' + esc(S('Go to {name}', { name: name })) + '</button>';
    } else {
      if (n.photos && window.AlbumStaff) h += '<button type="button" class="ghost sm fv-photos" data-fv="photos">' + esc(S('Family photos')) + '</button>';
      h += '<button type="button" class="go fv-go" data-fv="go"' + (st.busy ? ' disabled' : '') + '>' + esc(S('Go to {name}', { name: name })) + '</button>';
    }
    return h + '<button type="button" class="fv-x" data-fv="x" aria-label="' + esc(S('Later')) + '" title="' + esc(S('Later')) + '">×</button></div>';
  }
  function paint(force) {
    if (!mount()) return;
    var el = $('fvNotes'), list = notices().slice(0, 3), h = list.map(itemHtml).join('');
    if (!force && h === st.sig) return;
    var a = document.activeElement;
    if (!force && a && a.id === 'fvPlace') return;   /* the place being chosen is not redrawn */
    st.sig = h;
    el.innerHTML = h;
    el.hidden = !list.length;
    document.body.classList.toggle('fv-on', !!list.length);
  }
  function onClick(e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-fv]') : null;
    if (!b || b.disabled) return;
    var row = b.closest('.fv-note'), code = row ? row.getAttribute('data-code') : '';
    var what = b.getAttribute('data-fv');
    if (what === 'go') go(code);
    else if (what === 'here') { var sel = $('fvPlace'), v = sel ? sel.value : ''; if (v) setPlace(code, v); go(code, v); }   /* '–': no driving */
    else if (what === 'x') { if (st.asking === code) { st.asking = ''; paint(true); } else dismiss(code); }
    else if (what === 'photos') { if (window.AlbumStaff && AlbumStaff.open) AlbumStaff.open(code); }
  }
  function start() {
    paint(true);
    setInterval(function () { if (document.visibilityState !== 'hidden') paint(false); }, 2000);
    window.addEventListener('bellatrix-family-notify', function () { paint(false); });
    window.addEventListener('focus', function () { paint(false); });
  }
  if (typeof document !== 'undefined' && !window.__visitNoStart) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 0); }); else setTimeout(start, 0);
  }
  return { notices: notices, runFor: runFor, go: go, paint: paint, placeOf: placeOf, _state: function () { return st; } };
})();
