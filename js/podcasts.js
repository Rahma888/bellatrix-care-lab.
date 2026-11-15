/* Bellatrix Play podcasts (version 1.16, agent R).
   A small, curated list of free public podcasts in French, German and English, chosen for older
   listeners: history told as stories, music, nature, gardens, conversations, radio plays, games.
   No news and nothing alarming. Every feed is the broadcaster's own public RSS feed (Radio France,
   Deutschlandfunk / Deutschlandradio, WDR, BR, BBC); each was checked on the date in CHECKED with
   the robot's origin (https://app.bellatrix): the feed and the audio files send
   "Access-Control-Allow-Origin: *", so the robot reads them directly, without any server of ours.

   Two layers, as in js/reco.js:
   - pure functions, testable in node (require('./js/podcasts.js'), see tests/play.test.mjs):
     the catalogue (SHOWS), parseFeed(xml) for RSS 2.0 with iTunes tags, sizes and durations;
   - in the app (window): load(show) gets the episodes (1. the feed itself, 2. the LabLand server's
     copy when the care home set one up, 3. the last copy kept on this robot), download(episode)
     keeps an episode in IndexedDB for listening without internet (free for everyone, as the brief
     asks), with its size shown and deletable; the resident's own podcast list (Premium Play) and
     where they stopped in an episode (only with the music consent).
   Listening uses a plain <audio> element (js/play.js): playing needs no CORS, only reading the
   feed and downloading do.
   Storage (localStorage):
     'bellatrix-podcast-feeds'      { showId: { at, title, image, episodes: [...] } } (the last copy)
     'bellatrix-podcast-downloads'  { episodeId: { id, show, title, date, dur, size, type, url, at } }
     'bellatrix-podcast-lists'      { P1: [episode, ...] }   (Premium Play: "My podcasts")
     'bellatrix-podcast-progress'   { P1: { episodeId: { t, d, at } } }   (only with consent)
     'bellatrix-podcast-history'    { P1: [ { episodeId, show, showTitle, title, at, seconds, done } ] }
                                    (only with consent; newest last, at most 200, 90 days; read by the
                                    family portal sync like the music events of js/reco.js)
   The audio of the downloads: IndexedDB 'bellatrix-podcasts', store 'audio' (key = episode id).
   ES5 only (Android 9 WebView, Chrome 95). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Podcasts = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var CHECKED = '2026-11-10';
  var RF = 'https://radiofrance-podcast.net/podcast09/podcast_', BBC = 'https://podcasts.files.bbci.co.uk/';
  /* topic: history | music | nature | garden | talk | stories | games | science | culture */
  var SHOWS = [
    { id: 'fr-odyssees', lang: 'fr', title: 'Les Odyssées', by: 'France Inter', topic: 'history', feed: RF + 'c361798b-d6e3-4282-ba0a-ebb051b9e424.xml' },
    { id: 'fr-filhistoire', lang: 'fr', title: 'Le Fil de l’histoire', by: 'France Inter', topic: 'history', feed: RF + 'f05df399-4c21-4c1d-a6ea-a0bbe661dcdf.xml' },
    { id: 'fr-concordance', lang: 'fr', title: 'Concordance des temps', by: 'France Culture', topic: 'history', feed: RF + 'd88dae25-44df-11e5-9fe0-005056a87c89.xml' },
    { id: 'fr-musicopolis', lang: 'fr', title: 'Musicopolis', by: 'France Musique', topic: 'music', feed: RF + 'ad9fa60c-dab6-4a2b-b39a-3d9a0b65cec7.xml' },
    { id: 'fr-entretiens', lang: 'fr', title: 'Les Grands Entretiens', by: 'France Musique', topic: 'music', feed: RF + '2680b769-5e03-4b64-87c5-09e8484b30e0.xml' },
    { id: 'fr-bateaux', lang: 'fr', title: 'Les P’tits Bateaux', by: 'France Inter', topic: 'science', feed: RF + '3d680a63-ec3d-11e1-a7b7-782bcb76618d.xml' },
    { id: 'fr-masque', lang: 'fr', title: 'Le Masque et la Plume', by: 'France Inter', topic: 'culture', feed: RF + 'c266b241-3ed9-47ed-912f-4eabdc2f0275.xml' },
    { id: 'fr-jeu1000', lang: 'fr', title: 'Le Jeu des 1 000 €', by: 'France Inter', topic: 'games', feed: RF + '48f74c6a-eb98-11e1-a7b7-782bcb76618d.xml' },
    { id: 'fr-theatre', lang: 'fr', title: 'Théâtre et compagnie', by: 'France Culture', topic: 'stories', feed: RF + 'a8716277-4c15-4f87-a1cd-fe2b38f6dfed.xml' },
    /* German: the broadcasters' RSS feeds send no CORS header, so the robot reads the same
       episodes from the ARD Audiothek (api.ardaudiothek.de, the public broadcasters' own catalogue,
       "Access-Control-Allow-Origin: *"); the RSS feed stays as the second way. */
    { id: 'de-kalenderblatt', lang: 'de', title: 'Kalenderblatt', by: 'Deutschlandfunk', topic: 'history', ard: '10492889', feed: 'https://www.deutschlandfunk.de/dlf-kalenderblatt-100.xml' },
    { id: 'de-zeitzeichen', lang: 'de', title: 'WDR Zeitzeichen', by: 'WDR 5', topic: 'history', ard: '33514748', feed: 'https://www1.wdr.de/mediathek/audio/zeitzeichen/zeitzeichen-podcast-100.podcast' },
    { id: 'de-erlebte', lang: 'de', title: 'Erlebte Geschichten', by: 'WDR 5', topic: 'talk', ard: '55475366' },
    { id: 'de-hits', lang: 'de', title: 'Die größten Hits und ihre Geschichte', by: 'SWR3', topic: 'music', ard: '23767614' },
    { id: 'de-philipp', lang: 'de', title: 'Philipps Playlist', by: 'NDR Kultur', topic: 'music', ard: '83159790' },
    { id: 'de-sternzeit', lang: 'de', title: 'Sternzeit', by: 'Deutschlandfunk', topic: 'science', ard: '21679322', feed: 'https://www.deutschlandfunk.de/sternzeit-102.xml' },
    { id: 'de-radiowissen', lang: 'de', title: 'radioWissen', by: 'Bayern 2', topic: 'culture', ard: '5945518', feed: 'https://feeds.br.de/radiowissen/feed.xml' },
    { id: 'de-grossegeschichten', lang: 'de', title: 'Große Geschichten', by: 'ARD', topic: 'stories', ard: '7263856' },
    { id: 'en-inourtime', lang: 'en', title: 'In Our Time', by: 'BBC Radio 4', topic: 'history', feed: BBC + 'b006qykl.rss' },
    { id: 'en-greatlives', lang: 'en', title: 'Great Lives', by: 'BBC Radio 4', topic: 'history', feed: BBC + 'b006qxsb.rss' },
    { id: 'en-desertisland', lang: 'en', title: 'Desert Island Discs', by: 'BBC Radio 4', topic: 'music', feed: BBC + 'b006qnmr.rss' },
    { id: 'en-tweet', lang: 'en', title: 'Tweet of the Day', by: 'BBC Radio 4', topic: 'nature', feed: BBC + 'b01s6xyk.rss' },
    { id: 'en-gardeners', lang: 'en', title: 'Gardeners’ Question Time', by: 'BBC Radio 4', topic: 'garden', feed: BBC + 'b006qp2f.rss' },
    { id: 'en-archers', lang: 'en', title: 'The Archers', by: 'BBC Radio 4', topic: 'stories', feed: BBC + 'b006qpgr.rss' }
  ];
  /* The names of the topics (English text = translation key, js/i18n-play.js). */
  var TOPICS = { history: 'History', music: 'Music', nature: 'Nature', garden: 'Gardens', talk: 'Conversations', stories: 'Stories and radio plays', games: 'Games', science: 'Science', culture: 'Culture' };
  var byId = {};
  SHOWS.forEach(function (s) { byId[s.id] = s; });

  /* ---------- pure helpers (node and browser) ---------- */
  function chr(c) { return c > 0 && c < 0x110000 ? (String.fromCodePoint ? String.fromCodePoint(c) : String.fromCharCode(c)) : ''; }
  /* XML text: CDATA kept as it is, the entities decoded (named, decimal and hexadecimal). */
  function decode(s) {
    s = String(s == null ? '' : s);
    var parts = s.split(/(<!\[CDATA\[[\s\S]*?\]\]>)/), out = '';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], m = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(p);
      out += m ? m[1] : p.replace(/&#x([0-9a-f]+);/gi, function (x, h) { return chr(parseInt(h, 16)); })
        .replace(/&#(\d+);/g, function (x, d) { return chr(parseInt(d, 10)); })
        .replace(/&quot;/g, '"').replace(/&apos;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
    }
    return out;
  }
  /* Plain text from HTML: no tags, no scripts, entities decoded, spaces collapsed. */
  function plain(s) {
    s = decode(s).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/p>/gi, ' ').replace(/<[^>]+>/g, ' ');
    return decode(s).replace(/\s+/g, ' ').trim();
  }
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /* The text of the first <name>…</name> in a block (name may have a prefix, e.g. itunes:duration). */
  function tagText(block, name) {
    var m = new RegExp('<' + esc(name) + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + esc(name) + '\\s*>', 'i').exec(block);
    return m ? m[1] : '';
  }
  /* The opening tag <name …> (or <name …/>) itself, to read its attributes. */
  function openTag(block, name) {
    var m = new RegExp('<' + esc(name) + '(\\s[^>]*?)?/?>', 'i').exec(block);
    return m ? m[0] : '';
  }
  function attr(tag, name) {
    var m = new RegExp('\\s' + esc(name) + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i').exec(tag || '');
    return m ? decode(m[2] !== undefined ? m[2] : m[3]).trim() : '';
  }
  /* itunes:duration as written: "3723", "62:03", "1:02:03" (and "1:02:03.5"). Seconds, or 0. */
  function parseDuration(s) {
    s = String(s || '').trim();
    if (!s) return 0;
    if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s));
    var p = s.split(':');
    if (p.length < 2 || p.length > 3 || p.some(function (x) { return !/^\d+(\.\d+)?$/.test(x); })) return 0;
    var n = 0;
    for (var i = 0; i < p.length; i++) n = n * 60 + parseFloat(p[i]);
    return Math.round(n);
  }
  function hash(s) { var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
  function isAudio(type, url) { return /^audio\//i.test(type || '') || (!type && /\.(mp3|m4a|aac|ogg|opus)(\?|$)/i.test(url || '')); }
  /* The robot's page is https: an http file would be blocked as mixed content (the BBC writes
     its podcast addresses with http, and offers the same with "proto/https"). */
  function httpsUrl(u) { return String(u).replace(/^http:\/\//i, 'https://').replace(/(\/mediaselector\/.*\/proto\/)http\//i, '$1https/'); }
  function shorten(t) { return t.length > 280 ? t.slice(0, 277).replace(/\s+\S*$/, '') + '…' : t; }
  /* RSS 2.0 (with the iTunes tags): the show and its audio episodes, newest first.
     opt: { max (default 40), show (id, kept on each episode) }. Episodes without an audio file
     are left out. Nothing from the feed is ever run or shown as HTML: titles and texts are plain. */
  function parseFeed(xml, opt) {
    opt = opt || {};
    var max = opt.max || 40, text = String(xml || '');
    var first = text.search(/<item[\s>]/i), head = first >= 0 ? text.slice(0, first) : text;
    var img = attr(openTag(head, 'itunes:image'), 'href') || plain(tagText(tagText(head, 'image'), 'url'));
    var out = { title: plain(tagText(head, 'title')), image: /^https:\/\//.test(img) ? img : '', episodes: [] };
    var items = text.split(/<item[\s>]/i).slice(1);
    for (var i = 0; i < items.length; i++) {
      var b = items[i].split(/<\/item\s*>/i)[0];
      var enc = openTag(b, 'enclosure'), url = attr(enc, 'url'), type = attr(enc, 'type');
      if (!url || !/^https?:\/\//i.test(url) || !isAudio(type, url)) continue;
      url = httpsUrl(url);
      var title = plain(tagText(b, 'title')) || plain(tagText(b, 'itunes:title'));
      var date = Date.parse(plain(tagText(b, 'pubDate')).replace(/\s+/g, ' ')), guid = plain(tagText(b, 'guid')) || url;
      var desc = plain(tagText(b, 'itunes:summary') || tagText(b, 'description') || tagText(b, 'content:encoded'));
      var eimg = attr(openTag(b, 'itunes:image'), 'href');
      out.episodes.push({
        id: 'e' + hash((opt.show || '') + '|' + guid), show: opt.show || '', title: title || out.title, date: isNaN(date) ? '' : new Date(date).toISOString(), ts: isNaN(date) ? 0 : date,
        dur: parseDuration(plain(tagText(b, 'itunes:duration'))), size: Math.max(0, parseInt(attr(enc, 'length'), 10) || 0), type: type || 'audio/mpeg', url: url,
        desc: shorten(desc), image: /^https:\/\//.test(eimg) ? eimg : ''
      });
    }
    out.episodes.sort(function (a, b) { return b.ts - a.ts; });
    if (out.episodes.length > max) out.episodes.length = max;
    return out;
  }
  /* The ARD Audiothek (German public broadcasters): one programme and its latest episodes. */
  var ARD = 'https://api.ardaudiothek.de/programsets/';
  function ardUrl(id, n) { return ARD + encodeURIComponent(id) + '?limit=' + (n || 30); }
  function ardImg(im) { var u = im && (im.url1X1 || im.url); return u && /^https:\/\//.test(u) ? u.replace('{width}', '400') : ''; }
  /* The same shape as parseFeed, from the Audiothek's JSON (text or object). */
  function parseArd(json, opt) {
    opt = opt || {};
    var j = json, max = opt.max || 40;
    if (typeof j === 'string') { try { j = JSON.parse(j); } catch (e) { j = null; } }
    var ps = j && j.data && j.data.programSet, out = { title: ps ? plain(ps.title) : '', image: ps ? ardImg(ps.image) : '', episodes: [] };
    var nodes = ps && ps.items && Object.prototype.toString.call(ps.items.nodes) === '[object Array]' ? ps.items.nodes : [];
    nodes.forEach(function (n) {
      var a = n && n.audios && n.audios[0], url = a && (a.downloadUrl || a.url);
      if (!url || !/^https?:\/\//i.test(url)) return;
      var date = Date.parse(n.publicationStartDateAndTime || '');
      out.episodes.push({
        id: 'e' + hash((opt.show || '') + '|ard' + n.id), show: opt.show || '', title: plain(n.title) || out.title, date: isNaN(date) ? '' : new Date(date).toISOString(), ts: isNaN(date) ? 0 : date,
        dur: Math.max(0, Math.round(+n.duration || 0)), size: 0, type: /\.m4a(\?|$)/i.test(url) ? 'audio/mp4' : 'audio/mpeg', url: httpsUrl(url), desc: shorten(plain(n.synopsis || '')), image: ardImg(n.image)
      });
    });
    out.episodes.sort(function (a, b) { return b.ts - a.ts; });
    if (out.episodes.length > max) out.episodes.length = max;
    return out;
  }
  /* Where a download reads the file from this page (it needs the CORS header at every step):
     - Radio France's own counting address (proxycast) answers with a redirect that has no CORS
       header; the file it points to (media.radiofrance-podcast.net, same name) has one: the
       download reads that one, after a plain call to the counting address (so it still counts);
     - the BBC's address (mediaselector) has no CORS header either and must not be worked around:
       its download goes through the care home's LabLand server when there is one ('helper');
     - everything else (Deutschlandradio, WDR, NDR, the BR files on cdn-storage) reads directly.
     { url, ping, via: 'direct' | 'helper' } */
  function fileFor(ep) {
    var u = String(ep && ep.url || ''), m = /^https:\/\/proxycast\.radiofrance\.fr\/(?:[^\/?#]+\/)*([^\/?#]+\.(?:mp3|m4a))(?:[?#].*)?$/i.exec(u);
    if (m) return { url: 'https://media.radiofrance-podcast.net/podcast09/' + m[1], ping: u, via: 'direct' };
    if (/^https:\/\/[^\/]*\.bbc\.co\.uk\/mediaselector\//i.test(u) || /^https:\/\/[^\/]*bbci?\.co\.uk\//i.test(u)) return { url: u, ping: '', via: 'helper' };
    /* checked 10 Nov 2026: no CORS header on these file servers either (SWR, the first BR address) */
    if (/^https:\/\/(swr-dl\.ard-mcdn\.de|media\.neuland\.br\.de)\//i.test(u)) return { url: u, ping: '', via: 'helper' };
    return { url: u, ping: '', via: 'direct' };
  }
  /* About how big an episode is before it is downloaded: the feed's own figure, or 128 kbit/s. */
  function guessSize(ep) { return ep && ep.size ? ep.size : Math.round((ep && ep.dur || 0) * 16000); }
  /* 45 MB / 45 Mo / 1,2 GB: the size in the resident's language. */
  function fmtSize(bytes, lang) {
    var fr = lang === 'fr', mb = bytes > 0 ? Math.max(0.1, bytes / 1048576) : 0, dec = fr || lang === 'de' ? ',' : '.';
    if (!mb) return fr ? '0 Mo' : '0 MB';
    if (mb >= 1024) return (Math.round(mb / 102.4) / 10).toFixed(1).replace('.', dec) + (fr ? ' Go' : ' GB');
    return (mb < 10 ? (Math.round(mb * 10) / 10).toFixed(1).replace('.', dec) : String(Math.round(mb))) + (fr ? ' Mo' : ' MB');
  }
  /* "1 h 05" or "25 min" (the same in the three languages). */
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    if (!sec) return '';
    var h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    if (m === 60) { h++; m = 0; }
    return h ? h + ' h ' + (m < 10 ? '0' : '') + m : Math.max(1, m) + ' min';
  }
  /* The shows of one language, in the catalogue's order. */
  function shows(lang) { return SHOWS.filter(function (s) { return !lang || s.lang === lang; }); }
  function show(id) { return byId[id] || null; }
  /* What a resident may do with podcasts (the brief, chantier I): everyone listens and downloads;
     the podcast list ("My podcasts") is Premium Play. */
  function rights(premium) { return { listen: true, download: true, list: !!premium }; }

  var API = {
    CHECKED: CHECKED, SHOWS: SHOWS, TOPICS: TOPICS, show: show, shows: shows, rights: rights,
    decode: decode, plain: plain, parseDuration: parseDuration, parseFeed: parseFeed, parseArd: parseArd, ardUrl: ardUrl, httpsUrl: httpsUrl, fileFor: fileFor, guessSize: guessSize,
    fmtSize: fmtSize, fmtDur: fmtDur, hash: hash,
    KEYS: { feeds: 'bellatrix-podcast-feeds', downloads: 'bellatrix-podcast-downloads', lists: 'bellatrix-podcast-lists', progress: 'bellatrix-podcast-progress', history: 'bellatrix-podcast-history' },
    MAX_DOWNLOADS: 12
  };

  /* ---------- in the app: feeds, downloads, lists, progress ---------- */
  if (typeof window === 'undefined' || !window.document) return API;
  var K = API.KEYS;
  function getJ(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v === null || typeof v !== 'object' ? d : v; } catch (e) { return d; } }
  function putJ(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function code(c) { return String(c == null ? '' : c).trim().toUpperCase(); }

  /* The LabLand server of this care home, when the Family tab has one (the same as the family
     messages and calls): it may keep a copy of the feeds for robots whose network blocks them. */
  function server() {
    try { if (window.FamilyMessages && FamilyMessages.server) return FamilyMessages.server(); } catch (e) { /* none */ }
    try { return String(localStorage.getItem('bellatrix-call-server') || '').trim().replace(/\/+$/, ''); } catch (e) { return ''; }
  }
  function timed(p, ms) {
    return new Promise(function (ok, ko) { var t = setTimeout(function () { ko(new Error('timeout')); }, ms); p.then(function (v) { clearTimeout(t); ok(v); }, function (e) { clearTimeout(t); ko(e); }); });
  }
  function getText(url) {
    if (!window.fetch) return Promise.reject(new Error('no fetch'));
    return timed(fetch(url, { cache: 'no-cache', credentials: 'omit' }), 20000).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.text(); });
  }
  var mem = {};
  function cached(id) { var c = getJ(K.feeds, {})[id]; return c && c.episodes ? c : null; }
  function keep(id, feed) {
    var all = getJ(K.feeds, {});
    all[id] = { at: new Date().toISOString(), title: feed.title, image: feed.image, episodes: feed.episodes.slice(0, 25) };
    /* the last copy of at most 30 shows: the oldest ones go first */
    var ids = Object.keys(all).sort(function (a, b) { return (all[b].at || '') < (all[a].at || '') ? -1 : 1; });
    ids.slice(30).forEach(function (k) { delete all[k]; });
    if (!putJ(K.feeds, all)) { all = {}; all[id] = { at: new Date().toISOString(), title: feed.title, image: feed.image, episodes: feed.episodes.slice(0, 10) }; putJ(K.feeds, all); }
  }
  /* The episodes of a show: { title, image, episodes, from: 'net' | 'server' | 'copy' }.
     1. the public source itself (the ARD Audiothek for the German shows, else the RSS feed),
     2. the RSS feed through the care home's LabLand server (GET /portal/api/robot/podcast-feed
        ?show=<id>, only the shows of this catalogue), when the Family tab has a server,
     3. the last copy kept on this robot (without internet).
     Without any of them: rejected (Play then says it kindly). */
  function load(id) {
    var s = show(id);
    if (!s) return Promise.reject(new Error('unknown show'));
    if (mem[id] && Date.now() - mem[id].t < 30 * 60000) return Promise.resolve(mem[id].v);
    function done(from, ard) {
      return function (txt) {
        var f = ard ? parseArd(txt, { max: 40, show: id }) : parseFeed(txt, { max: 40, show: id });
        if (!f.episodes.length) throw new Error('empty');
        f.from = from; mem[id] = { t: Date.now(), v: f }; keep(id, f);
        return f;
      };
    }
    var first = s.ard ? getText(ardUrl(s.ard, 30)).then(done('net', true)) : getText(s.feed).then(done('net'));
    return first.catch(function () {
      if (s.ard && s.feed) return getText(s.feed).then(done('net'));
      throw new Error('next');
    }).catch(function () {
      var sv = server();
      if (!sv || !s.feed) throw new Error('no server');
      return getText(sv + '/portal/api/robot/podcast-feed?show=' + encodeURIComponent(id)).then(done('server'));
    }).catch(function () {
      var c = cached(id);
      if (!c) throw new Error('offline');
      return { title: c.title, image: c.image, episodes: c.episodes, from: 'copy', at: c.at };
    });
  }
  /* Can this episode be downloaded here? 'direct', 'helper' (through the LabLand server), or ''. */
  function canDownload(ep) {
    if (!ep || !ep.url || !window.fetch || !window.indexedDB) return '';
    var f = fileFor(ep);
    return f.via === 'direct' ? 'direct' : server() ? 'helper' : '';
  }

  /* ---------- downloads: IndexedDB ---------- */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, ko) {
      if (!window.indexedDB) { ko(new Error('no IndexedDB')); return; }
      var rq = indexedDB.open('bellatrix-podcasts', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('audio'); };
      rq.onsuccess = function () { ok(rq.result); };
      rq.onerror = function () { ko(rq.error); };
    });
    dbp.catch(function () { dbp = null; });
    return dbp;
  }
  function idb(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (ok, ko) {
        var tx = d.transaction('audio', mode), rq = fn(tx.objectStore('audio'));
        tx.oncomplete = function () { ok(rq ? rq.result : undefined); };
        tx.onerror = function () { ko(tx.error); };
        tx.onabort = function () { ko(tx.error || new Error('aborted')); };
      });
    });
  }
  function downloads() {
    var m = getJ(K.downloads, {});
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return (b.at || '') < (a.at || '') ? -1 : 1; });
  }
  function downloaded(id) { return getJ(K.downloads, {})[id] || null; }
  function totalSize() { return downloads().reduce(function (n, d) { return n + (d.size || 0); }, 0); }
  var busy = {};
  function downloading(id) { return busy[id] ? busy[id].p : 0; }
  /* Keeps one episode on the robot. onStep(fraction) while it comes. Resolves with its entry;
     rejects with 'full' (too many or no room left), 'blocked' (the file cannot be read from this
     page: no CORS), or 'offline'. */
  function download(ep, onStep) {
    if (!ep || !ep.url) return Promise.reject(new Error('no episode'));
    if (downloaded(ep.id)) return Promise.resolve(downloaded(ep.id));
    if (busy[ep.id]) return busy[ep.id].promise;
    if (downloads().length >= API.MAX_DOWNLOADS) return Promise.reject(new Error('full'));
    var job = busy[ep.id] = { p: 0.01 };
    function step(x) { job.p = Math.max(0.01, Math.min(0.99, x)); if (onStep) { try { onStep(job.p); } catch (e) { /* only a display */ } } }
    var room = navigator.storage && navigator.storage.estimate ? navigator.storage.estimate().catch(function () { return null; }) : Promise.resolve(null);
    job.promise = room.then(function (est) {
      if (est && est.quota && ep.size && est.usage + ep.size * 1.1 > est.quota * 0.8) throw new Error('full');
      if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) { /* best effort */ } }
      var f = fileFor(ep), via = canDownload(ep);
      if (!via) throw new Error('blocked');
      /* the broadcaster's counting address is called as a podcast app would (nothing read) */
      if (f.ping) { try { var ac = window.AbortController ? new AbortController() : null; fetch(f.ping, { mode: 'no-cors', credentials: 'omit', signal: ac ? ac.signal : undefined }).then(function () { if (ac) ac.abort(); }, function () { /* only counting */ }); } catch (e) { /* only counting */ } }
      var url = via === 'helper' ? server() + '/portal/api/robot/podcast-audio?show=' + encodeURIComponent(ep.show) + '&u=' + encodeURIComponent(ep.url) : f.url;
      return fetch(url, { credentials: 'omit' }).catch(function () { throw new Error('blocked'); });
    }).then(function (r) {
      if (!r || r.type === 'opaque' || !r.ok) throw new Error(r && r.status ? 'http ' + r.status : 'blocked');
      var total = parseInt(r.headers.get('content-length'), 10) || ep.size || 0;
      if (!r.body || !r.body.getReader) return r.blob();
      var rd = r.body.getReader(), chunks = [], got = 0;
      function pump() {
        return rd.read().then(function (x) {
          if (x.done) return new Blob(chunks, { type: r.headers.get('content-type') || ep.type || 'audio/mpeg' });
          chunks.push(x.value); got += x.value.length;
          if (total) step(got / total);
          return pump();
        });
      }
      return pump();
    }).then(function (blob) {
      if (!blob || !blob.size) throw new Error('empty');
      return idb('readwrite', function (st) { return st.put(blob, ep.id); }).then(function () {
        var m = getJ(K.downloads, {});
        m[ep.id] = { id: ep.id, show: ep.show, title: ep.title, date: ep.date, dur: ep.dur, size: blob.size, type: blob.type || ep.type, url: ep.url, image: ep.image || '', at: new Date().toISOString() };
        putJ(K.downloads, m);
        return m[ep.id];
      });
    }).then(function (d) { delete busy[ep.id]; fire(); return d; }, function (e) { delete busy[ep.id]; fire(); throw e; });
    return job.promise;
  }
  var urls = {};
  /* An address the <audio> element can play: the downloaded copy when there is one. */
  function source(ep) {
    if (!ep) return Promise.reject(new Error('no episode'));
    if (!downloaded(ep.id)) return Promise.resolve({ url: ep.url, local: false });
    if (urls[ep.id]) return Promise.resolve({ url: urls[ep.id], local: true });
    return idb('readonly', function (st) { return st.get(ep.id); }).then(function (b) {
      if (!b) { forgetMeta(ep.id); return { url: ep.url, local: false }; }
      urls[ep.id] = URL.createObjectURL(b);
      return { url: urls[ep.id], local: true };
    }, function () { return { url: ep.url, local: false }; });
  }
  function forgetMeta(id) { var m = getJ(K.downloads, {}); if (m[id]) { delete m[id]; putJ(K.downloads, m); } }
  function remove(id) {
    forgetMeta(id);
    if (urls[id]) { try { URL.revokeObjectURL(urls[id]); } catch (e) { /* gone */ } delete urls[id]; }
    return idb('readwrite', function (st) { return st.delete(id); }).catch(function () { /* nothing kept */ }).then(fire);
  }
  function removeAll() {
    Object.keys(urls).forEach(function (k) { try { URL.revokeObjectURL(urls[k]); } catch (e) { /* gone */ } });
    urls = {}; putJ(K.downloads, {});
    return idb('readwrite', function (st) { return st.clear(); }).catch(function () { /* nothing kept */ }).then(fire);
  }
  function fire() { try { window.dispatchEvent(new CustomEvent('bellatrix-podcasts')); } catch (e) { /* old WebView */ } }

  /* ---------- the resident's podcast list (Premium Play) ---------- */
  function list(c) { var l = getJ(K.lists, {})[code(c)]; return Object.prototype.toString.call(l) === '[object Array]' ? l : []; }
  function inList(c, id) { return list(c).some(function (e) { return e.id === id; }); }
  function addToList(c, ep) {
    var all = getJ(K.lists, {}), k = code(c), l = list(k).filter(function (e) { return e.id !== ep.id; });
    l.unshift({ id: ep.id, show: ep.show, title: ep.title, date: ep.date, dur: ep.dur, size: ep.size, type: ep.type, url: ep.url, image: ep.image || '' });
    all[k] = l.slice(0, 50); putJ(K.lists, all); fire();
    return all[k];
  }
  function dropFromList(c, id) { var all = getJ(K.lists, {}), k = code(c); all[k] = list(k).filter(function (e) { return e.id !== id; }); putJ(K.lists, all); fire(); return all[k]; }

  /* ---------- where they stopped (only with the music consent; js/play.js decides) ---------- */
  function progress(c, id) { var p = (getJ(K.progress, {})[code(c)] || {})[id]; return p && p.t ? p : null; }
  function saveProgress(c, id, t, d) {
    var all = getJ(K.progress, {}), k = code(c), m = all[k] = all[k] || {};
    if (!t || (d && t > d - 20)) delete m[id]; else m[id] = { t: Math.round(t), d: Math.round(d || 0), at: new Date().toISOString() };
    var ids = Object.keys(m).sort(function (a, b) { return (m[b].at || '') < (m[a].at || '') ? -1 : 1; });
    ids.slice(40).forEach(function (x) { delete m[x]; });
    putJ(K.progress, all);
  }
  /* What was heard (only with the music consent; js/play.js calls it once per episode listened
     to for 30 seconds or more). */
  function logListen(c, ep, seconds, done) {
    if (!ep || !ep.id || !(seconds >= 30)) return null;
    var all = getJ(K.history, {}), k = code(c), l = Object.prototype.toString.call(all[k]) === '[object Array]' ? all[k] : [], lim = Date.now() - 90 * 86400000, s = show(ep.show);
    var e = { episodeId: ep.id, show: ep.show || '', showTitle: s ? s.title : '', title: String(ep.title || ''), at: new Date().toISOString(), seconds: Math.round(seconds), done: !!done };
    l = l.filter(function (x) { return x && Date.parse(x.at) >= lim; });
    l.push(e);
    all[k] = l.slice(-200);
    putJ(K.history, all);
    return e;
  }
  function history(c) { var l = getJ(K.history, {})[code(c)]; return Object.prototype.toString.call(l) === '[object Array]' ? l.slice() : []; }
  /* Erasure (js/reco.js deleteResident does the same on its own storage). */
  function forget(c) {
    var k = code(c);
    [K.lists, K.progress, K.history].forEach(function (key) { var all = getJ(key, {}); if (all[k]) { delete all[k]; putJ(key, all); } });
    fire();
  }

  API.load = load; API.cached = cached; API.server = server; API.canDownload = canDownload;
  API.download = download; API.downloading = downloading; API.downloaded = downloaded; API.downloads = downloads; API.totalSize = totalSize;
  API.source = source; API.remove = remove; API.removeAll = removeAll;
  API.list = list; API.inList = inList; API.addToList = addToList; API.dropFromList = dropFromList;
  API.progress = progress; API.saveProgress = saveProgress; API.logListen = logListen; API.history = history; API.forget = forget;
  return API;
}));
