/* LabLand's admin page for the Bellatrix Library (demo on this PC). It reads the store server's state
   every 3 seconds, so a request from a care home appears here while you watch. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var last = '', data = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function day(iso) { return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
  function time(iso) { return iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; }
  function post(path, body) {
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); })
      .then(load, function (e) { window.alert(e.message); });
  }
  function packName(id) { var p = data.catalog.packs.filter(function (x) { return x.id === id; })[0]; return p ? p.name : id; }
  function packState(home, p) {
    if (p.included) return { cls: 'included', text: 'Included' };
    var s = home.packs[p.id];
    if (!s || s.status === 'off') return { cls: s ? 'off' : 'none', text: s ? 'Off' : 'Not active' };
    if (Date.parse(s.until) < Date.now()) return { cls: 'expired', text: (s.status === 'trial' ? 'Trial ended ' : 'Ended ') + day(s.until) };
    return { cls: s.status, text: (s.status === 'trial' ? 'Trial until ' : 'Active until ') + day(s.until) };
  }

  function render() {
    var homes = data.careHomes, codes = Object.keys(homes), packs = data.catalog.packs, sell = packs.filter(function (p) { return !p.included; });
    var open = data.requests.filter(function (r) { return r.state === 'pending'; });
    var live = 0, trials = 0;
    codes.forEach(function (c) { sell.forEach(function (p) { var s = homes[c].packs[p.id]; if (s && s.status !== 'off' && Date.parse(s.until) > Date.now()) { live++; if (s.status === 'trial') trials++; } }); });
    $('stats').innerHTML = [[codes.length, 'care homes'], [live, 'packs running'], [trials, 'free trials running'], [open.length, 'requests to answer', open.length ? 'hot' : '']]
      .map(function (s) { return '<div class="stat ' + (s[2] || '') + '"><b>' + s[0] + '</b><span>' + s[1] + '</span></div>'; }).join('');

    var reqs = data.requests.slice(0, 12);
    $('requests').innerHTML = reqs.length ? reqs.map(function (r) {
      var home = homes[r.code] || { name: r.code };
      return '<div class="req' + (r.state === 'pending' ? '' : ' done') + '"><div class="what"><b>' + esc(home.name) + '</b> <span class="code">' + esc(r.code) + '</span> asks to activate <b>' + esc(packName(r.pack)) + '</b><br><small>' + esc(time(r.at)) +
        (r.state === 'pending' ? '' : ' · ' + esc(r.state) + ' ' + esc(time(r.decided))) + '</small></div>' +
        (r.state === 'pending' ? '<button data-req="' + r.id + '" data-d="approve">Approve (12 months)</button><button class="no" data-req="' + r.id + '" data-d="decline">Decline</button>' : '') + '</div>';
    }).join('') : '<p class="empty">No requests yet. A care home asks from the Library tab of its Care Team app.</p>';

    $('homes').innerHTML = '<thead><tr><th>Care home</th>' + packs.map(function (p) { return '<th>' + esc(p.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      codes.map(function (c) {
        var h = homes[c];
        return '<tr><td><b>' + esc(h.name) + '</b><br><span class="code">' + esc(c) + '</span></td>' + packs.map(function (p) {
          var st = packState(h, p);
          return '<td><span class="st ' + st.cls + '">' + esc(st.text) + '</span>' + (p.included ? '' :
            '<div class="acts"><button class="ghost" data-home="' + esc(c) + '" data-pack="' + p.id + '" data-a="activate">12 months</button>' +
            '<button class="ghost" data-home="' + esc(c) + '" data-pack="' + p.id + '" data-a="trial">Trial</button>' +
            '<button class="ghost" data-home="' + esc(c) + '" data-pack="' + p.id + '" data-a="off">Off</button></div>') + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody>';

    var checks = {};
    data.packages.forEach(function (k) { checks[k.id] = k; });
    var rv = data.catalog.review || { passed: [] };
    $('catalog').innerHTML = '<p>Catalog published ' + esc(time(data.catalog.published)) + ' · ' + (data.catalogSigned ? '<span class="ok">✓ signed by LabLand</span>' : '<span class="bad">✗ signature does not match</span>') +
      ' · reviewed by ' + esc(rv.by) + ' on ' + esc(day(rv.on)) + ': ' + rv.passed.length + ' of ' + data.catalog.checks.length + ' checks passed for every game.</p>' +
      '<div class="packs">' + packs.map(function (p) {
        var k = checks[p.id];
        return '<div class="pk"><h3>' + esc(p.name) + '</h3><small>' + esc(p.promise) + '</small><ul>' + p.games.map(function (g) {
          var gm = data.catalog.games[g] || {};
          return '<li>' + esc(gm.name || g) + ' <small>(' + esc((gm.trains || []).join(', ')) + ')</small></li>';
        }).join('') + '</ul>' + (p.included ? '<small>Built into the app, included everywhere.</small>' : !k ? '<small>Built into the app, unlocked by the licence.</small>' :
          '<small>Download ' + esc(k.version) + ', ' + Math.round(k.bytes / 1024) + ' KB · ' + (k.signed ? '<span class="ok">✓ signature</span>' : '<span class="bad">✗ signature</span>') + ' · ' +
          (k.hashOk ? '<span class="ok">✓ unchanged</span>' : '<span class="bad">✗ changed</span>') + '</small>') + '</div>';
      }).join('') + '</div>';

    $('tamper').checked = !!data.security.tamper;
    $('log').innerHTML = data.log.slice(0, 25).map(function (l) { return '<li><time>' + esc(time(l.at)) + '</time>' + esc(l.text) + '</li>'; }).join('');
  }
  function load() {
    return fetch('/store/admin/state', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      var text = JSON.stringify(d);
      if (text === last) return;
      last = text; data = d;
      render();
    }).catch(function () { $('stats').innerHTML = '<div class="stat hot"><b>!</b><span>The store server is not running. Start “Start store demo.bat”.</span></div>'; });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.getAttribute('data-req')) post('/store/admin/request', { id: b.getAttribute('data-req'), decision: b.getAttribute('data-d') });
    else if (b.getAttribute('data-home')) post('/store/admin/pack', { code: b.getAttribute('data-home'), pack: b.getAttribute('data-pack'), action: b.getAttribute('data-a') });
  });
  $('addHome').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('homeName').value.trim();
    if (!name) return;
    post('/store/admin/care-home', { name: name }).then(function () { $('homeName').value = ''; });
  });
  $('tamper').addEventListener('change', function () { post('/store/admin/security', { tamper: this.checked }); });
  $('reset').addEventListener('click', function () {
    if (window.confirm('Start the demo again? Care homes, trials and requests go back to the beginning.')) post('/store/admin/reset', {});
  });
  load();
  setInterval(load, 3000);
})();
