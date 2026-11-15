/* The server on the robot head (1.17, android HeadServer): Node runs the whole Bellatrix server on the head
   and cloudflared gives it a public https address, a new one at every start.
   - Head (BellatrixApp.serverInfo, Care Team): a small "Robot server" block at the top of Family > Settings:
     the state, the family portal address and its QR code; bellatrix-call-server follows the address.
   - Tablet (patient screen, bellatrix-link-server = http://<head>:8765): reads <head>/head/api/info and
     sets its own bellatrix-call-server the same way.
   The call server address is changed only when it is empty, was set here before, is a trycloudflare
   address or a plain-http address on the Wi-Fi (the PC's test server). An https address typed by hand
   (the clinic's own server later) is kept. ES5. */
window.HeadServer = (function () {
  'use strict';
  var SERVER = 'bellatrix-call-server', AUTO = 'bellatrix-call-server-auto';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var S = function (k) { return window.ST ? ST(k) : k; };
  var qrFor = '', qrSvg = '';

  if (window.ST && ST.add) {
    ST.add('fr', { 'Robot server': 'Serveur du robot', 'Running': 'En marche', 'Starting…': 'Démarrage…', 'Not running': 'Arrêté',
      'Family portal': 'Portail des familles', 'No public address yet.': 'Pas encore d’adresse publique.' });
    ST.add('de', { 'Robot server': 'Roboter-Server', 'Running': 'Läuft', 'Starting…': 'Startet…', 'Not running': 'Gestoppt',
      'Family portal': 'Familienportal', 'No public address yet.': 'Noch keine öffentliche Adresse.' });
  }

  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function put(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* this page only */ } }
  function clean(u) { return String(u || '').trim().replace(/\/+$/, ''); }
  function isTunnel(u) { return /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(u); }
  function isLanHttp(u) { return /^http:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u); }

  /* The head's own state, or null off the robot. */
  function info() {
    try { var a = window.BellatrixApp; if (a && typeof a.serverInfo === 'function') return JSON.parse(a.serverInfo() || '{}') || {}; } catch (e) { /* no robot */ }
    return null;
  }
  function onHead() { var i = info(); return !!(i && i.node && i.node !== 'unavailable'); }

  /* Makes url the call server unless someone chose another https server by hand. true = changed. */
  function adopt(url) {
    url = clean(url);
    if (!/^https:\/\/[A-Za-z0-9.-]+$/.test(url)) return false;
    var cur = clean(ls(SERVER)), auto = clean(ls(AUTO));
    if (cur === url) { if (auto !== url) put(AUTO, url); return false; }
    if (cur && cur !== auto && !isTunnel(cur) && !isLanHttp(cur)) return false;
    put(SERVER, url);
    put(AUTO, url);
    var inp = $('famServer');
    if (inp && document.activeElement !== inp) inp.value = url;
    return true;
  }

  /* ---------- the block in Family > Settings (head only) ---------- */
  function css() {
    if ($('hsStyle')) return;
    var st = document.createElement('style');
    st.id = 'hsStyle';
    st.textContent = '.hs-set{margin:4px 0 14px;padding:12px 14px;border:1px solid var(--line);border-radius:var(--radius,5px);background:var(--surface)}' +
      '.hs-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap}' +
      '.hs-label{font:600 12px/1.3 var(--font-label,var(--font));letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}' +
      '.hs-state{font:500 15px/1.3 var(--font);color:var(--muted)}.hs-state.hs-on{color:var(--good)}' +
      '.hs-body{display:flex;align-items:center;gap:16px;margin-top:10px;flex-wrap:wrap}.hs-body[hidden]{display:none}' +
      '.hs-qr{flex:none;width:150px;height:150px;background:#FFFFFF;border:1px solid var(--line);border-radius:var(--radius,5px);padding:5px}.hs-qr svg{width:100%;height:100%;display:block}' +
      '.hs-url{font:500 17px/1.35 var(--font);color:var(--accent);word-break:break-all}.hs-cap{font:15px/1.3 var(--font);color:var(--muted);margin-top:4px}';
    document.head.appendChild(st);
  }
  function mount() {
    var det = document.querySelector('.famsettings');
    if (!det || det.querySelector('.hs-set') || !onHead()) return;
    css();
    var d = document.createElement('div');
    d.className = 'hs-set';
    d.innerHTML = '<div class="hs-top"><span class="hs-label">' + esc(S('Robot server')) + '</span><span class="hs-state" id="hsState" role="status"></span></div>' +
      '<div class="hs-body" id="hsBody" hidden><div class="hs-qr" id="hsQr"></div><div><div class="hs-url" id="hsUrl"></div><div class="hs-cap">' + esc(S('Family portal')) + '</div></div></div>';
    var sum = det.querySelector('summary');
    if (sum && sum.nextSibling) det.insertBefore(d, sum.nextSibling); else det.appendChild(d);
    paint();
  }
  function paint() {
    var i = info(), st = $('hsState');
    if (!i || !st) return;
    if (i.tunnel) adopt(i.tunnel);
    var on = i.node === 'running';
    st.textContent = on ? S('Running') : i.node === 'starting' ? S('Starting…') : S('Not running');
    st.className = 'hs-state' + (on ? ' hs-on' : '');
    var body = $('hsBody'), portal = i.portal || (i.tunnel ? clean(i.tunnel) + '/portail.html' : '');
    if (on && !portal) { st.textContent = S('Running') + ' · ' + S('No public address yet.'); }
    body.hidden = !(on && portal);
    if (!on || !portal) return;
    if (qrFor !== portal) { qrFor = portal; qrSvg = window.BellatrixQR ? BellatrixQR.svg(portal) : ''; }
    if ($('hsQr').getAttribute('data-for') !== portal) { $('hsQr').innerHTML = qrSvg; $('hsQr').setAttribute('data-for', portal); }
    $('hsUrl').textContent = portal;
  }

  /* ---------- the tablet: the head's address through the link relay ---------- */
  function headBase() {
    var k = clean(ls('bellatrix-link-server'));
    return /^https?:\/\/[^\s\/]+$/i.test(k) ? k : '';
  }
  function fromHead() {
    var b = headBase();
    if (!b || typeof fetch !== 'function') return;
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var to = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;
    fetch(b + '/head/api/info', { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { clearTimeout(to); if (j && j.tunnel) adopt(j.tunnel); }, function () { clearTimeout(to); /* the head is not there now */ });
  }

  function boot() {
    if (onHead()) {
      var i = info();
      if (i && i.tunnel) adopt(i.tunnel);
      mount();
      if (window.MutationObserver) {
        var busy = false;
        new MutationObserver(function () { if (busy) return; busy = true; setTimeout(function () { busy = false; mount(); }, 80); }).observe(document.body, { childList: true, subtree: true });
      }
      setInterval(function () { if ($('hsState')) paint(); else { var j = info(); if (j && j.tunnel) adopt(j.tunnel); } }, 5000);
      return;
    }
    if (headBase()) { setTimeout(fromHead, 3000); setInterval(fromHead, 60000); }
  }
  if (typeof document !== 'undefined' && document.addEventListener && !window.__headServerTest) document.addEventListener('DOMContentLoaded', boot);
  return { adopt: adopt, info: info, _boot: boot, _paint: paint };
})();
