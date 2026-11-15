/* Music recommendation engine for Bellatrix Play (briefing b1, block C).
   Simple, local and explainable: every song of the catalogue becomes a small vector of labels
   (soft decade, language, style, the calm / dance tags, artist), a resident becomes a weighted
   average of the songs they listened to (recent listening counts more), and candidates are
   compared with cosine similarity and ranked with a combined score, then kept varied (MMR).
   No deep learning, no outside service, nothing leaves the robot.

   The engine only chooses songs. It draws no conclusion about a person (health, mood, memory,
   personality) and has no such label, not even internally.

   Two layers:
   - pure functions (songs, vectors, profile, next songs, playlists, phrase parser), testable in
     node: `require('./js/reco.js')` (see tests/reco.test.mjs);
   - Reco.store(storage, config, catalogueItems): the data on this device (consent, listening
     events, starting profiles, exclusions, playlists and their log, access log, retention, the
     weekly and monthly job). In the app: Reco.shared() on window.localStorage.
   ES5 only (Android 9 WebView, Chrome 95). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./reco-config.js'));
  else root.Reco = factory(root.RecoConfig);
}(typeof self !== 'undefined' ? self : this, function (DEFAULTS) {
  'use strict';
  var DAY = 86400000, HOUR = 3600000;
  var EVENTS = ['complete', 'replay', 'like', 'skip', 'stop'];
  var AMBIANCE = ['calm', 'dance'], CONTENT = ['nature', 'animals', 'concert'];
  /* Liveliness of a style, used ONLY to order a playlist (gentle opening, livelier middle, calm
     end). The catalogue has no tempo: the tags calm and dance decide first, the style otherwise. */
  var STYLE_LIFE = { chanson: 0.4, schlager: 0.6, volksmusik: 0.55, pop: 0.55, rock: 0.75, jazz: 0.45, swing: 0.65, classical: 0.25, waltz: 0.45,
    nature: 0.1, rap: 0.7, electro: 0.8, rnb: 0.55, latin: 0.75, reggae: 0.55, disco: 0.85, film: 0.4, kids: 0.5, country: 0.5 };
  var LANG_NAMES = { fr: 'French', de: 'German', en: 'English', es: 'Spanish', it: 'Italian', none: 'Instrumental' };
  var GENRE_NAMES = { chanson: 'French chanson', schlager: 'Schlager', volksmusik: 'Folk music', pop: 'Pop', rock: 'Rock', jazz: 'Jazz', swing: 'Swing',
    classical: 'Classical music', waltz: 'Waltzes', nature: 'Nature', rap: 'Rap and hip-hop', electro: 'Electronic music', rnb: 'R&B and soul',
    latin: 'Latin music', reggae: 'Reggae', disco: 'Disco', film: 'Film music', kids: 'Children’s songs', country: 'Country' };
  var KNOWN_GENRES = Object.keys(GENRE_NAMES);

  /* ---------- small helpers ---------- */
  function cfgOf(c) { return c || DEFAULTS; }
  function isArr(a) { return Object.prototype.toString.call(a) === '[object Array]'; }
  function norm(s) {
    s = String(s || '').toLowerCase();
    if (s.normalize) s = s.normalize('NFD');
    return s.replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function fnv(s) {
    var h = 0x811c9dc5;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  /* A fixed number in [0, 1) per (seed, song): ties are broken the same way every time. */
  function tie(seed, id) { return fnv(seed + '|' + id) / 4294967296; }
  function toMs(t) { if (typeof t === 'number') return t; var x = Date.parse(t); return isNaN(x) ? 0 : x; }
  function iso(ms) { return new Date(ms).toISOString(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function round(x, n) { var p = Math.pow(10, n || 3); return Math.round(x * p) / p; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  var seq = 0;

  /* ---------- sparse vectors ---------- */
  function dot(a, b) {
    if (!a || !b) return 0;
    var ka = Object.keys(a), kb = Object.keys(b), s = 0, t, i, k;
    if (ka.length > kb.length) { t = a; a = b; b = t; ka = kb; }
    for (i = 0; i < ka.length; i++) { k = ka[i]; if (b[k]) s += a[k] * b[k]; }
    return s;
  }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) {
    var l = len(a), o = {};
    if (!l) return o;
    Object.keys(a).forEach(function (k) { if (a[k]) o[k] = a[k] / l; });
    return o;
  }
  function addTo(p, v, w) { Object.keys(v).forEach(function (k) { p[k] = (p[k] || 0) + v[k] * w; }); return p; }
  function cos(a, b) { var la = len(a), lb = len(b); return la && lb ? dot(a, b) / (la * lb) : 0; }
  function empty(v) { return !v || !Object.keys(v).length; }

  /* ---------- songs ---------- */
  function clean(it, i) {
    if (!it || !it.id || !it.title) return null;
    return {
      id: String(it.id), title: String(it.title), artist: String(it.artist || ''), year: parseInt(it.year, 10) || 0,
      lang: String(it.lang || '').toLowerCase(), kind: it.kind === 'music' || it.kind === 'video' ? it.kind : 'song',
      genre: String(it.genre || '').toLowerCase().trim(), tags: isArr(it.tags) ? it.tags.map(String) : [], channel: String(it.channel || ''),
      premium: it.premium === true || it.tier === 'premium', idx: i
    };
  }
  function langKey(s) { return s.kind === 'song' ? (s.lang || '') : 'none'; }
  function decadeOf(s) { return s.year >= 1900 ? Math.floor(s.year / 10) * 10 : s.year > 0 ? 0 : null; }
  /* The song vector (C2): only what the catalogue has. A missing field adds nothing. */
  function vectorOf(s, cfg) {
    var w = cfg.features, f = {}, blur = cfg.decadeBlurYears || 15, d, x;
    if (s.year >= 1900) {
      for (d = 1900; d <= 2020; d += 10) { x = 1 - Math.abs(s.year - (d + 5)) / blur; if (x > 0) f['d:' + d] = x * w.decade; }
    } else if (s.year > 0) f['d:old'] = w.decade;   /* classical music: year of composition */
    if (s.kind === 'song') { if (s.lang) f['l:' + s.lang] = w.language; } else f['l:none'] = w.language;
    if (s.genre) f['g:' + s.genre] = w.style;
    s.tags.forEach(function (t) {
      if (AMBIANCE.indexOf(t) >= 0) f['m:' + t] = w.ambiance;
      else if (CONTENT.indexOf(t) >= 0) f['c:' + t] = w.content;
    });
    f['k:' + s.kind] = w.kind;
    var a = norm(s.artist);
    if (a) f['a:' + a] = w.artist;
    return unit(f);
  }
  function liveliness(s) {
    var calm = s.tags.indexOf('calm') >= 0, dance = s.tags.indexOf('dance') >= 0;
    if (calm && !dance) return 0.2;
    if (dance && !calm) return 0.8;
    if (calm && dance) return 0.5;
    return own(STYLE_LIFE, s.genre) ? STYLE_LIFE[s.genre] : 0.5;
  }
  /* Songs ready for the engine: cleaned, each id once, with vector, liveliness and the popularity
     proxy. The catalogue has no popularity figure: the proxy is the tag "youth" (the classics the
     catalogue marks for residents' youth) and how many songs of the artist the catalogue holds,
     RANKED WITHIN EACH DECADE (1.1.0): every decade has its own well-known songs, so the proxy no
     longer favours old songs. */
  function decKey(s) { var d = decadeOf(s); return d === null ? '?' : String(d); }
  function prepare(items, cfg) {
    cfg = cfgOf(cfg);
    var list = [], byId = {}, perArtist = {}, byDec = {};
    (items || []).forEach(function (it, i) { var s = clean(it, i); if (!s || byId[s.id]) return; byId[s.id] = s; list.push(s); });
    list.forEach(function (s) { var a = norm(s.artist); if (a) perArtist[a] = (perArtist[a] || 0) + 1; });
    list.forEach(function (s) {
      var n = perArtist[norm(s.artist)] || 0;
      s.raw = 0.6 * (s.tags.indexOf('youth') >= 0 ? 1 : 0) + 0.4 * Math.min(1, Math.log(1 + n) / Math.log(5))
        /* children's songs are kept for the grandchildren's visits, not as the well-known songs */
        - (s.genre === 'kids' ? 0.5 : 0);
      (byDec[decKey(s)] = byDec[decKey(s)] || []).push(s);
      s.v = vectorOf(s, cfg);
      s.life = liveliness(s);
    });
    Object.keys(byDec).forEach(function (d) {
      var arr = byDec[d].sort(function (a, b) { return b.raw - a.raw || a.idx - b.idx; }), m = arr.length;
      arr.forEach(function (s, i) { s.pop = round(m > 1 ? 1 - i / (m - 1) : 1, 4); delete s.raw; });
    });
    return { list: list, byId: byId, cfg: cfg };
  }
  function similarity(a, b) { return dot(a.v, b.v); }
  /* The average vector of a few songs (the radio after a list: "more like these"). */
  function centroid(S, ids) { var p = {}; (ids || []).forEach(function (id) { if (S.byId[id]) addTo(p, S.byId[id].v, 1); }); return unit(p); }

  /* What the catalogue does not say (C12.1): counted, never filled in. */
  function metadataGaps(items) {
    var out = { total: 0, songs: 0, missing: { year: 0, language: 0, genre: 0, artist: 0, tags: 0 }, unknownGenres: {}, duplicates: [],
      compositionYears: 0, uploadYears: 0, noAmbianceTag: 0, absentFields: ['tempo (slow / medium / lively)', 'mood beyond the calm and dance tags', 'duration', 'popularity', 'audio features'] };
    var seen = {};
    (items || []).forEach(function (it) {
      if (!it || !it.id) return;
      out.total++;
      if (seen[it.id]) out.duplicates.push(it.id);
      seen[it.id] = 1;
      var kind = it.kind || 'song', tags = isArr(it.tags) ? it.tags : [];
      if (kind === 'song') { out.songs++; if (!it.lang) out.missing.language++; if (!it.artist) out.missing.artist++; }
      if (!parseInt(it.year, 10)) out.missing.year++;
      else if (parseInt(it.year, 10) < 1900) out.compositionYears++;
      if (kind === 'video') out.uploadYears++;
      if (!it.genre) out.missing.genre++;
      else if (KNOWN_GENRES.indexOf(String(it.genre).toLowerCase()) < 0) out.unknownGenres[it.genre] = (out.unknownGenres[it.genre] || 0) + 1;
      if (!tags.length) out.missing.tags++;
      if (kind !== 'video' && tags.indexOf('calm') < 0 && tags.indexOf('dance') < 0) out.noAmbianceTag++;
    });
    return out;
  }

  /* ---------- listening events (C3) ---------- */
  function makeEvent(o, now) {
    if (!o || !o.residentId || !o.songId || EVENTS.indexOf(o.event) < 0) return null;
    now = toMs(now || Date.now());
    var r = parseFloat(o.playedRatio);
    if (!isFinite(r)) r = o.event === 'complete' ? 1 : 0;
    var ctx = o.context || {};
    return {
      id: o.id || ('E' + now.toString(36) + (seq++).toString(36)),
      residentId: String(o.residentId), songId: String(o.songId), timestamp: o.timestamp ? iso(toMs(o.timestamp)) : iso(now),
      context: { mode: ctx.mode === 'group' ? 'group' : 'solo', zone: String(ctx.zone || '') },
      source: o.source === 'staff' ? 'staff' : 'resident', playedRatio: round(clamp(r, 0, 1), 3), event: o.event
    };
  }
  function signal(ev, cfg) {
    var s = cfg.signals, r = +ev.playedRatio || 0;
    if (ev.event === 'like') return s.like;
    if (ev.event === 'replay') return s.replay;
    if (ev.event === 'complete') return s.complete;
    if (ev.event === 'stop') return s.stop;
    if (ev.event === 'skip') return r < cfg.earlyBelow ? s.skipEarly : r > cfg.partialAbove ? s.partial : 0;
    return 0;
  }
  function decay(ageMs, cfg) { return Math.pow(0.5, Math.max(0, ageMs) / DAY / cfg.halfLifeDays); }
  function eventWeight(ev, cfg, now) {
    var s = signal(ev, cfg);
    if (!s) return 0;
    var src = cfg.sourceWeight[ev.source === 'staff' ? 'staff' : 'resident'];
    var ctx = cfg.contextWeight[ev.context && ev.context.mode === 'group' ? 'group' : 'solo'];
    var x = s * (src === undefined ? 1 : src) * (ctx === undefined ? 1 : ctx) * decay(toMs(now) - toMs(ev.timestamp), cfg);
    return x === 0 ? 0 : x;
  }
  function recentSet(events, now, ms) {
    var out = {};
    (events || []).forEach(function (ev) { var t = toMs(ev.timestamp); if (t && now - t <= ms && t - now <= HOUR) out[ev.songId] = 1; });
    return out;
  }

  /* ---------- the taste profile (C2, time 2) ----------
     o: { residentId, songs (prepare()), events, now, windowDays, cold: {songs:[ids], decade, lang}, lang, cfg }
     Missing listening adds nothing: there is no negative weight for a song not played. */
  function pseudoSong(decade, lang) {
    return { id: '~', title: '', artist: '', year: decade ? decade + 5 : 0, lang: lang || '', kind: 'song', genre: '', tags: [] };
  }
  function buildProfile(o) {
    var cfg = cfgOf(o.cfg), S = o.songs, now = toMs(o.now || Date.now()), windowDays = o.windowDays || cfg.profileWindowDays.week, win = windowDays * DAY;
    var w = {}, heard = {}, stopped = {}, dp = 0, plays = 0, rejects = 0;
    (o.events || []).forEach(function (ev) {
      var t = toMs(ev.timestamp), s = S.byId[ev.songId];
      if (!s || !t || now - t > win || t - now > HOUR) return;
      heard[s.id] = Math.max(heard[s.id] || 0, t);
      if (ev.source !== 'staff') {
        if (ev.event === 'stop') stopped[s.id] = Math.max(stopped[s.id] || 0, t);
        if (ev.event === 'complete' || ev.event === 'skip' || ev.event === 'stop') {
          plays++;
          if (ev.event === 'stop' || (ev.event === 'skip' && +ev.playedRatio < cfg.earlyBelow)) rejects++;
        }
      }
      var x = eventWeight(ev, cfg, now);
      if (!x) return;
      w[s.id] = (w[s.id] || 0) + x;
      dp++;
    });
    var vec = {}, avoid = {}, langs = {}, mass = 0;
    Object.keys(w).forEach(function (id) {
      var x = w[id], s = S.byId[id];
      if (x > 0) { addTo(vec, s.v, x); langs[langKey(s) || '?'] = (langs[langKey(s) || '?'] || 0) + x; mass += x; }
      else if (x < 0) addTo(avoid, s.v, -x);
    });
    var cs = cfg.coldStart, isInitial = dp < cs.minEvents, cold = o.cold || null, coldUsed = false;
    if (isInitial) {
      /* Little data: the starting profile chosen by staff weighs more, and less as data comes in. */
      var initW = cs.initialWeight * (1 - dp / cs.minEvents);
      var seeds = cold && isArr(cold.songs) ? cold.songs.filter(function (id) { return !!S.byId[id]; }) : [];
      var era = cold && (cold.decade || cold.lang) ? vectorOf(pseudoSong(parseInt(cold.decade, 10) || 0, cold.lang), cfg) : null;
      var parts = (seeds.length ? 1 : 0) + (era ? 1 : 0);
      if (parts) {
        coldUsed = true;
        seeds.forEach(function (id) { var s = S.byId[id]; addTo(vec, s.v, initW / parts / seeds.length); langs[langKey(s) || '?'] = (langs[langKey(s) || '?'] || 0) + initW / parts / seeds.length; });
        if (era) { addTo(vec, era, initW / parts); if (cold.lang) langs[cold.lang] = (langs[cold.lang] || 0) + initW / parts; }
        mass += initW;
      } else if (o.lang && !mass) {
        /* No history and no starting choice: only the resident's language, plus popularity later. */
        addTo(vec, vectorOf(pseudoSong(0, o.lang), cfg), 1);
        langs[o.lang] = 1; mass = 1;
      }
    }
    var shares = {}, nLang = 0;
    Object.keys(langs).forEach(function (l) { shares[l] = round(langs[l] / (mass || 1), 3); if (shares[l] >= 0.2) nLang++; });
    return {
      residentId: o.residentId || '', vector: unit(vec), avoid: unit(avoid), computedAt: iso(now), windowDays: windowDays,
      dataPoints: dp, isInitial: isInitial, coldUsed: coldUsed, weights: w, heard: heard, stopped: stopped,
      plays: plays, rejects: rejects, rejectsMuch: plays >= cfg.rejection.minPlays && rejects / plays >= cfg.rejection.share,
      langs: shares, multilingual: nLang >= 2, empty: empty(vec), profileName: 'default'
    };
  }

  /* ---------- explanations (C4: a short reason readable by staff) ---------- */
  function describe(ref, s) {
    var out = {}, max = { d: 0, l: 0, g: 0, a: 0 };
    if (empty(ref)) return out;
    Object.keys(ref).forEach(function (k) { var p = k.charAt(0); if (own(max, p) && ref[k] > max[p]) max[p] = ref[k]; });
    var dec = decadeOf(s), dk = dec === null ? null : dec ? 'd:' + dec : 'd:old';
    if (dk && ref[dk] && ref[dk] >= 0.5 * max.d) out.decade = dec;
    var lk = 'l:' + (langKey(s) || '?');
    if (ref[lk] && ref[lk] >= 0.5 * max.l) out.lang = langKey(s);
    if (s.genre && ref['g:' + s.genre] && ref['g:' + s.genre] >= 0.5 * max.g) out.genre = s.genre;
    var ak = 'a:' + norm(s.artist);
    if (s.artist && ref[ak] && ref[ak] >= 0.5 * max.a) out.artist = s.artist;
    return out;
  }
  function reason(code, ref, s, extra) {
    var r = describe(ref, s);
    r.code = code;
    Object.keys(extra || {}).forEach(function (k) { r[k] = extra[k]; });
    return r;
  }
  var REASON_TEXT = {
    'close-liked': 'Already liked or listened to the end',
    'close-taste': 'Very close to the usual music',
    'start-songs': 'Close to the starting choice of the team',
    'neighbour': 'Not heard yet, close to the usual music',
    'discovery': 'A small discovery, a little further away',
    'popular': 'Well-known song of the catalogue',
    'next-similar': 'Close to “{title}”',
    'next-profile': 'Close to the usual music',
    'staff-added': 'Added by the team'
  };
  /* The reason as one sentence. tr: a translator (ST on the Care Team page), English otherwise. */
  function reasonText(r, tr) {
    tr = tr || function (s, v) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return v && v[k] !== undefined ? v[k] : m; }); };
    if (!r) return '';
    var what = [];
    if (r.artist) what.push(tr('same artist: {artist}', { artist: r.artist }));
    if (r.decade !== undefined && r.decade !== null) what.push(r.decade ? tr('{y}s', { y: r.decade, yy: r.decade >= 2000 ? String(r.decade) : String(r.decade).slice(2) }) : tr('Before 1900'));
    if (r.lang) what.push(tr(LANG_NAMES[r.lang] || r.lang));
    if (r.genre) what.push(tr(GENRE_NAMES[r.genre] || r.genre));
    var base = tr(REASON_TEXT[r.code] || r.code || '', { title: r.title || '' });
    return base + (what.length ? ' (' + what.join(' · ') + ')' : '');
  }

  /* ---------- MMR: best matches, kept varied ---------- */
  function mmr(scored, k, lambda, opt) {
    opt = opt || {};
    var pool = scored.slice().sort(function (a, b) { return b.score - a.score || a.t - b.t; }).slice(0, opt.top || 200);
    var out = [], perA = {};
    while (out.length < k && pool.length) {
      var best = -1e9, bi = -1;
      for (var i = 0; i < pool.length; i++) {
        var c = pool[i], a = c.song.artist;
        if (a && opt.maxPerArtist && (perA[a] || 0) >= opt.maxPerArtist) continue;
        if (opt.accept && !opt.accept(c, out)) continue;
        var red = 0;
        for (var j = 0; j < out.length; j++) { var d = dot(c.song.v, out[j].song.v); if (d > red) red = d; }
        var m = lambda * c.score - (1 - lambda) * red;
        if (m > best + 1e-12 || (bi >= 0 && Math.abs(m - best) <= 1e-12 && c.t < pool[bi].t)) { best = m; bi = i; }
      }
      if (bi < 0) break;
      var ch = pool.splice(bi, 1)[0];
      out.push(ch);
      if (ch.song.artist) perA[ch.song.artist] = (perA[ch.song.artist] || 0) + 1;
    }
    return out;
  }
  /* MMR with the era balance (1.1.0): at least `share` of recent songs (when the candidates have
     them), at most maxDecadeShare from one decade; the recent songs are then spread through the
     list and the best match stays first. Filled without the rules if the candidates run out. */
  function isRecent(s, cfg) { return s.year >= cfg.balance.recentFrom; }
  function mmrBalanced(scored, k, lambda, opt, cfg, share) {
    var B = cfg.balance, sh = share === undefined || share === null ? B.recentShare : share, avail = 0;
    scored.forEach(function (x) { if (isRecent(x.song, cfg)) avail++; });
    var need = Math.min(avail, Math.ceil(k * sh - 1e-9)), maxDec = Math.max(1, Math.ceil(k * B.maxDecadeShare - 1e-9));
    var o2 = { maxPerArtist: opt && opt.maxPerArtist, top: scored.length };
    o2.accept = function (c, out) {
      var d = decKey(c.song), nd = 0, nr = 0;
      for (var j = 0; j < out.length; j++) { if (decKey(out[j].song) === d) nd++; if (isRecent(out[j].song, cfg)) nr++; }
      if (nd >= maxDec) return false;
      return isRecent(c.song, cfg) || need - nr < k - out.length;
    };
    var out = mmr(scored, k, lambda, o2);
    if (out.length < k) {
      var got = {};
      out.forEach(function (x) { got[x.song.id] = 1; });
      out = out.concat(mmr(scored.filter(function (x) { return !got[x.song.id]; }), k - out.length, lambda, { maxPerArtist: opt && opt.maxPerArtist, top: scored.length }));
    }
    return spreadEras(out, cfg);
  }
  /* Recent songs spread evenly through the list; the first (best) song stays first. */
  function spreadEras(out, cfg) {
    if (out.length < 3) return out;
    var head = out[0], rest = out.slice(1), rec = rest.filter(function (x) { return isRecent(x.song, cfg); }), oth = rest.filter(function (x) { return !isRecent(x.song, cfg); });
    if (!rec.length || !oth.length) return out;
    var n = rest.length, res = new Array(n), p, j, oi = 0;
    for (j = 0; j < rec.length; j++) {
      p = Math.min(n - 1, Math.floor((j + 0.5) * n / rec.length));
      while (res[p] && p < n - 1) p++;
      while (res[p] && p > 0) p--;
      res[p] = rec[j];
    }
    for (p = 0; p < n; p++) if (!res[p]) res[p] = oth[oi++];
    return [head].concat(res);
  }
  function idSet(x) {
    var o = {};
    if (isArr(x)) x.forEach(function (id) { o[id] = 1; });
    else if (x) Object.keys(x).forEach(function (id) { if (x[id]) o[id] = 1; });
    return o;
  }

  /* ---------- "next song" (C4) ----------
     o: { songs, current (song or id), profile (or null: no consent / no data), events, now, exclude,
          refused, premium, k, cfg, coListen(song, current) (V2, g = 0 by default) }
     Returns at most k (3) proposals, the most similar first, each with its reasons. */
  function coListen(o, s, cur) { return typeof o.coListen === 'function' ? +o.coListen(s, cur) || 0 : 0; }
  function nextSongs(o) {
    var cfg = cfgOf(o.cfg), S = o.songs, now = toMs(o.now || Date.now()), sc = cfg.score;
    var cur = o.current ? S.byId[o.current.id || o.current] || null : null, P = o.profile && !o.profile.empty ? o.profile : null;
    var k = Math.min(o.k || cfg.nextMax, cfg.nextMax), seed = (o.residentId || (P && P.residentId) || '') + '|' + (cur ? cur.id : '');
    var ex = idSet(o.exclude), refused = idSet(o.refused), recent = recentSet(o.events, now, cfg.recentHours.next * HOUR);
    if (P) Object.keys(P.stopped || {}).forEach(function (id) { refused[id] = 1; });
    var ref = cur ? cur.v : P ? P.vector : null;
    var scored = S.list.filter(function (s) {
      return (!cur || s.id !== cur.id) && !ex[s.id] && !refused[s.id] && !recent[s.id] && !(s.premium && !o.premium) &&
        (s.kind !== 'video' || (cur && cur.kind === 'video'));
    }).map(function (s) {
      var sim = ref ? dot(ref, s.v) : 0, aff = P ? dot(P.vector, s.v) : s.pop, co = coListen(o, s, cur), nov = P && P.heard[s.id] ? 0 : 1, pen = 0;
      if (cur && cur.artist && s.artist === cur.artist) pen += cfg.penalties.sameArtistAsCurrent;
      if (P && !empty(P.avoid)) pen += cfg.penalties.disliked * Math.max(0, dot(P.avoid, s.v));
      return { song: s, score: sc.a * sim + sc.b * aff + sc.g * co + sc.d * nov - pen, parts: { sim: sim, aff: aff, co: co, nov: nov, pen: pen }, t: tie(seed, s.id) };
    });
    var picked = mmr(scored, k, cfg.mmrLambda, { maxPerArtist: 1 });
    picked.sort(function (a, b) { return b.parts.sim - a.parts.sim || b.score - a.score || a.t - b.t; });
    return picked.map(function (x) {
      var r = cur ? reason('next-similar', cur.v, x.song, { title: cur.title }) : reason(P ? 'next-profile' : 'popular', P ? P.vector : {}, x.song);
      var rs = [r];
      if (cur && P && x.parts.aff >= 0.6) rs.push(reason('next-profile', P.vector, x.song));
      if (x.parts.nov && P) rs.push({ code: 'new-for-them' });
      return {
        residentId: o.residentId || (P && P.residentId) || '', songId: x.song.id, song: x.song, score: round(x.score, 4),
        parts: { sim: round(x.parts.sim, 4), aff: round(x.parts.aff, 4), co: round(x.parts.co, 4), nov: x.parts.nov, pen: round(x.parts.pen, 4) },
        reasons: rs, reasonText: reasonText(r), computedAt: iso(now)
      };
    });
  }

  /* ---------- radio, recommendations, DJ: built on the same vectors ---------- */
  function similar(o) {
    var S = o.songs, ex = idSet(o.exclude), v = o.vector || (o.seed && S.byId[o.seed.id || o.seed] ? S.byId[o.seed.id || o.seed].v : null), sid = o.seed ? o.seed.id || o.seed : '';
    if (!v) return [];
    var scored = S.list.filter(function (s) { return s.id !== sid && !ex[s.id] && s.kind !== 'video' && !(s.premium && !o.premium); })
      .map(function (s) { return { song: s, score: dot(v, s.v), t: tie('radio|' + sid, s.id) }; });
    return mmr(scored, o.k || 20, o.lambda || 0.85, { maxPerArtist: o.perArtist || 3 }).map(function (x) { return x.song; });
  }
  /* "Your recommendations": the profile, or without one the catalogue's well-known songs in the
     resident's language (non-personalised mode). */
  function recommend(o) {
    var cfg = cfgOf(o.cfg), S = o.songs, P = o.profile && !o.profile.empty ? o.profile : null, ex = idSet(o.exclude), now = toMs(o.now || Date.now());
    var recent = P ? recentSet(o.events, now, DAY) : {}, lang = o.lang || '';
    var scored = S.list.filter(function (s) { return !ex[s.id] && !recent[s.id] && s.kind !== 'video' && !(s.premium && !o.premium) && !(P && P.stopped[s.id]); })
      .map(function (s) {
        var score = P ? dot(P.vector, s.v) + (langKey(s) === lang ? 0.05 : 0) - (empty(P.avoid) ? 0 : cfg.penalties.disliked * Math.max(0, dot(P.avoid, s.v)))
          : s.pop + (langKey(s) === lang ? 0.4 : langKey(s) === 'en' ? 0.15 : 0);
        return { song: s, score: score, t: tie('rec|' + (o.residentId || '') + '|' + (o.day || ''), s.id) };
      });
    return mmrBalanced(scored, o.k || 8, P ? 0.72 : 0.8, { maxPerArtist: P ? 2 : 1 }, cfg, o.recentShare).map(function (x) { return x.song; });
  }
  /* DJ Bellatrix: favourites, rediscoveries and new songs in turn. liked: the resident's hearts. */
  function djBatch(o) {
    var cfg = cfgOf(o.cfg), S = o.songs, P = o.profile && !o.profile.empty ? o.profile : null, liked = idSet(o.liked), seen = idSet(o.seen), ex = idSet(o.exclude);
    var now = toMs(o.now || Date.now()), n = o.n || 6, heard = P ? P.heard : {}, wts = P ? P.weights : {}, seed = 'dj|' + (o.residentId || '') + '|' + (o.round || 0);
    function fresh(s) { return !seen[s.id] && !ex[s.id] && s.kind !== 'video' && !(s.premium && !o.premium) && !(P && P.stopped[s.id]); }
    function sc(s) { return P ? dot(P.vector, s.v) : s.pop + (langKey(s) === o.lang ? 0.4 : 0); }
    function rows(list) { return list.map(function (s) { return { song: s, score: sc(s), t: tie(seed, s.id) }; }); }
    var fav = S.list.filter(function (s) { return fresh(s) && (liked[s.id] || (wts[s.id] || 0) >= 2); });
    var again = S.list.filter(function (s) { return fresh(s) && heard[s.id] && !liked[s.id] && (wts[s.id] || 0) >= 0 && now - heard[s.id] > 2 * DAY; });
    var youth = idSet(o.youth);
    if (again.length < 3) again = again.concat(S.list.filter(function (s) { return fresh(s) && youth[s.id] && !heard[s.id] && again.indexOf(s) < 0; }));
    var neu = S.list.filter(function (s) { return fresh(s) && !heard[s.id] && !liked[s.id]; });
    var lists = { fav: mmr(rows(fav), n, 0.6, { maxPerArtist: 1 }), again: mmr(rows(again), n, 0.6, { maxPerArtist: 1 }), neu: mmrBalanced(rows(neu), n, 0.75, { maxPerArtist: 1 }, cfg, 0.4) };
    var order = ['fav', 'neu', 'again', 'neu', 'fav', 'again'], out = [], got = {}, i = 0, guard = 0, lastArtist = o.lastArtist || '';
    while (out.length < n && guard++ < n * 8) {
      var kind = order[i++ % order.length], x = lists[kind].shift();
      if (!x) continue;
      if (got[x.song.id] || (x.song.artist && x.song.artist === lastArtist)) { lists[kind].push(x); if (lists[kind].length === 1 && guard > n * 4) lists[kind] = []; continue; }
      got[x.song.id] = 1; lastArtist = x.song.artist;
      out.push({ song: x.song, kind: kind });
    }
    return out;
  }

  /* "Your mixes" (1.16, like Spotify's daily mixes): up to n mixes, each around one style of the
     songs the resident liked (hearts) or listened to the end (the profile, with consent), with the
     songs nearest to them in between. Deterministic for the same data and day.
     o: { songs, profile, liked, exclude, n (3), k (25), residentId, day, premium }
     Returns [{ key, genre, decade, seeds: [ids], list: [songs] }]; [] with no profile and no hearts. */
  function mixes(o) {
    var S = o.songs, P = o.profile && !o.profile.empty ? o.profile : null, liked = idSet(o.liked), ex = idSet(o.exclude), n = o.n || 3, k = o.k || 25;
    var w = {}, groups = {}, seed = 'mix|' + (o.residentId || '') + '|' + (o.day || '');
    if (P) Object.keys(P.weights).forEach(function (id) { if (P.weights[id] > 0) w[id] = P.weights[id]; });
    Object.keys(liked).forEach(function (id) { w[id] = (w[id] || 0) + 3; });
    Object.keys(w).forEach(function (id) {
      var s = S.byId[id];
      if (!s || s.kind === 'video' || ex[id] || (P && P.stopped[id]) || (s.premium && !o.premium)) return;
      var g = s.genre || (s.kind === 'music' ? 'classical' : 'pop'), d = decadeOf(s);
      var x = groups[g] = groups[g] || { genre: g, mass: 0, seeds: [], decs: {} };
      x.mass += w[id]; x.seeds.push({ s: s, w: w[id] });
      if (d) x.decs[d] = (x.decs[d] || 0) + w[id];
    });
    var top = Object.keys(groups).map(function (g) { return groups[g]; }).filter(function (g) { return g.seeds.length >= 2; })
      .sort(function (a, b) { return b.mass - a.mass || (a.genre < b.genre ? -1 : 1); }).slice(0, n);
    return top.map(function (g) {
      g.seeds.sort(function (a, b) { return b.w - a.w || tie(seed, a.s.id) - tie(seed, b.s.id); });
      var seeds = g.seeds.slice(0, 6).map(function (x) { return x.s; }), skip = {};
      Object.keys(ex).forEach(function (id) { skip[id] = 1; });
      seeds.forEach(function (s) { skip[s.id] = 1; });
      if (P) Object.keys(P.stopped).forEach(function (id) { skip[id] = 1; });
      var near = similar({ songs: S, vector: centroid(S, seeds.map(function (s) { return s.id; })), exclude: skip, k: k, premium: o.premium, perArtist: 2 });
      var list = [], a = 0, b = 0;
      /* one of their songs, then two near ones, and so on */
      while (list.length < k && (a < seeds.length || b < near.length)) {
        if (a < seeds.length && (list.length % 3 === 0 || b >= near.length)) list.push(seeds[a++]);
        else if (b < near.length) list.push(near[b++]);
        else list.push(seeds[a++]);
      }
      var dec = Object.keys(g.decs).map(Number).sort(function (x, y) { return g.decs[y] - g.decs[x] || x - y; })[0] || 0;
      return { key: 'mix-' + g.genre, genre: g.genre, decade: dec, seeds: seeds.map(function (s) { return s.id; }), list: list };
    });
  }

  /* ---------- weekly and monthly playlists (C5) ---------- */
  function playlistLength(cfg) {
    var L = cfg.playlistLength;
    return clamp(Math.round(L.targetMinutes / L.assumedSongMinutes), L.min, L.max);
  }
  function dosage(n, cfg, closer) {
    var m = cfg.mix, disc = Math.max(Math.ceil(n * cfg.minDiscovery - 1e-9), Math.round(n * m.discovery)), neigh = Math.round(n * m.neighbour);
    if (closer) { disc = Math.ceil(n * cfg.minDiscovery - 1e-9); neigh = Math.round(neigh / 2); }
    return { close: Math.max(0, n - disc - neigh), neighbour: neigh, discovery: disc };
  }
  /* The flow: gentle opening, livelier middle, calm end (target liveliness per position). */
  function flowTarget(i, n, cfg) {
    if (n < 2) return 0.5;
    var x = i / (n - 1), a = cfg.flow.openingShare, e = cfg.flow.endingShare;
    if (x < a) return 0.3 + 0.3 * (x / a);
    if (x > 1 - e) return 0.6 - 0.4 * ((x - (1 - e)) / e);
    return 0.6 + 0.2 * Math.sin(Math.PI * (x - a) / Math.max(0.01, 1 - a - e));
  }
  function orderFlow(rows, multilingual, cfg) {
    var n = rows.length;
    if (n < 2) return rows.slice();
    var targets = [], i, j;
    for (i = 0; i < n; i++) targets.push(flowTarget(i, n, cfg));
    var byLife = rows.slice().sort(function (a, b) { return a.song.life - b.song.life || a.t - b.t; });
    var pos = targets.map(function (t, p) { return { t: t, p: p }; }).sort(function (a, b) { return a.t - b.t || a.p - b.p; });
    var out = new Array(n);
    pos.forEach(function (x, r) { out[x.p] = byLife[r]; });
    function cost() {
      var c = 0;
      for (var q = 0; q < n; q++) {
        c += 0.5 * Math.abs(out[q].song.life - targets[q]);
        if (q) {
          var a = out[q - 1].song, b = out[q].song;
          if (a.artist && a.artist === b.artist) c += 10;
          if (multilingual && langKey(a) === langKey(b)) c += 1;
        }
      }
      return c;
    }
    function bad(q) {
      if (q <= 0) return false;
      var a = out[q - 1].song, b = out[q].song;
      return (a.artist && a.artist === b.artist) || (multilingual && langKey(a) === langKey(b));
    }
    var best = cost();
    for (var pass = 0; pass < 8; pass++) {
      var improved = false;
      for (i = 1; i < n; i++) {
        if (!bad(i)) continue;
        for (j = 0; j < n; j++) {
          if (j === i) continue;
          var t = out[i]; out[i] = out[j]; out[j] = t;
          var c = cost();
          if (c < best - 1e-9) { best = c; improved = true; break; }
          t = out[i]; out[i] = out[j]; out[j] = t;
        }
      }
      if (!improved) break;
    }
    return out;
  }
  function currentPeriod(period, ms, cfg) {
    cfg = cfgOf(cfg);
    var d = new Date(ms), start;
    if (period === 'month') {
      var m = cfg.schedule.monthly;
      start = new Date(d.getFullYear(), d.getMonth(), m.day, m.hour).getTime();
      if (ms < start) start = new Date(d.getFullYear(), d.getMonth() - 1, m.day, m.hour).getTime();
      var sd = new Date(start);
      return { period: 'month', key: sd.getFullYear() + '-' + pad(sd.getMonth() + 1), start: start, end: new Date(sd.getFullYear(), sd.getMonth() + 1, m.day, m.hour).getTime() };
    }
    var wk = cfg.schedule.weekly, back = (d.getDay() + 7 - wk.weekday) % 7;
    start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back, wk.hour).getTime();
    if (ms < start) start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back - 7, wk.hour).getTime();
    return { period: 'week', key: isoWeek(start), start: start, end: new Date(new Date(start).getFullYear(), new Date(start).getMonth(), new Date(start).getDate() + 7, wk.hour).getTime() };
  }
  function isoWeek(ms) {
    var d = new Date(ms), day = (d.getDay() + 6) % 7;
    var th = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 3), y = th.getFullYear();
    var jan4 = new Date(y, 0, 4), w = 1 + Math.round(((th.getTime() - jan4.getTime()) / DAY - 3 + ((jan4.getDay() + 6) % 7)) / 7);
    return y + '-W' + pad(w);
  }
  /* o: { residentId, period: week|month, periodKey, songs, events, now, cfg, cold, lang, excluded,
          blocked, previous (the last playlist of the same kind), feedbackPoor, premium, profile }
     Same settings + same data = same playlist (no randomness: ties are broken by a fixed hash). */
  function generatePlaylist(o) {
    var cfg = cfgOf(o.cfg), S = o.songs, now = toMs(o.now || Date.now()), period = o.period === 'month' ? 'month' : 'week';
    var key = o.periodKey || currentPeriod(period, now, cfg).key, seed = [o.residentId || '', period, key].join('|');
    var P = o.profile || buildProfile({ residentId: o.residentId, songs: S, events: o.events, now: now, windowDays: cfg.profileWindowDays[period], cold: o.cold, lang: o.lang, cfg: cfg });
    var info = [], n = playlistLength(cfg), closer = P.rejectsMuch || !!o.feedbackPoor;
    if (P.isInitial) info.push('profile-building');
    if (P.rejectsMuch) info.push('rejects-much');
    if (o.feedbackPoor) info.push('team-feedback-poor');
    var dose = dosage(n, cfg, closer);

    /* candidates: never what staff excluded, what was refused, nor (if possible) very recent plays */
    var hard = {};
    Object.keys(idSet(o.excluded)).forEach(function (id) { hard[id] = 'excluded'; });
    Object.keys(idSet(o.blocked)).forEach(function (id) { hard[id] = 'refused'; });
    var since = o.previous && o.previous.generatedAt ? toMs(o.previous.generatedAt) : now - cfg.profileWindowDays[period] * DAY;
    Object.keys(P.stopped || {}).forEach(function (id) { if (P.stopped[id] >= since) hard[id] = 'stopped'; });
    var recent = recentSet(o.events, now, cfg.recentHours.playlist * HOUR);
    var base = S.list.filter(function (s) { return s.kind !== 'video' && !hard[s.id] && !(s.premium && !o.premium); });
    var cands = base.filter(function (s) { return !recent[s.id]; });
    if (cands.length < n && base.length > cands.length) { cands = base; info.push('recent-allowed'); }
    var prevIds = {};
    ((o.previous && o.previous.items) || []).forEach(function (it) { prevIds[it.songId] = 1; });
    var useP = !P.empty;
    var rows = cands.map(function (s) {
      var aff = useP ? dot(P.vector, s.v) : 0, known = P.weights[s.id] || 0, avoidSim = empty(P.avoid) ? 0 : Math.max(0, dot(P.avoid, s.v));
      var score = aff + (P.isInitial ? cfg.coldStart.popularityWeight * s.pop : 0) + (useP ? 0 : s.pop) - cfg.penalties.disliked * 0.5 * avoidSim;
      return { song: s, aff: aff, known: known, heard: !!P.heard[s.id], score: score, t: tie(seed, s.id), prev: !!prevIds[s.id] };
    }).sort(function (a, b) { return b.score - a.score || a.t - b.t; });
    var top = rows.slice(0, cfg.candidatesTop);

    var chosen = [], taken = {}, perA = {}, perL = {}, prevCount = 0, cap = Math.floor(cfg.overlapMax * n), widened = false;
    /* a multilingual profile keeps its languages in proportion (so that they can alternate) */
    function langNudge(r) {
      if (!P.multilingual) return 0;
      var l = langKey(r.song) || '?';
      return 0.6 * Math.max(0, ((perL[l] || 0) + 1) / n - (P.langs[l] || 0));
    }
    function accept(r, loose) {
      if (taken[r.song.id]) return false;
      var a = r.song.artist;
      if (a && (perA[a] || 0) >= cfg.maxPerArtist && loose < 3) return false;
      if (r.prev && prevCount >= cap && loose < 2) return false;
      return true;
    }
    function take(pool, count, bucket, lambda, rank, loose) {
      var got = 0;
      while (got < count) {
        var best = -1e9, bi = -1;
        for (var i = 0; i < pool.length; i++) {
          var r = pool[i];
          if (!accept(r, loose || 0)) continue;
          var red = 0;
          for (var j = 0; j < chosen.length; j++) { var d = dot(r.song.v, chosen[j].row.song.v); if (d > red) red = d; }
          var m = lambda * (rank(r) - langNudge(r)) - (1 - lambda) * red;
          if (m > best + 1e-12 || (bi >= 0 && Math.abs(m - best) <= 1e-12 && r.t < pool[bi].t)) { best = m; bi = i; }
        }
        if (bi < 0) break;
        var c = pool[bi];
        chosen.push({ row: c, bucket: bucket });
        taken[c.song.id] = 1;
        perL[langKey(c.song) || '?'] = (perL[langKey(c.song) || '?'] || 0) + 1;
        if (c.song.artist) perA[c.song.artist] = (perA[c.song.artist] || 0) + 1;
        if (c.prev) prevCount++;
        got++;
      }
      return got;
    }
    function closeRank(r) { return r.score + 0.05 * Math.min(r.known, 6); }
    function plainRank(r) { return r.score; }
    var B = cfg.bands, step = B.widenStep;
    /* close: known and liked songs, and songs very close to the profile (safe values) */
    var need = dose.close, cMin = B.closeMin, src = top;
    while (need > 0) {
      need -= take(src.filter(function (r) { return r.known >= 0 && (r.known > 0 || r.aff >= cMin); }), need, 'close', 0.85, closeRank);
      if (need <= 0 || cMin < -1) break;
      cMin -= step; widened = true; if (cMin < B.neighbourMin) src = rows;
    }
    /* neighbours: not heard yet, close */
    need = dose.neighbour + Math.max(0, need);
    var nMin = B.neighbourMin;
    src = top;
    while (need > 0) {
      need -= take(src.filter(function (r) { return !r.heard && r.aff >= nMin; }), need, 'neighbour', 0.75, plainRank);
      if (need <= 0 || nMin < -1) break;
      nMin -= step; widened = true; src = rows;
    }
    /* discovery: not heard, a little further away; at least minDiscovery of the list */
    var dNeed = dose.discovery + Math.max(0, need), dMin = B.discoveryMin, dMax = B.discoveryMax, heardOk = false;
    while (dNeed > 0) {
      dNeed -= take(rows.filter(function (r) { return (heardOk ? r.known >= 0 : !r.heard) && r.aff >= dMin && r.aff < dMax; }), dNeed, 'discovery', 0.6, plainRank);
      if (dNeed <= 0) break;
      if (dMin < -1 && dMax > 2) { if (heardOk) break; heardOk = true; continue; }
      dMin -= step; dMax += step; widened = true;
    }
    /* still short (catalogue exhausted after exclusions): anything left, loosening the caps */
    for (var loose = 1; chosen.length < n && loose <= 3; loose++) {
      take(rows.filter(function (r) { return r.known >= 0; }), n - chosen.length, chosen.length < n - dose.discovery ? 'neighbour' : 'discovery', 0.75, plainRank, loose);
      if (chosen.length < n) take(rows, n - chosen.length, 'discovery', 0.75, plainRank, loose);
      widened = true;
    }
    if (widened) info.push('widened');
    if (chosen.length < playlistLengthMin(cfg)) info.push('short');
    if (prevCount > cap) info.push('overlap');

    var ordered = orderFlow(chosen.map(function (c) { c.row.bucket = c.bucket; return c.row; }), P.multilingual, cfg);
    var items = ordered.map(function (r, i) {
      var fresh = P.isInitial && r.known <= 0 && r.bucket !== 'discovery';
      var code = !useP || (fresh && !P.coldUsed) ? 'popular' : fresh ? 'start-songs'
        : r.bucket === 'close' ? (r.known > 0 ? 'close-liked' : 'close-taste') : r.bucket;
      var rs = reason(code, useP ? P.vector : {}, r.song);
      return { songId: r.song.id, position: i + 1, bucket: r.bucket, reason: rs, reasonText: reasonText(rs), life: r.song.life };
    });
    var counts = { close: 0, neighbour: 0, discovery: 0 };
    items.forEach(function (it) { counts[it.bucket] = (counts[it.bucket] || 0) + 1; });
    return {
      id: 'pl-' + fnv(seed + '|' + (cfg.version || '')).toString(36), residentId: o.residentId || '', period: period, periodKey: key,
      items: items, status: 'draft', generatedAt: iso(now), configVersion: cfg.version, configHash: DEFAULTS && DEFAULTS.hash ? DEFAULTS.hash(cfg) : '',
      seed: seed, target: { length: n, dosage: dose }, counts: counts, info: info,
      profile: { dataPoints: P.dataPoints, isInitial: P.isInitial, windowDays: P.windowDays, computedAt: P.computedAt, multilingual: P.multilingual, langs: P.langs },
      log: [{ at: iso(now), action: 'generated', by: 'engine' }]
    };
  }
  function playlistLengthMin(cfg) { return cfg.playlistLength.min; }

  /* ---------- "AI playlist": a phrase in French, English or German ---------- */
  var MOODS = {
    happy: ['joyeux', 'joyeuse', 'joyeuses', 'gai', 'gaie', 'gais', 'gaies', 'heureux', 'heureuse', 'heureuses', 'festif', 'festive', 'entrainant', 'entrainantes', 'happy', 'cheerful', 'joyful', 'upbeat', 'frohlich', 'frohliche', 'frohlichen', 'lustig', 'lustige', 'heiter', 'heitere', 'gute laune'],
    calm: ['calme', 'calmes', 'reposer', 'repos', 'doux', 'douce', 'douces', 'detente', 'detendre', 'zen', 'dormir', 'calm', 'relax', 'relaxing', 'rest', 'soft', 'quiet', 'sleep', 'ruhig', 'ruhige', 'ruhigen', 'entspannen', 'entspannung', 'sanft', 'sanfte', 'ausruhen', 'schlafen'],
    dance: ['danser', 'danse', 'dansant', 'dansantes', 'bal', 'dance', 'dancing', 'tanzen', 'tanz', 'tanzmusik'],
    memories: ['souvenir', 'souvenirs', 'nostalgie', 'jeunesse', 'memories', 'nostalgia', 'youth', 'erinnerung', 'erinnerungen', 'jugend']
  };
  var GENRE_WORDS = {
    chanson: ['chanson francaise', 'chansons francaises', 'french chanson', 'chanson'], schlager: ['schlager'], pop: ['pop'], rock: ['rock', 'rock n roll'], jazz: ['jazz'], swing: ['swing'],
    classical: ['classique', 'classiques', 'classical', 'klassik', 'klassische', 'klassisch'], waltz: ['valse', 'valses', 'waltz', 'waltzes', 'walzer'], opera: ['opera', 'oper'],
    volksmusik: ['folk', 'volksmusik', 'folklore', 'folklorique', 'volkslieder'], rap: ['rap', 'hip hop'], electro: ['electro', 'electronique', 'electronic', 'elektro'], disco: ['disco'],
    reggae: ['reggae'], latin: ['latin', 'latino', 'latine', 'salsa', 'latinos'], country: ['country'], film: ['film', 'films', 'cinema', 'movie', 'movies', 'filmmusik'],
    kids: ['enfant', 'enfants', 'kids', 'children', 'kinder', 'kinderlieder'], nature: ['nature', 'natur']
  };
  var LANG_WORDS = { fr: ['francais', 'francaise', 'francaises', 'french', 'franzosisch', 'franzosische', 'franzosischen'], de: ['allemand', 'allemande', 'allemandes', 'german', 'deutsch', 'deutsche', 'deutschen'],
    en: ['anglais', 'anglaise', 'anglaises', 'english', 'englisch', 'englische'], es: ['espagnol', 'espagnole', 'espagnoles', 'spanish', 'spanisch'], it: ['italien', 'italienne', 'italiennes', 'italian', 'italienisch'] };
  var DEC_WORDS = { 1930: ['trente', 'thirties', 'dreissiger'], 1940: ['quarante', 'forties', 'vierziger'], 1950: ['cinquante', 'fifties', 'funfziger'], 1960: ['soixante', 'sixties', 'sechziger'],
    1970: ['soixante dix', 'seventies', 'siebziger'], 1980: ['quatre vingt', 'eighties', 'achtziger'], 1990: ['quatre vingt dix', 'nineties', 'neunziger'] };
  var LIKE_WORDS = ['comme', 'like', 'wie', 'style', 'facon'];
  function has(q, w) { return q.indexOf(' ' + w + ' ') >= 0; }
  /* artists: the artist names to look for. Returns { moods, genres, langs, decades, artist, like }. */
  function parsePhrase(phrase, artists) {
    var q = ' ' + norm(phrase) + ' ', r = { moods: [], genres: [], langs: [], decades: [], artist: null, like: false }, m;
    Object.keys(MOODS).forEach(function (k) { if (MOODS[k].some(function (w) { return has(q, w); })) r.moods.push(k); });
    Object.keys(GENRE_WORDS).forEach(function (g) { if (GENRE_WORDS[g].some(function (w) { return has(q, w); })) r.genres.push(g); });
    if (has(q, 'chansons') && r.genres.indexOf('chanson') >= 0 && !has(q, 'francaises') && !has(q, 'francaise') && !has(q, 'chanson')) r.genres.splice(r.genres.indexOf('chanson'), 1);
    Object.keys(LANG_WORDS).forEach(function (l) { if (LANG_WORDS[l].some(function (w) { return has(q, w); })) r.langs.push(l); });
    var re = /\b(?:19)?([3-9])0(?:s|er|ies)?\b|\b(20[0-2])0(?:s|er)?\b/g;
    while ((m = re.exec(q))) { var d = m[1] ? 1900 + parseInt(m[1], 10) * 10 : parseInt(m[2], 10) * 10; if (r.decades.indexOf(d) < 0) r.decades.push(d); }
    Object.keys(DEC_WORDS).forEach(function (d) {
      d = parseInt(d, 10);
      if (DEC_WORDS[d].some(function (w) { return has(q, w); }) && r.decades.indexOf(d) < 0 && !(d === 1960 && has(q, 'soixante dix')) && !(d === 1980 && has(q, 'quatre vingt dix'))) r.decades.push(d);
    });
    var bestLen = 0;
    (artists || []).forEach(function (name) {
      var n = norm(name), last = n.split(' ').pop(), hit = n && has(q, n) ? n : last.length >= 4 && has(q, last) ? last : null;
      if (hit && hit.length > bestLen) {
        bestLen = hit.length; r.artist = name;
        r.like = LIKE_WORDS.some(function (w) { return q.indexOf(' ' + w + ' ' + hit + ' ') >= 0 || q.indexOf(' ' + w + ' ' + n + ' ') >= 0; });
      }
    });
    return r;
  }
  function artistNames(S) {
    var seen = {}, out = [];
    S.list.forEach(function (s) { if (s.kind !== 'video' && s.artist && !seen[s.artist]) { seen[s.artist] = 1; out.push(s.artist); } });
    return out;
  }
  /* o: { phrase or parsed, songs, profile (or null), exclude, k, youth: [fromYear, toYear], premium } */
  function phrasePlaylist(o) {
    var cfg = cfgOf(o.cfg), S = o.songs, r = o.parsed || parsePhrase(o.phrase, artistNames(S)), P = o.profile && !o.profile.empty ? o.profile : null, ex = idSet(o.exclude);
    var yFrom = o.youth ? o.youth[0] : 0, yTo = o.youth ? o.youth[1] : 0;
    function match(s) {
      var x = 0, tg = s.tags, g = s.genre;
      r.genres.forEach(function (gg) { if (g === gg) x += 1.2; });
      r.decades.forEach(function (d) { if (s.year) x += Math.max(0, 1 - Math.abs(s.year - (d + 5)) / 10); });
      r.langs.forEach(function (l) { if (s.lang === l) x += 0.8; });
      r.moods.forEach(function (mo) {
        if (mo === 'calm' && tg.indexOf('calm') >= 0) x += 0.9;
        if (mo === 'dance' && tg.indexOf('dance') >= 0) x += 0.9;
        if (mo === 'happy' && (tg.indexOf('dance') >= 0 || ['pop', 'disco', 'schlager', 'latin', 'swing'].indexOf(g) >= 0)) x += 0.8;
        if (mo === 'memories' && (tg.indexOf('youth') >= 0 || (yFrom && s.year >= yFrom - 3 && s.year <= yTo + 3))) x += 0.8;
      });
      if (r.artist && s.artist === r.artist) x += r.like ? 0.6 : 1.6;
      return x;
    }
    var cands = S.list.filter(function (s) { return !ex[s.id] && !(s.premium && !o.premium) && (s.kind !== 'video' || r.genres.indexOf('nature') >= 0) && !(P && P.stopped[s.id]); });
    var seedRows = cands.map(function (s) { return { s: s, m: match(s) }; }).filter(function (x) { return x.m > 0; })
      .sort(function (a, b) { return b.m - a.m || a.s.idx - b.s.idx; }).slice(0, 15);
    var t = {};
    seedRows.forEach(function (x) { addTo(t, x.s.v, x.m); });
    if (r.artist) S.list.forEach(function (s) { if (s.artist === r.artist) addTo(t, s.v, r.like ? 1.5 : 1); });
    if (P) addTo(t, P.vector, seedRows.length || r.artist ? 0.3 : 1);
    /* No era, no artist and no "memories" in the phrase: the eras are mixed (1.1.0). */
    var mixEras = !r.decades.length && !r.artist && r.moods.indexOf('memories') < 0;
    if (mixEras) Object.keys(t).forEach(function (key) { if (key.charAt(0) === 'd') delete t[key]; });
    t = unit(t);
    var seed = 'ai|' + norm(o.phrase || '') + '|' + (o.residentId || '');
    var scored = cands.map(function (s) { return { song: s, score: dot(s.v, t) + 0.45 * match(s), t: tie(seed, s.id) }; });
    var popt = { maxPerArtist: r.artist && !r.like ? 20 : 3 };
    var list = (mixEras ? mmrBalanced(scored, o.k || 20, 0.78, popt, cfg) : mmr(scored, o.k || 20, 0.78, popt)).map(function (x) { return x.song; });
    return { list: list, parsed: r };
  }

  /* "Music to avoid" from the life story, matched as Play matches it. */
  function avoidWords(text) { return String(text || '').toLowerCase().split(/[,;\n]+/).map(function (w) { return w.trim(); }).filter(function (w) { return w.length > 1; }); }
  function matchesWords(s, words) {
    if (!words.length) return false;
    var h = (s.artist + ' ' + s.title + ' ' + s.tags.join(' ') + ' ' + s.kind + ' ' + s.genre + ' ' + (s.channel || '')).toLowerCase(), n = norm(h);
    return words.some(function (w) { return h.indexOf(w) >= 0 || n.indexOf(norm(w)) >= 0; });
  }

  /* ---------- the data on this device ---------- */
  var KEYS = {
    consent: 'bellatrix-reco-consent', events: 'bellatrix-reco-events', cold: 'bellatrix-reco-cold', excluded: 'bellatrix-reco-excluded',
    playlists: 'bellatrix-reco-playlists', access: 'bellatrix-reco-access', meta: 'bellatrix-reco-meta',
    taste: 'bellatrix-play-taste', care: 'bellatrix-care-lab-v1', premium: 'bellatrix-premium-v2',
    podcastLists: 'bellatrix-podcast-lists', podcastProgress: 'bellatrix-podcast-progress', podcastHistory: 'bellatrix-podcast-history'
  };
  function createStore(storage, cfg, items) {
    cfg = cfgOf(cfg);
    var songs = prepare(items, cfg);
    function read(k, d) { try { var v = JSON.parse(storage.getItem(k) || 'null'); return v === null || v === undefined ? d : v; } catch (e) { return d; } }
    function write(k, v) { try { storage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
    function nowOf(t) { return t === undefined || t === null ? Date.now() : toMs(t); }

    /* consent "Personnalisation musicale" (resident or legal representative) */
    function consent(code) { var c = read(KEYS.consent, {})[code]; return c || null; }
    function isOn(code) { var c = consent(code); return !!(c && c.on); }
    function setConsent(code, o, t) {
      var all = read(KEYS.consent, {}), now = nowOf(t);
      all[code] = { on: !!o.on, by: o.by === 'representative' ? 'representative' : 'resident', at: iso(now), staff: String(o.staff || '') };
      write(KEYS.consent, all);
      logAccess(o.on ? 'consent-given' : 'consent-withdrawn', code, o.staff, t);
      return all[code];
    }

    /* listening events: only with consent; nothing is written without it */
    function log(o, t) {
      var now = nowOf(t);
      if (!o || !isOn(o.residentId)) return null;
      var ev = makeEvent(o, now);
      if (!ev || !songs.byId[ev.songId]) return null;
      var all = read(KEYS.events, {}), list = all[ev.residentId] = all[ev.residentId] || [];
      list.push(ev);
      if (list.length > cfg.maxEventsPerResident) list.splice(0, list.length - cfg.maxEventsPerResident);
      write(KEYS.events, all);
      return ev;
    }
    function events(code) { return (read(KEYS.events, {})[code] || []).slice(); }
    /* a heart taken back: its "like" events go too */
    function unlike(code, songId) {
      var all = read(KEYS.events, {});
      if (!all[code]) return;
      all[code] = all[code].filter(function (ev) { return !(ev.songId === songId && ev.event === 'like'); });
      write(KEYS.events, all);
    }
    /* hearts given in Play before the event log existed count as "like" (once per song) */
    function taste(code) { return read(KEYS.taste, {})[code] || {}; }
    function withHearts(code, list) {
      var t = taste(code), liked = {};
      list.forEach(function (ev) { if (ev.event === 'like') liked[ev.songId] = 1; });
      Object.keys(t).forEach(function (id) {
        var x = t[id] || {};
        if (!liked[id] && songs.byId[id] && (x.h === 1 || (x.h === undefined && (x.s || 0) >= 2)))
          list.push({ id: 'H' + id, residentId: code, songId: id, timestamp: x.last || iso(0), context: { mode: 'solo', zone: '' }, source: 'resident', playedRatio: 1, event: 'like' });
      });
      return list;
    }
    function blocked(code) { var t = taste(code), o = {}; Object.keys(t).forEach(function (id) { if ((t[id].s || 0) <= -3) o[id] = 1; }); return o; }

    /* the starting profile chosen by staff (3 to 5 songs, or an era and a language) */
    function cold(code) { return read(KEYS.cold, {})[code] || null; }
    function setCold(code, o, t) {
      var all = read(KEYS.cold, {}), ids = (o.songs || []).filter(function (id) { return !!songs.byId[id]; }).slice(0, cfg.coldStart.maxSongs);
      all[code] = { songs: ids, decade: parseInt(o.decade, 10) || 0, lang: o.lang || '', by: String(o.by || ''), at: iso(nowOf(t)) };
      write(KEYS.cold, all);
      logAccess('starting-profile', code, o.by, t);
      return all[code];
    }

    /* songs staff never want proposed to this resident */
    function excluded(code) { return read(KEYS.excluded, {})[code] || {}; }
    function exclude(code, songId, by, t) {
      var all = read(KEYS.excluded, {}), m = all[code] = all[code] || {};
      m[songId] = { at: iso(nowOf(t)), by: String(by || '') };
      write(KEYS.excluded, all);
      logAccess('exclude ' + songId, code, by, t);
    }
    function unexclude(code, songId, by, t) {
      var all = read(KEYS.excluded, {});
      if (all[code]) { delete all[code][songId]; write(KEYS.excluded, all); logAccess('unexclude ' + songId, code, by, t); }
    }

    /* residents: the patient codes of the Care Team app (no names) */
    function residents() {
      var care = read(KEYS.care, {}), pts = care.patients || {}, codes = {};
      Object.keys(pts).forEach(function (c) { codes[c] = 1; });
      Object.keys(read(KEYS.consent, {})).forEach(function (c) { codes[c] = 1; });
      return Object.keys(codes).sort().map(function (c) {
        var pr = (pts[c] && pts[c].prefs) || {}, life = pr.life || {};
        return { code: c, lang: pr.lang === 'fr' || pr.lang === 'de' ? pr.lang : 'en', born: parseInt(life.born, 10) || 0, avoid: life.avoid || '', loves: life.loves || '' };
      });
    }
    function resident(code) { var r = residents().filter(function (x) { return x.code === code; })[0]; return r || { code: code, lang: 'en', born: 0, avoid: '', loves: '' }; }

    function profile(code, period, t) {
      if (!isOn(code)) return null;
      var now = nowOf(t), r = resident(code);
      return buildProfile({ residentId: code, songs: songs, events: withHearts(code, events(code)), now: now, windowDays: cfg.profileWindowDays[period || 'next'] || cfg.profileWindowDays.week, cold: cold(code), lang: r.lang, cfg: cfg });
    }
    function avoidSet(code) {
      var words = avoidWords(resident(code).avoid), o = {};
      if (words.length) songs.list.forEach(function (s) { if (matchesWords(s, words)) o[s.id] = 1; });
      return o;
    }
    /* Premium Play is per resident and per product (js/premium.js v3: Premium.isOn(code, 'play')).
       Without js/premium.js (node tests): the old storage { residents: { P1: { plan, since, until } } }. */
    function premiumOn(code) {
      if (typeof window !== 'undefined' && window.Premium && window.Premium.isOn && storage === window.localStorage) { try { return !!window.Premium.isOn(code, 'play'); } catch (e) { return false; } }
      var r = (read(KEYS.premium, {}).residents || {})[String(code || '').trim().toUpperCase()];
      return !!r && (!r.until || Date.parse(r.until) > Date.now());
    }

    /* playlists */
    function all() { return read(KEYS.playlists, []); }
    function saveAll(list) { return write(KEYS.playlists, list); }
    function get(id) { return all().filter(function (p) { return p.id === id; })[0] || null; }
    function list(f) {
      f = f || {};
      return all().filter(function (p) { return (!f.residentId || p.residentId === f.residentId) && (!f.period || p.period === f.period) && (!f.status || p.status === f.status); })
        .sort(function (a, b) { return a.periodKey < b.periodKey ? 1 : a.periodKey > b.periodKey ? -1 : a.generatedAt < b.generatedAt ? 1 : -1; });
    }
    function put(pl) {
      var l = all(), i = -1;
      l.forEach(function (p, k) { if (p.id === pl.id) i = k; });
      if (i >= 0) l[i] = pl; else l.push(pl);
      saveAll(l);
      return pl;
    }
    function addLog(pl, action, by, t) { pl.log = pl.log || []; pl.log.push({ at: iso(nowOf(t)), action: action, by: String(by || '') }); }
    function generate(code, period, t, opt) {
      opt = opt || {};
      var now = nowOf(t), cp = currentPeriod(period, now, cfg), prev = list({ residentId: code, period: period }).filter(function (p) { return p.periodKey !== cp.key; })[0] || null;
      var ex = {};
      Object.keys(excluded(code)).forEach(function (id) { ex[id] = 1; });
      Object.keys(avoidSet(code)).forEach(function (id) { ex[id] = 1; });
      var r = resident(code);
      var pl = generatePlaylist({
        residentId: code, period: period, periodKey: cp.key, songs: songs, events: withHearts(code, events(code)), now: now, cfg: cfg,
        cold: cold(code), lang: r.lang, excluded: ex, blocked: blocked(code), previous: prev, premium: premiumOn(code),
        feedbackPoor: !!(prev && prev.feedback && prev.feedback.value === 'poor')
      });
      pl.config = JSON.parse(JSON.stringify(cfg));
      pl.periodStart = iso(cp.start); pl.periodEnd = iso(cp.end);
      var old = get(pl.id);
      if (old && old.status !== 'draft') { pl.id += '-' + now.toString(36); }
      else if (old) { pl.log = (old.log || []).concat([{ at: iso(now), action: 'generated again', by: String(opt.by || 'engine') }]); }
      return put(pl);
    }
    /* The job (C5): a new week (from Monday 06:00) or a new month (from the 1st, 06:00) gives each
       resident with consent a DRAFT. Older drafts that were never approved are archived. */
    function runDue(t) {
      var now = nowOf(t), made = [];
      purge(now);
      residents().forEach(function (r) {
        if (!isOn(r.code)) return;
        ['week', 'month'].forEach(function (period) {
          var cp = currentPeriod(period, now, cfg), mine = list({ residentId: r.code, period: period });
          if (mine.some(function (p) { return p.periodKey === cp.key; })) return;
          mine.forEach(function (p) { if (p.status === 'draft') { p.status = 'archived'; addLog(p, 'archived: not approved, a new ' + period + ' began', 'engine', now); put(p); } });
          made.push(generate(r.code, period, now).id);
        });
      });
      var meta = read(KEYS.meta, {});
      meta.lastRun = iso(now);
      if (made.length) meta.lastGenerated = iso(now);
      write(KEYS.meta, meta);
      return made;
    }
    function meta() { return read(KEYS.meta, {}); }
    function editable(pl, by, t) {
      if (!pl || pl.status === 'archived') return false;
      if (pl.status !== 'draft') { pl.status = 'draft'; pl.approvedBy = null; pl.approvedAt = null; addLog(pl, 'reopened for changes', by, t); }
      return true;
    }
    function renumber(pl) { pl.items.forEach(function (it, i) { it.position = i + 1; }); }
    function addSong(id, songId, by, t) {
      var pl = get(id);
      if (!songs.byId[songId] || !editable(pl, by, t) || pl.items.some(function (it) { return it.songId === songId; })) return pl;
      var rs = { code: 'staff-added' };
      pl.items.push({ songId: songId, position: pl.items.length + 1, bucket: 'staff', reason: rs, reasonText: reasonText(rs), life: songs.byId[songId].life });
      renumber(pl); addLog(pl, 'added ' + songId, by, t);
      return put(pl);
    }
    function removeSong(id, songId, by, t) {
      var pl = get(id);
      if (!editable(pl, by, t)) return pl;
      pl.items = pl.items.filter(function (it) { return it.songId !== songId; });
      renumber(pl); addLog(pl, 'removed ' + songId, by, t);
      return put(pl);
    }
    function moveSong(id, songId, delta, by, t) {
      var pl = get(id);
      if (!pl) return pl;
      var i = -1;
      pl.items.forEach(function (it, k) { if (it.songId === songId) i = k; });
      var j = i + delta;
      if (i < 0 || j < 0 || j >= pl.items.length || !editable(pl, by, t)) return pl;
      var x = pl.items[i]; pl.items[i] = pl.items[j]; pl.items[j] = x;
      renumber(pl); addLog(pl, 'moved ' + songId + ' to ' + (j + 1), by, t);
      return put(pl);
    }
    function approve(id, by, t) {
      var pl = get(id), now = nowOf(t);
      if (!pl || pl.status !== 'draft' || !pl.items.length || !String(by || '').trim()) return null;
      pl.status = 'approved'; pl.approvedBy = String(by).trim(); pl.approvedAt = iso(now);
      addLog(pl, 'approved', pl.approvedBy, now);
      put(pl);
      /* the previous approved or active playlist of the same kind steps back */
      list({ residentId: pl.residentId, period: pl.period }).forEach(function (p) {
        if (p.id !== pl.id && (p.status === 'approved' || p.status === 'active')) { p.status = 'archived'; addLog(p, 'archived: replaced by a newer approved playlist', pl.approvedBy, now); put(p); }
      });
      return pl;
    }
    function activate(id, by, t) {
      var pl = get(id);
      if (!pl || pl.status !== 'approved') return pl;
      pl.status = 'active'; addLog(pl, 'active: first played', by || 'resident', t);
      return put(pl);
    }
    function archive(id, by, t) {
      var pl = get(id);
      if (!pl || pl.status === 'archived') return pl;
      pl.status = 'archived'; addLog(pl, 'archived', by, t);
      return put(pl);
    }
    function feedback(id, value, by, t) {
      var pl = get(id);
      if (!pl || ['good', 'mixed', 'poor'].indexOf(value) < 0) return pl;
      pl.feedback = { value: value, by: String(by || ''), at: iso(nowOf(t)) };
      addLog(pl, 'team feedback: ' + value, by, t);
      return put(pl);
    }
    function regenerate(id, by, t) {
      var pl = get(id);
      if (!pl || pl.status !== 'draft') return pl;
      return generate(pl.residentId, pl.period, t, { by: by });
    }
    /* What Play may show: ONLY approved or active playlists, never drafts, and only with consent. */
    function proposable(code) {
      if (!isOn(code)) return [];
      var out = [];
      ['week', 'month'].forEach(function (period) {
        var p = list({ residentId: code, period: period }).filter(function (x) { return x.status === 'approved' || x.status === 'active'; })[0];
        if (p) out.push(p);
      });
      return out;
    }
    /* Usage of a playlist during its period (complete, like, skip, stop): to adjust the engine,
       never a score about the resident. */
    function usage(pl, t) {
      var ids = {}, c = { complete: 0, like: 0, replay: 0, skip: 0, stop: 0 }, from = toMs(pl.approvedAt || pl.generatedAt), to = Math.min(nowOf(t), toMs(pl.periodEnd) || nowOf(t));
      pl.items.forEach(function (it) { ids[it.songId] = 1; });
      events(pl.residentId).forEach(function (ev) { var x = toMs(ev.timestamp); if (ids[ev.songId] && ev.source !== 'staff' && x >= from && x <= to) c[ev.event] = (c[ev.event] || 0) + 1; });
      return c;
    }

    /* privacy: retention, deletion on request, access log */
    function purge(t) {
      var now = nowOf(t), lim = now - cfg.retentionDays * DAY, evs = read(KEYS.events, {}), changed = false;
      Object.keys(evs).forEach(function (code) {
        var before = evs[code].length;
        evs[code] = evs[code].filter(function (ev) { return toMs(ev.timestamp) >= lim; });
        if (!evs[code].length) delete evs[code];
        if (!evs[code] || evs[code].length !== before) changed = true;
      });
      if (changed) write(KEYS.events, evs);
      var pls = all(), keep = pls.filter(function (p) { return !(p.status === 'archived' && toMs(p.generatedAt) < lim); });
      if (keep.length !== pls.length) saveAll(keep);
      var acc = read(KEYS.access, []), acc2 = acc.filter(function (a) { return toMs(a.at) >= now - cfg.accessLogDays * DAY; });
      if (acc2.length !== acc.length) write(KEYS.access, acc2);
    }
    function deleteResident(code, by, t) {
      ['events', 'cold', 'excluded'].forEach(function (k) { var m = read(KEYS[k], {}); if (own(m, code)) { delete m[code]; write(KEYS[k], m); } });
      saveAll(all().filter(function (p) { return p.residentId !== code; }));
      var ta = read(KEYS.taste, {});
      if (own(ta, code)) { delete ta[code]; write(KEYS.taste, ta); }
      /* 1.16: the podcasts too (js/podcasts.js): their list, where they stopped, what they heard */
      ['podcastLists', 'podcastProgress', 'podcastHistory'].forEach(function (k) { var m = read(KEYS[k], {}); if (own(m, code)) { delete m[code]; write(KEYS[k], m); } });
      logAccess('listening data deleted', code, by, t);
    }
    function logAccess(action, code, by, t) {
      var acc = read(KEYS.access, []);
      acc.push({ at: iso(nowOf(t)), action: String(action), code: String(code || ''), by: String(by || '') });
      if (acc.length > 2000) acc.splice(0, acc.length - 2000);
      write(KEYS.access, acc);
    }
    function access(code) { return read(KEYS.access, []).filter(function (a) { return !code || a.code === code; }); }

    return {
      cfg: cfg, songs: songs, keys: KEYS,
      consent: consent, isOn: isOn, setConsent: setConsent,
      log: log, events: events, unlike: unlike, blocked: blocked, cold: cold, setCold: setCold,
      excluded: excluded, exclude: exclude, unexclude: unexclude, residents: residents, resident: resident, profile: profile, avoidSet: avoidSet,
      playlists: list, get: get, generate: generate, regenerate: regenerate, runDue: runDue, meta: meta,
      addSong: addSong, removeSong: removeSong, moveSong: moveSong, approve: approve, activate: activate, archive: archive, feedback: feedback,
      proposable: proposable, usage: usage, purge: purge, deleteResident: deleteResident, logAccess: logAccess, access: access
    };
  }

  var API = {
    version: '1.1.0', config: DEFAULTS, KEYS: KEYS, LANG_NAMES: LANG_NAMES, GENRE_NAMES: GENRE_NAMES,
    norm: norm, tie: tie, prepare: prepare, vectorOf: vectorOf, similarity: similarity, centroid: centroid, cos: cos, dot: dot, metadataGaps: metadataGaps,
    makeEvent: makeEvent, signal: signal, eventWeight: eventWeight, decay: decay, buildProfile: buildProfile, describe: describe, reasonText: reasonText,
    mmr: mmr, mmrBalanced: mmrBalanced, isRecent: isRecent, nextSongs: nextSongs, similar: similar, recommend: recommend, djBatch: djBatch, mixes: mixes,
    playlistLength: playlistLength, dosage: dosage, flowTarget: flowTarget, orderFlow: orderFlow, currentPeriod: currentPeriod, isoWeek: isoWeek,
    generatePlaylist: generatePlaylist, parsePhrase: parsePhrase, phrasePlaylist: phrasePlaylist, artistNames: artistNames,
    avoidWords: avoidWords, matchesWords: matchesWords, liveliness: liveliness, store: createStore
  };

  /* In the app: one store on this device's storage, and the weekly / monthly job when the app or
     the Care Team page starts (the robot has no cron). */
  if (typeof window !== 'undefined' && window.document && typeof window.localStorage !== 'undefined') {
    var shared = null;
    API.shared = function () {
      if (!shared && window.PLAY_CATALOG) { try { shared = createStore(window.localStorage, window.RecoConfig || DEFAULTS, window.PLAY_CATALOG.items); } catch (e) { shared = null; } }
      return shared;
    };
    API.boot = function () {
      var st = API.shared(), made = [];
      if (!st) return made;
      try { made = st.runDue(); } catch (e) { made = []; }
      if (made.length) { try { window.dispatchEvent(new CustomEvent('bellatrix-reco', { detail: { generated: made } })); } catch (e) { /* old WebView */ } }
      return made;
    };
    setTimeout(API.boot, 1200);
  }
  return API;
}));
