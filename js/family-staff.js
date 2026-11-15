/* The Care Team's Family tab (version 1.15): video calls between a resident and their family.
   Only what the care team needs, in its own language (ST, texts in js/i18n-family.js):
   - the contacts of the patient chosen in Activities: "Call" (the care team calls the family: a
     one-time link, QR code, WhatsApp, SMS), their own link (the family calls Bellatrix), edit;
   - "Accept calls" (now, or during the call times);
   - the last calls; settings folded away (call server address, call sound at maximum).
   Contacts and photos stay on this device (localStorage 'bellatrix-family', via FamilyCall in
   js/familycall.js). The call server only gets what routing needs: see labland/call-relay.mjs. */
window.FamilyStaff = (function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = Lab.esc, F = window.FamilyCall;
  var S = function (k, v) { return window.ST ? ST(k, v) : I18N.t('en', k, v); };
  var LANG_NAME = { en: 'English', fr: 'Français', de: 'Deutsch' };
  var editing = null, draftPhoto = '', poll = null, out = null;

  function code() { var el = $('fParticipant'); return (el && el.value || '').trim() || 'P1'; }
  /* The resident's language, as the care team set it (read only: staff.js owns that store). */
  function residentLang(c) {
    try {
      var s = JSON.parse(localStorage.getItem('bellatrix-care-lab-v1') || '{}') || {};
      var p = (s.patients || {})[c];
      if (p && p.prefs && p.prefs.lang) return I18N.valid(p.prefs.lang);
    } catch (e) { /* fall back to the form */ }
    return I18N.valid($('optLang') ? $('optLang').value : 'en');
  }
  function linkOf(c) { return c.token ? F.link('t', c.token) : ''; }
  function toast(t) { if (Lab.toast) Lab.toast(t); }
  function find(r, id) { return r.contacts.filter(function (c) { return c.id === id; })[0] || null; }
  function initial(name) { return esc(String(name || '?').trim().charAt(0).toUpperCase() || '?'); }
  function photoHtml(src, name) { return src ? '<img src="' + esc(src) + '" alt="">' : initial(name); }
  function sayLine(c, lang) {
    var name = String(c.name || '').trim() || '…', rel = F.relationPhrase(c, lang);
    return rel ? I18N.t(lang, '{name}, {relation}, is calling you.', { name: name, relation: rel }) : I18N.t(lang, '{name} is calling you.', { name: name });
  }
  function serverDown() { toast(S('The call server does not answer. Check the server address (Settings, below) or start the server on the PC.')); }
  function hhmm(d) { return Lab.pad(d.getHours()) + ':' + Lab.pad(d.getMinutes()); }

  /* ---------- the tab ---------- */
  function render() {
    var box = $('famBody');
    if (!box || !F) return;
    var who = code(), b = F.book(), r = F.resident(b, who), lang = residentLang(who);
    box.innerHTML =
      '<div class="famtop"><h2>' + esc(S('Family calls')) + ' · <b>' + esc(who) + '</b></h2>' +
      '<div class="famstatus" id="famStatus"><i class="dot"></i><span>' + esc(S('Checking…')) + '</span></div></div>' +
      '<div id="famOut"></div>' +

      '<div class="section"><h2>' + esc(S('Contacts')) + '</h2>' +
      '<div class="famlist">' + (r.contacts.length ? r.contacts.map(function (c) { return card(c, lang); }).join('') : '<p class="note">' + esc(S('No contacts yet.')) + '</p>') + '</div>' +
      (editing ? form(r, lang, who) : '<div class="row"><button type="button" class="ghost" data-f="add">+ ' + esc(S('Add a contact')) + '</button></div>') + '</div>' +

      '<div class="section"><h2>' + esc(S('Accept calls')) + '</h2>' +
      '<label class="check field"><input type="checkbox" id="famNow"' + (r.acceptNow ? ' checked' : '') + '> <span><b>' + esc(S('Accept calls now')) + '</b></span></label>' +
      '<details class="famtimesbox"><summary>' + esc(S('Call times')) + '</summary><div class="famtimes">' + r.times.map(function (t, i) {
        return '<div class="famtime"><label class="check"><input type="checkbox" data-t="' + i + '"' + (t.on ? ' checked' : '') + '> <span>' + esc(S('Call time {n}', { n: i + 1 })) + '</span></label>' +
          '<input type="time" data-from="' + i + '" value="' + esc(t.from) + '" aria-label="' + esc(S('from')) + '"> – <input type="time" data-to="' + i + '" value="' + esc(t.to) + '" aria-label="' + esc(S('to')) + '"></div>';
      }).join('') + '</div></details>' +
      '<p class="famnow" id="famNowText"></p></div>' +

      '<div class="section"><h2>' + esc(S('Last calls')) + '</h2>' + lastCalls(who) + '</div>' +

      '<details class="section famsettings"><summary>' + esc(S('Settings')) + '</summary>' +
      '<div class="row"><label class="field" style="flex:1 1 280px">' + esc(S('Call server address')) +
      '<input id="famServer" type="text" autocomplete="off" placeholder="' + esc(S('e.g. https://….trycloudflare.com or http://192.168.1.20:8765')) + '" value="' + esc(F.server()) + '"></label>' +
      '<button type="button" class="ghost" data-f="server">' + esc(S('Save')) + '</button></div>' +
      '<p class="note">' + esc(S('Empty: the server of this page. On the robot: the address shown by the server window on the PC.')) + '</p>' +
      '<label class="check field"><input type="checkbox" id="famLoud"' + (b.loud !== false ? ' checked' : '') + '> <span>' + esc(S('Call sound at maximum (robot loudspeaker during a call)')) + '</span></label>' +
      '<p class="note">' + esc(S('Names and photos stay on this device. Calls are not recorded. A photo only with the person’s agreement.')) + '</p></details>';
    nowText(r);
    status();
    renderOut();
    if (editing) previewSay(lang);
  }
  function fullName(c) { return [c.name, c.last].join(' ').trim(); }
  function relShown(c, lang) {
    var p = F.relationPhrase(c, lang);
    if (p) return p;
    for (var i = 0; i < F.RELATIONS.length; i++) if (F.RELATIONS[i][0] === c.rel) return S(F.RELATIONS[i][1]);
    return '';
  }
  function card(c, lang) {
    var rel = F.relationPhrase(c, lang);
    return '<div class="famc" data-id="' + esc(c.id) + '"><span class="famphoto">' + photoHtml(c.photo, c.name) + '</span>' +
      '<div class="faminfo"><p class="famname"><b>' + esc(fullName(c)) + '</b>' + (relShown(c, lang) ? ' <span class="famrel">' + esc(relShown(c, lang)) + '</span>' : '') + '</p>' +
      (c.phone ? '<p class="famphone">' + esc(c.phone) + '</p>' : '') +
      '<div class="row"><button type="button" class="go famcall" data-f="call">' + esc(S('Call {name}', { name: c.name })) + '</button>' +
      (c.token ? '<button type="button" class="ghost sm" data-f="copy" title="' + esc(linkOf(c)) + '">' + esc(S('Copy their link')) + '</button>' : '') +
      '<button type="button" class="ghost sm" data-f="edit">' + esc(S('Edit')) + '</button></div></div></div>';
  }
  function form(r, lang, who) {
    var c = editing.id ? find(r, editing.id) || {} : {}, rel = c.rel || 'daughter';
    return '<form class="famform" id="famForm" novalidate><h3>' + esc(editing.id ? S('Edit {name}', { name: c.name }) : S('New contact')) + '</h3>' +
      '<div class="grid2">' +
      '<label class="field">' + esc(S('First name')) + '<input id="ffName" type="text" maxlength="40" autocomplete="off" value="' + esc(c.name || '') + '"></label>' +
      '<label class="field">' + esc(S('Last name')) + '<input id="ffLast" type="text" maxlength="40" autocomplete="off" value="' + esc(c.last || '') + '"></label>' +
      '<label class="field">' + esc(S('Relation')) + '<select id="ffRel">' + F.RELATIONS.map(function (x) {
        return '<option value="' + x[0] + '"' + (x[0] === rel ? ' selected' : '') + '>' + esc(x[2] ? x[2][lang] : S(x[1])) + '</option>';
      }).join('') + '</select></label>' +
      '<label class="field" id="ffRelBox"' + (rel === 'other' ? '' : ' hidden') + '>' + esc(S('Relation, as Bellatrix says it')) + '<input id="ffRelText" type="text" maxlength="40" autocomplete="off" placeholder="' +
        esc({ en: 'your neighbour', fr: 'votre voisine', de: 'Ihre Nachbarin' }[lang]) + '" value="' + esc(c.relText || '') + '"></label>' +
      '<label class="field">' + esc(S('Phone')) + '<input id="ffPhone" type="tel" inputmode="tel" maxlength="30" autocomplete="off" value="' + esc(c.phone || '') + '"></label></div>' +
      '<div class="famphotoedit"><span class="famphoto" id="ffThumb">' + photoHtml(draftPhoto, c.name) + '</span>' +
      '<label class="ghost filebtn">' + esc(S('Photo…')) + '<input type="file" id="ffPhoto" accept="image/*"></label>' +
      '<button type="button" class="ghost sm" id="ffNoPhoto"' + (draftPhoto ? '' : ' hidden') + '>' + esc(S('No photo')) + '</button></div>' +
      '<p class="famsay" id="ffSay"></p>' +
      (editing.id ? '<div class="row famlinkrow">' + (c.token
        ? '<button type="button" class="ghost sm" data-f="open">' + esc(S('Open their page')) + '</button><button type="button" class="ghost sm danger" data-f="revoke">' + esc(S('Revoke their link')) + '</button>'
        : '<button type="button" class="ghost sm" data-f="link">' + esc(S('Make a new link')) + '</button>') +
        '<button type="button" class="ghost sm danger" data-f="remove">' + esc(S('Remove')) + '</button></div>' : '') +
      '<p class="warn" id="ffErr" hidden></p>' +
      '<div class="row"><button type="submit" class="go">' + esc(S('Save')) + '</button><button type="button" class="ghost" id="ffCancel">' + esc(S('Cancel')) + '</button></div></form>';
  }
  function formContact() {
    var rel = $('ffRel').value;
    return { name: $('ffName').value.trim(), last: $('ffLast').value.trim(), phone: $('ffPhone').value.trim(), rel: rel, relText: rel === 'other' ? $('ffRelText').value.trim() : '', label: '', lang: '' };
  }
  function previewSay(lang) {
    var el = $('ffSay');
    if (el) el.textContent = S('Bellatrix says: “{line}”', { line: sayLine(formContact(), lang) });
  }
  function nowText(r) {
    var el = $('famNowText'), a = F.availability(r);
    if (!el) return;
    el.className = 'famnow ' + (a.acceptNow ? 'yes' : 'no');
    el.textContent = a.acceptNow ? S('Calls ring through now.') : a.next ? S('No calls now. Next call time: {time}.', { time: a.next }) : S('No calls now.');
  }
  /* The last calls of this patient, from Results (read only). */
  function lastCalls(who) {
    var list = [];
    function take(arr) { (arr || []).forEach(function (s) { if (s && s.activity === 'familycall' && s.participant === who && !s.notStarted) list.push(s); }); }
    try { take((JSON.parse(localStorage.getItem('bellatrix-care-lab-v1') || '{}') || {}).sessions); } catch (e) { /* none */ }
    try { take(JSON.parse(localStorage.getItem('bellatrix-care-lab-inbox') || '[]')); } catch (e) { /* none */ }
    var seen = {};
    list = list.filter(function (s) { if (seen[s.id]) return false; seen[s.id] = 1; return true; })
      .sort(function (a, b) { return String(b.startedAt).localeCompare(String(a.startedAt)); }).slice(0, 5);
    if (!list.length) return '<p class="note">' + esc(S('No calls yet.')) + '</p>';
    return '<ul class="famcalls">' + list.map(function (s) {
      var st = s.stats || {}, d = new Date(s.startedAt), secs = st.callSeconds || 0;
      var what = st.callAnswered ? (secs >= 60 ? S('{m} min {s} s', { m: Math.floor(secs / 60), s: secs % 60 }) : S('{s} s', { s: secs }))
        : s.outcome === 'declined' ? S('Declined') : s.outcome === 'cancelled' ? S('Cancelled') : s.outcome === 'failed' ? S('Not connected') : S('Missed');
      var dir = /care team/.test(st.callDirection || '') ? '↗' : '↙';
      return '<li class="' + (st.callAnswered ? 'ok' : 'no') + '"><span class="famdir" title="' + esc(dir === '↗' ? S('The care team called') : S('The family called')) + '">' + dir + '</span>' +
        '<span>' + esc(Lab.pad(d.getDate()) + '/' + Lab.pad(d.getMonth() + 1) + ' ' + hhmm(d)) + '</span><b>' + esc(st.callFrom || '') + '</b><span>' + esc(what) + '</span></li>';
    }).join('') + '</ul>';
  }

  /* ---------- the call server and the patient screen ---------- */
  function status() {
    if (!$('famStatus')) return;
    F.request('GET', 'robot/info?robot=' + encodeURIComponent(F.robotId())).then(function (o) {
      if (!o.online) paintStatus('off', S('Patient screen not connected'), true);
      else if (o.call === 'live') paintStatus('ok', S('A call is on'));
      else if (o.call === 'ringing') paintStatus('ok', S('A call is ringing'));
      else if (o.state === 'busy') paintStatus('busy', S('Patient screen busy (an activity)'));
      else paintStatus('ok', S('Patient screen ready for calls'));
    }, function () { paintStatus('err', S('Call server not reachable')); });
  }
  function paintStatus(cls, text, offerOpen) {
    var el = $('famStatus');
    if (!el) return;
    el.className = 'famstatus ' + cls;
    el.innerHTML = '<i class="dot"></i><span>' + esc(text) + '</span>' + (offerOpen ? '<button type="button" class="ghost sm" data-f="patient">' + esc(S('Open')) + '</button>' : '');
  }
  function startPoll() {
    clearInterval(poll);
    poll = setInterval(function () {
      /* 1.15: the calls are a sub-section of the Family tab; hidden (another tab or sub-section): stop. */
      var box = $('famBody');
      if (!box || box.offsetParent === null) { clearInterval(poll); poll = null; return; }
      status();
      nowText(F.resident(F.book(), code()));
      if (out) outInfo();
    }, 3000);
  }

  /* ---------- the care team calls the family ----------
     A one-time link (30 minutes): the robot waits on its patient screen, the family opens the link
     and presses "Join". Kept in the book so the panel is back after a reload. */
  function callFamily(who, c) {
    /* 15 Nov: a contact with a family-portal account: the call RINGS on their phone (js/callreq-staff.js sends the
       invitation to that person; push + the open portal). Without an account: the one-time link as before. */
    var pid = c.pid || c.portalPid || '';
    try { if (!pid && window.CallReqStaff && CallReqStaff.personFor) pid = (CallReqStaff.personFor(who, c) || {}).pid || ''; } catch (e) { pid = ''; }
    return F.request('POST', 'outgoing', { robot: F.robotId(), resident: who, contactId: c.id, label: c.label, lang: c.lang }).then(function (o) {
      out = { token: o.token, who: who, contactId: c.id, name: c.name, label: c.label, lang: c.lang, expires: o.expires, state: 'waiting', online: o.robotOnline, ring: !!pid, pid: pid };
      var b = F.book(); b.outgoing = out; F.saveBook(b);
      renderOut();
      var p = $('famOut'); if (p && p.scrollIntoView) p.scrollIntoView({ block: 'start' });
      return out;
    }, function (e) { serverDown(); throw e; });
  }
  function outMessage(o) {
    var link = F.link('j', o.token);
    return I18N.t(o.lang, '{label} is waiting for your video call: {link}', { label: o.label, link: link });
  }
  function renderOut() {
    var box = $('famOut');
    if (!box) return;
    if (!out) { var b = F.book(); out = b.outgoing && b.outgoing.token ? b.outgoing : null; }
    /* The call in progress is shown whoever is chosen in "Resident code": a call started from "To do" for
       another resident must still show its QR code and link (Rahma, 12 Nov). */
    if (!out) { box.innerHTML = ''; return; }
    var other = out.who !== code() ? ' · ' + (out.label || out.who) : '';
    var link = F.link('j', out.token), msg = outMessage(out), ended = out.state !== 'waiting' && out.state !== 'live';
    var stateText = out.state === 'live' ? S('{name} has joined: the call is on.', { name: out.name })
      : out.state === 'used' ? S('The call is over.') : out.state === 'cancelled' ? S('The call was cancelled.') : out.state === 'expired' ? S('Nobody joined in time.')
      : out.state === 'declined' ? S('{name} cannot take the call right now.', { name: out.name }) : out.state === 'missed' ? S('{name} did not answer.', { name: out.name })
      : out.online === false ? S('The patient screen is not connected: open it, it will wait for {name}.', { name: out.name })
      : out.ring ? S('It rings on {name}’s phone (notification, or the family portal when it is open).', { name: out.name })
      : S('Bellatrix waits on the patient screen. Send this link to {name}:', { name: out.name });
    /* 15 Nov: ringing on the phone first; the QR code and the link only behind "Other way (link)" */
    var ringing = !!out.ring && out.state === 'waiting';
    var title = ringing ? S('Ringing {name}…', { name: out.name }) : S('Calling {name}', { name: out.name });
    var linkBody = '<div class="famoutbody"><div class="famqr">' + (window.BellatrixQR ? BellatrixQR.svg(link) : '') + '</div><div class="famoutside">' +
      '<p class="famoutlink" id="famOutLink">' + esc(link) + '</p>' +
      '<div class="row"><button type="button" class="go" data-f="outcopy">' + esc(S('Copy the link')) + '</button></div>' +
      '<p class="note">' + esc(S('Valid until {time}, for one call.', { time: hhmm(new Date(out.expires)) })) + '</p></div></div>';
    box.innerHTML = '<div class="section famout' + (ended ? ' ended' : '') + (ringing ? ' famring' : '') + '"><h2>' + esc(title + other) + '</h2>' +
      '<p class="famoutstate famringstate" id="famOutState">' + esc(stateText) + '</p>' +
      (ended ? '' : out.ring ? '<details class="famalt"><summary>' + esc(S('Other way (link)')) + '</summary>' + linkBody + '</details>' : linkBody) +
      '<div class="row"><button type="button" class="ghost' + (ended ? '' : ' danger') + '" data-f="outcancel">' + esc(ended ? S('Close') : ringing ? S('Cancel') : S('Cancel the call')) + '</button></div></div>';
  }
  function outInfo() {
    var o = out;
    if (!o || o.state === 'used' || o.state === 'cancelled' || o.state === 'expired' || o.state === 'declined' || o.state === 'missed') return;
    F.request('GET', 'outgoing/info?robot=' + encodeURIComponent(F.robotId()) + '&token=' + encodeURIComponent(o.token)).then(function (r) {
      if (out !== o) return;
      var changed = r.state !== o.state || r.robotOnline !== o.online;
      o.state = r.state; o.online = r.robotOnline;
      if (changed) { var b = F.book(); b.outgoing = o; F.saveBook(b); renderOut(); }
    }, function (e) { if (e && e.status === 404 && out === o) { o.state = 'expired'; renderOut(); } });
  }
  function closeOut(cancel) {
    var o = out;
    out = null;
    var b = F.book(); delete b.outgoing; F.saveBook(b);
    if (cancel && o && (o.state === 'waiting')) F.request('POST', 'outgoing/cancel', { robot: F.robotId(), token: o.token }).catch(function () {});
    renderOut();
  }

  /* Makes the contact's own link on the call server, or updates its label and language. */
  function makeLink(who, id, quiet) {
    var r = F.resident(F.book(), who), c = find(r, id);
    if (!c) return Promise.resolve();
    var body = { robot: F.robotId(), resident: who, contactId: c.id, label: c.label, lang: c.lang };
    if (c.token) body.token = c.token;
    return F.request('POST', 'invite', body).then(function (o) {
      var b = F.book(), c2 = find(F.resident(b, who), id);
      if (!c2) return;
      var fresh = c2.token !== o.token;
      c2.token = o.token; c2.revoked = false;
      F.saveBook(b);
      render();
      if (fresh && !quiet) toast(S('{name} has a link to call Bellatrix: “Copy their link”.', { name: c2.name }));
    }, function (e) {
      if (e && e.status === 404 && c.token) {
        var b = F.book(), c2 = find(F.resident(b, who), id);
        if (c2) { c2.token = ''; F.saveBook(b); }
        return makeLink(who, id, quiet);
      }
      render();
      serverDown();
    });
  }
  function revoke(who, c) {
    return F.request('POST', 'revoke', { robot: F.robotId(), token: c.token }).then(function () { return true; }, function (e) { return !!(e && e.status === 404); });
  }

  /* ---------- photos: a small square, re-drawn (which also drops the photo's hidden data) ---------- */
  function readPhoto(file) {
    return new Promise(function (ok, no) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h), side = Math.round(Math.min(560, s));
        var cv = document.createElement('canvas');
        cv.width = side; cv.height = side;
        /* A little above the middle: faces are usually in the upper half of a portrait. */
        cv.getContext('2d').drawImage(img, (w - s) / 2, Math.max(0, (h - s) * 0.35), s, s, 0, 0, side, side);
        URL.revokeObjectURL(url);
        ok(cv.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function () { URL.revokeObjectURL(url); no(new Error(S('This file is not a picture this browser can read.'))); };
      img.src = url;
    });
  }

  /* ---------- what the buttons do ---------- */
  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      toast(ok ? S('Link copied.') : text);
    }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(S('Link copied.')); }, fallback);
    else fallback();
  }
  function onClick(e) {
    var btn = e.target.closest ? e.target.closest('[data-f]') : null;
    if (!btn) return;
    var what = btn.getAttribute('data-f'), who = code(), b = F.book(), r = F.resident(b, who);
    var cardEl = btn.closest('.famc'), c = cardEl ? find(r, cardEl.getAttribute('data-id')) : editing && editing.id ? find(r, editing.id) : null;
    if (what === 'add') { editing = { id: null, who: who }; draftPhoto = ''; render(); if ($('ffName')) $('ffName').focus(); return; }
    if (what === 'patient') { window.open('patient.html' + location.search, 'bellatrix-patient'); return; }
    if (what === 'server') {
      var saved = F.setServer($('famServer') ? $('famServer').value : '');
      toast(saved ? S('Call server saved: {address}', { address: saved }) : S('Call server: the server of this page.'));
      if (F.report) F.report();
      render();
      return;
    }
    if (what === 'outcopy') { if (out) copyText(F.link('j', out.token)); return; }
    if (what === 'outopen') { if (out) window.open(F.link('j', out.token), '_blank', 'noopener,width=460,height=860'); return; }
    if (what === 'outcancel') { closeOut(true); return; }
    if (!c) return;
    if (what === 'call') { callFamily(who, c).catch(function () { /* said by serverDown */ }); return; }
    if (what === 'edit') { editing = { id: c.id, who: who }; draftPhoto = c.photo || ''; render(); if ($('ffName')) $('ffName').focus(); return; }
    if (what === 'copy') { copyText(linkOf(c)); return; }
    if (what === 'open') { window.open(linkOf(c), '_blank', 'noopener,width=460,height=860'); return; }
    if (what === 'link') { makeLink(who, c.id); return; }
    if (what === 'revoke') {
      if (!window.confirm(S('Revoke {name}’s link? It stops working at once.', { name: c.name }))) return;
      revoke(who, c).then(function (ok) {
        if (!ok) { serverDown(); return; }
        var b2 = F.book(), c2 = find(F.resident(b2, who), c.id);
        if (c2) { c2.token = ''; c2.revoked = true; F.saveBook(b2); }
        render();
        toast(S('{name}’s link no longer works.', { name: c.name }));
      });
      return;
    }
    if (what === 'remove') {
      if (!window.confirm(S('Remove {name}? Their link stops working and their photo is deleted from this device.', { name: c.name }))) return;
      (c.token ? revoke(who, c) : Promise.resolve(true)).then(function () {
        var b2 = F.book(), r2 = F.resident(b2, who);
        r2.contacts = r2.contacts.filter(function (x) { return x.id !== c.id; });
        F.saveBook(b2);
        editing = null;
        render();
        toast(S('{name} was removed.', { name: c.name }));
      });
    }
  }
  function onSubmit(e) {
    if (!e.target || e.target.id !== 'famForm') return;
    e.preventDefault();
    var who = code(), f = formContact(), err = $('ffErr');
    var problem = !f.name ? S('Please give the first name Bellatrix should say.')
      : f.rel === 'other' && !f.relText ? S('Please type the relation as Bellatrix should say it.') : '';
    if (problem) { err.textContent = problem; err.hidden = false; return; }
    var b = F.book(), r = F.resident(b, who), c = editing && editing.id ? find(r, editing.id) : null, isNew = !c;
    f.label = (c && c.label) || who; f.lang = (c && c.lang) || residentLang(who);   /* no label or language to type: the resident's code and language */
    if (isNew) { c = { id: 'c' + F.randomId(6), created: new Date().toISOString(), token: '' }; r.contacts.push(c); }
    /* A new contact gets its own link; an existing link learns the new label or language. */
    var routing = isNew || (!!c.token && (c.label !== f.label || c.lang !== f.lang));
    c.name = f.name; c.last = f.last; c.phone = f.phone; c.rel = f.rel; c.relText = f.relText; c.label = f.label; c.lang = f.lang; c.photo = draftPhoto || '';
    if (!F.saveBook(b)) { err.textContent = S('This browser could not save. Try without a photo.'); err.hidden = false; return; }
    editing = null; draftPhoto = '';
    render();
    if (routing) makeLink(who, c.id, !isNew);
  }
  function onChange(e) {
    var t = e.target, who = code();
    if (t.id === 'ffRel') { $('ffRelBox').hidden = t.value !== 'other'; previewSay(residentLang(who)); return; }
    if (t.id === 'ffPhoto') {
      var file = t.files && t.files[0];
      if (!file) return;
      readPhoto(file).then(function (url) {
        draftPhoto = url;
        $('ffThumb').innerHTML = photoHtml(url, '');
        $('ffNoPhoto').hidden = false;
      }, function (er) { var err = $('ffErr'); err.textContent = er.message; err.hidden = false; });
      t.value = '';
      return;
    }
    if (t.id === 'famLoud') { var bl = F.book(); bl.loud = t.checked; F.saveBook(bl); return; }
    if (t.id === 'famNow' || t.hasAttribute('data-t') || t.hasAttribute('data-from') || t.hasAttribute('data-to')) {
      var b = F.book(), r = F.resident(b, who);
      if (t.id === 'famNow') r.acceptNow = t.checked;
      else {
        var i = parseInt(t.getAttribute('data-t') || t.getAttribute('data-from') || t.getAttribute('data-to'), 10), tm = r.times[i];
        if (!tm) return;
        if (t.hasAttribute('data-t')) tm.on = t.checked;
        else if (/^\d\d:\d\d$/.test(t.value)) tm[t.hasAttribute('data-from') ? 'from' : 'to'] = t.value;
      }
      F.saveBook(b);
      nowText(r);
    }
  }
  function onInput(e) {
    if (/^ff(Name|RelText)$/.test(e.target.id)) previewSay(residentLang(code()));
  }

  var wired = false;
  function wire() {
    if (wired || !$('famBody')) return;
    wired = true;
    var box = $('famBody');
    box.addEventListener('click', function (e) {
      if (e.target.id === 'ffCancel') { editing = null; draftPhoto = ''; render(); return; }
      if (e.target.id === 'ffNoPhoto') { draftPhoto = ''; $('ffThumb').innerHTML = photoHtml('', $('ffName').value); e.target.hidden = true; return; }
      onClick(e);
    });
    box.addEventListener('submit', onSubmit);
    box.addEventListener('change', onChange);
    box.addEventListener('input', onInput);
  }

  return {
    /* The team calls a family contact of this resident (N2's call requests use it): the Calls panel shows
       the new call at once. Resolves with the outgoing call; rejects if the contact or the server is missing. */
    /* The contacts of the approved portal accounts (first name, last name, relation, phone) fill themselves in. */
    syncAccounts: function (residents) {
      if (!F || !Array.isArray(residents)) return;
      var b = F.book(), changed = false;
      residents.forEach(function (rs) {
        var r = F.resident(b, rs.code);
        if (!r || !Array.isArray(r.contacts)) return;
        (rs.accounts || []).forEach(function (a) {
          if (a.status !== 'active') return;
          var c = null, i;
          for (i = 0; i < r.contacts.length; i++) if (r.contacts[i].pid === a.pid) c = r.contacts[i];
          for (i = 0; !c && i < r.contacts.length; i++) if (!r.contacts[i].pid && String(r.contacts[i].name || '').toLowerCase() === String(a.name || '').toLowerCase()) c = r.contacts[i];
          if (!c) { c = { id: 'c' + F.randomId(6), created: new Date().toISOString(), token: '', label: rs.code, lang: residentLang(rs.code) }; r.contacts.push(c); changed = true; }
          var rel = a.relation || '';
          var set = function (k, v) { if (v && c[k] !== v) { c[k] = v; changed = true; } };
          set('pid', a.pid); set('name', a.name); set('last', a.last); set('phone', a.phone);
          if (rel && !c.rel) { c.rel = 'other'; c.relText = rel; changed = true; }
          else if (rel && c.rel === 'other' && c.relText !== rel && c.pid) { c.relText = rel; changed = true; }
        });
      });
      if (changed) { F.saveBook(b); if (!editing && $('famBody') && $('famBody').offsetParent) render(); }
    },
    call: function (who, contactId) {
      if (!F) return Promise.reject(new Error('no-familycall'));
      var r = F.resident(F.book(), who), c = r && r.contacts ? find(r, contactId) : null;
      if (!c) return Promise.reject(new Error('no-contact'));
      return callFamily(who, c);
    },
    open: function () {
      if (!F) { $('famBody').innerHTML = '<p class="warn">js/familycall.js?</p>'; return; }
      wire();
      /* Another patient was chosen meanwhile: the open form belonged to the previous one. */
      if (editing && editing.who !== code()) { editing = null; draftPhoto = ''; }
      render();
      startPoll();
    }
  };
})();
