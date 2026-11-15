/* Bellatrix Atelier - the page (atelier.html).
   A carer writes a short request ("a quiz about Bavarian food"), taps Create, sees the game exactly as
   on the patient screen and can play it, then taps "Add to menu": the game is saved on this device and
   shows with the other activities (js/atelier-engine.js). A game can be tried again or removed here.

   Two generators behind one door, Atelier.generate(prompt, lang) -> Promise of a spec:
   - the offline one (js/atelier-bank.js): always there, free;
   - the AI one, only when the server says it has a key (labland/atelier.mjs, POST /atelier/api/generate).
     No key, no server or any error: the offline generator is used, silently.
   The game is in the language of this page (FR / EN / DE at the top, the Care Team's language on this
   device), so one screen never mixes languages. Plain ES5. */
var Atelier = (function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var E = AtelierEngine, G = AtelierGen, esc = E.esc;
  /* 15 Nov (Rahma): no animal quiz any more; the quiz idea is about music. */
  var IDEAS = ['A quiz about music', 'Sort fruit and vegetables', 'Pairs with flowers', 'Finish the sayings', 'Odd one out in the garden', 'The seasons in order'];
  var HINT = { quiz: 'Question | right answer | wrong answer | wrong answer', sort: 'Word | category (two categories in all)', pairs: 'One word per line, or: word | partner',
    saying: 'Start of the sentence | ending', odd: 'Word | word | word | the odd one', order: 'Title | first | second | third' };
  var current = null, saved = false, lastPrompt = '', mounted = null, aiState = null;

  function lang() { return ST.lang(); }

  /* ---------- the generators ---------- */
  function post(path, body, ms) {
    return new Promise(function (resolve) {
      var done = false, timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, ms);
      function end(v) { if (done) return; done = true; clearTimeout(timer); resolve(v); }
      try {
        fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method: 'GET' })
          .then(function (r) { return r.ok ? r.json() : null; }).then(end, function () { end(null); });
      } catch (e) { end(null); }
    });
  }
  /* Is there an AI generator behind this page? Asked once; "no" for a page without a server. */
  function aiOn() {
    if (aiState === null) aiState = post('atelier/api/status', null, 4000).then(function (r) { return !!(r && r.ai === true); });
    return aiState;
  }
  function byAi(prompt, l) {
    return aiOn().then(function (on) {
      if (!on) return null;
      return post('atelier/api/generate', { prompt: prompt, lang: l, type: G.typeOf(prompt) }, 45000).then(function (r) {
        if (!r || r.ai !== true || !r.spec) return null;
        var v = E.validate(r.spec);
        return v.ok && v.spec.lang === l ? v.spec : null;
      });
    });
  }
  /* A spec, or a rejection carrying { need: true, type, title } when the carer has to type the items. */
  function generate(prompt, l, o) {
    o = o || {};
    return (o.offline ? Promise.resolve(null) : byAi(prompt, l)).then(function (spec) {
      if (spec) return spec;
      var r = G.offline(prompt, l);
      if (r.spec) return r.spec;
      return Promise.reject(r);
    });
  }

  /* ---------- the three views ---------- */
  function show(view) {
    ['vHome', 'vForm', 'vPreview'].forEach(function (id) { $(id).hidden = id !== view; });
    if (view !== 'vPreview' && mounted) { mounted.stop(); mounted = null; }
    window.scrollTo(0, 0);
    if (view === 'vPreview') fit();
  }
  function msg(id, text) { $(id).textContent = text || ''; }

  function renderHome() {
    var list = E.load();
    $('atIdeas').innerHTML = IDEAS.map(function (k) { return '<li><button type="button" data-idea="' + esc(ST(k)) + '">' + esc(ST(k)) + '</button></li>'; }).join('');
    $('atList').innerHTML = list.map(function (s) {
      return '<li data-id="' + esc(s.id) + '"><span class="atname" lang="' + s.lang + '">' + esc(s.title) + '</span><span class="atkind">' + esc(G.TYPE_NAME[s.type][lang()]) + '</span>' +
        '<button type="button" data-do="try">' + esc(ST('Try')) + '</button><button type="button" data-do="remove">' + esc(ST('Remove')) + '</button></li>';
    }).join('');
    $('atEmpty').hidden = list.length > 0;
  }
  function renderForm(type, title) {
    $('atFormType').innerHTML = E.TYPES.map(function (t) { return '<option value="' + t + '"' + (t === type ? ' selected' : '') + '>' + esc(G.TYPE_NAME[t][lang()]) + '</option>'; }).join('');
    if (title !== undefined) $('atFormTitle').value = title;
    $('atFormHint').textContent = ST(HINT[$('atFormType').value]);
    msg('atFormMsg', '');
  }
  /* The patient screen is 1080 x 1920: scaled to the width of the page, and never taller than the window. */
  function fit() {
    var box = $('atFit'), st = $('atStage');
    if (!box || $('vPreview').hidden) return;
    box.style.width = '';
    var top = box.getBoundingClientRect().top + (window.pageYOffset || 0), w = box.parentNode.clientWidth;
    var s = Math.min(w / 1080, Math.max(0.3, (window.innerHeight - Math.min(top, window.innerHeight * 0.4) - 24) / 1920));
    st.style.transform = 'scale(' + s + ')';
    box.style.width = Math.round(1080 * s) + 'px';
    box.style.height = Math.round(1920 * s) + 'px';
  }
  function play() {
    if (mounted) mounted.stop();
    mounted = E.mount($('screen'), current, {});
  }
  function preview(spec, isSaved) {
    current = spec; saved = !!isSaved;
    $('atTitle').value = spec.title;
    $('atTitle').disabled = saved;
    $('atAdd').hidden = saved;
    $('atAgain').hidden = saved || spec.source === 'manual';
    msg('atPrevMsg', '');
    show('vPreview');
    play();
  }

  /* ---------- what the buttons do ---------- */
  function create() {
    var p = $('atPrompt').value.replace(/\s+/g, ' ').trim();
    if (!p) { msg('atMsg', ST('Write a few words first.')); return; }
    lastPrompt = p;
    msg('atMsg', ST('Creating…'));
    $('atCreate').disabled = true;
    generate(p, lang()).then(function (spec) {
      $('atCreate').disabled = false; msg('atMsg', '');
      preview(spec, false);
    }, function (r) {
      $('atCreate').disabled = false; msg('atMsg', '');
      $('atFormText').value = '';
      renderForm(r && r.type || 'quiz', r && r.title || p.slice(0, 40));
      show('vForm');
    });
  }
  function createFromForm() {
    var r = G.fromLines($('atFormType').value, $('atFormTitle').value, lang(), $('atFormText').value);
    if (!r.spec) { msg('atFormMsg', ST(r.error === 'cats' ? 'A sorting game needs exactly two categories.' : 'This does not make a game yet. Check the lines.')); return; }
    preview(r.spec, false);
  }
  function addToMenu() {
    var copy = JSON.parse(JSON.stringify(current)), t = $('atTitle').value.replace(/\s+/g, ' ').trim();
    if (t) copy.title = t.slice(0, 40);
    if (E.load().length >= E.MAX_GAMES) { msg('atPrevMsg', ST('The menu is full. Remove a game first.')); return; }
    var done = E.add(copy);
    if (!done) { msg('atPrevMsg', ST('This tablet could not save the game.')); return; }
    $('atPrompt').value = '';
    renderHome();
    show('vHome');
    msg('atMsg', ST('Added to the menu.'));
  }
  function onList(e) {
    var b = e.target.closest('button[data-do]'), li = b && b.closest('li');
    if (!b || !li) return;
    var id = li.getAttribute('data-id'), spec = E.load().filter(function (s) { return s.id === id; })[0];
    if (!spec) { renderHome(); return; }
    if (b.getAttribute('data-do') === 'try') { preview(spec, true); return; }
    /* Remove asks once more, on the same button. */
    if (!b.classList.contains('atsure')) { b.classList.add('atsure'); b.textContent = ST('Yes, remove'); return; }
    E.remove(id);
    renderHome();
    msg('atMsg', ST('Removed from the menu.'));
  }
  function setLang(l) {
    ST.setLang(l);
    document.documentElement.lang = lang();
    ST.apply(document);
    Array.prototype.forEach.call(document.querySelectorAll('#atLang button'), function (b) { b.classList.toggle('on', b.getAttribute('data-ui-lang') === lang()); });
    renderHome();
    if (!$('vForm').hidden) renderForm($('atFormType').value);
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('atBack').setAttribute('href', 'staff.html' + location.search);
    setLang(lang());
    $('atLang').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-ui-lang]');
      /* A game is in one language: changing it goes back to the first screen. */
      if (b) { setLang(b.getAttribute('data-ui-lang')); show('vHome'); msg('atMsg', ''); }
    });
    $('atCreate').addEventListener('click', create);
    $('atIdeas').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-idea]');
      if (b) { $('atPrompt').value = b.getAttribute('data-idea'); create(); }
    });
    $('atList').addEventListener('click', onList);
    $('atFormType').addEventListener('change', function () { renderForm($('atFormType').value); });
    $('atFormCreate').addEventListener('click', createFromForm);
    $('atFormBack').addEventListener('click', function () { show('vHome'); });
    $('atAdd').addEventListener('click', addToMenu);
    $('atRestart').addEventListener('click', play);
    $('atAgain').addEventListener('click', function () {
      generate(lastPrompt || current.prompt || '', current.lang).then(function (spec) { preview(spec, false); }, function () { /* the same game stays */ });
    });
    $('atPrevBack').addEventListener('click', function () { show('vHome'); });
    window.addEventListener('resize', fit);
    window.addEventListener('storage', function (e) { if (e.key === E.KEY) renderHome(); });
    aiOn();
  });

  return { generate: generate, aiOn: aiOn };
})();
