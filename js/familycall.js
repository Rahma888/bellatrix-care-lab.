/* Family video calls, the robot's side (version 1.9).
   A relative the care team invited (Care Team, Family tab) opens their private link and calls. This
   screen rings with the caller's photo, Bellatrix says who is calling in the resident's language,
   and the resident answers by touch, by pointing or with an open hand. The call is real two-way
   audio and video (WebRTC, between the two browsers); the call server (labland/call-relay.mjs) only
   passes the connection details on. Nothing is recorded. The session record says who called, how
   long, whether it was answered and who hung up; Results shows it like any other session.

   FamilyCall is shared with the Care Team's Family tab (js/family-staff.js):
   - the contacts and call times, kept on this device only (localStorage 'bellatrix-family');
   - this robot's random id (localStorage 'bellatrix-family-robot'; staff and patient pages share it);
   - listen(): the patient screen tells the call server it is here and receives the calls. */
var FamilyCall = (function () {
  'use strict';
  var BOOK = 'bellatrix-family', ROBOT = 'bellatrix-family-robot', API = 'call/api/', SERVER = 'bellatrix-call-server';
  /* Where the call server is. Empty: the server that serves this page (the PC demo). On the robot the
     pages come from the app, so the care team enters the server's address in the Family tab. */
  function server() { var s = ''; try { s = localStorage.getItem(SERVER) || ''; } catch (e) { s = ''; } return s.trim().replace(/\/+$/, ''); }
  function setServer(v) { v = String(v || '').trim().replace(/\/+$/, ''); if (v && !/^https?:\/\//i.test(v)) v = 'http://' + v; try { if (v) localStorage.setItem(SERVER, v); else localStorage.removeItem(SERVER); } catch (e) { /* not kept */ } return v; }
  function api() { var s = server(); return (s ? s + '/' : '') + API; }
  /* STUN/TURN servers come from the call server (GET call/api/ice, see call-relay.mjs), so a TURN
     server set up later needs no change here. Without an answer: none (same network only). */
  var ICE = [];
  function iceServers() {
    return request('GET', 'ice').then(function (o) { return o && Array.isArray(o.iceServers) ? o.iceServers : ICE; }, function () { return ICE; });
  }
  /* The robot's own loudspeaker during a call (WebActivity.callAudio: voice-call mode, speaker on, call
     volume at its maximum). A Family tab setting, on unless the care team switches it off. */
  var audioOn = false;
  function loud() { return book().loud !== false; }
  function callAudio(on) {
    var app = window.BellatrixApp;
    if (!app || !app.callAudio) return false;
    if (on && (audioOn || !loud())) return false;
    if (!on && !audioOn) return false;
    try { app.callAudio(!!on); audioOn = !!on; return true; } catch (e) { audioOn = false; return false; }
  }
  /* The relation as Bellatrix says it to the resident ("Maria, votre fille, vous appelle"). */
  var RELATIONS = [
    ['daughter', 'Daughter', { en: 'your daughter', fr: 'votre fille', de: 'Ihre Tochter' }],
    ['son', 'Son', { en: 'your son', fr: 'votre fils', de: 'Ihr Sohn' }],
    ['granddaughter', 'Granddaughter', { en: 'your granddaughter', fr: 'votre petite-fille', de: 'Ihre Enkelin' }],
    ['grandson', 'Grandson', { en: 'your grandson', fr: 'votre petit-fils', de: 'Ihr Enkel' }],
    ['wife', 'Wife', { en: 'your wife', fr: 'votre femme', de: 'Ihre Frau' }],
    ['husband', 'Husband', { en: 'your husband', fr: 'votre mari', de: 'Ihr Mann' }],
    ['sister', 'Sister', { en: 'your sister', fr: 'votre sœur', de: 'Ihre Schwester' }],
    ['brother', 'Brother', { en: 'your brother', fr: 'votre frère', de: 'Ihr Bruder' }],
    ['daughterinlaw', 'Daughter-in-law', { en: 'your daughter-in-law', fr: 'votre belle-fille', de: 'Ihre Schwiegertochter' }],
    ['soninlaw', 'Son-in-law', { en: 'your son-in-law', fr: 'votre gendre', de: 'Ihr Schwiegersohn' }],
    ['niece', 'Niece', { en: 'your niece', fr: 'votre nièce', de: 'Ihre Nichte' }],
    ['nephew', 'Nephew', { en: 'your nephew', fr: 'votre neveu', de: 'Ihr Neffe' }],
    ['friendf', 'Friend (a woman)', { en: 'your friend', fr: 'votre amie', de: 'Ihre Freundin' }],
    ['friendm', 'Friend (a man)', { en: 'your friend', fr: 'votre ami', de: 'Ihr Freund' }],
    ['none', 'Say the name only', null],
    ['other', 'Other: type it', null]
  ];
  var REL = {};
  RELATIONS.forEach(function (r) { REL[r[0]] = r; });

  function noop() {}
  function b64url(bytes) { return btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function randomId(n) { var a = new Uint8Array(n || 16); crypto.getRandomValues(a); return b64url(a); }
  function robotId() {
    var id = '';
    try { id = localStorage.getItem(ROBOT) || ''; } catch (e) { id = ''; }
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      id = randomId(16);
      try { localStorage.setItem(ROBOT, id); } catch (e) { /* then it lasts for this page only */ }
    }
    return id;
  }

  /* ---------- the contact book (this device only) ---------- */
  function book() {
    var b = null;
    try { b = JSON.parse(localStorage.getItem(BOOK) || 'null'); } catch (e) { b = null; }
    b = b && typeof b === 'object' ? b : {};
    b.residents = b.residents && typeof b.residents === 'object' ? b.residents : {};
    return b;
  }
  function saveBook(b) { try { localStorage.setItem(BOOK, JSON.stringify(b)); return true; } catch (e) { return false; } }
  /* One resident's entry, with the defaults filled in (written only when the caller saves). */
  function resident(b, code) {
    var r = b.residents[code] = b.residents[code] || {};
    if (typeof r.acceptNow !== 'boolean') r.acceptNow = false;
    if (!Array.isArray(r.times)) r.times = [{ on: true, from: '10:00', to: '12:00' }, { on: true, from: '14:30', to: '19:00' }];
    if (!Array.isArray(r.contacts)) r.contacts = [];
    return r;
  }
  function contact(code, id) {
    var r = book().residents[code];
    return r && Array.isArray(r.contacts) ? r.contacts.filter(function (c) { return c.id === id; })[0] || null : null;
  }
  function relationPhrase(c, lang) {
    if (!c) return '';
    if (c.rel === 'other') return String(c.relText || '').trim();
    var r = REL[c.rel];
    return r && r[2] ? r[2][I18N.valid(lang)] : '';
  }
  /* Can the resident take a call now? "Accept calls now" lets calls through at any time; otherwise
     only inside a call time that is switched on. next: when the next call time starts ('HH:MM'). */
  function minutes(t) { var m = /^(\d\d):(\d\d)$/.exec(t || ''); return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : -1; }
  function availability(r, d) {
    d = d || new Date();
    if (!r) return { acceptNow: false, next: '' };
    if (r.acceptNow === true) return { acceptNow: true, next: '' };
    var now = d.getHours() * 60 + d.getMinutes(), open = false, next = '', best = 1e9;
    (r.times || []).forEach(function (t) {
      var a = minutes(t.from), b = minutes(t.to);
      if (!t.on || a < 0 || b < 0 || a === b) return;
      if (a < b ? now >= a && now < b : now >= a || now < b) open = true;
      var until = (a - now + 1440) % 1440;
      if (until > 0 && until < best) { best = until; next = t.from; }
    });
    return open ? { acceptNow: true, next: '' } : { acceptNow: false, next: next };
  }
  function expecting() {
    var b = book();
    return Object.keys(b.residents).some(function (k) { return (b.residents[k].contacts || []).some(function (c) { return !!c.token; }); });
  }

  /* ---------- the call server ---------- */
  function request(method, path, body) {
    var o = { method: method, cache: 'no-store' };
    if (body) { o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(body); }
    return fetch(api() + path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.message || j.error || 'The call server answered ' + r.status + '.'); e.status = r.status; e.body = j; throw e; }
        return j;
      });
    });
  }
  function send(call, body) { body.robot = robotId(); return request('POST', 'call/' + encodeURIComponent(call), body); }
  /* Non-trickle ICE: the full description goes out once, after gathering (or 5 s at most: STUN and
     TURN candidates can take a few seconds). */
  function gathered(pc, ms) {
    return new Promise(function (ok) {
      if (pc.iceGatheringState === 'complete') { ok(); return; }
      var t = setTimeout(done, ms || 5000);
      function check() { if (pc.iceGatheringState === 'complete') done(); }
      function done() { clearTimeout(t); pc.removeEventListener('icegatheringstatechange', check); ok(); }
      pc.addEventListener('icegatheringstatechange', check);
    });
  }
  /* The call's own camera and microphone (the pointing camera of core.js stays separate). Without
     a camera the call goes on with the voice; refused or missing altogether: the caller is still
     seen and heard. */
  function media() {
    var md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) return Promise.reject(new Error('this page cannot use the camera and microphone'));
    var audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    var both = { audio: audio, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } };
    return md.getUserMedia(both).catch(function (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw e;
      /* A camera that was just released (the last call, the pointing camera) can refuse for a moment:
         one more try after a short pause, then the voice only. */
      return new Promise(function (ok) { setTimeout(ok, 700); }).then(function () { return md.getUserMedia(both); })
        .catch(function () { return md.getUserMedia({ audio: audio, video: false }); });
    }).then(turned);
  }
  /* 16 Nov (Rahma: on the phone the resident was seen lying on the side): the robot tablet's camera (the Logi)
     arrives sideways in the page; 'bellatrix-cam-rot' (90, 180, 270: the same turn as the pointing camera) turns the
     call picture on a canvas before it is sent. Stopping the turned track stops the camera too. Elsewhere: as it is. */
  var CALL_FPS = 24;
  function turned(stream) {
    var rot = 0;
    try { var r = localStorage.getItem('bellatrix-cam-rot'); if (r === '90' || r === '180' || r === '270') rot = +r; } catch (e) { rot = 0; }
    var vt = stream && stream.getVideoTracks()[0];
    if (!rot || !vt || typeof document === 'undefined') return stream;
    var cv = document.createElement('canvas');
    if (!cv.captureStream) return stream;
    var v = document.createElement('video'), cx = cv.getContext('2d'), on = true, timer = 0;
    v.muted = true; v.setAttribute('playsinline', ''); v.srcObject = new MediaStream([vt]);
    try { var p = v.play(); if (p && p.catch) p.catch(function () { /* drawn when it plays */ }); } catch (e) { /* idem */ }
    function draw() {
      if (!on) return;
      var w = v.videoWidth, h = v.videoHeight;
      if (!w || !h) return;
      var sw = rot === 90 || rot === 270, cw = sw ? h : w, ch = sw ? w : h;
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
      if (rot === 180) cx.setTransform(-1, 0, 0, -1, cw, ch);
      else if (rot === 90) cx.setTransform(0, 1, -1, 0, cw, 0);
      else cx.setTransform(0, -1, 1, 0, 0, ch);
      cx.drawImage(v, 0, 0, w, h);
      cx.setTransform(1, 0, 0, 1, 0, 0);
    }
    timer = setInterval(draw, Math.round(1000 / CALL_FPS));
    var ct = cv.captureStream(CALL_FPS).getVideoTracks()[0];
    if (!ct) { clearInterval(timer); return stream; }
    var stop0 = ct.stop.bind(ct);
    ct.stop = function () { on = false; clearInterval(timer); try { vt.stop(); } catch (e) { /* gone */ } try { v.srcObject = null; } catch (e) { /* gone */ } stop0(); };
    vt.addEventListener('ended', function () { ct.stop(); });
    return new MediaStream([ct].concat(stream.getAudioTracks()));
  }

  /* ---------- listening for calls (the patient screen) ---------- */
  var on = false, hooks = null, since = 0, fails = 0, sig = '', posted = 0, failedAt = 0, watching = {}, noServer = false;
  /* 404/501: no call server behind this page (start.bat's plain file server). Ask again only once
     a minute instead of filling the console. */
  function missing(e) { return !!e && (e.status === 404 || e.status === 501 || e.status === 405); }
  function stateNow() {
    var b = book(), res = {};
    Object.keys(b.residents).forEach(function (code) { res[code] = availability(b.residents[code]); });
    var busy = false;
    try { busy = !!hooks.busy(); } catch (e) { busy = true; }
    return { robot: robotId(), state: busy ? 'busy' : 'idle', residents: res };
  }
  /* Every 2 s it checks; it reports when something changed, and at least every 10 s. */
  function report(force) {
    var s = stateNow(), text = JSON.stringify(s), now = Date.now();
    if (!force && (text === sig ? now - posted < 10000 : failedAt && now - failedAt < (noServer ? 60000 : 10000))) return;
    sig = text; posted = now;
    request('POST', 'robot/state', s).then(function () { failedAt = 0; noServer = false; }, function (e) { sig = ''; failedAt = Date.now(); if (missing(e)) noServer = true; });
  }
  function waitLoop() {
    request('GET', 'robot/wait?robot=' + encodeURIComponent(robotId()) + '&since=' + since).then(function (d) {
      fails = 0; noServer = false;
      since = d.last || 0;
      (d.events || []).forEach(onEvent);
      setTimeout(waitLoop, 30);
    }, function (e) {
      fails++;
      if (missing(e)) noServer = true;
      setTimeout(waitLoop, noServer ? 60000 : Math.min(30000, 1500 * fails));
    });
  }
  function onEvent(ev) {
    /* The care team calls the family: this screen waits for them ("We are calling Maria…"). */
    if (ev.type === 'outgoing') {
      var oc = contact(ev.resident, ev.contactId), took = false;
      if (watching[ev.token]) return;
      if (!oc) { request('POST', 'outgoing/cancel', { robot: robotId(), token: ev.token }).catch(noop); return; }
      try { took = hooks.outgoing && hooks.outgoing({ outgoing: ev.token, resident: ev.resident, contact: oc, expires: ev.expires }); } catch (e) { took = false; if (window.console) console.error(e); }
      if (!took) request('POST', 'outgoing/cancel', { robot: robotId(), token: ev.token }).catch(noop);
      report(true);
      return;
    }
    if (ev.type === 'outgoing-end') { if (watching[ev.token]) watching[ev.token](ev); return; }
    /* The family joins a call the care team started: it goes to the screen that waits for it. */
    if (ev.type === 'call' && ev.outgoing && watching[ev.outgoing]) { watching[ev.outgoing](ev); return; }
    if (ev.type === 'call') {
      var c = contact(ev.resident, ev.contactId), taken = false;
      /* A contact removed on this device: its calls are not put through. */
      if (!c) { send(ev.call, { type: 'decline' }).catch(noop); return; }
      try { taken = hooks.ring({ call: ev.call, resident: ev.resident, contact: c, sdp: ev.sdp, peer: ev.peer }); } catch (e) { taken = false; if (window.console) console.error(e); }
      if (!taken) send(ev.call, { type: 'busy' }).catch(noop);
      report(true);
      return;
    }
    var w = watching[ev.call];
    if (w) w(ev);
  }
  function listen(o) {
    if (on || location.protocol === 'file:' || !window.fetch) return;
    on = true; hooks = o;
    report(true);
    setInterval(function () { report(false); }, 2000);
    window.addEventListener('storage', function (e) { if (e.key === BOOK) report(true); });
    /* The page closes during a call: the other side is told at once. */
    window.addEventListener('pagehide', function () {
      Object.keys(watching).forEach(function (id) {
        try { navigator.sendBeacon(api() + 'call/' + encodeURIComponent(id), JSON.stringify({ type: 'hangup', robot: robotId() })); } catch (e) { /* best effort */ }
      });
    });
    waitLoop();
  }

  return {
    ICE: ICE, iceServers: iceServers, callAudio: callAudio, loud: loud, RELATIONS: RELATIONS, robotId: robotId, randomId: randomId, book: book, saveBook: saveBook, resident: resident, contact: contact,
    server: server, setServer: setServer, link: function (kind, token) { var s = server(); return (s ? s + '/' : location.origin + location.pathname.replace(/[^/]*$/, '')) + 'famille.html#' + kind + '=' + token; },
    relationPhrase: relationPhrase, availability: availability, expecting: expecting,
    request: request, send: send, gathered: gathered, media: media, listen: listen,
    watch: function (id, fn) { watching[id] = fn; },
    unwatch: function (id) { delete watching[id]; },
    report: function () { if (on) report(true); }
  };
})();

