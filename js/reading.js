/* Bellatrix 1.16 (workstream H): the reading app, novels for older readers. Activity key 'reading'.
   An engagement activity: nothing to answer, nothing scored.
   - The resident chooses a novel on a shelf of drawn covers ("Chapitre 3 · 20 %" for THIS resident),
     then reads it in an open book: two pages side by side on the wide head screen (landscape), one
     page on the upright screen (portrait), big type in the reading font (--font-text), a drop cap at
     the start of each chapter. The robot reads the pages aloud; speed Slow / Normal / Fast; Pause;
     Previous / Next page; at the end of a page the page turns by itself (Personalise: "Turn the page
     after reading", or "Wait for Next"). A small "Chapters" button lists the chapters with "From the
     beginning" (the three big buttons stay Previous / Next / Pause).
   - The books (BellatrixBooks, js/reading-data.js): js/books/index.js gives the shelf (metadata only);
     a novel (js/books/<id>.js, up to about 1.5 MB) is loaded only when it is opened, and only the
     CURRENT chapter is cut into pages (cached with its neighbours), never a whole novel at once.
     free: false = "Livres Premium". A book with sample: true is never offered to residents.
   - Every resident gets back to the page where THEY stopped (for everyone, not a Premium extra):
     localStorage 'bellatrix-reading-places' = { CODE: { bookId: { ch, para, at, pct, done } } }
     ch = chapter, para = the paragraph at the top of the page, so the place survives another page size
     (wide / upright screen, large text), a restart, a change of language and another resident in
     between. The Care Team preview never saves a place. Opening a book goes straight there, with one
     short line ("On reprend à la page 4.").
   - "Livres Premium" (crown): per book, open only when THIS resident has the separate Premium product
     'books' (js/premium.js v3: Premium.isOn(code, 'books')). Bellatrix Play Premium never opens them.
     Locked, a book only says that the care team can be asked (Premium.ask(code, 'books')); the resident
     never sees a price. Favourites are a books Premium extra.
   - The page turn is drawn with CSS 3D transforms and gradients only (css/reading.css): the leaf is cut
     into nested strips, so it curls, with shading and a cast shadow, after a short hand-like pause; it
     stays inside the book frame.
   - The short tales of 1.15 (READING_DATA.stories) are no longer offered; their licence rows stay.
   - Removed in 1.16 (BRIEF-1.16 H): the Today screen (day, time, weather from Open-Meteo), the light
     horoscope, "50 years ago" and the weather place. Nothing here goes to the network.
   - 2026-11-14, the upright tablet: the same family look as Bellatrix Play (css/play.css, the .bp box,
     with a few .bk rules in css/reading.css). Home = the shelf as a grid of covers; the reader = the
     page, with the cover, the title, a big play / pause, Previous / Next page and the progress in
     Play's player bar; three tabs at the bottom (Home, Reading, Chapters); Help and Finish at the top.
     The steps keep their choices and actions (voice, hand signs, the tests): the engine's own cards
     and buttons are only hidden (#screen.bk-screen), the buttons of the page point at the same
     choices and actions (data-a, data-i). The wide head screen keeps the open book of 1.16.
   window.Reading holds the logic without the screen (tested in tests/reading.test.mjs).
   ES5 only (the robot's WebView is Chrome 95). */
