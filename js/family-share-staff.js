/* Family portal 1.16 (agent F2), BF-09: "Partager avec la famille" in the Care Team.
   A photo (taken or chosen) and a few words, shared with the resident's family in the portal's
   follow-up ("Moments"), only when the resident's consent level is 'all' (BF-27). The care team also
   sees what it shared for that resident and can take it back.
   - FamilyShare.open({ code, activity, day }) opens the small window (code: the resident's code).
   - FamilyShare.button(code, sessionId) gives the button's HTML for a list; any element with
     data-fshare="<code>" (and data-fsession="<session id>") opens it on click.
   - Results (staff.html, #resBody): a "Famille" button is added to each session row by itself, next
     to ".md", until the Care Team owner places one (then nothing is added twice).
   The server: labland/family-feed.mjs (robot/moment, in parts: bodies are read up to 64 KB), with the
   robot's credentials (FamilyMessages.request, js/messages.js). Its look: css/family-share-staff.css.
   ES5 (Chrome 95 WebView). */
var FamilyShare = (function () {
  'use strict';
  var STORE = 'bellatrix-care-lab-v1', PART = 48000, TEXT_MAX = 140;
  function S(k, v) { return typeof ST === 'function' ? ST(k, v) : I18N.t('en', k, v); }
  (function () {
    var add = typeof ST === 'function' && ST.add ? ST.add : function (l, t) { I18N.add(l, t); };
    add('fr', {
      'Share with the family': 'Partager avec la famille', 'Family': 'Famille', 'Take a photo': 'Prendre une photo', 'Another photo': 'Une autre photo',
      'A few words (optional)': 'Quelques mots (facultatif)', 'Share': 'Partager', 'Sharing…': 'Partage…', 'Shared with the family.': 'Partagé avec la famille.',
      'Already shared': 'Déjà partagé', 'Take back': 'Retirer', 'Close': 'Fermer',
      'The family sees this only with the consent "see everything".': 'La famille ne voit ceci qu’avec le consentement « tout voir ».',
      'No family portal for this resident yet.': 'Pas encore de portail famille pour ce résident.',
      'No connection to the family portal.': 'Pas de connexion au portail famille.', 'This photo could not be read.': 'Cette photo n’a pas pu être lue.',
      'Add a photo or a few words.': 'Ajoutez une photo ou quelques mots.', 'Nothing shared yet.': 'Rien de partagé pour l’instant.'
    });
    add('de', {
      'Share with the family': 'Mit der Familie teilen', 'Family': 'Familie', 'Take a photo': 'Foto aufnehmen', 'Another photo': 'Anderes Foto',
      'A few words (optional)': 'Ein paar Worte (optional)', 'Share': 'Teilen', 'Sharing…': 'Wird geteilt…', 'Shared with the family.': 'Mit der Familie geteilt.',
      'Already shared': 'Schon geteilt', 'Take back': 'Zurücknehmen', 'Close': 'Schließen',
      'The family sees this only with the consent "see everything".': 'Die Familie sieht das nur mit der Einwilligung „alles sehen“.',
      'No family portal for this resident yet.': 'Für diese Person gibt es noch kein Familienportal.',
      'No connection to the family portal.': 'Keine Verbindung zum Familienportal.', 'This photo could not be read.': 'Dieses Foto konnte nicht gelesen werden.',
      'Add a photo or a few words.': 'Fügen Sie ein Foto oder ein paar Worte hinzu.', 'Nothing shared yet.': 'Noch nichts geteilt.'
    });
  })();
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fm() { return typeof FamilyMessages !== 'undefined' ? FamilyMessages : null; }
  function toast(t) { if (window.Lab && Lab.toast) Lab.toast(t); }
  function css() {
    if (document.getElementById('fsh-css')) return;
    var l = document.createElement('link');
    l.id = 'fsh-css'; l.rel = 'stylesheet'; l.href = 'css/family-share-staff.css';
    document.head.appendChild(l);
  }
  function sessionById(id) {
    var s = {}; try { s = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { s = {}; }
    return (s.sessions || []).filter(function (x) { return x.id === id; })[0] || null;
  }
  var CAM = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="13" r="3.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 6 l1.6-2.2 h4.8 L16 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  var HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20 C5 15.5 3 12 4.5 9 C6 6 9.5 6 12 9 C14.5 6 18 6 19.5 9 C21 12 19 15.5 12 20 Z" fill="currentColor"/></svg>';

  /* A photo, made smaller here (1600 px at most), as JPEG base64 without the data: prefix. */
  function shrink(file) {
    return new Promise(function (ok, ko) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var data = c.toDataURL('image/jpeg', 0.82);
        ok({ data: data.slice(data.indexOf(',') + 1), preview: data, w: c.width, h: c.height });
      };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('bad-photo')); };
      img.src = url;
    });
  }

  var box = null, cur = null;
  function close() { if (box) { box.remove(); box = null; } cur = null; }
  function open(o) {
    o = o || {};
    var F = fm();
    if (!F || !o.code) return;
    css();
    close();
    cur = { code: String(o.code), activity: o.activity || '', day: o.day || '', photo: null, busy: false, level: undefined, shared: null, error: '' };
    box = document.createElement('div');
    box.className = 'fsh-back';
    box.addEventListener('click', function (e) {
      if (e.target === box) { close(); return; }
      var b = e.target.closest('[data-fsh]');
      if (!b) return;
      var what = b.getAttribute('data-fsh');
      if (what === 'close') close();
      else if (what === 'photo') box.querySelector('#fshFile').click();
      else if (what === 'share') share();
      else if (what === 'back') takeBack(b.getAttribute('data-id'));
    });
    box.addEventListener('change', function (e) {
      if (e.target.id !== 'fshFile' || !e.target.files || !e.target.files[0]) return;
      shrink(e.target.files[0]).then(function (p) { cur.photo = p; cur.error = ''; paint(); }, function () { cur.error = S('This photo could not be read.'); paint(); });
    });
    box.addEventListener('input', function (e) { if (e.target.id === 'fshText') { var c = box.querySelector('#fshCount'); if (c) c.textContent = e.target.value.length + ' / ' + TEXT_MAX; } });
    document.body.appendChild(box);
    paint();
    F.request('GET', 'feed/robot/consent').then(function (r) {
      var me = (r.residents || []).filter(function (x) { return String(x.code).toUpperCase() === cur.code.toUpperCase(); })[0];
      cur.level = me ? me.consent : 'unknown';
      paint();
      if (cur.level === 'all') loadShared();
    }, function () { if (cur) { cur.level = 'offline'; paint(); } });
  }
  function loadShared() {
    var c = cur;
    fm().request('GET', 'feed/robot/moments?code=' + encodeURIComponent(c.code)).then(function (r) {
      if (cur !== c) return;
      c.shared = (r.items || []).filter(function (m) { return m.kind !== 'event'; }).slice(0, 4);
      paint();
      c.shared.forEach(function (m) { if (m.hasPhoto) fetchThumb(m.id); });
    }, function () { /* the list is only a help */ });
  }
  var thumbs = {};
  function fetchThumb(id) {
    if (thumbs[id]) return;
    var F = fm();
    thumbs[id] = 'loading';
    fetch(F.base() + 'feed/robot/photo?id=' + encodeURIComponent(id), { headers: { Authorization: 'Robot ' + F.robotId() + '.' + robotKey() }, cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('photo'); return r.blob(); })
      .then(function (b) { thumbs[id] = URL.createObjectURL(b); paint(); }, function () { thumbs[id] = 'failed'; });
  }
  function robotKey() { try { return localStorage.getItem('bellatrix-portal-key') || ''; } catch (e) { return ''; } }
  function paint() {
    if (!box || !cur) return;
    var t = box.querySelector('#fshText'), keep = t ? t.value : '';
    var ok = cur.level === 'all', note = '';
    if (cur.level === 'offline') note = S('No connection to the family portal.');
    else if (cur.level === 'unknown') note = S('No family portal for this resident yet.');
    else if (cur.level !== undefined && !ok) note = S('The family sees this only with the consent "see everything".');
    var act = cur.activity ? (typeof ST === 'function' ? ST(activityName(cur.activity)) : activityName(cur.activity)) : '';
    box.innerHTML = '<section class="fsh" role="dialog" aria-modal="true" aria-labelledby="fshTitle">' +
      '<button type="button" class="fsh-x" data-fsh="close" aria-label="' + esc(S('Close')) + '">×</button>' +
      '<h2 id="fshTitle"><span class="fsh-heart">' + HEART + '</span>' + esc(S('Share with the family')) + '</h2>' +
      '<p class="fsh-who"><b>' + esc(cur.code) + '</b>' + (act ? ' · ' + esc(act) : '') + '</p>' +
      (note ? '<p class="fsh-note">' + esc(note) + '</p>' : '') +
      '<input type="file" id="fshFile" accept="image/*" capture="environment" hidden>' +
      (cur.photo ? '<figure class="fsh-pic"><img src="' + cur.photo.preview + '" alt=""></figure>' : '') +
      '<button type="button" class="fsh-photo" data-fsh="photo"' + (ok ? '' : ' disabled') + '>' + CAM + '<span>' + esc(cur.photo ? S('Another photo') : S('Take a photo')) + '</span></button>' +
      '<label class="fsh-field"><textarea id="fshText" rows="2" maxlength="' + TEXT_MAX + '" placeholder="' + esc(S('A few words (optional)')) + '"' + (ok ? '' : ' disabled') + '>' + esc(keep) + '</textarea><small id="fshCount">' + keep.length + ' / ' + TEXT_MAX + '</small></label>' +
      (cur.error ? '<p class="fsh-err" role="alert">' + esc(cur.error) + '</p>' : '') +
      '<button type="button" class="fsh-go" data-fsh="share"' + (ok && !cur.busy ? '' : ' disabled') + '>' + esc(cur.busy ? S('Sharing…') : S('Share')) + '</button>' +
      (ok && cur.shared ? '<h3>' + esc(S('Already shared')) + '</h3>' + (cur.shared.length ? '<ul class="fsh-list">' + cur.shared.map(function (m) {
        var th = thumbs[m.id] && thumbs[m.id].indexOf('blob:') === 0 ? '<img src="' + thumbs[m.id] + '" alt="">' : HEART;
        return '<li><span class="fsh-th">' + th + '</span><span class="fsh-tx">' + esc(m.text || new Date(m.at).toLocaleDateString()) + '</span><button type="button" class="ghost sm" data-fsh="back" data-id="' + esc(m.id) + '">' + esc(S('Take back')) + '</button></li>';
      }).join('') + '</ul>' : '<p class="fsh-note">' + esc(S('Nothing shared yet.')) + '</p>') : '') +
      '</section>';
  }
  function activityName(k) {
    var a = window.Lab && Lab.byKey && Lab.byKey[k];
    return a ? a.name : k;
  }
  function share() {
    if (!cur || cur.busy || cur.level !== 'all') return;
    var F = fm(), c = cur, text = (box.querySelector('#fshText') || {}).value || '';
    text = text.trim().slice(0, TEXT_MAX);
    if (!c.photo && !text) { c.error = S('Add a photo or a few words.'); paint(); return; }
    var parts = [];
    if (c.photo) for (var i = 0; i < c.photo.data.length; i += PART) parts.push(c.photo.data.slice(i, i + PART));
    c.busy = true; c.error = ''; paint();
    F.request('POST', 'feed/robot/moment', { code: c.code, text: text, parts: parts.length, activity: c.activity, day: c.day }).then(function (r) {
      var step = function (k) {
        if (k >= parts.length) return Promise.resolve(r);
        return F.request('POST', 'feed/robot/moment/part', { id: r.id, i: k, data: parts[k] }).then(function () { return step(k + 1); });
      };
      return step(0);
    }).then(function () {
      toast(S('Shared with the family.'));
      close();
    }, function (e) {
      c.busy = false;
      c.error = e && e.code === 'consent' ? S('The family sees this only with the consent "see everything".') : e && /photo/.test(e.code || '') ? S('This photo could not be read.') : S('No connection to the family portal.');
      paint();
    });
  }
  function takeBack(id) {
    var c = cur;
    fm().request('POST', 'feed/robot/moment/delete', { id: id }).then(function () { if (cur === c) loadShared(); }, function () { /* stays */ });
  }

  function button(code, sessionId) {
    return '<button type="button" class="ghost sm fsh-btn" data-fshare="' + esc(code) + '"' + (sessionId ? ' data-fsession="' + esc(sessionId) + '"' : '') + ' title="' + esc(S('Share with the family')) + '">' + HEART + '<span>' + esc(S('Family')) + '</span></button>';
  }
  /* Results: one button per session row, next to ".md", unless the page already has its own. */
  function decorate(root) {
    if (!root || root.querySelector('[data-fshare]:not(.fsh-auto)')) return;
    Array.prototype.forEach.call(root.querySelectorAll('button[data-r="md"][data-id]'), function (md) {
      if (md.parentNode.querySelector('.fsh-auto')) return;
      var rec = sessionById(md.getAttribute('data-id'));
      if (!rec || !rec.participant || rec.preview) return;
      md.insertAdjacentHTML('afterend', ' ' + button(rec.participant, rec.id).replace('fsh-btn"', 'fsh-btn fsh-auto"'));
    });
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-fshare]') : null;
      if (!b) return;
      e.preventDefault();
      var rec = b.getAttribute('data-fsession') ? sessionById(b.getAttribute('data-fsession')) : null;
      open({ code: b.getAttribute('data-fshare'), activity: rec ? rec.activity : '', day: rec ? rec.date : '' });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && box) close(); });
    document.addEventListener('DOMContentLoaded', function () {
      var res = document.getElementById('resBody');
      if (!res || !window.MutationObserver) return;
      css();
      decorate(res);
      new MutationObserver(function () { decorate(res); }).observe(res, { childList: true, subtree: true });
    });
  }
  return { open: open, close: close, button: button };
})();
