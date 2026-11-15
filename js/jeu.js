/* The import page (jeu.html) on the carer's phone or PC: three steps (the project, the game, Send), then
   the progress (Downloading, Checking, Installing, Ready) and the result in plain words. The team's code
   comes with the QR code (after #); typed by hand when the address was typed. The texts: js/i18n-games.js.
   Nothing of the project runs here or on the server: labland/games.mjs only checks and stores the files.
   ES5 (old phones). */
(function () {
  'use strict';
  var LANG_KEY = 'bellatrix-jeu-lang', CODE_KEY = 'bellatrix-jeu-code', MAX_BYTES = 50 * 1024 * 1024;
  var $ = function (id) { return document.getElementById(id); };
  var lang = 'en', nameTouched = false, file = null, job = null, pollT = 0, sending = false;

  function ls(box, k) { try { return box.getItem(k) || ''; } catch (e) { return ''; } }
  function put(box, k, v) { try { box.setItem(k, v); } catch (e) { /* this page only */ } }
  function tr(s, vars) { return I18N.t(lang, s, vars); }
  function errText(code, detail) { var E = window.GAME_ERRORS || {}; return tr(E[code] || E.server, { detail: detail || '' }); }
  function pickLang() {
    var l = ls(localStorage, LANG_KEY) || String(navigator.language || 'en').slice(0, 2);
    return I18N.valid(l);
  }
  function apply() {
    document.documentElement.lang = lang;
    Array.prototype.forEach.call(document.querySelectorAll('[data-t]'), function (el) { el.textContent = tr(el.getAttribute('data-t')); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-t-placeholder]'), function (el) { el.placeholder = tr(el.getAttribute('data-t-placeholder')); });
    Array.prototype.forEach.call(document.querySelectorAll('#jLang [data-ui-lang]'), function (b) {
      var on = b.getAttribute('data-ui-lang') === lang;
      b.className = on ? 'on' : ''; b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (file) $('jFileName').textContent = file.name;
    var first = document.querySelector('#jSteps [data-s="download"]');
    first.textContent = tr(file ? 'Sending' : 'Downloading');
  }

  /* "https://github.com/anna/memory-game" -> "Memory game" */
  function pretty(s) {
    var t = String(s || '').replace(/\.(git|zip|html?)$/i, '').replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    return t ? t.charAt(0).toUpperCase() + t.slice(1, 40) : '';
  }
  function guessName(link) {
    var m = /^(?:https?:\/\/)?(?:www\.)?(github\.com|gitlab\.[a-z.]+)\/(.+)$/i.exec(String(link || '').replace(/^\s+|\s+$/g, ''));
    if (m) {
      var parts = m[2].split(/[?#]/)[0].split('/').filter(Boolean), dash = parts.indexOf('-');
      if (/^github/i.test(m[1])) return pretty(parts[1] || '');
      return pretty((dash > 0 ? parts.slice(0, dash) : parts).pop() || '');
    }
    var last = String(link || '').split(/[?#]/)[0].split('/').filter(Boolean).pop() || '';
    return /\.(zip|html?)$/i.test(last) ? pretty(decodeURIComponent(last)) : '';
  }
  function gameLang() { var r = document.querySelector('input[name="jGameLang"]:checked'); return r ? r.value : lang; }
  function showErr(t) { $('jErr').textContent = t; $('jErr').hidden = !t; }

  function setFile(f) {
    file = f || null;
    $('jFileClear').hidden = !file;
    $('jFileBox').className = 'jfile' + (file ? ' on' : '');
    if (file) { $('jUrl').value = ''; if (!nameTouched) $('jName').value = pretty(file.name); }
    else { $('jFile').value = ''; $('jFileName').textContent = tr('Choose a file (.zip or .html)'); }
    apply();
  }

  /* ---------- send ---------- */
  function send(e) {
    if (e) e.preventDefault();
    if (sending) return;
    var code = $('jCode').value.replace(/\s+/g, '').toUpperCase(), link = $('jUrl').value.replace(/^\s+|\s+$/g, ''), name = $('jName').value.replace(/^\s+|\s+$/g, '');
    if (!/^[A-Z0-9]{6}$/.test(code)) { $('jCodeRow').hidden = false; showErr(tr('Type the code shown on the robot.')); $('jCode').focus(); return; }
    if (!link && !file) { showErr(tr('Paste a link or choose a file.')); $('jUrl').focus(); return; }
    if (!name) { name = guessName(link) || (file ? pretty(file.name) : ''); $('jName').value = name; }
    if (!name) { showErr(tr('Give the game a name.')); $('jName').focus(); return; }
    if (file && file.size > MAX_BYTES) { showErr(errText('too-big', 50)); return; }
    showErr('');
    put(sessionStorage, CODE_KEY, code);
    sending = true;
    progress(name);
    var req;
    if (file) {
      req = fetch('games/api/upload', { method: 'POST', body: file, cache: 'no-store', headers: {
        'Content-Type': 'application/octet-stream', 'X-Games-Code': code, 'X-Games-Name': encodeURIComponent(name), 'X-Games-For': encodeURIComponent($('jFor').value),
        'X-Games-Lang': gameLang(), 'X-Games-File': encodeURIComponent(file.name) } });
    } else {
      req = fetch('games/api/import', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code, url: link, name: name, 'for': $('jFor').value, lang: gameLang() }) });
    }
    req.then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j || {} }; }, function () { return { status: r.status, body: {} }; }); })
      .then(function (r) {
        if (r.status !== 200 || !r.body.job) { failed(r.body.error || 'server', r.body.detail); return; }
        job = r.body.job;
        poll();
      }, function () { failed('offline'); });
  }
  function poll() {
    clearTimeout(pollT);
    fetch('games/api/job?id=' + encodeURIComponent(job), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.state) { failed('server'); return; }
      steps(j.state);
      if (j.state === 'ready') { done(j); return; }
      if (j.state === 'error') { steps(j.step || 'download', true); failed(j.error, j.detail); return; }
      pollT = setTimeout(poll, 600);
    }, function () { pollT = setTimeout(poll, 2000); });
  }

  /* ---------- the screens ---------- */
  var ORDER = ['download', 'check', 'install', 'ready'];
  function progress(name) {
    $('jForm').hidden = true; $('jProg').hidden = false; $('jDone').hidden = true; $('jFail').hidden = true;
    $('jProgName').textContent = name;
    apply();
    steps('download');
    window.scrollTo(0, 0);
  }
  function steps(state, failedAt) {
    var at = ORDER.indexOf(state);
    Array.prototype.forEach.call(document.querySelectorAll('#jSteps li'), function (li, i) {
      li.className = state === 'ready' || i < at ? 'done' : i === at ? (failedAt ? 'bad' : 'now') : '';
    });
  }
  function done(j) {
    sending = false;
    var g = j.game || {};
    $('jOk').textContent = tr('{name} is on the robot.', { name: g.name || $('jProgName').textContent });
    var w = j.warn && j.warn.length ? errText('internet', j.warn.join(', ')) : '';
    $('jWarn').textContent = w; $('jWarn').hidden = !w;
    $('jDone').hidden = false;
  }
  function failed(code, detail) {
    sending = false;
    var cur = document.querySelector('#jSteps li.now');
    if (cur) cur.className = 'bad';
    else if (!document.querySelector('#jSteps li.bad')) steps('download', true);
    $('jFailText').textContent = errText(code, detail);
    $('jFail').hidden = false;
    if (code === 'bad-code') { $('jCodeRow').hidden = false; $('jCode').value = ''; }
  }
  function back(clear) {
    clearTimeout(pollT);
    $('jProg').hidden = true; $('jForm').hidden = false;
    if (clear) { $('jUrl').value = ''; $('jName').value = ''; $('jFor').value = ''; nameTouched = false; setFile(null); }
    if (!$('jCodeRow').hidden && !$('jCode').value) $('jCode').focus();
  }

  document.addEventListener('DOMContentLoaded', function () {
    lang = pickLang();
    /* the code: from the QR code (#K7P3QX or #code=K7P3QX), else this session, else typed */
    var h = String(location.hash || '').replace(/^#/, '').replace(/^code=/i, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    var code = /^[A-Z0-9]{6}$/.test(h) ? h : ls(sessionStorage, CODE_KEY);
    $('jCode').value = code;
    $('jCodeRow').hidden = /^[A-Z0-9]{6}$/.test(code);
    if (h && window.history && history.replaceState) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* stays */ } }
    var r = document.querySelector('input[name="jGameLang"][value="' + lang + '"]');
    if (r) r.checked = true;
    apply();
    $('jLang').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-ui-lang]') : null;
      if (!b) return;
      lang = I18N.valid(b.getAttribute('data-ui-lang'));
      put(localStorage, LANG_KEY, lang);
      if (!document.querySelector('input[name="jGameLang"]:checked')) { var x = document.querySelector('input[name="jGameLang"][value="' + lang + '"]'); if (x) x.checked = true; }
      apply();
      if (!$('jErr').hidden) showErr('');
    });
    $('jUrl').addEventListener('input', function () {
      if ($('jUrl').value && file) setFile(null);
      if (!nameTouched) $('jName').value = guessName($('jUrl').value);
    });
    $('jName').addEventListener('input', function () { nameTouched = !!$('jName').value; });
    $('jFile').addEventListener('change', function () { setFile($('jFile').files && $('jFile').files[0]); });
    $('jFileClear').addEventListener('click', function () { setFile(null); });
    $('jForm').addEventListener('submit', send);
    $('jAgain').addEventListener('click', function () { back(true); });
    $('jRetry').addEventListener('click', function () { back(false); });
  });
  window.JeuPage = { guessName: guessName, pretty: pretty, _state: function () { return { lang: lang, file: file, job: job }; } };
})();