var Reading = (function () {
  'use strict';
  var D = (typeof window !== 'undefined' && window.READING_DATA) || (typeof READING_DATA !== 'undefined' ? READING_DATA : { stories: [], licences: [], spoken: {} });
  var PRODUCT = 'books';
  var K = { places: 'bellatrix-reading-places', favs: 'bellatrix-reading-favs', ask: 'bellatrix-books-premium-ask' };
  var store = null;
  try { store = window.localStorage; } catch (e) { store = null; }
  function raw(k) { try { return store.getItem(k); } catch (e) { return null; } }
  function getJ(k) { try { return JSON.parse(raw(k) || 'null'); } catch (e) { return null; } }
  function setJ(k, v) { try { store.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function pick(lang, v) { return v && typeof v === 'object' ? (v[lang] !== undefined ? v[lang] : v.en) : (v || ''); }
  function norm(code) { return String(code == null ? '' : code).trim().toUpperCase(); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function BB() { return typeof BellatrixBooks !== 'undefined' ? BellatrixBooks : (typeof window !== 'undefined' && window.BellatrixBooks) || null; }

  /* ---------- licences of the 1.15 tales (still in the register, no longer offered) ---------- */
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function licenceOk(row, year) {
    year = year || new Date().getFullYear();
    if (!row || typeof row !== 'object') return false;
    if (!String(row.title || '').trim() || !String(row.author || '').trim()) return false;
    /* Public domain: the author (and the translator) died more than 70 years ago. */
    if (!num(row.authorDeath) || row.authorDeath > year - 71) return false;
    if (row.translator && (!num(row.translatorDeath) || row.translatorDeath > year - 71)) return false;
    if (!/^https:\/\/\S+$/.test(String(row.sourceUrl || ''))) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.verifiedOn || ''))) return false;
    return !!String(row.verifiedBy || '').trim();
  }
  function licenceFor(id, rows) {
    rows = rows || D.licences || [];
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
    return null;
  }
  function storyById(id) { for (var i = 0; i < D.stories.length; i++) if (D.stories[i].id === id) return D.stories[i]; return null; }
  function storiesFor(lang, opts) {
    opts = opts || {};
    var rows = opts.licences || D.licences, list = opts.stories || D.stories, only = opts.only;
    return list.filter(function (s) { return s.lang === lang && licenceOk(licenceFor(s.id, rows), opts.year) && (!only || only.indexOf(s.id) >= 0); });
  }

  /* ---------- the shelf (BellatrixBooks) ---------- */
  function urlOf(src) { return typeof src === 'string' ? src : src && typeof src === 'object' ? String(src.url || src.href || '') : ''; }
  /* A novel is offered when its row says where it comes from (https) and under which licence. */
  function entryOk(e) {
    if (!e || !e.id || !/^(fr|de|en)$/.test(e.lang) || !String(e.title).trim() || !String(e.author).trim() || !(e.chapters > 0)) return false;
    return e.sample || (/^https:\/\/\S+$/.test(urlOf(e.source)) && !!(typeof e.licence === 'string' ? e.licence.trim() : e.licence));
  }
  function shelf() {
    var b = BB();
    return (b ? b.list() : []).map(function (e) {
      return { id: e.id, lang: e.lang, title: e.title, author: e.author, year: e.year, premium: e.free === false, chapters: e.chapters, words: e.words,
        source: e.source, licence: e.licence, sample: !!e.sample, color: e.color || '' };
    });
  }
  function samplesShown() { return typeof window !== 'undefined' && window.BELLATRIX_SHOW_SAMPLES === true; }
  /* The novels of one language that may be offered (never a sample; optionally only some ids). */
  function booksFor(lang, opts) {
    opts = opts || {};
    var samples = opts.samples || samplesShown();
    /* (Personalise lists the novels only; a sample shown for a test is not in that list) */
    return shelf().filter(function (e) { return e.lang === lang && (!e.sample || samples) && (!opts.only || e.sample || opts.only.indexOf(e.id) >= 0) && entryOk(e); });
  }
  function entryOf(id) { var s = shelf(); for (var i = 0; i < s.length; i++) if (s[i].id === id) return s[i]; return null; }
  /* Until the novels of a language are there (js/books/), the 1.15 tales of that language fill the
     shelf, so the robot never shows an empty list. As soon as one novel is indexed, only novels. */
  function fromTale(s) {
    return { id: s.id, lang: s.lang, title: s.title, author: s.author, year: null, free: !s.premium, premium: !!s.premium, tale: true,
      chapters: [{ title: '', paras: (s.paragraphs || []).slice() }] };
  }
  function shelfFor(lang, opts) {
    var novels = booksFor(lang, opts);
    if (novels.length) return novels;
    return storiesFor(lang).map(function (s) { return { id: s.id, lang: s.lang, title: s.title, author: s.author, year: null, premium: !!s.premium, chapters: 1, tale: true }; });
  }
  /* The whole book (chapters) when it is here (a loaded novel or a tale), else null. */
  function bookById(id) {
    var b = BB(), x = b ? b.loaded(id) : null;
    if (x) return withPremium(x);
    var s = storyById(id);
    return s ? fromTale(s) : null;
  }
  function withPremium(x) { x.premium = x.free === false; return x; }
  function load(id) {
    var b = BB();
    if (!b) return Promise.reject(new Error('no BellatrixBooks'));
    return new Promise(function (resolve, reject) { b.get(id, function (err, book) { if (err || !book) reject(err || new Error('no book')); else resolve(withPremium(book)); }); });
  }
  /* Where a paragraph sits in the book, in characters, for the percentage on the shelf. */
  function chapterChars(book) {
    if (!book._chars) book._chars = book.chapters.map(function (c) { var n = c.title.length; for (var i = 0; i < c.paras.length; i++) n += c.paras[i].length + 1; return n; });
    return book._chars;
  }
  /* characters before each paragraph of a chapter (computed once per chapter, when it is read) */
  function charsBefore(c) {
    if (!c._cum) { var cum = [0], n = 0; for (var i = 0; i < c.paras.length; i++) { n += c.paras[i].length + 1; cum.push(n); } c._cum = cum; }
    return c._cum;
  }
  function percentAt(book, ch, para) {
    var w = chapterChars(book), before = 0, total = 0, c = book.chapters[ch];
    for (var i = 0; i < w.length; i++) { total += w[i]; if (i < ch) before += w[i]; }
    if (c) before += charsBefore(c)[Math.max(0, Math.min(para, c.paras.length))];
    return total ? Math.max(0, Math.min(100, Math.round(100 * before / total))) : 0;
  }
  /* Windows: a chapter is cut into pages a few thousand characters at a time, from a paragraph on.
     A window always starts on a new page, so each one is cut alone (never the whole chapter: some
     chapters have more than 200 000 characters). The windows depend on the text only, never on the
     page size, so a place (paragraph) finds its window on any screen. */
  var WINDOW_CHARS = 6000;
  function windowsOf(c) {
    if (!c._win) {
      var starts = [0], acc = 0;
      for (var i = 0; i < c.paras.length; i++) {
        if (acc >= WINDOW_CHARS && i > starts[starts.length - 1]) { starts.push(i); acc = 0; }
        acc += c.paras[i].length + 1;
      }
      c._win = starts;
    }
    return c._win;
  }
  function windowOfPara(c, para) {
    var w = windowsOf(c), lo = 0, hi = w.length - 1;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (w[mid] <= para) lo = mid; else hi = mid - 1; }
    return lo;
  }
  /* the page number of a place (about: characters before it / characters of a page, from 1) */
  function pageNumber(book, ch, para, size) {
    var w = chapterChars(book), before = 0, c = book.chapters[ch];
    for (var i = 0; i < ch && i < w.length; i++) before += w[i];
    if (c) before += charsBefore(c)[Math.max(0, Math.min(para, c.paras.length))];
    return 1 + Math.floor(before / ((size && size.chars) || 300));
  }
  function wordCount(text) { var m = String(text || '').match(/\S+/g); return m ? m.length : 0; }

  /* ---------- "Livres Premium": the separate product 'books' of js/premium.js v3 ----------
     Only Premium v3 knows products (it has ask). The 1.15 file (v2) knows Bellatrix Play only:
     with it no book is opened by Premium, so Play Premium can never open a book. */
  function api() {
    var P = typeof Premium !== 'undefined' ? Premium : (typeof window !== 'undefined' ? window.Premium : null);
    return P && typeof P.isOn === 'function' && typeof P.ask === 'function' ? P : null;
  }
  function premiumOn(code) { var P = api(); return !!(P && norm(code) && P.isOn(code, PRODUCT)); }
  function locked(book, code) { return !!(book && (book.premium || book.free === false)) && !premiumOn(code); }
  /* The resident asks the care team (no price): Premium v3 keeps the request for the team. */
  function ask(code, now) {
    var P = api();
    if (!norm(code)) return false;
    if (P) { P.ask(code, PRODUCT); return true; }
    /* Premium v3 not loaded: remember it on this robot so the screen says "asked". */
    var o = getJ(K.ask) || {};
    o[norm(code)] = new Date(now || Date.now()).toISOString();
    return setJ(K.ask, o);
  }
  function asked(code) {
    var P = api();
    if (P && typeof P.asked === 'function') return !!P.asked(code, PRODUCT);
    var o = getJ(K.ask) || {};
    return !!o[norm(code)];
  }
  /* Favourites: a books Premium extra, kept per resident on this robot. */
  function favsOf(patient) { if (!premiumOn(patient)) return []; var f = getJ(K.favs) || {}; return (f[norm(patient)] || f[patient] || []).slice(); }
  function toggleFav(patient, id) {
    if (!premiumOn(patient)) return false;
    var f = getJ(K.favs) || {}, c = norm(patient), list = f[c] = f[c] || [], i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.push(id);
    setJ(K.favs, f);
    return i < 0;
  }

  /* ---------- the place of each resident in each book (for everyone) ---------- */
  function places(code) { var o = getJ(K.places) || {}; return o[norm(code)] || {}; }
  function placeOf(code, id) { var p = places(code)[id]; return p && typeof p === 'object' ? p : null; }
  /* p: { ch, para, pct, done }; 'at' is added. Nothing without a resident code. */
  function savePlace(code, id, p, now) {
    var c = norm(code);
    if (!c || !id || !p) return false;
    var o = getJ(K.places) || {};
    o[c] = o[c] || {};
    o[c][id] = { ch: Math.max(0, p.ch | 0), para: Math.max(0, p.para | 0), at: new Date(now || Date.now()).toISOString(), pct: Math.max(0, Math.min(100, p.pct | 0)) };
    if (p.done) o[c][id].done = true;
    return setJ(K.places, o);
  }
  function clearPlace(code, id) {
    var o = getJ(K.places) || {}, c = norm(code);
    if (!o[c] || !o[c][id]) return false;
    delete o[c][id];
    return setJ(K.places, o);
  }
  /* "Chapitre 3 · 20 %", "20 %" (one chapter) or "Terminé"; '' when the book was never opened. */
  function progressLabel(p, chapters, t) {
    t = t || function (k, v) { return String(k).replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] !== undefined ? v[x] : m; }); };
    if (!p) return '';
    if (p.done) return t('Finished');
    if (!p.ch && !p.para) return '';
    return chapters > 1 ? t('Chapter {n} · {p} %', { n: p.ch + 1, p: p.pct || 0 }) : t('{p} %', { p: p.pct || 0 });
  }

  /* ---------- the voice reads a few old spellings the modern way (1.15 tales) ---------- */
  var KEEP_OIT = ['droit', 'endroit', 'adroit', 'étroit', 'estroit', 'croit', 'exploit', 'reçoit', 'aperçoit', 'conçoit'];
  function spoken(text, lang) {
    var map = (D.spoken || {})[lang], s = String(text || '');
    if (lang === 'fr') s = s.replace(/\s*&\s*/g, ' et ');
    if (map) {
      var has = function (w) { return own(map, w); };
      s = s.replace(/[A-Za-zÀ-ÿ]+(?:-[A-Za-zÀ-ÿ]+)*/g, function (w) { return has(w) ? map[w] : w.split('-').map(function (x) { return has(x) ? map[x] : x; }).join('-'); });
    }
    if (lang === 'fr') {
      s = s.replace(/([A-Za-zàâéèêîôûç]{2,})oient(?![A-Za-zà-ÿ])/g, function (w, a) { return /^(s|v|cr|d)$/i.test(a) ? w : a + 'aient'; });
      s = s.replace(/([A-Za-zàâéèêîôûç]{2,})oit(?![A-Za-zà-ÿ])/g, function (w, a) { return KEEP_OIT.indexOf(w.toLowerCase()) >= 0 ? w : a + 'ait'; });
    }
    return s;
  }

  /* ---------- pages: big type, a few hundred characters or a few verse lines a page ----------
     story: { paragraphs }. opts.title: the chapter title, at the top of the first page.
     Every part knows its paragraph (pi) and whether it goes on from the page before (cont). */
  function sentences(p) {
    var parts = String(p).match(/[^.!?;:]+(?:[.!?;:]+[»”"’“‘)]*\s*|$)/g) || [String(p)], out = [];
    parts.forEach(function (x) { if (!x.trim()) return; if (out.length && x.trim().length < 18) out[out.length - 1] += x; else out.push(x); });
    return out;
  }
  function pageText(pg) {
    return pg.parts.map(function (x) { return x.head ? x.head : x.lines ? x.lines.join(' ') : x.p; }).join(' ');
  }
  function pages(story, maxChars, maxLines, opts) {
    maxChars = maxChars || 420; maxLines = maxLines || 9; opts = opts || {};
    var out = [], page = null;
    function start(verse) { if (page && page.parts.length) out.push(page); page = { verse: verse, parts: [], size: 0 }; }
    start(false);
    if (opts.title) { page.parts.push({ head: opts.title, chapter: true, pi: -1 }); page.size += 60; }
    var off = opts.offset || 0;
    (story.paragraphs || []).forEach(function (para, pj) {
      var pi = pj + off;
      var heading = para.length < 30 && para.indexOf('\n') < 0 && para === para.toUpperCase() && /[A-ZÀ-Þ]/.test(para);
      if (heading) { start(true); page.parts.push({ head: para, pi: pi }); return; }
      if (para.indexOf('\n') >= 0) {
        if (!page.verse && page.size > 60) start(true); else page.verse = true;
        var lines = para.split('\n');
        for (var i = 0; i < lines.length; i += maxLines) {
          var chunk = lines.slice(i, i + maxLines);
          if (page.size && page.size + chunk.length > maxLines && page.parts.some(function (x) { return x.lines; })) start(true);
          page.parts.push({ lines: chunk, pi: pi, cont: i > 0 }); page.size += chunk.length + 1;
        }
        return;
      }
      if (page.verse) start(false);
      var buf = '', cont = false;
      sentences(para).forEach(function (s) {
        if (page.size + buf.length + s.length > maxChars && page.size + buf.length > 0) {
          if (buf.trim()) { page.parts.push({ p: buf.trim(), pi: pi, cont: cont }); cont = true; }
          start(false); buf = '';
        }
        buf += s;
      });
      if (buf.trim()) { page.parts.push({ p: buf.trim(), pi: pi, cont: cont }); page.size += buf.length + 40; }
    });
    if (page.parts.length) out.push(page);
    return out.map(function (pg) { return { verse: pg.verse, parts: pg.parts }; });
  }
  /* The pages of ONE chapter of a book (tests and short chapters; the reader uses windowPages). */
  function chapterPages(book, c, size) {
    var ch = book.chapters[c];
    if (!ch) return [];
    return pages({ paragraphs: ch.paras }, size.chars, size.lines, { title: ch.title });
  }
  /* The pages of window k of chapter c: only a few thousand characters are cut. */
  function windowPages(book, c, k, size) {
    var ch = book.chapters[c];
    if (!ch) return [];
    var w = windowsOf(ch), s = w[k], e = k + 1 < w.length ? w[k + 1] : ch.paras.length;
    if (s === undefined) return [];
    return pages({ paragraphs: ch.paras.slice(s, e) }, size.chars, size.lines, { title: k === 0 ? ch.title : '', offset: s });
  }
  /* The paragraph a page stands for: the first one that starts on it, else the one it goes on with. */
  function paraOfPage(pg) {
    var i, p;
    for (i = 0; i < pg.parts.length; i++) { p = pg.parts[i]; if (p.pi >= 0 && !p.cont) return p.pi; }
    for (i = 0; i < pg.parts.length; i++) if (pg.parts[i].pi >= 0) return pg.parts[i].pi;
    return 0;
  }
  /* The page where a paragraph starts (a place saved with another page size). */
  function pageAtPara(pgs, para) {
    var k = 0;
    for (var i = 0; i < pgs.length; i++) {
      for (var j = 0; j < pgs[i].parts.length; j++) {
        var p = pgs[i].parts[j];
        if (p.pi === para && !p.cont) return i;
        if (p.pi >= 0 && p.pi <= para) k = i;
      }
    }
    return k;
  }
  /* Page size of the open book: two pages side by side (wide head screen) or one page (upright
     screen); the large text setting puts fewer words on a page. */
  function pageSize(two, big) {
    var s = two ? { chars: 300, lines: 8 } : { chars: 400, lines: 11 };
    if (big) s = two ? { chars: 230, lines: 7 } : { chars: 310, lines: 8 };
    return s;
  }

  /* ---------- the open book: what is on the screen, and what a page turn shows ----------
     A view is what the reader sees at once: pages [2v, 2v + 1] with two pages, [v] with one. */
  function viewCount(n, two) { return Math.max(1, two ? Math.ceil(n / 2) : n); }
  function viewPages(n, v, two) {
    var a = two ? 2 * v : v, out = [a];
    if (two) out.push(a + 1);
    return out.map(function (i) { return i >= 0 && i < n ? i : -1; });
  }
  function viewOfPage(page, two) { return two ? Math.floor(Math.max(0, page) / 2) : Math.max(0, page); }
  /* A turn between two views a (on the screen) and b (the next one, dir +1, or the previous one,
     dir -1), given as the pages they show (any page refs, so a turn can cross chapters; -1 or null =
     blank): the leaf (front and back), the pages under it (left and right), and whether it runs backwards.
     Two pages: forward, the right page lifts and lands on the left (its back is the next left page);
     backward, the same leaf of the previous view comes back (the animation reversed).
     One page: the page lifts away to the left (its back is blank paper) and uncovers the next one. */
  function turnBetween(a, b, dir, two) {
    if (two) {
      if (dir === 1) return { reverse: false, front: a[1], back: b[0], left: a[0], right: b[1] };
      return { reverse: true, front: b[1], back: a[0], left: b[0], right: a[1] };
    }
    if (dir === 1) return { reverse: false, front: a[0], back: -1, left: null, right: b[0] };
    return { reverse: true, front: b[0], back: -1, left: null, right: a[0] };
  }
  /* The same inside one chapter of n pages, with page numbers (-1 = blank). */
  function turnPlan(n, v, dir, two) {
    var to = v + dir, count = viewCount(n, two);
    if (dir !== 1 && dir !== -1) return null;
    if (to < 0 || to >= count) return null;
    var p = turnBetween(viewPages(n, v, two), viewPages(n, to, two), dir, two);
    p.to = to;
    return p;
  }
  /* Where the next or previous view is: { c, k, v } (chapter, window, view) or null at the ends.
     counts(c, k) = the number of views of window k of chapter c (only that window is cut into pages);
     windows(c) = the number of windows of chapter c (1 when not given). */
  function stepFrom(pos, dir, nch, counts, windows) {
    windows = windows || function () { return 1; };
    var c = pos.c, k = pos.k || 0, v = pos.v + dir, kb;
    if (dir > 0) {
      if (v < counts(c, k)) return { c: c, k: k, v: v };
      if (k + 1 < windows(c)) return { c: c, k: k + 1, v: 0 };
      return c + 1 < nch ? { c: c + 1, k: 0, v: 0 } : null;
    }
    if (v >= 0) return { c: c, k: k, v: v };
    if (k > 0) return { c: c, k: k - 1, v: counts(c, k - 1) - 1 };
    if (c > 0) { kb = windows(c - 1) - 1; return { c: c - 1, k: kb, v: counts(c - 1, kb) - 1 }; }
    return null;
  }

  /* ---------- the cover: drawn from the title, the author and a colour per book (never a photo) ---------- */
  var COVERS = [['#00519E', '#FFFFFF'], ['#7A1F3D', '#FFFFFF'], ['#1F5A43', '#FFFFFF'], ['#8A5A12', '#FFFFFF'], ['#455A6B', '#FFFFFF'], ['#5E2A62', '#FFFFFF'], ['#6B4A2B', '#FFFFFF'], ['#1F6F78', '#FFFFFF']];
  function hash(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function escX(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* Words on lines of at most `max` characters (at most `rows` lines; the last one ends with "…" when cut). */
  function wrapWords(text, max, rows) {
    var words = String(text || '').split(/\s+/).filter(Boolean), lines = [], cur = '';
    words.forEach(function (w) { if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; });
    if (cur) lines.push(cur);
    if (lines.length > rows) { lines = lines.slice(0, rows); lines[rows - 1] = lines[rows - 1].replace(/\s*\S*$/, '') + '…'; }
    return lines;
  }
  function coverSvg(b) {
    var pal = COVERS[hash(b.id) % COVERS.length], bg = /^#[0-9a-f]{3,8}$/i.test(b.color || '') ? b.color : pal[0], ac = pal[1];
    var title = wrapWords(b.title, 13, 4), author = wrapWords(b.author, 18, 2), y0 = 70 - (title.length - 1) * 9;
    var font = ' style="font-family: var(--font-text, var(--font))"';
    return '<svg class="rdcoverart" viewBox="0 0 120 170" aria-hidden="true" focusable="false">' +
      '<rect x="4" y="2" width="114" height="166" rx="6" fill="' + bg + '"/>' +
      '<rect x="4" y="2" width="11" height="166" rx="3" fill="#000" opacity=".22"/>' +
      '<rect x="21" y="12" width="89" height="146" rx="4" fill="none" stroke="' + ac + '" stroke-width="1.6"/>' +
      /* the small ornament only when the title leaves it room (a title of four lines starts higher) */
      (title.length < 4 ? '<path d="M44 32 H88 M52 38 H80" stroke="' + ac + '" stroke-width="1.6" stroke-linecap="round"/>' : '') +
      title.map(function (l, i) { return '<text x="66" y="' + (y0 + i * 18) + '" text-anchor="middle" font-size="14" fill="' + ac + '"' + font + '>' + escX(l) + '</text>'; }).join('') +
      '<path d="M50 122 H82" stroke="' + ac + '" stroke-width="1.2"/>' +
      author.map(function (l, i) { return '<text x="66" y="' + (136 + i * 11) + '" text-anchor="middle" font-size="9" fill="' + ac + '"' + font + '>' + escX(l) + '</text>'; }).join('') +
      (b.premium ? '<path d="M92 17 L95 27 L101 21 L107 27 L110 17 L110 32 L92 32 Z" fill="#F2C14E" stroke="#00325F" stroke-width="1.2" stroke-linejoin="round"/>' : '') +
      '</svg>';
  }

  /* ---------- the texts of this app (French and German). English is the key. ----------
     They fill only what is missing, so a translation set elsewhere (js/i18n-*.js) is kept. */
  var TEXTS = {
    fr: {
      'Book reading': 'Lecture de livres',
      'Books read aloud, page by page, in an open book.': 'Des livres lus à voix haute, page par page, dans un livre ouvert.',
      'Reading comfort (text size, voice speed, page turning) and which books the resident chooses.': 'Le confort de lecture (taille du texte, vitesse de la voix, pages) et les livres choisis.',
      'Would you like to read with me again another time?': 'Voulez-vous lire avec moi une autre fois ?',
      'Reading speed': 'Vitesse de lecture', 'Slow': 'Lente', 'Normal': 'Normale', 'Fast': 'Rapide',
      'Pages': 'Pages', 'Turn the page after reading': 'Tourner la page après la lecture', 'Wait for Next': 'Attendre « Page suivante »',
      'Books that may be offered': 'Livres proposés',
      'Which book shall we read?': 'Quel livre lisons-nous ?',
      'No book is ready yet.': 'Aucun livre n’est encore prêt.',
      'Other books': 'Autres livres',
      'I’m done': 'J’ai fini',
      'The care team has been asked.': 'L’équipe a été prévenue.',
      'You can ask the care team for this book.': 'Vous pouvez demander ce livre à l’équipe.',
      'Ask the care team': 'Demander à l’équipe',
      'Choose another book': 'Choisir un autre livre',
      'One moment…': 'Un instant…',
      'This book cannot be opened right now.': 'Ce livre ne s’ouvre pas pour le moment.',
      'We carry on at page {n}.': 'On reprend à la page {n}.',
      'Chapters': 'Chapitres', 'Chapter {n}': 'Chapitre {n}', 'Other chapters': 'Autres chapitres',
      'Chapter {n} · {p} %': 'Chapitre {n} · {p} %', '{p} %': '{p} %', 'Finished': 'Terminé',
      'From the beginning': 'Depuis le début',
      'Previous page': 'Page précédente', 'Next page': 'Page suivante', 'The end': 'Fin',
      'Pause': 'Pause', 'Read on': 'Reprendre la lecture',
      'Favourite': 'Favori', 'In my favourites': 'Dans mes favoris', 'Add to my favourites': 'Ajouter à mes favoris',
      'The end of the book.': 'Fin du livre.',
      'Another book': 'Un autre livre',
      'Bellatrix Books': 'Bellatrix Livres', 'Your library': 'Votre bibliothèque', 'Reading': 'Lecture',
      'Choose a book': 'Choisissez un livre', 'Home': 'Accueil', 'Need help?': 'Besoin d’aide ?', 'Finish': 'Terminer', 'Back': 'Retour', 'More': 'Plus'
    },
    de: {
      'Book reading': 'Bücher lesen',
      'Books read aloud, page by page, in an open book.': 'Bücher, Seite für Seite vorgelesen, in einem offenen Buch.',
      'Reading comfort (text size, voice speed, page turning) and which books the resident chooses.': 'Lesekomfort (Textgröße, Sprechtempo, Umblättern) und welche Bücher gewählt werden.',
      'Would you like to read with me again another time?': 'Möchten Sie ein anderes Mal wieder mit mir lesen?',
      'Reading speed': 'Lesetempo', 'Slow': 'Langsam', 'Normal': 'Normal', 'Fast': 'Schnell',
      'Pages': 'Seiten', 'Turn the page after reading': 'Nach dem Vorlesen umblättern', 'Wait for Next': 'Auf „Nächste Seite“ warten',
      'Books that may be offered': 'Angebotene Bücher',
      'Which book shall we read?': 'Welches Buch lesen wir?',
      'No book is ready yet.': 'Noch kein Buch bereit.',
      'Other books': 'Andere Bücher',
      'I’m done': 'Ich bin fertig',
      'The care team has been asked.': 'Das Team weiß Bescheid.',
      'You can ask the care team for this book.': 'Dieses Buch können Sie beim Team erfragen.',
      'Ask the care team': 'Das Team fragen',
      'Choose another book': 'Ein anderes Buch wählen',
      'One moment…': 'Einen Moment …',
      'This book cannot be opened right now.': 'Dieses Buch lässt sich gerade nicht öffnen.',
      'We carry on at page {n}.': 'Wir lesen weiter auf Seite {n}.',
      'Chapters': 'Kapitel', 'Chapter {n}': 'Kapitel {n}', 'Other chapters': 'Weitere Kapitel',
      'Chapter {n} · {p} %': 'Kapitel {n} · {p} %', '{p} %': '{p} %', 'Finished': 'Zu Ende gelesen',
      'From the beginning': 'Von vorne',
      'Previous page': 'Vorherige Seite', 'Next page': 'Nächste Seite', 'The end': 'Ende',
      'Pause': 'Pause', 'Read on': 'Weiterlesen',
      'Favourite': 'Favorit', 'In my favourites': 'In meinen Favoriten', 'Add to my favourites': 'Zu meinen Favoriten',
      'The end of the book.': 'Das Buch ist zu Ende.',
      'Another book': 'Noch ein Buch',
      'Bellatrix Books': 'Bellatrix Bücher', 'Your library': 'Ihre Bibliothek', 'Reading': 'Lesen',
      'Choose a book': 'Wählen Sie ein Buch', 'Home': 'Start', 'Need help?': 'Brauchen Sie Hilfe?', 'Finish': 'Fertig', 'Back': 'Zurück', 'More': 'Mehr'
    }
  };
  (function addTexts() {
    if (typeof I18N === 'undefined' || !I18N || !I18N.add) return;
    ['fr', 'de'].forEach(function (l) {
      var have = (I18N.dict && I18N.dict[l]) || {}, add = {};
      Object.keys(TEXTS[l]).forEach(function (k) { if (!own(have, k)) add[k] = TEXTS[l][k]; });
      I18N.add(l, add);
    });
  })();

  return {
    data: D, keys: K, product: PRODUCT, texts: TEXTS,
    shelf: shelf, books: booksFor, shelfFor: shelfFor, entryOf: entryOf, entryOk: entryOk, bookById: bookById, load: load,
    stories: storiesFor, storyById: storyById, licenceOk: licenceOk, licenceFor: licenceFor,
    premiumOn: premiumOn, locked: locked, ask: ask, asked: asked, favsOf: favsOf, toggleFav: toggleFav,
    places: places, placeOf: placeOf, savePlace: savePlace, clearPlace: clearPlace, progressLabel: progressLabel, percentAt: percentAt, pageNumber: pageNumber,
    spoken: spoken, pages: pages, pageText: pageText, pageSize: pageSize, chapterPages: chapterPages, paraOfPage: paraOfPage, pageAtPara: pageAtPara, wordCount: wordCount,
    windowsOf: windowsOf, windowOfPara: windowOfPara, windowPages: windowPages,
    viewCount: viewCount, viewPages: viewPages, viewOfPage: viewOfPage, turnPlan: turnPlan, turnBetween: turnBetween, stepFrom: stepFrom,
    coverSvg: coverSvg, pick: pick,
    /* For the node tests: another storage object (getItem / setItem / removeItem). */
    _useStorage: function (s) { store = s; }
  };
})();
if (typeof window !== 'undefined') window.Reading = Reading;

/* ---------- the activity on the patient screen ---------- */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.Lab || !window.READING_DATA) return;
  var esc = Lab.esc, R = Reading;
  var STRIPS = 8, TURN_MS = 1500, BACK_MS = 1100, AUTO_WAIT_MS = 900;

  function svgIcon(inner, cls) { return '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 100 100" aria-hidden="true" focusable="false">' + inner + '</svg>'; }
  var ICON = {
    book: svgIcon('<path d="M14 22 Q32 14 50 24 Q68 14 86 22 V80 Q68 72 50 82 Q32 72 14 80 Z" fill="#FFFFFF" stroke="#00519E" stroke-width="6" stroke-linejoin="round"/><path d="M50 24 V82" stroke="#00519E" stroke-width="5"/><path d="M24 36 q12 -4 18 0 M24 48 q12 -4 18 0 M58 36 q12 -4 18 0 M58 48 q12 -4 18 0" stroke="#9FD3F5" stroke-width="4" fill="none" stroke-linecap="round"/>'),
    crown: svgIcon('<path d="M12 72 L18 30 L36 50 L50 20 L64 50 L82 30 L88 72 Z" fill="#F2C14E" stroke="#00325F" stroke-width="5" stroke-linejoin="round"/><rect x="12" y="74" width="76" height="10" rx="4" fill="#00519E"/>'),
    heart: svgIcon('<path d="M50 86 C22 66 8 52 8 34 C8 20 19 10 32 10 C40 10 46 14 50 20 C54 14 60 10 68 10 C81 10 92 20 92 34 C92 52 78 66 50 86 Z" fill="#C0392B"/>')
  };
  var SPEED = { slow: 0.78, fast: 1.1 };
  function offered() { return R.shelf().filter(function (b) { return !b.sample; }); }
  function isPreview() { var s = Lab._t && Lab._t.state; return !!(s && s.rec && s.rec.preview); }
  function stageEl() { return typeof document !== 'undefined' ? document.getElementById('stage') : null; }
  function isTwo() { var st = stageEl(); return !!(st && st.classList.contains('land')); }
  function isBig() { var st = stageEl(); return !!(st && st.classList.contains('big')); }
  function reducedMotion() { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  Reading.icons = ICON;

  /* ---------- the Bellatrix Play family look (upright tablet): the same line icons as Play ---------- */
  var PD = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    book: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13.5c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z"/><path d="M12 6.5V20"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r=".5"/><circle cx="4" cy="12" r=".5"/><circle cx="4" cy="18" r=".5"/>',
    play: '<path d="m8 5 11 7-11 7Z"/>', pause: '<path d="M9 6v12"/><path d="M15 6v12"/>',
    left: '<path d="m15 18-6-6 6-6"/>', chevron: '<path d="m9 18 6-6-6-6"/>', up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.6 2.3c-.8.5-1.3 1-1.3 2.2"/><path d="M12 17h.01"/>',
    close: '<path d="m6 6 12 12"/><path d="m18 6-12 12"/>',
    crown: '<path d="m3 7 4.5 4L12 4l4.5 7L21 7l-2 11H5Z"/><path d="M5 21h14"/>',
    heart: '<path d="M12 20.5C5.5 16 3 12.8 3 9.3 3 6.6 5 4.5 7.6 4.5c1.8 0 3.3.9 4.4 2.5 1.1-1.6 2.6-2.5 4.4-2.5C19 4.5 21 6.6 21 9.3c0 3.5-2.5 6.7-9 11.2Z"/>',
    speed: '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="m12 14 4-5"/><circle cx="12" cy="14" r="1.2"/>'
  };
  function pi(n, s, fill) {
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="' + (fill ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + PD[n] + '</svg>';
  }
  function ppIcons(s) { return '<span class="bp-i-play">' + pi('play', s, true) + '</span><span class="bp-i-pause">' + pi('pause', s, true) + '</span>'; }
  /* The upright tablet gets the family look; the wide head screen keeps the open book of 1.16. */
  function fam() { return !isTwo(); }
  function famOn(on) {
    if (typeof document === 'undefined') return;
    var st = stageEl(), app = document.getElementById('app');
    if (st) st.classList[on ? 'add' : 'remove']('bp-on');
    if (app) app.classList[on ? 'add' : 'remove']('bp-on');
  }
  /* The round arrows of a long page (pointing cannot swipe), as in Play. */
  function scrollArrows(root) {
    var sc = root.querySelector('[data-s="bk"]');
    if (!sc) return;
    function upd() {
      var max = sc.scrollHeight - sc.clientHeight, a = root.querySelector('.bp-arr-prev'), b = root.querySelector('.bp-arr-next');
      if (a) a.classList.toggle('off', sc.scrollTop <= 10);
      if (b) b.classList.toggle('off', sc.scrollTop >= max - 10);
    }
    sc.addEventListener('scroll', upd);
    upd();
  }
  function scrollBy(dir) {
    var sc = typeof document !== 'undefined' ? document.querySelector('#screen [data-s="bk"]') : null;
    if (!sc) return;
    var d = Math.round(sc.clientHeight * 0.8) * dir;
    try { sc.scrollBy({ top: d, behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch (e) { sc.scrollTop += d; }
  }

  Lab.define({
    key: 'reading', day: 16, name: 'Book reading', zone: 'ROSE_ROOM',
    flow: 'Books read aloud, page by page, in an open book.',
    learn: 'Reading comfort (text size, voice speed, page turning) and which books the resident chooses.',
    againQuestion: 'Would you like to read with me again another time?',
    art: function () { return '<span class="rdtileart">' + ICON.book + '</span>'; },
    content: [
      { id: 'speed', label: 'Reading speed', type: 'select', value: 'normal', options: [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']] },
      { id: 'turn', hide: true, label: 'Pages', type: 'select', value: 'auto', options: [['auto', 'Turn the page after reading'], ['manual', 'Wait for Next']] },
      /* 'books' (not the 1.15 'stories'): a list saved with the old tales does not hide the novels */
      { id: 'books', hide: true, label: 'Books that may be offered', type: 'checks', value: offered().map(function (b) { return b.id; }).join(','),
        options: offered().map(function (b) { return [b.id, b.title + ' (' + String(b.lang).toUpperCase() + (b.premium ? ', Premium' : '') + ')']; }) }
    ],
    start: function (L) {
      var lang = L.lang(), code = Lab.patient, preview = isPreview();
      var baseRate = Lab.opt.rate || 0.92, speedKey = L.text('speed') || 'normal', autoTurn = L.text('turn') !== 'manual';
      if (!SPEED[speedKey] && speedKey !== 'normal') speedKey = 'normal';
      var chosen = String(L.text('books') || '').split(',').filter(Boolean);
      var only = chosen.length ? chosen : null;
      var paused = false;
      function rate() { return SPEED[speedKey] || baseRate; }
      function done() { return { label: L.t('I’m done'), gesture: 'fist', words: ['done', 'finish', 'finished', 'enough'], noLabelWords: true, run: function () { L.finish(); } }; }

      /* ---------- the family look (upright tablet): one frame for every screen ----------
         A button of the page presses a choice or an action of the step (data-a, data-i), so touch,
         pointing, the voice and the hand signs all go the engine's usual way. The extra actions of
         the frame (tabs, Finish, speed, the round arrows) are marked nav: true. */
      function act(st, o) { o.nav = true; o.noLabelWords = true; o.words = o.words || []; st.actions.push(o); return st.actions.length - 1; }
      function aAttr(i) { return ' data-a="a" data-i="' + i + '" data-b="a-' + i + '"'; }
      function thumb(b, cls) { return '<span class="bk-thumb ' + cls + '">' + R.coverSvg(b) + '</span>'; }
      function finishAct(st) { var d = done(); delete d.gesture; return act(st, d); }
      function homeAct(st, busy) {
        return act(st, { label: L.t('Home'), words: ['home', 'other book', 'another book'], run: function () { if (busy && busy()) return; L.quiet(); L.go(bookList(0), { clear: true }); } });
      }
      /* o.nav: the action number behind each tab and behind Finish (-1: not possible now); o.tab: where we are */
      function frame(o) {
        function tab(key, icon, label) {
          var i = o.nav[key], on = o.tab === key;
          return '<button type="button" class="m-nav-item' + (on ? ' active' : '') + '"' + (on ? ' aria-current="page"' : i >= 0 ? aAttr(i) : ' disabled') + '>' + pi(icon, 24) + '<span>' + esc(label) + '</span></button>';
        }
        return '<div class="bp m-app bk' + (o.bar ? '' : ' bk-nobar') + (o.playing ? ' is-playing' : '') + '">' +
          '<aside class="m-sidebar"><div class="m-brand"><span>' + esc(L.t('Bellatrix Books')) + '</span></div><nav class="m-main-nav">' +
          tab('home', 'home', L.t('Home')) + tab('read', 'book', L.t('Reading')) + tab('chapters', 'list', L.t('Chapters')) + '</nav>' +
          '<div class="m-sidebar-help"><button type="button" class="m-help" data-a="help" data-b="help">' + pi('help', 22) + '<span><strong>' + esc(L.t('Need help?')).replace(/ ([?!:;])/g, '\u00a0$1') + '</strong></span></button>' +
          '<button type="button" class="m-end"' + aAttr(o.nav.finish) + '>' + pi('close', 18) + '<span>' + esc(L.t('Finish')) + '</span></button></div></aside>' +
          '<main class="m-main">' + o.main + '</main>' + (o.bar || '') + '</div>';
      }
      /* The step draws its own page (bodyFn, at every drawing); the stage takes Play's theme meanwhile. */
      function dress(st, bodyFn) {
        var enter = st.enter, leave = st.leave, after = st.after;
        st.cls = 'bp-screen bk-screen'; st.center = false;
        Object.defineProperty(st, 'body', { get: bodyFn, enumerable: true, configurable: true });
        st.enter = function () { famOn(true); if (enter) enter.apply(st, arguments); };
        st.leave = function () { famOn(false); if (leave) leave.apply(st, arguments); };
        st.after = function (el) { famOn(true); scrollArrows(el); if (after) after.apply(st, arguments); };
        return st;
      }
      /* One short line and its buttons, as Play's own messages (Bellatrix's face, or a picture). */
      function famMsg(st, pic) {
        if (!fam()) return st;
        st.actions = st.actions || [];
        return dress(st, function () {
          return '<div class="bp bp-msg bk">' + (pic || (Lab.faceHtml ? '<div class="bp-face">' + Lab.faceHtml('hero') + '</div>' : '')) +
            '<p class="bp-line">' + esc(st.title) + '</p>' + (st.lead ? '<p class="bk-lead">' + esc(st.lead) + '</p>' : '') + '<div class="bp-msgbtns">' +
            st.actions.map(function (a, i) { return '<button type="button" class="bp-msgbtn' + (a.primary ? ' is-pri' : '') + '"' + aAttr(i) + '>' + esc(a.label) + '</button>'; }).join('') + '</div></div>';
        });
      }

      /* ---------- the shelf ---------- */
      function available() {
        var favs = R.favsOf(code), pl = R.places(code);
        return R.shelfFor(lang, { only: only }).map(function (b, k) {
          var p = pl[b.id], reading = p && !p.done && (p.ch || p.para) ? 1 : 0;
          return { b: b, k: k, fav: favs.indexOf(b.id) >= 0 ? 1 : 0, reading: reading, at: p && p.at ? Date.parse(p.at) || 0 : 0 };
        }).sort(function (a, b) {
          /* the books being read first (the latest first), then favourites, then free before Premium */
          return (b.reading - a.reading) || (b.reading && a.reading ? b.at - a.at : 0) || (b.fav - a.fav) || ((a.b.premium ? 1 : 0) - (b.b.premium ? 1 : 0)) || a.k - b.k;
        }).map(function (x) { return x.b; });
      }
      function card(b, lock) {
        var prog = R.progressLabel(R.placeOf(code, b.id), b.chapters, L.t);
        return '<span class="rdshelf"><span class="rdcover">' + R.coverSvg(b) + '</span><span class="rdmeta"><span class="rdauthor">' + esc(b.author) + '</span>' +
          (prog ? '<span class="rdprog">' + esc(prog) + '</span>' : '') + (lock ? '<span class="rdlock">' + ICON.crown + '<span>Premium</span></span>' : '') + '</span></span>';
      }
      function bookList(pageNo) {
        /* the upright tablet shows every book at once (a grid of covers); the head screen three cards a page */
        var list = available(), family = fam(), per = family ? Math.max(1, list.length) : 3, count = Math.max(1, Math.ceil(list.length / per));
        pageNo = (pageNo || 0) % count;
        if (!list.length) return famMsg({ id: 'reading-nobook', title: L.t('No book is ready yet.'), center: true, actions: [done()] });
        var st = {
          id: 'reading-books', title: L.t('Which book shall we read?'), noReprompt: true, style: 'cards',
          say: L.t('Which book shall we read?'),
          choices: list.slice(pageNo * per, pageNo * per + per).map(function (b) {
            var lock = R.locked(b, code);
            return { label: b.title, value: b.id, art: card(b, lock), cls: 'rdbookcard' + (lock ? ' rdlocked' : b.premium ? ' rdprem' : ''),
              words: b.title.toLowerCase().split(/[^a-zà-ÿ]+/).filter(function (w) { return w.length > 3; }), noLabelWords: true,
              run: function () { L.push('readingChosen', b.id); if (lock) L.go(lockedStep(b)); else openBook(b); } };
          }),
          actions: (count > 1 ? [{ label: L.t('Other books'), words: ['other', 'more', 'next'], noLabelWords: true, run: function () { L.go(bookList(pageNo + 1), { replace: true }); } }] : []).concat([done()])
        };
        return family ? shelfLook(st, list) : st;
      }
      /* Home, like Play's: every book as a cover with this resident's progress, the ones being read
         first; the player bar carries the book last read (its big play button goes on reading it). */
      function shelfLook(st, list) {
        /* list: the books being read come first (available()), the latest one first */
        var pl = R.places(code), p0 = list.length ? pl[list[0].id] : null;
        var last = p0 && !p0.done && (p0.ch || p0.para) && !R.locked(list[0], code) ? list[0] : null, nav = { finish: st.actions.length - 1 };
        nav.read = last ? act(st, { label: L.t('Read on'), words: ['continue', 'read on', 'carry on'], run: function () { openBook(last); } }) : -1;
        nav.chapters = last ? act(st, { label: L.t('Chapters'), words: ['chapters'], run: function () { openBook(last, true); } }) : -1;
        var up = act(st, { label: L.t('Back'), run: function () { scrollBy(-1); } }), down = act(st, { label: L.t('More'), run: function () { scrollBy(1); } });
        function card(i) {
          var b = list[i], lock = R.locked(b, code), prog = R.progressLabel(pl[b.id], b.chapters, L.t);
          return '<article class="m-song-card' + (lock ? ' bk-locked' : '') + '"><button type="button" class="m-cover-wrap" data-a="c" data-i="' + i + '" data-b="c-' + i + '" aria-label="' + esc(b.title) + '">' +
            '<span class="m-cover bk-cover">' + R.coverSvg(b) + '</span><span class="m-card-play">' + (lock ? pi('crown', 21) : pi('play', 23, true)) + '</span></button>' +
            '<div class="m-song-info"><div><h3>' + esc(b.title) + '</h3><p>' + esc(b.author) + '</p>' +
            (prog ? '<p class="bk-prog">' + esc(prog) + '</p>' : lock ? '<p class="bk-prog">Premium</p>' : '') + '</div></div></article>';
        }
        return dress(st, function () {
          var p = last ? pl[last.id] : null, pct = p ? p.pct || 0 : 0;
          var main = '<div class="bp-sc bp-sc-v"><div class="bp-scin" data-s="bk" data-d="v">' +
            '<div class="m-topbar"><div><p class="m-eyebrow">' + esc(L.t('Your library')) + '</p><h1>' + esc(st.title) + '</h1></div></div>' +
            '<section class="m-content-section m-first"><div class="m-song-grid">' + list.map(function (b, i) { return card(i); }).join('') + '</div></section>' +
            '</div><button type="button" class="bp-arr bp-arr-prev off"' + aAttr(up) + ' aria-label="' + esc(L.t('Back')) + '">' + pi('up', 26) + '</button>' +
            '<button type="button" class="bp-arr bp-arr-next off"' + aAttr(down) + ' aria-label="' + esc(L.t('More')) + '">' + pi('down', 26) + '</button></div>';
          var bar = '<div class="m-player" role="region" aria-label="' + esc(L.t('Book reading')) + '"><div class="m-now-playing">' +
            (last ? thumb(last, 'm-np-img') + '<div><strong>' + esc(last.title) + '</strong><span>' + esc(R.progressLabel(p, last.chapters, L.t)) + '</span></div>'
              : '<span class="bp-art m-np-img">' + pi('book', 26) + '</span><div><strong>' + esc(L.t('Choose a book')) + '</strong><span>' + esc(L.t('Bellatrix Books')) + '</span></div>') + '</div>' +
            '<div class="m-player-center"><div class="m-transport"><button type="button" class="m-main-play"' + (last ? aAttr(nav.read) : ' disabled') + ' aria-label="' + esc(L.t('Read on')) + '">' + pi('play', 31, true) + '</button></div>' +
            '<div class="m-progress-row"><div class="m-progress"><i style="width:' + pct + '%"></i></div><span>' + pct + ' %</span></div></div></div>';
          return frame({ tab: 'home', nav: nav, main: main, bar: bar });
        });
      }
      /* A Premium book without books Premium: no price, only that the care team can be asked. */
      function lockedStep(b) {
        var wasAsked = R.asked(code), line = wasAsked ? L.t('The care team has been asked.') : L.t('You can ask the care team for this book.');
        var other = { label: L.t('Choose another book'), primary: wasAsked, noLabelWords: true, words: ['another', 'other book'], run: function () { L.go(bookList(0), { clear: true }); } };
        return famMsg({
          id: 'reading-locked', title: line, noReprompt: true,
          pic: '<span class="rdcrown">' + ICON.crown + '<b>' + esc(b.title) + '</b></span>', picCls: 'rdcrownbox',
          say: line,
          actions: wasAsked ? [other] : [
            { label: L.t('Ask the care team'), primary: true, words: ['ask', 'yes', 'ask the team'], noLabelWords: true,
              run: function () {
                if (!preview) R.ask(code);
                L.log('Premium book asked for (' + b.id + ', product books): the care team is told', 'result');
                L.stat('readingPremiumAsked', b.id);
                L.go(lockedStep(b), { replace: true });
              } },
            other
          ]
        }, '<div class="bk-lockcov">' + R.coverSvg(b) + '</div>');
      }
      /* Open a book: load its file if needed, then go straight to this resident's page. */
      /* chapters: straight to the list of chapters of that book (the Chapters tab of Home) */
      function openBook(entry, chapters) {
        var have = R.bookById(entry.id);
        if (have) { startBook(have, false, chapters); return; }
        var wait = famMsg({ id: 'reading-opening', title: L.t('One moment…'), center: true, noReprompt: true, say: '', actions: [] });
        L.go(wait);
        R.load(entry.id).then(function (b) { if (L.step() === wait) startBook(b, true, chapters); })
          .catch(function (e) {
            L.log('Book file not loaded (' + entry.id + '): ' + (e && e.message), 'app', 'error');
            if (L.step() === wait) L.go(famMsg({ id: 'reading-noopen', title: L.t('This book cannot be opened right now.'), center: true, noReprompt: true,
              actions: [{ label: L.t('Choose another book'), primary: true, noLabelWords: true, words: ['another', 'other book'], run: function () { L.go(bookList(0), { clear: true }); } }] }), { replace: true });
          });
      }
      function newState(b) {
        var two = isTwo();
        return { b: b, two: two, size: R.pageSize(two, isBig()), cache: {}, fit: 0 };
      }
      /* Only the window on the screen (a few thousand characters of the chapter) and the ones just
         around it are cut into pages; never a whole chapter. */
      function seg(bk, c, k) {
        var key = c + ':' + (k || 0);
        if (!bk.cache[key]) {
          bk.cache[key] = R.windowPages(bk.b, c, k || 0, bk.size);
          bk.order = (bk.order || []).filter(function (x) { return x !== key; }).concat([key]);
          while (bk.order.length > 4) delete bk.cache[bk.order.shift()];
        }
        return bk.cache[key];
      }
      function counts(bk) { return function (c, k) { return R.viewCount(seg(bk, c, k).length, bk.two); }; }
      function windows(bk) { return function (c) { return R.windowsOf(bk.b.chapters[c]).length; }; }
      /* The view that shows paragraph para of chapter c. */
      function posAt(bk, c, para) {
        var k = R.windowOfPara(bk.b.chapters[c], para), pg = R.pageAtPara(seg(bk, c, k), para);
        return { c: c, k: k, v: R.viewOfPage(pg, bk.two) };
      }
      function startBook(b, replace, chapters) {
        var bk = newState(b), p = R.placeOf(code, b.id), pos = { c: 0, k: 0, v: 0 }, intro = '';
        if (p && !p.done && (p.ch || p.para) && p.ch < b.chapters.length) {
          pos = posAt(bk, p.ch, p.para);
          intro = L.t('We carry on at page {n}.', { n: R.pageNumber(b, p.ch, p.para, bk.size) });
        }
        L.go(chapters ? chaptersStep(bk, pos) : view(bk, pos, intro), replace ? { replace: true } : undefined);
      }

      /* ---------- the open book ---------- */
      function pageInner(bk, c, k, i) {
        var pgs = seg(bk, c, k), pg = pgs[i], first = true, start = !k && i === 0;
        var html = (c === 0 && start ? '<p class="rdby">' + esc(bk.b.author) + '</p>' : '') + pg.parts.map(function (x) {
          if (x.head) return '<h3' + (x.chapter ? ' class="rdchap"' : '') + '>' + esc(x.head) + '</h3>';
          if (x.lines) return '<p class="stanza">' + x.lines.map(function (l) { return '<span class="vl">' + esc(l) + '</span>'; }).join('') + '</p>';
          var cls = start && first && !x.cont ? ' class="rdfirst"' : '';
          first = false;
          return '<p' + cls + (x.cont ? ' data-cont="1"' : '') + '>' + esc(x.p) + '</p>';
        }).join('');
        if (c === bk.b.chapters.length - 1 && k === R.windowsOf(bk.b.chapters[c]).length - 1 && i === pgs.length - 1) html += '<p class="rdfin" aria-hidden="true">* * *</p>';
        /* the folio: where this page is in the book, in per cent (page numbers would need the whole book cut) */
        return '<div class="rdtx" lang="' + esc(bk.b.lang) + '">' + html + '</div><span class="rdfolio">' + R.percentAt(bk.b, c, R.paraOfPage(pg)) + ' %</span>';
      }
      /* One page of paper: ref = { c, k, i } or null (blank); side L (left of the spine) or R. */
      function pageHtml(bk, ref, side) {
        if (!ref || typeof ref !== 'object' || ref.i < 0 || ref.i >= seg(bk, ref.c, ref.k).length) return '<div class="rdpg ' + side + ' blank"></div>';
        return '<div class="rdpg ' + side + (!ref.k && ref.i === 0 ? ' first' : '') + '">' + pageInner(bk, ref.c, ref.k, ref.i) + '</div>';
      }
      function refs(bk, pos) { return R.viewPages(seg(bk, pos.c, pos.k).length, pos.v, bk.two).map(function (i) { return i < 0 ? null : { c: pos.c, k: pos.k || 0, i: i }; }); }
      function bookHtml(bk, pos) {
        var r = refs(bk, pos);
        return '<div class="rdbook ' + (bk.two ? 'two' : 'one') + (bk.fit > 0 ? ' fit' + bk.fit : '') + '"><div class="rdblock">' +
          (bk.two ? '<div class="rdside L">' + pageHtml(bk, r[0], 'L') + '</div><div class="rdside R">' + pageHtml(bk, r[1], 'R') + '</div>'
            : '<div class="rdside R">' + pageHtml(bk, r[0], 'R') + '</div>') + '</div></div>';
      }
      /* The leaf that turns: STRIPS nested strips, each showing its slice of the front page and,
         mirrored, of the back page; css/reading.css bends them (rdk0…rdk7) and shades them. */
      function leafHtml(frontHtml, backHtml) {
        var open = '', close = '';
        for (var k = 0; k < STRIPS; k++) {
          open += '<div class="rdst s' + k + '"><div class="rdf"><div class="rdfc" style="left:calc(' + (-k) + ' * (100% - 1px))">' + frontHtml + '</div><i class="rdsh"></i></div>' +
            '<div class="rdb"><div class="rdfc" style="left:calc(' + (-(STRIPS - 1 - k)) + ' * (100% - 1px))">' + backHtml + '</div><i class="rdsh"></i></div>';
          close += '</div>';
        }
        return '<div class="rdleaf">' + open + close + '</div>';
      }
      /* The type gets a little smaller when a page on the screen is too full (levels 0 to 3,
         css/reading.css .fit1 … .fit3). Only the pages on the screen are measured; the level of a
         book only goes down, so the type does not jump back and forth. */
      function measureFit(bk, el, pos) {
        var b = el.querySelector('.rdbook'), side = b && b.querySelector('.rdside');
        if (!b || !side) return bk.fit;
        var probe = document.createElement('div'), lv, list = refs(bk, pos).filter(function (r) { return r; });
        side.appendChild(probe);
        for (lv = bk.fit; lv <= 3; lv++) {
          b.className = b.className.replace(/\s*fit\d/g, '') + (lv ? ' fit' + lv : '');
          var over = false;
          for (var i = 0; i < list.length && !over; i++) {
            probe.className = 'rdpg R rdprobe' + (!list[i].k && list[i].i === 0 ? ' first' : '');
            probe.innerHTML = pageInner(bk, list[i].c, list[i].k, list[i].i);
            var tx = probe.firstChild;
            over = tx.scrollHeight > tx.clientHeight + 2;
          }
          if (!over || lv === 3) break;
        }
        side.removeChild(probe);
        b.className = b.className.replace(/\s*fit\d/g, '') + (lv ? ' fit' + lv : '');
        return lv;
      }
      /* The chapters, with "From the beginning" (a small button of the reading screen opens it). */
      function chaptersStep(bk, pos, listPage) {
        var family = fam(), n = bk.b.chapters.length, per = family ? 8 : 4, count = Math.max(1, Math.ceil(n / per));
        listPage = listPage === undefined ? Math.floor(pos.c / per) : listPage % count;
        var acts = [{ label: L.t('From the beginning'), noLabelWords: true, words: ['beginning', 'start again', 'from the start'],
          run: function () { L.go(view(bk, { c: 0, k: 0, v: 0 }), { replace: true }); } }];
        if (count > 1) acts.unshift({ label: L.t('Other chapters'), noLabelWords: true, words: ['other', 'more', 'next'], run: function () { L.go(chaptersStep(bk, pos, listPage + 1), { replace: true }); } });
        var st = {
          id: 'reading-chapters', title: L.t('Chapters'), noReprompt: true, say: L.t('Chapters'),
          choices: bk.b.chapters.slice(listPage * per, listPage * per + per).map(function (ch, k) {
            var c = listPage * per + k;
            return { label: ch.title || L.t('Chapter {n}', { n: c + 1 }), value: 'ch' + c, cls: c === pos.c ? 'rdchnow' : '', icon: ICON.book,
              words: [String(c + 1)], noLabelWords: true, run: function () { L.go(view(bk, { c: c, k: 0, v: 0 }), { replace: true }); } };
          }),
          actions: acts
        };
        if (!family) return st;
        /* the list as Play's lists; under it the one or two buttons of the step; the tabs lead back */
        var nMain = st.actions.length, nav = { home: homeAct(st) };
        nav.read = act(st, { label: L.t('Reading'), words: ['read', 'the book'], run: function () { L.go(view(bk, pos), { replace: true }); } });
        nav.finish = finishAct(st);
        return dress(st, function () {
          var main = '<div class="bp-sc bp-sc-v"><div class="bp-scin" data-s="bk" data-d="v">' +
            '<div class="m-topbar"><div><p class="m-eyebrow">' + esc(bk.b.title) + '</p><h1>' + esc(st.title) + '</h1></div></div><div class="m-history-list">' +
            st.choices.map(function (c, k) {
              return '<button type="button" class="m-history-row bk-chrow' + (c.cls ? ' is-cur' : '') + '" data-a="c" data-i="' + k + '" data-b="c-' + k + '"><span class="bk-chno">' + (listPage * per + k + 1) + '</span>' +
                '<span class="m-history-song"><strong>' + esc(c.label) + '</strong></span><span class="m-history-play">' + pi('play', 18, true) + '</span></button>';
            }).join('') + '</div><div class="bk-more">' +
            st.actions.slice(0, nMain).map(function (a, i) { return '<button type="button" class="m-ai-new"' + aAttr(i) + '>' + esc(a.label) + '</button>'; }).join('') + '</div></div></div>';
          return frame({ tab: 'chapters', nav: nav, main: main });
        });
      }

      function view(bk, pos, intro) {
        var b = bk.b, two = bk.two, pgs = seg(bk, pos.c, pos.k), n = pgs.length, nch = b.chapters.length;
        pos = { c: pos.c, k: pos.k || 0, v: Math.max(0, Math.min(R.viewCount(n, two) - 1, pos.v)) };
        var vp = R.viewPages(n, pos.v, two).filter(function (i) { return i >= 0; });
        var nextPos = R.stepFrom(pos, 1, nch, counts(bk), windows(bk)), prevPos = R.stepFrom(pos, -1, nch, counts(bk), windows(bk)), last = !nextPos;
        var prem = R.premiumOn(code), fav = R.favsOf(code).indexOf(b.id) >= 0, turning = false, st, family = fam();
        var text = vp.map(function (i) { return R.pageText(pgs[i]); }).join(' ');
        var para = R.paraOfPage(pgs[vp[0]]);
        if (!preview) R.savePlace(code, b.id, { ch: pos.c, para: para, pct: R.percentAt(b, pos.c, para) });
        L.stat('readingPages');
        var pct = R.percentAt(b, pos.c, para);
        var pageLine = nch > 1 ? L.t('Chapter {n} · {p} %', { n: pos.c + 1, p: pct }) : L.t('{p} %', { p: pct });
        /* one small extra button: the chapters (with "From the beginning"), or "From the beginning" for one chapter */
        var extra = nch > 1 ? '<button type="button" class="rdmini" data-rdchapters="1">' + esc(L.t('Chapters')) + '</button>'
          : (pos.v > 0 || pos.k > 0 ? '<button type="button" class="rdmini" data-rdstart="1">' + esc(L.t('From the beginning')) + '</button>' : '');
        var readFrom = 0;
        /* The family feed (js/family-sync.js, with the resident's consent) shows what was read. */
        function tellFamily() {
          if (!readFrom || preview || typeof FamilySync === 'undefined' || !FamilySync || !FamilySync.listen) return;
          var s = Math.round((Date.now() - readFrom) / 1000);
          readFrom = 0;
          try { FamilySync.listen({ type: 'book', code: code, title: b.title, artist: b.author, start: new Date(Date.now() - s * 1000).toISOString(), durationS: s, activity: 'reading' }); } catch (e) { /* the feed is optional */ }
        }
        function afterRead() {
          tellFamily();
          if (paused || !autoTurn || L.step() !== st) return;
          /* a short pause, as a hand would take, then the page turns */
          L.later(function () { if (!paused) turn(1); }, AUTO_WAIT_MS);
        }
        function speakIt() { Lab.opt.rate = rate(); readFrom = Date.now(); L.say(R.spoken(text, b.lang), afterRead); }
        function setSpeed(k) {
          speedKey = k;
          L.stat('readingSpeed', speedKey); L.log('Reading speed: ' + speedKey, 'app');
          paused = false; st.actions[2].label = L.t('Pause');
          L.refresh(); speakIt();
        }
        function turn(dir) {
          if (turning) return;
          if (dir > 0 && last) { L.quiet(); L.go(theEnd(bk), { replace: true }); return; }
          var to = dir > 0 ? nextPos : prevPos;
          if (!to) return;
          turning = true;
          L.quiet();
          var blk = typeof document !== 'undefined' ? document.querySelector('#screen .rdblock') : null;
          if (!blk || reducedMotion()) { L.go(view(bk, to), { replace: true }); return; }
          var plan = R.turnBetween(refs(bk, pos), refs(bk, to), dir, two);
          var sides = blk.querySelectorAll('.rdside');
          var right = sides[sides.length - 1], left = two ? sides[0] : null;
          /* the pages under the leaf, then the leaf itself and the shadows it casts */
          right.innerHTML = pageHtml(bk, plan.right, 'R') + '<i class="rdcast r"></i>';
          if (left) left.innerHTML = pageHtml(bk, plan.left, 'L') + '<i class="rdcast l"></i>';
          blk.insertAdjacentHTML('beforeend', leafHtml(pageHtml(bk, plan.front, 'R'), pageHtml(bk, plan.back, two ? 'L' : 'R back')));
          var leaf = blk.lastChild, casts = blk.querySelectorAll('.rdcast'), ms = plan.reverse ? BACK_MS : TURN_MS;
          blk.parentNode.style.setProperty('--rd-turn', ms + 'ms');
          void leaf.offsetWidth;
          leaf.className += ' go' + (plan.reverse ? ' rev' : '');
          Array.prototype.forEach.call(casts, function (c) { c.className += ' go' + (plan.reverse ? ' rev' : ''); });
          L.later(function () { L.go(view(bk, to), { replace: true }); }, ms + 40);
        }
        st = {
          id: 'reading-page', cls: 'rdreader', title: b.title, noReprompt: true,
          body: bookHtml(bk, pos) +
            '<div class="rdtools"><span class="rdspeed" role="group" aria-label="' + esc(L.t('Reading speed')) + '">' +
            [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']].map(function (o) {
              return '<button type="button" class="rdsp' + (speedKey === o[0] ? ' on' : '') + '" data-rdspeed="' + o[0] + '" aria-pressed="' + (speedKey === o[0]) + '">' + esc(L.t(o[1])) + '</button>';
            }).join('') + '</span>' + extra +
            (prem ? '<button type="button" class="rdfav' + (fav ? ' on' : '') + '" data-rdfav="1" aria-pressed="' + fav + '">' + ICON.heart + '<span>' + esc(fav ? L.t('In my favourites') : L.t('Favourite')) + '</span></button>' : '') +
            '<span class="rdpageno">' + esc(pageLine) + '</span></div>',
          say: function () { Lab.opt.rate = rate(); readFrom = Date.now(); var s = R.spoken(text, b.lang); return intro ? intro + ' ' + s : s; },
          afterSay: afterRead,
          enter: function () { paused = false; },
          leave: function () { Lab.opt.rate = baseRate; intro = ''; },
          after: function (el) {
            /* The screen turned (upright / wide): open the book again at the same paragraph. */
            if (isTwo() !== two) {
              L.later(function () {
                var nb = newState(b);
                L.go(view(nb, posAt(nb, pos.c, para)), { replace: true, silent: true });
              }, 0);
              return;
            }
            bk.fit = measureFit(bk, el, pos);
            Array.prototype.forEach.call(el.querySelectorAll('[data-rdspeed]'), function (btn) {
              btn.addEventListener('click', function () {
                if (turning) return;
                setSpeed(btn.getAttribute('data-rdspeed'));
              });
            });
            var f = el.querySelector('[data-rdfav]');
            if (f) f.addEventListener('click', function () { if (turning) return; if (!preview) R.toggleFav(code, b.id); L.go(view(bk, pos), { replace: true, silent: true }); });
            var ch = el.querySelector('[data-rdchapters]');
            if (ch) ch.addEventListener('click', function () { if (turning) return; L.quiet(); L.go(chaptersStep(bk, pos)); });
            var sb = el.querySelector('[data-rdstart]');
            if (sb) sb.addEventListener('click', function () { if (turning) return; L.quiet(); L.go(view(bk, { c: 0, k: 0, v: 0 }), { replace: true }); });
          },
          actions: [
            { label: L.t('Previous page'), pair: true, disabled: !prevPos, words: ['previous', 'back a page'], noLabelWords: true, run: function () { turn(-1); } },
            { label: last ? L.t('The end') : L.t('Next page'), pair: true, primary: true, words: ['next', 'next page', 'turn'], noLabelWords: true, run: function () { turn(1); } },
            { label: L.t('Pause'), cls: 'soft', words: ['pause', 'wait', 'continue', 'go on'], noLabelWords: true,
              run: function (src, a) {
                if (turning) return;
                paused = !paused;
                if (paused) { L.quiet(); a.label = L.t('Read on'); L.refresh(); }
                else { a.label = L.t('Pause'); L.refresh(); speakIt(); }
              } }
          ]
        };
        /* for the tests and the demo: where this view is, and the chapters screen */
        st.reading = { book: b.id, chapter: pos.c, window: pos.k, view: pos.v, pages: vp.slice(), total: n, para: para, pct: pct };
        st.chapters = function () { return chaptersStep(bk, pos); };
        if (!family) return st;
        /* The upright tablet: the page, and under it Play's player bar with the cover, the title, where
           we are, Previous page / the big play or pause / Next page, the progress and the speed (one
           button: slow, normal, fast, in turn). Tabs: Home (the shelf), Reading, Chapters. */
        function busy() { return turning; }
        var nav = { home: homeAct(st, busy) };
        nav.chapters = act(st, { label: L.t('Chapters'), words: ['chapters'], run: function () { if (turning) return; L.quiet(); L.go(chaptersStep(bk, pos)); } });
        var sp = act(st, { label: L.t('Reading speed'), words: ['speed'], run: function () { if (turning) return; setSpeed(speedKey === 'slow' ? 'normal' : speedKey === 'normal' ? 'fast' : 'slow'); } });
        var fv = prem ? act(st, { label: L.t('Favourite'), run: function () { if (turning) return; if (!preview) fav = R.toggleFav(code, b.id); L.refresh(); } }) : -1;
        nav.finish = finishAct(st);
        paused = false;
        return dress(st, function () {
          var main = '<div class="bk-read">' + bookHtml(bk, pos) + '</div>';
          var bar = '<div class="m-player" role="region" aria-label="' + esc(L.t('Book reading')) + '"><div class="m-now-playing">' + thumb(b, 'm-np-img') +
            '<div><strong>' + esc(b.title) + '</strong><span>' + esc(pageLine) + '</span></div>' +
            (fv >= 0 ? '<button type="button" class="m-like' + (fav ? ' liked' : '') + '"' + aAttr(fv) + ' aria-pressed="' + fav + '" aria-label="' + esc(fav ? L.t('In my favourites') : L.t('Add to my favourites')) + '">' + pi('heart', 24, fav) + '</button>' : '') + '</div>' +
            '<div class="m-player-center"><div class="m-transport">' +
            '<button type="button" class="bk-turn"' + aAttr(0) + (prevPos ? '' : ' disabled') + '>' + pi('left', 25) + '<span>' + esc(st.actions[0].label) + '</span></button>' +
            '<button type="button" class="m-main-play bp-pp"' + aAttr(2) + ' aria-label="' + esc(st.actions[2].label) + '">' + ppIcons(31) + '</button>' +
            '<button type="button" class="bk-turn"' + aAttr(1) + '><span>' + esc(st.actions[1].label) + '</span>' + pi('chevron', 25) + '</button></div>' +
            '<div class="m-progress-row"><div class="m-progress"><i style="width:' + pct + '%"></i></div><span>' + pct + ' %</span></div></div>' +
            '<div class="m-player-tools"><button type="button" class="m-tool-button"' + aAttr(sp) + ' aria-label="' + esc(L.t('Reading speed')) + '">' + pi('speed', 21) +
            '<span>' + esc(L.t(speedKey === 'slow' ? 'Slow' : speedKey === 'fast' ? 'Fast' : 'Normal')) + '</span></button></div></div>';
          return frame({ tab: 'read', nav: nav, main: main, bar: bar, playing: !paused });
        });
      }
      function theEnd(bk) {
        var b = bk.b;
        if (!preview) R.savePlace(code, b.id, { ch: 0, para: 0, pct: 100, done: true });
        L.push('readingFinished', b.id);
        var prem = R.premiumOn(code), fav = R.favsOf(code).indexOf(b.id) >= 0;
        return famMsg({
          id: 'reading-end', title: L.t('The end of the book.'), lead: b.title, center: true, back: false, noReprompt: true,
          say: L.t('The end of the book.'),
          actions: [
            { label: L.t('Another book'), primary: true, words: ['another', 'another book', 'more'], noLabelWords: true, run: function () { L.go(bookList(0), { clear: true }); } },
            done()
          ].concat(prem ? [{ label: fav ? L.t('In my favourites') : L.t('Add to my favourites'), icon: ICON.heart, cls: 'soft rdfavbtn' + (fav ? ' on' : ''), noLabelWords: true,
            run: function () { if (!preview) R.toggleFav(code, b.id); L.go(theEnd(bk), { replace: true, silent: true }); } }] : [])
        });
      }
      return bookList(0);
    }
  });
})();
