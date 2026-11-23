/* Bellatrix Care Lab: the participant screen.
   One engine runs every activity. An activity hands it steps; a step says what is on the
   screen (title, picture, numbered choices, buttons) and the engine makes each of them work
   the same way by touch, by voice, by held hand signs or by pointing in the air, and logs every input.
   Layout: a 1080 x 1920 portrait screen scaled to the window, like the robot's front display;
   on a wide screen (the robot's head screen) a 1920 x 1080 stage in two columns. */
(function () {
  'use strict';

  /* Keep in step with the ?v= strings in index.html, so browsers fetch changed files. */
  var VERSION = '1.16.0';
  /* Detection runs from the copies in vendor/ when the page is served by start.bat, so it works
     without internet; the CDN is the fallback (for example when the page is opened as a file). */
  var MP_LOCAL = 'vendor/mediapipe', MP_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  var HAND_MODEL = 'hand_landmarker.task', POSE_MODEL = 'pose_landmarker_lite.task';
  var MODEL_CDN = {
    'hand_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    'pose_landmarker_lite.task': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
  };

  /* A hand sign has to be held this long before it counts. */
  var HOLD_MS = 1500;
  /* Silence after the robot spoke before it gently asks again, and how often it does. */
  var REPROMPT_MS = 40000, REPROMPT_MAX = 1;
  /* Taps into this corner of the screen (in screen pixels) open the staff panel. */
  var CORNER_PX = 160;

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clock(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function today(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  var Lab = window.Lab = {
    version: VERSION, activities: [], byKey: {}, content: {}, patient: 'P1',
    /* camMode: 'off', 'signs' (hand signs) or 'air' (point at the screen without touching it). */
    opt: { voice: true, camMode: 'off', camMove: false, rate: 0.92, volume: 0.9, textSize: 'normal', subtitles: false, greet: '',
           staff: '', zone: '', profile: '', participant: '', mapRev: '', sw: '' },
    esc: esc, today: today, clock: clock, pad: pad,
    define: function (a) { Lab.activities.push(a); Lab.byKey[a.key] = a; },
    onSessionEnd: null
  };

  /* ---------- text matching ---------- */
  var NUMW = { '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten' };
  var STOP = ['the', 'a', 'an', 'of', 'and', 'with', 'to', 'your', 'my', 'i', 'im', 'it', 'is', 'in', 'on', 'for', 'this', 'that', 'me', 'please', 'yes', 'no', 'or', 'at', 'from', 'some', 'its',
    'had', 'has', 'are', 'was', 'be', 'lets', 'thats', 'one', 'two', 'three'];
  function clean(raw) {
    return String(raw || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’'`]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/\b(10|[0-9])\b/g, function (m) { return NUMW[m]; });
  }
  function hasWord(t, w) { return (' ' + t + ' ').indexOf(' ' + w + ' ') >= 0; }
  function anyWord(t, list) { return list.some(function (w) { return hasWord(t, clean(w)); }); }
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) d[i] = [i];
    for (j = 1; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  /* Words a choice or button answers to: its own words, plus the meaningful words of its label. */
  function wordsOf(item) {
    if (item._w) return item._w;
    var w = (item.words || []).map(clean).filter(Boolean);
    if (!item.noLabelWords) {
      clean(item.label).split(' ').forEach(function (x) { if (x.length >= 3 && STOP.indexOf(x) < 0 && w.indexOf(x) < 0) w.push(x); });
      var whole = clean(item.label);
      if (whole.indexOf(' ') > 0 && w.indexOf(whole) < 0) w.push(whole);
    }
    item._w = w;
    return w;
  }
  /* Index of the one item the words point to best; -1 for none, -2 when several fit equally.
     A phrase counts double, so "twinkle little star" beats "little" in another title. */
  function matchItems(items, texts, ordinals) {
    var live = items.map(function (it) { return !!it && !it.disabled; }), k, t;
    for (k = 0; k < texts.length; k++) {
      t = texts[k];
      var best = 0, who = [];
      items.forEach(function (it, i) {
        if (!live[i]) return;
        var sc = 0;
        wordsOf(it).forEach(function (w) { if (hasWord(t, w)) sc += w.indexOf(' ') > 0 ? 2 : 1; });
        if (sc > best) { best = sc; who = [i]; } else if (sc && sc === best) who.push(i);
      });
      if (best && who.length === 1) return who[0];
      if (best && who.length > 1) return -2;
    }
    if (ordinals) {
      t = texts[0];
      var ord = [];
      if (hasWord(t, 'two') || hasWord(t, 'second')) ord.push(1);
      if (hasWord(t, 'three') || hasWord(t, 'third')) ord.push(2);
      if (items.length > 3 && (hasWord(t, 'four') || hasWord(t, 'fourth'))) ord.push(3);
      if (!ord.length && (hasWord(t, 'one') || hasWord(t, 'first'))) ord.push(0);
      if (ord.length === 1 && live[ord[0]]) return ord[0];
      if (ord.length > 1) return -2;
    }
    for (k = 0; k < texts.length; k++) {
      var words = texts[k].split(' '), fz = [];
      items.forEach(function (it, i) {
        if (!live[i]) return;
        if (wordsOf(it).some(function (w) { return w.indexOf(' ') < 0 && w.length >= 4 && words.some(function (x) { return x.length >= 4 && lev(x, w) <= 1; }); })) fz.push(i);
      });
      if (fz.length === 1) return fz[0];
    }
    return -1;
  }
  function listOr(a) { return a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' ' + Lab.t('or') + ' ' + a[a.length - 1]; }

  /* ---------- session state ---------- */
  var S = { on: false, act: null, step: null, hist: [], help: false, rec: null, t0: 0, staffTapping: false, camConsent: null, moveConsent: null, callConsent: null };
  var stepTimers = [];
  var stage, screenEl, video;

  /* The participant's name is only spoken and shown, never written into the log or the reports. */
  function redact(msg) {
    var g = (Lab.opt.greet || '').trim();
    return g ? String(msg).split(g).join('[name]') : msg;
  }
  function log(msg, src, kind, extra) {
    if (!S.rec) return;
    var now = new Date();
    msg = redact(msg);
    var e = { t: now.toISOString(), time: clock(now), ms: now - S.t0, step: S.step ? S.step.id : '', msg: msg, src: src || '', kind: kind || '' };
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    S.rec.events.push(e);
    var ol = $('plog');
    if (ol) {
      var li = document.createElement('li');
      li.textContent = e.time + ' · ' + msg;
      ol.insertBefore(li, ol.firstChild);
      while (ol.children.length > 120) ol.removeChild(ol.lastChild);
    }
    updateCounts();
  }
  function count(k) { if (S.rec && S.rec.counts[k] !== undefined) S.rec.counts[k]++; }
  function updateCounts() {
    var c = S.rec && S.rec.counts, el = $('pcounts');
    if (!c || !el) return;
    var taps = S.rec.taps, all = taps.hit + taps.miss;
    el.textContent = 'Touch ' + c.touch + ' · Voice ' + c.voice + ' · Hand ' + c.hand + ' · Air ' + c.air + ' · Key ' + c.key + ' · Staff ' + c.staff +
      ' · Not understood ' + c.unclear + ' · Taps on target ' + (all ? Math.round(100 * taps.hit / all) + '%' : '–');
  }
  function newRecord(act, preview) {
    var o = Lab.opt, now = new Date();
    return {
      id: 'S' + now.getTime().toString(36), app: VERSION, date: today(now), startedAt: now.toISOString(), endedAt: null, preview: !!preview,
      activity: act.key, activityName: act.name, day: act.day, testId: 'ACT-' + pad(act.day), zone: o.zone || act.zone,
      participant: o.participant || 'P?', profile: o.profile, staff: o.staff, mapRev: o.mapRev, sw: o.sw,
      settings: { voice: o.voice, camera: o.camMode, camMove: o.camMove, rate: o.rate, volume: o.volume, textSize: o.textSize, subtitles: o.subtitles },
      events: [], counts: { touch: 0, voice: 0, hand: 0, air: 0, key: 0, staff: 0, unclear: 0, help: 0, stop: 0, back: 0, skip: 0, reprompt: 0 },
      taps: { hit: 0, miss: 0 }, stats: {}, consent: {}, camMs: 0, outcome: 'unfinished', again: null, debrief: null
    };
  }

  /* ---------- robot voice and subtitles ---------- */
  var synth = window.speechSynthesis || null;
  var speaking = false, speakToken = 0, repromptTimer = null, repromptCount = 0, voiceCache = null, captionTimer = null;
  /* The browser's voices for the patient's language (Chrome on a laptop: en, fr and de exist). */
  function langVoices() {
    var lang = Lab.lang();
    return (synth ? synth.getVoices() : []).filter(function (v) { return new RegExp('^' + lang + '(-|_|$)', 'i').test(v.lang); });
  }
  function pickVoice(alt) {
    var lang = Lab.lang();
    if (!voiceCache || voiceCache.lang !== lang) {
      var list = langVoices();
      /* Natural and Google voices sound much less robotic than the old system voices. */
      voiceCache = { lang: lang, v: list.filter(function (v) { return /natural|google/i.test(v.name); })[0] || list[0] || null };
    }
    if (!alt) return voiceCache.v;
    /* A second voice for the practice-call contact, so it never sounds like Bellatrix. */
    var others = langVoices().filter(function (v) { return v !== voiceCache.v; });
    return others.filter(function (v) { return /natural|google/i.test(v.name); })[0] || others[0] || voiceCache.v;
  }
  if (synth) synth.onvoiceschanged = function () { voiceCache = null; };
  /* The face's mouth moves while Bellatrix is heard (or while her subtitle is shown). */
  function talk(on) { if (stage) stage.classList.toggle('talking', !!on); }
  /* Chrome cuts long utterances off after about 15 seconds, so speech goes out sentence by sentence. */
  function chunks(text) {
    var parts = String(text).match(/[^.!?]+[.!?]*/g) || [String(text)], out = [], cur = '';
    parts.forEach(function (p) {
      p = p.trim();
      if (!p) return;
      if (cur && (cur + ' ' + p).length > 160) { out.push(cur); cur = p; } else cur = cur ? cur + ' ' + p : p;
    });
    if (cur) out.push(cur);
    return out;
  }
  /* Inside the robot app the voice is the app's own (BellatrixApp.speak: English, French and German
     voices on the robot); the WebView itself has none. A screen with no voice for the patient's
     language shows subtitles, long enough to read. */
  var app = window.BellatrixApp && window.BellatrixApp.speak ? window.BellatrixApp : null, appPending = {}, appStarted = {};
  function appVoice() { try { return !!(app && app.canSpeak(Lab.lang())); } catch (e) { return false; } }
  window.BellatrixVoice = {
    start: function (id) { var f = appStarted[id]; delete appStarted[id]; if (f) f(); },
    done: function (id) { var f = appPending[id]; delete appPending[id]; delete appStarted[id]; if (f) f(); }
  };
  function canSpeak() { return appVoice() || (!app && !!synth && langVoices().length > 0); }
  /* A session is about to start: the robot loads the voice now, so the first words are not late. */
  function prepareVoice() { if (app && app.prepareVoice) try { app.prepareVoice(Lab.lang()); } catch (e) { /* older app */ } }
  function caption(text, el) {
    el = el || ((Lab.opt.subtitles || !canSpeak()) ? $('caption') : null);
    if (!el) return;
    clearTimeout(captionTimer);
    if (text) { el.textContent = text; el.hidden = false; }
    else captionTimer = setTimeout(function () { el.hidden = true; el.textContent = ''; }, 1500);
  }
  /* o: { pitch, alt (second voice), who (for the log), caption (element for the subtitles), onStart } */
  function say(text, cb, o) {
    o = o || {};
    clearTimeout(repromptTimer);
    var my = ++speakToken;
    stopRec();
    if (!text) { speaking = false; if (cb) cb(); return; }
    log((o.who || 'Robot') + ' says: ' + text, 'robot', 'say');
    var capEl = o.caption ? document.querySelector(o.caption) : null;
    if (!canSpeak()) {
      speaking = false;
      caption(text, capEl);
      talk(true);
      /* About 15 characters a second, so the subtitle can be read before the next step. */
      setTimeout(function () { if (my === speakToken) { talk(false); caption('', capEl); resumeListening(); if (cb) cb(); else scheduleReprompt(); } }, Math.min(9000, Math.max(1500, text.length * 65)));
      return;
    }
    var viaApp = appVoice();
    if (synth) synth.cancel();
    speaking = true; setMic(false);
    var parts = chunks(text), i = 0;
    if (o.onStart) o.onStart();
    function finish() {
      if (my !== speakToken) return;
      speaking = false;
      talk(false);
      caption('', capEl);
      resumeListening();
      if (cb) cb(); else scheduleReprompt();
    }
    function next() {
      if (my !== speakToken) return;
      if (i >= parts.length) { finish(); return; }
      if (viaApp) {
        var line = parts[i++], id = 'u' + my + '_' + i, done = false, g;
        var go = function () { if (done) return; done = true; clearTimeout(g); delete appPending[id]; talk(false); next(); };
        var wait = function (ms) { clearTimeout(g); g = setTimeout(go, ms); };
        caption(line, capEl);
        appPending[id] = go;
        /* The first line may wait for the voice to load; once the sound starts, the safety net is
           set from the length of the line. */
        appStarted[id] = function () { if (my === speakToken) { talk(true); wait(line.length * 95 / Lab.opt.rate + 3000); } };
        wait(line.length * 95 / Lab.opt.rate + 12000);
        app.speak(id, line, Lab.opt.rate, Lab.opt.volume, o.pitch || (o.alt ? 1.2 : 1), Lab.lang());
        return;
      }
      var u = new SpeechSynthesisUtterance(parts[i++]);
      caption(u.text, capEl);
      u.lang = I18N.BCP47[Lab.lang()]; u.rate = Lab.opt.rate; u.volume = Lab.opt.volume;
      if (o.pitch) u.pitch = o.pitch;
      var v = pickVoice(o.alt); if (v) u.voice = v;
      var fired = false, guard;
      function end() { if (fired) return; fired = true; clearTimeout(guard); talk(false); next(); }
      u.onstart = function () { if (my === speakToken) talk(true); };
      u.onend = end; u.onerror = end;
      /* Safety net for browsers that never fire onend. */
      guard = setTimeout(end, u.text.length * 95 / Lab.opt.rate + 3000);
      synth.speak(u);
    }
    next();
  }
  function quiet() {
    speakToken++; speaking = false; appPending = {}; appStarted = {};
    talk(false);
    if (synth) synth.cancel();
    if (app) try { app.stopSpeaking(); } catch (e) { /* the app is closing */ }
    caption('');
  }
  function scheduleReprompt() {
    clearTimeout(repromptTimer);
    var st = S.step;
    if (!S.on || !st || st.final || st.noReprompt || S.help || repromptCount >= REPROMPT_MAX) return;
    repromptTimer = setTimeout(function () {
      if (st !== S.step || speaking || Music.isPlaying()) return;
      repromptCount++; count('reprompt');
      say(Lab.t('Take your time. I am still here.'));
    }, REPROMPT_MS);
  }
  function shortHint(st) {
    var ch = (st.choices || []).filter(function (c) { return !c.disabled; });
    if (ch.length && ch.length <= 4 && st.style !== 'grid') return Lab.t('You can choose {list}.', { list: listOr(ch.map(function (c) { return c.say || c.label; })) });
    var ac = st.actions || [];
    if (ac.length) return Lab.t(listening() ? 'You can say {list}.' : 'You can choose {list}.', { list: listOr(ac.filter(function (a) { return !a.small; }).map(function (a) { return a.say || a.label; })) });
    return '';
  }
  /* One short sentence: the title, and the lead only when it is the question. */
  function autoSay(st) {
    var s = st.title || '', q = /\?\s*$/;
    if (st.lead && (!s || (q.test(st.lead) && !q.test(s)))) s += (s ? ' ' : '') + st.lead;
    return s;
  }
  function announce() {
    var st = S.step;
    repromptCount = 0;
    var text = typeof st.say === 'function' ? st.say() : (st.say !== undefined ? st.say : autoSay(st));
    say(text, st.afterSay ? function () { if (st === S.step) st.afterSay(); } : null);
  }

  /* ---------- music ----------
     The microphone is normally off while music plays, so it never takes music for an answer.
     Steps with `listenDuringMusic` keep listening, but only for the buttons marked
     `duringMusic` (stop, quieter, louder). That is safe for the built-in tunes, which have no words;
     own clips may have singing and never use it. */
  function musicListening() { return !!(S.step && S.step.listenDuringMusic); }
  function playMusic(songs, opts) {
    opts = opts || {};
    quiet(); stopRec(); clearTimeout(repromptTimer);
    var st = S.step, list = Array.isArray(songs) ? songs : [songs];
    if (!list.length) { if (opts.onEnd) opts.onEnd(); return; }
    log('Music starts: ' + list.map(function (s) { return s.title + (s.clip ? ' (own clip)' : ''); }).join(', '), 'app', 'music');
    S.rec.stats.musicPlays = (S.rec.stats.musicPlays || 0) + 1;
    function done() {
      if (st !== S.step || !S.on) return;
      log('Music ends', 'app', 'music');
      resumeListening();
      if (opts.onEnd) opts.onEnd(); else scheduleReprompt();
    }
    if (list[0].clip) {
      var k = 0;
      (function nextClip() {
        if (st !== S.step || !S.on) return;
        if (k >= list.length) { done(); return; }
        var c = list[k++];
        if (opts.onSong) opts.onSong(c, k - 1);
        Music.playClip(c, { seconds: opts.seconds, onEnd: nextClip, onError: function (why) { log('Clip "' + c.title + '" could not play: ' + why, 'app', 'error'); } });
      })();
    } else if (list.length === 1) Music.play(list[0], { tempo: opts.tempo, wave: opts.wave, onEnd: done });
    else Music.playList(list, { tempo: opts.tempo, wave: opts.wave, onSong: opts.onSong, onEnd: done });
    setMic(false);
    if (musicListening() && !list[0].clip) resumeListening();
  }
  function stopMusic(src) {
    var t0 = performance.now(), was = Music.stop();
    if (was) log('Music stopped in ' + Math.round(performance.now() - t0) + ' ms' + (src ? ' (' + src + ')' : ''), src || 'app', 'music-stop');
    resumeListening();
    return was;
  }

  /* ---------- voice answers ---------- */
  /* The robot app's WebView has the constructor but no recognition service behind it, so voice
     answers are off there (touch, hand signs and pointing still work). */
  var SR = window.BellatrixApp ? null : (window.SpeechRecognition || window.webkitSpeechRecognition);
  var rec = null, recWanted = false, recRestartTimer = null, heardTimer = null, lastRepair = 0, lastHandled = '', lastHandledAt = 0;
  /* Voice answers: chosen by the care team, possible in this browser, and only in English (the
     words the app listens for are English). */
  function listening() { return !!(SR && Lab.opt.voice && Lab.lang() === 'en'); }
  function resumeListening() { clearTimeout(recRestartTimer); recRestartTimer = setTimeout(startRec, 300); }
  function startRec() {
    if (!listening() || speaking || !S.on || (Music.isPlaying() && !musicListening())) return;
    recWanted = true;
    if (rec) return;
    var r = new SR();
    rec = r;
    r.lang = 'en-US'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 3;
    r.onstart = function () { if (rec === r) setMic(true); };
    r.onresult = function (e) {
      if (rec !== r) return;
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var res = e.results[i], alts = [];
        for (var j = 0; j < res.length; j++) alts.push(res[j].transcript);
        if (res.isFinal) handleSpeech(alts[0], alts.slice(1), false);
        else {
          showHeard(alts[0] + ' …');
          if (handleSpeech(alts[0], alts.slice(1), true)) return;
        }
      }
    };
    r.onerror = function (e) {
      if (rec !== r) return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        Lab.opt.voice = false; recWanted = false; micNote('Microphone refused');
        log('Microphone refused. Voice answers are off.', 'app', 'error');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        micNote('Voice problem: ' + e.error);
        log('Voice error: ' + e.error + (e.error === 'network' ? ' (speech recognition needs internet)' : ''), 'app', 'error');
      }
    };
    r.onend = function () {
      if (rec === r) rec = null;
      if (recWanted && Lab.opt.voice && !speaking && S.on) { clearTimeout(recRestartTimer); recRestartTimer = setTimeout(startRec, 300); }
    };
    try { r.start(); }
    catch (err) { rec = null; log('Voice start failed: ' + err.message, 'app', 'error'); clearTimeout(recRestartTimer); recRestartTimer = setTimeout(startRec, 600); }
  }
  function stopRec() {
    recWanted = false;
    clearTimeout(recRestartTimer);
    if (rec) { var r = rec; rec = null; try { r.abort(); } catch (e) { /* already stopped */ } }
    setMic(false);
  }
  /* The microphone chip shows only while it really listens. */
  function setMic(on) {
    if (!Lab.opt.voice || !SR) return;
    $('chipMic').hidden = !on;
    if (on) $('micText').textContent = Music.isPlaying() ? 'Listening for “stop”' : 'Listening';
  }
  function micNote(t) { $('chipMic').hidden = false; $('micText').textContent = t; }
  function showHeard(t) {
    t = String(t).trim();
    $('heardText').textContent = 'I heard: ' + (t.length > 40 ? t.slice(0, 40) + '…' : t);
    $('chipHeard').hidden = false;
    clearTimeout(heardTimer);
    heardTimer = setTimeout(function () { $('chipHeard').hidden = true; }, 4000);
  }
  function unclear(st) {
    count('unclear'); updateCounts();
    var now = Date.now();
    if (now - lastRepair < 10000) return;
    lastRepair = now;
    say('Sorry, I did not catch that. ' + (st.short || shortHint(st)));
  }
  /* Returns true when the words were acted on. Interim words only count for steps that ask
     for it (Finish the Saying reacts as soon as the right ending is heard). */
  function handleSpeech(raw, alts, interim) {
    var st = S.step;
    if (!st || !S.on || speaking) return false;
    var t = clean(raw);
    if (!t) return false;
    var texts = [t].concat((alts || []).map(clean)).filter(Boolean);
    var n = t.split(' ').length;
    if (Music.isPlaying()) {
      /* While music plays only the music buttons listen, and nothing else is said back. */
      if (!musicListening() || S.help || n > 6) return false;
      var live = (st.actions || []).map(function (a) { return a.duringMusic ? a : { disabled: true }; });
      var mi = matchItems(live, texts, false);
      if (mi < 0) { if (!interim) log('Heard during the music, ignored: "' + t + '"', 'voice', 'heard'); return false; }
      log('Heard during the music: "' + t + '"', 'voice', 'heard');
      lastHandled = t; lastHandledAt = Date.now();
      doAction(mi, 'voice');
      return true;
    }
    if (interim) {
      if (!st.fastVoice || S.help) return false;
      var fi = matchItems(st.choices || [], texts, false);
      if (fi >= 0) { log('Heard: "' + t + '"', 'voice', 'heard'); choose(fi, 'voice'); return true; }
      return false;
    }
    var nowMs = Date.now();
    if (t === lastHandled && nowMs - lastHandledAt < 1500) return false;
    lastHandled = t; lastHandledAt = nowMs;
    log('Heard: "' + t + '"', 'voice', 'heard');
    showHeard(t);
    if (S.help) {
      if (anyWord(t, ['close', 'okay', 'ok', 'thanks', 'thank you', 'fine', 'yes', 'continue'])) closeHelp('voice');
      return true;
    }
    if (n <= 4 && hasWord(t, 'help')) { openHelp('voice'); return true; }
    var ci = -1, ai = -1;
    if (st.choices && st.choices.length && st.style !== 'grid' && n <= 10) {
      ci = matchItems(st.choices, texts, true);
      if (ci >= 0) { choose(ci, 'voice'); return true; }
    }
    if (st.actions && st.actions.length) {
      var acts = st.actions.map(function (a) { return n <= (a.long ? 12 : 6) ? a : null; });
      ai = matchItems(acts.map(function (a) { return a || { disabled: true }; }), texts, false);
      if (ai >= 0) { doAction(ai, 'voice'); return true; }
    }
    if (!st.final && !st.noStop && n <= 3 && anyWord(t, ['stop', 'quit', 'enough'])) { stopSession('voice'); return true; }
    if (backAllowed(st) && n <= 3 && hasWord(t, 'back')) { back('voice'); return true; }
    if (st.free && st.free(t, n, texts)) return true;
    if (!st.final) unclear(st);
    return false;
  }

  /* ---------- camera: hand signs, pointing, seated movements, practice call ---------- */
  var cam = { stream: null, hands: null, pose: null, timer: null, lastT: -1, onAt: 0, failed: {}, loading: {} };
  var vision = null;
  function signsMode() { return Lab.opt.camMode === 'signs' || Lab.opt.camMode === 'air'; }
  /* Pointing in the air: everywhere in 'air' mode, and on steps that ask for it (Picture Pair)
     whenever the camera may be used for the hands. */
  /* 16 Nov (Rahma): in 'air' mode also on the movement pages (st.pose): the same camera picture then goes to the
     body model and, in the background worker, to the hand model (the app's own camera cannot run at the same time). */
  function airMode(st) {
    return !!(st && signsMode() && S.camConsent === true && !cam.failed.hands && !cam.failed.camera && (!st.final || Lab.opt.camMode === 'air') && (!st.pose || Lab.opt.camMode === 'air') && !st.noHands &&
      (Lab.opt.camMode === 'air' || (st.airPointer && Lab.opt.camMode !== 'signs')));
  }
  function wantCam(st) {
    if (!S.on || !st || (st.final && Lab.opt.camMode !== 'air') || st.noCam || cam.failed.camera) return false;
    if (st.callVideo) return S.callConsent === true;
    if (st.pose) return S.moveConsent === true;
    return S.camConsent === true && signsMode() && !cam.failed.hands;
  }
  function handsHints(st) {
    return !!(st && Lab.opt.camMode === 'signs' && S.camConsent === true && !cam.failed.hands && !cam.failed.camera && !st.noHands && !st.final && !st.pose && !airMode(st));
  }
  function syncCam() {
    var st = S.step, want;
    if (nhWanted(st)) {
      /* The hands are followed in the app: the page's camera stays off (the camera has one user). */
      if (cam.stream) stopCam();
      if (!nhStart() && wantCam(st) && !cam.stream) startCam();
      else nhPictures(!!(st && st.pose));
    } else {
      nhStop();   /* before the page opens its own camera (seated movements, call) */
      want = wantCam(st);
      if (want && !cam.stream) startCam();
      else if (!want && cam.stream) stopCam();
    }
    resetHands(); resetPose(); resetAir();
    updateCamChips();
  }
  /* Pointing in the air and hand signs followed by the robot app itself (BellatrixApp.handsStart: Java, the lite hand
     models on the graphics chip, frame-to-frame following like LabLand's Telekom app; about 25-30 hand positions a
     second on the big tablet instead of ~8 with MediaPipe here). The page does not open its camera then: the 21 points
     come through window.__bellatrixHands({t, w, h, lm: [[x, y, z] x 21] | null}) and go on like the worker's
     (hwResult -> airFrame / feed). The app's camera is stopped before the page opens one (pose, presence, posture).
     If it cannot start or fails, the page's own detection takes over as before. Settings (localStorage):
     'bellatrix-hands-native' '0' = off; 'bellatrix-hands-rot' (else 'bellatrix-cam-rot'), 'bellatrix-hands-cam'
     (camera id), 'bellatrix-hands-backend' ('cpu' / 'gpu'). */
  var nh = { on: false, failed: false, w: 640, h: 480, onAt: 0, n: 0 };
  function nhApi() {
    var off = false;
    try { off = localStorage.getItem('bellatrix-hands-native') === '0'; } catch (e) { off = false; }
    return !off && !!(window.BellatrixApp && window.BellatrixApp.handsStart && window.BellatrixApp.handsStop);
  }
  /* 16 Nov (Rahma: Seated Move Along must point as smoothly as the other activities): on the movement pages in
     'air' mode the app keeps the camera for the hands too and sends a small picture every NH_PIC_MS for the body
     model here (window.__bellatrixHands({pic})); the page's own camera stays off. Without that bridge: as before. */
  var NH_PIC_MS = 200;
  function nhPics() { return !!(window.BellatrixApp && window.BellatrixApp.handsPictures); }
  /* 23 Nov: the highlighter ('pen') is followed by the page's own camera (js/heartspot.js), also on the tablet */
  function nhWanted(st) { return !nh.failed && !!st && (!st.pose || (Lab.opt.camMode === 'air' && nhPics())) && !st.callVideo && wantCam(st) && nhApi() && markInput() !== 'pen'; }
  function nhPictures(on) {
    var ms = on && nhPics() ? NH_PIC_MS : 0;
    if (nh.picMs === ms) return;
    nh.picMs = ms;
    try { if (nhPics()) window.BellatrixApp.handsPictures(ms); } catch (e) { /* an app without pictures */ }
  }
  function nhPicture(d) {
    var st = S.step;
    if (!st || !st.pose || nh.picBusy) return;
    if (!cam.pose) { ensureModel('pose'); return; }
    nh.picBusy = true;
    var img = new Image();
    img.onload = function () {
      nh.picBusy = false;
      if (S.step !== st || !cam.pose) return;
      try { poseFrame(cam.pose.detect(img), performance.now()); } catch (e) { log('Detection error: ' + e.message, 'app', 'error'); }
    };
    img.onerror = function () { nh.picBusy = false; };
    img.src = d.pic;
  }
  function nhConfig() {
    if (!window.BellatrixApp.handsConfig) return;
    var c = {}, v;
    try {
      v = localStorage.getItem('bellatrix-hands-rot'); if (v === null) v = localStorage.getItem('bellatrix-cam-rot');
      if (v === '0' || v === '90' || v === '180' || v === '270') c.rot = +v;
      v = localStorage.getItem('bellatrix-hands-cam'); if (v) c.camera = v;
      v = localStorage.getItem('bellatrix-hands-backend'); if (v === 'cpu' || v === 'gpu') c.backend = v;
    } catch (e) { /* defaults */ }
    try { window.BellatrixApp.handsConfig(JSON.stringify(c)); } catch (e) { /* an app without settings */ }
  }
  function nhStart() {
    if (nh.on) return true;
    var r;
    nhConfig();
    try { r = String(window.BellatrixApp.handsStart()); } catch (e) { r = 'error:' + (e && e.message ? e.message : e); }
    if (r !== 'ok') { nhFail(r); return false; }
    nh.on = true; nh.onAt = Date.now(); nh.n = 0;
    heartSync();
    log('Camera on in the app for the ' + (heartOn() ? 'red heart' : 'hands') + ' (not recorded)', 'app', 'camera');
    setHandText('Starting the camera…');
    return true;
  }
  function nhStop() {
    if (!nh.on) return;
    nhPictures(false);
    pressSync(false);
    nh.on = false;
    try { window.BellatrixApp.handsStop(); } catch (e) { /* gone */ }
    if (S.rec) S.rec.camMs += Date.now() - nh.onAt;
    log('Camera in the app off', 'app', 'camera');
  }
  function nhFail(why) {
    var was = nh.on;
    nh.on = false; nh.failed = true;
    try { window.BellatrixApp.handsStop(); } catch (e) { /* gone */ }
    if (was && S.rec) S.rec.camMs += Date.now() - nh.onAt;
    log('Hand tracking in the app off (' + why + '): detection on the page instead', 'app', 'camera');
  }
  /* 23 Nov (Rahma's prototype): pointing with a small red heart (a soft ball the resident holds) instead of the
     hand. The app finds the red in every camera picture (android hands/HeartSpot, no model) and sends
     {t, w, h, heart: {x, y, a, n} | null}. The heart becomes a hand for the same pointer (palm centre = the heart's
     centre), so the cursor, the magnet, the ring and the games' frames work as before. "OK" = close the hand over
     the heart (it mostly disappears) and open it again (it comes back): the 'closeopen' OK. While closed, the
     pointer stays where the heart was open. A heart gone at the edge of the picture, or for HEART.GONE_MS, is lost.
     On: Lab.opt.airInput === 'heart' (the head's "Point with the red heart"), or localStorage 'bellatrix-air-input'
     'heart' / 'hand' on this tablet. With the app's camera it needs BellatrixApp.handsHeart; with the page's own
     camera (a PC webcam: testing before the robot) js/heartspot.js finds the heart here (heartPageFrame). */
  var HEART = { CLOSE: 0.45, OPEN: 0.7, GONE_MS: 1500, UP: 0.08, DOWN: 0.02 };
  /* The highlighter's press (23 Nov). First too loose (Rahma: "a finger in front of the cap passes for the OK"),
     then too strict ("even when I press it does not work"); this is the middle, checked on her own video.
     The cap is compared with its biggest size of the last REF_MS (the grip changes how much of the pen shows, so no
     long-learnt size). The press is a click: the cap is hidden, then shows again (the 'closeopen' OK: the ring
     fills after letting go). A press counts when
     - the cap showed clearly (SEEN of that size) for SEEN_MS, ending at most GAP_MS before (the thumb may take
       its time to come),
     - the pen was fairly still just before (moved less than STILL of the picture over STILL_MS, leaving out the
       last 150 ms: the thumb arriving shifts the pen's middle), and is not mostly gone (BODY of its size then),
     - the pen is not near the edge of the picture (EDGE), nor was the cap when last seen (CAP_EDGE): there the
       cap may just have left the picture,
     - the cap is hidden (under CLOSE of that size) for at least MIN_MS (a finger flicking past is no press),
     - and the cap is big enough to be measured at all (CAP_REF_MIN samples; else "bring the pen closer").
     The cap count is the median of the last SMOOTH frames (Rahma's webcam: a small cap jumped 1..8 from one frame
     to the next, and those jumps looked like short presses that stopped the ring).
     Anything else that hides the cap is "blocked" until the cap shows clearly again. A big move during the press
     (MOVE) cancels it. Free again above OPEN. */
  var PEN = { CLOSE: 0.3, OPEN: 0.55, SEEN: 0.5, SEEN_MS: 200, GAP_MS: 1000, STILL: 0.15, STILL_MS: 500, MOVE: 0.35, BODY: 0.25, REF_MS: 1500, MIN_MS: 150, EDGE: 0.15, CAP_EDGE: 0.15, CAP_MIN: 3, CAP_REF_MIN: 8, SMOOTH: 3, PX: 480,
    /* Rahma: "it works, but the magnet takes long to start counting": the pen's own checks already filter the noise,
       so the pointer's patience is short with it, and the ring a little quicker */
    CLOSE_PATIENCE: 60, OPEN_PATIENCE: 100, CONFIRM_MS: 700,
    /* on the tablet the pen is big and close: lifting the thumb shows the pen's top again and its middle jumps ~200 px
       on the screen; that jump must not cancel the ring (it did: no ring at all in Rahma's tablet test) */
    RING_MOVE_PX: 600 };
  var hz = { base: 0, last: null, seenAt: 0, closed: false, pen: null, cancelAt: 0 };
  function penPress(p, now) {
    var P = hz.pen, s = Math.max(1, +p.s || 0), c = +p.c || 0, moved = 0, ref = null, r0 = null, i, q;
    if (!P || now - hz.seenAt > HEART.GONE_MS) P = hz.pen = { state: 'free', clearSince: 0, lastClear: 0, track: [], hist: [], at: null, pressAt: 0, capRef: 0, cs: [] };
    /* the cap count, smoothed: the median of the last SMOOTH frames */
    P.cs.push(c); if (P.cs.length > PEN.SMOOTH) P.cs.shift();
    c = P.cs.slice().sort(function (a2, b2) { return a2 - b2; })[P.cs.length >> 1];
    P.track.push({ t: now, x: +p.x, y: +p.y });
    while (P.track.length && now - P.track[0].t > PEN.STILL_MS) P.track.shift();
    for (i = 0; i < P.track.length; i++) {
      q = P.track[i];
      if (now - q.t < 150) break;
      if (!r0) r0 = q;
      moved = Math.max(moved, Math.abs(q.x - r0.x) + Math.abs(q.y - r0.y));
    }
    /* the reference: the biggest cap of the last REF_MS (kept as it was while pressed) */
    if (P.state !== 'pressed') P.hist.push({ t: now, c: c, s: s });
    while (P.hist.length && now - P.hist[0].t > PEN.REF_MS) P.hist.shift();
    for (i = 0; i < P.hist.length; i++) if (P.hist[i].c >= PEN.CAP_MIN && (!ref || P.hist[i].c > ref.c)) ref = P.hist[i];
    var capRef = ref ? ref.c : 0, still = moved < PEN.STILL, bodyOk = !ref || s >= PEN.BODY * ref.s;
    var K = P.capPos, inside = p.x > PEN.EDGE && p.x < 1 - PEN.EDGE && p.y > PEN.EDGE && p.y < 1 - PEN.EDGE * 0.8 &&
      (!K || (K.x > PEN.CAP_EDGE && K.x < 1 - PEN.CAP_EDGE && K.y > PEN.CAP_EDGE && K.y < 1 - PEN.CAP_EDGE));
    var shows = c >= PEN.CAP_MIN && c >= PEN.SEEN * capRef, hidden = capRef >= PEN.CAP_REF_MIN && c < PEN.CLOSE * capRef;
    P.small = capRef < PEN.CAP_REF_MIN;
    P.c = c; P.s = s; P.ratio = capRef; P.moved = moved; P.body = ref ? ref.s : 0;
    if (P.state === 'pressed') {
      if (P.at && Math.abs(p.x - P.at.x) + Math.abs(p.y - P.at.y) > PEN.MOVE) { P.state = 'blocked'; P.why = 'big-move'; hz.cancelAt = now; }   /* a big move: no press, and no release either */
      else if (c >= PEN.CAP_MIN && c >= PEN.OPEN * P.capRef) { P.state = 'free'; P.clearSince = 0; }           /* let go */
    } else if (shows) {
      if (!P.clearSince || now - P.lastClear > 300) P.clearSince = now;
      P.lastClear = now;
      if (p.cx >= 0) P.capPos = { x: p.cx, y: p.cy };
      P.state = 'free';
    } else if (hidden && P.state === 'free') {
      var ok = now - P.lastClear <= PEN.GAP_MS && P.lastClear - P.clearSince >= PEN.SEEN_MS && still && bodyOk && inside;
      P.why = ok ? 'press' : [now - P.lastClear > PEN.GAP_MS ? 'cap-seen-too-long-ago' : '', P.lastClear - P.clearSince < PEN.SEEN_MS ? 'cap-not-seen-long-enough' : '',
        still ? '' : 'moving', bodyOk ? '' : 'pen-mostly-gone', inside ? '' : 'edge'].filter(Boolean).join(',');
      P.state = ok ? 'pressed' : 'blocked';
      if (ok) { P.at = { x: +p.x, y: +p.y }; P.pressAt = now; P.capRef = capRef; }
    }
    return P.state === 'pressed' && now - P.pressAt >= PEN.MIN_MS;
  }
  /* 23 Nov (Rahma, second try: the heart was too hard to close the hand on): 'object' = a red mark on an object the
     resident holds (e.g. a remote) moves the pointer the same way, and the OK is a PRESS: the remote's button (the app
     forwards it, window.__bellatrixPress) or, on a PC, Space / Enter / Page keys. No close/open in that mode. */
  function markInput() {
    var v = '';
    try { v = localStorage.getItem('bellatrix-air-input') || ''; } catch (e) { v = ''; }
    if (v === 'heart' || v === 'object' || v === 'pen') return v;
    if (v === 'hand') return '';
    var o = Lab.opt.airInput;
    return o === 'heart' || o === 'object' || o === 'pen' ? o : '';
  }
  function heartMode() { return !!markInput(); }
  function pressMode() { return markInput() === 'object' && heartOn(); }
  function pressSync(on) {
    if (!(window.BellatrixApp && window.BellatrixApp.handsPress)) return;
    try { window.BellatrixApp.handsPress(!!on); } catch (e) { /* an app without the remote */ }
  }
  function heartSupported() { return !!(window.BellatrixApp && window.BellatrixApp.handsHeart); }
  function heartPage() { return !nh.on && !!window.HeartSpot && heartMode(); }
  function heartOn() { return heartMode() && (nh.on ? heartSupported() : !!window.HeartSpot && !!cam.stream); }
  function heartSync() {
    hz.base = 0; hz.last = null; hz.seenAt = 0; hz.closed = false; hz.pen = null;
    pressSync(markInput() === 'object');
    if (!heartSupported()) return;
    try { window.BellatrixApp.handsHeart(heartMode()); } catch (e) { /* an app without the heart */ }
  }
  /* The heart as 21 hand points: the palm centre (0, 5, 9, 13, 17) on the heart, the palm length its size. */
  function heartLm(p, closed) {
    var r = Math.max(0.02, Math.sqrt(Math.max(0, p.a) / Math.PI) * 1.2), lm = [], i;
    for (i = 0; i < 21; i++) lm.push({ x: p.x, y: p.y, z: 0 });
    lm[0] = { x: p.x, y: p.y + r, z: 0 }; lm[9] = { x: p.x, y: p.y - r, z: 0 };
    lm[5] = { x: p.x - r, y: p.y, z: 0 }; lm[17] = { x: p.x + r, y: p.y, z: 0 };
    lm.heartClosed = closed;
    return lm;
  }
  function heartResult(p, now) {
    var mode = markInput(), press = mode === 'object' || mode === 'pen';   /* never closed by hiding the whole thing */
    if (p && isFinite(p.x) && isFinite(p.y)) {
      var a = +p.a || 0;
      if (!hz.base || now - hz.seenAt > HEART.GONE_MS) hz.base = a;
      var shut = press ? false : hz.closed ? a < HEART.OPEN * hz.base : a < HEART.CLOSE * hz.base;
      if (mode === 'pen') shut = penPress(p, now);   /* the thumb on the highlighter's cap, strictly */
      /* the open heart's size: follows a bigger heart quickly (closer), a smaller one slowly (further away) */
      if (!shut) { hz.base += (a - hz.base) * (a > hz.base ? HEART.UP : HEART.DOWN); hz.last = { x: +p.x, y: +p.y, a: a }; }
      hz.closed = shut; hz.seenAt = now;
      return hz.last ? heartLm(hz.last, shut) : null;
    }
    /* not seen: hidden in the fist (it was just here, away from the edges), or gone */
    if (mode === 'pen' && hz.pen && hz.pen.state === 'pressed') { hz.pen.state = 'blocked'; hz.pen.why = 'pen-lost'; hz.cancelAt = now; }   /* lost while pressed: no release */
    var L = hz.last, edge = !!L && (L.x < 0.06 || L.x > 0.94 || L.y < 0.05 || L.y > 0.95);
    if (!L || edge || now - hz.seenAt > HEART.GONE_MS) { hz.closed = false; hz.last = null; return null; }
    hz.closed = !press;   /* the object's mark under a finger for a moment: the pointer just stays */
    return heartLm(L, !press);
  }
  function heartFeed(lm, now) {
    var st = S.step;
    if (!S.on) { if (idle.on && nh.on) airFrame(lm, now); return; }
    if (st && (nh.on || cam.stream) && airMode(st)) airFrame(lm, now);
  }
  /* PC testing only (localhost, 23 Nov): the highlighter's numbers in a small box on the screen and sent to the test
     server (POST /__pen-log), so the tuning uses Rahma's real webcam. Numbers and a coarse 40 x 30 colour map
     (# body, o cap), never a picture; nothing on the robot. */
  var penDbg = { rows: [], sent: 0, mapAt: 0, el: null };
  function penLocal() { return typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && typeof fetch === 'function'; }
  /* on the tablet only when switched on for a test (localStorage 'bellatrix-pen-debug' '1'): the box, and the rows kept
     here (window.__penLog, the last 3000) for reading over the debugger; nothing is sent anywhere */
  function penDebugOn() { if (penLocal()) return true; try { return localStorage.getItem('bellatrix-pen-debug') === '1'; } catch (e) { return false; } }
  function penMap(d, w, h) {
    var out = [], gx, gy, x, y, o, HS = window.HeartSpot;
    for (gy = 0; gy < 30; gy++) {
      var row = '';
      for (gx = 0; gx < 40; gx++) {
        x = Math.min(w - 1, Math.floor((gx + 0.5) * w / 40)); y = Math.min(h - 1, Math.floor((gy + 0.5) * h / 30)); o = (y * w + x) * 4;
        row += HS.isNeon(d[o], d[o + 1], d[o + 2]) ? '#' : HS.isCap(d[o], d[o + 1], d[o + 2]) ? 'o' : '.';
      }
      out.push(row);
    }
    return out.join('/');
  }
  /* the commonest saturated colours (steps of 16) around the pen: what the webcam really makes of it */
  function penColours(d, w, h, cx, cy) {
    var R = Math.round(Math.max(w, h) * 0.06), n = {}, x, y, o, r, g, b, mx, mn, k, out = [];
    for (y = Math.max(0, Math.round(cy - R)); y < Math.min(h, cy + R); y++) for (x = Math.max(0, Math.round(cx - R)); x < Math.min(w, cx + R); x++) {
      o = (y * w + x) * 4; r = d[o]; g = d[o + 1]; b = d[o + 2]; mx = Math.max(r, g, b); mn = Math.min(r, g, b);
      if (mx < 40 || (mx - mn) < 0.15 * mx) continue;
      k = (r >> 4 << 4) + ',' + (g >> 4 << 4) + ',' + (b >> 4 << 4); n[k] = (n[k] || 0) + 1;
    }
    for (k in n) out.push([k, n[k]]);
    out.sort(function (a, b2) { return b2[1] - a[1]; });
    return out.slice(0, 8).map(function (q) { return q[0] + 'x' + q[1]; }).join(' ');
  }
  function penDebug(now, p, d, w, h) {
    if (!penDebugOn()) return;
    var P = hz.pen || {}, row = { t: Math.round(now), pen: !!p, x: p ? +p.x.toFixed(3) : null, y: p ? +p.y.toFixed(3) : null, s: p ? p.samples : 0, c: p ? p.capSamples : 0,
      ref: P.ratio || 0, state: P.state || '', why: P.why || '', moved: P.moved ? +P.moved.toFixed(3) : 0, closed: !!air.closed, armed: !!air.armed,
      hover: hovered ? hovered.getAttribute('data-b') : null, chosen: air.chosen || 0, step: S.step && S.step.id, small: !!P.small, ms: +(hzPage.ms || 0).toFixed(1), cs: P.c };
    if (p && now - (penDbg.colAt || 0) > 500) { penDbg.colAt = now; row.colours = penColours(d, w, h, p.x * w, p.y * h); }
    if (now - penDbg.mapAt > 500) { penDbg.mapAt = now; row.map = penMap(d, w, h); row.w = w; row.h = h; }
    if (!penLocal()) { var L = window.__penLog || (window.__penLog = []); L.push(row); if (L.length > 3000) L.splice(0, L.length - 3000); }
    else penDbg.rows.push(row);
    if (penLocal() && now - penDbg.sent > 1000 && penDbg.rows.length) {
      penDbg.sent = now;
      try { fetch('/__pen-log', { method: 'POST', body: JSON.stringify(penDbg.rows), keepalive: true }).catch(function () {}); } catch (e) { /* testing only */ }
      penDbg.rows = [];
    }
    if (!penDbg.el) {
      penDbg.el = document.createElement('div');
      penDbg.el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;background:rgba(0,0,0,.75);color:#fff;font:14px/1.35 monospace;padding:6px 10px;border-radius:6px;pointer-events:none;white-space:pre';
      document.body.appendChild(penDbg.el);
    }
    penDbg.el.textContent = 'TEST surligneur  (' + row.ms + ' ms)\n' + (p ? 'vu  x' + row.x + ' y' + row.y + '  corps ' + row.s : 'PAS VU') + '\ncapuchon ' + row.c + ' lissé ' + row.cs + ' (repère ' + row.ref + ')' +
      (row.small && p ? '  -> rapprochez le surligneur' : '') +
      '\nétat ' + row.state + (row.why ? '  (' + row.why + ')' : '') + '\nfermé ' + row.closed + '  anneau ' + row.armed + '  choix ' + row.chosen;
  }
  /* The page's own camera: the picture drawn small (HEART_PX on its long side, the app's grid) and searched here. */
  var HEART_PX = 160, hzPage = { canvas: null, ctx: null, finder: null, kind: '' };
  function heartPageFrame(now) {
    var kind = markInput() === 'pen' ? 'pen' : 'red';
    if (!hzPage.finder || hzPage.kind !== kind) { hzPage.finder = window.HeartSpot.create({ kind: kind }); hzPage.kind = kind; }
    var src = frameSource(video), sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
    if (!sw || !sh) return;
    var px = kind === 'pen' ? PEN.PX : HEART_PX;   /* the pen's cap is small: a finer grid */
    var k = px / Math.max(sw, sh), w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
    if (!hzPage.canvas) { hzPage.canvas = document.createElement('canvas'); hzPage.ctx = hzPage.canvas.getContext('2d', { willReadFrequently: true }); }
    if (hzPage.canvas.width !== w || hzPage.canvas.height !== h) { hzPage.canvas.width = w; hzPage.canvas.height = h; }
    hzPage.ctx.drawImage(src, 0, 0, w, h);
    var t0 = performance.now(), img = hzPage.ctx.getImageData(0, 0, w, h).data, p = hzPage.finder.find(img, w, h, 1, now);
    hzPage.ms = performance.now() - t0;
    heartFeed(heartResult(p ? { x: p.x, y: p.y, a: p.area, c: p.capSamples, s: p.samples, cx: p.capX, cy: p.capY } : null, now), now);
    if (kind === 'pen') penDebug(now, p, img, w, h);
  }
  /* The hand texts with the heart. */
  var HEART_WORDS = { 'Point at the screen with one finger': 'Show the red heart to the camera', 'Show your hand to the camera': 'Show the red heart to the camera',
    'Point at what you want': 'Move the heart to what you want', 'Close and open your hand to choose': 'Close your hand over the heart, then open it' };
  var OBJECT_WORDS = { 'Point at the screen with one finger': 'Show the red mark to the camera', 'Show your hand to the camera': 'Show the red mark to the camera',
    'Point at what you want': 'Move the object to what you want' };
  var PEN_WORDS = { 'Point at the screen with one finger': 'Show the highlighter to the camera', 'Show your hand to the camera': 'Show the highlighter to the camera',
    'Point at what you want': 'Move the highlighter to what you want', 'Close and open your hand to choose': 'Press the cap with your thumb, then let go',
    'Now open your hand': 'Now let go of the cap' };
  function handWord(t) {
    var m = heartOn() ? markInput() : '', w = m === 'object' ? OBJECT_WORDS : m === 'heart' ? HEART_WORDS : m === 'pen' ? PEN_WORDS : null;
    return w && w[t] ? w[t] : t;
  }
  /* The press (the object's button): the button under the pointer is chosen at once; one press = one choice. */
  var PRESS_KEYS = { ' ': 1, 'Enter': 1, 'PageDown': 1, 'PageUp': 1, 'AudioVolumeUp': 1, 'AudioVolumeDown': 1, 'MediaPlayPause': 1, 'MediaTrackNext': 1, 'MediaTrackPrevious': 1 };
  function pressOK() {
    var b = hovered, now = performance.now();
    if (!b || !b.isConnected || !air.seen || now < air.ready) return false;
    air.chosen = (air.chosen || 0) + 1; air.done = b.getAttribute('data-b');
    setRing(1); setTimeout(function () { setRing(0); }, 250);
    dispatch(b.getAttribute('data-a'), parseInt(b.getAttribute('data-i'), 10), 'air', b);
    return true;
  }
  window.__bellatrixPress = function () { if (pressMode()) pressOK(); };
  document.addEventListener('keydown', function (e) {
    if (!PRESS_KEYS[e.key] || !pressMode() || (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) pressOK();
  }, true);
  Lab._heart = function () { var P = hz.pen; return { on: heartOn(), mode: heartMode(), base: hz.base, closed: hz.closed, last: hz.last,
    pen: P ? { state: P.state, c: P.c, s: P.s, ratio: P.ratio, moved: P.moved, body: P.body, clear: Math.round(P.lastClear - P.clearSince), since: Math.round(performance.now() - P.lastClear) } : null }; };
  window.__bellatrixHands = function (d) {
    if (!d || !nh.on) return;
    if (d.pic) { nhPicture(d); return; }
    if (d.error) { nhFail(d.error); syncCam(); if (S.step) render(); return; }
    if (d.w > 0 && d.h > 0) { nh.w = d.w; nh.h = d.h; }
    if (d.heart !== undefined) {
      nh.n++;
      var hnow = performance.now();
      try { heartFeed(heartResult(d.heart, hnow), hnow); } catch (err) { log('Detection error: ' + err.message, 'app', 'error'); }
      return;
    }
    var lm = null, i, p;
    if (d.lm && d.lm.length >= 21) {
      lm = [];
      for (i = 0; i < d.lm.length; i++) { p = d.lm[i]; lm.push({ x: +p[0], y: +p[1], z: +p[2] || 0 }); }
    }
    nh.n++;
    try { hwResult(lm); } catch (err) { log('Detection error: ' + err.message, 'app', 'error'); }
  };
  /* 16 Nov (Rahma): pointing also on the waiting screen ("Hallo, ich bin Bellatrix" and "Call my family") for
     IDLE_AIR_MS after a session in 'air' mode ended. The app's camera follows the hand as in a session (nothing is
     recorded); the buttons marked data-b and data-a="click" are chosen with the same OK. A session that starts
     takes the camera over; after IDLE_AIR_MS, or when the page is hidden, the camera goes off. The session's
     record is not touched (no log lines, no camera time). */
  var IDLE_AIR_MS = 60000, IDLE_TICK_MS = 500;   /* 16 Nov: one minute, the time "Call my family" stays (js/callreq-patient.js) */
  var idle = { on: false, until: 0, timer: 0 };
  function idleTargets() { return !!(stage && stage.querySelector('button[data-b][data-a="click"]')); }
  function idleCamOn() {
    if (nh.on) return true;
    var r;
    try { nhConfig(); r = String(window.BellatrixApp.handsStart()); } catch (e) { r = 'error'; }
    if (r !== 'ok') return false;
    nh.on = true; nh.onAt = Date.now(); nh.n = 0;
    heartSync();
    return true;
  }
  function idleStop() {
    if (idle.timer) { clearInterval(idle.timer); idle.timer = 0; }
    if (idle.on && !S.on && nh.on) { nh.on = false; pressSync(false); try { window.BellatrixApp.handsStop(); } catch (e) { /* gone */ } }
    idle.on = false;
    airHide();
  }
  function idleTick() {
    if (S.on) { idle.on = false; if (idle.timer) { clearInterval(idle.timer); idle.timer = 0; } return; }   /* the session's own camera rules */
    if (Date.now() > idle.until || document.hidden) { idleStop(); return; }
    if (idle.on || !idleTargets()) return;
    resetAir();
    if (idleCamOn()) idle.on = true; else idleStop();
  }
  function idleStart() {
    if (Lab.opt.camMode !== 'air' || !nhApi()) return;
    idle.until = Date.now() + IDLE_AIR_MS;
    if (!idle.timer) idle.timer = setInterval(idleTick, IDLE_TICK_MS);
    idleTick();
  }
  /* The cursor goes with the camera: no ring left on the screen after a session (16 Nov). */
  function airHide() { var c = $('airCursor'); if (c) c.hidden = true; hover(null); setRing(0); air.seen = false; }
  /* js/presence.js and js/posture.js call this before they open the page's camera. */
  window.__bellatrixHandsRelease = function () { nhStop(); };
  function loadVision() {
    if (!vision) {
      /* import() needs a full address; a bare "vendor/…" would be taken for a package name. */
      var localBase = new URL(MP_LOCAL, document.baseURI).href;
      /* The local copy is named .js: simple local servers do not always know .mjs files are scripts. */
      var from = function (base) {
        var local = base === localBase;
        return import(base + (local ? '/vision_bundle.js' : '/vision_bundle.mjs')).then(function (V) {
          return V.FilesetResolver.forVisionTasks(base + '/wasm').then(function (fs) { return { V: V, fs: fs, base: local ? base : null }; });
        });
      };
      vision = location.protocol !== 'file:' ? from(localBase).catch(function () { return from(MP_CDN); }) : from(MP_CDN);
    }
    return vision;
  }
  function ensureModel(kind) {
    if (cam[kind] || cam.loading[kind] || cam.failed[kind]) return;
    cam.loading[kind] = true;
    setHandText(kind === 'pose' ? 'Loading movement detection…' : 'Loading hand detection…');
    loadVision().then(function (x) {
      var file = kind === 'pose' ? POSE_MODEL : HAND_MODEL;
      var path = x.base ? x.base + '/' + file : MODEL_CDN[file];
      function make(delegate) {
        /* 16 Nov: the body model in 'IMAGE' mode (in 'VIDEO' mode MediaPipe stopped on the tablet with "Packet
           timestamp mismatch"); the hand model as before. */
        var o = { baseOptions: { modelAssetPath: path, delegate: delegate }, runningMode: kind === 'pose' ? 'IMAGE' : 'VIDEO' };
        if (kind === 'pose') { o.numPoses = 1; return x.V.PoseLandmarker.createFromOptions(x.fs, o); }
        o.numHands = 1; return x.V.HandLandmarker.createFromOptions(x.fs, o);
      }
      return make('GPU').catch(function () { return make('CPU'); });
    }).then(function (m) {
      cam[kind] = m; cam.loading[kind] = false;
      log((kind === 'pose' ? 'Movement' : 'Hand') + ' detection ready', 'app', 'camera');
    }).catch(function (e) {
      cam.loading[kind] = false; cam.failed[kind] = true;
      var why = (kind === 'pose' ? 'Movement' : 'Hand') + ' detection could not load: ' + (e && e.message ? e.message : e);
      log(why + '. Voice and touch still work.', 'app', 'error');
      setHandText(kind === 'pose' ? 'Movement detection off' : 'Hands off: could not load');
      if (S.step) render();
    });
  }
  /* The camera: by default as before; 'bellatrix-cam-label' (e.g. 'camera 2') picks one by its name, used for an external USB webcam.
     With js/camview.js the stream is asked for in 4:3, 1280 x 960, 30 images/s (ideal values: more field of view;
     a camera that only has 16:9 still opens). Without it: 640 x 480 as before. */
  /* 16 Nov (Seated Move Along: "Ich suche Sie…" with Rahma in front): the robot tablet's own camera opens at
     1280 x 960 but delivers a black 2 x 2 picture; asked plainly it gives 480 x 640. When the picture stays
     empty, startCam opens it again plainly and the tablet remembers it ('bellatrix-cam-plain' = '1'). */
  var CAM_EMPTY_MS = 2500;
  var POSE_EVERY_MS = 120;   /* body model with pointing on: about 8 times a second (a movement lasts 1 to 2 s) */   /* how long an empty picture is waited for (the camera starts in well under a second) */
  function plainCam() { if (cam.plain) return true; try { return localStorage.getItem('bellatrix-cam-plain') === '1'; } catch (e) { return false; } }
  function camVideo(extra) {
    if (window.CamView && !plainCam()) return window.CamView.constraints(extra);
    var c = { width: 640, height: 480 }, k;
    for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) c[k] = extra[k];
    return c;
  }
  function camStream() {
    var base = camVideo((screen.height > screen.width && screen.width < 1000) ? {} : { facingMode: 'user' }), lab = null;
    try { lab = localStorage.getItem('bellatrix-cam-label'); } catch (e) { lab = null; }
    if (!lab || !navigator.mediaDevices.enumerateDevices) return navigator.mediaDevices.getUserMedia({ video: base, audio: false });
    return navigator.mediaDevices.getUserMedia({ video: base, audio: false }).then(function (first) {
      return navigator.mediaDevices.enumerateDevices().then(function (list) {
        var d = null, i;
        for (i = 0; i < list.length; i++) if (list[i].kind === 'videoinput' && String(list[i].label).toLowerCase().indexOf(lab.toLowerCase()) === 0) d = list[i];
        if (!d) return first;
        first.getTracks().forEach(function (t) { t.stop(); });
        return navigator.mediaDevices.getUserMedia({ video: camVideo({ deviceId: { exact: d.deviceId } }), audio: false });
      });
    });
  }
  function startCam() {
    if (cam.stream || cam.starting) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { camFail('this browser cannot use the camera here'); return; }
    cam.starting = true;
    setHandText('Starting the camera…');
    var current = null;
    camStream().then(function (stream) {
      cam.starting = false;
      if (!wantCam(S.step) || nh.on) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      current = stream;
      cam.stream = stream; cam.onAt = Date.now();
      video.srcObject = stream;
      /* Zoom to its minimum, continuous exposure, the camera light, backlight (js/camview.js; never throws). */
      try { if (window.CamView) window.CamView.tune(stream); } catch (err) { /* camera as it is */ }
      log('Camera on (not recorded)', 'app', 'camera');
      attachSelfView();
      updateCamChips();
      checkPicture(stream);
      return video.play().then(function () { if (cam.stream === stream) detectLoop(); });
    }).catch(function (e) {
      cam.starting = false;
      /* Switched off again before the picture started (the person moved on quickly): not a failure. */
      if (current && cam.stream !== current) return;
      camFail('camera refused or used by another app: ' + (e && e.message ? e.message : e));
    });
  }
  /* The picture is checked on a video element of its own (the page's #cam may be handed to the camera
     boxes): still 16 pixels wide or less after CAM_EMPTY_MS, the camera is opened again plainly. */
  function checkPicture(stream) {
    if (plainCam()) return;
    var v2 = document.createElement('video');
    v2.muted = true; v2.setAttribute('playsinline', ''); v2.srcObject = stream;
    try { var p = v2.play(); if (p && p.catch) p.catch(function () { /* checked below anyway */ }); } catch (e) { /* checked below */ }
    setTimeout(function () {
      var w = v2.videoWidth, rs = v2.readyState;
      try { v2.pause(); } catch (e) { /* gone */ } v2.srcObject = null;
      if (cam.stream !== stream || plainCam() || rs < 2 || w > 16) return;
      log('The camera gives no picture (' + w + ' px wide): opened again plainly', 'app', 'camera');
      cam.plain = true;
      try { localStorage.setItem('bellatrix-cam-plain', '1'); } catch (e) { /* this page only */ }
      stopCam(); startCam();
    }, CAM_EMPTY_MS);
  }
  function camFail(why) {
    cam.failed.camera = true;
    log('Camera unavailable, ' + why + '. Voice and touch still work.', 'app', 'error');
    setHandText('Camera off: ' + why);
    if (S.step) render();
  }
  function stopCam() {
    clearTimeout(cam.timer);
    if (cam.stream) {
      var tracks = cam.stream.getTracks();
      tracks.forEach(function (t) { t.stop(); });
      var ended = tracks.every(function (t) { return t.readyState === 'ended'; });
      if (S.rec) S.rec.camMs += Date.now() - cam.onAt;
      cam.stream = null;
      log(ended ? 'Camera off (checked: the camera has stopped)' : 'Camera off requested, but a track is still live', 'app', 'camera');
    }
    video.srcObject = null;
    document.querySelectorAll('video.selfview').forEach(function (v) { v.srcObject = null; });
    if (window.CamView) window.CamView.apply();
    updateCamChips();
  }
  /* Self views (video.selfview; js/camview.js builds camera boxes of two of them): the stream, then turned,
     mirrored and filtered like the pointing (CamView.apply). */
  function attachSelfView() {
    if (!cam.stream) return;
    document.querySelectorAll('video.selfview').forEach(function (v) { if (v.srcObject !== cam.stream) { v.srcObject = cam.stream; v.play().catch(function () {}); } });
    if (window.CamView) window.CamView.apply();
  }
  function updateCamChips() {
    var st = S.step, on = !!cam.stream || nh.on;
    $('chipCam').hidden = !on;
    var showHand = on && st && (st.pose || handsHints(st) || airMode(st));
    $('chipHand').hidden = !showHand && !cam.failed.camera;
    if (!showHand) $('holdBar').hidden = true;
    if (!airMode(st)) $('airCursor').hidden = true;
  }
  function setHandText(t) { $('handText').textContent = Lab.t(handWord(t)); $('chipHand').hidden = false; }
  function detectLoop() {
    clearTimeout(cam.timer);
    if (!cam.stream) return;
    try { detectStep(); }
    catch (err) { setHandText('Detection error: ' + err.message); log('Detection error: ' + err.message, 'app', 'error'); }
    cam.timer = setTimeout(detectLoop, 25);
  }
  /* The front tablet's camera delivers its picture upside down (180 degrees) in the WebView: turn each frame
     before the hand / pose models see it. Other screens: unchanged. 'bellatrix-cam-rot' (0 or 180) overrides. */
  var rotCanvas = null;
  function camRot() {
    try { var o = localStorage.getItem('bellatrix-cam-rot'); if (o === '0' || o === '90' || o === '180' || o === '270') return +o; } catch (e) { /* default */ }
    return 0;
  }
  /* Turn the camera picture before the hand / pose models see it (a USB webcam in the tablet arrives sideways). */
  /* The hand models get at most DETECT_MAX pixels on the long side (640, as before the 1280 x 960 stream). */
  function detectMax() { return (window.CamView && window.CamView.R.DETECT_MAX) || 640; }
  function frameSource(v) {
    var rt = camRot(), w = v.videoWidth, h = v.videoHeight, x, k;
    if (!rt || !w) return v;
    k = Math.min(1, detectMax() / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
    if (!rotCanvas) rotCanvas = document.createElement('canvas');
    var cw = rt === 90 || rt === 270 ? h : w, ch = rt === 90 || rt === 270 ? w : h;
    if (rotCanvas.width !== cw || rotCanvas.height !== ch) { rotCanvas.width = cw; rotCanvas.height = ch; }
    x = rotCanvas.getContext('2d');
    if (rt === 180) x.setTransform(-1, 0, 0, -1, cw, ch);
    else if (rt === 90) x.setTransform(0, 1, -1, 0, cw, 0);
    else x.setTransform(0, -1, 1, 0, 0, ch);
    x.drawImage(v, 0, 0, w, h); x.setTransform(1, 0, 0, 1, 0, 0);
    return rotCanvas;
  }
  /* Hand detection in a background worker (js/handworker.js): the page is no longer frozen ~100 ms per picture on
     the tablet, so the pointer glides. One picture in flight at a time. If the worker cannot start, the old
     detection on the page takes over. */
  var hw = { w: null, ready: false, busy: 0, failed: false, id: 0, mode: '' };
  function hwStart() {
    if (hw.w || hw.failed) return;
    if (!window.Worker || !window.createImageBitmap || !window.HandWorkerSrc || !window.Blob || !window.URL) { hw.failed = true; return; }
    try {
      var src = '(' + window.HandWorkerSrc.toString() + ')();';
      hw.w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    } catch (e) { hw.failed = true; hw.w = null; return; }
    hw.w.onmessage = function (e) {
      var d = e.data || {};
      if (d.ready) { hw.ready = true; hw.mode = d.ready; log('Hand detection ready (' + d.ready + ', background)', 'app', 'camera'); return; }
      if (d.fail) { hwFail(d.fail); return; }
      if (d.id !== hw.id) return;
      hw.busy = 0;
      hwResult(d.lm || null);
    };
    hw.w.onerror = function (e) { hwFail(e && e.message ? e.message : 'worker error'); };
    hw.w.postMessage({ init: true, base: new URL(MP_LOCAL, document.baseURI).href });
    setTimeout(function () { if (hw.w && !hw.ready) hwFail('timeout'); }, 25000);
  }
  function hwFail(why) {
    hw.failed = true; hw.ready = false; hw.busy = 0;
    try { if (hw.w) hw.w.terminate(); } catch (e) { /* gone */ }
    hw.w = null;
    log('Background hand detection off (' + why + '): detection on the page instead', 'app', 'camera');
  }
  function hwSend(now) {
    if (hw.busy && now - hw.busy < 1500) return;          /* one picture at a time (unstick after 1.5 s) */
    hw.busy = now; var id = ++hw.id;
    /* A bigger stream (1280 x 960) is made smaller for the worker; a WebView that cannot resize sends it as it is. */
    var src = frameSource(video), sw = src.videoWidth || src.width, sh = src.videoHeight || src.height, k = sw && sh ? Math.min(1, detectMax() / Math.max(sw, sh)) : 1, bmp;
    if (k < 1 && !hw.noResize) {
      try { bmp = window.createImageBitmap(src, { resizeWidth: Math.round(sw * k), resizeHeight: Math.round(sh * k), resizeQuality: 'low' }).catch(function () { hw.noResize = true; return window.createImageBitmap(src); }); }
      catch (e) { hw.noResize = true; bmp = window.createImageBitmap(src); }
    } else bmp = window.createImageBitmap(src);
    bmp.then(function (b) {
      if (!hw.w) { try { b.close(); } catch (e) { /* ignore */ } return; }
      hw.w.postMessage({ bmp: b, ts: now, id: id }, [b]);
    }, function () { hw.busy = 0; });
  }
  function hwResult(lm) {
    var st = S.step, now = performance.now();
    if (!S.on) { if (idle.on && nh.on) airFrame(lm, now); return; }
    if (!st || (!cam.stream && !nh.on)) return;
    var res = { landmarks: lm ? [lm] : [] };
    if (airMode(st)) { handHook(st, res, now); airFrame(lm, now); }
    else if (handsHints(st) || (S.help && Lab.opt.camMode === 'signs' && S.camConsent)) { handHook(st, res, now); feed(lm ? classify(lm) : null, now); }
  }
  function detectStep() {
    var st = S.step;
    if (!st || video.readyState < 2 || video.currentTime === cam.lastT) return;
    var now = performance.now(), res;
    /* 23 Nov: the red heart on the page's own camera (a PC webcam): no hand model at all */
    if (!st.pose && airMode(st) && heartPage()) { cam.lastT = video.currentTime; heartPageFrame(now); return; }
    if (!st.pose && (airMode(st) || handsHints(st) || (S.help && Lab.opt.camMode === 'signs' && S.camConsent)) && !hw.failed) {
      hwStart();
      if (!hw.ready) { if (!hw.failed) { setHandText('Loading hand detection…'); return; } }
      else { if (!(hw.busy && now - hw.busy < 1500)) { cam.lastT = video.currentTime; hwSend(now); } return; }
    }
    cam.lastT = video.currentTime;
    if (st.pose) {
      if (!cam.pose) { ensureModel('pose'); return; }
      /* 16 Nov: with pointing on the same picture, the body model runs every POSE_EVERY_MS (enough to count a
         movement) and the hand model gets the rest of the time, so the cursor glides as on the other pages. */
      if (airMode(st) && !hw.failed) { hwStart(); if (hw.ready) hwSend(now); }
      if (!airMode(st) || now - (cam.poseAt || 0) >= POSE_EVERY_MS) { cam.poseAt = now; poseFrame(cam.pose.detect(frameSource(video)), now); }
    } else if (airMode(st)) {
      if (!cam.hands) { ensureModel('hands'); return; }
      res = cam.hands.detectForVideo(frameSource(video), now);
      handHook(st, res, now);
      airFrame(res && res.landmarks && res.landmarks.length ? res.landmarks[0] : null, now);
    } else if (handsHints(st) || (S.help && Lab.opt.camMode === 'signs' && S.camConsent)) {
      if (!cam.hands) { ensureModel('hands'); return; }
      res = cam.hands.detectForVideo(frameSource(video), now);
      handHook(st, res, now);
      feed(res && res.landmarks && res.landmarks.length ? classify(res.landmarks[0]) : null, now);
    }
  }
  /* A step may follow the hand itself (st.onHand(landmarks or null, time)), for example to throw
     the die in Ludo with a flick of the hand. */
  function handHook(st, res, now) {
    if (!st.onHand) return;
    try { st.onHand(res && res.landmarks && res.landmarks.length ? res.landmarks[0] : null, now); }
    catch (e) { log('Hand hook error: ' + e.message, 'app', 'error'); }
  }

  /* Hand shapes from the 21 hand landmarks (taken over from Memory Postcards v11). */
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function classify(lm) {
    var w = lm[0];
    function ext(tip, pip) { return dist(lm[tip], w) > dist(lm[pip], w) * 1.12; }
    var f = [ext(8, 6), ext(12, 10), ext(16, 14), ext(20, 18)];
    var thumb = dist(lm[4], lm[17]) > dist(lm[3], lm[17]) * 1.15;
    var key = f.map(function (x) { return x ? 1 : 0; }).join('');
    if (key === '1111') return 'open';
    if (key === '1000') return 'one';
    if (key === '1100') return 'two';
    if (key === '1110') return 'three';
    if (key === '0000') {
      if (!thumb) return 'fist';
      if (lm[4].y > lm[3].y && lm[3].y > lm[2].y) return 'thumbdown';
      if (lm[4].y < lm[3].y && lm[3].y < lm[2].y) return 'thumb';
      return Math.abs(lm[4].x - lm[2].x) > Math.abs(lm[4].y - lm[2].y) * 1.2 ? 'thumbside' : 'other';
    }
    return 'other';
  }
  /* What a hand sign does on the current step. */
  function gestureTarget(g) {
    var st = S.step;
    if (!g || !st) return null;
    if (S.help) return g === 'open' ? { key: 'closeHelp', label: Lab.t('Close'), sel: '[data-b="closeHelp"]', run: function () { closeHelp('hand'); } } : null;
    if (st.noHands || st.final) return null;
    var ch = st.choices || [];
    var idx = { one: 0, two: 1, three: 2 }[g];
    var numbered = ch.length && ch.length <= 3 && st.style !== 'grid';
    if (idx !== undefined && numbered) {
      var c = ch[idx];
      return c && !c.disabled ? { key: 'c' + idx, label: c.label, sel: '[data-b="c-' + idx + '"]', run: function () { choose(idx, 'hand'); } } : null;
    }
    var acts = st.actions || [];
    for (var i = 0; i < acts.length; i++) {
      if (acts[i].gesture === g && !acts[i].disabled) {
        return (function (k) { return { key: 'a' + k, label: acts[k].label, sel: '[data-b="a-' + k + '"]', run: function () { doAction(k, 'hand'); } }; })(i);
      }
    }
    if (g === 'thumbdown' && !st.noStop) return { key: 'stop', label: Lab.t('Stop'), sel: '[data-b="stop"]', run: function () { stopSession('hand'); } };
    if (g === 'thumbside' && backAllowed(st)) return { key: 'back', label: Lab.t('Back'), sel: '[data-b="back"]', run: function () { back('hand'); } };
    if (g === 'one' && !numbered) return { key: 'help', label: Lab.t('Help'), sel: '[data-b="help"]', run: function () { openHelp('hand'); } };
    return null;
  }
  var hold = null, armed = true, lastSeen = 0;
  function resetHands() { hold = null; armed = false; lastSeen = performance.now(); showHold(null, 0, null); }
  function feed(g, now) {
    var tgt = gestureTarget(g);
    if (tgt) lastSeen = now;
    if (!armed) { if (!tgt && now - lastSeen > 700) armed = true; showHold(null, 0, g); return; }
    if (tgt && (!hold || hold.key !== tgt.key)) hold = { key: tgt.key, t0: now, tgt: tgt };
    if (!tgt && hold && now - lastSeen > 350) hold = null;
    if (!hold) { showHold(null, 0, g); return; }
    var p = Math.min(1, (now - hold.t0) / HOLD_MS);
    showHold(hold.tgt, p, g);
    if (p >= 1) { var t = hold.tgt; hold = null; armed = false; t.run(); }
  }
  function showHold(tgt, p, g) {
    var bar = $('holdBar'), fill = $('holdFill');
    document.querySelectorAll('.hot').forEach(function (e) { e.classList.remove('hot'); });
    if ((!cam.stream && !nh.on) || !S.step || S.step.pose || airMode(S.step)) return;
    if (tgt) {
      setHandText(Lab.t('Hold still: {label}', { label: tgt.label }));
      bar.hidden = false; fill.style.width = (p * 100) + '%';
      var el = stage.querySelector(tgt.sel); if (el) el.classList.add('hot');
    } else {
      bar.hidden = true; fill.style.width = '0';
      if (handsHints(S.step) || S.help) setHandText(g ? 'I can see your hand' : 'Show your hand to the camera');
    }
  }

  /* ---------- pointing in the air ----------
     The index fingertip moves a large round pointer over the screen. Holding it still on a button
     presses it; the ring around the pointer fills up meanwhile. A small hand movement in the
     middle of the camera picture covers the whole screen, so nobody has to stretch. */
  /* SETTLE_MS: a new screen waits this long before the pointer can press anything.
     RELEASE_PX: after a press, the finger has to move this far (stage pixels, about one chess square)
     or the hand has to go down before anything can be pressed again. Without both, one finger held
     still clicked through Begin, Yes, and the next screens, whose buttons sit at the same place. */
  var AIR = { X0: 0.21, X1: 0.79, Y0: 0.16, Y1: 0.67, SMOOTH: 0.45, DWELL_MS: 1100, STOP_MS: 2200, LOST_MS: 900, SETTLE_MS: 900, RELEASE_PX: 90,
    /* 16 Nov (the boss, for old people): the magnet chooses the button, but the count only starts once the hand is
       CLOSED ("OK for this choice"). Closed this long counts (a few frames, no flicker): */
    CLOSE_MS: 120,
    /* and open again this long before the hand counts as open (a fist that loosens for one frame keeps counting): */
    OPEN_MS: 250,
    /* the count once the hand is closed (shorter than DWELL_MS: closing the hand is already a clear decision): */
    CONFIRM_MS: 800,
    /* Stop needs a longer closed hand, as before (Stop is the one button that must not be pressed by accident): */
    CONFIRM_STOP_MS: 1500 };
  /* 'bellatrix-air-confirm' '0' = the old way (holding still is enough); anything else = close the hand to choose. */
  function airConfirm() { try { return localStorage.getItem('bellatrix-air-confirm') !== '0'; } catch (e) { return true; } }
  /* 16 Nov afternoon (Rahma): open hand = select (the pointer follows), closed hand = OK: the ring fills while the hand
     stays closed on the button, then it is chosen; open again before the next OK. 'bellatrix-air-confirm':
     'closeopen' = the morning's close-then-open OK, '0' = hold still as at first. */
  function airConfirmMode() {
    var v = null;
    try { v = localStorage.getItem('bellatrix-air-confirm'); } catch (e) { v = null; }
    /* the red heart: close the hand over it, then open; the highlighter: press the cap, then let go (23 Nov) */
    if (v !== '0' && heartOn()) return 'closeopen';   /* the highlighter too: press the cap, let go (a click) */
    return v === '0' ? null : v === 'closeopen' ? 'closeopen' : 'close';
  }
  /* All four fingers folded (thumb free): the closed hand. */
  function handClosed(lm) {
    var w = lm[0];
    if (!lm[9] || dist(lm[9], w) < 0.02) return false;   /* no real hand shape (too small to read): never "closed" */
    function folded(tip, pip) { return dist(lm[tip], w) <= dist(lm[pip], w) * 1.12; }
    return folded(8, 6) && folded(12, 10) && folded(16, 14) && folded(20, 18);
  }
  var air = { x: 540, y: 960, seen: false, last: 0, key: null, since: 0, done: null, guard: null, ready: 0 }, hovered = null;
  /* On every new screen; the guard of the last press is kept on purpose (see RELEASE_PX). */
  function resetAir() { air.key = null; air.since = 0; air.done = null; air.seen = false; air.ready = performance.now() + AIR.SETTLE_MS; setRing(0); hover(null); var c = $('airCursor'); if (c) c.hidden = true; }
  function setRing(p) { var c = $('airCursor'); if (c) c.style.setProperty('--p', p); }
  function hover(b) { if (hovered === b) return; if (hovered) hovered.classList.remove('airhover'); hovered = b; if (b) b.classList.add('airhover'); }
  /* 16 Nov (Rahma): no scrolling by a swipe in the air any more, only pointing. Lists that are longer than the
     screen keep their arrow buttons, which are chosen by pointing like any other button. */
  /* The front tablet's camera is the other way round for pointing: 'bellatrix-cam-flipx' / '-flipy' ('1' or '0') override the default (x flipped on the portrait tablet). */
  function camFlip() {
    var tab = screen.height > screen.width && screen.width < 1000, fx = tab, fy = false;
    try { var ox = localStorage.getItem('bellatrix-cam-flipx'), oy = localStorage.getItem('bellatrix-cam-flipy'); if (ox === '1' || ox === '0') fx = ox === '1'; if (oy === '1' || oy === '0') fy = oy === '1'; } catch (e) { /* defaults */ }
    return { x: fx, y: fy };
  }
  /* The pointer itself lives in js/airpointer.js (window.AirPointer): a window that follows the hand, a gain in
     palm lengths and a one-euro filter; see that file and tests/airpointer.test.mjs. Live settings (localStorage):
     'bellatrix-air-kx' / '-ky' (palm lengths for the full screen width / height; smaller = less movement needed),
     '-tip' (share of the fingertip), '-min' and '-beta' (filter: lower min = steadier, higher beta = quicker). */
  var airP = null;
  function airPtr() {
    if (airP) return airP;
    /* With js/camview.js the engine gets no hot zone (the full picture): CamView.toScreen maps it (airScreen). */
    if (window.AirPointer) { airP = window.AirPointer.create(window.CamView ? { zone: [0, 0, 1, 1] } : undefined); return airP; }
    /* Without airpointer.js: the old fixed window, so pointing still works. */
    var sm = null;
    airP = { config: function () {}, update: function (lm, t, W, H, mirrorX, flipY) {
      var tip = lm && lm[8]; if (!tip || !isFinite(tip.x) || !isFinite(tip.y)) return null;
      var x = mirrorX ? 1 - tip.x : tip.x, y = flipY ? 1 - tip.y : tip.y, k;
      if (window.CamView) {
        /* The fingertip in the picture, smoothed with LISSAGE (nothing else smooths on this path); airScreen maps it. */
        k = window.CamView.R.LISSAGE;
        sm = sm && t - sm.t < 500 ? { x: sm.x + (x - sm.x) * k, y: sm.y + (y - sm.y) * k, t: t } : { x: x, y: y, t: t };
        return { u: sm.x, v: sm.y, ru: x, rv: y, s: 0, px: x * W, py: y * H };
      }
      var u = Math.min(1, Math.max(0, (x - 0.21) / 0.58)), v = Math.min(1, Math.max(0, (y - 0.16) / 0.51));
      return { u: u, v: v, ru: u, rv: v, s: 0, px: x * W, py: y * H };
    } };
    return airP;
  }
  function airCfg() {
    var c = {}, map = { kx: 'kx', ky: 'ky', tip: 'tip', min: 'minCut', beta: 'beta' }, k, v;
    try { for (k in map) { v = parseFloat(localStorage.getItem('bellatrix-air-' + k)); if (isFinite(v) && v >= 0) c[map[k]] = v; } } catch (e) { /* defaults */ }
    return c;
  }
  function camFrameSize() {
    /* The app's picture is already turned (bellatrix-hands-rot / -cam-rot went to the app): its own size. */
    if (nh.on) return { w: nh.w, h: nh.h };
    var rt = camRot(), w = video.videoWidth || 640, h = video.videoHeight || 480;
    return rt === 90 || rt === 270 ? { w: h, h: w } : { w: w, h: h };
  }
  /* A measuring log for tuning on the real tablet (read over the debugger: Lab._airDebug). Numbers only, no picture. */
  var airLogBuf = [];
  function airLog(now, r) {
    airLogBuf.push({ t: Math.round(now), ru: +r.ru.toFixed(4), rv: +r.rv.toFixed(4), u: +r.u.toFixed(4), v: +r.v.toFixed(4), s: Math.round(r.s * 10) / 10, px: Math.round(r.px), py: Math.round(r.py) });
    if (airLogBuf.length > 900) airLogBuf.splice(0, airLogBuf.length - 900);
  }
  Lab._airDebug = function (clear) { var out = airLogBuf.slice(); if (clear) airLogBuf.length = 0; return out; };
  /* The pointer's position in stage pixels (filtered, and as drawn), for the checks. */
  Lab._air = function () { return { x: air.x, y: air.y, dx: air.dx, dy: air.dy, key: air.key, seen: air.seen, closed: !!air.closed, needOpen: !!air.needOpen, done: air.done || null, chosen: air.chosen || 0 }; };
  /* The one conversion camera picture -> screen (CamView.toScreen: mirror, margins, clamp) on the stage's rectangle.
     air.x / air.y come from it; the drawn cursor glides to them and airSnap tests r.left + air.x * s, the same point.
     The 'bellatrix' engine (window following the hand) already spans the whole screen: no margins for it. */
  function airScreen(pr, r) {
    var CV = window.CamView, eng = 'telekom', z, a, b;
    try { eng = localStorage.getItem('bellatrix-air-engine') === 'bellatrix' ? 'bellatrix' : 'telekom'; } catch (e) { /* default */ }
    z = eng === 'bellatrix' ? [0, 0, 1, 1] : null;
    a = CV.toScreen(pr.u, pr.v, r, z); b = CV.toScreen(pr.ru, pr.rv, r, z);
    return { u: a.u, v: a.v, ru: b.u, rv: b.v, s: pr.s, px: pr.px, py: pr.py };
  }
  /* The cursor is drawn at the screen's own rate, gliding towards the filtered position: smooth even when the
     camera only gives 10 to 15 hand positions per second. Pressing still uses the filtered position. */
  var airRaf = 0;
  function airDrawStart() {
    if (airRaf) return;
    if (!window.requestAnimationFrame) { var c0 = $('airCursor'); if (c0) c0.style.transform = 'translate(' + Math.round(air.x) + 'px,' + Math.round(air.y) + 'px)'; return; }
    airRaf = window.requestAnimationFrame(airDraw);
  }
  function airDraw(ts) {
    airRaf = 0;
    var c = $('airCursor');
    if (!c || c.hidden) { air.dispInit = false; return; }
    if (!air.dispInit || !isFinite(air.dx) || !isFinite(air.dy)) { air.dx = air.x; air.dy = air.y; air.dts = ts; air.dispInit = true; }
    var k = 1 - Math.exp(-Math.max(0, ts - air.dts) / 45);
    air.dts = ts;
    /* Between two hand positions (about 8 per second on the tablet) the cursor carries on in the direction it was
       going, for at most 120 ms, so it glides instead of stepping. */
    var ahead = Math.min(120, Math.max(0, performance.now() - air.last)) / 1000;
    var gx = Math.min(stageW(), Math.max(0, air.x + (air.vx || 0) * ahead)), gy = Math.min(stageH(), Math.max(0, air.y + (air.vy || 0) * ahead));
    if (air.snap && air.hold) { gx += (air.snap.x - gx) * 0.45; gy += (air.snap.y - gy) * 0.45; }   /* pulled onto the chosen button */
    air.dx += (gx - air.dx) * k; air.dy += (gy - air.dy) * k;
    c.style.transform = 'translate(' + Math.round(air.dx) + 'px,' + Math.round(air.dy) + 'px)';
    if (performance.now() - air.last < 800 || Math.abs(air.x - air.dx) + Math.abs(air.y - air.dy) > 0.5) airRaf = window.requestAnimationFrame(airDraw);
  }
  /* Big-button snapping for old people: the nearest button within about a quarter of the screen is chosen even when
     the pointer is not exactly on it, and it stays chosen until another one is clearly closer (no flicker between
     neighbours, even with only 8 hand positions per second). The drawn pointer is pulled towards that button, so
     people see what will be chosen. 'bellatrix-air-snap' sets the reach in screen pixels (0 = off). */
  function airSnap(r, s) {
    var lim = 260, cx = r.left + air.x * s, cy = r.top + air.y * s, list = stage.querySelectorAll('button[data-b]');
    try { var o = parseFloat(localStorage.getItem('bellatrix-air-snap')); if (isFinite(o) && o >= 0) lim = o; } catch (e) { /* default */ }
    lim *= s;
    var best = null, bd = 1e9, curD = 1e9, i, q, dx, dy, dd, el;
    for (i = 0; i < list.length; i++) {
      if (list[i].disabled || list[i].classList.contains('off') || list[i].offsetParent === null) continue;
      q = list[i].getBoundingClientRect();
      if (!q.width || !q.height) continue;
      dx = Math.max(q.left - cx, 0, cx - q.right); dy = Math.max(q.top - cy, 0, cy - q.bottom); dd = Math.sqrt(dx * dx + dy * dy);
      if (list[i] === air.hold) curD = dd;
      if (dd < bd) { bd = dd; best = list[i]; }
    }
    if (air.hold && air.hold.isConnected && curD <= lim && curD <= bd * 1.35 + 30 * s) { best = air.hold; bd = curD; }
    if (!best || bd > lim) {
      /* nothing near: what is exactly under the pointer, if it is a button */
      el = document.elementFromPoint(cx, cy); best = el && el.closest ? el.closest('#stage button[data-b]') : null;
      if (best && (best.disabled || best.classList.contains('off'))) best = null;
    }
    if (best) { q = best.getBoundingClientRect(); air.snap = { x: ((q.left + q.right) / 2 - r.left) / s, y: ((q.top + q.bottom) / 2 - r.top) / s }; }
    else air.snap = null;
    return best;
  }
  function airFrame(lm, now) {
    var cur = $('airCursor');
    if (!lm) {
      if (air.seen && now - air.last > AIR.LOST_MS) { air.seen = false; cur.hidden = true; hover(null); air.key = null; air.guard = null; air.snap = null; air.hold = null; setRing(0); }
      if (!air.seen) setHandText('Point at the screen with one finger');
      return;
    }
    var fl = camFlip(), fs = camFrameSize(), ptr = airPtr(), CV = window.CamView, r = stage.getBoundingClientRect(), s = r.width / stageW();
    ptr.config(airCfg());
    /* With js/camview.js the engine follows and smooths the hand in the picture as it is; airScreen mirrors and maps. */
    var pr = CV ? ptr.update(lm, now, fs.w, fs.h, false, false) : ptr.update(lm, now, fs.w, fs.h, !fl.x, fl.y);
    if (!pr) return;
    if (CV) pr = airScreen(pr, r);
    if (!air.seen) { air.dispInit = false; air.vx = 0; air.vy = 0; air.closed = false; air.closeAt = 0; air.openAt = 0; air.squeeze = null; air.armed = null; air.needOpen = false; }
    /* Closed or open hand, with a little patience both ways (see AIR.CLOSE_MS / OPEN_MS). */
    var confirm = airConfirm(), shut = confirm && (lm.heartClosed !== undefined ? !!lm.heartClosed : handClosed(lm)), wasClosed = !!air.closed;
    var penOn = markInput() === 'pen' && heartOn(), cms = penOn ? PEN.CLOSE_PATIENCE : AIR.CLOSE_MS, oms = penOn ? PEN.OPEN_PATIENCE : AIR.OPEN_MS;
    if (shut) { air.openAt = 0; if (!air.closeAt) air.closeAt = now; if (!air.closed && now - air.closeAt >= cms) air.closed = true; }
    else { air.closeAt = 0; if (!air.openAt) air.openAt = now; if (air.closed && now - air.openAt >= oms) air.closed = false; }
    /* The "OK" (16 Nov, Rahma): close the hand on a button, then open it again; only then the ring starts to fill.
       Closing on a button remembers it (squeeze); opening again arms it; a new close starts a new OK. */
    var cmode = confirm ? airConfirmMode() : null;
    if (confirm && air.closed && !wasClosed) {
      air.armed = null; air.squeeze = air.hold && air.hold.isConnected ? air.hold : null;
      /* closed = OK: the ring starts at once on the button where the hand closed (not again before the hand opened) */
      if (cmode === 'close' && air.squeeze && !air.needOpen) air.armed = { el: air.squeeze, at: now };
    }
    if (confirm && !air.closed && wasClosed) {
      /* a highlighter press that was cancelled (moved away, pen lost) is not a release (23 Nov) */
      if (penOn && now - (hz.cancelAt || 0) < 800) air.squeeze = null;
      if (cmode === 'closeopen' && air.squeeze && air.squeeze.isConnected) air.armed = { el: air.squeeze, at: now };
      else air.armed = null;   /* closed = OK: opened before the ring was full, nothing is chosen */
      air.squeeze = null; air.needOpen = false;
    }
    /* While the hand is closed, and while the ring fills, the pointer stays on that button: closing and opening the
       hand moves the palm, and the choice must not slide to a neighbour (nor scroll the page). A big move of the
       hand away (2 x RELEASE_PX) cancels the OK. */
    var nx0 = pr.u * stageW(), ny0 = pr.v * stageH(), dts = Math.max(30, now - (air.last || now)) / 1000;
    if (confirm && air.armed && Math.abs(nx0 - air.x) + Math.abs(ny0 - air.y) > (penOn ? PEN.RING_MOVE_PX : 2 * AIR.RELEASE_PX)) air.armed = null;
    var lockOn = confirm && ((air.closed && air.squeeze) || air.armed) && air.hold && air.hold.isConnected;
    if (lockOn) { nx0 = air.x; ny0 = air.y; }
    if (air.seen && dts < 0.5) { air.vx = 0.5 * (air.vx || 0) + 0.5 * (nx0 - air.x) / dts; air.vy = 0.5 * (air.vy || 0) + 0.5 * (ny0 - air.y) / dts; }
    air.x = nx0; air.y = ny0;
    air.seen = true; air.last = now;
    airLog(now, pr);
    cur.hidden = false;
    airDrawStart();
    /* A team game (js/games.js) in its frame: over the frame the cursor belongs to the game. */
    if (Lab.airToFrame && Lab.airToFrame(air.x, air.y, now, r, s, setRing)) { hover(null); air.hold = null; air.snap = null; air.key = null; return; }
    var b = lockOn ? air.hold : airSnap(r, s);
    /* A hand at the very edge of the camera picture is seen badly: ask for it in the middle. */
    var edgeP = lm[9] || lm[0], nearEdge = !!edgeP && (edgeP.x < 0.04 || edgeP.x > 0.96 || edgeP.y < 0.03 || edgeP.y > 0.97);
    if (b) air.onAt = now;
    else if (air.hold && air.hold.isConnected && now - (air.onAt || 0) < 500) b = air.hold;
    air.hold = b;
    var key = b ? b.getAttribute('data-b') : null;
    /* Moving to another button starts a new wait; the button just pressed stays quiet until the
       pointer has left it, so one long hold never presses twice. */
    if (key !== air.key) { air.key = key; air.since = now; air.done = null; }
    /* the object + button (23 Nov): pointing only shows the choice; the press chooses (pressOK) */
    if (pressMode()) {
      hover(b); setRing(0);
      setHandText(nearEdge && !b ? 'Show the red mark to the camera' : !b ? 'Move the object to what you want' : 'Press the button to choose');
      return;
    }
    if (confirm) {
      /* Point, then "OK" = close and open the hand: the ring fills only after that, on the button where the hand
         closed. Every choice needs its own OK (holding still never chooses). */
      if (air.armed && (!b || air.armed.el !== b)) air.armed = null;
      hover(b);
      setHandText(cmode === 'close'
        ? (nearEdge && !b ? 'Show your hand to the camera' : !b ? 'Point at what you want' : air.armed ? 'Keep your hand closed' : air.needOpen ? 'Open your hand' : 'Close your hand to choose')
        : (nearEdge && !b ? 'Show your hand to the camera' : !b ? 'Point at what you want' : air.armed ? 'Hold still to choose' : air.closed ? 'Now open your hand' : 'Close and open your hand to choose'));
      if (!b || !air.armed || now < air.ready) { setRing(0); air.since = now; return; }
      var pc = Math.min(1, (now - air.armed.at) / (key === 'stop' ? AIR.CONFIRM_STOP_MS : penOn ? PEN.CONFIRM_MS : AIR.CONFIRM_MS));
      setRing(pc);
      if (pc >= 1) {
        air.armed = null; air.done = key; setRing(0); air.chosen = (air.chosen || 0) + 1;
        if (cmode === 'close') air.needOpen = true;   /* the next OK needs the hand opened first */
        dispatch(b.getAttribute('data-a'), parseInt(b.getAttribute('data-i'), 10), 'air', b);
      }
      return;
    }
    if (air.guard && Math.abs(air.x - air.guard.x) + Math.abs(air.y - air.guard.y) > AIR.RELEASE_PX) air.guard = null;
    var waiting = !!air.guard || now < air.ready;
    hover(b);
    setHandText(nearEdge && !b ? 'Show your hand to the camera' : !b ? 'Point at what you want' : air.guard ? 'Move your finger, then point again' : 'Hold still to choose');
    /* While waiting, the hold only starts counting once the pointer is free again. */
    if (!b || key === air.done || waiting) { setRing(0); if (waiting) air.since = now; return; }
    var p = Math.min(1, (now - air.since) / (key === 'stop' ? AIR.STOP_MS : AIR.DWELL_MS));
    setRing(p);
    if (p >= 1) {
      air.done = key; air.guard = { x: air.x, y: air.y }; setRing(0); air.chosen = (air.chosen || 0) + 1;
      dispatch(b.getAttribute('data-a'), parseInt(b.getAttribute('data-i'), 10), 'air', b);
    }
  }

  /* Seated movements from the pose landmarks: 11/12 shoulders, 15/16 wrists (image y grows downwards).
     Thresholds are relative to the shoulder width, so distance to the screen does not matter. */
  var POSE = {
    UP: 0.4,      /* wrist this many shoulder widths above its shoulder counts as raised */
    CROSS: 0.6,   /* wrist this close to the other shoulder counts as touching it */
    OUT: 0.7,     /* wrist this far out to the side of its shoulder counts as stretched out */
    ON_MS: 350,   /* the position has to be held this long: a half movement does not count */
    OFF_MS: 500   /* and released this long before the next one counts */
  };
  function ok(p) { return !!p && (p.visibility === undefined || p.visibility > 0.5); }
  function shoulderWidth(lm) { return Math.max(0.05, dist(lm[11], lm[12])); }
  function raised(wr, sh, w) { return ok(wr) && wr.y < sh.y - POSE.UP * w; }
  function sideways(wr, sh, dir, w) { return ok(wr) && (wr.x - sh.x) * dir > POSE.OUT * w && Math.abs(wr.y - sh.y) < 0.7 * w; }
  var POSE_TEST = {
    one: function (lm) { var w = shoulderWidth(lm); return raised(lm[15], lm[11], w) || raised(lm[16], lm[12], w); },
    both: function (lm) { var w = shoulderWidth(lm); return raised(lm[15], lm[11], w) && raised(lm[16], lm[12], w); },
    cross: function (lm) { var w = shoulderWidth(lm); return (ok(lm[15]) && dist(lm[15], lm[12]) < POSE.CROSS * w) || (ok(lm[16]) && dist(lm[16], lm[11]) < POSE.CROSS * w); },
    out: function (lm) { var w = shoulderWidth(lm), d = lm[11].x > lm[12].x ? 1 : -1; return sideways(lm[15], lm[11], d, w) && sideways(lm[16], lm[12], -d, w); }
  };
  /* 16 Nov (Rahma: "quand je fais les gestes le compteur ne s'ajoute pas"): kind 'any' counts every clear
     movement out and back (hands pushed forward, a knee lifted…) for the movements without a test above.
     Elbows, wrists, knees, ankles and the nose, measured from the middle of the shoulders in shoulder widths,
     against the resting position (taken when still, slowly following): further than ANY_HIGH counts once,
     back within ANY_LOW ends the movement. */
  var ANY_PTS = [0, 13, 14, 15, 16, 25, 26, 27, 28], ANY_HIGH = 0.45, ANY_LOW = 0.2, ANY_FOLLOW = 0.1, ANY_STAY_MS = 6000;
  function anyMove(lm, now) {
    var w = shoulderWidth(lm), cx = (lm[11].x + lm[12].x) / 2, cy = (lm[11].y + lm[12].y) / 2, cur = {}, dev = 0, n = 0, i, k, b, dx, dy;
    for (i = 0; i < ANY_PTS.length; i++) { k = ANY_PTS[i]; if (ok(lm[k])) cur[k] = { x: (lm[k].x - cx) / w, y: (lm[k].y - cy) / w }; }
    if (!ps.base) { ps.base = cur; return false; }
    for (k in cur) {
      b = ps.base[k];
      if (!b) { ps.base[k] = cur[k]; continue; }
      dx = cur[k].x - b.x; dy = cur[k].y - b.y; dev = Math.max(dev, Math.sqrt(dx * dx + dy * dy)); n++;
    }
    var hit = n > 0 && dev > (ps.on ? ANY_LOW : ANY_HIGH);
    /* out for longer than ANY_STAY_MS: a new resting place (hands moved to the armrest), not a movement */
    if (ps.on && hit && now) { if (!ps.outAt) ps.outAt = now; else if (now - ps.outAt > ANY_STAY_MS) { ps.base = cur; ps.outAt = 0; return false; } } else ps.outAt = 0;
    if (!ps.on && !hit && dev < ANY_LOW) for (k in cur) if (ps.base[k]) { ps.base[k].x += (cur[k].x - ps.base[k].x) * ANY_FOLLOW; ps.base[k].y += (cur[k].y - ps.base[k].y) * ANY_FOLLOW; }
    return hit;
  }
  POSE_TEST.any = anyMove;
  var ps = { on: false, since: 0, off: 0, visible: null, base: null };
  function resetPose() { ps = { on: false, since: 0, off: 0, visible: null, base: null }; }
  function poseFrame(res, now) {
    var st = S.step, p = st.pose, lm = res && res.landmarks && res.landmarks[0];
    var visible = !!(lm && ok(lm[11]) && ok(lm[12]));
    if (visible !== ps.visible) {
      ps.visible = visible;
      setHandText(visible ? 'I can see you' : 'Please sit where I can see your shoulders');
      if (p.onVisible) p.onVisible(visible);
    }
    if (!visible || !p.kind) { ps.since = 0; return; }
    if (POSE_TEST[p.kind](lm, now)) {
      ps.off = 0;
      if (!ps.on) {
        if (!ps.since) ps.since = now;
        if (now - ps.since >= POSE.ON_MS) { ps.on = true; ps.since = 0; log('Movement seen by the camera: ' + p.kind, 'camera', 'detect', { move: p.kind }); if (p.onSeen) p.onSeen(); }
      }
    } else {
      ps.since = 0;
      if (ps.on) { if (!ps.off) ps.off = now; if (now - ps.off >= POSE.OFF_MS) { ps.on = false; ps.off = 0; } }
    }
  }
  function markAttempt() {
    if (!S.on) return;
    var st = S.step, kind = st && st.pose && st.pose.kind;
    log('Staff: attempt seen' + (kind ? ' (' + kind + ')' : ''), 'staff', 'attempt', { move: kind || '' });
    toast('Attempt marked');
  }

  /* ---------- screens ---------- */
  function backAllowed(st) { return S.hist.length > 0 && st.back !== false && !st.final; }
  /* The small number on a choice is only for answering with 1, 2 or 3 fingers. */
  function num(i, st) { return handsHints(st) ? '<span class="num">' + (i + 1) + '</span>' : ''; }
  function renderChoices(st) {
    var ch = st.choices, style = st.style || 'opts';
    if (style === 'cards') {
      return '<div class="cards">' + ch.map(function (c, i) {
        return '<button type="button" class="card' + (c.cls ? ' ' + c.cls : '') + '" data-a="c" data-i="' + i + '" data-b="c-' + i + '"' + (c.disabled ? ' disabled' : '') + '>' + (c.art || '') +
          '<span class="tag">' + num(i, st) + esc(c.label) + '</span></button>';
      }).join('') + '</div>';
    }
    /* A chess board: 64 squares, each a button like any other, so touch and pointing both work. */
    if (style === 'board') {
      return '<div class="board8">' + ch.map(function (c, i) {
        return '<button type="button" class="sq' + (c.cls ? ' ' + c.cls : '') + '" data-a="c" data-i="' + i + '" data-b="c-' + i + '"' + (c.disabled ? ' disabled' : '') + ' aria-label="' + esc(c.label) + '">' +
          (c.art || '') + (c.mark ? '<span class="sqmark">' + esc(c.mark) + '</span>' : '') + '</button>';
      }).join('') + '</div>';
    }
    if (style === 'grid') {
      return '<div class="grid6' + (st.gridCls ? ' ' + st.gridCls : '') + '">' + ch.map(function (c, i) {
        return '<button type="button" class="pcard' + (c.cls ? ' ' + c.cls : '') + '" data-a="c" data-i="' + i + '" data-b="c-' + i + '"' + (c.disabled ? ' disabled' : '') + ' aria-label="' + esc(c.label) + '">' +
          '<span class="num">' + (i + 1) + '</span>' + (c.art || '') + '</button>';
      }).join('') + '</div>';
    }
    return '<div class="opts">' + ch.map(function (c, i) {
      return '<button type="button" class="opt' + (c.cls ? ' ' + c.cls : '') + (c.disabled ? ' tried' : '') + '" data-a="c" data-i="' + i + '" data-b="c-' + i + '"' + (c.disabled ? ' disabled' : '') + '>' +
        num(i, st) + (c.icon ? '<span class="ico">' + c.icon + '</span>' : '') + '<span class="lbl">' + esc(c.label) + '</span></button>';
    }).join('') + '</div>';
  }
  function renderActions(st) {
    var acts = st.actions, out = '', i = 0;
    function btn(a, k) {
      return '<button type="button" class="btn' + (a.primary ? ' primary' : '') + (a.cls ? ' ' + a.cls : '') + '" data-a="a" data-i="' + k + '" data-b="a-' + k + '"' + (a.disabled ? ' disabled' : '') + '>' +
        (a.icon ? '<span class="bico">' + a.icon + '</span>' : '') + '<span class="blbl">' + esc(a.label) + '</span></button>';
    }
    while (i < acts.length) {
      if (acts[i].pair && acts[i + 1]) { out += '<div class="pair">' + btn(acts[i], i) + btn(acts[i + 1], i + 1) + '</div>'; i += 2; }
      else { out += btn(acts[i], i); i++; }
    }
    return '<div class="actions">' + out + '</div>';
  }
  function foot(st) {
    if (st.final) return '';
    var backOn = backAllowed(st), stopOn = !st.noStop;
    return '<div class="foot">' +
      '<button type="button" data-a="back" data-b="back" class="' + (backOn ? '' : 'off') + '"' + (backOn ? '' : ' tabindex="-1" aria-hidden="true"') + '>' + esc(Lab.t('Back')) + '</button>' +
      '<button type="button" data-a="help" data-b="help">' + esc(Lab.t('Help')) + '</button>' +
      '<button type="button" data-a="stop" data-b="stop" class="' + (stopOn ? '' : 'off') + '"' + (stopOn ? '' : ' tabindex="-1" aria-hidden="true"') + '>' + esc(Lab.t('Stop')) + '</button></div>';
  }
  function render() {
    var st = S.step, h = '';
    if (!st) return;
    /* A title, a picture and the buttons (1.13): no eyebrow line and no hint line on the patient screen. */
    if (st.title || st.lead) {
      h += '<header>' + (st.title ? '<h2>' + esc(st.title) + '</h2>' : '') + (st.lead ? '<p class="lead">' + esc(st.lead) + '</p>' : '') + '</header>';
    }
    if (st.center) h = '<div class="center">' + h + (st.body || '') + '</div>';
    else {
      if (st.pic) h += '<div class="picture' + (st.picCls ? ' ' + st.picCls : '') + '">' + st.pic + (st.picTag ? '<span class="tag">' + esc(st.picTag) + '</span>' : '') + '</div>';
      if (st.body) h += st.body;
    }
    if (st.choices && st.choices.length) h += renderChoices(st);
    if (st.actions && st.actions.length) h += renderActions(st);
    h += foot(st);
    if (S.help) {
      h += '<div class="overlay" role="dialog" aria-modal="true"><h2>' + esc(Lab.t('The care team is here to help.')) + '</h2>' +
        '<button type="button" class="btn primary" data-a="closeHelp" data-b="closeHelp">' + esc(Lab.t('Close')) + '</button></div>';
    }
    hovered = null;
    screenEl.innerHTML = h;
    /* Without a picture or card area to fill the height, centre the content above the footer. */
    var fills = screenEl.querySelector('.picture, .cards, .grid6, .board8, .figure, .sayingcard, .plan, .np, .call, .bigicon, .calib, .center');
    screenEl.className = (st.cls || '') + (fills ? '' : ' nofill');
    arrange(screenEl);
    attachSelfView();
    if (st.after) st.after(screenEl);
  }

  /* ---------- inputs ---------- */
  function via(src) { return ' (' + src + ')'; }
  function input(src) {
    if (src === 'touch' && S.staffTapping) src = 'staff';
    count(src);
    clearTimeout(repromptTimer);
    resetHands();
    return src;
  }
  function choose(i, src) {
    var st = S.step, c = st && st.choices && st.choices[i];
    if (!c || c.disabled || !S.on) return;
    src = input(src);
    log('Chose: ' + c.label + via(src), src, 'choice', { value: c.value || c.label });
    if (c.run) c.run(src, c, i);
  }
  function doAction(i, src) {
    var st = S.step, a = st && st.actions && st.actions[i];
    if (!a || a.disabled || !S.on) return;
    src = input(src);
    if (a.skip) count('skip');
    log('Pressed: ' + a.label + via(src), src, 'action');
    if (a.run) a.run(src, a, i);
  }
  function dispatch(a, i, src, el) {
    /* 16 Nov: a plain button outside a session (the waiting screen's "Call my family"), chosen by pointing */
    if (a === 'click') { if (el && src === 'air') { try { el.click(); } catch (e) { /* gone */ } } return; }
    if (a === 'c') choose(i, src);
    else if (a === 'a') doAction(i, src);
    else if (a === 'back') back(src);
    else if (a === 'help') openHelp(src);
    else if (a === 'stop') stopSession(src);
    else if (a === 'closeHelp') closeHelp(src);
  }
  function openHelp(src) {
    if (S.help) return;
    src = input(src); count('help');
    log('Help requested' + via(src), src, 'help');
    S.help = true; render(); stopMusic();
    say(Lab.t('Someone from the care team is here to help. There is no rush.'));
  }
  function closeHelp(src) {
    src = input(src);
    log('Help closed' + via(src), src, 'help');
    S.help = false; render(); scheduleReprompt();
  }

  /* ---------- navigation ---------- */
  function clearStepTimers() { stepTimers.forEach(function (t) { clearTimeout(t); clearInterval(t); }); stepTimers = []; }
  function leave() {
    var st = S.step;
    clearStepTimers(); clearTimeout(repromptTimer);
    if (!st) return;
    if (st.leave) { try { st.leave(); } catch (e) { log('Step error: ' + e.message, 'app', 'error'); } }
    if (!st.keepMusic) Music.stop();
  }
  function show(step, silent) {
    S.step = step; S.help = false;
    syncCam();
    render();
    if (step.enter) step.enter();
    if (!silent) announce();
  }
  function go(step, o) {
    o = o || {};
    if (!S.on || !step) return;
    var prev = S.step;
    leave();
    if (o.clear) S.hist = [];
    else if (prev && !o.replace && !prev.noHistory) S.hist.push(prev);
    show(step, o.silent);
  }
  function back(src) {
    if (!backAllowed(S.step)) return;
    src = input(src); count('back');
    log('Back' + via(src), src, 'back');
    var prev = S.hist.pop();
    leave();
    show(prev);
  }
  function refresh() { render(); }

  function welcomeStep(act) {
    var g = (Lab.opt.greet || '').trim(), T = Lab.t, hi = g ? T('Hello, {name}!', { name: g }) : T('Hello!');
    return {
      id: 'welcome', title: hi, pic: act.art ? act.art(API) : '', noStop: true, back: false, noHistory: true, airPointer: true,
      say: hi + ' ' + T('Shall we start?'),
      actions: [
        { label: T('Yes'), primary: true, gesture: 'open', words: ['yes', 'yeah', 'start', 'begin', 'sure', 'ok', 'okay', 'ready', 'lets start', 'take part', 'go'], noLabelWords: true,
          run: function () { log('Agrees to take part', 'app', 'consent'); S.rec.consent.takePart = 'yes'; afterYes(); } },
        { label: T('Not now'), gesture: 'fist', words: ['no', 'nope', 'not now', 'not today', 'later', 'no thanks', 'no thank you'], noLabelWords: true,
          run: function () { S.rec.consent.takePart = 'no'; S.rec.outcome = 'declined'; go(stoppedStep(), { clear: true }); } }
      ]
    };
  }
  /* 16 Nov (Rahma): a short practice of the gesture before every activity in pointing mode: one big button, chosen
     the way all the others will be (open hand to point, closed hand = OK). Touch works too. */
  var HAND_PIC = '<svg viewBox="0 0 360 160" width="360" height="160" aria-hidden="true" class="airpractice">' +
    '<g fill="none" stroke="#00519E" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M60 130 V78 M60 78 V30 M78 78 V24 M96 80 V30 M114 86 V46 M42 96 V64 M42 96 Q44 140 84 142 Q122 142 122 104 V86"/>' +
    '<path d="M168 80 H210 M198 68 L212 80 L198 92"/>' +
    '<path d="M250 70 Q250 52 268 52 H300 Q318 52 318 70 V112 Q318 138 290 140 H272 Q250 138 250 112 Z M262 70 H306 M262 86 H306"/></g></svg>';
  function practiceStep(act) {
    var T = Lab.t;
    return {
      id: 'air-practice', title: T('Point with an open hand. Close your hand to choose.'), noStop: true, back: false, noHistory: true, airPointer: true,
      pic: HAND_PIC, picCls: 'airpracticebox',
      say: T('Let us practise: point at the button with your open hand, then close your hand.'),
      actions: [{ label: T('Got it'), primary: true, gesture: 'open', words: ['ok', 'okay', 'yes', 'got it', 'understood'], noLabelWords: true,
        run: function () { log('Pointing practised', 'app', 'camera'); go(welcomeStep(act), { clear: true }); } }]
    };
  }
  function welcomeOrPractice(act) {
    return Lab.opt.camMode === 'air' && airConfirm() && airConfirmMode() === 'close' && S.camConsent === true && !act.noPractice && !heartMode() ? practiceStep(act) : welcomeStep(act);
  }
  /* The camera needs no question here: the care team gives consent before the session. */
  function afterYes() { moodThenStart(); }
  function startActivity() {
    var first = S.act.start(API);
    if (first) go(first, { clear: true });
  }

  /* ---------- how the participant feels, before and after ----------
     Three large faces. The answers go into the session record (mood.before, mood.after: 3 good,
     2 okay, 1 not so good) and the care team sees them per patient in Results. Skipping is fine. */
  var MOODS = [
    { v: 3, label: 'Good', icon: function () { return ART.icon.yes; }, words: ['good', 'fine', 'great', 'well', 'happy'] },
    { v: 2, label: 'Okay', icon: function () { return ART.icon.maybe; }, words: ['okay', 'ok', 'so so', 'alright'] },
    { v: 1, label: 'Not so good', icon: function () { return ART.icon.no; }, words: ['not good', 'bad', 'sad', 'tired', 'not so good'] }
  ];
  /* 1.15 (user, 10 Nov): the "How are you?" screens are removed; mood is no longer asked. */
  function moodOn() { return false; }
  function moodStep(when, next) {
    var T = Lab.t, before = when === 'before';
    var q = before ? T('How are you?') : T('And how are you feeling now?');
    function pick(m) {
      return function () {
        S.rec.mood[when] = m.v;
        log('Mood ' + when + ': ' + m.label, 'app', 'mood');
        var reply = m.v === 3 ? T('That is lovely to hear.') : T('Thank you for telling me.');
        say(reply, next);
      };
    }
    return {
      id: 'mood-' + when, cls: 'moodstep', title: q, back: false, noStop: !before, noHistory: true, airPointer: true,
      say: q,
      choices: MOODS.map(function (m) { return { label: T(m.label), icon: m.icon(), words: m.words, run: pick(m) }; })
    };
  }
  function moodThenStart() {
    if (moodOn()) go(moodStep('before', startActivity), { replace: true });
    else startActivity();
  }

  /* Camera consent is given by the care team before the session (Session tab, "How they answer"
     and "Movement camera"), so the patient is never asked on the screen. Activities still call
     L.consent(...): it records the care team's consent and goes straight on (no step to show). */
  function staffConsent(o, done) {
    S.rec.consent[o.key] = 'care team';
    log('Camera consent (' + o.key + '): given by the care team', 'app', 'consent');
    done(true);
    return null;
  }

  /* The first screen when the care team hands a session over: Bellatrix's face and one Begin
     button, which can be touched or pointed at (the camera is already on in pointing mode). */
  function readyStep(act) {
    var T = Lab.t;
    return {
      id: 'ready', title: T('Ready when you are.'), noStop: true, back: false, noHistory: true, airPointer: true,
      pic: Lab.logoHtml(), picCls: 'facebox',
      say: T('Ready when you are.'),
      actions: [{ label: T('Begin'), primary: true, gesture: 'open', words: ['begin', 'start', 'yes', 'ready', 'ok', 'okay', 'go'], noLabelWords: true,
        run: function () { fullScreen(); Music.unlock(); log('Begin', 'app', 'start'); go(welcomeOrPractice(S.act), { clear: true }); } }]
    };
  }
  function finish() {
    if (!S.on) return;
    S.rec.outcome = 'completed';
    log('Activity completed', 'app', 'end');
    /* act.noAgain: no "again another time?" question (a family call). */
    var after = function () { go(S.act.noAgain ? endStep() : againStep(), { clear: true }); };
    if (moodOn()) go(moodStep('after', after), { clear: true });
    else after();
  }
  function againStep() {
    var T = Lab.t, q = T(S.act.againQuestion || 'Would you like to do this again another time?');
    function pick(v) { return function () { S.rec.again = v; go(endStep(), { clear: true }); }; }
    return {
      id: 'again', cls: 'moodstep', title: q, back: false, noStop: true, noHistory: true, airPointer: true,
      say: q,
      choices: [
        { label: T('Yes'), icon: ART.icon.yes, words: ['yes', 'yeah', 'sure', 'definitely', 'again'], run: pick('Yes') },
        { label: T('Maybe'), icon: ART.icon.maybe, words: ['maybe', 'perhaps', 'not sure', 'dont know'], run: pick('Maybe') },
        { label: T('No'), icon: ART.icon.no, words: ['no', 'nope', 'not really', 'no thanks'], run: pick('No') }
      ]
    };
  }
  function endStep() {
    var g = (Lab.opt.greet || '').trim(), T = Lab.t;
    /* 1.16: unread family messages are offered once, at the closing step (js/messages.js: Lab.surprise). */
    if (Lab.surprise && S.rec && !S.rec.surprised) { var sx = null; try { sx = Lab.surprise(S.act, S.rec); } catch (e) { sx = null; } if (sx) { S.rec.surprised = true; return sx; } }
    return {
      id: 'end', final: true, center: true, title: g ? T('Thank you, {name}!', { name: g }) : T('Thank you!'),
      say: (g ? T('Thank you, {name}.', { name: g }) : T('Thank you.')) + ' ' + T('Have a lovely day.'),
      actions: [{ label: T('Finish'), primary: true, noLabelWords: true, run: function () { endSession(); } }]
    };
  }
  function stoppedStep() {
    var T = Lab.t;
    return {
      id: 'stopped', final: true, center: true, title: T('That’s fine, no problem.'),
      say: T('That’s fine, no problem.'),
      actions: [{ label: T('Finish'), primary: true, noLabelWords: true, run: function () { endSession(); } }]
    };
  }
  function stopSession(src) {
    if (!S.on || (S.step && (S.step.final || S.step.noStop))) return;
    src = input(src); count('stop');
    log('Stop' + via(src), src, 'stop');
    S.rec.outcome = 'stopped';
    go(stoppedStep(), { clear: true });
  }

  /* On the robot's screen (opened by "Deploy to robot" with ?robot=1, or any touch screen) a
     session runs full screen and keeps the screen from going dark. */
  /* Inside the robot app (Android): pages use the whole screen. */
  if (window.BellatrixApp) document.documentElement.classList.add('inapp');
  var robotMode = /[?&]robot=1\b/.test(location.search) || !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  var wake = null;
  function keepAwake() {
    if (!robotMode || wake || !navigator.wakeLock) return;
    navigator.wakeLock.request('screen').then(function (w) { wake = w; w.addEventListener('release', function () { wake = null; }); }).catch(function () { /* not allowed here */ });
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') keepAwake(); });
  function fullScreen() {
    var d = document.documentElement;
    if (robotMode && d.requestFullscreen && !document.fullscreenElement) d.requestFullscreen().catch(function () { /* the browser said no */ });
  }

  function start(key, o) {
    o = o || {};
    var act = Lab.byKey[key];
    if (!act) throw new Error('Unknown activity ' + key);
    fullScreen(); keepAwake(); prepareVoice();
    Music.unlock(); Music.setVolume(Lab.opt.volume);
    S.act = act; S.on = true; S.hist = []; S.step = null; S.help = false; S.staffTapping = false;
    S.camConsent = null; S.moveConsent = null; S.callConsent = null;
    cam.failed = {};
    S.rec = newRecord(act, o.preview); S.t0 = Date.now();
    S.rec.settings.lang = Lab.lang(); S.rec.settings.mood = Lab.opt.mood !== false;
    S.rec.mood = { before: null, after: null };
    /* The care team gives the camera consent when it chooses hand signs or pointing: the camera
       starts with the first screen, so even Begin and "Yes" can be pointed at from a distance. */
    /* 16 Nov (Rahma): pointing in every activity. noHandSigns (Seated Move Along) only keeps hand SIGNS away
       (arm movements must not be read as signs); pointing works there too, on every screen without the
       body camera (steps with `pose` keep the camera for the movements, as before). */
    if (signsMode() && (!act.noHandSigns || Lab.opt.camMode === 'air')) { S.camConsent = true; S.rec.consent.hands = 'care team'; }
    $('plog').innerHTML = '';
    $('staffTap').textContent = 'Staff is tapping: off';
    if ($('setup')) $('setup').hidden = true;
    $('app').hidden = false;
    $('pinfo').textContent = act.name + ' · ' + S.rec.participant + ' · voice ' + (listening() ? 'on' : 'off') + ' · camera ' + Lab.opt.camMode + (o.preview ? ' · PREVIEW, not saved' : '');
    $('chipPreview').hidden = !o.preview;
    $('chipPreview').textContent = Lab.t('Preview');
    if ($('camText')) $('camText').textContent = Lab.t('Camera on · not recorded');
    $('chipMic').hidden = true; $('chipHeard').hidden = true; $('caption').hidden = true;
    stage.classList.toggle('big', Lab.opt.textSize === 'large');
    stage.classList.add('insession');
    fit();
    log('Session start: ' + act.name + ', participant ' + S.rec.participant + ', zone ' + S.rec.zone + ', language ' + Lab.lang() + ', voice ' + (listening() ? 'on' : 'off') + ', camera ' + Lab.opt.camMode + (o.preview ? ', preview' : ''), 'app', 'start');
    /* Something that must start at once (an incoming family call) skips Begin, the welcome and the
       first mood question: Lab.start(key, { direct: true, data: {...} }). The activity reads
       Lab.startData. */
    Lab.startData = o.data || null;
    if (o.direct) startActivity();
    else go(o.ready ? readyStep(act) : welcomeOrPractice(act), { clear: true });
  }
  function endSession(reason) {
    if (!S.on) return;
    if (reason) { S.rec.outcome = reason; log('Session ended by staff', 'staff', 'end'); }
    /* Ended on the Begin screen: the patient never started, nothing to report. */
    if (S.step && S.step.id === 'ready') S.rec.notStarted = true;
    leave();
    S.on = false;
    quiet(); stopRec(); Music.stop(); stopCam(); nhStop(); airHide();
    stage.classList.remove('insession');
    stage.classList.remove('thinking');
    $('chipPreview').hidden = true;
    S.rec.endedAt = new Date().toISOString();
    S.rec.durationS = Math.round((Date.now() - S.t0) / 1000);
    $('staffpanel').hidden = true;
    if ($('setup')) $('app').hidden = true;
    var rec = S.rec;
    S.step = null;
    Lab.lastEndAt = Date.now();   /* js/callreq-patient.js: "Call my family" only just after an activity */
    if (Lab.onSessionEnd) Lab.onSessionEnd(rec);
    idleStart();
  }

  /* ---------- staff panel, keys, taps ---------- */
  var cornerTaps = [];
  function toast(t) {
    var el = $('toast');
    el.textContent = t; el.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { el.hidden = true; }, 2600);
  }
  function togglePanel() { try { if (localStorage.getItem('bellatrix-link-code') && !localStorage.getItem('bellatrix-staff-panel-ok')) return; } catch (e) { /* no storage: normal panel */ } var p = $('staffpanel'); p.hidden = !p.hidden; updateCounts(); }
  function stagePoint(e) {
    var r = stage.getBoundingClientRect(), s = r.width / stageW();
    return { x: Math.round((e.clientX - r.left) / s), y: Math.round((e.clientY - r.top) / s) };
  }
  function onPointerDown(e) {
    if (!S.on) return;
    var p = stagePoint(e);
    if (p.x < CORNER_PX && p.y < CORNER_PX) {
      var now = Date.now();
      cornerTaps = cornerTaps.filter(function (t) { return now - t < 2000; });
      cornerTaps.push(now);
      if (cornerTaps.length >= 3) { cornerTaps = []; togglePanel(); }
      return;
    }
    var b = e.target.closest('button');
    var onTarget = b && !b.disabled && !b.classList.contains('off');
    if (onTarget) S.rec.taps.hit++;
    else { S.rec.taps.miss++; log('Tap missed every button at ' + p.x + ', ' + p.y, S.staffTapping ? 'staff' : 'touch', 'miss', { x: p.x, y: p.y }); }
    updateCounts();
  }
  function onClick(e) {
    var b = e.target.closest('[data-a]');
    if (!b || !S.on) return;
    dispatch(b.getAttribute('data-a'), parseInt(b.getAttribute('data-i'), 10), 'touch');
  }
  function onKey(e) {
    if (!S.on || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    var k = e.key, st = S.step;
    if (k === 'l' || k === 'L') { togglePanel(); return; }
    if (k === 'a' || k === 'A') { markAttempt(); return; }
    if (k === 'Escape') { if (window.confirm('End this session now?')) endSession('ended by staff'); return; }
    if (!st) return;
    if (S.help) { if (k === 'Enter' || k === 'Escape') closeHelp('key'); return; }
    if (/^[1-9]$/.test(k)) { e.preventDefault(); choose(parseInt(k, 10) - 1, 'key'); return; }
    if (k === 'Enter') {
      var acts = st.actions || [];
      for (var i = 0; i < acts.length; i++) if (acts[i].primary) { e.preventDefault(); doAction(i, 'key'); return; }
      return;
    }
    if (k === 'Backspace') { e.preventDefault(); back('key'); return; }
    if (k === 'h' || k === 'H') { openHelp('key'); return; }
    if (k === 's' || k === 'S') { stopSession('key'); return; }
  }
  /* The robot's front screen stands upright (1080 x 1920); its head screen lies wide (1920 x 1080).
     On a wide screen the stage turns wide too, and arrange() splits each step into two columns. */
  function isLand() { return window.innerWidth > window.innerHeight * 1.1; }
  function stageW() { return stage && stage.classList.contains('land') ? 1920 : 1080; }
  function stageH() { return stage && stage.classList.contains('land') ? 1080 : 1920; }
  function fit() {
    var was = stage.classList.contains('land'), land = isLand();
    stage.classList.toggle('land', land);
    var s = Math.min(window.innerWidth / stageW(), window.innerHeight / stageH());
    $('fit').style.width = (stageW() * s) + 'px';
    $('fit').style.height = (stageH() * s) + 'px';
    stage.style.transform = 'scale(' + s + ')';
    if (was !== land && S.on) render();
  }
  /* Wide screen: words and buttons on the left, the picture (or the answers) on the right, the
     Back / Help / Stop row along the bottom. Nodes are moved, not copied, so their handlers stay. */
  var VISUAL = '.picture, .cards, .grid6, .board8, .figure, .sayingcard, .plan, .np, .callgrid, .call, .bigicon, .calib';
  function arrange(el) {
    if (!el || !stage || !stage.classList.contains('land')) return;
    var kids = Array.prototype.slice.call(el.children);
    if (!kids.length || el.querySelector(':scope > .center')) { el.classList.add('single'); return; }
    var right = kids.filter(function (k) { return k.matches(VISUAL); });
    if (!right.length) right = kids.filter(function (k) { return k.matches('.opts'); });
    if (!right.length) { el.classList.add('single'); return; }
    var cols = document.createElement('div'), l = document.createElement('div'), r = document.createElement('div');
    cols.className = 'cols'; l.className = 'lcol'; r.className = 'rcol';
    kids.forEach(function (k) {
      if (k.matches('.foot, .overlay')) return;
      (right.indexOf(k) >= 0 ? r : l).appendChild(k);
    });
    cols.appendChild(l); cols.appendChild(r);
    el.insertBefore(cols, el.firstChild);
    el.classList.add('split');
    el.classList.remove('nofill');
  }

  /* ---------- what an activity can use ---------- */
  function mediaQuery(slot, type) { return { patient: Lab.patient, activity: S.act ? S.act.key : '', slot: slot, type: type }; }
  var API = {
    t: function (s, vars) { return Lab.t(s, vars); },
    lang: function () { return Lab.lang(); },
    go: function (step, o) { go(step, o); },
    finish: finish,
    stop: function () { stopSession('app'); },
    refresh: refresh,
    say: say,
    quiet: quiet,
    log: function (msg, kind, extra) { log(msg, 'app', kind || 'app', extra); },
    stat: function (k, v) { if (!S.rec) return; S.rec.stats[k] = v === undefined ? (S.rec.stats[k] || 0) + 1 : v; },
    push: function (k, v) { if (!S.rec) return; (S.rec.stats[k] = S.rec.stats[k] || []).push(v); },
    text: function (id) { return Lab.contentValue(S.act, id); },
    lines: function (id) { return Lab.contentValue(S.act, id).split('\n').map(function (l) { return l.trim(); }).filter(Boolean); },
    /* The patient's own picture for a slot, or the given default drawing. */
    image: function (slot, fallback) {
      var m = Media.first(mediaQuery(slot, 'image'));
      return m ? '<img class="own" src="' + m.url + '" alt="">' : (fallback || '');
    },
    hasImage: function (slot) { return !!Media.first(mediaQuery(slot, 'image')); },
    images: function (slot) { return Media.list(mediaQuery(slot, 'image')); },
    audios: function (slot) {
      return Media.list(mediaQuery(slot, 'audio')).filter(function (m) { return String(m.title || '').trim(); }).map(function (m) {
        return { id: m.id, title: m.title.trim(), kind: String(m.kind || '').trim(), decade: m.decade || '', clip: true, url: m.url };
      });
    },
    music: playMusic,
    stopMusic: stopMusic,
    ring: function (times, cb) {
      quiet(); stopRec();
      var st = S.step;
      Music.ring(times, function () { if (st === S.step && S.on) { resumeListening(); if (cb) cb(); } });
    },
    later: function (fn, ms) { var st = S.step; stepTimers.push(setTimeout(function () { if (st === S.step && S.on) fn(); }, ms)); },
    every: function (fn, ms) { var st = S.step; var t = setInterval(function () { if (st === S.step && S.on) fn(); else clearInterval(t); }, ms); stepTimers.push(t); },
    consent: staffConsent,
    setConsent: function (kind, v) { S[kind + 'Consent'] = v; },
    consentOf: function (kind) { return S[kind + 'Consent']; },
    camOn: function () { return !!cam.stream || nh.on; },
    syncCam: function () { syncCam(); render(); },
    camFailed: function () { return !!cam.failed.camera; },
    hands: function () { return handsHints(S.step); },
    air: function () { return airMode(S.step); },
    voice: function () { return !!(listening()); },
    step: function () { return S.step; },
    greet: function () { return (Lab.opt.greet || '').trim(); },
    ack: function (text) {
      var el = stage.querySelector('.ack');
      if (!el) return;
      el.textContent = text; el.classList.add('show');
      clearTimeout(API.ack.t); API.ack.t = setTimeout(function () { el.classList.remove('show'); }, 2200);
    },
    listOr: listOr, clean: clean, hasWord: hasWord, esc: esc
  };

  Lab.start = start;
  Lab.endSession = endSession;
  Lab.isOn = function () { return S.on; };
  Lab.toast = toast;
  Lab.robotMode = robotMode;
  Lab.fit = function () { if (stage) fit(); };
  Lab.arrange = arrange;
  /* Bellatrix's face: eyes that blink and look around, a mouth that moves while she speaks
     (the stage gets the class "talking"). Big on the waiting screen, small at the top in a session. */
  /* 16 Nov (Rahma): the care home's logo (Suavia) instead of the big face on the waiting and "Ready" screens. */
  Lab.logoHtml = function () { return '<img class="hlogo" src="img/suavia-logo.svg" alt="Suavia" draggable="false">'; };
  /* 16 Nov (Rahma): the care home's logo (Suavia) everywhere instead of the smiley; where it is small (the chip
     during a session, the head's top bar) the Suavia cross alone, the full logo where it is big. */
  Lab.faceHtml = function (cls) {
    var small = !cls || cls === 'mini';
    return '<img class="bface blogo' + (cls ? ' ' + cls : '') + (small ? ' blogo-mark' : '') + '" src="img/' + (small ? 'suavia-mark.svg' : 'suavia-logo.svg') +
      '" alt="" aria-hidden="true" draggable="false">';
  };
  Lab.talk = function (on) { talk(on); };
  Lab.stageW = function () { return stageW(); };
  Lab.keepAwake = keepAwake;
  Lab.speechSupported = function () { return !!SR; };
  Lab.ttsSupported = canSpeak;
  /* The patient's language (chosen by the care team) and the translation of a text into it. */
  Lab.lang = function () { return I18N.valid(Lab.opt.lang); };
  Lab.t = function (s, vars) { return I18N.t(Lab.lang(), s, vars); };
  Lab.contentValue = function (act, id) {
    var c = Lab.content[act.key] || {};
    if (c[id] !== undefined && String(c[id]).trim()) return String(c[id]);
    var f = (act.content || []).filter(function (x) { return x.id === id; })[0];
    var v = f ? I18N.pick(Lab.lang(), f.value) : '';
    return v === undefined || v === null ? '' : String(v);
  };
  /* For tests in the browser console and for the automated check. */
  Lab._t = { clean: clean, matchItems: matchItems, handleSpeech: handleSpeech, classify: classify, gestureTarget: gestureTarget, feed: feed, airFrame: airFrame, airMode: airMode,
    POSE_TEST: POSE_TEST, poseFrame: poseFrame, resetPose: resetPose, state: S, chunks: chunks, choose: choose, doAction: doAction, markAttempt: markAttempt, api: API };

  document.addEventListener('DOMContentLoaded', function () {
    stage = $('stage'); screenEl = $('screen'); video = $('cam');
    if ($('faceMini')) $('faceMini').innerHTML = Lab.faceHtml('mini');
    /* The care-team app has no participant screen: it only uses the activity definitions. */
    if (!stage) return;
    stage.addEventListener('pointerdown', onPointerDown, true);
    screenEl.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', fit);
    $('pAttempt').addEventListener('click', markAttempt);
    $('staffTap').addEventListener('click', function () {
      S.staffTapping = !S.staffTapping;
      this.textContent = 'Staff is tapping: ' + (S.staffTapping ? 'ON' : 'off');
      log('Staff tapping for the participant: ' + (S.staffTapping ? 'on' : 'off'), 'staff', 'staff');
    });
    $('pEnd').addEventListener('click', function () { if (window.confirm('End this session now?')) endSession('ended by staff'); });
    $('pHide').addEventListener('click', togglePanel);
    window.addEventListener('error', function (e) { log('App error: ' + e.message, 'app', 'error'); });
    window.addEventListener('unhandledrejection', function (e) { log('App error: ' + (e.reason && e.reason.message ? e.reason.message : e.reason), 'app', 'error'); });
  });
})();