/* ---------- the call as a session: ring, call, then the mood question ---------- */
(function () {
  'use strict';
  if (!window.Lab) return;
  var esc = Lab.esc;
  function icon(body) { return '<svg viewBox="0 0 100 100" aria-hidden="true">' + body + '</svg>'; }
  var PICK_UP = icon('<g transform="rotate(-140 50 50)"><path d="M8 58 C30 30 70 30 92 58 L82 72 L64 62 L64 50 C56 46 44 46 36 50 L36 62 L18 72 Z" fill="currentColor"/></g>');
  var SPEAKER = '<path d="M12 38 h16 l24 -20 v64 l-24 -20 h-16 Z" fill="currentColor"/>';
  var VOL_DOWN = icon(SPEAKER + '<rect x="62" y="46" width="28" height="9" rx="4" fill="currentColor"/>');
  var VOL_UP = icon(SPEAKER + '<rect x="62" y="46" width="28" height="9" rx="4" fill="currentColor"/><rect x="71.5" y="36.5" width="9" height="28" rx="4" fill="currentColor"/>');
  var ME = icon('<circle cx="50" cy="34" r="18" fill="currentColor"/><path d="M14 90 q36 -56 72 0 Z" fill="currentColor"/>');
  var DICE = icon('<rect x="12" y="12" width="76" height="76" rx="16" fill="none" stroke="currentColor" stroke-width="8"/>' +
    '<circle cx="32" cy="32" r="7" fill="currentColor"/><circle cx="68" cy="32" r="7" fill="currentColor"/><circle cx="50" cy="50" r="7" fill="currentColor"/>' +
    '<circle cx="32" cy="68" r="7" fill="currentColor"/><circle cx="68" cy="68" r="7" fill="currentColor"/>');
  var RING_MS = 48000;     /* the server says "missed" after 45 s; this is the fallback if it cannot */
  var CONNECT_MS = 20000;  /* answered, but no connection after this long: the call failed */
  /* Ludo during the call: two players, one token each and the easy rules (out with a 6 or a 1, no
     exact roll to finish), so a game lasts a few minutes. */
  var GAME_TOKENS = 1, INVITE_MS = 45000, GAME_END_MS = 9000;
  var YOU = 0, CALLER = 1, SEAT_COLOR = ['red', 'blue'];

  /* Hand shapes, as in core.js. While pointing is on, the engine follows the finger only, so the open
     hand (answer) and the fist (not now, hang up) are recognised here (st.onHand). */
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function shape(lm) {
    var w = lm[0];
    function ext(tip, pip) { return dist(lm[tip], w) > dist(lm[pip], w) * 1.12; }
    var f = [ext(8, 6), ext(12, 10), ext(16, 14), ext(20, 18)];
    if (f[0] && f[1] && f[2] && f[3]) return 'open';
    if (!f[0] && !f[1] && !f[2] && !f[3]) return dist(lm[4], lm[17]) > dist(lm[3], lm[17]) * 1.15 ? 'other' : 'fist';
    return 'other';
  }
  /* map: { open: { ms, run, again }, fist: { ms, run } }. A hang-up by fist needs a longer hold: a
     resting, curled hand must not end a family call. Without "again" a sign acts once per screen;
     with it (rolling the die in a game) the hand has to drop or change before it acts again. */
  function holdSign(L, map) {
    var cur = null, since = 0, seen = 0, fired = false, spent = null;
    return function (lm, now) {
      if (fired || !L.air()) return;
      var g = lm ? shape(lm) : null;
      if (g && map[g]) {
        if (g !== cur) { cur = g; since = now; }
        seen = now;
        if (spent === g) return;
        if (now - since >= map[g].ms) { if (map[g].again) spent = g; else fired = true; map[g].run(); }
      } else if (now - seen > 400) { cur = null; spent = null; }
    };
  }
  /* A button pressed by a hand sign counts and is logged like any other input. */
  function press(L, i) {
    if (Lab._t && Lab._t.doAction) { Lab._t.doAction(i, 'hand'); return; }
    var st = L.step(), a = st && st.actions && st.actions[i];
    if (a && !a.disabled) { L.log('Pressed: ' + a.label + ' (hand)', 'action'); a.run('hand', a, i); }
  }
  /* The same, for the button with this id (the call screens change their buttons). */
  function pressId(L, id) {
    var acts = (L.step() || {}).actions || [];
    for (var i = 0; i < acts.length; i++) if (acts[i].id === id) { press(L, i); return; }
  }
  /* A missed, declined or failed call ends without the mood question; its outcome says why.
     (The engine has no setter for the outcome yet, so this uses its state; see the hand-over notes.) */
  function outcome(v) { var S = Lab._t && Lab._t.state; if (S && S.rec) S.rec.outcome = v; }
  function endNow(v) { if (Lab._t && Lab._t.state) Lab.endSession(); else Lab.endSession(v); }
  function mmss(s) { return Lab.pad(Math.floor(s / 60)) + ':' + Lab.pad(s % 60); }
  function stop(stream) { if (stream) stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* already stopped */ } }); }

  Lab.define({
    key: 'familycall', day: 9.5, name: 'Family call', zone: 'ROSE_ROOM', hidden: true, noAgain: true,
    flow: 'A real video call from a relative the care team invited (Family tab): it rings, the resident answers or not, then the mood question.',
    learn: 'Does the resident recognise the caller, answer and hang up without help? How do they feel afterwards?',
    art: function () { return ART.call; },
    start: function (L) {
      var T = L.t, d = Lab.startData || {}, c = d.contact || {};
      var name = String(c.name || '').trim() || T('Your family'), rel = FamilyCall.relationPhrase(c, L.lang());
      var face = c.photo && /^data:image\//.test(c.photo) ? '<img class="own" src="' + esc(c.photo) + '" alt="">' : ART.avatar(esc(name.charAt(0).toUpperCase()));
      var line = rel ? T('{name}, {relation}, is calling you.', { name: name, relation: rel }) : T('{name} is calling you.', { name: name });
      var call = { id: d.call, pc: null, local: null, remote: null, answered: false, over: false, ended: false, finished: false,
        answeredAt: 0, connectedAt: 0, volume: Lab.opt.volume || 0.9, showMe: false, needTap: false, timers: [], status: T('Connecting…'),
        dc: null, canPlay: false, invite: null, game: null, games: 0, note: '', peers: [], ice: [], ready: null, maxPeers: 0 };
      L.stat('callFrom', name);
      L.stat('callRelation', rel);
      L.stat('callAnswered', false);
      /* outgoing: the care team called the family; this screen waits until they join. */
      var out = d.outgoing || '';
      L.stat('callDirection', out ? 'care team called the family' : 'family called');
      L.log(out ? 'The care team calls the family of ' + Lab.patient + ': waiting for them to join (nothing is recorded)'
        : 'Incoming family call for ' + Lab.patient + ': the call camera and microphone start only if it is answered; nothing is recorded', 'call');
      function onCallEvent(ev) {
        if (ev.type === 'missed' && !call.answered) missed('nobody');
        else if (ev.type === 'hangup') { if (call.answered) hangUp('family'); else missed('family'); }
        else if (ev.type === 'taken' && !call.answered && !call.over) elsewhere();
        else if (ev.type === 'peer-join') onPeerJoin(ev);
        else if (ev.type === 'peer-leave') onPeerLeave(ev);
      }
      if (call.id) FamilyCall.watch(call.id, onCallEvent);
      if (out) {
        FamilyCall.watch(out, function (ev) {
          if (call.over) return;
          /* The family opened the link and pressed "Join": answer at once, the resident is waiting. */
          if (ev.type === 'call' && !call.answered) {
            call.id = ev.call; d.call = ev.call; d.sdp = ev.sdp; d.peer = ev.peer;
            FamilyCall.watch(call.id, onCallEvent);
            L.log('The family joined the call', 'call');
            answer();
          } else if (ev.type === 'outgoing-end' && !call.answered && (ev.reason === 'declined' || ev.reason === 'missed')) {
            /* 15 Nov: it rang on the relative's phone: "Sophie kann gerade nicht" / "Sophie hat nicht abgenommen", calmly */
            endStats(ev.reason === 'declined' ? 'family' : 'nobody');
            cleanup();
            L.log(ev.reason === 'declined' ? 'The family member declined the call on the phone' : 'Nobody answered the call on the phone', 'call');
            outcome(ev.reason === 'declined' ? 'declined' : 'missed');
            L.quiet();
            var t1 = ev.reason === 'declined' ? T('{name} cannot take the call right now.', { name: name }) : T('{name} did not answer.', { name: name });
            L.go({ id: 'calling-out-end', final: true, center: true, title: t1, lead: T('We will try again later.'), say: t1 + ' ' + T('We will try again later.'), back: false, noHistory: true,
              actions: [{ label: T('Finish'), primary: true, noLabelWords: true, words: [], run: function () { endNow(ev.reason); } }] }, { clear: true });
            setTimeout(function () { if (L.step() && L.step().id === 'calling-out-end') endNow(ev.reason); }, 9000);
          } else if (ev.type === 'outgoing-end' && !call.answered) {
            endStats(ev.reason === 'cancelled' ? 'staff' : 'nobody');
            cleanup();
            L.log(ev.reason === 'cancelled' ? 'The care team cancelled the call to the family' : 'The family did not join in time', 'call');
            outcome(ev.reason === 'cancelled' ? 'cancelled' : 'missed');
            L.quiet();
            endNow(ev.reason);
          }
        });
      }
      /* A second patient-screen window of this robot answered or declined: this one stops ringing
         and keeps no record (the other window has it). */
      function elsewhere() {
        cleanup();
        var S = Lab._t && Lab._t.state;
        if (S && S.rec) S.rec.notStarted = true;
        L.log('The call was taken on another screen of this robot', 'call');
        L.quiet();
        endNow('taken elsewhere');
      }

      function seconds() { return call.connectedAt ? Math.round((Date.now() - call.connectedAt) / 1000) : 0; }
      function later(fn, ms) { call.timers.push(setTimeout(fn, ms)); }
      function cleanup() {
        call.over = true;
        if (call.id) FamilyCall.unwatch(call.id);
        if (out) FamilyCall.unwatch(out);
        /* The robot's sound back to normal (no-op in a browser or when it was not switched). */
        FamilyCall.callAudio(false);
        call.timers.forEach(clearTimeout); call.timers = [];
        document.removeEventListener('pointerdown', unmute, true);
        stop(call.local);
        call.peers.forEach(function (p) { if (p.pc) { try { p.pc.close(); } catch (e) { /* already closed */ } } });
        call.local = null;
        document.querySelectorAll('#screen video.fcremote, #screen video.fcmine').forEach(function (v) { v.srcObject = null; });
      }
      function endStats(by) {
        L.stat('callSeconds', seconds());
        L.stat('callEndedBy', by);
      }

      /* ---------- the care team called the family: waiting for them ---------- */
      function waitStep() {
        var title = T('We are calling {name}…', { name: name }), lead = T('As soon as {name} answers, the call begins.', { name: name });
        var st = {
          id: 'calling-out', eyebrow: T('Video call'), title: title, lead: lead, back: false, noHistory: true, noStop: true, noReprompt: true, airPointer: true, cls: 'callscreen fcall',
          body: '<div class="call ringing fcring"><div class="who">' + face + '</div><span class="callname">' + esc(name) + '</span>' +
            (rel ? '<span class="callstate">' + esc(rel.charAt(0).toUpperCase() + rel.slice(1)) + '</span>' : '') + '</div>',
          say: title + ' ' + lead,
          actions: [{ id: 'cancel', label: T('Cancel'), icon: ART.ui.hangUp, cls: 'round danger fcdecline', gesture: 'fist', noLabelWords: true, words: [], run: cancelOut }],
          onHand: holdSign(L, { fist: { ms: 2500, run: function () { pressId(L, 'cancel'); } } }),
          /* The session was ended from outside (staff panel, a new session): the call is cancelled. */
          leave: function () {
            if (call.answered || call.over) return;
            FamilyCall.request('POST', 'outgoing/cancel', { robot: FamilyCall.robotId(), token: out }).catch(function () {});
            endStats('staff');
            cleanup();
          }
        };
        return st;
      }
      function cancelOut() {
        if (call.answered || call.over) return;
        FamilyCall.request('POST', 'outgoing/cancel', { robot: FamilyCall.robotId(), token: out }).catch(function () {});
        endStats('resident');
        cleanup();
        L.log('The call to the family was cancelled on the patient screen', 'call');
        outcome('cancelled');
        L.quiet();
        endNow('cancelled');
      }

      /* ---------- ringing ---------- */
      function ringStep() {
        var st = {
          id: 'ringing', eyebrow: T('Video call'), title: line, back: false, noHistory: true, noStop: true, noReprompt: true, airPointer: true, cls: 'callscreen fcall',
          body: '<div class="call ringing fcring"><div class="who">' + face + '</div><span class="callname">' + esc(name) + '</span>' +
            (rel ? '<span class="callstate">' + esc(rel.charAt(0).toUpperCase() + rel.slice(1)) + '</span>' : '') + '</div>',
          say: line,
          /* A soft ring, then Bellatrix says again who is calling, until it is answered or missed. */
          afterSay: function () { ringAgain(); },
          actions: [
            { label: T('Answer'), icon: PICK_UP, primary: true, cls: 'round fcanswer', gesture: 'open', noLabelWords: true, words: [], run: answer },
            { label: T('Not now'), icon: ART.ui.hangUp, cls: 'round danger fcdecline', gesture: 'fist', noLabelWords: true, words: [], run: decline }
          ],
          onHand: holdSign(L, { open: { ms: 1500, run: function () { press(L, 0); } }, fist: { ms: 2000, run: function () { press(L, 1); } } }),
          enter: function () {
            later(function () {
              if (call.answered || call.over) return;
              FamilyCall.send(call.id, { type: 'missed' }).catch(function () { /* the server may have ended it already */ });
              missed('nobody');
            }, RING_MS);
          },
          /* The session was ended from outside (staff panel, a new session): the caller is told. */
          leave: function () {
            if (call.answered || call.over) return;
            FamilyCall.send(call.id, { type: 'hangup' }).catch(function () {});
            endStats('staff');
            cleanup();
          }
        };
        function ringAgain() {
          if (L.step() !== st) return;
          L.ring(4, function () { if (L.step() === st) L.say(line, ringAgain); });
        }
        return st;
      }
      function missed(by) {
        if (call.over) return;
        endStats(by);
        cleanup();
        L.stat('callAnswered', false);
        L.log(by === 'family' ? 'The caller hung up before the call was answered' : 'Nobody answered the call', 'call');
        outcome('missed');
        L.quiet();
        endNow('missed');
      }
      function decline() {
        if (call.answered || call.over) return;
        FamilyCall.send(call.id, { type: 'decline' }).catch(function () {});
        endStats('resident');
        cleanup();
        L.log('The resident chose not to answer now', 'call');
        outcome('declined');
        L.go(byeStep(T('That is fine. {name} can call again another time.', { name: name })), { clear: true });
      }
      /* A last sentence, then back to the waiting screen by itself. */
      function byeStep(text) {
        var st = { id: 'call-over', final: true, center: true, noCam: true, title: text, say: text, afterSay: function () { done(); } };
        st.enter = function () { L.later(done, 9000); };
        function done() { if (L.step() === st) endNow(); }
        return st;
      }

      /* ---------- the call ---------- */
      /* ---------- the relatives in the call (1 to 3) ----------
         The robot holds one connection per relative: it sends its picture to each and receives each one's.
         The first relative is the one who rang; the others join the running call (js/famille.js offers to
         them through the call server) and the resident does not have to do anything. */
      function newPeer(id, contactId, who) {
        var p = { id: id || 'p0', contactId: contactId, name: String((who && who.name) || '').trim() || T('Your family'), pc: null, remote: null, dc: null, connected: false, gone: false, first: !call.peers.length };
        call.peers.push(p);
        call.maxPeers = Math.max(call.maxPeers, livePeers().length);
        L.stat('callPeers', call.maxPeers);
        return p;
      }
      function livePeers() { return call.peers.filter(function (p) { return !p.gone; }); }
      function peerById(id) { for (var i = 0; i < call.peers.length; i++) if (call.peers[i].id === id) return call.peers[i]; return null; }
      function tileOf(p) { return document.querySelector('#screen .fctile[data-peer="' + p.id + '"]'); }

      function answer() {
        if (call.answered || call.over) return;
        call.answered = true;
        var first = newPeer(d.peer, d.contact && d.contact.id, c);
        var readyOk; call.ready = new Promise(function (ok) { readyOk = ok; });
        L.log('Call answered: the call camera and microphone start (not recorded)', 'call');
        L.go(inCallStep(), { replace: true });
        FamilyCall.media().catch(function (e) {
          L.log('Call camera and microphone unavailable (' + (e && (e.name || e.message) || e) + '): the resident sees and hears the caller only', 'error');
          return null;
        }).then(function (stream) {
          /* The STUN/TURN list from the call server (none if it does not answer). */
          return FamilyCall.iceServers().then(function (list) { call.ice = list; return stream; });
        }).then(function (stream) {
          if (call.over) { stop(stream); readyOk(); return null; }
          call.local = stream;
          if (stream) L.log('Call media on: ' + (stream.getVideoTracks().length ? 'camera and microphone' : 'microphone only'), 'camera');
          readyOk();
          return connectPeer(first, d.sdp, true).then(function () {
            if (call.over) return;
            call.answeredAt = Date.now();
            L.stat('callAnswered', true);
            later(function () { if (!call.connectedAt && !call.over) { L.log('No connection ' + (CONNECT_MS / 1000) + ' s after answering', 'error'); hangUp('network'); } }, CONNECT_MS);
            /* Now that the call camera is known, the "Show me" button can be offered. */
            var st = L.step();
            if (st && st.id === 'in-call' && canShowMe()) { build(st); L.refresh(); }
          });
        }).catch(function (e) {
          readyOk();
          if (call.over) return;
          L.log('The call could not start: ' + (e && e.message ? e.message : e), 'error');
          /* The caller hung up, or the ring time ran out, just before the answer arrived. */
          if (e && e.status === 409) { missed(e.body && e.body.state === 'missed' ? 'nobody' : 'family'); return; }
          hangUp('network');
        });
      }
      /* One connection to one relative: their offer in, our answer out (the first relative's answer ends the
         ringing; the others' answers go to that relative only). */
      function connectPeer(p, offer, isFirst) {
        var pc = p.pc = new RTCPeerConnection({ iceServers: call.ice });
        pc.ontrack = function (e) {
          var s = e.streams && e.streams[0];
          if (s) p.remote = s;
          else { p.remote = p.remote || new MediaStream(); p.remote.addTrack(e.track); }
          attach();
        };
        pc.onconnectionstatechange = function () { onConnection(p); };
        /* The family page opens a data channel "game" with its offer (an older page does not: then there
           is no game button). Game moves and the list of names travel on it, not through the call server. */
        pc.ondatachannel = function (e) { if (e.channel && e.channel.label === 'game') peerChannel(p, e.channel); };
        return pc.setRemoteDescription({ type: 'offer', sdp: offer }).then(function () {
          if (call.local) call.local.getTracks().forEach(function (t) { pc.addTrack(t, call.local); });
          return pc.createAnswer();
        }).then(function (a) { return pc.setLocalDescription(a); })
          .then(function () { return FamilyCall.gathered(pc, 5000); })
          .then(function () {
            if (call.over || p.gone) return;
            return FamilyCall.send(call.id, isFirst ? { type: 'answer', sdp: pc.localDescription.sdp } : { type: 'peer-answer', peer: p.id, sdp: pc.localDescription.sdp });
          });
      }
      function onPeerJoin(ev) {
        if (call.over || !call.answered || peerById(ev.peer)) return;
        var who = FamilyCall.contact(d.resident, ev.contactId);
        /* A contact removed on this device: not put through. */
        if (!who) { FamilyCall.send(call.id, { type: 'peer-reject', peer: ev.peer }).catch(function () {}); return; }
        var p = newPeer(ev.peer, ev.contactId, who);
        if (call.game) endGame('lost');
        if (call.invite) { call.invite = null; sendGame({ type: 'cancel' }); }
        L.log(p.name + ' joins the call (' + livePeers().length + ' relatives now)', 'call');
        call.ready.then(function () {
          if (call.over || p.gone) return null;
          return connectPeer(p, ev.sdp, false);
        }).catch(function (e) {
          L.log('A relative could not be put through (' + (e && e.message ? e.message : e) + ')', 'error');
          if (!call.over && !p.gone) { dropPeer(p, 'peer-reject'); }
        });
        callNote(T('{name} joined the call.', { name: p.name }), 5000);
        applyCaps();
        sendRoster();
      }
      function onPeerLeave(ev) {
        var p = peerById(ev.peer);
        if (!p || p.gone || call.over) return;
        L.log(p.name + ' left the call', 'call');
        dropPeer(p, '');
        callNote(T('{name} left the call.', { name: p.name }), 5000);
      }
      /* A relative is gone (they left, or their connection broke): the others go on. tell: 'peer-gone' or
         'peer-reject' to tell the call server, '' when it told us. */
      function dropPeer(p, tell) {
        if (p.gone) return;
        p.gone = true;
        if (p.pc) { try { p.pc.close(); } catch (e) { /* already closed */ } }
        if (p.first) { call.dc = null; call.canPlay = false; }
        if (tell) FamilyCall.send(call.id, { type: tell, peer: p.id }).catch(function () {});
        var el = tileOf(p); if (el) el.remove();
        redraw();
        applyCaps();
        sendRoster();
      }
      /* The names of everybody in the call, sent to each relative's page (their tiles carry the names). */
      function sendRoster() {
        var list = livePeers().map(function (p) { return { peer: p.id, name: p.name }; });
        livePeers().forEach(function (p) {
          if (!p.dc || p.dc.readyState !== 'open') return;
          try { p.dc.send(JSON.stringify({ type: 'roster', you: p.id, peers: list })); } catch (e) { /* next change */ }
        });
      }
      function peerChannel(p, dc) {
        p.dc = dc;
        if (p.first) { gameChannel(dc); return; }
        dc.onmessage = function (e) {
          var m = null;
          try { m = JSON.parse(e.data); } catch (x) { m = null; }
          if (m && m.type === 'hello') sendRoster();
        };
      }
      /* Two relatives or more: the robot's own picture is sent smaller and slower (about 360p, 15 images a
         second, 450 kbit/s) so that the robot stays smooth with several connections. */
      function applyCaps() {
        var group = livePeers().length >= 2;
        livePeers().forEach(function (p) {
          if (!p.pc || !p.pc.getSenders) return;
          p.pc.getSenders().forEach(function (snd) {
            if (!snd.track || snd.track.kind !== 'video' || !snd.getParameters) return;
            try {
              var prm = snd.getParameters();
              if (!prm.encodings || !prm.encodings.length) prm.encodings = [{}];
              var e = prm.encodings[0];
              if (group) { e.maxBitrate = 450000; e.maxFramerate = 15; e.scaleResolutionDownBy = 1.34; }
              else { delete e.maxBitrate; delete e.maxFramerate; delete e.scaleResolutionDownBy; }
              snd.setParameters(prm).catch(function () { /* not negotiated yet: tried again when it connects */ });
            } catch (err) { /* this browser keeps the defaults */ }
          });
        });
      }
      function onConnection(p) {
        var pc = p.pc, s = pc && pc.connectionState;
        if (!pc || call.over || p.gone) return;
        if (s === 'connected') {
          p.connected = true;
          var tile = tileOf(p); if (tile) tile.classList.add('on');
          applyCaps();
          if (!call.connectedAt) {
            call.connectedAt = Date.now();
            L.log('Call connected', 'call');
            /* On the robot: voice-call mode on the loudspeaker, call volume at its maximum (Family tab
               setting "Call sound at maximum"); put back in cleanup() however the call ends. */
            if (FamilyCall.callAudio(true)) L.log('Robot sound: call mode, loudspeaker, call volume at maximum', 'volume');
            var box = document.querySelector('#screen .fcvideo');
            if (box) box.classList.add('on');
          }
        } else if (s === 'failed') { L.log('Call connection failed', 'error'); lost(p); }
        else if (s === 'disconnected') {
          /* A short drop often comes back by itself. */
          later(function () { if (!call.over && !p.gone && p.pc && p.pc.connectionState !== 'connected') { L.log('Call connection lost', 'error'); lost(p); } }, 8000);
        }
      }
      /* One relative's connection broke: the call goes on for the others; with nobody left it ends. */
      function lost(p) {
        if (livePeers().length <= 1) hangUp('network');
        else dropPeer(p, 'peer-gone');
      }
      function attach() {
        livePeers().forEach(function (p) {
          var r = document.querySelector('#screen .fctile[data-peer="' + p.id + '"] video.fcremote');
          if (!r || !p.remote || r.srcObject === p.remote) return;
          r.srcObject = p.remote; r.volume = call.volume; r.muted = call.needTap;
          var pr = r.play();
          if (pr && pr.catch) pr.catch(function (err) {
            /* This browser wants a touch before it plays sound (a PC; the robot app allows it):
               the picture starts muted and a touch anywhere brings the sound. A re-drawn screen
               also cancels the old video's play() (AbortError): that one is no reason to ask. */
            if (call.over || r.muted || !r.isConnected || (err && err.name !== 'NotAllowedError')) return;
            call.needTap = true; r.muted = true; r.play().catch(function () {});
            var tip = document.querySelector('#screen .fctap'); if (tip) tip.hidden = false;
            document.addEventListener('pointerdown', unmute, true);
            L.log('The browser held the sound back until the screen is touched', 'error');
          });
        });
        var m = document.querySelector('#screen video.fcmine');
        if (m && call.local && m.srcObject !== call.local) { m.srcObject = call.local; m.play().catch(function () {}); }
      }
      function unmute() {
        call.needTap = false;
        document.removeEventListener('pointerdown', unmute, true);
        document.querySelectorAll('#screen video.fcremote').forEach(function (v) { v.muted = false; v.play().catch(function () {}); });
        var tip = document.querySelector('#screen .fctap'); if (tip) tip.hidden = true;
      }
      /* One button: each touch goes to the next level (quiet, medium, loud), then round again.
         delta other than 0 is a plain step (kept for other callers). */
      var LEVELS = [0.35, 0.65, 0.95];
      function volume(delta) {
        if (delta) call.volume = Math.max(0.1, Math.min(1, Math.round((call.volume + delta) * 100) / 100));
        else {
          var next = LEVELS.filter(function (v) { return v > call.volume + 0.02; })[0];
          call.volume = next || LEVELS[0];
        }
        document.querySelectorAll('#screen video.fcremote').forEach(function (v) { v.volume = call.volume; });
        L.stat('volumeChanges');
        L.log('Call volume ' + Math.round(call.volume * 100) + '%', 'volume');
        var el = document.querySelector('#screen .fcvol');
        if (el) {
          el.innerHTML = volBars(); el.hidden = false;
          clearTimeout(volume.t); volume.t = setTimeout(function () { el.hidden = true; }, 2200);
        }
      }
      function volBars() {
        var n = Math.round(call.volume * 10), h = '';
        for (var i = 1; i <= 10; i++) h += '<i' + (i <= n ? ' class="on"' : '') + '></i>';
        return h;
      }
      function toggleMe() {
        call.showMe = !call.showMe;
        L.log(call.showMe ? 'The resident shows their own picture' : 'The resident hides their own picture', 'camera');
        var st = L.step();
        build(st);
        var box = document.querySelector('#screen .fcself'); if (box) box.hidden = !call.showMe;
        st.actions.forEach(function (a, i) {
          var btn = a.id === 'me' ? document.querySelector('#screen [data-b="a-' + i + '"] .blbl') : null;
          if (btn) btn.textContent = a.label;
        });
        attach();
      }
      function canShowMe() { return !!(call.local && call.local.getVideoTracks().length); }
      /* The step's screen from the call's state: the call itself, or the game of Ludo. */
      function build(st) { if (call.game) buildGame(st); else buildCall(st); }
      /* The caller's video large; the resident's own picture off unless asked for (seeing oneself
         confuses many people with dementia). */
      function buildCall(st) {
        st.cls = 'callscreen fcall fcin';
        st.eyebrow = ''; st.title = ''; st.lead = ''; st.pic = ''; st.hint = ''; st.choices = null;
        var tiles = livePeers();
        st.body = '<div class="fcvideo' + (call.connectedAt && !call.ended ? ' on' : '') + (call.ended ? ' ended' : '') + (tiles.length > 1 ? ' multi' : '') + '">' +
          '<div class="fctiles n' + tiles.length + '">' + tiles.map(function (p) {
            return '<div class="fctile' + (p.connected ? ' on' : '') + '" data-peer="' + esc(p.id) + '"><div class="fcvbox"><video class="fcremote" autoplay playsinline></video></div>' +
              '<span class="fctilename">' + esc(p.name) + '</span></div>';
          }).join('') + '</div>' +
          '<div class="fcwait"><div class="who">' + face + '</div><span class="fcstate">' + esc(call.status) + '</span></div>' +
          '<span class="fcname">' + esc(name) + '</span><span class="fctimer" id="fcTimer">' + mmss(seconds()) + '</span>' +
          '<div class="fcself"' + (call.showMe ? '' : ' hidden') + '><video class="fcmine" muted playsinline autoplay></video></div>' +
          '<div class="fcvol" hidden></div>' +
          (call.note && !call.ended ? '<p class="fcnote">' + esc(call.note) + '</p>' : '') +
          '<p class="fctap"' + (call.needTap ? '' : ' hidden') + '>' + esc(T('Touch the screen for sound.')) + '</p></div>';
        /* 1.16: three very large buttons at most: Volume, Hang up (the main one) and Help (the engine's
           own button below). "Show me" and "Play together" are off this screen unless the care team
           switches them on (Family tab option, book().callExtras). */
        st.actions = call.ended ? [] : [
          { id: 'volume', label: T('Volume'), icon: VOL_UP, cls: 'round fcact fcvolbtn', noLabelWords: true, words: [], run: function () { volume(0); } },
          { id: 'hang', label: T('Hang up'), icon: ART.ui.hangUp, cls: 'round danger fchang fcact', gesture: 'fist', noLabelWords: true, words: [], run: function () { hangUp('resident'); } }
        ];
        var extras = !call.ended && FamilyCall.book().callExtras === true;
        if (extras && canShowMe()) st.actions.push({ id: 'me', label: call.showMe ? T('Hide me') : T('Show me'), icon: ME, cls: 'fcme', noLabelWords: true, words: [], run: toggleMe });
        if (extras && canPlay()) {
          st.actions.push({ id: 'play', label: call.invite ? T('Cancel the invitation') : T('Play together'), icon: DICE, primary: !call.invite, cls: 'fcplay',
            noLabelWords: true, words: [], run: invite });
        }
      }
      /* Shows the call or the game as it is now (the step stays the same: the call goes on). */
      function redraw() {
        var st = L.step();
        if (st && st.id === 'in-call' && !call.over) { build(st); L.refresh(); }
      }
      /* A short line on the call picture ("Waiting for Maria…"), gone after a while if asked. */
      function callNote(text, ms) {
        call.note = text;
        redraw();
        if (ms) later(function () { if (call.note === text) { call.note = ''; var el = document.querySelector('#screen .fcnote'); if (el) el.remove(); } }, ms);
      }

      /* ---------- Ludo with the caller, over the call's own data channel ----------
         This robot holds the game: it rolls, checks and moves, and after every change sends the whole
         state and the caller's legal moves; the family page only sends "roll" or "move" on its turn. */
      function canPlay() {
        return !!(call.canPlay && livePeers().length === 1 && call.dc && call.dc.readyState === 'open' && typeof BellatrixLudo !== 'undefined' && window.LudoBoard && !call.ended && !call.over);
      }
      function gameChannel(dc) {
        call.dc = dc;
        dc.onmessage = function (e) {
          var m = null;
          try { m = JSON.parse(e.data); } catch (x) { m = null; }
          if (m && typeof m === 'object') onGameMessage(m);
        };
        dc.onclose = function () {
          call.canPlay = false; call.invite = null;
          if (call.over) return;
          if (call.game) endGame('lost'); else redraw();
        };
      }
      function sendGame(m) {
        if (!call.dc || call.dc.readyState !== 'open') return false;
        try { call.dc.send(JSON.stringify(m)); return true; } catch (e) { return false; }
      }
      function invite() {
        if (call.game || !canPlay()) return;
        if (call.invite) {
          call.invite = null;
          sendGame({ type: 'cancel' });
          L.log('The resident took the game invitation back', 'game');
          callNote('');
          return;
        }
        var my = call.invite = { at: Date.now() };
        sendGame({ type: 'invite', game: 'ludo' });
        L.log('The resident invites the caller to play Ludo', 'game');
        callNote(T('Waiting for {name} to accept…', { name: name }));
        later(function () {
          if (call.invite !== my) return;
          call.invite = null;
          sendGame({ type: 'cancel' });
          L.log('No answer to the game invitation', 'game');
          callNote(T('{name} did not answer the invitation.', { name: name }), 6000);
        }, INVITE_MS);
      }
      function onGameMessage(m) {
        if (call.over) return;
        if (m.type === 'hello') {
          sendRoster();
          call.canPlay = Array.isArray(m.games) && m.games.indexOf('ludo') >= 0;
          if (call.canPlay && !call.game) redraw();
          return;
        }
        if (m.type === 'accept') {
          if (call.invite && !call.game) { call.invite = null; call.note = ''; startGame(); }
          else if (!call.game) sendGame({ type: 'cancel' });
          return;
        }
        if (m.type === 'decline') {
          if (!call.invite) return;
          call.invite = null;
          var no = T('{name} cannot play right now.', { name: name });
          L.log('The caller declined the game', 'game');
          callNote(no, 6000);
          L.say(no);
          return;
        }
        if (m.type === 'leave') { if (call.game) endGame('family'); return; }
        var g = call.game;
        if (!g || g.over || g.state.turn !== CALLER) return;
        /* A tap sent for an older position of the game (already played) is ignored. */
        if (m.step !== g.state.step) return;
        if (g.busy) { later(function () { onGameMessage(m); }, 300); return; }
        if (m.type === 'roll' && g.state.phase === 'roll') { L.log('The caller rolls the die', 'game'); roll(CALLER); }
        else if (m.type === 'move' && g.state.phase === 'move') move(CALLER, m.token);
      }
      function startGame() {
        var seats = SEAT_COLOR.map(function (c, i) { return { id: i === YOU ? 'here' : 'caller', arm: i === YOU ? 0 : 2, color: c, kind: 'human', name: '' }; });
        call.games = (call.games || 0) + 1;
        L.stat('callGames', call.games);
        call.game = { state: BellatrixLudo.create({ arms: 4, seats: seats, rules: BellatrixLudo.EASY, tokens: GAME_TOKENS }), busy: false, over: false, die: null, moving: null, note: '' };
        L.log('Ludo with the caller starts (2 players, ' + GAME_TOKENS + ' token each, easy rules)', 'game');
        redraw();
        sendState([]);
        L.say(T('The game begins. You start.'));
      }
      function myMoves(g) { return !g.over && !g.busy && g.state.turn === YOU && g.state.phase === 'move' ? BellatrixLudo.moves(g.state) : []; }
      function boardHtml(g) {
        var hot = {};
        hot[YOU] = myMoves(g).map(function (m) { return m.token; });
        return LudoBoard.boardSvg(g.state, { hot: hot, moving: g.moving });
      }
      function dieHtml(g) { return g.die ? LudoBoard.dieSvg(g.die.n, LudoBoard.COLORS[SEAT_COLOR[g.die.seat]]) : ''; }
      /* The board big, the caller's live picture small in the corner where no player sits (the call
         goes on), the die, and big buttons: roll, the token to move, back to the call, hang up. */
      function buildGame(st) {
        var g = call.game, s = g.state, mine = s.turn === YOU, w = s.winner;
        st.cls = 'fcall fcgameview';
        st.eyebrow = T('Ludo') + ' · ' + name;
        st.title = g.over ? (w === YOU ? T('You won!') : T('{name} won!', { name: name })) : mine ? T('Your turn.') : T('{name} is playing…', { name: name });
        st.lead = ''; st.hint = '';
        st.pic = '<div class="lgboard">' + boardHtml(g) + '</div>' +
          '<div class="fcpip"><video class="fcremote" autoplay playsinline></video><span class="fcpipname">' + esc(name) + '</span></div>';
        st.picCls = 'ludoboard fcgame';
        st.body = '<div class="lgrow"><div class="ludodie lgdie">' + dieHtml(g) + '</div><div class="lgtext">' +
          '<p class="lglegend"><span>' + LudoBoard.tokenIcon(SEAT_COLOR[YOU], '') + esc(T('You')) + '</span><span>' + LudoBoard.tokenIcon(SEAT_COLOR[CALLER], '') + esc(name) + '</span></p>' +
          '<p class="lgnote">' + esc(g.note) + '</p></div></div>';
        st.choices = null;
        st.actions = [];
        if (!g.over && !g.busy && mine && s.phase === 'roll') {
          st.actions.push({ id: 'roll', label: T('Roll the die'), icon: DICE, primary: true, cls: 'lgroll', gesture: 'open', noLabelWords: true, words: [], run: rollHere });
        }
        var moves = myMoves(g);
        if (moves.length) {
          st.choices = moves.map(function (m) {
            var what = m.enters ? T('come out') : m.finishes ? T('go home') : T('move {n}', { n: s.die });
            return { label: T('Token {n}: {what}', { n: m.token + 1, what: what }) + (m.captures && m.captures.length ? ' · ' + T('capture!') : ''),
              icon: LudoBoard.tokenIcon(SEAT_COLOR[YOU], m.token + 1), run: function () { moveHere(m.token); } };
          });
        }
        st.actions.push({ id: 'back', label: T('Back to the call'), pair: true, cls: 'soft', noLabelWords: true, words: [], run: function () { endGame('back'); } });
        st.actions.push({ id: 'hang', label: T('Hang up'), icon: ART.ui.hangUp, cls: 'danger soft fchangup', noLabelWords: true, words: [], run: function () { hangUp('resident'); } });
      }
      /* Animation frames change the board and the die in place: a full redraw would also restart the
         caller's video each time. */
      function paintGame() {
        var g = call.game, b = document.querySelector('#screen .lgboard'), d = document.querySelector('#screen .lgdie');
        if (!g) return;
        if (b) b.innerHTML = boardHtml(g);
        if (d) d.innerHTML = dieHtml(g);
      }
      function spin(g, n, seat, done) {
        var k = 0;
        (function turn() {
          if (call.game !== g) return;
          g.die = { n: k < 5 ? 1 + Math.floor(Math.random() * 6) : n, seat: seat };
          paintGame();
          if (k++ < 5) later(turn, 90); else done();
        })();
      }
      function hop(g, seat, token, from, to, done) {
        if (from < 0 || to <= from) { done(); return; }
        var pos = from;
        (function stepOn() {
          if (call.game !== g) return;
          pos++;
          g.moving = { seat: seat, token: token, pos: pos };
          paintGame();
          if (pos < to) later(stepOn, 130); else { g.moving = null; done(); }
        })();
      }
      function rollHere() {
        var g = call.game;
        /* A second tap on a button that is already gone must do nothing. */
        if (!g || g.busy || g.over || g.state.phase !== 'roll' || g.state.turn !== YOU) return;
        roll(YOU);
      }
      function moveHere(token) {
        var g = call.game;
        if (!g || g.busy || g.over || g.state.phase !== 'move' || g.state.turn !== YOU) return;
        move(YOU, token);
      }
      function roll(seat) {
        var g = call.game, n = 1 + Math.floor(Math.random() * 6);
        g.busy = true;
        redraw();
        spin(g, n, seat, function () {
          var r = BellatrixLudo.roll(g.state, n);
          g.state = r.state;
          g.busy = false;
          after(g, r.events);
        });
      }
      function move(seat, token) {
        var g = call.game, s = g.state;
        if (!BellatrixLudo.moves(s).some(function (m) { return m.token === token; })) return;
        var from = s.seats[seat].tokens[token], r = BellatrixLudo.move(s, token);
        g.state = r.state;
        g.busy = true;
        redraw();
        var to = g.state.seats[seat].tokens[token];
        hop(g, seat, token, from, to >= 0 ? to : from, function () { g.busy = false; after(g, r.events); });
      }
      /* What happened, said briefly in the resident's language, and sent to the family page. */
      function tell(g, events) {
        var parts = [];
        events.forEach(function (e) {
          var me = e.seat === YOU;
          if (e.type === 'roll') { g.die = { n: e.die, seat: e.seat }; parts.push(me ? T('You roll {die}.', { die: e.die }) : T('{player} rolls {die}.', { player: name, die: e.die })); }
          else if (e.type === 'nomove') parts.push(T('No move possible.'));
          else if (e.type === 'enter') parts.push(me ? T('You bring your token out.') : T('{player} brings a token out.', { player: name }));
          else if (e.type === 'capture') parts.push(e.by === YOU ? T('You send the token of {name} back home!', { name: name }) : T('{name} sends your token back home!', { name: name }));
          else if (e.type === 'finish') parts.push(me ? T('Your token is home!') : T('{player} brings a token home.', { player: name }));
          else if (e.type === 'extra' && e.reason === 'six') parts.push(me ? T('A six: you play again.') : T('A six: {player} plays again.', { player: name }));
        });
        return parts.join(' ');
      }
      function after(g, events) {
        if (call.game !== g) return;
        var line = tell(g, events);
        if (line) g.note = line;
        if (g.state.phase === 'over') g.over = true;
        sendState(events);
        if (g.over) { gameOver(g); return; }
        redraw();
        /* "Your turn." when the turn comes back to the resident (an extra roll already says so). */
        var yourTurn = events.some(function (e) { return e.type === 'turn' && e.seat === YOU; });
        var spoken = (line + (yourTurn ? ' ' + T('Your turn.') : '')).trim();
        if (spoken) L.say(spoken);
      }
      function sendState(events) {
        var g = call.game;
        if (!g) return;
        var s = g.state, theirs = !g.over && s.turn === CALLER && s.phase === 'move' ? BellatrixLudo.moves(s) : [];
        sendGame({ type: 'state', you: CALLER, step: s.step, state: s, die: g.die, over: g.over, winner: s.winner, events: events || [],
          moves: theirs.map(function (m) { return { token: m.token, enters: m.enters, finishes: m.finishes, captures: m.captures.length }; }) });
      }
      function gameOver(g) {
        var w = g.state.winner, won = w === YOU ? 'resident' : w === CALLER ? 'family' : 'none';
        L.stat('callGameWinner', won);
        L.log('Ludo with the caller over: ' + (won === 'resident' ? 'the resident wins' : won === 'family' ? 'the caller wins' : 'no winner'), 'result');
        redraw();
        var title = w === YOU ? T('You won!') : T('{name} won!', { name: name });
        L.say((w === YOU ? T('Well done!') + ' ' : '') + title + ' ' + T('Thank you for the game!'));
        later(function () { if (call.game === g) endGame('over'); }, GAME_END_MS);
      }
      /* Back to the full call view: the resident or the caller chose it, the game is over, or the
         data channel closed. A game left unfinished has no winner. */
      function endGame(reason) {
        var g = call.game;
        if (!g) return;
        if (!g.over) { L.stat('callGameWinner', 'none'); L.log('Ludo with the caller stopped before the end (' + reason + ')', 'game'); }
        call.game = null;
        sendGame({ type: 'end', reason: reason });
        call.note = '';
        if (reason === 'family' || reason === 'lost') callNote(T('The game has stopped.'), 5000);
        else redraw();
      }

      function inCallStep() {
        var st = {
          id: 'in-call', back: false, noHistory: true, noStop: true, noReprompt: true, airPointer: true, noAirHint: true, cls: 'callscreen fcall fcin', say: '',
          /* Any redraw (Help, the screen turning wide, the game) shows the call as it is now. */
          after: function () {
            var box = document.querySelector('#screen .fcvideo');
            if (box) box.classList.toggle('on', !!call.connectedAt && !call.ended);
            attach();
          },
          enter: function () {
            L.every(function () { var el = document.getElementById('fcTimer'); if (el && !call.ended) el.textContent = mmss(seconds()); }, 1000);
          },
          /* A held fist hangs up; in a game, a held open hand rolls the die (each roll a new sign). */
          onHand: holdSign(L, {
            fist: { ms: 2500, run: function () { if (!call.ended) pressId(L, 'hang'); } },
            open: { ms: 1500, again: true, run: function () { var g = call.game; if (g && !g.busy && !g.over && g.state.turn === YOU && g.state.phase === 'roll') pressId(L, 'roll'); } }
          }),
          /* Left without hanging up (the session was ended from the staff panel): hang up now. */
          leave: function () { if (!call.over) hangUp('staff'); }
        };
        build(st);
        return st;
      }
      function hangUp(by) {
        if (call.over) return;
        var secs = seconds();
        if (by !== 'family') FamilyCall.send(call.id, { type: 'hangup' }).catch(function () {});
        /* Hung up during a game: the call ends as before; the unfinished game has no winner. */
        if (call.game) {
          if (!call.game.over) L.stat('callGameWinner', 'none');
          L.log('The call ended during a game of Ludo', 'game');
          call.game = null;
        }
        call.invite = null; call.note = '';
        endStats(by);
        cleanup();
        L.log('Call ended by ' + ({ resident: 'the resident', family: 'the caller', network: 'a connection problem', staff: 'the care team' }[by] || by) + ' after ' + secs + ' s', 'call');
        var st = L.step();
        if (by === 'staff' || !st || st.id !== 'in-call') return;
        if (!call.connectedAt) {
          outcome('failed');
          L.go(byeStep(T('Sorry, the call could not be connected.') + ' ' + T('{name} can call again another time.', { name: name })), { clear: true });
          return;
        }
        /* The call view stays a moment with the caller's photo, then the mood question. */
        call.ended = true;
        call.status = T('The call with {name} has ended.', { name: name });
        build(st); L.refresh();
        var next = function () { if (!call.finished && L.step() === st) { call.finished = true; L.finish(); } };
        L.say(call.status, next);
        L.later(next, 9000);
      }
      return out ? waitStep() : ringStep();
    }
  });
})();
