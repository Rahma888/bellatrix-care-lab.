/* Bellatrix Atelier - the game engine.
   A game made in the Atelier is DATA, never code: a small JSON "spec" (type + title + items) that this one
   engine plays. Six templates, all with a few big buttons (touch or pointing from a distance):
     quiz    a question and 2 to 4 answers
     sort    a word goes into one of two categories
     pairs   face-down cards, find the two that belong together
     saying  finish the sentence
     odd     which one does not belong
     order   put the steps in the right order
   The specs are kept on this device (localStorage "bellatrix-atelier-games") and checked again each
   time they are read: a spec that is not exactly what this file allows is ignored.
   On the Care Team and patient pages (where Lab exists) every saved game becomes an activity like the
   others: it shows in the Care Team's list and starts on the patient screen the same way.
   Plain ES5 (old Android WebView). Also loaded by Node for the tests and by labland/atelier.mjs. */
var AtelierEngine = (function () {
  'use strict';
  var KEY = 'bellatrix-atelier-games';
  var TYPES = ['quiz', 'sort', 'pairs', 'saying', 'odd', 'order'];
  var LANGS = ['en', 'fr', 'de'];
  var MAX_GAMES = 40;
  var TOP_KEYS = ['v', 'id', 'type', 'title', 'lang', 'cats', 'items', 'created', 'source', 'prompt'];
  var ITEM_KEYS = { quiz: ['q', 'a', 'wrong'], sort: ['t', 'c'], pairs: ['a', 'b'], saying: ['start', 'end', 'wrong'], odd: ['set', 'odd', 'why'], order: ['q', 'steps'] };
  var COUNT = { quiz: [2, 12], sort: [4, 16], pairs: [3, 6], saying: [2, 12], odd: [2, 10], order: [1, 6] };

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function low(s) { return String(s).toLowerCase(); }

  /* ---------- validation: strict, and it returns a clean copy ---------- */
  function Bad(msg) { this.message = msg; }
  function fail(msg) { throw new Bad(msg); }
  /* One line of plain text, 1 to max characters. */
  function text(v, max, what) {
    if (typeof v !== 'string') fail(what + ' is not a text');
    var s = v.replace(/\s+/g, ' ').trim();
    if (!s) fail(what + ' is empty');
    if (s.length > max) fail(what + ' is too long');
    if (/[\u0000-\u001f\u007f\u2028\u2029]/.test(s)) fail(what + ' has control characters');
    return s;
  }
  function onlyKeys(o, keys, what) {
    if (!isObj(o)) fail(what + ' is not an object');
    for (var k in o) if (has(o, k) && keys.indexOf(k) < 0) fail(what + ' has an unknown field: ' + k);
  }
  function distinct(list, what) {
    var seen = {};
    list.forEach(function (s) { var k = low(s); if (seen[k]) fail(what + ' repeats "' + s + '"'); seen[k] = true; });
  }
  function texts(v, min, max, len, what) {
    if (!Array.isArray(v) || v.length < min || v.length > max) fail(what + ' needs ' + min + ' to ' + max + ' entries');
    return v.map(function (x, i) { return text(x, len, what + ' ' + (i + 1)); });
  }
  var ITEM = {
    quiz: function (it, w) {
      var o = { q: text(it.q, 110, w + ' question'), a: text(it.a, 44, w + ' answer'), wrong: texts(it.wrong, 1, 3, 44, w + ' wrong answer') };
      distinct([o.a].concat(o.wrong), w);
      return o;
    },
    sort: function (it, w) {
      if (it.c !== 0 && it.c !== 1) fail(w + ' category must be 0 or 1');
      return { t: text(it.t, 36, w + ' word'), c: it.c };
    },
    pairs: function (it, w) {
      var a = text(it.a, 22, w + ' card');
      return { a: a, b: it.b === undefined ? a : text(it.b, 22, w + ' second card') };
    },
    saying: function (it, w) {
      var o = { start: text(it.start, 90, w + ' start'), end: text(it.end, 36, w + ' ending'), wrong: it.wrong === undefined ? [] : texts(it.wrong, 0, 2, 36, w + ' wrong ending') };
      distinct([o.end].concat(o.wrong), w);
      return o;
    },
    odd: function (it, w) {
      var o = { set: texts(it.set, 3, 3, 28, w + ' word'), odd: text(it.odd, 28, w + ' odd one') };
      if (it.why !== undefined) o.why = text(it.why, 90, w + ' reason');
      distinct(o.set.concat([o.odd]), w);
      return o;
    },
    order: function (it, w) {
      var o = { q: text(it.q, 90, w + ' title'), steps: texts(it.steps, 3, 5, 40, w + ' step') };
      distinct(o.steps, w);
      return o;
    }
  };
  function check(raw) {
    onlyKeys(raw, TOP_KEYS, 'The game');
    if (raw.v !== undefined && raw.v !== 1) fail('Unknown version');
    if (TYPES.indexOf(raw.type) < 0) fail('Unknown type of game');
    if (LANGS.indexOf(raw.lang) < 0) fail('Unknown language');
    var type = raw.type, out = { v: 1, type: type, lang: raw.lang, title: text(raw.title, 40, 'The title') };
    if (raw.id !== undefined) { if (typeof raw.id !== 'string' || !/^[a-z0-9]{4,16}$/.test(raw.id)) fail('Bad id'); out.id = raw.id; }
    if (raw.created !== undefined) { if (typeof raw.created !== 'string' || !/^[0-9T:.\-Z]{10,30}$/.test(raw.created)) fail('Bad date'); out.created = raw.created; }
    if (raw.source !== undefined) { if (['offline', 'ai', 'manual'].indexOf(raw.source) < 0) fail('Bad source'); out.source = raw.source; }
    if (raw.prompt !== undefined) out.prompt = text(raw.prompt, 200, 'The request');
    if (type === 'sort') {
      out.cats = texts(raw.cats, 2, 2, 28, 'Category');
      distinct(out.cats, 'The categories');
    } else if (raw.cats !== undefined) fail('Only a sorting game has categories');
    var lim = COUNT[type];
    if (!Array.isArray(raw.items) || raw.items.length < lim[0] || raw.items.length > lim[1]) fail('This game needs ' + lim[0] + ' to ' + lim[1] + ' items');
    out.items = raw.items.map(function (it, i) {
      var w = 'Item ' + (i + 1);
      onlyKeys(it, ITEM_KEYS[type], w);
      return ITEM[type](it, w);
    });
    if (type === 'sort') {
      distinct(out.items.map(function (it) { return it.t; }), 'The words');
      [0, 1].forEach(function (c) { if (out.items.filter(function (it) { return it.c === c; }).length < 2) fail('Each category needs at least 2 words'); });
    }
    if (type === 'pairs') {
      var faces = [];
      out.items.forEach(function (it) { faces.push(it.a); if (low(it.b) !== low(it.a)) faces.push(it.b); });
      distinct(faces, 'The cards');
    }
    if (type === 'saying') {
      var ends = {};
      out.items.forEach(function (it) { ends[low(it.end)] = true; });
      if (Object.keys(ends).length < 2 && out.items.some(function (it) { return !it.wrong.length; })) fail('The sayings need different endings');
    }
    return out;
  }
  /* { ok: true, spec: clean copy } or { ok: false, error: 'why' }. Never throws. */
  function validate(raw) {
    try { return { ok: true, spec: check(raw) }; }
    catch (e) { return { ok: false, error: e instanceof Bad ? e.message : 'Not a game' }; }
  }

  /* ---------- the words of the engine, in the language of the game ---------- */
  function tr(lang) {
    return function (s, vars) {
      if (typeof I18N !== 'undefined') return I18N.t(lang, s, vars);
      return String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] !== undefined ? String(vars[k]) : m; });
    };
  }
  var PRAISE = ['Yes, that is right!', 'Well done!', 'Lovely, that is it!'];

  /* ---------- the game itself: no screen, only state (so it can be tested without a browser) ---------- */
  function shuffled(list, rng) {
    var a = list.slice(), i, j, x;
    for (i = a.length - 1; i > 0; i--) { j = Math.floor(rng() * (i + 1)); x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }
  function glue(start) { return /[’'\-]$/.test(start) ? '' : ' '; }
  function rounds(spec, rng, T) {
    var items = spec.items;
    if (spec.type === 'quiz') return items.map(function (it) {
      return { title: it.q, opts: shuffled([it.a].concat(it.wrong), rng), right: it.a, answer: it.a };
    });
    if (spec.type === 'sort') return shuffled(items, rng).map(function (it) {
      return { title: T('Where does it belong?'), big: it.t, opts: spec.cats.slice(), right: spec.cats[it.c], answer: it.t + ' – ' + spec.cats[it.c] };
    });
    if (spec.type === 'saying') return items.map(function (it, i) {
      var wrong = it.wrong.slice();
      shuffled(items, rng).forEach(function (o, k) {
        if (wrong.length < 2 && o !== it && low(o.end) !== low(it.end) && wrong.map(low).indexOf(low(o.end)) < 0) wrong.push(o.end);
      });
      return { title: T('Finish the sentence.'), big: it.start + ' …', opts: shuffled([it.end].concat(wrong), rng), right: it.end, answer: it.start + glue(it.start) + it.end, n: i };
    });
    if (spec.type === 'odd') return items.map(function (it) {
      return { title: T('Which one does not belong?'), opts: shuffled(it.set.concat([it.odd]), rng), right: it.odd, answer: it.odd, why: it.why || '' };
    });
    if (spec.type === 'order') return items.map(function (it) {
      var o = shuffled(it.steps, rng);
      /* never already in the right order */
      if (o.join('\n') === it.steps.join('\n')) o.push(o.shift());
      return { title: it.q, opts: o, steps: it.steps, answer: it.steps.join(' · ') };
    });
    return [];
  }
  function create(spec, o) {
    o = o || {};
    var rng = o.rng || Math.random, T = tr(spec.lang);
    var list = rounds(spec, rng, T), i = 0, tries = 0, tried = {}, done = [], revealed = false, ended = false;
    var score = { rounds: spec.type === 'pairs' ? 1 : list.length, firstTry: 0, notQuite: 0 };
    /* pairs: one board */
    var cards = [], up = [], pending = false, found = 0;
    if (spec.type === 'pairs') {
      spec.items.forEach(function (it, p) { cards.push({ label: it.a, pair: p, state: 'down' }); cards.push({ label: it.b, pair: p, state: 'down' }); });
      cards = shuffled(cards, rng);
    }
    function view() {
      if (ended) return { kind: 'end', type: spec.type, title: T('Well done!'), score: score };
      if (spec.type === 'pairs') {
        return { kind: 'round', type: 'pairs', n: 1, total: 1, title: T('Find the pairs'), revealed: revealed,
          cards: cards.map(function (c) { return { label: c.label, state: c.state }; }), found: found, pairs: spec.items.length };
      }
      var r = list[i];
      return { kind: 'round', type: spec.type, n: i + 1, total: list.length, revealed: revealed,
        title: r.title,
        big: r.big || '', answer: r.answer, why: r.why || '',
        hint: spec.type === 'order' ? T(done.length ? 'What comes next?' : 'What comes first?') : '',
        options: r.opts.map(function (label) {
          var k = done.indexOf(label);
          return { label: label, state: k >= 0 ? 'done' : tried[label] ? 'tried' : 'idle', pos: k + 1 };
        }) };
    }
    function settle() {
      if (!pending) return false;
      up.forEach(function (k) { cards[k].state = 'down'; });
      up = []; pending = false;
      return true;
    }
    /* What a tap did: right (the round is solved), wrong, step (order: one more in place),
       flip, match, nomatch (pairs), or null when the tap means nothing. */
    function pick(k) {
      if (ended || revealed) return null;
      if (spec.type === 'pairs') {
        settle();
        var c = cards[k];
        if (!c || c.state !== 'down') return null;
        c.state = 'up'; up.push(k);
        if (up.length < 2) return 'flip';
        var a = cards[up[0]];
        if (a.pair === c.pair) {
          a.state = c.state = 'found'; up = []; found++;
          if (found === spec.items.length) { revealed = true; score.firstTry = 1; return 'right'; }
          return 'match';
        }
        a.state = c.state = 'wrong'; pending = true; score.notQuite++;
        return 'nomatch';
      }
      var r = list[i], label = r.opts[k];
      if (label === undefined || tried[label] || done.indexOf(label) >= 0) return null;
      if (spec.type === 'order') {
        if (label !== r.steps[done.length]) { tries++; score.notQuite++; return 'wrong'; }
        done.push(label);
        if (done.length < r.steps.length) return 'step';
      } else if (label !== r.right) {
        tried[label] = true; tries++; score.notQuite++;
        return 'wrong';
      }
      if (!tries) score.firstTry++;
      revealed = true;
      return 'right';
    }
    function show() { if (ended || revealed || spec.type === 'pairs') return false; revealed = true; return true; }
    function advance() {
      if (ended) return false;
      if (!revealed) return false;
      revealed = false; tries = 0; tried = {}; done = [];
      if (spec.type === 'pairs' || i + 1 >= list.length) ended = true; else i++;
      return true;
    }
    return { spec: spec, view: view, pick: pick, settle: settle, show: show, advance: advance, isEnded: function () { return ended; }, score: score, praise: function () { return T(PRAISE[i % PRAISE.length]); }, T: T };
  }

  /* ---------- the same HTML as the patient screen (css/lab.css), for the preview in the Atelier ---------- */
  function bigCard(t, cls) { return '<div class="sayingcard atcard' + (cls ? ' ' + cls : '') + '"><p class="saytext' + (t.length > 40 ? ' atlong' : '') + '">' + esc(t) + '</p></div>'; }
  function gridCls(n) { return n <= 6 ? 'g6' : n <= 8 ? 'g8' : 'g12'; }
  function cardCls(st) { return st === 'down' ? 'back' : st === 'found' ? 'up found' : st === 'wrong' ? 'up wrong' : 'up'; }
  function face(c) { return c.state === 'down' ? '<span class="cback"></span>' : '<span class="atface' + (c.label.length > 9 ? ' atsmall' : '') + '">' + esc(c.label) + '</span>'; }
  function headCls(t) { return t.length > 60 ? 'atq' : ''; }
  function mount(el, spec, o) {
    o = o || {};
    var g = create(spec, o), timer = null, dead = false;
    function later(fn, ms) { clearTimeout(timer); timer = setTimeout(function () { if (!dead) fn(); }, ms); }
    function paint() {
      var v = g.view(), h;
      if (v.kind === 'end') {
        el.className = '';
        el.innerHTML = '<div class="center"><header><h2>' + esc(v.title) + '</h2></header></div>';
        if (o.onEnd) o.onEnd(v.score);
        return;
      }
      h = '<header class="' + headCls(v.title) + '"><h2>' + esc(v.title) + '</h2>' + (v.hint && !v.revealed ? '<p class="lead">' + esc(v.hint) + '</p>' : '') + '</header>';
      if (v.type === 'pairs') {
        h += '<div class="grid6 ' + gridCls(v.cards.length) + ' atgrid">' + v.cards.map(function (c, k) {
          return '<button type="button" class="pcard ' + cardCls(c.state) + '" data-k="' + k + '"' + (c.state === 'found' ? ' disabled' : '') + '>' + (c.state === 'down' ? '<span class="num">' + (k + 1) + '</span>' : '') + face(c) + '</button>';
        }).join('') + '</div>';
      } else if (v.revealed) {
        h += bigCard(v.answer, 'atanswer') + (v.why ? '<p class="lead atwhy">' + esc(v.why) + '</p>' : '');
      } else {
        if (v.big) h += bigCard(v.big);
        h += '<div class="opts">' + v.options.map(function (c, k) {
          return '<button type="button" class="opt' + (c.state === 'tried' ? ' tried' : '') + (c.state === 'done' ? ' atdone' : '') + '" data-k="' + k + '"' + (c.state !== 'idle' ? ' disabled' : '') + '>' +
            (c.pos ? '<span class="num">' + c.pos + '</span>' : '') + '<span class="lbl">' + esc(c.label) + '</span></button>';
        }).join('') + '</div>';
      }
      el.innerHTML = h;
      el.className = /sayingcard|grid6/.test(h) ? '' : 'nofill';
    }
    function onClick(e) {
      var b = e.target.closest ? e.target.closest('button[data-k]') : null;
      if (!b || b.disabled || dead) return;
      var res = g.pick(parseInt(b.getAttribute('data-k'), 10));
      if (!res) return;
      paint();
      if (res === 'nomatch') later(function () { g.settle(); paint(); }, 1500);
      if (res === 'right') later(function () { g.advance(); paint(); }, spec.type === 'pairs' ? 1200 : 1800);
    }
    el.addEventListener('click', onClick);
    paint();
    return { game: g, stop: function () { dead = true; clearTimeout(timer); el.removeEventListener('click', onClick); } };
  }

  /* ---------- the same game as an activity of the patient screen (js/core.js) ---------- */
  function keyOf(spec) { return 'atelier-' + spec.id; }
  /* 15 Nov (Rahma): the animal quiz is not offered any more. A quiz made from the old Atelier idea
     "A quiz about animals" (or with the bank's title for it, or named "Animal quiz" / "Quiz des
     animaux" / "Tierquiz") stays on the device, so the carer can still remove it in the Atelier, but
     it is hidden from the activity lists (hidden: true). */
  var RETIRED = ['a quiz about animals', 'un quiz sur les animaux', 'ein quiz über tiere', 'quiz · animals', 'quiz · les animaux', 'quiz · tiere',
    'animal quiz', 'quiz des animaux', 'le quiz des animaux', 'tierquiz', 'tier-quiz'];
  function retired(spec) {
    function low(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
    return spec.type === 'quiz' && (RETIRED.indexOf(low(spec.prompt)) >= 0 || RETIRED.indexOf(low(spec.title)) >= 0);
  }
  function activity(spec, n) {
    return {
      key: keyOf(spec), day: 900 + (n || 0), name: spec.title, zone: 'ATELIER', atelier: spec.id, hidden: retired(spec),
      flow: 'A game made by the care team in the Atelier.', learn: '',
      art: function () { return '<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="400" height="300" fill="#F0F6FC"/>' +
        '<rect x="96" y="70" width="92" height="64" rx="5" fill="#FFFFFF" stroke="#00519E" stroke-width="6"/><rect x="212" y="70" width="92" height="64" rx="5" fill="#FFFFFF" stroke="#00519E" stroke-width="6"/>' +
        '<rect x="96" y="158" width="92" height="64" rx="5" fill="#00519E"/><rect x="212" y="158" width="92" height="64" rx="5" fill="#FFFFFF" stroke="#00519E" stroke-width="6"/></svg>'; },
      start: function (L) {
        /* A game is in one language: the screen speaks the language of the game until the session ends. */
        if (window.Lab && Lab.opt && Lab.lang() !== spec.lang) {
          Lab.opt.lang = spec.lang;
          var chip = document.getElementById('chipPreview'), camText = document.getElementById('camText');
          if (chip) chip.textContent = Lab.t('Preview');
          if (camText) camText.textContent = Lab.t('Camera on · not recorded');
        }
        var g = create(spec), T = g.T;
        L.log('Atelier game: ' + spec.title + ' (' + spec.type + ', ' + spec.lang + ')', 'atelier');
        function next() { g.advance(); if (g.isEnded()) { L.stat('rightFirstTry', g.score.firstTry); L.stat('notQuite', g.score.notQuite); L.finish(); } else L.go(step(), { replace: true }); }
        function step() {
          var st = { id: 'atelier-' + g.view().n, back: false, fastVoice: true };
          function onPick(k) {
            if (L.step() !== st) return;
            var res = g.pick(k);
            if (!res) return;
            fill();
            L.refresh();
            if (res === 'wrong') L.say(T('Not quite. Try again.'));
            else if (res === 'nomatch') L.later(function () { if (g.settle()) { fill(); L.refresh(); } }, 1600);
            else if (res === 'right') {
              var v = g.view();
              L.log('Solved: ' + (v.answer || spec.title), 'result');
              st.fastVoice = false;
              L.say(g.praise() + (v.answer ? ' ' + v.answer + '.' : ''), function () { if (L.step() === st) next(); });
            }
          }
          function fill() {
            var v = g.view();
            st.title = v.title; st.lead = v.hint && !v.revealed ? v.hint : ''; st.cls = headCls(v.title) + ' atgame';
            st.body = ''; st.choices = []; st.actions = []; st.style = 'opts'; st.gridCls = '';
            if (v.type === 'pairs') {
              st.style = 'grid'; st.gridCls = gridCls(v.cards.length) + ' atgrid';
              st.choices = v.cards.map(function (c, k) {
                return { label: c.state === 'down' ? T('Card {n}', { n: k + 1 }) : c.label, cls: cardCls(c.state), art: face(c), disabled: c.state === 'found', noLabelWords: true,
                  words: c.state === 'down' ? [String(k + 1)] : [], run: function () { onPick(k); } };
              });
            } else if (v.revealed) {
              st.body = bigCard(v.answer, 'atanswer') + (v.why ? '<p class="lead atwhy">' + esc(v.why) + '</p>' : '');
            } else {
              if (v.big) st.body = bigCard(v.big);
              st.choices = v.options.map(function (c, k) {
                return { label: c.label, words: [c.label], noLabelWords: true, disabled: c.state !== 'idle', cls: c.state === 'done' ? 'atdone' : '', run: function () { onPick(k); } };
              });
              if (v.type !== 'order') st.actions = [{ label: T('Show answer'), gesture: 'open', words: ['answer', 'show answer', 'show', 'tell me', 'give up', 'dont know', 'no idea'], noLabelWords: true,
                run: function () { if (!g.show()) return; L.stat('answersShown'); fill(); L.refresh(); L.say(T('The answer is {end}.', { end: g.view().answer })); } }];
            }
            if (v.revealed) st.actions = [{ label: T('Continue'), primary: true, gesture: 'open', words: ['next', 'continue', 'another', 'yes', 'ok', 'okay', 'finish'], noLabelWords: true, run: next }];
          }
          fill();
          st.say = function () { var v = g.view(); return v.title + (v.big ? ' ' + v.big : '') + (v.hint ? ' ' + v.hint : ''); };
          return st;
        }
        return step();
      }
    };
  }

  /* ---------- the games kept on this device ---------- */
  function load() {
    var raw = null, out = [], ids = {};
    try { raw = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { raw = null; }
    if (!Array.isArray(raw)) return out;
    raw.forEach(function (x) {
      var r = validate(x);
      if (r.ok && r.spec.id && !ids[r.spec.id] && out.length < MAX_GAMES) { ids[r.spec.id] = true; out.push(r.spec); }
    });
    return out;
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
  }
  function newId() { var s = ''; while (s.length < 8) s += Math.floor(Math.random() * 36).toString(36); return s; }
  /* Adds a game to the menu of this device. Returns the saved spec, or null (not valid, storage full). */
  function add(raw) {
    var copy = {}, k;
    for (k in raw) if (has(raw, k)) copy[k] = raw[k];
    if (!copy.id) copy.id = newId();
    if (!copy.created) copy.created = new Date().toISOString();
    var r = validate(copy), list = load();
    if (!r.ok || list.length >= MAX_GAMES) return null;
    list = list.filter(function (s) { return s.id !== r.spec.id; });
    list.push(r.spec);
    return save(list) ? r.spec : null;
  }
  function remove(id) {
    var list = load(), rest = list.filter(function (s) { return s.id !== id; });
    return rest.length !== list.length && save(rest);
  }

  /* ---------- on the Care Team and patient pages: every saved game is an activity ---------- */
  var seen = null;
  function sync() {
    if (typeof Lab === 'undefined' || !Lab.define || !Lab.activities) return;
    var raw = null;
    try { raw = localStorage.getItem(KEY) || ''; } catch (e) { raw = ''; }
    if (raw === seen) return;
    /* never while one of these games is on the screen */
    if (Lab.isOn && Lab.isOn() && Lab._t && Lab._t.state && Lab._t.state.act && Lab._t.state.act.atelier) return;
    seen = raw;
    for (var i = Lab.activities.length - 1; i >= 0; i--) {
      if (Lab.activities[i].atelier) { delete Lab.byKey[Lab.activities[i].key]; Lab.activities.splice(i, 1); }
    }
    load().forEach(function (spec, n) { Lab.define(activity(spec, n)); });
    try { window.dispatchEvent(new CustomEvent('bellatrix-atelier')); } catch (e) { /* old browser */ }
  }
  function css() {
    if (typeof document === 'undefined' || document.getElementById('atelierGameCss')) return;
    var s = document.createElement('style');
    s.id = 'atelierGameCss';
    s.textContent =
      '.atq h2 { font-size: 66px; line-height: 1.12; }' +
      '.saytext.atlong { font-size: 64px; }' +
      '.atcard.atanswer .saytext { color: var(--accent); }' +
      '.atwhy { text-align: center; }' +
      '.opt.atdone { opacity: 1; border-color: var(--good); }' +
      '.atgrid .pcard .atface { font-size: 62px; font-weight: 700; line-height: 1.1; text-align: center; color: var(--ink); overflow-wrap: anywhere; }' +
      '.atgrid .pcard .atface.atsmall { font-size: 46px; }' +
      '.atgrid.g12 .pcard .atface { font-size: 44px; }' +
      '.atgrid.g12 .pcard .atface.atsmall { font-size: 34px; }' +
      '.atlink { font: inherit; font-size: 15px; color: var(--brand, #00519E); text-decoration: underline; white-space: nowrap; margin-left: 14px; }';
    (document.head || document.documentElement).appendChild(s);
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    css();
    if (typeof Lab !== 'undefined' && Lab.define) {
      sync();
      window.addEventListener('storage', function (e) { if (!e.key || e.key === KEY) sync(); });
      window.addEventListener('focus', sync);
      document.addEventListener('visibilitychange', sync);
      setInterval(sync, 1500);
      /* The Care Team's small link to the Atelier keeps the page's own query (?robot=1). */
      document.addEventListener('DOMContentLoaded', function () {
        var a = document.getElementById('toAtelier');
        if (a) a.setAttribute('href', 'atelier.html' + location.search);
      });
    }
  }

  return { KEY: KEY, TYPES: TYPES, LANGS: LANGS, MAX_GAMES: MAX_GAMES, validate: validate, create: create, mount: mount, activity: activity, keyOf: keyOf,
    load: load, save: save, add: add, remove: remove, sync: sync, esc: esc };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = AtelierEngine;
