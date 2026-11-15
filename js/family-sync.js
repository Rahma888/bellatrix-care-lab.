/* Family portal 1.16 (agent F2): the robot side of the resident's follow-up (BF-05, BF-06, BF-07).
   Loaded on patient.html only. It sends to the family portal server (labland/family-feed.mjs) what
   the family may see, with the robot's own credentials (FamilyMessages.request: robot id and key):
   - each finished session: activity, start, duration, outcome, game result, participation (did it
     to the end, "again?"). Never the session log, never a name, never a mood (Rahma, 10 Nov: no mood
     in the family portal);
   - each listening: music, podcasts, books and karaoke, with title, type, start and duration.
   Consent (BF-27): before sending, it asks the server for each resident's level and sends only the
   residents at 'all'; the others' items are dropped here, never kept. The server checks again.
   Offline: the items wait in a queue ('bellatrix-family-sync-queue', 14 days at most) and go later,
   with a growing pause after each failure.
   Never: in a demo or a preview, in "staff only" mode ('bellatrix-staff-only'), in a frame, on another
   page than patient.html, or from a file:// page.
   Listening events, two ways:
   1. the players say it themselves (preferred): FamilySync.listen({ type: 'music' | 'podcast' |
      'book' | 'karaoke', title, artist, start, durationS, code }) or the window event
      'bellatrix-listen' with the same detail;
   2. otherwise they are read from the finished session (Play: "Bellatrix Play: <artist – title>"
      lines, the end from the music engine's events; karaoke: '"<title>" starts'; reading: the books
      finished or named; podcasts: where the episode stopped).
   ES5 only (Android 9 WebView, Chrome 95). */
