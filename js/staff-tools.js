/* Care Team tools (block B of the b1 briefing): the start-of-shift checklist (B3), the screen hygiene
   reminder with its cleaning lock (B1), the demo mode (B2) and the staff journal they share.
   Everything is mounted from here into staff.html: a "Tools" button next to the tabs, banners under
   the header, and full-page sheets. ES5 only (the robot's WebView is Chrome 95). Every text goes
   through ST(); French and German are in js/i18n-staff.js (English is the key).

   In localStorage (the patient screen runs in the same app, so it sees the same keys):
   - 'bellatrix-staff-journal'  [{id, at, type, staff, kind, cleaning, result, detail}], newest last
   - 'bellatrix-staff-tools'    settings {lockSeconds, batteryMin, critical, houseRule}
   - 'bellatrix-staff-initials' who uses the Care Team app on this device ("Who are you?")
   - 'bellatrix-staff-only'     {on, at, by, missing}: resident launches are off until lifted
   - 'bellatrix-hygiene-due'    {kind, at}: written by the karaoke after a group session, read here
   - 'bellatrix-hygiene-later'  the `at` of a reminder put off with "Later"
   The demo mode stores nothing: its state is in memory and its player is a separate frame whose
   storage, database, network writes and file saving are all switched off (guardRealm). */
