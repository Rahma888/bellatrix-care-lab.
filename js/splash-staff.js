/* Start screen of the robot HEAD (Care Team), 16 Nov (Rahma): the care home's logo and name (Suavia) over the whole
   screen; one tap opens the Care Team menu. It comes back after IDLE_MS without a touch, but never over a trip or an
   activity (the blue status screen of js/link-staff.js stays on top), Demo mode, a film, a dialog or while typing.
   Only on the robot head (staff.html?robot=1 or the robot app); a browser on a PC opens the menu at once. ES5. */
(function () {
  'use strict';
  var IDLE_MS = 3 * 60 * 1000, CHECK_MS = 15000, AWAY_MS = 3000;
  var S = function (k) { return window.ST ? ST(k) : k; };
  if (window.ST && ST.add) {
    ST.add('fr', { 'Tap to open': 'Touchez pour ouvrir' });
    ST.add('de', { 'Tap to open': 'Zum Öffnen tippen' });
  }
  var el = null, lastTouch = Date.now();
  function onRobot() { return /[?&]robot=1/.test(location.search) || !!window.BellatrixApp; }
  function busy() {
    var b = document.body;
    if (!b) return true;
    if (b.classList.contains('lk-full') || b.classList.contains('st-demo')) return true;   /* a trip or an activity, Demo mode */
    if (document.getElementById('stDemoVid') || document.querySelector('.st-dialog')) return true;
    var a = document.activeElement;
    return !!(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName));
  }
  function build() {
    el = document.createElement('div');
    el.id = 'hSplash'; el.className = 'h-splash'; el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0');
    el.innerHTML = '<img class="h-splash-logo" src="img/suavia-logo.svg" alt="Suavia" draggable="false">' +
      '<span class="h-splash-hint">' + S('Tap to open') + '</span>';
    function open(e) { if (e) { e.preventDefault(); e.stopPropagation(); } hide(); }
    el.addEventListener('pointerdown', open);
    el.addEventListener('click', open);
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') open(e); });
    document.body.appendChild(el);
  }
  function show() {
    if (!el) build();
    var h = el.querySelector('.h-splash-hint'); if (h) h.textContent = S('Tap to open');
    el.hidden = false;
  }
  function hide() { if (el) el.hidden = true; lastTouch = Date.now(); }
  function tick() {
    if (el && !el.hidden) return;
    if (Date.now() - lastTouch >= IDLE_MS && !busy()) show();
  }
  function boot() {
    if (!onRobot()) return;
    document.addEventListener('pointerdown', function () { lastTouch = Date.now(); }, true);
    document.addEventListener('keydown', function () { lastTouch = Date.now(); }, true);
    /* 16 Nov (Rahma): every time the app is opened again (it was in the background), the logo first. The robot app
       tells the page with a 'focus' event when it comes back to the front (WebActivity.onResume). */
    var away = false, blurAt = 0;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { away = true; return; }
      if (away && !busy()) show();
      away = false;
    });
    window.addEventListener('blur', function () { blurAt = Date.now(); });
    window.addEventListener('focus', function () {
      if ((away || (blurAt && Date.now() - blurAt > AWAY_MS)) && !busy()) show();
      away = false; blurAt = 0;
    });
    show();
    setInterval(tick, CHECK_MS);
  }
  window.HeadSplash = { show: show, hide: hide, _busy: busy };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