var FamilySync = (function () {
  'use strict';
  var QUEUE = 'bellatrix-family-sync-queue', SEEN = 'bellatrix-family-sync-seen', INBOX = 'bellatrix-care-lab-inbox', STAFF_ONLY = 'bellatrix-staff-only';
  var MAX_QUEUE = 400, MAX_AGE = 14 * 24 * 3600 * 1000, BATCH = 40, TYPES = ['music', 'podcast', 'book', 'karaoke'];
  var state = { lastSync: null, lastError: '', sent: 0, failures: 0, next: 0 };
  var explicit = [];   // { type, code, at } said by a player during this page's life

  function getJ(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v === null ? d : v; } catch (e) { return d; } }
  function putJ(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function norm(c) { return String(c == null ? '' : c).trim().toUpperCase(); }
  function ms(t) { var x = typeof t === 'number' ? t : Date.parse(t); return isFinite(x) ? x : NaN; }
  function iso(t) { return new Date(t).toISOString(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function localDay(t) { var d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } return h.toString(36); }

  /* ---------- where it may run ---------- */
  function topPatientPage() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    var top = true;
    try { top = window.top === window; } catch (e) { top = false; }
    return top && !window.BellatrixDemo && location.protocol !== 'file:' && /(^|\/)patient\.html$/.test(location.pathname) &&
      !!document.getElementById('stage') && !document.getElementById('setup');
  }
  function staffOnly() { var o = getJ(STAFF_ONLY, null); return !!(o && o.on); }
  function fm() { return typeof FamilyMessages !== 'undefined' ? FamilyMessages : (window.FamilyMessages || null); }
  function enabled() { return topPatientPage() && !staffOnly() && !!fm() && !!window.fetch; }

  /* ---------- a finished session -> what the family may see ---------- */
  var SKIP = { stdemo: 1, demo: 1 };
  function outcomeOf(o) { return o === 'completed' ? 'completed' : o === 'stopped' ? 'stopped' : 'partial'; }
  function n(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function resultOf(rec) {
    var s = rec.stats || {}, a = rec.activity, v;
    if (a === 'chess') {
      if (s.chessResult) {
        var r = String(s.chessResult);
        v = /patient won/i.test(r) ? 'win' : /bellatrix won/i.test(r) ? 'loss' : /draw/i.test(r) ? 'draw' : 'two-players';
        return { k: 'chess', v: v, n: n(s.chessMoves) };
      }
      if (s.chessPuzzlesTried) return { k: 'puzzles', n: n(s.chessPuzzlesSolved), of: n(s.chessPuzzlesTried) };
      return null;
    }
    if (a === 'ludo') {
      if (!s.ludoWinner) return null;
      var w = String(s.ludoWinner);
      v = /^a player here/i.test(w) ? 'win' : /^none/i.test(w) ? 'none' : 'loss';
      return { k: 'ludo', v: v, n: n(s.ludoPlayers) };
    }
    if (a === 'pairs') { var lv = n(s.levelReached) || n(s.roundsDone); return lv ? { k: 'pairs', n: lv } : null; }
    if (a === 'sayings') { var ok = n(s.rightFirstTry) + n(s.rightAfterRetry); return ok ? { k: 'sayings', n: ok } : null; }
    if (a === 'song') return s.songsRight !== undefined ? { k: 'songs', n: n(s.songsRight) } : null;
    if (a === 'move') {
      var reps = 0;
      (Object.prototype.toString.call(s.moves) === '[object Array]' ? s.moves : []).forEach(function (m) { if (m && m.counted !== 'skipped') reps += n(m.reps); });
      return reps ? { k: 'reps', n: reps } : null;
    }
    if (a === 'karaoke') { var sung = n(s['Karaoke: songs sung to the end']); return sung ? { k: 'karaoke', n: sung } : null; }
    if (a === 'album') return s.albumPictures ? { k: 'pictures', n: n(s.albumPictures) } : null;
    if (a === 'reading') return s.readingPages ? { k: 'pages', n: n(s.readingPages) } : null;
    if (a === 'play') return s.playItems ? { k: 'play', n: n(s.playItems) } : null;
    if (a === 'familycall') return { k: 'call', n: Math.max(1, Math.round(n(s.callSeconds) / 60)) };
    if (a === 'messages') return s.messagesShown ? { k: 'messages', n: n(s.messagesShown) } : null;
    return null;
  }
  function partOf(rec) {
    var c = rec.counts || {}, p = {};
    var again = String(rec.again || '').toLowerCase();
    if (again === 'yes' || again === 'maybe' || again === 'no') p.again = again;
    p.acts = n(c.touch) + n(c.voice) + n(c.hand) + n(c.air) + n(c.key);
    if (n(c.help)) p.help = n(c.help);
    return p;
  }
  function isDemo(rec) {
    if (SKIP[rec.activity] || /demo/i.test(String(rec.zone || ''))) return true;
    return (rec.events || []).some(function (e) { return e && /\bdemo\b/i.test(String(e.msg || '')) && /^karaoke demo|demo mode/i.test(String(e.msg || '')); });
  }

  /* ---------- listening read from a finished session ---------- */
  function catalogIndex() {
    var c = typeof PLAY_CATALOG !== 'undefined' ? PLAY_CATALOG : (typeof window !== 'undefined' ? window.PLAY_CATALOG : null), out = {};
    ((c && c.items) || []).forEach(function (it) { if (it && it.title) out[(it.artist ? it.artist + ' – ' : '') + it.title] = it; });
    return out;
  }
  /* Play's other lines (radio, DJ, lyrics, lists, downloads, listening together…): never a song. */
  var META = /^Bellatrix Play: (radio|DJ|lyrics|next|AI playlist|weekly|monthly|"not this song"|Premium|no internet|podcast|playlist|a Bellatrix message|a downloaded|all downloaded|downloading|listening together|shuffle|the family)/i;
  /* "Bellatrix Play: podcast <show>: <episode>" (js/play.js, 1.16), when an episode starts */
  var PODCAST = /^Bellatrix Play: podcast (?!list\b|episode\b|download)(.+?)( \(downloaded\))?$/;
  function recoEvents(code) {
    var all = getJ('bellatrix-reco-events', {}) || {};
    return (all[code] || []).filter(function (e) { return e && (e.event === 'complete' || e.event === 'skip' || e.event === 'stop'); });
  }
  function typeSaid(type, code, from, to) {
    return explicit.some(function (x) { return x.type === type && x.code === norm(code) && x.at >= from - 60000 && x.at <= to + 60000; });
  }
  function listensOf(rec) {
    var code = rec.participant, t0 = ms(rec.startedAt), t1 = ms(rec.endedAt);
    if (!isFinite(t0) || !isFinite(t1)) return [];
    var ev = (rec.events || []).filter(function (e) { return e && e.t; }), out = [];
    function add(type, title, artist, a, b, key) {
      if (!title || !isFinite(a)) return;
      b = isFinite(b) ? Math.min(Math.max(b, a), t1) : t1;
      var dur = Math.round((b - a) / 1000);
      if (dur < 5) return;
      out.push({ cid: rec.id + ':' + type.charAt(0) + key, code: code, kind: 'listen', type: type, title: String(title).slice(0, 120), artist: artist ? String(artist).slice(0, 80) : '',
        start: iso(a), end: iso(b), dur: dur, day: localDay(a), activity: rec.activity });
    }
    var podLines = 0;
    if (rec.activity === 'play') {
      var idx = catalogIndex(), starts = [], musicSaid = typeSaid('music', code, t0, t1), podSaid = typeSaid('podcast', code, t0, t1);
      ev.forEach(function (e) {
        var msg = String(e.msg || ''), m = /^Bellatrix Play: (.+)$/.exec(msg);
        if (!m || e.kind !== 'result') return;
        var pm = PODCAST.exec(msg);
        if (pm) {
          podLines++;
          var at2 = pm[1].indexOf(': ');
          /* a podcast ends the song before it, even when the players said the songs themselves */
          starts.push({ at: ms(e.t), title: at2 > 0 ? pm[1].slice(at2 + 2) : pm[1], artist: at2 > 0 ? pm[1].slice(0, at2) : '', id: '', type: 'podcast', skip: podSaid });
          return;
        }
        if (META.test(msg)) return;
        var label = m[1].replace(/ \(\d{4}\)$/, ''), it = idx[label] || null;
        var parts = label.split(' – ');
        /* not in the catalogue: only an "artist – title" line is taken as a song */
        if (!it && parts.length < 2) return;
        var title = it ? it.title : parts.slice(1).join(' – '), artist = it ? (it.artist || '') : parts[0];
        starts.push({ at: ms(e.t), title: title, artist: artist, id: it ? it.id : '', type: it && it.kind === 'podcast' ? 'podcast' : 'music', skip: musicSaid });
      });
      var reco = recoEvents(code);
      starts.forEach(function (s, i) {
        var next = i + 1 < starts.length ? starts[i + 1].at : t1, end = next;
        /* the music engine's own "complete / skip / stop" for this song, when it kept one */
        reco.forEach(function (r) { var at = ms(r.timestamp); if (s.id && r.songId === s.id && at > s.at && at <= next + 2000 && at < end) end = at; });
        if (!s.skip) add(s.type, s.title, s.artist, s.at, end, i);
      });
    }
    if (rec.activity === 'karaoke' && !typeSaid('karaoke', code, t0, t1)) {
      var ks = [];
      ev.forEach(function (e) {
        var msg = String(e.msg || ''), m = /^Karaoke: "(.+)" starts/.exec(msg);
        if (m) { ks.push({ at: ms(e.t), title: m[1], end: NaN }); return; }
        var last = ks[ks.length - 1];
        if (last && !isFinite(last.end) && (/^Karaoke: ".+" sung to the end/.test(msg) || /^Karaoke: (Stop|next song|another one)/.test(msg))) last.end = ms(e.t);
      });
      ks.forEach(function (k, i) { add('karaoke', k.title, '', k.at, isFinite(k.end) ? k.end : (i + 1 < ks.length ? ks[i + 1].at : t1), i); });
    }
    if (rec.activity === 'reading' && !typeSaid('book', code, t0, t1)) {
      var data = typeof READING_DATA !== 'undefined' ? READING_DATA : (typeof window !== 'undefined' ? window.READING_DATA : null);
      var stories = (data && data.stories) || [], done = (rec.stats && rec.stats.readingFinished) || [], book = null, at = t0;
      if (done.length) book = stories.filter(function (s) { return s.id === done[0]; })[0] || null;
      if (!book) ev.forEach(function (e) {
        if (book || e.kind !== 'say') return;
        var said = String(e.msg || '');
        var hit = stories.filter(function (s) { return s.title && said.indexOf(s.title) >= 0; })[0];
        if (hit) { book = hit; at = ms(e.t); }
      });
      if (book) add('book', book.title, book.author || '', at, t1, 0);
    }
    /* older Play (no podcast lines): where the episode stopped, kept with the music consent */
    if (rec.activity === 'play' && !podLines && !typeSaid('podcast', code, t0, t1)) {
      var prog = (getJ('bellatrix-podcast-progress', {}) || {})[norm(code)] || (getJ('bellatrix-podcast-progress', {}) || {})[code] || {};
      var feeds = getJ('bellatrix-podcast-feeds', {}) || {}, dl = getJ('bellatrix-podcast-downloads', {}) || {}, k = 0;
      Object.keys(prog).forEach(function (id) {
        var p = prog[id], last = ms(p && p.at);
        if (!isFinite(last) || last < t0 || last > t1 + 60000) return;
        var title = dl[id] && dl[id].title, show = '';
        if (!title) Object.keys(feeds).forEach(function (sid) { (feeds[sid].episodes || []).forEach(function (e) { if (e && e.id === id) { title = e.title; show = feeds[sid].title || ''; } }); });
        var heard = Math.min(n(p.t) * 1000, last - t0);
        add('podcast', title || id, show, last - heard, last, k++);
      });
    }
    return out;
  }

  function fromRecord(rec) {
    if (!rec || typeof rec !== 'object' || rec.preview || rec.notStarted || !rec.activity || !rec.participant || rec.participant === 'P?') return [];
    if (isDemo(rec)) return [];
    var t0 = ms(rec.startedAt), t1 = ms(rec.endedAt);
    if (!isFinite(t0)) return [];
    if (!isFinite(t1)) t1 = t0 + n(rec.durationS) * 1000;
    var s = rec.stats || {};
    if (rec.activity === 'familycall' && !s.callAnswered) return [];
    var item = { cid: String(rec.id || ('S' + t0.toString(36))), code: rec.participant, kind: 'session', activity: String(rec.activity).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24),
      start: iso(t0), end: iso(t1), dur: Math.max(0, Math.round(n(rec.durationS) || (t1 - t0) / 1000)), day: rec.date || localDay(t0), outcome: outcomeOf(rec.outcome) };
    var r = resultOf(rec); if (r) item.result = r;
    item.part = partOf(rec);
    var marks = [];
    if (s.birthday) marks.push('birthday');
    if (s.readingFinished && s.readingFinished.length) marks.push('book-end');
    if (marks.length) item.marks = marks;
    return [item].concat(listensOf(rec));
  }

  /* ---------- the queue ---------- */
  function queue() { var q = getJ(QUEUE, []); return Object.prototype.toString.call(q) === '[object Array]' ? q : []; }
  function saveQueue(q) {
    var t = Date.now();
    q = q.filter(function (x) { return x && t - ms(x.start) < MAX_AGE; });
    if (q.length > MAX_QUEUE) q = q.slice(q.length - MAX_QUEUE);
    putJ(QUEUE, q);
    return q;
  }
  function enqueue(items) {
    if (!items || !items.length) return 0;
    var q = queue(), have = {};
    q.forEach(function (x) { have[x.cid] = 1; });
    var added = 0;
    items.forEach(function (x) { if (x && !have[x.cid]) { q.push(x); have[x.cid] = 1; added++; } });
    saveQueue(q);
    return added;
  }
  function seen() { var s = getJ(SEEN, {}); return s && typeof s === 'object' ? s : {}; }
  function markSeen(id) {
    var s = seen(), t = Date.now();
    s[id] = t;
    Object.keys(s).forEach(function (k) { if (t - s[k] > MAX_AGE) delete s[k]; });
    putJ(SEEN, s);
  }
  /* A finished session (Lab.onSessionEnd, or found in the inbox): once only. */
  function capture(rec) {
    if (!rec || !rec.id || !topPatientPage()) return 0;
    if (seen()[rec.id]) return 0;
    markSeen(rec.id);
    /* a session during "staff only" is the team's own: never sent, not even later */
    if (staffOnly()) return 0;
    var items = fromRecord(rec);
    return enqueue(items);
  }
  function scanInbox() {
    var inbox = getJ(INBOX, []);
    if (Object.prototype.toString.call(inbox) !== '[object Array]') return;
    inbox.forEach(function (r) { if (r && r.endedAt && Date.now() - ms(r.endedAt) < MAX_AGE) capture(r); });
  }

  /* ---------- a player says what was heard ---------- */
  function listen(d) {
    if (!d || typeof d !== 'object' || TYPES.indexOf(d.type) < 0 || !d.title || !topPatientPage() || staffOnly()) return false;
    var code = d.code || (window.Lab && Lab.patient) || '';
    if (!code || d.preview) return false;
    var a = ms(d.start), dur = Math.round(n(d.durationS !== undefined ? d.durationS : d.dur));
    if (!isFinite(a)) a = Date.now() - dur * 1000;
    if (!(dur >= 5)) return false;
    explicit.push({ type: d.type, code: norm(code), at: a });
    if (explicit.length > 200) explicit.shift();
    var title = String(d.title).slice(0, 120);
    enqueue([{ cid: 'L' + hash(norm(code) + '|' + d.type + '|' + title + '|' + a), code: code, kind: 'listen', type: d.type, title: title, artist: d.artist ? String(d.artist).slice(0, 80) : '',
      start: iso(a), end: iso(a + dur * 1000), dur: dur, day: localDay(a), activity: d.activity || '' }]);
    later(4000);
    return true;
  }

  /* ---------- sending ---------- */
  var flushing = null, timer = null;
  function later(wait) { clearTimeout(timer); timer = setTimeout(function () { flush().catch(function () { /* again later */ }); }, wait); }
  function flush() {
    if (!enabled()) return Promise.resolve({ skipped: true });
    if (flushing) return flushing;
    var q = queue();
    if (!q.length) return Promise.resolve({ sent: 0 });
    var F = fm();
    flushing = F.request('GET', 'feed/robot/consent').then(function (c) {
      var lv = {};
      (c.residents || []).forEach(function (r) { lv[norm(r.code)] = r.consent; });
      /* Only the residents at 'all' (BF-27): the others' items are not sent and not kept. */
      var send = q.filter(function (x) { return lv[norm(x.code)] === 'all'; });
      var gone = {};
      q.forEach(function (x) { if (lv[norm(x.code)] !== 'all') gone[x.cid] = 1; });
      function drop(ids) { var left = queue().filter(function (x) { return !ids[x.cid]; }); saveQueue(left); }
      if (Object.keys(gone).length) drop(gone);
      var sent = 0;
      function step(i) {
        if (i >= send.length) return Promise.resolve();
        var batch = send.slice(i, i + BATCH);
        return F.request('POST', 'feed/robot/upload', { items: batch }).then(function (r) {
          var done = {};
          (r.accepted || []).forEach(function (cid) { done[cid] = 1; sent++; });
          (r.refused || []).forEach(function (x) { if (x && x.cid) done[x.cid] = 1; });
          drop(done);
          return step(i + BATCH);
        });
      }
      return step(0).then(function () { return sent; });
    }).then(function (sent) {
      flushing = null; state.lastSync = new Date().toISOString(); state.lastError = ''; state.failures = 0; state.sent += sent;
      return { sent: sent };
    }, function (e) {
      flushing = null; state.failures++; state.lastError = String(e && (e.code || e.message) || e);
      throw e;
    });
    return flushing;
  }
  function tick() {
    if (!enabled()) return;
    scanInbox();
    var t = Date.now();
    if (t < state.next) return;
    flush().catch(function () {
      /* offline or the server is away: 1, 2, 4 … up to 15 minutes */
      state.next = Date.now() + Math.min(15, Math.pow(2, Math.max(0, state.failures - 1))) * 60000;
    });
  }

  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    window.addEventListener('bellatrix-listen', function (e) { try { listen(e && e.detail); } catch (x) { /* never in the way */ } });
    document.addEventListener('DOMContentLoaded', function () {
      if (!topPatientPage()) return;
      /* After js/patient.js has set it: every finished session is also offered to the family. */
      if (window.Lab) {
        var before = Lab.onSessionEnd;
        Lab.onSessionEnd = function (rec) {
          try { if (capture(rec)) later(3000); } catch (e) { if (window.console) console.error(e); }
          if (typeof before === 'function') return before.apply(this, arguments);
        };
      }
      setTimeout(tick, 8000);
      setInterval(tick, 60000);
    });
  }

  return { fromRecord: fromRecord, listen: listen, capture: capture, flush: flush, queue: queue, enabled: enabled,
    status: function () { return { lastSync: state.lastSync, lastError: state.lastError, sent: state.sent, waiting: queue().length }; } };
})();
if (typeof module === 'object' && module.exports) module.exports = FamilySync;
