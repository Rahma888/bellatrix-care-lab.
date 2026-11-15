/* Memory: turn two cards; the same picture twice stays open, two different pictures turn back after a calm
   moment. Three sizes (6, 8, 12 cards), three themes, German, French and English. No timer, no score, no
   "wrong". Everything is in memory: nothing is saved, nothing comes from the internet.
   Works with touch, the mouse and the robot's pointing in the air: every control is a real <button> and the
   game only listens to "click". Plain JavaScript (no build), written for older browsers too. */
(function () {
  'use strict';
  var T = {
    de: { flowers: 'Blumen', animals: 'Tiere', bavaria: 'Bayern', newGame: 'Neues Spiel', easier: 'Leichter', harder: 'Schwerer',
      start: 'Finden Sie die Paare.', look: 'Schauen Sie gut hin.', praise: 'Sehr schön!',
      count: function (n, m) { return n + ' von ' + m + ' Paaren gefunden.'; },
      endTitle: 'Wunderbar!', endText: 'Alle Paare gefunden.', again: 'Noch einmal', card: 'Karte', themes: 'Bilder', langs: 'Sprache' },
    fr: { flowers: 'Fleurs', animals: 'Animaux', bavaria: 'Bavière', newGame: 'Nouvelle partie', easier: 'Plus facile', harder: 'Plus difficile',
      start: 'Trouvez les paires.', look: 'Regardez bien.', praise: 'Très bien !',
      count: function (n, m) { return n + (n > 1 ? ' paires trouvées' : ' paire trouvée') + ' sur ' + m + '.'; },
      endTitle: 'Merveilleux !', endText: 'Toutes les paires sont trouvées.', again: 'Rejouer', card: 'Carte', themes: 'Images', langs: 'Langue' },
    en: { flowers: 'Flowers', animals: 'Animals', bavaria: 'Bavaria', newGame: 'New game', easier: 'Easier', harder: 'Harder',
      start: 'Find the pairs.', look: 'Take a good look.', praise: 'Well done!',
      count: function (n, m) { return n + ' of ' + m + ' pairs found.'; },
      endTitle: 'Wonderful!', endText: 'All pairs found.', again: 'Play again', card: 'Card', themes: 'Pictures', langs: 'Language' }
  };
  var LEVELS = [3, 4, 6];            /* pairs: 6, 8 and 12 cards */
  var TURN_BACK_MS = 2500;           /* two different pictures stay visible this long */
  var END_MS = 1200;                 /* the last pair stays on the screen a moment before "Wonderful!" */
  var TICK = '<svg class="tick" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="22" fill="#00519E"/>' +
    '<path d="M13 25 L21 33 L36 16" stroke="#FFFFFF" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var P = window.MEMORY_PICTURES;
  var $ = function (id) { return document.getElementById(id); };
  var deck = $('deck'), board = $('board'), statusEl = $('status'), endEl = $('end');

  var lang = pickLang(), theme = 'flowers', level = 0;
  var cards = [], open = [], found = 0, done = false, waitTimer = 0, endTimer = 0, message = null;

  /* ?lang=fr in the address first, then the language of the device, else German */
  function pickLang() {
    var m = /[?&]lang=([a-zA-Z]{2})\b/.exec(location.search || ''), list, i, c;
    if (m && T[m[1].toLowerCase()]) return m[1].toLowerCase();
    list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    for (i = 0; i < list.length; i++) { c = String(list[i] || '').slice(0, 2).toLowerCase(); if (T[c]) return c; }
    return 'de';
  }
  function t(k) { return T[lang][k]; }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }
  function pairs() { return cards.length / 2; }
  /* the status line keeps what it says, so that a change of language can say it again */
  function say(fn) { message = fn; statusEl.textContent = fn ? fn() : ''; }
  function sayCount() { say(found ? function () { return t('count')(found, pairs()); } : function () { return t('start'); }); }

  /* ---------- a new game ---------- */
  function deal() {
    clearTimeout(waitTimer); clearTimeout(endTimer);
    var pics = shuffle(P[theme].slice()).slice(0, LEVELS[level]), i;
    cards = [];
    for (i = 0; i < pics.length; i++) { cards.push({ pic: pics[i], open: false, found: false }); cards.push({ pic: pics[i], open: false, found: false }); }
    shuffle(cards);
    open = []; found = 0; done = false;
    endEl.hidden = true;
    deck.style.visibility = '';
    deck.innerHTML = '';
    for (i = 0; i < cards.length; i++) deck.appendChild(makeCard(i));
    $('easier').disabled = level === 0;
    $('harder').disabled = level === LEVELS.length - 1;
    paintAll();
    layout();
    sayCount();
  }
  function makeCard(i) {
    var c = cards[i], b = document.createElement('button');
    b.type = 'button';
    b.className = 'card';
    b.setAttribute('data-i', String(i));
    b.setAttribute('data-pic', c.pic.id);
    b.innerHTML = '<span class="inner"><span class="face back"></span><span class="face front"><span class="pic">' + c.pic.draw() + '</span><span class="word"></span>' + TICK + '</span></span>';
    b.addEventListener('click', function () { turn(i); });
    c.el = b;
    return b;
  }
  function paint(i) {
    var c = cards[i], el = c.el;
    el.className = 'card' + (c.open ? ' open' : '') + (c.found ? ' found' : '');
    el.querySelector('.word').textContent = c.pic[lang];
    el.setAttribute('aria-label', c.open || c.found ? c.pic[lang] : t('card') + ' ' + (i + 1));
  }
  function paintAll() { for (var i = 0; i < cards.length; i++) paint(i); }

  /* ---------- one card is touched ---------- */
  function turn(i) {
    var c = cards[i];
    if (done || !c || c.open || c.found) return;
    /* two different pictures are still open: no need to wait, they turn back now */
    if (open.length === 2) { closeOpen(); sayCount(); }
    c.open = true;
    paint(i);
    open.push(i);
    if (open.length < 2) return;
    var a = cards[open[0]], b = cards[open[1]];
    if (a.pic.id === b.pic.id) {
      a.open = b.open = false;
      a.found = b.found = true;
      paint(open[0]); paint(open[1]);
      open = [];
      found++;
      say(function () { return t('praise') + ' ' + t('count')(found, pairs()); });
      if (found === pairs()) { done = true; endTimer = setTimeout(showEnd, END_MS); }
    } else {
      say(function () { return t('look'); });
      waitTimer = setTimeout(function () { closeOpen(); sayCount(); }, TURN_BACK_MS);
    }
  }
  function closeOpen() {
    clearTimeout(waitTimer);
    waitTimer = 0;
    for (var k = 0; k < open.length; k++) { cards[open[k]].open = false; paint(open[k]); }
    open = [];
  }
  function showEnd() {
    var pics = $('endpics'), seen = {}, n = 0, i, id;
    pics.innerHTML = '';
    for (i = 0; i < cards.length && n < 3; i++) {
      id = cards[i].pic.id;
      if (seen[id]) continue;
      seen[id] = true; n++;
      pics.insertAdjacentHTML('beforeend', cards[i].pic.draw());
    }
    deck.style.visibility = 'hidden';
    endEl.hidden = false;
    say(null);
  }

  /* ---------- the size of the cards: as big as the screen allows ---------- */
  function layout() {
    var r = board.getBoundingClientRect(), W = r.width, H = r.height, n = cards.length, best = null, cols, rows, cw, ch, w, h, score, fs, i;
    if (!n || W < 20 || H < 20) return;
    var g = Math.max(10, Math.min(26, Math.round(Math.min(W, H) * 0.022)));
    for (cols = 1; cols <= n; cols++) {
      rows = Math.ceil(n / cols);
      if (rows * cols - n >= cols) continue;
      cw = (W - (cols - 1) * g) / cols;
      ch = (H - (rows - 1) * g) / rows;
      if (cw <= 0 || ch <= 0) continue;
      h = Math.min(ch, cw * 1.15);       /* a card is between a little wider and a little taller than square */
      w = Math.min(cw, h / 0.8);
      score = w * h * (rows * cols === n ? 1.1 : 1);   /* full rows look calmer */
      if (!best || score > best.score) best = { cols: cols, w: Math.floor(w), h: Math.floor(h), score: score };
    }
    if (!best) return;
    deck.style.width = (best.cols * best.w + (best.cols - 1) * g) + 'px';
    deck.style.gap = g + 'px';
    fs = Math.max(16, Math.min(46, Math.round(Math.min(best.h * 0.125, best.w * 0.115))));
    for (i = 0; i < cards.length; i++) {
      cards[i].el.style.width = best.w + 'px';
      cards[i].el.style.height = best.h + 'px';
      cards[i].el.querySelector('.word').style.fontSize = fs + 'px';
    }
  }

  /* ---------- the words of the screen ---------- */
  function applyLang() {
    var els = document.querySelectorAll('[data-t]'), i, b;
    document.documentElement.lang = lang;
    for (i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute('data-t'));
    $('themes').setAttribute('aria-label', t('themes'));
    $('langs').setAttribute('aria-label', t('langs'));
    els = document.querySelectorAll('#langs .lang');
    for (i = 0; i < els.length; i++) { b = els[i]; b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false'); }
    paintAll();
    statusEl.textContent = message ? message() : '';
  }
  function setTheme(name) {
    var els = document.querySelectorAll('#themes .chip'), i;
    theme = name;
    for (i = 0; i < els.length; i++) els[i].setAttribute('aria-pressed', els[i].getAttribute('data-theme') === name ? 'true' : 'false');
    deal();
  }

  /* ---------- start ---------- */
  (function () {
    var chips = document.querySelectorAll('#themes .chip'), langs = document.querySelectorAll('#langs .lang'), i;
    for (i = 0; i < chips.length; i++) {
      chips[i].querySelector('.ic').innerHTML = P[chips[i].getAttribute('data-theme')][0].draw();
      chips[i].addEventListener('click', function () { setTheme(this.getAttribute('data-theme')); });
    }
    for (i = 0; i < langs.length; i++) langs[i].addEventListener('click', function () { lang = this.getAttribute('data-lang'); applyLang(); });
    $('newgame').addEventListener('click', deal);
    $('again').addEventListener('click', deal);
    $('easier').addEventListener('click', function () { if (level > 0) { level--; deal(); } });
    $('harder').addEventListener('click', function () { if (level < LEVELS.length - 1) { level++; deal(); } });
    window.addEventListener('resize', layout);
    if (window.ResizeObserver) new window.ResizeObserver(function () { layout(); }).observe(board);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    applyLang();
    deal();
  })();
})();
