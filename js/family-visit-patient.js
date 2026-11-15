/* Patient TABLET, 14 Nov (Rahma): the family visit the care team sent from the robot's head with ONE
   button ("Go to Anna", js/family-visit-staff.js). It arrives as an ordinary link run of the activity
   "Family messages" (key 'messages', js/link-patient.js): the robot drives to the resident, the tablet
   waits for the person and the posture check, then the activity starts here, big, on the portrait screen.
   - The head and the tablet are two devices that share nothing. The run carries the robot's family
     identity in opt.fam (its id and portal key, the call server, the resident's contacts without photos).
     onRun() takes it OUT of the run at once (it is never stored with the session nor sent back), and
     this tablet then reads the family messages, reports "delivered" and "seen" (the family's blue ticks)
     and receives and places the calls as the same robot.
   - A message visit: the messages of the notification are synced first if needed, then the usual
     "You have a message from Sophie. Would you like to see it?".
   - A call visit (a call request, a planned call): "Sophie would like to talk with you." with ONE big
     button "Call Sophie" (and a small "Later"). Yes: the same run goes on as the family call
     (LinkPatient.chain), the call server's outgoing call starts, the family gets the invitation on the
     phone (robot/calls/invite: push + bell, "Join"), and the call screen waits for them here. The head
     shows "With the patient" until the call ends, then the robot goes home.
   ES5 (Chrome 95). */
