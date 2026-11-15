/* Care Team 1.16 (agent N2): call requests (BF-17, BF-18) and the invitations they lead to (BF-19).
   Mounted by this file alone (no change in staff.js or family-staff.js is needed):
   - "To do": a banner in #trayList (staff.js folds every .banner it finds there into "To do · n"):
     "Sophie asks for a call" / "P1 wants to call the family" / "2 call requests", with Open;
   - Family > Calls: a short list above the contacts (#callReqBody, before #famBody): who asks, for
     whom, when, the note; "Call now" and "Later" (and ✓ when it was handled another way).
   "Call now" uses the existing outgoing call of the Family tab (the one-time famille.html#j=… link,
   labland/call-relay.mjs 'outgoing'): the patient screen waits for the family as before, and the
   portal sends the invitation to the relative(s) (push + bell). The contact is the robot's contact of
   that relative (matched by the portal account, its call link or the first name); when there is none
   yet, it is added from the portal account (first name, language, the word the family uses).
   A call started directly from Family > Calls is announced in the portal too, when the contact
   matches a portal account. The server: labland/family-callreq.mjs (robot/calls…). ES5. */
window.CallReqStaff = (function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var S = function (k, v) { return window.ST ? ST(k, v) : I18N.t('en', k, v); };
  var F = window.FamilyCall, FM = window.FamilyMessages;
  var OUTBOX = 'bellatrix-callreq-outbox', HIDDEN = 'bellatrix-callreq-hidden', ANNOUNCED = 'bellatrix-callreq-announced';
  var st = { requests: [], invites: [], residents: [], loaded: false, error: false, choose: null, busy: '', known: null, timer: null };

  /* ---------- texts (Care Team: few words) ---------- */
  if (window.ST && ST.add) {
    ST.add('fr', {
      'Call requests': 'Demandes d’appel', '{name} asks for a call': '{name} demande un appel', '{code} wants to call the family': '{code} veut appeler sa famille',
      '1 call request': '1 demande d’appel', '{n} call requests': '{n} demandes d’appel', 'Call now': 'Appeler maintenant', 'Later': 'Plus tard', 'Done': 'Fait',
      'As soon as possible': 'Dès que possible', 'Today': 'Aujourd’hui', 'Tomorrow': 'Demain', 'Later: {time}': 'Plus tard : {time}', 'Planned: {when}': 'Prévu : {when}',
      'Who to call?': 'Qui appeler ?', 'Invitation sent to {names}': 'Invitation envoyée à {names}', 'Waiting for the family…': 'En attente de la famille…',
      'Joined: the call is on.': 'Rejoint : l’appel est en cours.', 'Missed call': 'Appel manqué', 'Call cancelled': 'Appel annulé',
      'No family member yet: add a contact below.': 'Aucun proche pour l’instant : ajoutez un contact ci-dessous.',
      'Not on the portal: send the link below (WhatsApp, SMS, QR).': 'Pas sur le portail : envoyez le lien ci-dessous (WhatsApp, SMS, QR).',
      'The family is told: a little later.': 'La famille est prévenue : un peu plus tard.', 'Not sent yet (no connection).': 'Pas encore envoyé (pas de connexion).',
      'The family portal does not answer.': 'Le portail famille ne répond pas.', 'New call request: {name}': 'Nouvelle demande d’appel : {name}',
      'just now': 'à l’instant', '{n} min ago': 'il y a {n} min', 'from the patient screen': 'depuis l’écran patient', 'Call my family': 'Appeler ma famille',
      'An activity is running on the patient screen.': 'Une activité est en cours sur l’écran patient.', 'End the activity and call': 'Terminer l’activité et appeler',
      'The patient screen did not answer.': 'L’écran patient n’a pas répondu.'
    });
    ST.add('de', {
      'Call requests': 'Anrufwünsche', '{name} asks for a call': '{name} bittet um einen Anruf', '{code} wants to call the family': '{code} möchte die Familie anrufen',
      '1 call request': '1 Anrufwunsch', '{n} call requests': '{n} Anrufwünsche', 'Call now': 'Jetzt anrufen', 'Later': 'Später', 'Done': 'Erledigt',
      'As soon as possible': 'So bald wie möglich', 'Today': 'Heute', 'Tomorrow': 'Morgen', 'Later: {time}': 'Später: {time}', 'Planned: {when}': 'Geplant: {when}',
      'Who to call?': 'Wen anrufen?', 'Invitation sent to {names}': 'Einladung gesendet an {names}', 'Waiting for the family…': 'Warten auf die Familie…',
      'Joined: the call is on.': 'Beigetreten: der Anruf läuft.', 'Missed call': 'Verpasster Anruf', 'Call cancelled': 'Anruf abgesagt',
      'No family member yet: add a contact below.': 'Noch kein Angehöriger: fügen Sie unten einen Kontakt hinzu.',
      'Not on the portal: send the link below (WhatsApp, SMS, QR).': 'Nicht im Portal: senden Sie den Link unten (WhatsApp, SMS, QR).',
      'The family is told: a little later.': 'Die Familie weiß Bescheid: etwas später.', 'Not sent yet (no connection).': 'Noch nicht gesendet (keine Verbindung).',
      'The family portal does not answer.': 'Das Familienportal antwortet nicht.', 'New call request: {name}': 'Neuer Anrufwunsch: {name}',
      'just now': 'gerade eben', '{n} min ago': 'vor {n} Min.', 'from the patient screen': 'vom Patientenbildschirm', 'Call my family': 'Meine Familie anrufen',
      'An activity is running on the patient screen.': 'Auf dem Patientenbildschirm läuft eine Aktivität.', 'End the activity and call': 'Aktivität beenden und anrufen',
      'The patient screen did not answer.': 'Der Patientenbildschirm hat nicht geantwortet.'
    });
  }

  /* ---------- helpers ---------- */
  function getJ(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v === null ? d : v; } catch (e) { return d; } }
  function putJ(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* this page only */ } }
  function toast(t) { if (window.Lab && Lab.toast) Lab.toast(t); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(iso) { var d = new Date(iso); return isFinite(d.getTime()) ? pad(d.getHours()) + ':' + pad(d.getMinutes()) : ''; }
  function ago(iso) { var m = Math.round((Date.now() - Date.parse(iso)) / 60000); return !isFinite(m) ? '' : m < 1 ? S('just now') : m < 60 ? S('{n} min ago', { n: m }) : hhmm(iso); }
  function fold(s) { s = String(s || '').toLowerCase().trim(); return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s; }
  function quote(t) { var q = { en: ['“', '”'], fr: ['« ', ' »'], de: ['„', '“'] }[window.ST && ST.lang ? ST.lang() : 'en'] || ['“', '”']; return q[0] + t + q[1]; }
  function online() { return !!(FM && FM.request && window.fetch && location.protocol !== 'file:'); }
  function resident(code) { return st.residents.filter(function (r) { return String(r.code).toUpperCase() === String(code).toUpperCase(); })[0] || { code: code, label: '', family: [] }; }
  function hidden() { var h = getJ(HIDDEN, {}) || {}, t = Date.now(), out = {}; Object.keys(h).forEach(function (k) { if (h[k] > t) out[k] = h[k]; }); return out; }
  /* What waits: the server's open requests (not put off), and the patient screen's requests not sent yet. */
  function waiting() {
    var h = hidden(), t = Date.now();
    var list = st.requests.filter(function (q) { return q.state === 'open' && !h[q.id]; });
    (getJ(OUTBOX, []) || []).forEach(function (o) {
      if (!o || !o.code || h['local:' + o.code] || t - Date.parse(o.at) > 6 * 3600000) return;
      if (!st.requests.some(function (q) { return q.from === 'resident' && q.code === o.code && (q.state === 'open' || q.state === 'later' || q.state === 'calling'); })) list.push({ id: 'local:' + o.code, code: o.code, from: 'resident', at: o.at, state: 'open', when: 'soon', local: true });
    });
    return list;
  }
  function liveRequests() { return st.requests.filter(function (q) { return q.state === 'later' || q.state === 'calling'; }); }
  function titleOf(q) {
    var r = resident(q.code);
    return q.from === 'family' ? S('{name} asks for a call', { name: q.name || '…' }) : S('{code} wants to call the family', { code: r.label ? r.label + ' (' + q.code + ')' : q.code });
  }

  /* ---------- the server ---------- */
  function flushOutbox() {
    var box = getJ(OUTBOX, []) || [];
    if (!box.length || !online()) return Promise.resolve();
    return box.reduce(function (p, o) {
      return p.then(function () {
        return FM.request('POST', 'robot/calls/request', { code: o.code }).then(function () {
          putJ(OUTBOX, (getJ(OUTBOX, []) || []).filter(function (x) { return x.code !== o.code; }));
        }, function (e) { if (e && e.status === 404) putJ(OUTBOX, (getJ(OUTBOX, []) || []).filter(function (x) { return x.code !== o.code; })); });
      });
    }, Promise.resolve());
  }
  function load() {
    if (!online()) { paint(); return Promise.resolve(); }
    return flushOutbox().then(function () { return FM.request('GET', 'robot/calls'); }).then(function (r) {
      var before = st.loaded ? st.known : null;
      st.requests = r.requests || []; st.invites = r.invites || []; st.residents = r.residents || []; st.loaded = true; st.error = false;
      /* A request that was not there before: a short note for the team. */
      var ids = {};
      waiting().forEach(function (q) { ids[q.id] = 1; if (before && !before[q.id] && !q.local) toast(S('New call request: {name}', { name: q.from === 'family' ? (q.name || '') : (resident(q.code).label || q.code) })); });
      st.known = ids;
      announce();
      paint();
      decorateOut();
    }, function () { st.error = true; paint(); });
  }

  /* ---------- contacts: the robot's book and the portal's relatives ---------- */
  function contactsOf(code) { return F ? (F.resident(F.book(), code).contacts || []) : []; }
  function matchContact(code, p) {
    var list = contactsOf(code);
    return list.filter(function (c) { return c.portalPid && c.portalPid === p.pid; })[0] ||
      list.filter(function (c) { return c.token && p.callLink && p.callLink.indexOf('#t=' + c.token) >= 0; })[0] ||
      list.filter(function (c) { return fold(c.name) && fold(c.name) === fold(p.name); })[0] || null;
  }
  function personOfContact(code, c) {
    var fam = resident(code).family || [];
    return fam.filter(function (p) { return c.portalPid === p.pid; })[0] || fam.filter(function (p) { return c.token && p.callLink && p.callLink.indexOf('#t=' + c.token) >= 0; })[0] ||
      fam.filter(function (p) { return fold(c.name) && fold(c.name) === fold(p.name); })[0] || null;
  }
  function residentLang(code) {
    try { var s = JSON.parse(localStorage.getItem('bellatrix-care-lab-v1') || '{}') || {}, p = (s.patients || {})[code]; if (p && p.prefs && p.prefs.lang) return I18N.valid(p.prefs.lang); } catch (e) { /* default */ }
    return 'fr';
  }
  /* The relative's contact on this robot, added from their portal account when it does not exist. */
  function contactFor(code, p) {
    var c = matchContact(code, p);
    if (c) { if (!c.portalPid) { var b0 = F.book(), c0 = (F.resident(b0, code).contacts || []).filter(function (x) { return x.id === c.id; })[0]; if (c0) { c0.portalPid = p.pid; F.saveBook(b0); } } return c; }
    var b = F.book(), r = F.resident(b, code), lab = resident(code).label || code;
    c = { id: 'c' + F.randomId(6), created: new Date().toISOString(), token: '', name: p.name || '…', rel: 'none', relText: '', label: lab, lang: I18N.valid(p.lang || residentLang(code)), photo: '', portalPid: p.pid };
    r.contacts.push(c);
    F.saveBook(b);
    return c;
  }
  /* Who could be called for a resident: the portal's relatives (with their contact if any), then the
     contacts that are not on the portal. */
  function choices(code) {
    var out = [], used = {};
    (resident(code).family || []).forEach(function (p) { var c = matchContact(code, p); if (c) used[c.id] = 1; out.push({ key: 'p:' + p.pid, name: p.name, rel: p.relation, person: p, contact: c }); });
    contactsOf(code).forEach(function (c) { if (!used[c.id]) out.push({ key: 'c:' + c.id, name: c.name, rel: F.relationPhrase(c, ST.lang ? ST.lang() : 'en'), person: null, contact: c }); });
    return out;
  }

  /* ---------- "Call now": the Family tab's outgoing call, then the portal's invitation ---------- */
  function startOutgoing(code, c) {
    var before = (F.book().outgoing || {}).token || '';
    /* family-staff.js may offer it itself (then its panel shows the new call at once). */
    if (window.FamilyStaff && typeof FamilyStaff.call === 'function') {
      return Promise.resolve(FamilyStaff.call(code, c.id)).then(function () {
        return new Promise(function (ok, no) {
          var n = 0, t = setInterval(function () { var o = F.book().outgoing; if (o && o.token && o.token !== before) { clearInterval(t); ok(o); } else if (++n > 40) { clearInterval(t); no(new Error('no-call')); } }, 150);
        });
      });
    }
    return F.request('POST', 'outgoing', { robot: F.robotId(), resident: code, contactId: c.id, label: c.label, lang: c.lang }).then(function (o) {
      var out = { token: o.token, who: code, contactId: c.id, name: c.name, label: c.label, lang: c.lang, expires: o.expires, state: 'waiting', online: o.robotOnline };
      var b = F.book(); b.outgoing = out; F.saveBook(b);
      return out;
    });
  }
  function callNow(q, choiceKey) {
    if (!F) return;
    var code = q.code, pick = null, list = choices(code);
    if (q.from === 'family') {
      var p = (resident(code).family || []).filter(function (x) { return x.pid === q.pid; })[0] || { pid: q.pid, name: q.name, relation: q.relation, lang: residentLang(code), callLink: q.callLink || '' };
      pick = { person: p, contact: matchContact(code, p) };
    } else if (choiceKey) pick = list.filter(function (x) { return x.key === choiceKey; })[0] || null;
    else if (list.length === 1) pick = list[0];
    if (!pick) {
      if (!list.length) { toast(S('No family member yet: add a contact below.')); return; }
      st.choose = q.id; paint(); return;
    }
    st.choose = null; st.busy = q.id; paint();
    var c = pick.contact || contactFor(code, pick.person);
    startOutgoing(code, c).then(function (out) {
      remember(out.token);
      if (!pick.person) {
        /* Not on the portal: the team sends the link (the Family tab's panel, below). */
        if (!q.local) FM.request('POST', 'robot/calls/decide', { id: q.id, decision: 'close' }).catch(function () {});
        else hideFor(q.id, 6 * 3600000);
        toast(S('Not on the portal: send the link below (WhatsApp, SMS, QR).'));
        return null;
      }
      return FM.request('POST', 'robot/calls/invite', { code: code, token: out.token, until: out.expires, requestId: q.local ? '' : q.id, pids: [pick.person.pid], contact: c.name });
    }).then(function () { st.busy = ''; if (q.local) hideFor(q.id, 6 * 3600000); return load(); }, function () {
      st.busy = ''; paint();
      toast(S('The call server does not answer. Check the server address (Settings, below) or start the server on the PC.'));
    }).then(function () { openCalls(); });
  }
  function later(q) {
    hideFor(q.id, 60 * 60000);
    if (q.local) { paint(); return; }
    FM.request('POST', 'robot/calls/decide', { id: q.id, decision: 'later', minutes: 60 }).then(function () {
      if (q.from === 'family') toast(S('The family is told: a little later.'));
      return load();
    }, function () { paint(); });
  }
  function done(q) {
    hideFor(q.id, 24 * 3600000);
    if (q.local) { putJ(OUTBOX, (getJ(OUTBOX, []) || []).filter(function (x) { return x.code !== q.code; })); paint(); return; }
    FM.request('POST', 'robot/calls/decide', { id: q.id, decision: 'close' }).then(load, function () { paint(); });
  }
  function hideFor(id, ms) { var h = hidden(); h[id] = Date.now() + ms; putJ(HIDDEN, h); }

  /* A call started from Family > Calls (or by "Call now"): announced in the portal to the relative of
     that contact, when they have a portal account. Each call once. */
  function remember(token) { var a = getJ(ANNOUNCED, []) || []; if (a.indexOf(token) < 0) { a.push(token); putJ(ANNOUNCED, a.slice(-30)); } }
  function announce() {
    if (!F || !st.loaded) return;
    var o = F.book().outgoing;
    if (!o || !o.token || o.state !== 'waiting' || (o.expires && Date.parse(o.expires) < Date.now())) return;
    if ((getJ(ANNOUNCED, []) || []).indexOf(o.token) >= 0 || st.invites.some(function (v) { return v.token === o.token; })) return;
    remember(o.token);
    /* Every relative linked to this resident (validated account) gets the invitation: nothing to send by hand. */
    var c = (contactsOf(o.who) || []).filter(function (x) { return x.id === o.contactId; })[0];
    if (!(resident(o.who).family || []).length) return;
    /* 15 Nov: the contact called has a portal account: it rings on that person's phone only (not the whole family) */
    var pid = o.pid || (c ? (c.pid || c.portalPid || (personOfContact(o.who, c) || {}).pid || '') : '');
    FM.request('POST', 'robot/calls/invite', { code: o.who, token: o.token, until: o.expires, contact: c ? c.name : '', pids: pid ? [pid] : undefined }).then(load, function () {});
  }
  /* Family > Calls, the panel of the call just started: no WhatsApp, SMS or Open (hidden by the style below);
     with a linked relative: one line "Invitation sent to Sophie", the state, Cancel; the link and the QR stay
     visible (Rahma, 12 Nov: the boss scans it from the robot). */
  function decorateOut() {
    var box = $('famOut'), el = box && box.querySelector('.famout');
    if (!el || !F) return;
    var o = F.book().outgoing, fam = o ? resident(o.who).family || [] : [], inv = o ? st.invites.filter(function (v) { return v.token === o.token; })[0] : null;
    var has = !!(inv || fam.length), ended = o && o.state !== 'waiting' && o.state !== 'live';
    el.classList.toggle('crqhas', has && !ended);
    var line = el.querySelector('.crqsent');
    if (!has || ended) { if (line) line.parentNode.removeChild(line); return; }
    var names = inv && inv.names && inv.names.length ? inv.names : fam.map(function (p) { return p.name; });
    var k = inv && inv.state === 'missed' ? ['miss', S('Missed call')] : inv && inv.state === 'answered' ? ['ok', S('Joined: the call is on.')] : ['', S('Waiting for the family…')];
    var html = '<i class="dot"></i><b>' + esc(S('Invitation sent to {names}', { names: names.join(', ') })) + '</b> · ' + esc(k[1]);
    if (!line) { line = document.createElement('p'); line.className = 'crqinv crqsent'; var h = el.querySelector('.famoutstate'); el.insertBefore(line, h ? h.nextSibling : el.firstChild); }
    if (line.getAttribute('data-h') !== html) { line.innerHTML = html; line.setAttribute('data-h', html); }
    line.className = 'crqinv crqsent ' + k[0];
  }

  /* ---------- the patient screen runs an activity ----------
     Family > Calls shows "Patient screen busy (an activity)" (family-staff.js: class 'busy' on #famStatus).
     "Call {name}" then does not start the call by itself (the patient screen would turn it away): one clear
     button, "End the activity and call". One tap: the activity ends cleanly on the patient screen (saved like
     a normal end, js/callreq-patient.js hears the key below), then the same "Call" button is pressed. Only the
     team does this: a relative's call never interrupts the resident by itself. */
  var END = 'bellatrix-callreq-end', busyFor = null, bypass = false;
  function busyBox() {
    var b = $('crqBusy'), fam = $('famBody');
    if (!b && fam) { b = document.createElement('div'); b.id = 'crqBusy'; b.className = 'section crqbusy'; b.hidden = true; fam.parentNode.insertBefore(b, fam); b.addEventListener('click', onBusyClick); }
    return b;
  }
  function showBusy(contactId, name) {
    var b = busyBox();
    if (!b) return;
    busyFor = contactId;
    b.innerHTML = '<p class="crqbusytxt">' + esc(S('An activity is running on the patient screen.')) + '</p><div class="row"><button type="button" class="go" data-cb="end">' + esc(S('End the activity and call')) + '</button>' +
      '<button type="button" class="ghost" data-cb="no">' + esc(S('Cancel')) + '</button></div>';
    b.hidden = false;
    if (b.scrollIntoView) b.scrollIntoView({ block: 'nearest' });
  }
  function hideBusy() { var b = $('crqBusy'); if (b) { b.hidden = true; b.innerHTML = ''; } busyFor = null; }
  function callButton(id) { return document.querySelector('#famBody .famc[data-id="' + id + '"] [data-f="call"]'); }
  function onBusyClick(e) {
    var x = e.target.closest ? e.target.closest('[data-cb]') : null;
    if (!x || x.disabled) return;
    if (x.getAttribute('data-cb') === 'no') { hideBusy(); return; }
    var id = busyFor;
    x.disabled = true;
    try { localStorage.setItem(END, JSON.stringify({ at: Date.now(), n: Math.random() })); } catch (er) { /* then the patient screen is asked below anyway */ }
    var t0 = Date.now();
    (function wait() {
      F.request('GET', 'robot/info?robot=' + encodeURIComponent(F.robotId())).then(function (o) { return !(o.online && o.state === 'busy'); }, function () { return false; }).then(function (free) {
        if (free) {
          hideBusy();
          var btn = callButton(id);
          if (btn) { bypass = true; try { btn.click(); } finally { bypass = false; } }
          return;
        }
        if (Date.now() - t0 > 9000) { hideBusy(); toast(S('The patient screen did not answer.')); return; }
        setTimeout(wait, 500);
      });
    })();
  }
  /* In the capture phase, before family-staff.js: a call while the screen is busy waits for the team's choice. */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('#famBody [data-f="call"]') : null;
    if (!btn || bypass) return;
    var stat = $('famStatus');
    if (!stat || !/(^| )busy( |$)/.test(stat.className)) return;
    e.stopPropagation(); e.preventDefault();
    var card = btn.closest('.famc');
    showBusy(card ? card.getAttribute('data-id') : '', '');
  }, true);

  /* ---------- drawing ---------- */
  var WHEN = { soon: 'As soon as possible', today: 'Today', tomorrow: 'Tomorrow' };
  /* A call the family planned in the portal ("Plan a date"): the day and the time they chose. */
  function whenText(q) {
    if (q.when !== 'planned' || !q.planAt) return S(WHEN[q.when] || WHEN.soon);
    var d = new Date(q.planAt), txt = '';
    try { txt = d.toLocaleString({ en: 'en-GB', fr: 'fr-FR', de: 'de-DE' }[window.ST && ST.lang ? ST.lang() : 'en'] || 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { txt = hhmm(q.planAt); }
    return S('Planned: {when}', { when: txt });
  }
  function css() {
    if ($('crq-css')) return;
    var s = document.createElement('style');
    s.id = 'crq-css';
    s.textContent = '#callReqBody:empty{display:none}#callReqBody{margin-bottom:16px}' +
      '#callReqBody .crqlist{display:flex;flex-direction:column;gap:10px}' +
      '#callReqBody .famc.crq{border-color:var(--apricot);box-shadow:inset 4px 0 0 var(--apricot)}' +
      '#callReqBody .famc.crq.res .famphoto{background:var(--apricot);color:var(--on-apricot)}' +
      '#callReqBody .famphoto svg{width:34px;height:34px}' +
      '#callReqBody .crqmeta{margin:0;color:var(--muted);font-size:14px}' +
      '#callReqBody .crqnote{margin:0;font-family:var(--font-text,var(--font))}' +
      '#callReqBody .crqwho{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '#callReqBody .crqwho b{flex:1 1 100%}' +
      '#callReqBody .crqinv{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;font-size:14px;margin:0}' +
      '#callReqBody .crqinv .dot{width:10px;height:10px;border-radius:50%;background:var(--apricot);flex:none}' +
      '#callReqBody .crqinv.ok .dot{background:var(--good,#3E806D)}#callReqBody .crqinv.miss .dot{background:var(--danger)}' +
      '#callReqBanner b{font-weight:700}#crqBusy{margin-bottom:16px;border-color:var(--apricot)}#crqBusy[hidden]{display:none}#crqBusy .crqbusytxt{margin:0 0 10px;font-family:var(--font-text,var(--font))}' +
      '#famOut a[href^="https://wa.me"],#famOut a[href^="sms:"],#famOut [data-f="outopen"]{display:none}' +
      '#famOut .famout.crqhas .famoutstate{display:none}' +
      '#famOut .crqsent{margin:0 0 10px}#famOut .crqsent .dot{width:10px;height:10px;border-radius:50%;background:var(--apricot);flex:none}' +
      '#famOut .crqsent.ok .dot{background:var(--good,#3E806D)}#famOut .crqsent.miss .dot{background:var(--danger)}';
    document.head.appendChild(s);
  }
  var PHONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5 9.4 6.3a1.4 1.4 0 0 1 0 2L8 9.7a12 12 0 0 0 6.3 6.3l1.4-1.4a1.4 1.4 0 0 1 2 0l2.8 2.8a1.4 1.4 0 0 1 0 2L19 20.9c-1 1-2.6 1.2-3.9.6A19 19 0 0 1 2.5 8.9c-.6-1.3-.4-2.9.6-3.9l1.5-1.5a1.4 1.4 0 0 1 2 0z" fill="currentColor"/></svg>';
  function card(q) {
    var r = resident(q.code), fam = q.from === 'family', busy = st.busy === q.id;
    var who = fam ? '<b>' + esc(q.name || '…') + '</b>' + (q.relation ? ' <span class="famrel">' + esc(q.relation) + '</span>' : '') + ' → <b>' + esc(r.label || q.code) + '</b> · ' + esc(q.code)
      : '<b>' + esc(r.label || q.code) + '</b> · ' + esc(q.code) + ' <span class="famrel">' + esc(S('from the patient screen')) + '</span>';
    var h = '<div class="famc crq' + (fam ? '' : ' res') + '" data-crq="' + esc(q.id) + '"><span class="famphoto">' + (fam ? esc(String(q.name || '?').charAt(0).toUpperCase()) : PHONE) + '</span>' +
      '<div class="faminfo"><p class="famname">' + who + '</p>' +
      '<p class="crqmeta">' + esc(whenText(q)) + ' · ' + esc(ago(q.at)) + (q.local ? ' · ' + esc(S('Not sent yet (no connection).')) : '') + '</p>' +
      (q.note ? '<p class="crqnote">' + esc(quote(q.note)) + '</p>' : '');
    if (st.choose === q.id) {
      h += '<div class="crqwho"><b>' + esc(S('Who to call?')) + '</b>' + choices(q.code).map(function (x) {
        return '<button type="button" class="ghost" data-cr="pick" data-key="' + esc(x.key) + '">' + esc(x.name) + (x.rel ? ' · ' + esc(x.rel) : '') + '</button>';
      }).join('') + '</div>';
    } else {
      h += '<div class="row"><button type="button" class="go" data-cr="call"' + (busy ? ' disabled' : '') + '>' + esc(S('Call now')) + '</button>' +
        '<button type="button" class="ghost" data-cr="later">' + esc(S('Later')) + '</button>' +
        '<button type="button" class="ghost sm" data-cr="done">' + esc(S('Done')) + '</button></div>';
    }
    return h + '</div></div>';
  }
  function inviteLine(v) {
    var k = v.state === 'waiting' ? ['', S('Waiting for the family…')] : v.state === 'answered' ? ['ok', S('Joined: the call is on.')] : v.state === 'missed' ? ['miss', S('Missed call')] : ['miss', S('Call cancelled')];
    var names = (v.names || []).join(', ') || v.contact || '';
    return '<p class="crqinv ' + k[0] + '"><i class="dot"></i><b>' + esc(resident(v.code).label || v.code) + '</b> · ' + esc(S('Invitation sent to {names}', { names: names })) + ' · ' + esc(k[1]) + ' <small>' + esc(hhmm(v.at)) + '</small></p>';
  }
  function paint() {
    css();
    mount();
    var box = $('callReqBody'), list = waiting();
    var recent = st.invites.filter(function (v) { return v.state === 'waiting' || Date.now() - Date.parse(v.endedAt || v.at) < 3600000; }).slice(0, 4);
    var later = liveRequests().filter(function (q) { return q.state === 'later'; });
    if (box) {
      var h = '';
      if (list.length || recent.length || later.length || (st.error && (getJ(OUTBOX, []) || []).length)) {
        h = '<div class="section"><h2>' + esc(S('Call requests')) + '</h2>' +
          (st.error ? '<p class="warn">' + esc(S('The family portal does not answer.')) + '</p>' : '') +
          '<div class="crqlist">' + list.map(card).join('') + '</div>' +
          later.map(function (q) { return '<p class="crqinv"><i class="dot"></i>' + esc(titleOf(q)) + ' · ' + esc(S('Later: {time}', { time: hhmm(q.until) })) + '</p>'; }).join('') +
          recent.map(inviteLine).join('') + '</div>';
      }
      if (box.getAttribute('data-h') !== h) { box.innerHTML = h; box.setAttribute('data-h', h); }
    }
    banner(list);
  }
  /* "To do": one banner, the tray of staff.js counts and folds it like the others. */
  function banner(list) {
    var tray = $('trayList'), b = $('callReqBanner');
    if (!tray) return;
    if (!b) {   /* staff.html may already hold the element (T); otherwise it is made here */
      b = document.createElement('div');
      b.id = 'callReqBanner'; b.className = 'banner xfer waitbanner'; b.hidden = true;
      tray.appendChild(b);
    }
    if (!b.getAttribute('data-wired')) {
      b.setAttribute('data-wired', '1');
      b.addEventListener('click', function (e) { var x = e.target.closest ? e.target.closest('[data-cr="open"]') : null; if (x) openCalls(); });
    }
    var n = list.length, text = n === 1 ? titleOf(list[0]) : S('{n} call requests', { n: n });
    var h = n ? '<span>' + esc(text) + '</span><button type="button" class="go" data-cr="open">' + esc(S('Open')) + '</button>' : '';
    if (b.getAttribute('data-h') !== h) { b.innerHTML = h; b.setAttribute('data-h', h); }
    if (b.hidden !== !n) b.hidden = !n;
  }
  function openCalls() {
    if (window.StaffUI && StaffUI.showTab) StaffUI.showTab('family', 'calls');
    /* A call just started: its panel (QR code and link) comes into view; otherwise the list of requests. */
    var call = $('famOut'), box = call && call.querySelector('.famout:not(.ended)') ? call : $('callReqBody');
    if (box && box.scrollIntoView) setTimeout(function () { box.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60);
  }
  /* Our list sits in Family > Calls, above the contacts (outside #famBody, which family-staff.js redraws). */
  function mount() {
    var fam = $('famBody');
    if (!fam || $('callReqBody')) return;
    var box = document.createElement('div');
    box.id = 'callReqBody';
    fam.parentNode.insertBefore(box, fam);
    box.addEventListener('click', onClick);
  }
  function find(id) { return waiting().filter(function (q) { return q.id === id; })[0] || null; }
  function onClick(e) {
    var b = e.target.closest ? e.target.closest('[data-cr]') : null;
    if (!b || b.disabled) return;
    var el = b.closest('[data-crq]'), q = el ? find(el.getAttribute('data-crq')) : null, what = b.getAttribute('data-cr');
    if (!q) return;
    if (what === 'call') callNow(q);
    else if (what === 'pick') callNow(q, b.getAttribute('data-key'));
    else if (what === 'later') later(q);
    else if (what === 'done') done(q);
  }

  function start() {
    if (!$('tabsWrap')) return;
    mount();
    paint();
    load();
    clearInterval(st.timer);
    st.timer = setInterval(function () { if (document.visibilityState !== 'hidden') load(); }, 15000);
    /* The Family tab's own call (b.outgoing) and the patient screen's requests: checked often, cheaply. */
    setInterval(function () { if (document.visibilityState !== 'hidden') { announce(); paint(); } }, 3000);
    window.addEventListener('storage', function (e) { if (e.key === OUTBOX) load(); else if (e.key === 'bellatrix-family') announce(); });
    var fo = $('famBody');   /* family-staff.js redraws #famOut inside it */
    if (fo && window.MutationObserver) new MutationObserver(function () { decorateOut(); }).observe(fo, { childList: true, subtree: true });
    /* The tap on "Call {name}" starts the call; the invitation follows at once, not on the next tick. */
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#famBody [data-f="call"]')) { setTimeout(function () { announce(); }, 700); setTimeout(announce, 2000); } });
    window.addEventListener('focus', load);
    window.addEventListener('bellatrix-staff-sub', function (e) { var d = e.detail || {}; if (d.tab === 'family' && d.sub === 'calls') { mount(); load(); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 0); }); else setTimeout(start, 0);

  /* 14 Nov (js/family-visit-staff.js, "Go to {name}"): who the robot will call for this request, and their
     contact on this robot (made from the portal account when there is none): the relative who asked, or
     for a resident's own request the first relative of the list. */
  function visitPick(q) {
    if (!F || !q) return null;
    var code = q.code, pick = null, list = choices(code);
    if (q.from === 'family') {
      var p = (resident(code).family || []).filter(function (x) { return x.pid === q.pid; })[0] || { pid: q.pid, name: q.name, relation: q.relation, lang: residentLang(code), callLink: q.callLink || '' };
      pick = { person: p, contact: matchContact(code, p) };
    } else pick = list[0] || null;
    if (!pick) return null;
    return { person: pick.person || null, contact: pick.contact || (pick.person ? contactFor(code, pick.person) : null) };
  }

  return { refresh: load, open: openCalls, _state: function () { return st; }, _waiting: waiting, visitPick: visitPick, residentInfo: resident,
    /* the portal person of a robot contact (js/family-staff.js: does this call ring on a phone?) */
    personFor: function (code, c) { return c ? personOfContact(code, c) : null; } };
})();
