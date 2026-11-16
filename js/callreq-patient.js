/* Patient screen 1.16 (agent N2): the resident asks for a call with the family (BF-18).
   Where: the waiting screen ("Hello, I am Bellatrix." and Bellatrix's face), the calm screen between
   activities. One more big button under the face: "Call my family" (only when this resident has
   family to call: a contact of the Family tab or a relative on the portal, and never in "staff only").
   A touch opens a short activity in the patient rules (one title, one picture, two buttons, one short
   sentence): "Would you like to call your family?" Yes / No. Yes: the care team is told (Care Team:
   "To do" and Family > Calls, js/callreq-staff.js), then "The care team is told." and back to the
   waiting screen, where the button now says "Call asked" until the team has acted. The team sends the
   invitation; the linked relatives get it on the portal (labland/family-callreq.mjs).
   Offline: the request waits on this device ('bellatrix-callreq-outbox'); the Care Team (same device)
   shows it at once and sends it when the server answers. Texts FR/DE/EN. ES5. */
(function () {
  'use strict';
  if (!window.Lab || typeof I18N === 'undefined') return;
  I18N.add('fr', {
    'Call my family': 'Appeler ma famille', 'Call asked': 'Appel demandé', 'Would you like to call your family?': 'Voulez-vous appeler votre famille ?',
    'The care team is told.': 'L’équipe est prévenue.', 'They will call your family with you.': 'Elle appellera votre famille avec vous.'
  });
  I18N.add('de', {
    'Call my family': 'Meine Familie anrufen', 'Call asked': 'Anruf gewünscht', 'Would you like to call your family?': 'Möchten Sie Ihre Familie anrufen?',
    'The care team is told.': 'Das Pflegeteam weiß Bescheid.', 'They will call your family with you.': 'Es ruft Ihre Familie mit Ihnen an.'
  });
  var KEY = 'bellatrix-care-lab-v1', RUN = 'bellatrix-care-lab-run', OUTBOX = 'bellatrix-callreq-outbox', LASTLANG = 'bellatrix-care-lab-lastlang', STAFF_ONLY = 'bellatrix-staff-only';
  var known = { family: {}, pending: {}, at: 0 };
  function getJ(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v === null ? d : v; } catch (e) { return d; } }
  function putJ(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* this page only */ } }
  var ART = '<svg class="crqart" viewBox="0 0 400 300" aria-hidden="true"><circle cx="200" cy="150" r="118" fill="#FFFFFF" stroke="#E0E0E0" stroke-width="4"/>' +
    '<path d="M150 92 172 114a11 11 0 0 1 0 15.6l-10.4 10.4a92 92 0 0 0 48.4 48.4l10.4-10.4a11 11 0 0 1 15.6 0l22 22a11 11 0 0 1 0 15.6l-11 11c-8 8-20.4 9.4-30.4 4.4a148 148 0 0 1-82-82c-5-10-3.6-22.4 4.4-30.4l11-11a11 11 0 0 1 15.6 0z" fill="#1E8A5A"/>' +
    '<path d="M262 70 C246 56 236 50 240 40 C244 30 256 32 262 42 C268 32 280 30 284 40 C288 50 278 56 262 70 Z" fill="#D64545"/></svg>';
  var PHONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5 9.4 6.3a1.4 1.4 0 0 1 0 2L8 9.7a12 12 0 0 0 6.3 6.3l1.4-1.4a1.4 1.4 0 0 1 2 0l2.8 2.8a1.4 1.4 0 0 1 0 2L19 20.9c-1 1-2.6 1.2-3.9.6A19 19 0 0 1 2.5 8.9c-.6-1.3-.4-2.9.6-3.9l1.5-1.5a1.4 1.4 0 0 1 2 0z" fill="currentColor"/></svg>';
  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------- who, and can they ask ---------- */
  function store() { return getJ(KEY, {}) || {}; }
  /* The resident in front of the robot: the one of the last session on this screen, else the one the
     care team chose in the Care Team. */
  function currentCode() { var s = store(); return String(Lab.patient || (s.settings && s.settings.participant) || '').trim(); }
  function contacts(code) { try { var b = window.FamilyCall ? FamilyCall.book() : null; return b && b.residents[code] ? (b.residents[code].contacts || []) : []; } catch (e) { return []; } }
  function hasFamily(code) { return !!code && (contacts(code).length > 0 || (known.family[code] || 0) > 0); }
  function pending(code) {
    if (known.pending[code]) return true;
    return (getJ(OUTBOX, []) || []).some(function (o) { return o && o.code === code && Date.now() - Date.parse(o.at) < 6 * 3600000; });
  }
  function staffOnly() { var o = getJ(STAFF_ONLY, null); return !!(o && o.on); }
  function runSoon() { var r = getJ(RUN, null); return !!(r && Date.now() - r.at < 3600000); }
  function patientPage() {
    var top = true;
    try { top = window.top === window; } catch (e) { top = false; }
    return top && /(^|\/)patient\.html$/.test(location.pathname) && !!document.getElementById('stage') && !document.getElementById('setup');
  }
  function online() { return !!(window.FamilyMessages && FamilyMessages.request && window.fetch && location.protocol !== 'file:'); }
  /* What the server knows: who has relatives on the portal, and a request still open. Once a minute. */
  function refresh() {
    if (!online()) return Promise.resolve();
    var box = getJ(OUTBOX, []) || [];
    return box.reduce(function (p, o) {
      return p.then(function () {
        return FamilyMessages.request('POST', 'robot/calls/request', { code: o.code }).then(function () {
          putJ(OUTBOX, (getJ(OUTBOX, []) || []).filter(function (x) { return x.code !== o.code; }));
        }, function (e) { if (e && e.status === 404) putJ(OUTBOX, (getJ(OUTBOX, []) || []).filter(function (x) { return x.code !== o.code; })); });
      });
    }, Promise.resolve()).then(function () { return FamilyMessages.request('GET', 'robot/calls'); }).then(function (r) {
      var fam = {}, pend = {};
      (r.residents || []).forEach(function (x) { fam[x.code] = (x.family || []).length; });
      (r.requests || []).forEach(function (q) { if (q.from === 'resident' && (q.state === 'open' || q.state === 'later' || q.state === 'calling')) pend[q.code] = true; });
      known = { family: fam, pending: pend, at: Date.now() };
      decorate();
    }, function () { /* offline: the contacts on this device decide */ });
  }

  /* ---------- the button on the waiting screen ---------- */
  function lastLang() { try { return I18N.valid(localStorage.getItem(LASTLANG)); } catch (e) { return 'en'; } }
  function waitingScreen() {
    var s = document.getElementById('screen');
    return s && !Lab.isOn() && s.querySelector('.picture.facebox') && s.querySelector('header') ? s : null;
  }
  var painting = false;
  function decorate() {
    if (painting || !patientPage()) return;
    var s = waitingScreen(), code = currentCode();
    var old = s ? s.querySelector('.crqwait') : document.querySelector('#screen .crqwait');
    var show = !!s && hasFamily(code) && !staffOnly() && !runSoon();
    if (!show) { if (old) { painting = true; old.parentNode.removeChild(old); painting = false; } return; }
    var L = lastLang(), asked = pending(code);
    var html = '<button type="button" class="btn' + (asked ? ' crqasked' : ' primary') + '" data-crq="ask" data-b="crq" data-a="click"><span class="bico">' + (asked ? CHECK : PHONE) + '</span><span class="blbl">' + Lab.esc(I18N.t(L, asked ? 'Call asked' : 'Call my family')) + '</span></button>';
    if (old && old.getAttribute('data-h') === html) return;
    painting = true;
    if (!old) { old = document.createElement('div'); old.className = 'actions crqwait'; s.appendChild(old); }
    old.innerHTML = html; old.setAttribute('data-h', html);
    try { Lab.arrange(s); } catch (e) { /* layout only */ }
    painting = false;
  }

  /* ---------- the short activity ---------- */
  function residentStart(code) {
    var s = store(), p = (s.patients || {})[code] || {}, pr = p.prefs || {}, st = s.settings || {}, o = Lab.opt;
    o.participant = code; o.staff = st.staff || ''; o.zone = ''; o.mapRev = st.mapRev || ''; o.sw = st.sw || '';
    /* 16 Nov: on a robot with a head and a tablet, pointing in the air is on (touch always works too). */
    var linkedTablet = !!(window.LinkPatient && LinkPatient.configured && LinkPatient.configured());
    o.camMode = o.camMode === 'air' || linkedTablet ? 'air' : (st.camMode || 'off'); o.camMove = false; o.voice = false;
    o.profile = pr.profile || ''; o.greet = pr.greet || ''; o.rate = pr.rate || 0.92; o.volume = pr.volume || 0.9;
    o.textSize = pr.textSize || 'normal'; o.subtitles = !!pr.subtitles; o.lang = I18N.valid(pr.lang || lastLang()); o.mood = false;
    Lab.patient = code;
    Lab.content = p.content || {};
    /* The waiting screen afterwards speaks this resident's language (as after any session). */
    try { localStorage.setItem(LASTLANG, Lab.lang()); } catch (e) { /* only for the waiting screen */ }
    Lab.start('callrequest', { direct: true, data: { code: code } });
  }
  function send(code) {
    var box = (getJ(OUTBOX, []) || []).filter(function (x) { return x.code !== code; });
    box.push({ code: code, at: new Date().toISOString() });
    putJ(OUTBOX, box);   /* the Care Team on this device sees it at once, even offline */
    known.pending[code] = true;
    if (!online()) return;
    FamilyMessages.request('POST', 'robot/calls/request', { code: code }).then(function () {
      putJ(OUTBOX, (getJ(OUTBOX, []) || []).filter(function (x) { return x.code !== code; }));
    }, function () { /* sent later (refresh, or the Care Team) */ });
  }
  Lab.define({
    key: 'callrequest', day: 17.5, name: 'Call my family', zone: 'ROSE_ROOM', hidden: true, noAgain: true,
    flow: 'The resident asks for a video call with the family; the care team is told and sends the invitation.',
    learn: 'Does the resident ask for their family by themselves?',
    art: function () { return ART; },
    start: function (L) {
      var T = L.t, code = (Lab.startData && Lab.startData.code) || Lab.patient;
      function bye(title, lead) {
        var st = { id: 'crq-end', final: true, center: true, title: title, lead: lead || '', body: '<div class="picture crqpic">' + ART + '</div>', say: lead ? title + ' ' + lead : title,
          actions: [{ label: T('Finish'), primary: true, noLabelWords: true, run: function () { Lab.endSession(); } }],
          afterSay: function () { L.later(function () { Lab.endSession(); }, 2500); } };
        st.enter = function () { L.later(function () { Lab.endSession(); }, 9000); };
        return st;
      }
      var q = T('Would you like to call your family?');
      return {
        id: 'crq-ask', title: q, pic: ART, picCls: 'crqpic', back: false, noHistory: true, airPointer: true, say: q,
        actions: [
          { label: T('Yes'), primary: true, gesture: 'open', words: ['yes', 'yeah', 'ok', 'okay', 'sure', 'oui', 'ja'], noLabelWords: true,
            run: function () {
              send(code);
              L.stat('callRequested', true);
              L.log('The resident asks for a call with the family: the care team is told', 'result');
              L.go(bye(T('The care team is told.'), T('They will call your family with you.')), { clear: true });
            } },
          { label: T('No'), gesture: 'fist', words: ['no', 'not now', 'later', 'non', 'nein'], noLabelWords: true,
            run: function () { L.stat('callRequested', false); L.go(bye(T('That’s fine, no problem.')), { clear: true }); } }
        ]
      };
    }
  });

  /* The team ends the running activity to start a call (js/callreq-staff.js, "End the activity and call"):
     a clean end, saved like any other (Results shows it as ended by the care team). Never a call in progress. */
  var END = 'bellatrix-callreq-end', lastEnd = 0;
  function checkEnd() {
    var o = getJ(END, null);
    if (!o || !o.at || o.at === lastEnd || Date.now() - o.at > 20000) return;
    lastEnd = o.at;
    var key = '';
    try { key = Lab._t && Lab._t.state && Lab._t.state.act ? Lab._t.state.act.key : ''; } catch (e) { key = ''; }
    if (Lab.isOn() && key !== 'familycall') Lab.endSession('ended by the care team to call the family');
  }
  document.addEventListener('DOMContentLoaded', function () {
    if (!patientPage()) return;
    /* 1.17: a big button for elderly users. The stage is drawn at 1080x1920 (portrait) or 1920x1080 and scaled to the screen
       (scale 0.5 on 540x960, 0.57 on 1098x618): 190 / 72 design px give at least 95 / 36 CSS px there. */
    var css = document.createElement('style');
    css.textContent = '.crqwait .btn { min-height: 190px; font-size: 72px; padding: 16px 40px; flex-direction: row; gap: 28px; text-align: center; touch-action: manipulation; }' +
      '.crqwait .btn .bico svg { width: 84px; height: 84px; display: block; }' + '.crqwait .btn .blbl { font-family: var(--font); }';
    document.head.appendChild(css);
    window.addEventListener('storage', function (e) { if (e.key === END) checkEnd(); });
    setInterval(checkEnd, 1000);
    var s = document.getElementById('screen');
    if (s && window.MutationObserver) new MutationObserver(function () { if (!painting) setTimeout(decorate, 0); }).observe(s, { childList: true });
    if (s) s.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-crq="ask"]') : null;
      if (!b || Lab.isOn()) return;
      var code = currentCode();
      if (!code) return;
      if (pending(code)) { Lab.toast(I18N.t(lastLang(), 'The care team is told.')); return; }
      residentStart(code);
    });
    window.addEventListener('storage', function (e) { if (!e.key || e.key === 'bellatrix-family' || e.key === OUTBOX || e.key === KEY || e.key === STAFF_ONLY || e.key === RUN) decorate(); });
    setTimeout(function () { decorate(); refresh(); }, 1500);
    setInterval(function () { if (document.visibilityState !== 'hidden') refresh(); }, 60000);
    setInterval(decorate, 5000);
  });
  window.CallReqPatient = { decorate: decorate, refresh: refresh, _known: function () { return known; } };
})();