window.FamilyVisit = (function () {
  'use strict';
  var VISIT = 'bellatrix-family-visit', FRESH_MS = 3 * 3600 * 1000, WATCH_MS = 20000;
  function noop() {}
  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function getJ(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function putJ(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* this page only */ } }

  if (typeof I18N !== 'undefined' && I18N.add) {
    var addNew = function (l, t) { var have = I18N.dict[l] || {}, out = {}; Object.keys(t).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(have, k)) out[k] = t[k]; }); I18N.add(l, out); };
    addNew('fr', { '{name} would like to talk with you.': '{name} aimerait vous parler.', 'Shall we call {name}?': 'On appelle {name} ?', 'Call {name}': 'Appeler {name}',
      'The call could not start. The care team can try again.': 'L’appel n’a pas pu démarrer. L’équipe peut réessayer.', 'Your family': 'Votre famille' });
    addNew('de', { '{name} would like to talk with you.': '{name} möchte gern mit Ihnen sprechen.', 'Shall we call {name}?': 'Sollen wir {name} anrufen?', 'Call {name}': '{name} anrufen',
      'The call could not start. The care team can try again.': 'Der Anruf konnte nicht starten. Das Team kann es noch einmal versuchen.', 'Your family': 'Ihre Familie' });
  }

  /* ---------- the run arrives (js/link-patient.js accept) ---------- */
  function onRun(run) {
    var o = run && run.opt, f = o && o.fam;
    if (!f || typeof f !== 'object') return false;
    delete o.fam;
    adopt(f);
    var call = f.call && typeof f.call === 'object' && f.call.contact ? { req: String(f.call.req || '').slice(0, 40), contact: String(f.call.contact).slice(0, 40), name: String(f.call.name || '').slice(0, 40), pid: String(f.call.pid || '').slice(0, 40) } : null;
    putJ(VISIT, { run: run.id, code: run.patient, ids: Array.isArray(f.ids) ? f.ids.slice(0, 50).map(String) : [], call: call, at: Date.now() });
    if (window.FamilyMessages && FamilyMessages.sync) FamilyMessages.sync().catch(noop);
    return true;
  }
  /* The head's family identity becomes this tablet's (one robot = one identity on the portal and the call server). */
  function adopt(f) {
    var changed = false;
    if (/^[A-Za-z0-9_-]{16,64}$/.test(f.robot || '') && ls('bellatrix-family-robot') !== f.robot) changed = set('bellatrix-family-robot', f.robot) || changed;
    if (/^[A-Za-z0-9_-]{32,86}$/.test(f.key || '') && ls('bellatrix-portal-key') !== f.key) changed = set('bellatrix-portal-key', f.key) || changed;
    /* the call server: only when the link itself does not depend on it (the head's relay is set), or none is set */
    var srv = String(f.server || '').trim().replace(/\/+$/, ''), link = ls('bellatrix-link-server').trim(), mine = ls('bellatrix-call-server').trim().replace(/\/+$/, '');
    if (/^https?:\/\/[^\s\/]+/i.test(srv) && srv !== mine && ((link && link.toLowerCase() !== 'local') || !mine)) changed = set('bellatrix-call-server', srv) || changed;
    var F = window.FamilyCall;
    if (f.book && typeof f.book === 'object' && F && F.book && F.saveBook) {
      var b = F.book();
      Object.keys(f.book).slice(0, 20).forEach(function (code) {
        var r = f.book[code] || {}, cur = b.residents[code] || {}, old = {};
        (cur.contacts || []).forEach(function (c) { if (c && c.id) old[c.id] = c; });
        b.residents[code] = {
          contacts: (Array.isArray(r.contacts) ? r.contacts : []).slice(0, 20).map(function (c) { var x = {}; Object.keys(c || {}).forEach(function (k) { x[k] = c[k]; }); x.photo = (old[x.id] && old[x.id].photo) || ''; return x; }),
          times: Array.isArray(r.times) ? r.times : (cur.times || []),
          acceptNow: r.acceptNow !== undefined ? r.acceptNow : cur.acceptNow
        };
      });
      if (typeof f.loud === 'boolean') b.loud = f.loud;
      F.saveBook(b);
    }
    if (changed && window.FamilyMessages && FamilyMessages.resetIdentity) FamilyMessages.resetIdentity();
    if (F && F.report) { try { F.report(); } catch (e) { /* next report */ } }
    return changed;
  }
  /* The visit for this resident, once (the messages activity asks it when it starts). */
  function take(code) {
    var v = getJ(VISIT);
    if (!v || !v.code || String(v.code) !== String(code) || Date.now() - (v.at || 0) > FRESH_MS) return null;
    putJ(VISIT, null);
    return v;
  }

  /* ---------- the call visit ---------- */
  function contactOf(code, id) { var F = window.FamilyCall; return F && F.contact ? F.contact(code, id) : null; }
  function callPic() { return (typeof ART !== 'undefined' && ART.call) || (window.FamilyMessages ? FamilyMessages.ENVELOPE : ''); }
  function callStep(L, v) {
    var T = L.t, c = contactOf(v.code, v.call.contact) || { id: v.call.contact, name: v.call.name };
    var name = String(c.name || v.call.name || '').trim() || T('Your family');
    var line = T('{name} would like to talk with you.', { name: name }), q = T('Shall we call {name}?', { name: name });
    L.stat('visitCall', true);
    L.log('Family visit: ' + (v.call.req ? 'call request' : 'call') + ' from the family', 'call');
    return {
      id: 'visit-call', title: line, lead: q, pic: callPic(), picCls: 'msgenv', back: false, noHistory: true, airPointer: true, say: line + ' ' + q,
      actions: [
        { label: T('Call {name}', { name: name }), primary: true, gesture: 'open', words: ['yes', 'call', 'ok', 'oui', 'appeler', 'ja', 'anrufen'], noLabelWords: true, run: function () { startCall(L, v, c, name); } },
        { label: T('Later'), gesture: 'fist', words: ['later', 'not now', 'plus tard', 'später'], noLabelWords: true, run: function () { later(L, v); } }
      ]
    };
  }
  function later(L, v) {
    var FM = window.FamilyMessages, line = L.t('All right. Later, then.');
    if (v.call.req && FM && FM.request) FM.request('POST', 'robot/calls/decide', { id: v.call.req, decision: 'later', minutes: 60 }).catch(noop);
    L.stat('visitCallLater', true);
    L.log('The resident would rather call later', 'result');
    L.go({ id: 'visit-later', final: true, center: true, title: line, say: line,
      actions: [{ label: L.t('Finish'), primary: true, noLabelWords: true, run: function () { Lab.endSession(); } }],
      enter: function () { L.later(function () { Lab.endSession(); }, 6000); } }, { clear: true });
  }
  function startCall(L, v, c, name) {
    var F = window.FamilyCall, FM = window.FamilyMessages, code = v.code;
    if (!F || !F.request) { failed(name); return; }
    L.stat('visitCallStarted', true);
    L.log('The resident wants to call the family', 'consent');
    /* the same run goes on as the call: the head keeps "With the patient" until the call ends */
    if (window.LinkPatient && LinkPatient.chain) LinkPatient.chain('familycall');
    Lab.endSession();
    var label = c.label || (Lab.opt && Lab.opt.greet) || code;
    F.request('POST', 'outgoing', { robot: F.robotId(), resident: code, contactId: c.id, label: String(label).slice(0, 40), lang: c.lang || (Lab.opt && Lab.opt.lang) || 'en' }).then(function (o) {
      if (FM && FM.request) FM.request('POST', 'robot/calls/invite', { code: code, token: o.token, until: o.expires, requestId: v.call.req || '', pids: v.call.pid ? [v.call.pid] : undefined, contact: name }).catch(noop);
      /* the call server's 'outgoing' event starts the call screen (js/patient.js familyCall); nothing after 20 s: say so */
      setTimeout(function () { if (!Lab.isOn()) { F.request('POST', 'outgoing/cancel', { robot: F.robotId(), token: o.token }).catch(noop); failed(name); } }, WATCH_MS);
    }, function () { failed(name); });
  }
  /* The call could not start: a calm closing screen, and this ends the run (the robot goes home). */
  function failed(name) {
    if (window.LinkPatient && LinkPatient.chain) LinkPatient.chain('messages');
    if (Lab.isOn()) return;
    try { Lab.start('messages', { direct: true, data: { callFailed: true, name: name } }); } catch (e) { if (window.console) console.error(e); }
  }
  function failedStep(L) {
    var line = L.t('The call could not start. The care team can try again.');
    L.stat('visitCallFailed', true);
    L.log('The family call could not start', 'error');
    return { id: 'visit-failed', final: true, center: true, title: line, say: line, back: false, noHistory: true,
      actions: [{ label: L.t('Finish'), primary: true, noLabelWords: true, run: function () { Lab.endSession(); } }],
      enter: function () { L.later(function () { Lab.endSession(); }, 9000); } };
  }

  return { onRun: onRun, adopt: adopt, take: take, callStep: callStep, failedStep: failedStep, _key: VISIT };
})();
