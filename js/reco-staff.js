/* Care Team: the weekly and monthly playlists of the recommendation engine (briefing b1, block C).
   15 Nov (Rahma): shown in the settings of Bellatrix Play (Activities > Bellatrix Play > Personalise,
   #recoBody in staff.html; staff.js shows it for that activity only, event 'bellatrix-staff-act'), for
   the resident chosen in Activities. The "Music & photos" tab is gone. Also reached from "To do"
   (playlists to approve: that resident) and from the Bellatrix Play activity ("Playlists of the week").
   1.16 (tester, 10 Nov: "far too much text", "could not find the playlists"): the playlists come
   FIRST, with one short line per state; everything else folds under "More":
   - per resident (the chips at the top; the one chosen in Activities first);
   - no consent yet: one line and the button to record it (resident or legal representative);
     without it nothing is collected and no playlist is made;
   - the playlists: made on this robot as DRAFTS when a new week or month begins, changed (add,
     remove, order) and approved here; only approved playlists reach Play;
   - "More": starting songs for a new resident, songs never to propose, deletion of the listening
     data on request, withdrawing the consent, the access log and the engine settings.
   Staff only: this page is the Care Team app. No inference about the person is shown or stored: the
   engine only chooses songs. Texts through ST(); French and German in js/i18n-play.js and, for the
   1.16 texts, js/i18n-staff.js. ES5 (Chrome 95). */
