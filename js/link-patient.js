/* Link, patient screen side (tablet, 1.17). When the link is set (localStorage bellatrix-call-server, https,
   and bellatrix-link-code, 6 to 12 characters), this page asks the server for the activity the care team
   sent from the robot's head (GET link/api/<code>/next, long-poll). A received run waits until a person
   is in front of the screen (js/presence.js); only then it is written to bellatrix-care-lab-run, exactly as
   the care team app does on one device, so patient.js shows "Ready when you are". The server is told
   received / present / absent / started / finished (with the session record) / cancelled.
   A run with a `place`: the robot is still driving there. Nothing starts (no presence) until the server
   sends {arrived:id}. Then presence, then Posture.ensureSeated (window.Posture, when present), and the
   server hears waiting-seat / seated; only then the run is written. Without `place`, as before.
   No text on this screen: it only starts what patient.js already shows. ES5. */
window.LinkPatient = (function () {
  'use strict';
  var RUN = 'bellatrix-care-lab-run';
  var S = { running: false, loop: 0, waiting: null, active: null, started: false, cancelling: false, unwatch: null, timer: null, wasPresent: false, seen: {}, ctrl: null, seating: false, seatCancel: null };

  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  /* The server must be https (plain http only for this computer, to test). */
  function base() {
    var k = ls('bellatrix-link-server').trim().replace(/\/+$/, '');
    var s = ls('bellatrix-call-server').trim().replace(/\/+$/, ''), c = ls('bellatrix-link-code').trim();
    if (!/^[A-Za-z0-9_-]{6,12}$/.test(c)) return '';
    /* bellatrix-link-server (the relay on the robot head, plain http on the Wi-Fi) wins over the call server */
    if (k && k.toLowerCase() !== 'local') return /^https?:\/\/[^\s\/]+/i.test(k) ? k + '/link/api/' + encodeURIComponent(c) + '/' : '';
    if (!/^https:\/\//i.test(s) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(s)) return '';
    return s + '/link/api/' + encodeURIComponent(c) + '/';
  }
  function req(method, path, body, wait) {
    var b = base();
    if (!b) return Promise.reject(new Error('no-link'));
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null, to = null;
    if (wait) S.ctrl = ctrl;
    if (ctrl) to = setTimeout(function () { ctrl.abort(); }, wait ? 40000 : 10000);
    return fetch(b + path, { method: method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { clearTimeout(to); if (!r.ok) throw new Error('http ' + r.status); return r.json(); }, function (e) { clearTimeout(to); throw e; });
  }
  function status(id, state, result) {
    var body = { id: id, state: state };
    if (state === 'finished' && result) body.result = result;
    return req('POST', 'status', body).catch(function () { return req('POST', 'status', body).catch(function () { /* the care team sees nothing new */ }); });
  }
  function stopWatch() { if (S.unwatch) { try { S.unwatch(); } catch (e) { /* gone */ } S.unwatch = null; } }

  /* ---------- a run arrives ---------- */
  function accept(run) {
    if (!run || !run.id || S.seen[run.id]) return;
    S.seen[run.id] = true;
    /* 14 Nov: a family visit carries the robot's family identity (opt.fam): js/family-visit-patient.js takes it out first. */
    if (window.FamilyVisit && FamilyVisit.onRun) { try { FamilyVisit.onRun(run); } catch (e) { if (run.opt) delete run.opt.fam; } }
    stopWatch();
    S.waiting = run; S.active = null; S.started = false; S.cancelling = false; S.wasPresent = false; S.seating = false; S.seatCancel = null;
    status(run.id, 'received');
    if (run.place) return;   // the robot is driving: presence is watched at {arrived:id}
    watch(run);
  }
  function arrived(id) {
    var run = S.waiting;
    if (!run || run.id !== id || !run.place || S.unwatch) return;
    watch(run);
  }
  function watch(run) {
    S.unwatch = Presence.watch(function (present) { onPresence(run, present); });
  }
  function onPresence(run, present) {
    if (S.waiting === run) {
      if (!present) return;
      S.waiting = null; S.active = run; S.wasPresent = true;
      if (run.place && window.Posture && Posture.ensureSeated) { seat(run); return; }
      write(run);
      return;
    }
    if (S.active === run && !S.started && !S.seating && present !== S.wasPresent) {
      S.wasPresent = present;
      status(run.id, present ? 'present' : 'absent');
    }
  }
  function seat(run) {
    var asked = false, ended = false;
    S.seating = true;
    status(run.id, 'present');
    var say = function () {
      if (!asked) { asked = true; status(run.id, 'waiting-seat'); }
      try { if (window.Lab && Lab.talk) return Lab.talk.apply(Lab, arguments); } catch (e) { /* silent */ }
    };
    var done = function () {
      if (ended) return;
      ended = true;
      if (S.active !== run) return;   // cancelled meanwhile
      S.seating = false; S.seatCancel = null;
      status(run.id, 'seated');
      write(run, true);
    };
    var c = null;
    try { c = Posture.ensureSeated({ lang: (run.opt && run.opt.lang) || (window.Lab && Lab.lang ? Lab.lang() : undefined), say: say }, done); } catch (e) { c = null; done(); }
    S.seatCancel = !ended && typeof c === 'function' ? c : null;
  }
  function write(run, afterSeat) {
    var note = { id: run.id, key: run.key, patient: run.patient, opt: run.opt || {}, preview: !!run.preview, auto: true, at: Date.now() };
    try { localStorage.setItem(RUN, JSON.stringify(note)); } catch (e) { /* storage full: the care team is not told "present" */ return; }
    if (!afterSeat) status(run.id, 'present');
  }
  function cancel(id) {
    if (S.seatCancel) { var sc = S.seatCancel; S.seatCancel = null; S.seating = false; try { sc(); } catch (e) { /* gone */ } }
    if (S.waiting && S.waiting.id === id) {
      S.waiting = null; stopWatch(); status(id, 'cancelled'); return;
    }
    if (S.active && S.active.id === id) {
      var r = null;
      try { r = JSON.parse(ls(RUN) || 'null'); } catch (e) { r = null; }
      if (r && r.id === id) { try { localStorage.removeItem(RUN); } catch (e) { /* ignore */ } }
      if (window.Lab && Lab.isOn && Lab.isOn()) { S.cancelling = true; Lab.endSession('cancelled by the care team'); }
      else { var a = S.active; S.active = null; stopWatch(); status(a.id, 'cancelled'); }
    }
  }

  /* ---------- the session started / ended on this screen ---------- */
  function checkStarted() {
    if (!S.active || S.started || !window.Lab || !Lab.isOn || !Lab.isOn()) return;
    var st = Lab._t && Lab._t.state, step = st && st.step;
    if (step && step.id && step.id !== 'ready') { S.started = true; stopWatch(); status(S.active.id, 'started'); }
  }
  function onEnd(rec) {
    var a = S.active;
    if (!a || !rec || rec.activity !== a.key) return;
    if (!S.started && !S.cancelling && !rec.notStarted) return;
    S.active = null; stopWatch();
    if (S.cancelling || rec.notStarted) { S.cancelling = false; status(a.id, 'cancelled'); }
    else if (!S.started) { S.active = a; return; }
    else status(a.id, 'finished', rec);
  }

  /* ---------- the long-poll ---------- */
  function poll(my) {
    if (!S.running || my !== S.loop) return;
    req('GET', 'next?wait=25', null, true).then(function (j) {
      if (my !== S.loop) return;
      if (j && j.run) accept(j.run); else if (j && j.cancel) cancel(j.cancel); else if (j && j.arrived) arrived(j.arrived);
      setTimeout(function () { poll(my); }, j && (j.run || j.cancel || j.arrived) ? 0 : 200);
    }, function () { setTimeout(function () { poll(my); }, 3000); });
  }
  function start() {
    if (S.running || !base()) return false;
    S.running = true; S.loop++;
    if (window.Lab && !Lab._linkWrapped) {
      Lab._linkWrapped = true;
      var prev = Lab.onSessionEnd;
      Lab.onSessionEnd = function (rec) { try { onEnd(rec); } catch (e) { /* the session still ends normally */ } if (prev) return prev.apply(this, arguments); };
    }
    S.timer = setInterval(checkStarted, 1000);
    poll(S.loop);
    return true;
  }
  function stop() {
    S.running = false; S.loop++; clearInterval(S.timer); stopWatch();
    if (S.ctrl) { try { S.ctrl.abort(); } catch (e) { /* done */ } }
  }
  function boot() {
    start();
    /* The link may be set later in the Care Team app on this device: look again from time to time. */
    setInterval(function () { if (!S.running) start(); else if (!base()) stop(); }, 10000);
  }
  if (typeof document !== 'undefined' && document.addEventListener && !window.__linkTest) document.addEventListener('DOMContentLoaded', boot);
  /* chain(key): the live run goes on in another activity (14 Nov: the family message becomes the family call,
     js/family-visit-patient.js): the end of THAT activity finishes the run, the robot goes home after it. */
  function chain(key) { if (S.active && key) { S.active.key = key; return true; } return false; }
  return { start: start, stop: stop, configured: function () { return !!base(); }, chain: chain, _state: S, _onEnd: onEnd };
})();
