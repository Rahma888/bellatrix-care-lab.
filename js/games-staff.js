/* "Ajouter un jeu" on the robot head (Care Team). The care team makes its games on its own computers; to
   put one on the robot, "Add a game" shows a QR code, the short address of the import page (jeu.html) and
   the team's code. The carer scans it with the phone (or types the address on the PC), pastes the link
   of the project or sends the file, and the server (labland/games.mjs) does the rest. A new game appears
   by itself in the list of activities, under "Team games" (js/games.js), with "New" until it was played.
   For a team game, the activity's sheet has Try (here on the head, before a resident plays), Update (the
   same link again) and Remove. Everything goes through ST() (js/i18n-games.js). ES5. */
window.GamesStaff = (function () {
  'use strict';
  var KEY = 'bellatrix-games-key';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.TeamGames ? TeamGames.esc(s) : String(s); };
  var LANG_NAME = { fr: 'Français', de: 'Deutsch', en: 'English' };
  var known = null, pollT = 0, sure = '';

  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function put(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* this session only */ } }
  function auth() { var k = ls(KEY); return k ? { Authorization: 'Team ' + k } : {}; }
  function toast(t) { if (window.Lab && Lab.toast) Lab.toast(t); }
  function errText(code, detail) { var E = window.GAME_ERRORS || {}; return ST(E[code] || E.server || 'The server does not answer.', { detail: detail || '' }); }
  function headInfo() {
    try { var a = window.BellatrixApp; if (a && typeof a.linkServer === 'function') return JSON.parse(a.linkServer() || '{}') || {}; } catch (e) { /* no robot */ }
    return {};
  }
  function local(u) { return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(u); }
  /* The address a phone can open: the server itself, or (when this head reaches it as localhost) the
     head's Wi-Fi address, or the one the server gives. */
  function address(server, offered) {
    var hi = headInfo();
    if (!local(server)) return server;
    if (hi.running && hi.url && !local(hi.url)) return String(hi.url).replace(/\/+$/, '');
    for (var i = 0; offered && i < offered.length; i++) if (!local(offered[i])) return String(offered[i]).replace(/\/+$/, '');
    return server;
  }

  /* ---------- the "Add a game" screen ---------- */
  function open() {
    var box = $('gmAdd');
    if (!box) return;
    box.hidden = false;
    document.body.classList.add('gm-open');
    $('gmQr').innerHTML = ''; $('gmAddr').textContent = ''; $('gmCode').textContent = ''; $('gmGot').hidden = true; $('gmMsg').hidden = true;
    var server = window.TeamGames ? TeamGames.server() : '';
    if (!server) { msg(ST('The server does not answer.')); return; }
    TeamGames.api('POST', 'team', {}, auth()).then(function (r) {
      if (r.status !== 200 || !r.body.code) { msg(errText(r.body.error === 'not-the-head' ? 'not-the-head' : 'server')); return; }
      if (r.body.key) put(KEY, r.body.key);
      var base = address(server, r.body.addresses), url = base + '/jeu';
      $('gmQr').innerHTML = window.BellatrixQR ? BellatrixQR.svg(url + '#' + r.body.code) : '';
      $('gmAddr').textContent = url.replace(/^https?:\/\//i, '');
      $('gmCode').textContent = r.body.code;
    }, function () { msg(ST('The server does not answer.')); });
    known = null;
    TeamGames.refresh().then(function (l) { known = ids(l); });
    clearInterval(pollT);
    pollT = setInterval(function () { TeamGames.refresh(); }, 3000);
  }
  function msg(t) { var m = $('gmMsg'); m.textContent = t; m.hidden = false; }
  function close() {
    var box = $('gmAdd');
    if (box) box.hidden = true;
    document.body.classList.remove('gm-open');
    clearInterval(pollT); pollT = 0;
  }
  function ids(l) { var o = {}; (l || []).forEach(function (g) { o[g.id] = true; }); return o; }
  /* a game arrived while the screen is open: its name, and Try */
  function arrived() {
    var box = $('gmAdd');
    if (!box || box.hidden || !known) return;
    var fresh = TeamGames.list().filter(function (g) { return !known[g.id]; });
    if (!fresh.length) return;
    var g = fresh[fresh.length - 1];
    $('gmGot').innerHTML = '<span>' + esc(ST('Received: {name}', { name: g.name })) + '</span> <button type="button" class="go sm" data-gm-try="' + esc(g.id) + '">' + esc(ST('Try')) + '</button>';
    $('gmGot').hidden = false;
  }

  /* ---------- Try: the game here on the head, in the shape of the patient screen ---------- */
  function tryGame(id) {
    var g = TeamGames.list().filter(function (x) { return x.id === id; })[0];
    if (!g) return;
    closeTry();
    var o = document.createElement('div');
    o.className = 'gm-try'; o.id = 'gmTry';
    o.innerHTML = '<div class="gm-tryfit"><iframe class="gm-tryframe" sandbox="allow-scripts" referrerpolicy="no-referrer" title="' + esc(g.name) + '"></iframe></div>' +
      '<div class="gm-tryside"><h2>' + esc(g.name) + '</h2><button type="button" class="go" id="gmTryClose">' + esc(ST('Close')) + '</button></div>';
    document.body.appendChild(o);
    o.querySelector('iframe').src = TeamGames.frameUrl(g);
    fitTry();
    $('gmTryClose').addEventListener('click', closeTry);
  }
  function fitTry() {
    var o = $('gmTry');
    if (!o) return;
    var fit = o.querySelector('.gm-tryfit'), f = o.querySelector('iframe');
    var h = Math.max(200, window.innerHeight - 24), s = h / 1920;
    fit.style.width = Math.round(1080 * s) + 'px'; fit.style.height = Math.round(1920 * s) + 'px';
    f.style.transform = 'scale(' + s + ')';
  }
  function closeTry() { var o = $('gmTry'); if (o && o.parentNode) o.parentNode.removeChild(o); }

  /* ---------- the sheet of a team game: Try, Update, Remove ---------- */
  function detail(a, head) {
    if (!a || !a.team || !head) return;
    var g = a.game || {}, meta = [LANG_NAME[g.lang] || ''];
    if (g.for) meta.push(ST('For: {who}', { who: g.for }));
    var d = document.createElement('div');
    d.className = 'gm-detail';
    d.innerHTML = '<span class="gm-meta">' + esc(meta.join(' · ')) + '</span>' +
      '<button type="button" class="go sm" data-gm="try">' + esc(ST('Try')) + '</button>' +
      (g.kind === 'file' ? '' : '<button type="button" class="ghost sm" data-gm="update">' + esc(ST('Update')) + '</button>') +
      '<button type="button" class="ghost sm danger" data-gm="remove">' + esc(sure === g.id ? ST('Yes, remove') : ST('Remove')) + '</button>';
    head.appendChild(d);
    d.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-gm]') : null;
      if (!b) return;
      var what = b.getAttribute('data-gm');
      if (what === 'try') tryGame(g.id);
      else if (what === 'update') update(g, b);
      else if (what === 'remove') {
        if (sure !== g.id) { sure = g.id; b.textContent = ST('Yes, remove'); b.classList.add('gm-sure'); return; }
        sure = '';
        TeamGames.api('POST', 'remove', { id: g.id }, auth()).then(function (r) {
          if (r.status === 200) { toast(ST('Removed.')); TeamGames.refresh(); } else toast(errText(r.body.error));
        }, function () { toast(ST('The server does not answer.')); });
      }
    });
  }
  function update(g, b) {
    b.disabled = true; b.textContent = ST('Updating…');
    var again = function () { b.disabled = false; b.textContent = ST('Update'); };
    TeamGames.api('POST', 'update', { id: g.id }, auth()).then(function (r) {
      if (r.status !== 200 || !r.body.job) { again(); toast(errText(r.body.error, r.body.detail)); return; }
      var job = r.body.job, n = 0;
      (function poll() {
        TeamGames.api('GET', 'job?id=' + encodeURIComponent(job)).then(function (j) {
          var s = j.body.state;
          if (s === 'ready') { again(); toast(ST('Updated.')); TeamGames.refresh(); return; }
          if (s === 'error' || j.status !== 200 || ++n > 300) { again(); toast(errText(j.body.error || 'server', j.body.detail)); return; }
          setTimeout(poll, 700);
        }, function () { again(); toast(ST('The server does not answer.')); });
      })();
    }, function () { again(); toast(ST('The server does not answer.')); });
  }

  function boot() {
    var go = $('toAddGame');
    if (go) go.addEventListener('click', open);
    if ($('gmBack')) $('gmBack').addEventListener('click', close);
    if ($('gmGot')) $('gmGot').addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('[data-gm-try]') : null; if (b) tryGame(b.getAttribute('data-gm-try')); });
    window.addEventListener('bellatrix-games', arrived);
    window.addEventListener('resize', fitTry);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if ($('gmTry')) closeTry(); else if ($('gmAdd') && !$('gmAdd').hidden) close(); } });
  }
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('DOMContentLoaded', boot);
  return { open: open, close: close, detail: detail, tryGame: tryGame, closeTry: closeTry, address: address };
})();
