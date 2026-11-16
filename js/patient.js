/* Bellatrix patient app: only the activities, nothing to configure.
   It waits calmly until the care-team app prepares a session on this device, shows a Begin button,
   runs the session, and hands the result back to the care team (the "inbox" in this device's storage).
   Three taps in the top left corner, while no session runs, open the care-team app. */
(function () {
  'use strict';
  /* The big portrait tablet (1080x1920 px, 720x1280 CSS px at 1.5 dpr): lay the page out on 1080 px so nothing is cut off. */
  try { var vm = document.querySelector('meta[name=viewport]'); if (vm && screen.height > screen.width && screen.width < 1000) vm.setAttribute('content', 'width=1080'); } catch (e) { /* normal viewport */ }
  var KEY = 'bellatrix-care-lab-v1', RUN = 'bellatrix-care-lab-run', INBOX = 'bellatrix-care-lab-inbox', LASTLANG = 'bellatrix-care-lab-lastlang';
  var $ = function (id) { return document.getElementById(id); };
  var esc = Lab.esc, shown = null, corner = [], current = null;

  function store() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function readRun() { try { return JSON.parse(localStorage.getItem(RUN) || 'null'); } catch (e) { return null; } }
  function openStaff() {
    if (window.BellatrixApp && window.BellatrixApp.openStaff) window.BellatrixApp.openStaff();
    else location.href = 'staff.html' + location.search;
  }
  function paint(html) {
    var s = $('screen');
    s.className = '';
    s.innerHTML = html;
    Lab.fit();
    Lab.arrange(s);
  }
  /* The waiting screen speaks the language of the last session on this screen. */
  function lastLang() { try { return I18N.valid(localStorage.getItem(LASTLANG)); } catch (e) { return 'en'; } }
  /* The waiting welcome keeps its time (and greeting) up to date each minute, in place, so the
     "Appeler ma famille" button mounted on the same screen is never repainted. */
  function tickWelcome() {
    var t = document.querySelector('#screen .dailywelcome .ttime'), h = document.querySelector('#screen header h2');
    if (!t || Lab.isOn()) return;
    try {
      var W = Daily.welcome({ lang: lastLang(), code: String(Lab.patient || (store().settings || {}).participant || '') });
      if (t.textContent !== W.time) t.textContent = W.time;
      if (h && h.textContent !== W.greeting) h.textContent = W.greeting;
    } catch (e) { /* the screen stays as it is */ }
  }
  var WELCOME_ON = false;
  function waiting() {
    shown = null;
    var L = lastLang(), T = function (t) { return I18N.t(L, t); };
    /* In a PC browser (not the robot app) sound and speech wait for a first click on the page, so a
       family call could not ring: a small note asks for that click while calls are expected. */
    var ua = navigator.userActivation, wake = !window.BellatrixApp && ua && !ua.hasBeenActive && window.FamilyCall && FamilyCall.expecting();
    var W = null;
    /* The big date card of the daily welcome made the waiting screen too large for Rahma (12 Nov): off, the old calm screen is back. */
    try { W = WELCOME_ON && window.Daily && Daily.welcome({ lang: L, code: String(Lab.patient || (store().settings || {}).participant || '') }); } catch (e) { W = null; }
    if (W) {
      /* The day's welcome: one title, the date card (date, season, time), one short line. */
      paint('<header><h2>' + esc(W.greeting) + '</h2></header>' +
        '<div class="picture todaybox dailywelcome">' + W.card + '</div>' +
        (W.line ? '<p class="note dwline">' + esc(W.line) + '</p>' : '') +
        '<div class="picture facebox dwface">' + Lab.logoHtml() + '</div>' +
        (wake ? '<p class="note fcwake">' + esc(T('Family calls: click once on this screen so that Bellatrix can ring and speak.')) + '</p>' : ''));
      return;
    }
    paint('<header><h2>' + esc(T('Hello, I am Bellatrix.')) + '</h2></header>' +
      '<div class="picture facebox">' + Lab.logoHtml() + '</div>' +
      (wake ? '<p class="note fcwake">' + esc(T('Family calls: click once on this screen so that Bellatrix can ring and speak.')) + '</p>' : ''));
  }
  /* A session prepared by the care team starts at once on its Begin screen. Begin is a step of the
     session, so it can be touched or pointed at from a distance like every other button. */
  function ready(run) {
    if (shown === run.id) return;
    shown = run.id;
    begin(run);
  }
  function begin(run) {
    var p = (store().patients || {})[run.patient] || {};
    Object.keys(run.opt || {}).forEach(function (k) { Lab.opt[k] = run.opt[k]; });
    Lab.patient = run.patient;
    Lab.content = p.content || {};
    try { localStorage.removeItem(RUN); localStorage.setItem(LASTLANG, Lab.lang()); } catch (e) { /* it is only a hand-over note */ }
    current = run.id;
    Lab.start(run.key, { preview: run.preview, ready: !run.auto });
  }
  function check() {
    /* An activity from a Library pack arrives a moment after the page (signature check first); one
       whose pack is not active in this care home never starts. */
    var run = readRun(), fresh = run && Lab.byKey[run.key] && (typeof Store === 'undefined' || Store.allowed(run.key)) && Date.now() - run.at < 60 * 60 * 1000;
    if (Lab.isOn()) {
      /* The care team started another activity while one is still open here (left on its Begin
         screen, or the robot's home button was used): the open one ends and the new one starts.
         Otherwise this screen would keep showing the old activity. */
      if (fresh && run.id !== current) { shown = null; Lab.endSession('replaced by a new session from the care team'); }
      return;
    }
    if (fresh) ready(run);
    else if (shown !== null || !$('screen').innerHTML) waiting();
  }

  /* ---------- family calls (js/familycall.js) ----------
     While this screen is open it tells the call server that it is here and whether a session runs.
     A call rings at once on the waiting screen, and also when the last session only shows its
     closing screen (that session is complete and is saved first). During any other session the
     caller hears that the resident is busy. */
  function inSession() {
    if (!Lab.isOn()) return false;
    var S = Lab._t && Lab._t.state;
    return !(S && S.step && S.step.final);
  }
  function familyCall(call) {
    if (inSession() || !Lab.byKey.familycall) return false;
    if (Lab.isOn()) Lab.endSession();
    if (Lab.isOn()) return false;   /* a session from the care team started meanwhile */
    /* The called resident's own settings, as the care team set them (language, voice speed, volume). */
    var s = store(), p = (s.patients || {})[call.resident] || {}, pr = p.prefs || {}, st = s.settings || {}, o = Lab.opt;
    o.participant = call.resident; o.staff = st.staff || ''; o.zone = ''; o.mapRev = st.mapRev || ''; o.sw = st.sw || '';
    o.camMode = st.camMode || 'off'; o.camMove = false;
    /* No voice answers during a call: the microphone belongs to the call, and the caller's words
       must never press a button on this screen. */
    o.voice = false;
    o.profile = pr.profile || ''; o.greet = pr.greet || ''; o.rate = pr.rate || 0.92; o.volume = pr.volume || 0.9;
    o.textSize = pr.textSize || 'normal'; o.subtitles = !!pr.subtitles; o.lang = I18N.valid(pr.lang); o.mood = pr.mood !== false;
    Lab.patient = call.resident;
    Lab.content = p.content || {};
    try { localStorage.setItem(LASTLANG, Lab.lang()); } catch (e) { /* only for the waiting screen */ }
    current = shown = 'call:' + (call.call || call.outgoing);
    Lab.start('familycall', { direct: true, data: call });
    return true;
  }

  Lab.onSessionEnd = function (rec) {
    if (rec.notStarted) { shown = null; waiting(); check(); return; }
    if (!rec.preview) {
      var inbox = [];
      try { inbox = JSON.parse(localStorage.getItem(INBOX) || '[]') || []; } catch (e) { inbox = []; }
      inbox.push(rec);
      try { localStorage.setItem(INBOX, JSON.stringify(inbox)); }
      catch (e) { Lab.toast(Lab.t('This screen could not save the session.')); }
    }
    Lab.toast(rec.preview ? Lab.t('Preview finished. Nothing was saved.') : Lab.t('Thank you! The care team sees this session in Results.'));
    shown = null;
    waiting();
    check();
  };

  document.addEventListener('DOMContentLoaded', function () {
    $('app').hidden = false;
    waiting();
    Media.ready.then(check);
    window.addEventListener('storage', function (e) { if (e.key === RUN) check(); });
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(); });
    $('stage').addEventListener('pointerdown', function (e) {
      if (Lab.isOn()) return;
      var r = $('stage').getBoundingClientRect(), s = r.width / Lab.stageW();
      if ((e.clientX - r.left) / s > 160 || (e.clientY - r.top) / s > 160) return;
      var now = Date.now();
      corner = corner.filter(function (t) { return now - t < 2000; });
      corner.push(now);
      if (corner.length >= 3) { corner = []; openStaff(); }
    });
    /* ONE patient page only (12 Nov): opening the patient app twice left an old hidden page that took the
       prepared sessions and the calls ("busy", a game that never shows). The newest page owns the screen;
       an older one blanks itself at once. */
    (function () {
      var OWNER = 'bellatrix-patient-owner', ME = String(Date.now()) + Math.random().toString(36).slice(2, 8);
      try { localStorage.setItem(OWNER, ME); } catch (e) { return; }
      setInterval(function () { try { if (localStorage.getItem(OWNER) !== ME) location.replace('about:blank'); } catch (e) { /* stays */ } }, 1500);
    })();
    setInterval(check, 2000);
    setInterval(tickWelcome, 20000);
    if (window.FamilyCall) {
      /* outgoing: the care team calls the family; this screen waits for them (started like a call). */
      FamilyCall.listen({ busy: inSession, ring: familyCall, outgoing: familyCall });
      document.addEventListener('pointerdown', function () { var n = document.querySelector('.fcwake'); if (n) n.remove(); }, true);
    }
  });
})();