(function (root) {
  'use strict';

  var K = {
    journal: 'bellatrix-staff-journal', settings: 'bellatrix-staff-tools', initials: 'bellatrix-staff-initials',
    staffOnly: 'bellatrix-staff-only', due: 'bellatrix-hygiene-due', later: 'bellatrix-hygiene-later',
    premiumReq: 'bellatrix-play-premium-request', main: 'bellatrix-care-lab-v1'
  };
  var LINES = ['battery', 'wifi', 'volume', 'screen', 'content', 'zone'];
  /* No battery threshold by default: the briefing forbids inventing one (the care home sets it). */
  var DEFAULTS = { lockSeconds: 60, batteryMin: null, critical: ['battery', 'wifi'], houseRule: '' };
  var HOLD_MS = 3000, JOURNAL_MAX = 3000;
  var clock = { now: function () { return Date.now(); } };

  /* ---------- small helpers ---------- */
  function fill(s, v) { return String(s).replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] !== undefined ? String(v[x]) : m; }); }
  function T(k, v) { return root.ST ? root.ST(k, v) : fill(k, v); }
  function lang() { return root.ST && root.ST.lang ? root.ST.lang() : 'en'; }
  /* "Ready" and "Done" already mean "Begin" and "Finished" elsewhere in the app: here they are
     "Prêt" and "Fait", under their own keys ('staff-tools:Ready'). */
  function TX(en, v) {
    var l = lang(), d = root.I18N && root.I18N.dict ? root.I18N.dict[l] : null, k = 'staff-tools:' + en;
    return fill(l !== 'en' && d && Object.prototype.hasOwnProperty.call(d, k) ? d[k] : en, v);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function dateStr(d) { d = d || new Date(clock.now()); return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()); }
  function hm(v) { var d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? '' : two(d.getHours()) + ':' + two(d.getMinutes()); }
  var LOCALE = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE' };
  function dayLabel(v) {
    var d = new Date(v);
    if (isNaN(d.getTime())) return '';
    try { return d.toLocaleDateString(LOCALE[lang()] || 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (e) { return dateStr(d); }
  }
  function mmss(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + two(s % 60); }

  /* ---------- storage: one door for every write of this file, closed in demo mode ---------- */
  var demo = { on: false, run: null, player: null, win: null, frame: null };
  function ls() { try { return root.localStorage || null; } catch (e) { return null; } }
  function getStr(k) { var s = ls(); try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function getJSON(k, d) {
    var v = getStr(k);
    if (v == null) return d;
    try { var o = JSON.parse(v); return o == null ? d : o; } catch (e) { return d; }
  }
  function write(k, v) {
    if (demo.on) return false;
    var s = ls();
    if (!s) return false;
    try {
      if (v === null) s.removeItem(k);
      else s.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      return true;
    } catch (e) { return false; }
  }
  function fire() { try { root.dispatchEvent(new root.CustomEvent('bellatrix-staff-tools')); } catch (e) { /* tests, old browsers */ } }

  /* ---------- settings ---------- */
  function lockSeconds(v) { var n = parseInt(v, 10); return isFinite(n) && n >= 10 && n <= 600 ? n : DEFAULTS.lockSeconds; }
  function batteryMin(v) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    var n = Number(v);
    return isFinite(n) && n >= 1 && n <= 100 ? Math.round(n) : null;
  }
  function settings() {
    var s = getJSON(K.settings, {});
    if (!s || typeof s !== 'object') s = {};
    return {
      lockSeconds: lockSeconds(s.lockSeconds === undefined ? DEFAULTS.lockSeconds : s.lockSeconds),
      batteryMin: batteryMin(s.batteryMin),
      critical: Array.isArray(s.critical) ? s.critical.filter(function (k) { return LINES.indexOf(k) >= 0; }) : DEFAULTS.critical.slice(),
      houseRule: typeof s.houseRule === 'string' ? s.houseRule : ''
    };
  }
  function saveSettings(patch) {
    var s = settings();
    Object.keys(patch || {}).forEach(function (k) { if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) s[k] = patch[k]; });
    s.lockSeconds = lockSeconds(s.lockSeconds); s.batteryMin = batteryMin(s.batteryMin);
    return write(K.settings, s);
  }

  /* ---------- who is on duty: initials only, there are no accounts ---------- */
  function cleanInitials(v) { return String(v || '').replace(/[^A-Za-z0-9À-ÖØ-öø-ÿ.\- ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 6); }
  function initials() { return cleanInitials(getStr(K.initials)); }
  function setInitials(v) { v = cleanInitials(v); return v ? write(K.initials, v) : false; }

  /* ---------- the staff journal (B1 cleaning, B3 checklists and overrides) ---------- */
  var Journal = {
    list: function () { var a = getJSON(K.journal, []); return Array.isArray(a) ? a : []; },
    add: function (e) {
      if (demo.on || !e || !e.type) return null;
      var now = new Date(clock.now()), list = Journal.list();
      var rec = {
        id: 'J' + now.getTime().toString(36) + Math.floor(Math.random() * 1296).toString(36),
        at: now.toISOString(), type: e.type, staff: cleanInitials(e.staff), kind: e.kind || '',
        cleaning: e.cleaning === undefined ? null : !!e.cleaning, result: e.result || '', detail: e.detail || ''
      };
      list.push(rec);
      if (list.length > JOURNAL_MAX) list = list.slice(list.length - JOURNAL_MAX);
      if (!write(K.journal, list)) return null;
      fire();
      return rec;
    },
    today: function (type) {
      var d = dateStr();
      return Journal.list().filter(function (r) { return (!type || r.type === type) && dateStr(new Date(r.at)) === d; });
    },
    /* The file stays in English, like the other Care Team reports. */
    csv: function () {
      var TYPE = { hygiene: 'screen cleaned', checklist: 'start-of-shift checklist', override: 'override', 'staff-only': 'staff only mode' };
      var rows = [['date', 'time', 'type', 'staff', 'session', 'cleaning_mode', 'result', 'details']].concat(Journal.list().map(function (r) {
        var d = new Date(r.at);
        return [dateStr(d), hm(d), TYPE[r.type] || r.type, r.staff, r.kind, r.cleaning === null || r.cleaning === undefined ? '' : r.cleaning ? 'yes' : 'no', r.result, r.detail];
      }));
      return '﻿' + rows.map(function (r) {
        return r.map(function (v) { v = v == null ? '' : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',');
      }).join('\r\n');
    }
  };

  /* ---------- "staff only": resident launches off until a staff member lifts it ---------- */
  function staffOnly() { var o = getJSON(K.staffOnly, null); return o && typeof o === 'object' && o.on ? o : null; }
  function setStaffOnly(on, who, missing, why) {
    if (demo.on) return false;
    if (on) {
      if (!write(K.staffOnly, { on: true, at: new Date(clock.now()).toISOString(), by: cleanInitials(who), missing: missing || [] })) return false;
      Journal.add({ type: 'staff-only', staff: who, result: 'on', detail: (missing && missing.length ? 'missing: ' + missing.join(' ') : '') });
    } else {
      if (!staffOnly()) return true;
      if (!write(K.staffOnly, null)) return false;
      Journal.add({ type: 'staff-only', staff: who, result: 'off', detail: why || '' });
    }
    fire();
    return true;
  }
  function residentLaunchAllowed() { return !demo.on && !staffOnly(); }

  /* ---------- B1: the reminder written by the karaoke ---------- */
  function hygieneDue() {
    var d = getJSON(K.due, null);
    if (!d || typeof d !== 'object') return null;
    return { kind: String(d.kind || 'other'), at: d.at || null };
  }
  function laterToken(d) { return String(d && d.at ? d.at : 'none'); }
  function hygieneSnoozed(d) { return !!d && getStr(K.later) === laterToken(d); }
  function hygieneLater() { var d = hygieneDue(); if (d) { write(K.later, laterToken(d)); fire(); } }
  /* "Done": one journal line (time, who, session type, cleaning mode used or not); the reminder goes. */
  function hygieneDone(o) {
    o = o || {};
    if (demo.on) return null;
    var d = hygieneDue();
    var rec = Journal.add({ type: 'hygiene', staff: o.staff, kind: d ? d.kind : (o.kind || 'other'), cleaning: !!o.cleaning, result: 'done',
      detail: (d && d.at ? 'reminder ' + d.at : 'no reminder') + (o.how ? '; lock ended by ' + o.how : '') });
    if (rec) { write(K.due, null); write(K.later, null); fire(); }
    return rec;
  }

  /* ---------- B1: the cleaning lock (pure logic, the overlay below drives it) ----------
     The touch screen is locked for `seconds` (60 by default, a setting). It always ends by itself;
     a 3-second press on the unlock button that stays in place ends it earlier. */
  function CleanLock(o) {
    o = o || {};
    var seconds = lockSeconds(o.seconds === undefined ? DEFAULTS.lockSeconds : o.seconds), holdMs = o.holdMs || HOLD_MS, tol = o.tolerance || 40;
    var s = { startedAt: null, endsAt: null, done: false, how: null, endedAt: null, hold: null };
    function finish(how, t) { if (s.done) return; s.done = true; s.how = how; s.endedAt = t; s.hold = null; }
    var api = {
      seconds: seconds,
      start: function (t) { s.startedAt = t; s.endsAt = t + seconds * 1000; s.done = false; s.how = null; s.hold = null; s.endedAt = null; return api; },
      remaining: function (t) { if (s.startedAt === null) return seconds; return s.done ? 0 : Math.max(0, Math.ceil((s.endsAt - t) / 1000)); },
      tick: function (t) {
        if (s.startedAt === null || s.done) return s.done;
        if (s.hold && t - s.hold.t >= holdMs) finish('hold', t);
        else if (t >= s.endsAt) finish('timer', t);
        return s.done;
      },
      holdStart: function (t, x, y) { if (!s.done && s.startedAt !== null) s.hold = { t: t, x: x || 0, y: y || 0 }; },
      holdMove: function (t, x, y) { if (s.hold && (Math.abs((x || 0) - s.hold.x) > tol || Math.abs((y || 0) - s.hold.y) > tol)) s.hold = null; },
      holdEnd: function (t) { if (s.hold) { if (t - s.hold.t >= holdMs) finish('hold', t); s.hold = null; } },
      holdProgress: function (t) { return s.hold ? Math.min(1, Math.max(0, (t - s.hold.t) / holdMs)) : 0; },
      locked: function () { return s.startedAt !== null && !s.done; },
      done: function () { return s.done; },
      how: function () { return s.how; }
    };
    return api;
  }

  /* ---------- B3: the six lines and the result (pure logic) ----------
     facts: { battery: {level, charging} | null, batteryMin, batterySeen, network: {connected, type} | null,
              soundHeard, screenClean, contentSeen, zoneClear }
     A line is 'ok', 'todo' (à faire) or 'na' (non disponible: the robot does not say). */
  function lineState(key, f) {
    f = f || {};
    switch (key) {
      case 'battery':
        if (!f.battery || typeof f.battery.level !== 'number' || !isFinite(f.battery.level)) return 'na';
        if (f.batteryMin === null || f.batteryMin === undefined) return f.batterySeen ? 'ok' : 'todo';
        return f.battery.level >= f.batteryMin ? 'ok' : 'todo';
      case 'wifi':
        if (!f.network || typeof f.network.connected !== 'boolean') return 'na';
        return f.network.connected ? 'ok' : 'todo';
      case 'volume': return f.soundHeard === true ? 'ok' : 'todo';
      case 'screen': return f.screenClean ? 'ok' : 'todo';
      case 'content': return f.contentSeen ? 'ok' : 'todo';
      case 'zone': return f.zoneClear ? 'ok' : 'todo';
    }
    return 'na';
  }
  function states(f) { var out = {}; LINES.forEach(function (k) { out[k] = lineState(k, f); }); return out; }
  /* "Ready" when all six are OK; otherwise the lines that block. A critical line that is not OK
     (battery and Wi-Fi unless the care home changes it) makes the app propose "staff only". */
  function evaluate(st, critical) {
    critical = Array.isArray(critical) ? critical : DEFAULTS.critical;
    var blocking = LINES.filter(function (k) { return st[k] !== 'ok'; });
    var crit = blocking.filter(function (k) { return critical.indexOf(k) >= 0; });
    return { status: blocking.length ? 'blocked' : 'ready', ready: !blocking.length, blocking: blocking, criticalMissing: crit, proposeStaffOnly: crit.length > 0 };
  }
  /* What the staff decided after a checklist: the journal lines and the staff-only state.
     choice: undefined, 'staff-only' or 'continue' (passing over a missing critical line). */
  function closeChecklist(f, who, choice) {
    if (demo.on) return null;
    var st = states(f), ev = evaluate(st, settings().critical);
    if (ev.proposeStaffOnly && choice !== 'staff-only' && choice !== 'continue') return { needChoice: true, result: ev };
    Journal.add({ type: 'checklist', staff: who, result: ev.status, detail: LINES.map(function (k) { return k + '=' + st[k] + (k === 'battery' && f.battery && typeof f.battery.level === 'number' ? '(' + f.battery.level + '%)' : ''); }).join(' ') });
    if (ev.proposeStaffOnly && choice === 'staff-only') setStaffOnly(true, who, ev.criticalMissing);
    if (ev.proposeStaffOnly && choice === 'continue') Journal.add({ type: 'override', staff: who, result: 'continue', detail: 'missing: ' + ev.criticalMissing.join(' ') });
    return { needChoice: false, result: ev };
  }

  /* ---------- what the robot says about itself ----------
     The robot app answers BellatrixApp.battery() and .network() (WebActivity.java). In a PC browser:
     navigator.getBattery() and navigator.onLine. Otherwise null, shown as "not available". */
  function readBattery(cb) {
    var app = root.BellatrixApp;
    if (app && typeof app.battery === 'function') {
      var j = null;
      try { j = JSON.parse(app.battery() || '{}'); } catch (e) { j = null; }
      cb(j && typeof j.level === 'number' && j.level >= 0 && j.level <= 100 ? { level: Math.round(j.level), charging: !!j.charging, source: 'robot' } : null);
      return;
    }
    var nav = root.navigator;
    if (nav && typeof nav.getBattery === 'function') {
      nav.getBattery().then(function (b) {
        /* A computer without a battery answers "100 %, charging, never empty": that is not a reading. */
        if (!b || typeof b.level !== 'number' || (b.level === 1 && b.charging && b.chargingTime === 0 && b.dischargingTime === Infinity)) { cb(null); return; }
        cb({ level: Math.round(b.level * 100), charging: !!b.charging, source: 'browser' });
      }, function () { cb(null); });
      return;
    }
    cb(null);
  }
  function readNetwork() {
    var app = root.BellatrixApp;
    if (app && typeof app.network === 'function') {
      try {
        var j = JSON.parse(app.network() || '{}');
        if (j && typeof j.connected === 'boolean') return { connected: j.connected, type: String(j.type || ''), source: 'robot' };
      } catch (e) { /* the browser's answer below */ }
    }
    var nav = root.navigator;
    if (nav && typeof nav.onLine === 'boolean') return { connected: nav.onLine, type: '', source: 'browser' };
    return null;
  }
  /* "Test the sound": three short notes, made here (no file). */
  var chimeCtx = null;
  function chime(volume) {
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    try {
      chimeCtx = chimeCtx || new AC();
      if (chimeCtx.state === 'suspended') chimeCtx.resume();
      var v = Math.max(0.05, Math.min(1, volume || 0.6));
      [[659.25, 0], [880, 0.3], [1318.5, 0.6]].forEach(function (n) {
        var o = chimeCtx.createOscillator(), g = chimeCtx.createGain(), t = chimeCtx.currentTime + 0.05 + n[1];
        o.type = 'sine'; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        o.connect(g); g.connect(chimeCtx.destination); o.start(t); o.stop(t + 0.6);
      });
      return true;
    } catch (e) { return false; }
  }

  /* ---------- "today's content" for the checklist ----------
     Other modules can add their own lines: StaffTools.addDaySource(function () { return [{ text, todo }]; }). */
  var daySources = [];
  function mainStore() {
    try { if (root.Lab && root.Lab._staff && root.Lab._staff.store) return root.Lab._staff.store() || {}; } catch (e) { /* read it below */ }
    return getJSON(K.main, {}) || {};
  }
  function dayContent() {
    var out = [], today = dateStr();
    /* What residents asked for, per product (Premium v3: Bellatrix Play Premium or Books Premium). */
    var asks = null, req = null, C = root.PREMIUM_CONFIG && root.PREMIUM_CONFIG.products ? root.PREMIUM_CONFIG.products : {};
    try { asks = root.Premium && typeof root.Premium.asks === 'function' ? root.Premium.asks() : null; } catch (e) { asks = null; }
    if (asks) {
      asks.forEach(function (a) { out.push({ text: T('{who} asks for {product}', { who: a.code || T('A resident'), product: T((C[a.product] && C[a.product].name) || (a.product === 'books' ? 'Books Premium' : 'Bellatrix Play Premium')) }), todo: true }); });
    } else {
      try { req = root.PlayPremium && root.PlayPremium.request ? root.PlayPremium.request() : getJSON(K.premiumReq, null); } catch (e) { req = null; }
      if (req && typeof req === 'object') out.push({ text: T('{who} asks for Bellatrix Play Premium', { who: req.patient || T('A resident') }), todo: true });
    }
    var choices = (mainStore().sessions || []).filter(function (s) {
      return s && s.activity === 'choice' && s.stats && s.stats.choicesSent && !s.passedOn && s.startedAt && dateStr(new Date(s.startedAt)) === today;
    });
    if (choices.length) out.push({ text: T('Daily Choice: {n} to pass on', { n: choices.length }), todo: true });
    if (hygieneDue()) out.push({ text: T('A screen cleaning reminder is waiting'), todo: true });
    /* Family messages (js/messages.js) and the music playlists (js/reco.js), read only, when present. */
    try {
      var FM = root.FamilyMessages;
      var due = FM && typeof FM.due === 'function' ? FM.due(null).length : 0;
      if (due) out.push({ text: T('Family messages to show: {n}', { n: due }), todo: false });
    } catch (e) { /* that module's problem */ }
    try {
      var R = root.Reco && typeof root.Reco.shared === 'function' ? root.Reco.shared() : null;
      if (R && typeof R.playlists === 'function') {
        var on = function (p) { return typeof R.isOn !== 'function' || R.isOn(p.residentId); };
        var drafts = R.playlists({ status: 'draft' }).filter(on).length, ready = R.playlists({ status: 'approved' }).filter(on).length + R.playlists({ status: 'active' }).filter(on).length;
        if (drafts) out.push({ text: T('Playlists to review: {n}', { n: drafts }), todo: true });
        if (ready) out.push({ text: T('Playlists ready: {n}', { n: ready }), todo: false });
      }
    } catch (e) { /* that module's problem */ }
    daySources.forEach(function (fn) {
      try { (fn() || []).forEach(function (x) { if (x && x.text) out.push({ text: String(x.text), todo: !!x.todo }); }); } catch (e) { /* that module's problem */ }
    });
    return out;
  }

  /* =====================================================================================
     K: demo mode (1.16, third version): a presenter's tour of the two apps, fully automatic
     ===================================================================================== */
  /* About 6 to 8 minutes. It starts with the choice of the language (FR / EN / DE): the captions,
     Bellatrix's voice and every screen of the tour follow that choice. First the two apps side by
     side (the small Care Team screen for the team, the big screen for the residents), then the Care
     Team's essential uses, then the residents' screen. Each chapter shows the REAL screens (the
     patient screen, the Care Team, the family portal on a phone) with invented data, one caption line
     in big type, and the same sentence said by Bellatrix when "Voice" is on.
     A chapter is a list of lines. Each line is said, and its action runs, when the line starts; the
     next line comes when this one is said and looked at (sayMs + LOOK), or after `hold` ms when the
     screen needs more time to show something. So the length of the tour follows the language, with
     no dead wait; with a real voice, a line that takes longer holds the clock (DemoRun, holding).
     To adjust a chapter: change its lines here and its actions in makeTour (ACT, same order).
     frames: which page(s) the chapter shows: 'patient', 'staff', 'portal', or two side by side. */
  var CHAPTERS = [
    { id: 'intro', name: 'Two apps', frames: ['staff', 'patient'], lines: [
      { say: 'Bellatrix has two apps.', hold: 2500 },
      { say: 'The small screen is the Care Team app, for the team.' },
      { say: 'The big screen is for the residents: music, games, memories and the family.' },
      { say: 'First, the Care Team.', hold: 1800 }] },
    { id: 'shift', name: 'Start of shift', frames: ['staff'], lines: [
      { say: 'At the start of each shift, a short checklist: battery, Wi-Fi, sound, a clean screen, today’s content and a clear area.', hold: 7000 },
      { say: 'One tap on Ready, and the shift can begin.', hold: 3500 }] },
    { id: 'todo', name: 'To do and hygiene', frames: ['staff'], lines: [
      { say: 'Everything that waits for the team is in one place: To do.', hold: 4500 },
      { say: 'After a karaoke session, Bellatrix reminds the team to clean the screen.', hold: 4000 },
      { say: 'The cleaning mode locks the touch screen for one minute, then unlocks by itself.', hold: 6000 }] },
    { id: 'family', name: 'Family messages', frames: ['portal', 'staff'], lines: [
      { say: 'A relative writes from her phone: a text, a photo, a voice message or a short video.', hold: 7500 },
      { say: 'There is no approval step: the message goes straight to the robot.', hold: 3500 },
      { say: 'The team gets a notification in To do, with the resident’s name and the kind of message.', hold: 5000 },
      { say: 'One tap sends the robot to the resident.', hold: 4000 }] },
    { id: 'premium', name: 'Premium', frames: ['staff', 'portal'], lines: [
      { say: 'Premium is per resident, with two separate subscriptions: Bellatrix Play Premium and Books Premium.', hold: 5000 },
      { say: '{name} asked for Play Premium. The team chooses a duration and taps OK.', hold: 7000 },
      { say: 'The family receives the payment request on the portal, with the real price.', hold: 5000 },
      { say: 'In this demo the payment is simulated: no payment is made.', hold: 6500 },
      { say: 'Once paid, Premium switches on by itself, for {name} only.', hold: 4500 }] },
    { id: 'consent', name: 'Consent', frames: ['staff', 'portal'], lines: [
      { say: 'The team records the consent of the resident or of their representative, in three levels.', hold: 6000 },
      { say: 'The family sees at once what they are allowed to see.', hold: 4500 }] },
    { id: 'results', name: 'Results', frames: ['staff'], lines: [
      { say: 'Results: every session, with clear counters and the team’s notes.', hold: 4500 },
      { say: 'A monthly summary can be shared with the family.', hold: 5000 }] },
    /* 15 Nov: no "Music & photos" tab any more (the id stays): the playlists are in Bellatrix Play's settings. */
    { id: 'contents', name: 'Playlists', frames: ['staff'], lines: [
      { say: 'In each activity’s settings: the weekly playlists to approve, the karaoke lists, the photos of Memories and the books.', hold: 4000 },
      { say: 'A playlist is offered to the resident only once the team has approved it.', hold: 4500 }] },
    { id: 'settings', name: 'Settings and Library', frames: ['staff'], lines: [
      { say: 'In the settings: the cleaning instructions, the lock time and the battery alert.', hold: 4500 },
      { say: 'And the Library brings new apps to the robot, like an app store.', hold: 4500 }] },
    { id: 'welcome', name: 'Daily welcome', frames: ['patient'], lines: [
      { say: 'Now the residents’ screen. Each morning, a warm welcome with the date, the season and the time.', hold: 5000 }] },
    { id: 'play', name: 'Bellatrix Play', frames: ['patient'], lines: [
      { say: 'Bellatrix Play: the music of their youth, with the lyrics, free for everyone.', hold: 9500 },
      { say: 'Recommendations, DJ Bellatrix, and a playlist made by AI from a single sentence.', hold: 7000 },
      { say: 'Podcasts too: stories, history and music to listen to.', hold: 4500 },
      { say: 'Premium removes the ads, allows offline listening, and listening together with the family.', hold: 5000 }] },
    { id: 'karaoke', name: 'Karaoke', frames: ['patient'], lines: [
      { say: 'Group karaoke: many songs, very big lyrics, and everyone sings together.', hold: 12000 },
      { say: 'No score and no ranking: just the pleasure of singing.', hold: 3000 }] },
    { id: 'games', name: 'Games', frames: ['patient'], lines: [
      { say: 'Picture pairs: turn two cards over and find the pair.', hold: 6500 },
      { say: 'Chess: against Bellatrix, with a partner, or short puzzles.', hold: 5000 },
      { say: 'Ludo: up to six players, and Bellatrix takes the free places.', hold: 6500 }] },
    { id: 'memories', name: 'Memories', frames: ['patient'], lines: [
      { say: 'Memories: a theme, then a photo or a picture, with its story.', hold: 7000 },
      { say: 'A gentle question opens the conversation; nothing is tested.', hold: 6500 }] },
    { id: 'books', name: 'Book reading', frames: ['patient'], lines: [
      { say: 'Book reading: novels and tales, read aloud, page by page, in big type.', hold: 5000 },
      { say: 'The book opens again at the resident’s last page.', hold: 5000 },
      { say: 'At the end of a page, the page turns by itself.', hold: 8000 }] },
    { id: 'messages', name: 'Messages and calls', frames: ['patient'], lines: [
      { say: 'The family’s message appears in big, and Bellatrix reads it out.', hold: 7000 },
      { say: 'Video calls work both ways: the family calls the robot, or the team calls the family.', hold: 6500 }] },
    { id: 'daily', name: 'Daily activities', frames: ['patient'], lines: [
      { say: 'New content every day: sayings to finish,', hold: 6500 },
      { say: 'a kindness quiz with no wrong answers,', hold: 6500 },
      { say: 'and seated movements: a part of the body, a drawing to follow, or a video.', hold: 9000 }] },
    { id: 'end', name: 'End', frames: ['patient'], lines: [
      { say: 'That was Bellatrix. Nothing was saved during this demo. Thank you!', hold: 4000 }] }
  ];
  /* How long a line takes to say, in ms: about 14 characters a second (a calm voice), a little slower
     in German; then LOOK ms to look at the screen before the next line. */
  var SAY_MS = { en: 72, fr: 70, de: 76 }, LOOK = 1900;
  function sayMs(text, l) { return 700 + String(text || '').length * (SAY_MS[l] || 72); }
  /* The chapters timed for one language: [{ id, name, frames, ms, lines: [{ say, at, ms }] }].
     tr(key, vars) gives the line in that language (I18N.t when present). */
  function demoScenes(l, tr) {
    l = l || 'en';
    tr = tr || function (k, v) { return root.I18N && root.I18N.t ? root.I18N.t(l, k, v) : fill(k, v); };
    return CHAPTERS.map(function (c) {
      var at = 0, lines = c.lines.map(function (x) {
        var text = tr(x.say, { name: (DEMO_NAMES[l] || DEMO_NAMES.en).resident }), ms = Math.max(sayMs(text, l) + LOOK, x.hold || 0);
        var out = { say: x.say, text: text, at: at, ms: ms };
        at += ms;
        return out;
      });
      return { id: c.id, name: c.name, frames: c.frames.slice(), frame: c.frames[c.frames.length - 1], ms: at + 600, lines: lines };
    });
  }
  /* The English timing (set below, once the demo names exist), for the checks that choose no language. */
  var SCENES = null;
  /* The controller. It plays the scenes by itself, one after the other; Pause holds the scene and its
     steps; jump(i) goes to a chapter. It only talks to the tour: enter(scene, i), tick(scene, ms),
     pause(), resume(), stopAll(), idle(). o: { scenes, speed, now, every(fn, ms), cancel(h), onChange, onTick, onEnd } */
  function DemoRun(tour, o) {
    o = o || {};
    var list = o.scenes || SCENES;
    var now = o.now || function () { return clock.now(); };
    var every = o.every || function (fn, ms) { return setInterval(fn, ms); };
    var cancel = o.cancel || function (h) { clearInterval(h); };
    var st = { i: -1, sceneStart: 0, pausedAt: 0, pausedMs: 0, paused: false, running: false, ended: false, how: null, t0: 0, pauseTotal: 0, timer: null };
    function speed() { return o.speed || 1; }
    function changed() { if (o.onChange) { try { o.onChange(api.state()); } catch (e) { /* display only */ } } }
    function show(i) {
      st.i = i; st.sceneStart = now(); st.pausedMs = 0; st.last = 0;
      try { tour.enter(list[i], i); } catch (e) { if (root.console) root.console.warn('demo scene', list[i].id, e); }
      changed();
    }
    function elapsed() { return (st.paused ? st.pausedAt : now()) - st.sceneStart - st.pausedMs; }
    function next() { if (st.i + 1 < list.length) show(st.i + 1); else end('completed'); }
    function unpause() { if (!st.paused) return; var d = now() - st.pausedAt; st.pausedMs += d; st.pauseTotal += d; st.paused = false; st.last = now(); tour.resume(); }
    function end(how) {
      st.running = false; st.ended = true; st.how = how; st.paused = false;
      if (st.timer !== null) { cancel(st.timer); st.timer = null; }
      if (how === 'stopped') tour.stopAll(); else tour.idle();
      changed();
      if (o.onEnd) o.onEnd(how);
    }
    var api = {
      scenes: list,
      start: function (from) {
        if (st.timer !== null) cancel(st.timer);
        st.running = true; st.ended = false; st.paused = false; st.how = null; st.t0 = now(); st.pauseTotal = 0;
        show(from > 0 && from < list.length ? from : 0);
        st.timer = every(api.tick, 250);
      },
      tick: function () {
        if (!st.running || st.paused) return;
        var t = now(), sc = list[st.i];
        /* The voice is still saying the line (slower than planned): the scene waits for it. */
        if (st.last && tour.holding && tour.holding()) st.pausedMs += t - st.last;
        st.last = t;
        var e = elapsed();
        if (e >= sc.ms * speed()) { next(); return; }
        try { tour.tick(sc, e / speed()); } catch (x) { if (root.console) root.console.warn('demo step', sc.id, x); }
        if (o.onTick) o.onTick(api.state());
      },
      pause: function () { if (!st.running || st.paused) return; st.paused = true; st.pausedAt = now(); tour.pause(); changed(); },
      resume: function () { if (!st.running || !st.paused) return; unpause(); changed(); },
      next: function () { if (!st.running) return; unpause(); next(); },
      jump: function (i) {
        if (i < 0 || i >= list.length) return;
        if (!st.running) { api.start(i); return; }
        unpause(); show(i);
      },
      stop: function () { if (st.running) end('stopped'); },
      state: function () {
        var sc = list[st.i] || null;
        return { index: st.i, scene: sc ? sc.id : null, name: sc ? sc.name : '', count: list.length, paused: st.paused, running: st.running, ended: st.ended, how: st.how,
          sceneLeft: sc ? Math.max(0, sc.ms * speed() - elapsed()) : 0, total: st.t0 ? (st.paused ? st.pausedAt : now()) - st.t0 - st.pauseTotal : 0 };
      }
    };
    return api;
  }

  /* The guard of every demo frame: installed before any other script. localStorage and
     sessionStorage writes on the real storage are dropped, IndexedDB writes throw, network writes
     (POST, beacons) are refused, and the robot's file saving and screen switching are not reachable.
     Returns the list of blocked attempts. */
  function guardRealm(W) {
    var log = W.__demoBlocked = W.__demoBlocked || [];
    if (W.__demoGuarded) return log;
    W.__demoGuarded = true;
    W.BellatrixDemo = true;
    function nope(what) { return function (k) { log.push(what + (k !== undefined && typeof k !== 'object' ? ' ' + k : '')); }; }
    var SP = W.Storage && W.Storage.prototype;
    if (SP) { SP.setItem = nope('storage set'); SP.removeItem = nope('storage remove'); SP.clear = nope('storage clear'); }
    var IP = W.IDBObjectStore && W.IDBObjectStore.prototype;
    if (IP) ['put', 'add', 'delete', 'clear'].forEach(function (m) { IP[m] = function () { log.push('indexedDB ' + m); throw new Error('Demo mode: nothing is saved.'); }; });
    var FP = W.IDBFactory && W.IDBFactory.prototype;
    if (FP && FP.deleteDatabase) FP.deleteDatabase = function (n) { log.push('indexedDB deleteDatabase ' + n); throw new Error('Demo mode: nothing is saved.'); };
    /* No database may be created or upgraded either: the version change is cancelled at once. */
    if (FP && FP.open) {
      var iopen = FP.open;
      FP.open = function (n) {
        var req = iopen.apply(this, arguments);
        try {
          req.addEventListener('upgradeneeded', function (e) {
            log.push('indexedDB create/upgrade ' + n);
            try { e.target.transaction.abort(); } catch (x) { /* already over */ }
          });
        } catch (e) { /* not a request */ }
        return req;
      };
    }
    if (typeof W.fetch === 'function') {
      var f = W.fetch;
      W.fetch = function (u, opt) {
        var m = String(opt && opt.method || (u && u.method) || 'GET').toUpperCase();
        if (m !== 'GET' && m !== 'HEAD') { log.push('fetch ' + m + ' ' + (u && u.url ? u.url : u)); return W.Promise.reject(new Error('Demo mode: nothing is sent.')); }
        return f.apply(this, arguments);
      };
    }
    var XP = W.XMLHttpRequest && W.XMLHttpRequest.prototype;
    if (XP) {
      var xopen = XP.open, xsend = XP.send;
      XP.open = function (m, u) { this.__demoMethod = String(m || 'GET').toUpperCase(); this.__demoUrl = u; return xopen.apply(this, arguments); };
      XP.send = function () { if (this.__demoMethod && this.__demoMethod !== 'GET' && this.__demoMethod !== 'HEAD') { log.push('xhr ' + this.__demoMethod + ' ' + this.__demoUrl); return; } return xsend.apply(this, arguments); };
    }
    try { if (W.navigator && W.navigator.sendBeacon) W.navigator.sendBeacon = function (u) { log.push('beacon ' + u); return false; }; } catch (e) { /* read-only here */ }
    /* no window, tab or page of the device opens from a frame */
    try { W.open = function (u) { log.push('window.open ' + u); return null; }; } catch (e) { /* read-only here */ }
    var app = W.BellatrixApp;
    if (app) {
      var pass = function (name, dflt) { return function () { try { return typeof app[name] === 'function' ? app[name].apply(app, arguments) : dflt; } catch (e) { return dflt; } }; };
      var safe = {
        canSpeak: pass('canSpeak', false), prepareVoice: pass('prepareVoice'), speak: pass('speak'), stopSpeaking: pass('stopSpeaking'),
        battery: pass('battery', '{}'), network: pass('network', '{}'),
        saveFile: function (n) { log.push('saveFile ' + n); return ''; }, openPatient: nope('openPatient'), openStaff: nope('openStaff'),
        netAnnounce: function () { log.push('netAnnounce'); return false; }, netGames: function () { return '[]'; }, netAddress: function () { return ''; }, netRobotName: function () { return ''; },
        callAudio: function () { log.push('callAudio'); return false; }
      };
      try { W.BellatrixApp = safe; } catch (e) { /* the app's object stays; the activities in the demo never save files */ }
    }
    /* Sound sources, so that Pause can silence them. */
    var AC = W.AudioContext || W.webkitAudioContext;
    W.__demoAudio = [];
    if (AC) {
      var Ctx = function (opts) { var c = opts ? new AC(opts) : new AC(); W.__demoAudio.push(c); return c; };
      Ctx.prototype = AC.prototype;
      try { W.AudioContext = Ctx; if (W.webkitAudioContext) W.webkitAudioContext = Ctx; } catch (e) { /* not tracked */ }
    }
    W.__demoMedia = [];
    var MP = W.HTMLMediaElement && W.HTMLMediaElement.prototype;
    if (MP && MP.play) { var mplay = MP.play; MP.play = function () { if (W.__demoMedia.indexOf(this) < 0) W.__demoMedia.push(this); return mplay.apply(this, arguments); }; }
    return log;
  }

  /* A storage in memory: the demo frames read and write only this, never the device's storage. */
  function MemStorage(seed) {
    var m = {};
    Object.keys(seed || {}).forEach(function (k) { m[k] = String(seed[k]); });
    var s = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[String(k)] = String(v); },
      removeItem: function (k) { delete m[k]; },
      clear: function () { m = {}; },
      key: function (i) { return Object.keys(m)[i] || null; },
      _map: function () { return m; }
    };
    try { Object.defineProperty(s, 'length', { get: function () { return Object.keys(m).length; } }); } catch (e) { /* old engine */ }
    return s;
  }

  /* ---------- the invented data of the tour (no real resident, no real family) ---------- */
  var DEMO_CODE = 'D1';
  var DEMO_NAMES = { en: { resident: 'Margaret', from: 'Claire', rel: 'daughter', caller: 'Maria' },
    fr: { resident: 'Marie', from: 'Claire', rel: 'fille', caller: 'Maria' }, de: { resident: 'Margarete', from: 'Claudia', rel: 'Tochter', caller: 'Maria' } };
  SCENES = demoScenes('en', fill);
  function demoText(l) {
    var n = DEMO_NAMES[l] || DEMO_NAMES.en;
    return {
      names: n,
      message: { en: 'Hello Mum! The children planted tulips in the garden this morning. We are coming on Sunday. Love, Claire',
        fr: 'Bonjour Maman ! Les enfants ont planté des tulipes au jardin ce matin. Nous venons dimanche. Je t’embrasse, Claire',
        de: 'Hallo Mama! Die Kinder haben heute Morgen Tulpen im Garten gepflanzt. Wir kommen am Sonntag. Alles Liebe, Claudia' }[l] || '',
      second: { en: 'Thinking of you, I will call on Saturday.', fr: 'Je pense à toi, je t’appelle samedi.', de: 'Ich denke an dich, ich rufe am Samstag an.' }[l] || '',
      lunch: { en: 'Soup', fr: 'Soupe', de: 'Suppe' }[l] || 'Soup', afternoon: { en: 'Garden', fr: 'Jardin', de: 'Garten' }[l] || 'Garden',
      label: { en: 'Mum', fr: 'Maman', de: 'Mama' }[l] || 'Mum'
    };
  }
  /* A few finished sessions of the demo resident, for Results and the monthly summary. */
  function demoSessions(l, t) {
    var d = demoText(l), iso = function (ms) { return new Date(t + ms).toISOString(); }, day = function (ms) { return iso(ms).slice(0, 10); };
    function rec(id, key, name, ms, len, stats) {
      return { id: id, testId: 'DEMO', participant: DEMO_CODE, activity: key, activityName: name, date: day(ms), startedAt: iso(ms), endedAt: iso(ms + len * 1000), durationS: len, outcome: 'completed', zone: 'DEMO',
        stats: stats || {}, events: [], counts: { touch: 6, hand: 0, air: 0, key: 0, staff: 0, help: 0, stop: 0, back: 0, skip: 0, reprompt: 0 }, taps: { hit: 6, miss: 0 }, consent: {}, settings: { lang: l }, mood: {} };
    }
    return [
      rec('SD1', 'choice', 'Daily Choice', -36e5, 120, { choicesSent: true, lunch: d.lunch, afternoon: d.afternoon }),
      rec('SD2', 'karaoke', 'Group karaoke', -72e5, 900, { singAlongs: 4 }),
      rec('SD3', 'play', 'Bellatrix Play', -864e5, 1500, { playItems: 9, playMinutes: 24, playLikes: 3 }),
      rec('SD4', 'album', 'Memories', -2 * 864e5, 720, { memoriesShared: 3 }),
      rec('SD5', 'reading', 'Book reading', -3 * 864e5, 840, { readingPages: 12 }),
      rec('SD6', 'pairs', 'Picture Pair', -4 * 864e5, 480, { levelReached: 3 })
    ];
  }
  /* The storage the frames start from: one resident (D1) and what waits for the team (the cleaning
     reminder after a karaoke, the start-of-shift checklist, a Premium request, a Daily Choice), music
     consent, one family message already on the robot, one family contact, the family portal signed
     in on the phone. Library packs installed on this device are copied in (read only), so the games
     of the Library can be shown; nothing is ever written back. */
  var STORE_KEYS = ['bellatrix-store-packs', 'bellatrix-store-licence', 'bellatrix-store-catalog', 'bellatrix-store-config'];
  function demoSeed(l, t, real) {
    t = t || clock.now();
    var d = demoText(l), n = d.names, iso = function (ms) { return new Date(t + ms).toISOString(); };
    var s = {};
    s['bellatrix-staff-lang'] = l;
    var main = { sessions: demoSessions(l, t), patients: {}, settings: { participant: DEMO_CODE, activity: 'karaoke', clipsMoved: true } };
    main.patients[DEMO_CODE] = { content: {}, prefs: { greet: n.resident, lang: l, life: { born: '1945', birthday: '', home: '', loves: '', avoid: '', talk: '' } } };
    s[K.main] = JSON.stringify(main);
    s[K.premiumReq] = JSON.stringify({ patient: DEMO_CODE, at: iso(-6e5) });
    s[K.due] = JSON.stringify({ kind: 'karaoke', at: iso(-12e5) });
    s['bellatrix-reco-consent'] = JSON.stringify({ D1: { on: true, by: 'resident', at: iso(-864e5 * 20), staff: 'Demo' } });
    s['bellatrix-messages-settings'] = JSON.stringify({ auto: false });
    s['bellatrix-messages-cache'] = JSON.stringify(demoMessageCache(l, t));
    s['bellatrix-family'] = JSON.stringify({ loud: true, residents: { D1: { acceptNow: true,
      times: [{ on: true, from: '10:00', to: '12:00' }, { on: true, from: '14:30', to: '19:00' }],
      contacts: [{ id: 'c1', name: n.caller, rel: 'daughter', relText: '', label: d.label, lang: l, photo: '', token: 'demoToken0001', created: iso(-864e5 * 30) }] } },
      outgoing: { token: 'DEMO-J-0001', who: DEMO_CODE, contactId: 'c1', name: n.caller, label: d.label, lang: l, expires: t + 30 * 60000, state: 'waiting', online: true } });
    /* the family portal on the phone: signed in, in the language of the demo */
    s['bellatrix-portail-token'] = 'demo-token'; s['bellatrix-portail-lang'] = l; s['bellatrix-portail-resident'] = 'r1';
    if (real) STORE_KEYS.forEach(function (k) { try { var v = real.getItem(k); if (v) s[k] = v; } catch (e) { /* not there */ } });
    /* the address of the portal (QR codes, links): this robot's own setting, else the page's server */
    var srv = '';
    try { srv = real ? real.getItem('bellatrix-call-server') || '' : ''; } catch (e) { srv = ''; }
    if (!srv && root.location && /^https?:/.test(root.location.protocol)) srv = root.location.origin;
    if (srv) s['bellatrix-call-server'] = srv;
    return s;
  }
  function demoMessageCache(l, t, extra) {
    var d = demoText(l), items = {};
    items['m-demo-1'] = { id: 'm-demo-1', code: DEMO_CODE, from: d.names.from, relation: d.names.rel, lang: l, kind: 'text', text: d.message,
      hasPhoto: false, at: new Date(t - 36e5).toISOString(), status: 'received', showAt: null, teamAnnounce: false, shownAt: null, shownBy: null, shownLocal: null, showNow: false, photoCached: false };
    if (extra) items[extra.id] = extra;
    return { updated: new Date(t).toISOString(), items: items };
  }
  /* The prices the family sees: from js/premium-config.js (PREMIUM_CONFIG), monthCents x months, 0
     only while the pilot is set free. The payment itself is always simulated in the demo. */
  function demoPrice(product, months) {
    var C = root.PREMIUM_CONFIG || null, p = C && C.products && C.products[product || 'play'];
    return p && !C.pilotFree ? (p.monthCents || 0) * (months || 1) : 0;
  }
  function demoPrices(product) {
    var C = root.PREMIUM_CONFIG || null;
    return ((C && C.months) || [1, 3, 12]).map(function (m) { return { months: m, cents: demoPrice(product || 'play', m) }; });
  }
  /* The family portal and the call server of the demo: a small server in memory, shared by the frames
     of one tour, that follows the 1.16 contracts (no approval: a family message is a notification for
     the team; Premium payment requests; the consent level). Nothing leaves the frames. */
  function demoServer(l, t, local) {
    var d = demoText(l), n = d.names, C = root.PREMIUM_CONFIG || {}, iso = function (ms) { return new Date(t + ms).toISOString(); }, seq = 0;
    var st = { consent: { level: 'messages_album', by: 'resident', at: iso(-864e5 * 20), staff: 'Demo' }, notes: [], msgs: [], reqs: [], nav: [] };
    function stamp() { return new Date(Math.max(Date.now(), t)).toISOString(); }
    function msg(id, text, ms, status) { return { id: id, rid: 'r1', code: DEMO_CODE, label: n.resident, from: n.from, relation: n.rel, lang: l, kind: 'text', text: text, hasPhoto: false, hasMedia: false, at: iso(ms), status: status, receivedAt: iso(ms + 6e4), readAt: status === 'read' ? iso(ms + 36e5) : null }; }
    st.msgs.push(msg('m-demo-1', d.message, -36e5, 'read'));
    st.notes.push({ id: 'n-demo-1', rid: 'r1', code: DEMO_CODE, label: n.resident, kind: 'text', from: n.from, at: iso(-36e5), seen: true, message: 'm-demo-1', status: 'read', text: d.message, hasPhoto: false });
    function reqView(q) { return { id: q.id, code: DEMO_CODE, rid: 'r1', product: q.product, months: q.months, cents: q.cents, currency: C.currency || 'EUR', state: q.state, at: q.at, updatedAt: q.updatedAt, paidAt: q.paidAt || null, until: q.until || null, paidBy: q.paidAt ? n.from : '', paidByMe: !!q.paidAt, demo: true }; }
    function resident() {
      return { rid: 'r1', code: DEMO_CODE, label: n.resident, lang: l, consent: st.consent,
        accounts: [{ id: 'a1', pid: 'p1', name: n.from, email: 'claire@example.test', relation: n.rel, lang: l, createdBy: 'invite', created: iso(-864e5 * 20), consentAt: iso(-864e5 * 20), lastSignIn: iso(-36e5), status: 'active', code: '', codeUntil: null, callLink: '' }],
        invites: [{ code: 'K7Q2-M9XD', created: iso(-36e5), expires: iso(864e5 * 6) }] };
    }
    function state() {
      return { residents: [resident()], notifications: st.notes.slice().reverse(), messages: st.msgs.slice().reverse(), nav: st.nav.slice(), offers: [], requests: st.reqs.map(reqView), queue: [],
        upcoming: [], recent: [], keepDays: 30, pilotFree: !!C.pilotFree, testPayment: true, now: stamp() };
    }
    function me() {
      var lvl = st.consent ? st.consent.level : null;
      return {
        person: { id: 'p1', name: n.from, email: 'claire@example.test', lang: l, consentAt: iso(-864e5 * 9) },
        account: { id: 'a1', name: n.from, email: 'claire@example.test', relation: n.rel, lang: l, consentAt: iso(-864e5 * 9), createdBy: 'invite', callLink: '' },
        needsConsent: false, access: 'active',
        residents: [{ rid: 'r1', label: n.resident, lang: l, status: 'active', relation: n.rel }],
        resident: { rid: 'r1', label: n.resident, lang: l, consent: lvl, features: { messages: true, album: true, calls: true, premium: true, feed: lvl === 'all', listen: lvl === 'all' } },
        messages: st.msgs.map(function (m) { return { id: m.id, kind: m.kind, text: m.text, at: m.at, status: m.status, receivedAt: m.receivedAt, readAt: m.readAt, hasPhoto: false, hasMedia: false, mime: '' }; }).reverse(),
        offers: [], requests: st.reqs.map(reqView), payments: st.reqs.filter(function (q) { return q.paidAt; }).map(function (q) { var v = reqView(q); v.kind = 'request'; v.label = n.resident; return v; }),
        /* 14 Nov: no duration limit for voice and video, only an invisible size cap (as the real server) */
        limits: { text: 300, caption: 90, question: 160, date: 30, photoPx: 1600, voiceBytes: 95 * 1024 * 1024, videoBytes: 95 * 1024 * 1024, perDay: 20 },
        pilotFree: !!C.pilotFree, testPayment: true, currency: C.currency || 'EUR', prices: demoPrices('play'),
        products: ['play', 'books'].map(function (x) { return { id: x, currency: C.currency || 'EUR', prices: demoPrices(x), premium: st.reqs.some(function (q) { return q.product === x && q.state === 'active'; }) }; }),
        listen: { open: false, available: false }
      };
    }
    function body(o) { try { return typeof o === 'string' ? JSON.parse(o || '{}') : (o || {}); } catch (e) { return {}; } }
    /* path: what follows portal/api/; returns [status, json]. */
    function route(method, path, raw) {
      var b = body(raw), p = String(path || '').replace(/\?.*$/, ''), post = method !== 'GET' && method !== 'HEAD';
      if (p === 'robot/state') return [200, state()];
      if (/^robot\/(feed|photo|media)/.test(p)) return [404, { error: 'demo' }];
      if (p === 'robot/notification/seen' && post) { (b.ids || []).forEach(function (id) { st.notes.forEach(function (x) { if (x.id === id) x.seen = true; }); }); return [200, { ok: true }]; }
      if (p === 'robot/navigate' && post) { st.nav.push({ rid: b.rid || 'r1', at: stamp(), staff: b.staff || '' }); return [200, { ok: true, nav: st.nav[st.nav.length - 1] }]; }
      if (p === 'robot/resident/consent' && post) { st.consent = { level: b.level || 'messages_album', by: b.by || 'resident', at: stamp(), staff: b.staff || '' }; return [200, { ok: true, consent: st.consent }]; }
      if (p === 'robot/premium-request' && post) {
        var pr = b.product === 'books' ? 'books' : 'play', m = parseInt(b.months, 10) || 1;
        var q = { id: 'rq' + (++seq), product: pr, months: m, cents: demoPrice(pr, m), state: 'awaiting_family', at: stamp(), updatedAt: stamp() };
        st.reqs.push(q);
        return [200, { ok: true, request: reqView(q) }];
      }
      if (p === 'robot/premium-requests') {
        var out = st.reqs.map(reqView);
        st.reqs.forEach(function (x) { if (x.state === 'paid') { x.state = 'active'; x.updatedAt = stamp(); } });
        return [200, { requests: out }];
      }
      if (p === 'family/me') return [200, me()];
      if (p === 'family/message' && post) {
        var m2 = msg('m-demo-' + (++seq + 1), String(b.text || '').slice(0, 300), 0, 'sent');
        m2.at = stamp(); st.msgs.push(m2);
        st.notes.push({ id: 'n-' + m2.id, rid: 'r1', code: DEMO_CODE, label: n.resident, kind: 'text', from: n.from, at: m2.at, seen: false, message: m2.id, status: 'sent', text: m2.text, hasPhoto: false });
        /* the robot has it at once (no approval): the patient screen's cache, in memory */
        if (local) { try { local.setItem('bellatrix-messages-cache', JSON.stringify(demoMessageCache(l, t, { id: m2.id, code: DEMO_CODE, from: n.from, relation: n.rel, lang: l, kind: 'text', text: m2.text,
          hasPhoto: false, at: m2.at, status: 'received', showAt: null, teamAnnounce: false, shownAt: null, shownBy: null, shownLocal: null, showNow: false, photoCached: false }))); } catch (e) { /* the old one stays */ } }
        return [200, { ok: true, message: { id: m2.id, kind: 'text', text: m2.text, at: m2.at, status: 'sent', hasPhoto: false } }];
      }
      if (p === 'family/premium-request/pay' && post) {
        var q2 = st.reqs.filter(function (x) { return x.id === b.id; })[0];
        if (!q2) return [404, { error: 'not-open' }];
        var until = new Date(Date.parse(stamp()) + q2.months * 30 * 864e5).toISOString();
        q2.state = 'paid'; q2.paidAt = stamp(); q2.until = until; q2.updatedAt = stamp();
        return [200, { ok: true, request: reqView(q2) }];
      }
      return [200, { ok: true }];
    }
    return { route: route, state: state, me: me, data: st };
  }
  /* Installed first in every demo frame: the memory storage (shared by the frames of the tour), the
     guard, the answers of the family portal and the call server, and silent frames (only the tour
     speaks). shared: { local, session, lang, now, server }. */
  function demoRealm(W, shared) {
    var ok = true;
    try {
      Object.defineProperty(W, 'localStorage', { value: shared.local, configurable: true });
      Object.defineProperty(W, 'sessionStorage', { value: shared.session, configurable: true });
    } catch (e) { ok = false; }
    W.__demoMem = ok;
    var log = guardRealm(W);
    if (!shared.server) shared.server = demoServer(shared.lang, shared.now, shared.local);
    var srv = shared.server, guarded = W.fetch;
    function reply(body, status) {
      var R = W.Response;
      if (R) return W.Promise.resolve(new R(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } }));
      return W.Promise.resolve({ ok: (status || 200) < 300, status: status || 200, json: function () { return W.Promise.resolve(body); }, text: function () { return W.Promise.resolve(JSON.stringify(body)); } });
    }
    W.fetch = function (u, opt) {
      var s = String(u && u.url ? u.url : u), m = String(opt && opt.method || 'GET').toUpperCase();
      if (s.indexOf('portal/api/') >= 0) {
        var path = s.replace(/^.*portal\/api\//, '');
        log.push('portal ' + m + ' ' + path.replace(/\?.*$/, ''));
        var r = srv.route(m, path, opt && opt.body);
        return reply(r[1], r[0]);
      }
      if (s.indexOf('call/api/') >= 0) {
        log.push('call ' + m + ' ' + s.replace(/^.*call\/api\//, '').replace(/\?.*$/, ''));
        if (/robot\/info/.test(s)) return reply({ online: true, state: 'idle', call: '' });
        if (/outgoing\/info/.test(s)) return reply({ state: 'waiting', robotOnline: true });
        if (/outgoing$/.test(s.replace(/\?.*$/, ''))) return reply({ token: 'DEMO-J-0001', expires: shared.now + 1800000, robotOnline: true });
        return reply({ ok: true });
      }
      return guarded.apply(this, arguments);
    };
    /* The frames stay silent: their sentences end at once (the tour has its own narration). */
    var sy = W.speechSynthesis;
    if (sy) {
      try {
        sy.speak = function (u) { setTimeout(function () { if (u.onstart) u.onstart(); }, 20); setTimeout(function () { if (u.onend) u.onend(); }, 900); };
        sy.cancel = function () {};
      } catch (e) { /* read-only: the frame may speak */ }
    }
    if (W.BellatrixApp) {
      W.BellatrixApp.canSpeak = function () { return true; };
      W.BellatrixApp.prepareVoice = function () {};
      W.BellatrixApp.stopSpeaking = function () {};
      W.BellatrixApp.speak = function (id) {
        setTimeout(function () { var v = W.BellatrixVoice; if (v && v.start) v.start(id); }, 20);
        setTimeout(function () { var v = W.BellatrixVoice; if (v && v.done) v.done(id); }, 900);
      };
    }
    return log;
  }

  /* The karaoke song for the demo: a song the free catalogue may show (js/karaoke-songs.js,
     KaraokeSongs.available), in the team's language, 1 to 3 minutes long when the catalogue says;
     '' lets the karaoke choose. */
  function demoSongId(W, l) {
    var KS = W.KaraokeSongs || null, list = null;
    if (KS && typeof KS.available === 'function') {
      try { list = KS.available({ lang: l }); if (!list || !list.length) list = KS.available({}); } catch (e) { list = null; }
    }
    if (!list || !list.length) return '';
    function len(s) { try { var d = typeof KS.durationMs === 'function' ? KS.durationMs(s) : 0; return typeof d === 'number' && isFinite(d) ? d : 0; } catch (e) { return 0; } }
    function mine(a) { return a.filter(function (s) { return s.lang === l; }); }
    var fit = list.filter(function (s) { var d = len(s); return d >= 60000 && d <= 180000; });
    var pick = mine(fit)[0] || fit[0] || mine(list)[0] || list[0];
    return pick && pick.id ? String(pick.id) : '';
  }

  /* The page of a demo frame: the real page, with the demo realm installed before any other script
     and a "Demo mode" chip. The patient screen loses patient.js (no hand-over, no inbox); the family
     calls, messages, album, reading, Play and karaoke stay (messages.js never offers a message by
     itself in a frame: it checks window.top). */
  function frameHtml(src, base, kind, label) {
    var html = String(src || '');
    if (kind === 'patient') html = html.replace(/<script[^>]*src="js\/patient\.js[^"]*"[^>]*><\/script>\s*/g, '');
    var head = '<base href="' + esc(base) + '"><script>parent.StaffTools._realm(window);<\/script>' +
      '<style>#chipPreview{display:none!important}.st-demochip{position:fixed;top:10px;right:10px;z-index:2147483600;background:var(--apricot);color:var(--on-apricot);font:700 14px/1 var(--font);' +
      'border-radius:999px;padding:7px 12px;pointer-events:none;letter-spacing:.02em}.st-demo-face{height:640px}.stage.land .st-demo-face{height:420px}</style>';
    if (/<meta charset[^>]*>/i.test(html)) html = html.replace(/(<meta charset[^>]*>)/i, '$1' + head);
    else html = html.replace(/<head>/i, '<head>' + head);
    /* The chip on the patient screen only: the Care Team and the portal show their own language switch there. */
    if (kind === 'patient') html = html.replace(/<body([^>]*)>/i, '<body$1><div class="st-demochip">' + esc(label) + '</div>');
    return html;
  }

  /* =====================================================================================
     The Care Team page
     ===================================================================================== */
  var StaffTools = root.StaffTools = {
    version: 1,
    keys: K, LINES: LINES, DEFAULTS: DEFAULTS, SCENES: SCENES,
    Journal: Journal, CleanLock: CleanLock, lineState: lineState, states: states, evaluate: evaluate, closeChecklist: closeChecklist,
    settings: settings, saveSettings: saveSettings, initials: initials, setInitials: setInitials,
    staffOnly: staffOnly, setStaffOnly: setStaffOnly, residentLaunchAllowed: residentLaunchAllowed,
    hygieneDue: hygieneDue, hygieneLater: hygieneLater, hygieneSnoozed: hygieneSnoozed, hygieneDone: hygieneDone,
    readBattery: readBattery, readNetwork: readNetwork, dayContent: dayContent,
    addDaySource: function (fn) { if (typeof fn === 'function') daySources.push(fn); },
    DemoRun: DemoRun, MemStorage: MemStorage, demoSeed: demoSeed, demoServer: demoServer, demoRealm: demoRealm, frameHtml: frameHtml, demoSongId: demoSongId,
    DEMO_CODE: DEMO_CODE, demoMessageCache: demoMessageCache, CHAPTERS: CHAPTERS, demoScenes: demoScenes, demoPrice: demoPrice, demoSessions: demoSessions,
    demoOn: function () { return demo.on; },
    _guard: guardRealm, _clock: clock,
    /* Called first by every demo frame (frameHtml): the frames of one tour share one memory storage. */
    _realm: function (W) { if (!demo.shared) demo.shared = { local: MemStorage({}), session: MemStorage({}), lang: lang(), now: clock.now() }; return demoRealm(W, demo.shared); },
    _demoEnter: function () { demo.on = true; }, _demoLeave: function () { demo.on = false; }
  };

  if (typeof document === 'undefined' || !root.document) return;

  /* ---------- page helpers ---------- */
  var $ = function (id) { return document.getElementById(id); };
  function toast(msg) { if (root.Lab && root.Lab.toast) root.Lab.toast(msg); }
  function saveText(name, text, type) {
    var app = root.BellatrixApp;
    if (app && app.saveFile) {
      var where = '';
      try { where = app.saveFile(name, text); } catch (e) { where = ''; }
      toast(where ? T('Saved on the robot: {name}', { name: name }) : T('The robot could not save {name}.', { name: name }));
      return;
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })); a.download = name;
    document.body.appendChild(a); a.click(); a.parentNode.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function stamp() { var d = new Date(); return dateStr(d) + '-' + two(d.getHours()) + two(d.getMinutes()); }
  var LINE_NAME = { battery: 'Battery', wifi: 'Wi-Fi', volume: 'Volume', screen: 'Clean screen', content: 'Today’s content', zone: 'Clear area' };
  var STATE_NAME = { ok: 'OK', todo: 'To do', na: 'Not available' };
  var KIND_NAME = { karaoke: 'Karaoke', quiz: 'Quiz', other: 'Other' };
  function kindName(k) { return T(KIND_NAME[k] || k || 'Other'); }
  function stateName(x) { return x === 'ok' ? TX('OK') : T(STATE_NAME[x]); }
  var ICON = {
    tools: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l1 2h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8.5 13l2.5 2.5 4.5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    checklist: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="9" y="6" width="30" height="38" rx="5" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M16 18l3 3 6-6M16 30l3 3 6-6" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M29 19h4M29 31h4" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>',
    clean: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="8" width="38" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M18 42h12M24 34v8" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><path d="M30 14l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="currentColor"/><path d="M14 24l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="currentColor"/></svg>',
    demo: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M20 16l12 8-12 8z" fill="currentColor"/></svg>',
    journal: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 6h20l6 6v30H12z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/><path d="M18 20h14M18 27h14M18 34h9" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>',
    settings: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 14h18M36 14h2M10 34h4M22 34h16M10 24h10M28 24h10" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><circle cx="32" cy="14" r="4" fill="none" stroke="currentColor" stroke-width="3.5"/><circle cx="18" cy="34" r="4" fill="none" stroke="currentColor" stroke-width="3.5"/><circle cx="24" cy="24" r="4" fill="none" stroke="currentColor" stroke-width="3.5"/></svg>',
    battery: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="14" width="32" height="20" rx="4" fill="none" stroke="currentColor" stroke-width="3.5"/><rect x="39" y="20" width="4" height="8" rx="1.5" fill="currentColor"/><rect x="11" y="19" width="14" height="10" rx="2" fill="currentColor"/></svg>',
    wifi: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 19a26 26 0 0 1 36 0M12 26a17 17 0 0 1 24 0M18 33a8 8 0 0 1 12 0" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><circle cx="24" cy="39" r="3" fill="currentColor"/></svg>',
    volume: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 19h8l10-8v26l-10-8H8z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/><path d="M32 17a10 10 0 0 1 0 14M37 12a17 17 0 0 1 0 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>',
    screen: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="8" width="38" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M18 42h12M24 34v8" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><path d="M30 14l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="currentColor"/></svg>',
    content: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="10" width="34" height="32" rx="4" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M7 19h34M16 6v8M32 6v8" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><circle cx="17" cy="29" r="2.5" fill="currentColor"/><circle cx="24" cy="29" r="2.5" fill="currentColor"/><circle cx="31" cy="29" r="2.5" fill="currentColor"/></svg>',
    zone: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 42l6-36M36 42l-6-36" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><path d="M24 10v4M24 21v5M24 33v6" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>'
  };

  /* ---------- dialogs: big buttons, one question ---------- */
  function dialog(o, cb) {
    var old = $('stDialog'); if (old) old.parentNode.removeChild(old);
    var d = document.createElement('div');
    d.id = 'stDialog'; d.className = 'st-dialog'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = '<div class="st-dcard"><h2>' + esc(o.title) + '</h2>' + (o.text ? '<p>' + esc(o.text) + '</p>' : '') +
      (o.input ? '<input id="stDialogIn" type="text" autocomplete="off" autocapitalize="characters" maxlength="6" value="' + esc(o.value || '') + '" placeholder="' + esc(o.placeholder || '') + '" aria-label="' + esc(o.title) + '">' : '') +
      '<div class="st-dbtns">' + o.buttons.map(function (b, i) { return '<button type="button" class="' + (b.cls || (i ? 'ghost' : 'go')) + '" data-v="' + esc(b.value) + '">' + esc(b.label) + '</button>'; }).join('') + '</div></div>';
    document.body.appendChild(d);
    var input = $('stDialogIn');
    function close(v) {
      if (d.parentNode) d.parentNode.removeChild(d);
      if (cb) cb(v, input ? input.value : '');
    }
    d.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-v]') : null;
      if (b) close(b.getAttribute('data-v'));
      else if (e.target === d && o.dismiss !== false) close('');
    });
    if (input) {
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') close(o.buttons[0].value); });
      setTimeout(function () { try { input.focus(); input.select(); } catch (e) { /* no keyboard */ } }, 50);
    }
  }
  function confirmBox(title, yes, no, cb) {
    dialog({ title: title, buttons: [{ label: yes, value: 'yes' }, { label: no, value: 'no' }] }, function (v) { cb(v === 'yes'); });
  }
  /* "Who are you?": initials, remembered on this device and changeable. */
  function askWho(cb, change) {
    dialog({ title: T('Who are you?'), text: T('Your initials, for the log.'), input: true, value: change ? initials() : '', placeholder: T('e.g. AB'),
      buttons: [{ label: T('OK'), value: 'ok' }, { label: T('Cancel'), value: 'cancel' }] }, function (v, text) {
      if (v !== 'ok') { if (cb) cb(null); return; }
      var x = cleanInitials(text);
      if (!x) { askWho(cb, change); return; }
      setInitials(x);
      renderSheet();
      if (cb) cb(x);
    });
  }
  /* 1.15 (user, 10 Nov): never ask for initials; the log uses them only if they were set before. */
  function needWho(cb) { cb(initials()); }

  /* ---------- banners under the header: staff only, cleaning reminder, today's checklist ---------- */
  var chkLater = false, lastBanners = null;
  function bannerBox() {
    var box = $('stBanners');
    if (box) return box;
    var after = $('premiumBanner') || $('choiceBanner');
    if (!after || !after.parentNode) return null;
    box = document.createElement('div');
    box.id = 'stBanners'; box.className = 'st-banners';
    after.parentNode.insertBefore(box, after.nextSibling);
    box.addEventListener('click', onAction);
    return box;
  }
  function checklistToday() { var l = Journal.today('checklist'); return l.length ? l[l.length - 1] : null; }
  var ONLY_TITLE = 'Staff only: resident functions are off.';
  function renderBanners() {
    var box = bannerBox(), h = '';
    var so = staffOnly(), d = hygieneDue();
    document.body.classList.toggle('st-staffonly', !!so);
    var go = $('go');
    if (go) { if (so) go.setAttribute('title', T(ONLY_TITLE)); else if (go.getAttribute('title') === T(ONLY_TITLE)) go.removeAttribute('title'); }
    if (box) {
      if (so) {
        h += '<div class="banner st-banner st-red" role="status"><span><b>' + esc(T('Staff only')) + '</b> · ' + esc(T('resident functions are off')) +
          (so.by ? ' <small>(' + esc(so.by) + (so.at ? ', ' + esc(hm(so.at)) : '') + ')</small>' : '') + '</span>' +
          '<button type="button" class="go" data-sta="lift">' + esc(T('Turn back on')) + '</button></div>';
      }
      if (d && !hygieneSnoozed(d)) {
        h += '<div class="banner xfer st-banner st-hyg"><span><b>' + esc(T('Clean the screen')) + '</b> <small>(' + esc(kindName(d.kind)) + (d.at ? ' · ' + esc(hm(d.at)) : '') + ')</small></span>' +
          '<button type="button" class="go" data-sta="clean">' + esc(T('Cleaning mode')) + '</button>' +
          '<button type="button" class="go" data-sta="hyg-done">' + esc(TX('Done')) + '</button>' +
          '<button type="button" class="ghost" data-sta="hyg-later">' + esc(T('Later')) + '</button></div>';
      }
      if (!checklistToday() && !chkLater) {
        h += '<div class="banner xfer st-banner st-chk"><span>' + esc(T('Start of shift: checklist')) + '</span>' +
          '<button type="button" class="go" data-sta="open-checklist">' + esc(T('Start')) + '</button>' +
          '<button type="button" class="ghost" data-sta="chk-later">' + esc(T('Later')) + '</button></div>';
      }
      /* Drawn again only when something changed (the page checks every 15 s; a tap must not be lost). */
      if (lastBanners !== h) { box.innerHTML = h; lastBanners = h; }
      box.hidden = !h;
    }
    var dot = $('stToolsDot');
    if (dot) dot.hidden = !(d || so || !checklistToday());
  }
  function toolsButton() {
    if ($('stToolsBtn')) return;
    var sw = $('langSwitch');
    if (!sw || !sw.parentNode) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'stToolsBtn'; b.className = 'st-toolsbtn';
    b.innerHTML = ICON.tools + '<span>' + esc(T('Tools')) + '</span><i id="stToolsDot" class="st-dot" hidden></i>';
    b.addEventListener('click', function () { openSheet('menu'); });
    sw.parentNode.insertBefore(b, sw);
  }

  /* ---------- the tools sheet: menu, checklist, cleaning, journal, settings ---------- */
  var view = null;
  var chk = null;
  function freshChecklist() {
    var cleanedToday = Journal.today('hygiene');
    return { date: dateStr(), battery: undefined, network: undefined, batterySeen: false, soundTried: false, soundHeard: null, screenClean: cleanedToday.length > 0,
      screenAt: cleanedToday.length ? cleanedToday[cleanedToday.length - 1] : null, contentSeen: false, zoneClear: false };
  }
  function facts() {
    var s = settings();
    return { battery: chk.battery || null, batteryMin: s.batteryMin, batterySeen: chk.batterySeen, network: chk.network || null,
      soundHeard: chk.soundHeard, screenClean: chk.screenClean, contentSeen: chk.contentSeen, zoneClear: chk.zoneClear };
  }
  function refreshReadings() {
    if (!chk) return;
    chk.network = readNetwork();
    readBattery(function (b) { if (!chk) return; chk.battery = b; if (view === 'checklist') renderSheet(); });
  }
  function openSheet(v) {
    if (demo.on) return;
    var sh = $('stSheet');
    if (!sh) {
      sh = document.createElement('div');
      sh.id = 'stSheet'; sh.className = 'st-sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true');
      document.body.appendChild(sh);
      sh.addEventListener('click', onAction);
      sh.addEventListener('change', onChange);
    }
    /* The ticks of today's checklist stay while the staff look at another screen; readings are fresh. */
    if (v === 'checklist' && view !== 'checklist') {
      if (!chk || chk.date !== dateStr()) chk = freshChecklist();
      chk.battery = undefined; chk.network = undefined;
      refreshReadings();
    }
    view = v;
    sh.hidden = false;
    document.body.classList.add('st-noscroll');
    renderSheet();
    sh.scrollTop = 0;
  }
  function closeSheet() {
    var sh = $('stSheet');
    if (sh) sh.hidden = true;
    view = null;
    document.body.classList.remove('st-noscroll');
    renderBanners();
  }
  function head(title, back) {
    return '<header class="st-head"><button type="button" class="st-back" data-sta="' + (back || 'close') + '" aria-label="' + esc(T('Back')) + '">‹</button>' +
      '<h1>' + esc(title) + '</h1></header>';
  }
  function renderSheet() {
    var sh = $('stSheet');
    if (!sh || sh.hidden || !view) return;
    var h = '';
    if (view === 'menu') h = menuHtml();
    else if (view === 'checklist') h = checklistHtml();
    else if (view === 'clean') h = cleanHtml();
    else if (view === 'journal') h = journalHtml();
    else if (view === 'settings') h = settingsHtml();
    sh.innerHTML = '<div class="st-wrap">' + h + '</div>';
  }
  function btn(act, label, cls) { return '<button type="button" class="' + (cls || 'ghost') + '" data-sta="' + act + '">' + esc(label) + '</button>'; }
  function menuHtml() {
    var c = checklistToday(), d = hygieneDue(), n = Journal.list().length, so = staffOnly();
    function tile(act, icon, title, sub, cls) {
      return '<button type="button" class="st-tile' + (cls ? ' ' + cls : '') + '" data-sta="' + act + '"><span class="st-ticon">' + ICON[icon] + '</span><b>' + esc(title) + '</b><small>' + sub + '</small></button>';
    }
    var chkSub = c ? (c.result === 'ready' ? '<span class="st-okt">' + esc(TX('Ready')) + '</span>' : '<span class="st-badt">' + esc(T('Blocked')) + '</span>') + ' · ' + esc(hm(c.at)) + (c.staff ? ' · ' + esc(c.staff) : '') : esc(T('Not done today'));
    var cleanSub = d ? '<span class="st-badt">' + esc(T('Reminder waiting')) + '</span> · ' + esc(kindName(d.kind)) + (d.at ? ' ' + esc(hm(d.at)) : '') : esc(T('Cleaning mode: {n} s', { n: settings().lockSeconds }));
    return head(T('Tools')) +
      (so ? '<div class="banner st-banner st-red st-inline"><span><b>' + esc(T('Staff only')) + '</b> · ' + esc(T('resident functions are off')) + '</span>' + btn('lift', T('Turn back on'), 'go') + '</div>' : '') +
      '<div class="st-tiles">' +
      tile('open-checklist', 'checklist', T('Start of shift'), chkSub, c ? '' : 'st-due') +
      tile('open-clean', 'clean', T('Clean the screen'), cleanSub, d ? 'st-due' : '') +
      tile('demo', 'demo', T('Demo mode'), esc(T('5 to 7 minutes · nothing is saved'))) +
      tile('open-journal', 'journal', T('Log'), esc(n === 1 ? T('1 entry') : T('{n} entries', { n: n }))) +
      tile('open-settings', 'settings', T('Settings'), esc(T('Cleaning, battery, checklist'))) +
      '</div>';
  }
  /* B3: one row per line, its state, one action. */
  function checklistHtml() {
    var s = settings(), st = states(facts()), ev = evaluate(st, s.critical), b = chk.battery, net = chk.network;
    function row(k, text, actions) {
      return '<div class="st-row st-r-' + st[k] + '"><span class="st-ricon">' + ICON[k] + '</span><div class="st-rtext"><b>' + esc(T(LINE_NAME[k])) +
        (s.critical.indexOf(k) >= 0 ? ' <small class="st-crit">' + esc(T('critical')) + '</small>' : '') + '</b><span>' + text + '</span></div>' +
        '<span class="st-chip st-' + st[k] + '">' + esc(stateName(st[k])) + '</span><div class="st-ract">' + (actions || '') + '</div></div>';
    }
    var bText = b === undefined ? esc(T('Reading…')) : !b ? esc(T('The robot does not say.')) :
      esc(b.level + ' %') + (b.charging ? ' · ' + esc(T('charging')) : '') + (s.batteryMin === null ? ' · ' + esc(T('no threshold set')) : b.level < s.batteryMin ? ' · <b>' + esc(T('below {n} %', { n: s.batteryMin })) + '</b>' : '');
    var bAct = (b && s.batteryMin === null && !chk.batterySeen ? btn('battery-seen', T('Seen'), 'go') : '') + btn('reread', T('Check again'));
    var wText = net === undefined ? esc(T('Reading…')) : !net ? esc(T('The robot does not say.')) : net.connected ? esc(T('Connected')) + (net.type === 'wifi' ? ' (Wi-Fi)' : net.type === 'ethernet' ? ' (' + esc(T('cable')) + ')' : '') : '<b>' + esc(T('No connection. Check the Wi-Fi.')) + '</b>';
    var vText = chk.soundHeard === true ? esc(T('Heard')) : chk.soundHeard === false ? '<b>' + esc(T('Not heard. Check the volume.')) + '</b>' : chk.soundTried ? esc(T('Did you hear it?')) : esc(T('Not tested'));
    var vAct = chk.soundTried && chk.soundHeard === null ? btn('heard', T('Heard'), 'go') + btn('not-heard', T('Not heard')) : btn('sound', T('Test the sound'), chk.soundHeard === true ? 'ghost' : 'go');
    var due = hygieneDue();
    var sText = chk.screenClean ? esc(TX('Done')) + (chk.screenAt ? ' · ' + esc(hm(chk.screenAt.at)) + (chk.screenAt.staff ? ' · ' + esc(chk.screenAt.staff) : '') : '') : due ? esc(T('A reminder is waiting')) : esc(T('To tick'));
    var sAct = chk.screenClean ? '' : btn('clean', T('Cleaning mode'), 'go') + btn('screen-ok', T('Already clean'));
    var items = dayContent();
    var cText = items.length ? '<ul class="st-day">' + items.map(function (x) { return '<li' + (x.todo ? ' class="st-todo"' : '') + '>' + esc(x.text) + '</li>'; }).join('') + '</ul>' : esc(T('Nothing planned today.'));
    var cAct = chk.contentSeen ? '' : btn('content-seen', T('Seen'), 'go');
    var zText = esc(T('Corridors clear, dock reachable.'));
    var zAct = chk.zoneClear ? '' : btn('zone-ok', T('It’s clear'), 'go');
    var res;
    if (ev.ready) res = '<div class="st-endbtns">' + btn('finish', T('Finish'), 'go') + '</div>';
    else {
      res = '<div class="st-result st-blocked"><b>' + esc(T('Blocked')) + '</b><ul>' + ev.blocking.map(function (k) { return '<li>' + esc(T(LINE_NAME[k])) + ' · ' + esc(stateName(st[k])) + '</li>'; }).join('') + '</ul></div>';
      res += ev.proposeStaffOnly
        ? '<p class="st-q">' + esc(T('A critical line is missing.')) + '</p><div class="st-endbtns">' + btn('staff-only', T('Staff only'), 'go st-redbtn') + btn('continue', T('Continue anyway')) + '</div>'
        : '<div class="st-endbtns">' + btn('finish', T('Finish'), 'go') + '</div>';
    }
    var hist = Journal.list().filter(function (r) { return r.type === 'checklist'; }).slice(-3).reverse();
    return head(T('Start of shift'), 'menu') +
      '<div class="st-rows">' +
      row('battery', bText, bAct) + row('wifi', wText, btn('reread', T('Check again'))) + row('volume', vText, vAct) +
      row('screen', sText, sAct) + row('content', cText, cAct) + row('zone', zText, zAct) +
      '</div>' + res +
      (hist.length ? '<div class="st-hist"><h2>' + esc(T('Last checklists')) + '</h2>' + hist.map(function (r) {
        return '<p>' + esc(dayLabel(r.at)) + ' ' + esc(hm(r.at)) + ' · ' + esc(r.staff || '–') + ' · <span class="' + (r.result === 'ready' ? 'st-okt' : 'st-badt') + '">' + esc((r.result === 'ready' ? TX('Ready') : T('Blocked'))) + '</span></p>';
      }).join('') + '</div>' : '');
  }
  function cleanHtml() {
    var s = settings(), d = hygieneDue();
    return head(T('Clean the screen'), 'menu') +
      '<div class="st-clean">' +
      (d ? '<p class="st-due-line">' + esc(T('Reminder')) + ' · ' + esc(kindName(d.kind)) + (d.at ? ' · ' + esc(hm(d.at)) : '') + '</p>' : '') +
      (s.houseRule.trim() ? '<div class="st-rule"><h2>' + esc(T('House cleaning instructions')) + '</h2><p>' + esc(s.houseRule) + '</p></div>' : '') +
      '<button type="button" class="go st-big" data-sta="clean">' + esc(T('Cleaning mode')) + '<small>' + esc(T('The screen is locked for {n} s', { n: s.lockSeconds })) + '</small></button>' +
      '<div class="st-endbtns">' + btn('hyg-done', TX('Done'), 'go') + (d && !hygieneSnoozed(d) ? btn('hyg-later', T('Later')) : '') + '</div></div>';
  }
  var TYPE_NAME = { hygiene: 'Screen cleaned', checklist: 'Start of shift', override: 'Override', 'staff-only': 'Staff only' };
  function resultName(r) {
    if (r.type === 'checklist') return (r.result === 'ready' ? TX('Ready') : T('Blocked'));
    if (r.type === 'override') return T('Continued anyway');
    if (r.type === 'staff-only') return T(r.result === 'on' ? 'On' : 'Off');
    if (r.type === 'hygiene') return kindName(r.kind) + ' · ' + T(r.cleaning ? 'cleaning mode used' : 'without cleaning mode');
    return r.result || '';
  }
  function journalHtml() {
    var list = Journal.list().slice().reverse();
    return head(T('Log'), 'menu') +
      '<div class="st-jbar">' + btn('csv', T('Export (.csv)'), 'go') + '</div>' +
      (list.length ? '<div class="st-jtable"><table><thead><tr><th>' + esc(T('Date')) + '</th><th>' + esc(T('Time')) + '</th><th>' + esc(T('Who')) + '</th><th>' + esc(T('What')) + '</th><th>' + esc(T('Result')) + '</th></tr></thead><tbody>' +
        list.slice(0, 200).map(function (r) {
          var bad = (r.type === 'checklist' && r.result !== 'ready') || r.type === 'override' || (r.type === 'staff-only' && r.result === 'on');
          return '<tr><td>' + esc(dayLabel(r.at)) + '</td><td>' + esc(hm(r.at)) + '</td><td>' + esc(r.staff || '–') + '</td><td>' + esc(T(TYPE_NAME[r.type] || r.type)) + '</td><td' + (bad ? ' class="st-badt"' : '') + '>' + esc(resultName(r)) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="st-empty">' + esc(T('Nothing in the log yet.')) + '</p>');
  }
  function settingsHtml() {
    var s = settings();
    return head(T('Settings'), 'menu') +
      '<div class="st-form">' +
      '<label class="st-field"><span>' + esc(T('House cleaning instructions')) + '</span><textarea data-set="houseRule" rows="4" placeholder="' + esc(T('Free text from the care home. Empty by default.')) + '">' + esc(s.houseRule) + '</textarea></label>' +
      '<label class="st-field st-short"><span>' + esc(T('Cleaning lock (seconds)')) + '</span><input type="number" min="10" max="600" step="5" data-set="lockSeconds" value="' + esc(s.lockSeconds) + '"></label>' +
      '<label class="st-field st-short"><span>' + esc(T('Battery alert below (%)')) + '</span><input type="number" min="1" max="100" data-set="batteryMin" value="' + esc(s.batteryMin === null ? '' : s.batteryMin) + '" placeholder="' + esc(T('not set')) + '"></label>' +
      '<fieldset class="st-field"><legend>' + esc(T('Critical lines')) + '</legend><div class="st-checks">' +
      LINES.map(function (k) { return '<label><input type="checkbox" data-crit="' + k + '"' + (s.critical.indexOf(k) >= 0 ? ' checked' : '') + '> ' + esc(T(LINE_NAME[k])) + '</label>'; }).join('') +
      '</div></fieldset></div>' +
      (window.Places && Places.settingsHtml ? Places.settingsHtml() : '');   /* Places: base, rooms, Navigation test (js/places.js) */
  }
  function onChange(e) {
    var t = e.target;
    if (t.getAttribute('data-set')) {
      var k = t.getAttribute('data-set'), p = {};
      p[k] = t.value;
      if (saveSettings(p)) toast(T('Saved.'));
      if (k !== 'houseRule') renderSheet();
    } else if (t.getAttribute('data-crit')) {
      var list = Array.prototype.slice.call(document.querySelectorAll('#stSheet [data-crit]')).filter(function (x) { return x.checked; }).map(function (x) { return x.getAttribute('data-crit'); });
      if (saveSettings({ critical: list })) toast(T('Saved.'));
    }
  }

  /* ---------- all the buttons of the sheet and the banners ---------- */
  function onAction(e) {
    var b = e.target.closest ? e.target.closest('[data-sta]') : null;
    if (!b) return;
    var a = b.getAttribute('data-sta');
    if (a === 'close') closeSheet();
    else if (a === 'menu') openSheet('menu');
    else if (a === 'who') askWho(null, true);
    else if (a === 'open-checklist') openSheet('checklist');
    else if (a === 'open-clean') openSheet('clean');
    else if (a === 'open-journal') openSheet('journal');
    else if (a === 'open-settings') openSheet('settings');
    else if (a === 'demo') enterDemo();
    else if (a === 'csv') saveText('bellatrix-staff-journal-' + stamp() + '.csv', Journal.csv(), 'text/csv');
    else if (a === 'chk-later') { chkLater = true; renderBanners(); }
    else if (a === 'hyg-later') { hygieneLater(); renderBanners(); renderSheet(); }
    else if (a === 'hyg-done') doneDialog(false);
    else if (a === 'clean') cleaning();
    else if (a === 'lift') liftStaffOnly();
    else if (chk && view === 'checklist') checklistAction(a);
  }
  function checklistAction(a) {
    if (a === 'reread') { chk.battery = undefined; chk.network = undefined; renderSheet(); setTimeout(refreshReadings, 300); return; }
    if (a === 'battery-seen') chk.batterySeen = true;
    else if (a === 'sound') { chk.soundTried = true; chk.soundHeard = null; if (!chime(root.Lab && root.Lab.opt ? root.Lab.opt.volume : 0.6)) toast(T('This device cannot play a sound.')); }
    else if (a === 'heard') chk.soundHeard = true;
    else if (a === 'not-heard') chk.soundHeard = false;
    else if (a === 'screen-ok') { chk.screenClean = true; chk.screenAt = null; }
    else if (a === 'content-seen') chk.contentSeen = true;
    else if (a === 'zone-ok') chk.zoneClear = true;
    else if (a === 'finish') { finishChecklist(); return; }
    else if (a === 'staff-only') { finishChecklist('staff-only'); return; }
    else if (a === 'continue') {
      var miss = evaluate(states(facts()), settings().critical).criticalMissing.map(function (k) { return T(LINE_NAME[k]); }).join(', ');
      confirmBox(T('Continue without: {list}?', { list: miss }), T('Yes, continue'), T('Cancel'), function (yes) { if (yes) finishChecklist('continue'); });
      return;
    }
    renderSheet();
  }
  function finishChecklist(choice) {
    needWho(function (who) {
      if (!chk) return;
      var r = closeChecklist(facts(), who, choice);
      if (!r) return;
      if (r.needChoice) { renderSheet(); return; }
      var wasOnly = !!staffOnly() && choice !== 'staff-only';
      chk = null;
      if (r.result.ready) toast(T('Ready.'));
      else if (choice === 'staff-only') toast(T(ONLY_TITLE));
      else toast(T('Checklist saved.'));
      openSheet('menu');
      renderBanners();
      if (r.result.ready && wasOnly) {
        confirmBox(T('Everything is ready. Turn the resident functions back on?'), T('Yes'), T('No'), function (yes) {
          if (yes) { setStaffOnly(false, who, 'checklist ready'); renderBanners(); renderSheet(); }
        });
      }
    });
  }
  function liftStaffOnly() {
    confirmBox(T('Turn the resident functions back on?'), T('Yes'), T('No'), function (yes) {
      if (!yes) return;
      needWho(function (who) { setStaffOnly(false, who, 'lifted by staff'); toast(T('Resident functions are on again.')); renderBanners(); renderSheet(); });
    });
  }
  /* "Done": after the cleaning (with or without the lock), one line in the log. */
  function doneDialog(cleaningUsed, how) {
    needWho(function (who) {
      var rec = hygieneDone({ staff: who, cleaning: cleaningUsed, how: how });
      if (!rec) { toast(T('This device could not save.')); return; }
      toast(T('Screen cleaning noted.'));
      if (chk && view === 'checklist') { chk.screenClean = true; chk.screenAt = rec; }
      renderBanners(); renderSheet();
    });
  }

  /* ---------- B1: the cleaning lock overlay ---------- */
  var locking = null;
  var BLOCK = ['touchstart', 'touchmove', 'touchend', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel'];
  function cleaning() {
    if (demo.on || locking) return;
    var s = settings(), lock = CleanLock({ seconds: s.lockSeconds }).start(clock.now());
    var ov = document.createElement('div');
    ov.id = 'stLock'; ov.className = 'st-lock'; ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-live', 'polite');
    var R = 54, C = 2 * Math.PI * R;
    ov.innerHTML = '<div class="st-lin"><p class="st-lt">' + esc(T('Cleaning: the screen is locked')) + '</p><div class="st-ln" id="stLockN">' + lock.remaining(clock.now()) + '</div>' +
      (s.houseRule.trim() ? '<p class="st-lrule">' + esc(s.houseRule) + '</p>' : '') +
      '<button type="button" class="st-hold" id="stHold"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="' + R + '" class="st-ring0"/><circle cx="60" cy="60" r="' + R + '" class="st-ring" id="stRing" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '"/></svg>' +
      '<span>' + esc(T('Hold 3 s to unlock')) + '</span></button></div>';
    document.body.appendChild(ov);
    var hold = $('stHold'), ring = $('stRing'), num = $('stLockN'), timer, safety;
    function stopEv(e) { if (e.cancelable) e.preventDefault(); e.stopPropagation(); }
    function down(e) { stopEv(e); lock.holdStart(clock.now(), e.clientX, e.clientY); try { hold.setPointerCapture(e.pointerId); } catch (x) { /* fine */ } }
    function move(e) { stopEv(e); lock.holdMove(clock.now(), e.clientX, e.clientY); }
    function up(e) { stopEv(e); lock.holdEnd(clock.now()); }
    function update() {
      var t = clock.now();
      if (lock.tick(t)) { finish(); return; }
      num.textContent = lock.remaining(t);
      var p = lock.holdProgress(t);
      ring.setAttribute('stroke-dashoffset', (C * (1 - p)).toFixed(1));
      hold.classList.toggle('st-holding', p > 0);
    }
    function finish() {
      if (!locking) return;
      locking = null;
      clearInterval(timer); clearTimeout(safety);
      BLOCK.forEach(function (t) { ov.removeEventListener(t, stopEv, true); });
      document.removeEventListener('keydown', stopEv, true);
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      var how = lock.how() || 'timer';
      dialog({ title: T('Screen cleaned?'), buttons: [{ label: TX('Done'), value: 'done' }, { label: T('Not yet'), value: 'no' }], dismiss: false }, function (v) {
        if (v === 'done') doneDialog(true, how);
      });
    }
    BLOCK.forEach(function (t) { ov.addEventListener(t, stopEv, { capture: true, passive: false }); });
    document.addEventListener('keydown', stopEv, true);
    hold.addEventListener('pointerdown', down);
    hold.addEventListener('pointermove', move);
    hold.addEventListener('pointerup', up);
    hold.addEventListener('pointercancel', up);
    locking = { lock: lock, finish: finish };
    timer = setInterval(update, 100);
    /* Never stuck: even if something else goes wrong, the lock goes after its time. */
    safety = setTimeout(finish, (lock.seconds + 5) * 1000);
  }

  /* ---------- staff only: the resident launches of this page are refused ---------- */
  function guardLaunches() {
    document.addEventListener('click', function (e) {
      if (!staffOnly()) return;
      var t = e.target && e.target.closest ? e.target.closest('#go, [data-resident-launch]') : null;
      if (!t) return;
      e.preventDefault(); e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      toast(T(ONLY_TITLE));
    }, true);
  }

  /* ---------- K: the demo overlay and the presenter's tour ----------
     First the language (FR / EN / DE); then three frames, loaded once and kept: the patient screen,
     the Care Team and the family portal on a phone. They share one memory storage with invented data
     (demoSeed) and one small server in memory (demoServer), so the device's storage is never written
     and nothing is sent; demoRealm guards everything else. The frames take no touches: the tour plays
     by itself. One caption line in big type; Bellatrix says the same line when "Voice" is on. */
  var demoSpeed = 1;
  /* The demo's own texts, in the language chosen for the demo (the team's language before that). */
  function DT(k, v) { var l = demo.lang || lang(); return root.I18N && root.I18N.t ? root.I18N.t(l, k, v) : fill(k, v); }
  var narrN = 0, speakingUntil = 0;
  function quietNarration() {
    speakingUntil = 0;
    try { if (root.BellatrixApp && root.BellatrixApp.stopSpeaking) root.BellatrixApp.stopSpeaking(); } catch (e) { /* no voice */ }
    try { if (root.speechSynthesis) root.speechSynthesis.cancel(); } catch (e) { /* no voice */ }
  }
  /* Says one line. While it is said, the tour may hold its clock (never longer than 1.6 times the
     planned time plus 1.5 s, so a voice that never ends cannot stop the tour). */
  function narrate(text) {
    quietNarration();
    if (!demo.voice || !text) return;
    var app = root.BellatrixApp, l = demo.lang || lang(), est = sayMs(text, l);
    try {
      if (app && app.speak && (!app.canSpeak || app.canSpeak(l))) { speakingUntil = clock.now() + est; app.speak('demo' + (++narrN), text, 0.95, 0.9, 1, l); return; }
    } catch (e) { /* the browser's voice below */ }
    try {
      if (!root.speechSynthesis || !root.SpeechSynthesisUtterance) return;
      var u = new root.SpeechSynthesisUtterance(text);
      u.lang = { fr: 'fr-FR', de: 'de-DE', en: 'en-GB' }[l] || 'en-GB'; u.rate = 0.95;
      var mine = ++narrN;
      u.onend = u.onerror = function () { if (narrN === mine) speakingUntil = 0; };
      speakingUntil = clock.now() + est * 1.6 + 1500;
      root.speechSynthesis.speak(u);
    } catch (e) { speakingUntil = 0; /* no voice: the caption is there */ }
  }
  function speaking() { return speakingUntil > clock.now(); }

  function topBar() {
    return '<span class="st-dbadge">' + esc(DT('Demo mode')) + '</span>' +
      '<div class="st-dchap" id="stDemoChap" role="group" aria-label="' + esc(DT('Chapters')) + '"></div>' +
      '<div class="st-dctl" id="stDemoCtl"></div>' +
      '<button type="button" class="st-dexit" data-d="exit">' + esc(DT('Leave demo mode')) + '</button>';
  }
  function enterDemo() {
    if (demo.on) return;
    closeSheet();
    demo.on = true; demo.lang = null; demo.scenes = null;
    if (demo.voice === undefined) demo.voice = true;
    document.body.classList.add('st-demo');
    document.body.classList.add('st-noscroll');
    var ov = document.createElement('div');
    ov.id = 'stDemo'; ov.className = 'st-demo';
    ov.innerHTML = '<div class="st-dtop" id="stDemoTop">' + topBar() + '</div>' +
      '<div class="st-dstage" id="stDemoStage"></div>' +
      '<div class="st-dcap" id="stDemoCap"><span class="st-dkick" id="stDemoKick"></span><p class="st-dtext" id="stDemoText"></p></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', onDemoClick);
    root.addEventListener('resize', sizeFrames);
    chooseLang();
  }
  /* 1. The language of the demo: everything after follows it (captions, voice, the three screens). */
  var DEMO_LANGS = [['fr', 'Français'], ['en', 'English'], ['de', 'Deutsch']];
  function chooseLang() {
    var st = $('stDemoStage');
    if (!st) return;
    demoControls();
    st.innerHTML = '<div class="st-dlang"><h2>' + esc(T('Language of the demo')) + '</h2><div class="st-dlangs">' + DEMO_LANGS.map(function (x) {
      return '<button type="button" class="st-dlangbtn" data-dlang="' + x[0] + '" lang="' + x[0] + '"><b>' + x[0].toUpperCase() + '</b><span>' + esc(x[1]) + '</span></button>';
    }).join('') + '</div></div>';
    var k = $('stDemoKick'), t = $('stDemoText');
    if (k) k.textContent = ''; if (t) t.textContent = '';
  }
  /* 16 Nov: the demo films are not in the app (60 MB each): they lie in the head's own storage,
     Android/data/de.labland.bellatrix/files/videos/Bellatrix-demo-DE.mp4 (-FR, -EN), served at /videos/
     (WebActivity.serveVideo). At the end, or with the cross, back to the choice. */
  function playDemoVideo(l) {
    var st = $('stDemoStage');
    if (!st) return;
    /* on the head its own server plays the file (with byte ranges); the app's /videos/ path is the fallback */
    var srv = '';
    try { var hi = window.BellatrixApp && BellatrixApp.linkServer ? JSON.parse(BellatrixApp.linkServer() || '{}') : {}; if (hi && hi.running) srv = 'http://127.0.0.1:8765/'; } catch (e) { srv = ''; }
    /* 16 Nov (Rahma): the whole screen, over the demo's own bar; only the cross on top */
    stopDemoVideo();
    var d = document.createElement('div');
    d.id = 'stDemoVid'; d.className = 'st-dvid';
    d.innerHTML = '<video class="st-vplay" controls autoplay playsinline src="' + srv + 'videos/Bellatrix-demo-' + String(l).toUpperCase() + '.mp4"></video>' +
      '<button type="button" class="st-vclose" aria-label="' + esc(T('Close')) + '">\u00d7</button>';
    document.body.appendChild(d);
    d.querySelector('.st-vclose').addEventListener('click', function () { stopDemoVideo(); chooseLang(); });
    var v = d.querySelector('video');
    v.addEventListener('ended', function () { stopDemoVideo(); chooseLang(); });
    v.addEventListener('error', function () { stopDemoVideo(); startIn(l); });   /* no film on this robot: the guided demo */
    try { if (d.requestFullscreen) d.requestFullscreen().catch(function () { /* the fixed layer already covers the screen */ }); } catch (e) { /* idem */ }
  }
  function stopDemoVideo() {
    var d = $('stDemoVid');
    if (!d) return;
    var v = d.querySelector('video');
    if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* gone */ } }
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) { /* not in full screen */ }
    d.parentNode.removeChild(d);
  }
  function startIn(l) {
    demo.lang = I18N.valid(l);
    demo.scenes = demoScenes(demo.lang, DT);
    var top = $('stDemoTop'); if (top) top.innerHTML = topBar();
    var st = $('stDemoStage'); if (st) st.innerHTML = '<p class="st-dload">' + esc(DT('Loading…')) + '</p>';
    demoControls();
    buildFrames(function (F) {
      if (!demo.on) { destroyFrames(); return; }
      if (!F) { var s2 = $('stDemoStage'); if (s2) s2.innerHTML = '<p class="st-dload">' + esc(DT('The demo could not start.')) + '</p>'; demoControls(); return; }
      demo.tour = makeTour(F);
      demo.player = demo.tour;
      runDemo();
    });
  }
  function runDemo(from) {
    if (!demo.tour) return;
    if (demo.run) demo.run.stop();
    demo.run = DemoRun(demo.tour, { scenes: demo.scenes, speed: demoSpeed, onChange: demoControls, onTick: demoProgress, onEnd: function () { demoControls(); } });
    demo.run.start(from);
  }
  function demoProgress(s) {
    var c = $('stDemoChap');
    if (!c || !s) return;
    Array.prototype.forEach.call(c.querySelectorAll('[data-chap]'), function (b) {
      var i = +b.getAttribute('data-chap');
      b.className = 'st-chap' + (i === s.index ? ' on' : i < s.index ? ' seen' : '');
    });
  }
  function demoControls() {
    var c = $('stDemoCtl'), chap = $('stDemoChap');
    if (!c) return;
    var s = demo.run ? demo.run.state() : null, list = demo.scenes || [];
    if (chap && chap.children.length !== list.length) {
      chap.innerHTML = list.map(function (sc, i) {
        var name = (i + 1) + '. ' + DT(sc.name);
        return '<button type="button" class="st-chap" data-chap="' + i + '" title="' + esc(name) + '" aria-label="' + esc(name) + '"><i></i></button>';
      }).join('');
    }
    demoProgress(s);
    var voice = '<button type="button" class="st-dsm st-dvoice' + (demo.voice ? ' on' : '') + '" data-d="voice" aria-pressed="' + (demo.voice ? 'true' : 'false') + '">' + esc(DT('Voice')) + '</button>';
    if (s && s.running) {
      c.innerHTML = voice + '<button type="button" class="st-dsm st-dgo" data-d="' + (s.paused ? 'resume' : 'pause') + '">' + esc(DT(s.paused ? 'Resume' : 'Pause')) + '</button>' +
        '<button type="button" class="st-dsm st-dstop" data-d="stop">' + esc(DT('Stop')) + '</button>';
    } else if (s && s.ended) {
      c.innerHTML = voice + '<button type="button" class="st-dsm st-dgo" data-d="replay">' + esc(DT('Play the demo again')) + '</button>';
    } else c.innerHTML = voice;
  }
  function onDemoClick(e) {
    var b = e.target.closest ? e.target.closest('[data-d], [data-chap], [data-dlang], [data-dvideo], [data-dvclose]') : null;
    if (!b) return;
    if (b.hasAttribute('data-dvideo')) { if (!demo.lang) playDemoVideo(b.getAttribute('data-dvideo')); return; }
    if (b.hasAttribute('data-dvclose')) { stopDemoVideo(); chooseLang(); return; }
    /* 16 Nov (Rahma): choosing the language plays the demo film of that language (the guided demo only when the
       film is not on this robot) */
    if (b.hasAttribute('data-dlang')) { if (!demo.lang) playDemoVideo(b.getAttribute('data-dlang')); return; }
    if (b.hasAttribute('data-chap')) { if (!demo.tour) return; if (demo.run) demo.run.jump(+b.getAttribute('data-chap')); else runDemo(+b.getAttribute('data-chap')); return; }
    var a = b.getAttribute('data-d'), r = demo.run;
    if (a === 'exit') { leaveDemo(); return; }
    if (a === 'voice') { demo.voice = !demo.voice; if (!demo.voice) quietNarration(); demoControls(); return; }
    if (!r) return;
    if (a === 'pause') r.pause();
    else if (a === 'resume') r.resume();
    else if (a === 'stop') r.stop();
    else if (a === 'replay') runDemo();
  }
  /* One click and a simple confirmation; nothing was changed, so nothing needs restoring. */
  function leaveDemo(force) {
    var r = demo.run, wasRunning = !!(r && r.state().running && !r.state().paused);
    function out() {
      stopDemoVideo();
      if (demo.run) { demo.run.stop(); demo.run = null; }
      if (demo.tour) { demo.tour.destroy(); demo.tour = null; demo.player = null; }
      quietNarration();
      destroyFrames();
      var ov = $('stDemo'); if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
      root.removeEventListener('resize', sizeFrames);
      demo.on = false; demo.lang = null; demo.scenes = null;
      document.body.classList.remove('st-demo');
      document.body.classList.remove('st-noscroll');
      toast(T('Back to normal.'));
      renderBanners();
    }
    if (force === true || !demo.lang) { out(); return; }
    if (wasRunning) r.pause();
    confirmBox(DT('Leave demo mode?'), DT('Yes, leave'), DT('Stay'), function (yes) {
      if (!yes) { if (wasRunning && demo.run === r) r.resume(); return; }
      out();
    });
  }

  /* ---------- the three frames ---------- */
  var FRAME_PAGES = { patient: 'patient.html', staff: 'staff.html', portal: 'portail.html' };
  /* Their size on the page they think they are on: the Care Team screen and a phone. */
  var STAFF_W = 1280, STAFF_H = 720, PHONE_W = 400, PHONE_H = 800, GAP = 18;
  function destroyFrames() {
    var st = $('stDemoStage');
    if (st) Array.prototype.forEach.call(st.querySelectorAll('.st-dbox'), function (b) { b.parentNode.removeChild(b); });
    demo.frames = null; demo.shared = null; demo.win = null; demo.shown = null;
  }
  /* One frame, or two side by side (the small Care Team screen beside the big patient screen, the
     phone beside the Care Team). The patient screen takes the room it is given; the Care Team and the
     phone keep their own size, scaled. */
  function sizeFrames() {
    var box = $('stDemoStage');
    if (!box) return;
    var r = box.getBoundingClientRect(), W = r.width, H = r.height, kinds = demo.shown || ['patient'];
    var ratio = { patient: 16 / 9, staff: STAFF_W / STAFF_H, portal: PHONE_W / PHONE_H };
    var weight = function (k) { return kinds.length > 1 && k === 'staff' && kinds.indexOf('patient') >= 0 ? 0.6 : 1; };
    var need = 0;
    kinds.forEach(function (k) { need += ratio[k] * weight(k); });
    var h = Math.min(H, (W - GAP * (kinds.length - 1)) / need), x = Math.max(0, (W - (h * need + GAP * (kinds.length - 1))) / 2);
    var place = {};
    kinds.forEach(function (k) { var hh = h * weight(k), ww = hh * ratio[k]; place[k] = { x: x, y: (H - hh) / 2, w: ww, h: hh }; x += ww + GAP; });
    Array.prototype.forEach.call(box.querySelectorAll('.st-dbox'), function (b) {
      var kind = b.getAttribute('data-kind'), f = b.querySelector('iframe'), p = place[kind];
      if (!p) return;
      if (kind === 'patient') {
        if (kinds.length === 1 && W / H <= 1.15) { p.h = Math.min(H, W * 16 / 9); p.w = p.h * 9 / 16; p.x = (W - p.w) / 2; p.y = (H - p.h) / 2; }
        b.style.width = Math.floor(p.w) + 'px'; b.style.height = Math.floor(p.h) + 'px'; b.style.transform = '';
        f.style.width = '100%'; f.style.height = '100%';
      } else {
        var lw = kind === 'staff' ? STAFF_W : PHONE_W, lh = kind === 'staff' ? STAFF_H : PHONE_H, s = p.h / lh;
        b.style.width = lw + 'px'; b.style.height = lh + 'px';
        b.style.transform = 'scale(' + s.toFixed(4) + ')';
      }
      b.style.marginLeft = Math.floor(p.x) + 'px'; b.style.marginTop = Math.floor(p.y) + 'px';
    });
  }
  function buildFrames(cb) {
    var host = $('stDemoStage');
    if (!host) { cb(null); return; }
    var base = location.href.replace(/[?#].*$/, '').replace(/[^\/]*$/, ''), l = demo.lang || lang(), t = clock.now(), real = null;
    try { real = root.localStorage; } catch (e) { real = null; }
    demo.shared = { local: MemStorage(demoSeed(l, t, real)), session: MemStorage({ labTrayOpen: '0' }), lang: l, now: t };
    var F = { patient: null, staff: null, portal: null }, left = 3, finished = false;
    function done() {
      if (finished) return;
      finished = true;
      var load = host.querySelector('.st-dload'); if (load) load.parentNode.removeChild(load);
      if (!F.patient) { cb(null); return; }
      demo.frames = F; demo.win = F.patient;
      F.show = function (kinds) {
        kinds = (Array.isArray(kinds) ? kinds : [kinds]).filter(function (k) { return !!F[k]; });
        if (!kinds.length) kinds = ['patient'];
        demo.shown = kinds;
        Array.prototype.forEach.call(host.querySelectorAll('.st-dbox'), function (b) { b.classList.toggle('on', kinds.indexOf(b.getAttribute('data-kind')) >= 0); });
        sizeFrames();
      };
      sizeFrames();
      cb(F);
    }
    setTimeout(done, 25000);
    Object.keys(FRAME_PAGES).forEach(function (kind) {
      var page = FRAME_PAGES[kind];
      function make(src) {
        if (!demo.on || finished) { if (--left <= 0) done(); return; }
        var box = document.createElement('div');
        box.className = 'st-dbox st-dbox-' + kind; box.setAttribute('data-kind', kind);
        var f = document.createElement('iframe');
        f.className = 'st-dframe'; f.title = DT('Demo mode'); f.setAttribute('allow', 'autoplay'); f.setAttribute('tabindex', '-1');
        var seen = false;
        f.addEventListener('load', function () {
          var W = f.contentWindow;
          if (seen || !W) return;
          if (String(W.location.href) === 'about:blank' && !W.Lab && !W.BellatrixPortal) return;
          seen = true;
          if (W.__demoMem && (W.Lab || W.BellatrixPortal)) F[kind] = W;
          if (--left <= 0) done();
        });
        /* srcdoc keeps the Care Team page as the referrer of the frame's requests (YouTube's player
           in Bellatrix Play refuses a page without one, as a blob page would be). */
        f.srcdoc = frameHtml(src, base, kind, DT('Demo mode'));
        box.appendChild(f);
        host.appendChild(box);
        sizeFrames();
      }
      root.fetch(page, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.text() : ''; }).then(make, function () { make(''); });
    });
  }

  /* ---------- the tour: what each chapter does on the real screens ----------
     ACT[chapter] has one entry per line of that chapter (CHAPTERS, same order): a function run when
     the line starts, or a list of [ms after the line starts, function]. A step that finds nothing to
     do (a module not there, a button renamed) does nothing: the caption and the screen stay. */
  function makeTour(F) {
    var P = F.patient, Sf = F.staff, Po = F.portal, l = demo.lang || lang(), D = demoText(l), mem = demo.shared.local;
    var cur = null, done = {}, paused = [], lastMs = 0, lineNo = -1;
    function q(W, sel) { try { return W ? W.document.querySelector(sel) : null; } catch (e) { return null; } }
    function qa(W, sel) { try { return W ? Array.prototype.slice.call(W.document.querySelectorAll(sel)) : []; } catch (e) { return []; } }
    function click(W, sel) { var el = q(W, sel); if (el && !el.disabled) { try { el.click(); } catch (e) { return false; } return true; } return false; }
    function later(ms, fn) { return [ms, fn]; }
    /* the patient screen */
    function sid() { var S = P && P.Lab && P.Lab._t && P.Lab._t.state; return S && S.step ? S.step.id : ''; }
    function step() { var S = P && P.Lab && P.Lab._t && P.Lab._t.state; return S && S.step ? S.step : null; }
    function act(i) { try { P.Lab._t.doAction(i, 'touch'); } catch (e) { /* not on screen */ } }
    function pick(i) { try { P.Lab._t.choose(i, 'touch'); } catch (e) { /* not on screen */ } }
    function has(key) { try { return !!(P && P.Lab && P.Lab.byKey[key]); } catch (e) { return false; } }
    function endP() { try { if (P && P.Lab && P.Lab.isOn()) P.Lab.endSession(); } catch (e) { /* over */ } }
    function pStart(key, content, data) {
      if (!P || !P.Lab || !has(key)) return false;
      endP();
      var L = P.Lab, o = L.opt;
      o.lang = l; o.voice = false; o.camMode = 'off'; o.camMove = false; o.mood = false; o.greet = D.names.resident; o.volume = 0.8;
      o.participant = DEMO_CODE; o.staff = ''; o.zone = 'DEMO'; o.profile = ''; o.subtitles = false; o.textSize = 'normal';
      o.life = { born: '1945', loves: '', avoid: '' };
      L.patient = DEMO_CODE; L.content = content || {};
      try { L.start(key, { preview: true, direct: true, data: data || null }); return true; } catch (e) { if (root.console) root.console.warn('demo start', key, e); return false; }
    }
    var pending = null;
    if (P && P.Lab && !P.Lab.byKey.stdemo) {
      P.Lab.define({ key: 'stdemo', day: 0, name: 'Demo', zone: 'DEMO', hidden: true, noAgain: true, noHandSigns: true,
        art: function () { return ''; }, content: [], start: function () { var s = pending; pending = null; return s; } });
    }
    function pDemo(which) {
      if (!P || !P.Lab) return;
      var face = P.Lab.faceHtml('hero');
      pending = which === 'welcome'
        ? { id: 'demo-welcome', final: true, title: DT('Hello, I am Bellatrix.'), lead: DT('Here is what I do with the residents.'), pic: face, picCls: 'facebox' }
        : which === 'end'
          ? { id: 'demo-end', final: true, center: true, title: DT('Thank you!'), lead: DT('That was the Bellatrix demo. Nothing was saved.'), body: '<div class="picture facebox st-demo-face">' + face + '</div>' }
          : { id: 'demo-idle', final: true, center: true, title: DT('Demo mode'), body: '<div class="picture facebox st-demo-face">' + face + '</div>' };
      pStart('stdemo');
    }
    /* Premium of the demo resident, per product (js/premium.js v3), in the frames' memory only */
    function premium(W, product, on) {
      try {
        var Pm = W && W.Premium;
        if (!Pm) return;
        if (on && Pm.activate) Pm.activate(DEMO_CODE, product, { until: new Date(demo.shared.now + 90 * 864e5).toISOString(), by: 'Demo', source: 'team' });
        else if (!on && Pm.deactivate) Pm.deactivate(DEMO_CODE, product);
      } catch (e) { /* that module's problem */ }
    }
    function startPlay() { pStart('play', { play: { minutes: '90', links: '' } }); }
    /* the Care Team */
    function staffReset() {
      if (!Sf) return;
      tray(false);
      try { var u = Sf.StaffTools && Sf.StaffTools.ui; if (u) { u.closeSheet(); var lk = u.locking(); if (lk) lk.finish(); } } catch (e) { /* closed */ }
      qa(Sf, '#stDialog, .pmbackdrop, #msgReview, #wrapOverlay').forEach(function (x) { if (x.parentNode) x.parentNode.removeChild(x); });
      try { Sf.document.dispatchEvent(new Sf.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); } catch (e) { /* nothing open */ }
    }
    function tab(t, sub) { try { Sf.StaffUI.showTab(t, sub); Sf.scrollTo(0, 0); } catch (e) { /* not ready */ } }
    function scrollTo(W, sel) { var el = q(W, sel); if (el && el.scrollIntoView) { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { el.scrollIntoView(true); } } }
    function tray(open) {
      var line = q(Sf, '#trayLine'), list = q(Sf, '#trayList');
      if (line && !line.hidden && list && list.hidden === open && !q(Sf, '#bannerTray.single')) line.click();
    }
    /* the family portal on the phone */
    function portal(tabId, sheet) {
      var B = Po && Po.BellatrixPortal;
      if (!B) return;
      var S = B.state;
      S.sheet = sheet || ''; S.pay = null; S.gift = null; if (tabId) S.tab = tabId; S.mode = 'text';
      try { (B.loadMe ? B.loadMe() : Promise.resolve()).then(function () { B.render(); }, function () { B.render(); }); } catch (e) { try { B.render(); } catch (x) { /* drawn later */ } }
    }
    function typeInto(W, sel, text, parts, every) {
      var out = [];
      for (var k = 1; k <= parts; k++) {
        (function (n) {
          out.push([n * every, function () {
            var el = q(W, sel);
            if (!el) return;
            el.value = text.slice(0, Math.round(text.length * n / parts));
            try { el.dispatchEvent(new W.Event('input', { bubbles: true })); } catch (e) { /* old */ }
          }]);
        })(k);
      }
      return out;
    }
    function boardGames() {
      if (!Sf) return;
      staffReset(); tab('library'); F.show(['staff']);
      setTimeout(function () {
        var card = qa(Sf, '#libBody .appcard').filter(function (c) { return /chess|échecs|schach|ludo/i.test(c.textContent || ''); })[0];
        if (card && card.scrollIntoView) card.scrollIntoView({ block: 'center' });
      }, 400);
    }
    function setVal(W, sel, v) { var el = q(W, sel); if (el) { el.value = v; try { el.dispatchEvent(new W.Event('input', { bubbles: true })); } catch (e) { /* old */ } } }

    var ACT = {
      intro: [function () { staffReset(); tab('session'); pDemo('welcome'); }, null, null, null],
      shift: [function () { staffReset(); tab('session'); try { Sf.StaffTools.ui.openSheet('checklist'); } catch (e) { /* no tools */ } },
        [later(1500, function () { click(Sf, '[data-sta="screen-ok"]'); }), later(2500, function () { click(Sf, '[data-sta="content-seen"]'); }), later(3500, function () { click(Sf, '[data-sta="zone-ok"]'); }),
          later(4500, function () { click(Sf, '[data-sta="heard"]'); })]],
      todo: [function () { staffReset(); tab('session'); try { Sf.StaffTools.ui.renderBanners(); } catch (e) { /* no tools */ } setTimeout(function () { tray(true); }, 300); },
        function () { scrollTo(Sf, '.st-hyg'); },
        [later(0, function () { tray(false); try { Sf.StaffTools.ui.cleaning(); } catch (e) { /* no lock */ } }), later(5500, function () { try { var lk = Sf.StaffTools.ui.locking(); if (lk) lk.finish(); } catch (e) { /* over */ } })]],
      family: [[later(0, function () { staffReset(); tab('session'); portal('messages'); })].concat(typeInto(Po, '#msgText', D.second, 5, 1100)),
        function () { click(Po, '[data-do="send"]'); },
        [later(0, function () { try { if (Sf.MessagesStaff) Sf.MessagesStaff.refresh(); } catch (e) { /* no portal */ } }), later(1200, function () { tray(true); scrollTo(Sf, '#famWaitBanner'); })],
        /* straight to Family > Messages (the notification stays new there, with its button) */
        [later(0, function () { tray(false); tab('family', 'queue'); }), later(1500, function () { scrollTo(Sf, '#msgBody [data-m="navigate"]'); }), later(2600, function () { click(Sf, '#msgBody [data-m="navigate"]'); })]],
      premium: [function () { staffReset(); tab('session'); setTimeout(function () { tray(true); scrollTo(Sf, '#premiumBanner'); }, 300); },
        [later(0, function () { tray(false); try { Sf.PlayPremium.open({ patient: DEMO_CODE, product: 'play' }); } catch (e) { /* no Premium window */ } }),
          later(2500, function () { var p = qa(Sf, '[data-pm="plan"]'); if (p[1]) p[1].click(); }), later(4800, function () { click(Sf, '[data-pm="authorise"]'); })],
        function () { portal('premium'); },
        [later(0, function () { click(Po, '[data-do="req-pay"]'); }), later(1500, function () { setVal(Po, '#payName', D.names.from); setVal(Po, '#payNum', '4242 4242 4242 4242'); setVal(Po, '#payExp', '12/28'); setVal(Po, '#payCvc', '123'); }),
          later(4500, function () { click(Po, '[data-do="pay"]'); })],
        [later(0, function () { staffReset(); try { if (Sf.Premium && Sf.Premium.poll) Sf.Premium.poll().then(null, function () {}); } catch (e) { /* no poll */ } }), later(900, function () { tab('library'); })]],
      consent: [[later(0, function () { staffReset(); tab('family', 'accounts'); }), later(2200, function () { var r = q(Sf, '#msgBody input[name="msgLevel"][value="all"]'); if (r) r.checked = true; scrollTo(Sf, '#msgBody [data-m="consent"]'); }),
          later(3800, function () { click(Sf, '#msgBody [data-m="consent"]'); })],
        function () { portal('messages', 'account'); setTimeout(function () { scrollTo(Po, '.card:nth-of-type(3)'); }, 900); }],
      results: [function () { staffReset(); tab('results'); },
        function () { click(Sf, '#resWrapped'); }],
      contents: [function () {
        staffReset();
        try { var R = Sf.Reco.shared(); R.setCold(DEMO_CODE, { songs: [], decade: 1960, lang: l, by: 'Demo' }); R.runDue(); Sf.RecoStaff.show(DEMO_CODE); } catch (e) { tab('contents', 'music'); }
      }, [later(0, function () { scrollTo(Sf, '#recoBody [data-rs="approve"]'); }), later(2500, function () { click(Sf, '#recoBody [data-rs="approve"]'); })]],
      settings: [function () { staffReset(); tab('session'); try { Sf.StaffTools.ui.openSheet('settings'); } catch (e) { /* no tools */ } },
        function () { staffReset(); tab('library'); }],
      welcome: [function () { if (!pStart('hello')) pDemo('welcome'); }],
      play: [[later(0, function () { premium(P, 'play', false); startPlay(); }), later(3000, function () { click(P, '[data-b="p-hero-play"]'); }), later(6500, function () { click(P, '[data-b="p-lyrics"]'); })],
        [later(0, function () { click(P, '[data-b="p-nav-home"]'); }), later(1200, function () { click(P, '[data-b="p-ai-open"]'); }), later(3500, function () { click(P, '[data-b="p-chip-0"]'); })],
        function () { click(P, '[data-b="p-pods-open"]') || click(P, '[data-b="p-nav-pods"]'); },
        function () { click(P, '[data-b="p-premium-side"]'); }],
      karaoke: [function () { pStart('karaoke', {}, { song: demoSongId(P, l), demo: true }); }, null],
      /* Chess and Ludo come from the Library (pack "Board games"): when this robot does not have them,
         the Library shows the pack instead. */
      games: [[later(0, function () { F.show(['patient']); pStart('pairs'); }), later(1800, function () { if (/intro|pairs/.test(sid())) act(0); })],
        function () { if (!pStart('chess')) boardGames(); },
        function () { if (!pStart('ludo')) boardGames(); }],
      memories: [[later(0, function () { pStart('album', { album: { source: 'generic' } }); }), later(2500, function () { if (/themes/.test(sid())) pick(0); })],
        function () { if (/photo/.test(sid())) act(1); }],
      books: [[later(0, function () { premium(P, 'books', true); pStart('reading', { reading: { turn: 'manual' } }); }),
          later(2200, function () {
            var s = step(), list = s && s.choices ? s.choices : [], k = 0;
            for (var i = 0; i < list.length; i++) if (!/rdlocked/.test(list[i].cls || '')) { k = i; break; }
            try { if (list[k] && P.Reading && P.Reading.savePlace) P.Reading.savePlace(DEMO_CODE, list[k].value, { ch: 1, para: 4, pct: 12 }); } catch (e) { /* from the start */ }
            pick(k);
          })],
        function () { if (sid() === 'reading-resume') act(0); },
        [later(500, function () { if (sid() === 'reading-page') act(1); })]],
      messages: [[later(0, function () {
          var ids = [];
          try { ids = Object.keys(JSON.parse(mem.getItem('bellatrix-messages-cache') || '{}').items || {}).sort().reverse(); } catch (e) { ids = ['m-demo-1']; }
          pStart('messages', {}, { code: DEMO_CODE, ids: ids.slice(0, 1), team: true });
        }), later(3500, function () { if (sid() === 'msg-ask') act(0); })],
        function () { pStart('familycall', {}, { call: 'demo-call-1', resident: DEMO_CODE, contact: { id: 'c1', name: D.names.caller, rel: 'daughter', photo: '' } }); }],
      daily: [function () { pStart('sayings'); },
        function () { pStart('quiz'); },
        [later(0, function () { pStart('move', { move: { zone: 'arms', video: 'offer', count: '2' } }); }), later(3800, function () { if (/^zone-/.test(sid())) act(0); })]],
      end: [function () { pDemo('end'); }]
    };
    function sounds(fn) { (P && P.__demoAudio || []).forEach(function (c) { try { fn(c); } catch (e) { /* closed */ } }); }
    function caption(sc, i, line) {
      var k = $('stDemoKick'), t = $('stDemoText');
      if (k) k.textContent = (i + 1) + ' / ' + (demo.scenes || []).length + ' · ' + DT(sc.name);
      if (t) t.textContent = line ? line.text : '';
    }
    function runStep(id, fn) { try { fn(); } catch (e) { if (root.console) root.console.warn('demo', id, e); } }
    return {
      enter: function (sc, i) {
        cur = sc; done = {}; lineNo = -1; lastMs = 0; cur.index = i;
        if (sc.frames.indexOf('patient') < 0) endP();
        F.show(sc.frames);
        this.tick(sc, 0);
      },
      tick: function (sc, ms) {
        lastMs = ms;
        /* A video YouTube refuses (offline, or not allowed here): back to Play's home. */
        if (sc.id === 'play' && sid() === 'play-problem' && !done.home) { done.home = 1; click(P, '[data-b="p-home"]'); setTimeout(function () { done.home = 0; }, 4000); }
        var acts = ACT[sc.id] || [];
        sc.lines.forEach(function (line, k) {
          if (ms < line.at) return;
          if (lineNo < k) { lineNo = k; caption(sc, sc.index, line); narrate(line.text); }
          var a = acts[k];
          if (!a) return;
          var steps = typeof a === 'function' ? [[0, a]] : a;
          steps.forEach(function (s, j) {
            var key = k + ':' + j;
            if (!done[key] && line.at + s[0] <= ms) { done[key] = 1; runStep(sc.id, s[1]); }
          });
        });
      },
      /* the clock waits while the line is still being said and the next line is due */
      holding: function () {
        if (!cur || !speaking()) return false;
        var next = cur.lines[lineNo + 1];
        return lastMs >= (next ? next.at : cur.ms - 300);
      },
      pause: function () {
        quietNarration();
        try { var p = P.Lab._play && P.Lab._play.player(); if (p && p.pauseVideo) p.pauseVideo(); } catch (e) { /* no video */ }
        sounds(function (c) { if (c.state === 'running') c.suspend(); });
        paused = (P && P.__demoMedia || []).filter(function (m) { return !m.paused; });
        paused.forEach(function (m) { try { m.pause(); } catch (e) { /* gone */ } });
      },
      resume: function () {
        sounds(function (c) { if (c.state === 'suspended') c.resume(); });
        paused.forEach(function (m) { try { m.play(); } catch (e) { /* gone */ } });
        paused = [];
        try { var p = P.Lab._play && P.Lab._play.player(); if (p && p.playVideo) p.playVideo(); } catch (e) { /* no video */ }
      },
      stopAll: function () { quietNarration(); endP(); staffReset(); F.show(['patient']); sounds(function (c) { if (c.state === 'suspended') c.resume(); }); pDemo('idle'); caption({ name: 'Demo mode' }, -1, null); },
      idle: function () { quietNarration(); },
      destroy: function () { quietNarration(); endP(); },
      step: function () { return sid(); },
      chapter: function () { return cur ? cur.id : null; },
      blocked: function () { var out = []; ['patient', 'staff', 'portal'].forEach(function (k) { if (F[k]) out = out.concat(F[k].__demoBlocked || []); }); return out; },
      frames: F
    };
  }

  /* ---------- start ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    toolsButton();
    guardLaunches();
    renderBanners();
    root.addEventListener('storage', function (e) {
      if (!e.key || e.key === K.due || e.key === K.staffOnly || e.key === K.journal || e.key === K.later || e.key === K.premiumReq) { renderBanners(); if (view === 'menu' || view === 'clean') renderSheet(); }
    });
    root.addEventListener('focus', renderBanners);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') renderBanners(); });
    root.addEventListener('bellatrix-play-premium', function () { if (view === 'checklist') renderSheet(); });
    /* A reminder can arrive while this page is open and no event comes (another screen of the app). */
    setInterval(function () { if (!demo.on && !locking) renderBanners(); }, 15000);
  });

  /* For the automated checks (tests/staff-tools.test.mjs and the screenshots). */
  StaffTools.ui = {
    openSheet: openSheet, closeSheet: closeSheet, cleaning: cleaning, enterDemo: enterDemo, leaveDemo: leaveDemo, renderBanners: renderBanners,
    demoSpeed: function (x) { demoSpeed = x > 0 ? x : 1; }, demo: function () { return demo; }, checklist: function () { return chk; }, locking: function () { return locking; }
  };
})(typeof window !== 'undefined' ? window : this);