(function () {
  'use strict';
  if (typeof document === 'undefined' || !window.Reco || !window.ST) return;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]; }); };
  var $ = function (id) { return document.getElementById(id); };
  var STAFF = 'bellatrix-reco-staff';
  var sel = { code: null, pl: null, add: '', cold: '', coldIds: null, viewed: {}, more: false };
  var panel = null, open = false;

  function st() { return Reco.shared ? Reco.shared() : null; }
  function tr(s, v) { return ST(s, v); }
  /* The initials of the Tools menu ("Who are you?", js/staff-tools.js) when none were typed here. */
  function initials() {
    var v = '';
    try { v = localStorage.getItem(STAFF) || ''; } catch (e) { v = ''; }
    if (!v && window.StaffTools && StaffTools.initials) { try { v = StaffTools.initials(); } catch (e) { v = ''; } }
    return v;
  }
  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try { return d.toLocaleString(I18N.BCP47[ST.lang()] || 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return d.toISOString().slice(0, 16).replace('T', ' '); }
  }
  function songLine(id) {
    var s = st().songs.byId[id];
    return s ? s : { title: id, artist: '', year: 0 };
  }
  function periodName(pl) {
    return pl.period === 'month' ? tr('Month {key}', { key: pl.periodKey }) : tr('Week {key}', { key: pl.periodKey.replace(/^\d{4}-W/, '') + ' (' + pl.periodKey.slice(0, 4) + ')' });
  }
  var STATUS = { draft: 'To approve', approved: 'Approved', active: 'Active', archived: 'Archived' };
  var BUCKET = { close: 'Close to the taste', neighbour: 'Neighbour', discovery: 'Discovery', staff: 'Added by the team' };
  /* One short line each (1.16); information for the team, never an alert. */
  var INFO = {
    'profile-building': 'Little listening yet: mostly well-known songs.',
    'rejects-much': 'Many songs skipped lately: kept close to known songs.',
    'team-feedback-poor': 'The last one did not suit: kept closer to known songs.',
    'widened': 'Few songs left: a wider choice.',
    'recent-allowed': 'Recent songs allowed to fill the list.',
    'short': 'Shorter than usual.',
    'overlap': 'Many songs shared with the last playlist.'
  };
  /* ---------- the place ---------- */
  /* 15 Nov: no tab, so no count on a tab: "To do" says how many playlists wait (staff.js renderWaits). */
  function label() { /* nothing to update */ }
  /* Shown by staff.js (the event below); from elsewhere, RecoStaff.show() asks staff.js first. */
  function curCode() { return $('fParticipant') ? String($('fParticipant').value || '').trim() : ''; }
  function shown() {
    open = true;
    sel.code = curCode() || sel.code;
    render();
  }
  function show() {
    if (window.StaffUI && StaffUI.openActivity) StaffUI.openActivity('play', sel.code); else shown();
  }
  function hide() { open = false; }
  function mount() {
    var body = $('recoBody');
    if (!body || panel) return;
    panel = body.parentNode;
    label();
    window.addEventListener('bellatrix-staff-act', function (e) {
      var d = e.detail || {};
      if (d.key === 'play') shown(); else hide();
    });
    panel.addEventListener('click', onClick);
    panel.addEventListener('input', onInput);
    panel.addEventListener('toggle', function (e) { if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-rs-more')) sel.more = e.target.open; }, true);
    window.addEventListener('bellatrix-reco', function () { label(); if (open) render(); });
    /* the patient chosen in Activities is the one shown here too */
    if ($('fParticipant')) $('fParticipant').addEventListener('change', function () { var c = String(this.value || '').trim(); if (c) { sel.code = c; sel.pl = null; sel.coldIds = null; } if (open) render(); });
    window.addEventListener('storage', function (e) { if (e.key && e.key.indexOf('bellatrix-reco') === 0) { label(); if (open) render(); } });
    if (window.StaffUI && StaffUI.activity && StaffUI.activity() === 'play') shown();
  }

  /* ---------- drawing ---------- */
  function render() {
    var R = st(), body = $('recoBody');
    if (!R || !body) return;
    /* the resident chosen in Activities ("Personalise for P1"): a title only, no chips */
    sel.code = curCode() || sel.code;
    var h = '<div class="rs-main"><div class="rs-head"><h3 class="ph">' + esc(tr('Playlists')) + '</h3></div>';
    if (!sel.code) { body.innerHTML = h + '<p class="note">' + esc(tr('No resident yet: add a patient code in Activities.')) + '</p></div>'; return; }
    var code = sel.code;
    if (!sel.viewed[code]) { sel.viewed[code] = 1; R.logAccess('viewed', code, initials()); }
    h += R.isOn(code) ? playlistsHtml(code) : consentHtml(code);
    h += moreHtml(code) + '</div>';
    body.innerHTML = h;
    label();
  }
  /* No consent: one line, one choice, one button. */
  function consentHtml(code) {
    var c = st().consent(code);
    return '<div class="rs-consent"><p><b>' + esc(code) + '</b> · ' + esc(tr('No consent yet: no playlist.')) + '</p>' +
      '<div class="rs-row"><label>' + esc(tr('Agreed by')) + ' <select data-rs-f="by"><option value="resident">' + esc(tr('the resident')) + '</option><option value="representative">' + esc(tr('the legal representative')) + '</option></select></label>' +
      '<button type="button" class="go" data-rs="consent-on">' + esc(tr('Record the consent')) + '</button></div>' +
      (c && !c.on ? '<p class="note">' + esc(tr('Withdrawn on {t}, recorded by {staff}.', { t: when(c.at), staff: c.staff || '–' })) + '</p>' : '') + '</div>';
  }
  function playlistsHtml(code) {
    var R = st(), all = R.playlists({ residentId: code }), pls = all.filter(function (p) { return p.status !== 'archived'; });
    if (!pls.length) return '<div class="rs-consent"><p><b>' + esc(code) + '</b> · ' + esc(tr('No playlist yet.')) + '</p><div class="rs-row"><button type="button" class="go" data-rs="run">' + esc(tr('Make the playlists now')) + '</button></div></div>';
    if (!sel.pl || !all.some(function (p) { return p.id === sel.pl; })) sel.pl = (pls.filter(function (p) { return p.status === 'draft'; })[0] || pls[0]).id;
    var h = '<div class="rs-pls">' + pls.map(function (p) {
      return '<button type="button" data-rs="pl" data-id="' + esc(p.id) + '" class="' + (p.id === sel.pl ? 'on' : '') + '"><b>' + esc(periodName(p)) + '</b> <span class="rs-badge ' + p.status + '">' + esc(tr(STATUS[p.status])) + '</span><small>' + esc(tr('{n} songs', { n: p.items.length })) + '</small></button>';
    }).join('') + '</div>';
    var pl = R.get(sel.pl);
    if (!pl) return h;
    var edit = pl.status !== 'archived';
    if (pl.status === 'archived') h += '<p class="note">' + esc(periodName(pl)) + ' · ' + esc(tr('Archived')) + '</p>';
    (pl.info || []).forEach(function (k) { if (INFO[k]) h += '<p class="rs-info">' + esc(tr(INFO[k])) + '</p>'; });
    /* The one thing to do first: approve (above the songs, so it is seen without scrolling). */
    if (pl.status === 'draft') {
      h += '<div class="rs-row rs-approve"><button type="button" class="go" data-rs="approve">' + esc(tr('Approve')) + '</button>' +
        '<button type="button" class="ghost sm" data-rs="regen">' + esc(tr('Make it again')) + '</button><span class="note">' + esc(tr('Not offered until approved.')) + '</span></div>';
    }
    h += '<ol class="rs-list">' + pl.items.map(function (it, i) {
      var s = songLine(it.songId), why = Reco.reasonText(it.reason, tr);
      return '<li><span class="rs-num">' + (i + 1) + '</span><span class="rs-song"' + (why ? ' title="' + esc(why) + '"' : '') + '><strong>' + esc(s.title) + '</strong><small>' + esc((s.artist || '') + (s.year ? ' · ' + s.year : '')) +
        ' <span class="rs-tag ' + esc(it.bucket) + '">' + esc(tr(BUCKET[it.bucket] || it.bucket)) + '</span></small></span>' +
        (edit ? '<span class="rs-acts"><button type="button" data-rs="up" data-id="' + esc(it.songId) + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="' + esc(tr('Move up')) + '" title="' + esc(tr('Move up')) + '">↑</button>' +
          '<button type="button" data-rs="down" data-id="' + esc(it.songId) + '"' + (i === pl.items.length - 1 ? ' disabled' : '') + ' aria-label="' + esc(tr('Move down')) + '" title="' + esc(tr('Move down')) + '">↓</button>' +
          '<button type="button" data-rs="remove" data-id="' + esc(it.songId) + '" aria-label="' + esc(tr('Remove')) + '" title="' + esc(tr('Remove')) + '">×</button>' +
          '<button type="button" data-rs="exclude" data-id="' + esc(it.songId) + '" aria-label="' + esc(tr('Never propose to this resident')) + '" title="' + esc(tr('Never propose to this resident')) + '">⊘</button></span>' : '<span></span>') + '</li>';
    }).join('') + '</ol>';
    if (edit) h += '<input type="text" data-rs-f="add" value="' + esc(sel.add) + '" placeholder="' + esc(tr('Add a song')) + '" aria-label="' + esc(tr('Add a song')) + '" autocomplete="off">' + found(sel.add, 'add', pl.items.map(function (it) { return it.songId; }));
    if (pl.status !== 'draft' && pl.approvedBy) {
      h += '<p class="note">' + esc(tr('Approved by {who} on {t}.', { who: pl.approvedBy, t: when(pl.approvedAt) })) + (edit ? ' ' + esc(tr('A change needs a new approval.')) : '') + '</p>';
    }
    if (pl.status === 'approved' || pl.status === 'active' || (pl.status === 'archived' && pl.approvedBy)) {
      var u = R.usage(pl), fb = pl.feedback ? pl.feedback.value : '';
      h += '<div class="rs-row rs-feedback"><span class="note">' + esc(tr('{c} to the end · {l} ♥ · {s} skipped', { c: u.complete, l: u.like, s: u.skip })) + '</span><span class="grow"></span><span>' + esc(tr('How did this playlist suit?')) + '</span>' +
        [['good', '🙂'], ['mixed', '😐'], ['poor', '🙁']].map(function (f) { return '<button type="button" data-rs="fb" data-v="' + f[0] + '" class="' + (fb === f[0] ? 'on' : '') + '" aria-label="' + esc(tr(f[0] === 'good' ? 'Suited well' : f[0] === 'mixed' ? 'Partly' : 'Did not suit')) + '">' + f[1] + '</button>'; }).join('') + '</div>';
    }
    return h;
  }
  function found(q, action, skip) {
    q = Reco.norm(q);
    if (q.length < 2) return '';
    var out = st().songs.list.filter(function (s) { return s.kind !== 'video' && (skip || []).indexOf(s.id) < 0 && (Reco.norm(s.title).indexOf(q) >= 0 || Reco.norm(s.artist).indexOf(q) >= 0); }).slice(0, 8);
    if (!out.length) return '<p class="note">' + esc(tr('No song found.')) + '</p>';
    return '<div class="rs-found">' + out.map(function (s) { return '<button type="button" data-rs="' + action + '" data-id="' + esc(s.id) + '">+ ' + esc(s.title + (s.artist ? ' – ' + s.artist : '') + (s.year ? ' (' + s.year + ')' : '')) + '</button>'; }).join('') + '</div>';
  }
  /* "More": what is rarely needed, folded. */
  function moreHtml(code) {
    var R = st(), on = R.isOn(code), c = R.consent(code), meta = R.meta(), cfg = R.cfg, h = '';
    h += '<details class="more rs-more" data-rs-more' + (sel.more ? ' open' : '') + '><summary>' + esc(tr('More options')) + '</summary>';
    if (on) h += startHtml(code);
    h += excludedHtml(code);
    h += '<div class="rs-sub"><h3>' + esc(tr('Consent and data')) + '</h3>' +
      (c && c.on ? '<p class="note">' + esc(tr('Given by {by} on {t}, recorded by {staff}.', { by: tr(c.by === 'representative' ? 'the legal representative' : 'the resident'), t: when(c.at), staff: c.staff || '–' })) + '</p>' : '') +
      '<p class="note">' + esc(tr('Listening data is kept {n} days, then deleted.', { n: cfg.retentionDays })) + '</p><div class="rs-row">' +
      (on ? '<button type="button" class="ghost sm" data-rs="consent-off">' + esc(tr('Withdraw the consent')) + '</button>' : '') +
      '<button type="button" class="ghost sm danger" data-rs="delete">' + esc(tr('Delete the listening data (on request)')) + '</button></div></div>';
    var archived = R.playlists({ residentId: code }).filter(function (p) { return p.status === 'archived'; });
    if (archived.length) h += '<div class="rs-sub"><h3>' + esc(tr('Earlier playlists')) + '</h3><div class="rs-pls">' + archived.map(function (p) {
      return '<button type="button" data-rs="pl" data-id="' + esc(p.id) + '" class="' + (p.id === sel.pl ? 'on' : '') + '">' + esc(periodName(p)) + '<small>' + esc(tr('{n} songs', { n: p.items.length })) + '</small></button>';
    }).join('') + '</div></div>';
    var cur = sel.pl ? R.get(sel.pl) : null;
    if (cur && cur.residentId === code) h += '<details><summary>' + esc(tr('Log of this playlist')) + '</summary><ol class="rs-log">' + (cur.log || []).map(function (l) { return '<li>' + esc(when(l.at) + ' · ' + l.action + (l.by ? ' · ' + l.by : '')) + '</li>'; }).join('') + '</ol></details>';
    var list = R.access(code).slice(-15).reverse();
    h += '<details><summary>' + esc(tr('Access log')) + ' (' + list.length + ')</summary><ol class="rs-log">' + list.map(function (a) { return '<li>' + esc(when(a.at) + ' · ' + a.action + (a.by ? ' · ' + a.by : '')) + '</li>'; }).join('') + '</ol></details>';
    h += '<div class="rs-row"><button type="button" class="ghost sm" data-rs="run">' + esc(tr('Check for new playlists now')) + '</button>' +
      '<span class="note">' + esc(tr('New every Monday and on the 1st.')) + (meta.lastRun ? ' ' + esc(tr('Last check: {t}.', { t: when(meta.lastRun) })) : '') + '</span></div>' +
      '<p class="note rs-cfg">' + esc(tr('Made on this robot; nothing leaves it.')) + ' ' + esc((Reco.config && Reco.config.hash ? cfg.version + ' (' + Reco.config.hash(cfg) + ')' : cfg.version) + ' · ' +
        Math.round(cfg.mix.close * 100) + ' / ' + Math.round(cfg.mix.neighbour * 100) + ' / ' + Math.round(cfg.mix.discovery * 100) + ' %') + '</p>';
    return h + '</details>';
  }
  function startHtml(code) {
    var R = st(), cold = R.cold(code) || { songs: [], decade: 0, lang: '' }, P = R.profile(code, 'week');
    if (!sel.coldIds || sel.coldFor !== code) { sel.coldIds = (cold.songs || []).slice(); sel.coldFor = code; }
    var h = '<div class="rs-sub"><h3>' + esc(tr('Starting songs')) + (P && P.isInitial ? ' <span class="rs-badge warn">' + esc(tr('Profile in progress')) + '</span>' : '') + '</h3>' +
      '<p class="note">' + esc(tr('3 to 5 songs, or an era and a language.')) + '</p>';
    h += '<div class="rs-chips">' + sel.coldIds.map(function (id) { var s = songLine(id); return '<span>' + esc(s.title + (s.artist ? ' – ' + s.artist : '')) + '<button type="button" data-rs="cold-del" data-id="' + esc(id) + '" aria-label="' + esc(tr('Remove')) + '">×</button></span>'; }).join('') + '</div>';
    if (sel.coldIds.length < R.cfg.coldStart.maxSongs) h += '<input type="text" data-rs-f="cold" value="' + esc(sel.cold) + '" placeholder="' + esc(tr('Search a song or an artist')) + '" autocomplete="off">' + found(sel.cold, 'cold-add', sel.coldIds);
    var decs = [0, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010];
    h += '<div class="rs-row"><label>' + esc(tr('Era')) + ' <select data-rs-f="decade">' + decs.map(function (d) { return '<option value="' + d + '"' + (cold.decade === d ? ' selected' : '') + '>' + esc(d ? tr('{y}s', { y: d, yy: d >= 2000 ? String(d) : String(d).slice(2) }) : '–') + '</option>'; }).join('') + '</select></label>' +
      '<label>' + esc(tr('Language of the songs')) + ' <select data-rs-f="lang">' + ['', 'fr', 'de', 'en', 'es', 'it'].map(function (l) { return '<option value="' + l + '"' + (cold.lang === l ? ' selected' : '') + '>' + esc(l ? tr(Reco.LANG_NAMES[l]) : '–') + '</option>'; }).join('') + '</select></label>' +
      '<button type="button" class="go sm" data-rs="cold-save">' + esc(tr('Save')) + '</button></div>';
    return h + '</div>';
  }
  function excludedHtml(code) {
    var R = st(), ex = R.excluded(code), ids = Object.keys(ex);
    return '<div class="rs-sub"><h3>' + esc(tr('Never proposed to {code}', { code: code })) + '</h3>' +
      (ids.length ? '<ul class="rs-list">' + ids.map(function (id) { var s = songLine(id); return '<li><span class="rs-num">⊘</span><span class="rs-song"><strong>' + esc(s.title) + '</strong><small>' + esc(s.artist + ' · ' + tr('since {t}', { t: when(ex[id].at) })) + '</small></span><span class="rs-acts"><button type="button" data-rs="unexclude" data-id="' + esc(id) + '" title="' + esc(tr('Allow again')) + '" aria-label="' + esc(tr('Allow again')) + '">↺</button></span></li>'; }).join('') + '</ul>'
        : '<p class="note">' + esc(tr('None yet (⊘ in a playlist).')) + '</p>') + '</div>';
  }

  /* ---------- actions ---------- */
  function toast(t) { if (window.Lab && Lab.toast) Lab.toast(t); }
  /* 1.15 (user, 10 Nov): no initials field; the log names the staff member if known, else "Care team". */
  function needWho() { return initials() || tr('Care team'); }
  function onClick(e) {
    var b = e.target.closest ? e.target.closest('[data-rs]') : null;
    if (!b || b.disabled) return;
    var R = st(), a = b.getAttribute('data-rs'), id = b.getAttribute('data-id'), code = sel.code, by = initials();
    if (a === 'pick') { sel.code = b.getAttribute('data-code'); sel.pl = null; sel.add = ''; sel.cold = ''; sel.coldIds = null; }
    else if (a === 'run') { var made = R.runDue(); toast(made.length ? tr('{n} playlists to approve', { n: made.length }) : tr('Nothing new.')); }
    else if (a === 'consent-on') {
      var f = panel.querySelector('[data-rs-f="by"]');
      R.setConsent(code, { on: true, by: f ? f.value : 'resident', staff: needWho() });
      R.runDue();
      sel.pl = null;
    } else if (a === 'consent-off') {
      if (!window.confirm(tr('Withdraw the music consent of {code}? Nothing more is collected and no playlist is made.', { code: code }))) return;
      var w2 = needWho();
      R.setConsent(code, { on: false, by: (R.consent(code) || {}).by, staff: w2 });
      if (window.confirm(tr('Also delete the listening data and playlists of {code} now?', { code: code }))) R.deleteResident(code, w2);
    } else if (a === 'delete') {
      if (!window.confirm(tr('Delete all listening data, hearts, starting profile and playlists of {code}? This cannot be undone.', { code: code }))) return;
      R.deleteResident(code, needWho());
      sel.pl = null; sel.coldIds = null;
    } else if (a === 'cold-add') { if (sel.coldIds.length < R.cfg.coldStart.maxSongs && sel.coldIds.indexOf(id) < 0) sel.coldIds.push(id); sel.cold = ''; }
    else if (a === 'cold-del') { sel.coldIds = sel.coldIds.filter(function (x) { return x !== id; }); }
    else if (a === 'cold-save') {
      var dec = panel.querySelector('[data-rs-f="decade"]'), lg = panel.querySelector('[data-rs-f="lang"]');
      if (!(sel.coldIds.length >= R.cfg.coldStart.minSongs || (dec && +dec.value && lg && lg.value))) { toast(tr('Choose 3 to 5 songs, or an era and a language.')); return; }
      R.setCold(code, { songs: sel.coldIds, decade: dec ? dec.value : 0, lang: lg ? lg.value : '', by: needWho() });
      toast(tr('Saved.'));
    } else if (a === 'pl') { sel.pl = id; sel.add = ''; }
    else if (a === 'up' || a === 'down') R.moveSong(sel.pl, id, a === 'up' ? -1 : 1, by || 'team');
    else if (a === 'remove') R.removeSong(sel.pl, id, by || 'team');
    else if (a === 'add') { R.addSong(sel.pl, id, by || 'team'); sel.add = ''; }
    else if (a === 'exclude') {
      if (!window.confirm(tr('Never propose "{title}" to {code} again?', { title: songLine(id).title, code: code }))) return;
      var w5 = needWho();
      R.exclude(code, id, w5); R.removeSong(sel.pl, id, w5);
    } else if (a === 'unexclude') R.unexclude(code, id, by || 'team');
    else if (a === 'approve') {
      var ok = R.approve(sel.pl, needWho());
      toast(ok ? tr('Approved: now in Play.') : tr('This playlist cannot be approved.'));
    } else if (a === 'regen') R.regenerate(sel.pl, by || 'team');
    else if (a === 'fb') R.feedback(sel.pl, b.getAttribute('data-v'), by || 'team');
    render();
  }
  function onInput(e) {
    var f = e.target.getAttribute && e.target.getAttribute('data-rs-f');
    if (f === 'add' || f === 'cold') {
      sel[f] = e.target.value;
      var pos = e.target.selectionStart;
      render();
      var el = panel.querySelector('[data-rs-f="' + f + '"]');
      if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (x) { /* not a text field */ } }
    }
  }

  document.addEventListener('DOMContentLoaded', function () { try { mount(); } catch (e) { if (window.console) console.warn('Playlists', e); } });
  window.RecoStaff = { show: function (code) { if (code) { sel.code = code; sel.pl = null; sel.coldIds = null; } show(); }, render: function () { if (open) render(); } };
})();
