/* Places, Care Team on the robot head (15 Nov). The boss: "your place is the office (or the centre of
   the care unit); all the rooms are just places where the patients are."
   The robot's map places (BellatrixApp.robotPlaces) get a role, set once in Tools > Settings > Places:
     base  ONE place: the office / nursing station. The robot always goes back there after a visit.
     room  a place where residents are (default). Only rooms are offered in the place pickers.
     other hidden from the pickers (charging pile, corridor points...).
   Saved on this head in localStorage 'bellatrix-places' ({ v: 1, base, roles: { name: role }, at }); the
   server has no prefs route, so nothing is sent. The resident's own room stays in the resident's Care Team
   prefs ('place', the one the family visit already saves).
   Nothing configured = exactly as before: every map place is offered and the robot goes back to
   localStorage 'bellatrix-home-place', else 'Standby-Punkt'.

   API for the other modules (link, family visit, the meal round):
     Places.configured()       true once the team saved the roles
     Places.all()              the map's place names, [] without a robot
     Places.rooms()            what a picker offers (the rooms; not configured: every place)
     Places.base()             where the robot goes back to
     Places.role(place)        'base' | 'room' | 'other'
     Places.roomOf(code)       the resident's saved room, '' if none (or no longer a room)
     Places.setRoom(code, p)   saves it in the resident's prefs (also done when a room is first chosen
                               for a resident at the activity start or in "Where is …?")
     Places.label(place)       the text to show ('–' for none)
     Places.pickerHtml(o)      a <select>: '–' first, then the rooms; the resident's room preselected
                               (o = { id, code, value, cls, attrs, list })
     Places.strict()           false: '–' means "no driving", the activity goes straight to the tablet,
                               as the activity picker always did (Rahma 15 Nov: "par défaut '–' comme
                               dans les activités, pour tester le reste"). localStorage
                               'bellatrix-place-required' = '1': '–' starts nothing until a place is chosen.
     Places.canStart(value)    false only in strict mode with '–' while rooms exist
     Places.meaning(code, reason, text)   a navigation code in plain words (current language)
     Places.navLog()           the last 20 drives (any module), newest first
     Places.openTest()         the "Navigation test" panel (for Basti)
   The panel: connection, localisation, battery, pose, every place with Go, Back to base, a big STOP
   (robotStop), "Relocalize at the charging pile" (only when the app has robotRelocalize), the live drive
   and the last 20 drives with time, target, result, duration and the code in plain words; Copy gives
   the log as text. ES5 (Chrome 95). */
window.Places = (function () {
  'use strict';
  var KEY = 'bellatrix-places', LOG = 'bellatrix-nav-log', STRICT = 'bellatrix-place-required', STORE = 'bellatrix-care-lab-v1', MAXLOG = 20;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function fill(k, v) { return String(k).replace(/\{(\w+)\}/g, function (a, n) { return v && v[n] !== undefined ? v[n] : a; }); }
  var S = function (k, v) { return window.ST ? ST(k, v) : fill(k, v); };
  var BASE_RE = /b(ü|ue|u)ro\b|office|bureau|st(ü|ue)tzpunkt|stationszimmer|pflegestation|nursing|stand-?by/i;
  var CHARGE_RE = /lade|charg|充电|pile/i;
  var trk = { since: null }, panelSig = '', panelT = 0, tickT = 0;

  if (window.ST && ST.add) {
    ST.add('fr', {
      'Places': 'Lieux', 'Base': 'Base', 'Room': 'Chambre', 'Other place': 'Autre lieu', 'No robot connected.': 'Aucun robot connecté.', 'Back': 'Retour',
      'Navigation test': 'Test de navigation', 'Connection': 'Connexion', 'Connected': 'Connecté', 'Not connected': 'Non connecté', 'Connecting…': 'Connexion…',
      'Localized': 'Localisé', 'Yes': 'Oui', 'No': 'Non', 'Battery': 'Batterie', 'charging': 'en charge', 'Pose': 'Pose', 'Map': 'Carte', 'Last error': 'Dernière erreur',
      'Go': 'Y aller', 'Back to base': 'Retour à la base', 'STOP': 'STOP', 'Relocalize at the charging pile': 'Relocaliser à la station de charge',
      'Idle': 'À l’arrêt', 'Moving to {place}': 'En route vers {place}', 'Arrived at {place}': 'Arrivé : {place}', 'Failed: {place}': 'Échec : {place}',
      'Stopped': 'Arrêté', 'try {n}': 'essai {n}', 'Last attempts': 'Derniers essais', 'Time': 'Heure', 'Target': 'Destination', 'Result': 'Résultat',
      'Duration': 'Durée', 'Code': 'Code', 'Meaning': 'Signification', 'Arrived': 'Arrivé', 'Failed': 'Échec', 'Refused': 'Refusé', 'Under way': 'En cours',
      'Copy': 'Copier', 'Copied.': 'Copié.', 'No attempt yet.': 'Aucun essai.', 'Saved.': 'Enregistré.', 'Choose a place.': 'Choisissez un lieu.',
      'Relocalizing…': 'Relocalisation…', 'Relocalized.': 'Relocalisé.', 'Relocalization failed.': 'Échec de la relocalisation.',
      'Emergency stop pressed.': 'Arrêt d’urgence enfoncé.', 'Navigation log': 'Journal de navigation',
      'Destination not on the route: relocalize the robot (at the charging pile) or choose another point.': 'La destination n’est pas sur le trajet : relocaliser le robot (à la station de charge) ou choisir un autre point.',
      'Another action is still running: the robot tries again.': 'Une autre action est encore en cours : le robot réessaie.',
      'The robot is busy with another app: it tries again.': 'Le robot est occupé par une autre application : il réessaie.',
      'This place does not exist on the map.': 'Ce lieu n’existe pas sur la carte.', 'The destination cannot be reached.': 'La destination ne peut pas être atteinte.',
      'Already at the destination.': 'Déjà à destination.', 'The robot is not localized: relocalize it at the charging pile.': 'Le robot n’est pas localisé : le relocaliser à la station de charge.',
      'Navigation failed.': 'La navigation a échoué.', 'Avoiding an obstacle.': 'Évite un obstacle.', 'The robot is outside the map.': 'Le robot est hors de la carte.',
      'No path found (obstacle or closed door).': 'Aucun chemin trouvé (obstacle ou porte fermée).', 'No way through for 5 minutes.': 'Pas de passage pendant 5 minutes.',
      'The robot connection was lost.': 'La connexion au robot a été perdue.', 'Stopped by the team.': 'Arrêté par l’équipe.',
      'Paused by the robot system.': 'Mis en pause par le système du robot.', 'Another drive is running.': 'Un autre trajet est en cours.',
      'Waiting, then tries again.': 'Attend, puis réessaie.'
    });
    ST.add('de', {
      'Places': 'Orte', 'Base': 'Basis', 'Room': 'Zimmer', 'Other place': 'Anderer Ort', 'No robot connected.': 'Kein Roboter verbunden.', 'Back': 'Zurück',
      'Navigation test': 'Navigationstest', 'Connection': 'Verbindung', 'Connected': 'Verbunden', 'Not connected': 'Nicht verbunden', 'Connecting…': 'Verbinde…',
      'Localized': 'Lokalisiert', 'Yes': 'Ja', 'No': 'Nein', 'Battery': 'Akku', 'charging': 'lädt', 'Pose': 'Pose', 'Map': 'Karte', 'Last error': 'Letzter Fehler',
      'Go': 'Hinfahren', 'Back to base': 'Zur Basis', 'STOP': 'STOPP', 'Relocalize at the charging pile': 'An der Ladestation neu lokalisieren',
      'Idle': 'Bereit', 'Moving to {place}': 'Fährt zu {place}', 'Arrived at {place}': 'Angekommen: {place}', 'Failed: {place}': 'Fehlgeschlagen: {place}',
      'Stopped': 'Gestoppt', 'try {n}': 'Versuch {n}', 'Last attempts': 'Letzte Versuche', 'Time': 'Zeit', 'Target': 'Ziel', 'Result': 'Ergebnis',
      'Duration': 'Dauer', 'Code': 'Code', 'Meaning': 'Bedeutung', 'Arrived': 'Angekommen', 'Failed': 'Fehlgeschlagen', 'Refused': 'Abgelehnt', 'Under way': 'Unterwegs',
      'Copy': 'Kopieren', 'Copied.': 'Kopiert.', 'No attempt yet.': 'Noch kein Versuch.', 'Saved.': 'Gespeichert.', 'Choose a place.': 'Wählen Sie einen Ort.',
      'Relocalizing…': 'Lokalisiere neu…', 'Relocalized.': 'Neu lokalisiert.', 'Relocalization failed.': 'Neu-Lokalisierung fehlgeschlagen.',
      'Emergency stop pressed.': 'Not-Aus gedrückt.', 'Navigation log': 'Navigationsprotokoll',
      'Destination not on the route: relocalize the robot (at the charging pile) or choose another point.': 'Ziel liegt nicht auf der Route: Roboter neu lokalisieren (an der Ladestation) oder anderen Punkt wählen.',
      'Another action is still running: the robot tries again.': 'Eine andere Aktion läuft noch: der Roboter versucht es erneut.',
      'The robot is busy with another app: it tries again.': 'Der Roboter ist von einer anderen App belegt: er versucht es erneut.',
      'This place does not exist on the map.': 'Dieser Ort existiert nicht auf der Karte.', 'The destination cannot be reached.': 'Das Ziel ist nicht erreichbar.',
      'Already at the destination.': 'Bereits am Ziel.', 'The robot is not localized: relocalize it at the charging pile.': 'Der Roboter ist nicht lokalisiert: an der Ladestation neu lokalisieren.',
      'Navigation failed.': 'Navigation fehlgeschlagen.', 'Avoiding an obstacle.': 'Weicht einem Hindernis aus.', 'The robot is outside the map.': 'Der Roboter ist außerhalb der Karte.',
      'No path found (obstacle or closed door).': 'Kein Weg gefunden (Hindernis oder geschlossene Tür).', 'No way through for 5 minutes.': 'Seit 5 Minuten kein Durchkommen.',
      'The robot connection was lost.': 'Die Verbindung zum Roboter ist abgebrochen.', 'Stopped by the team.': 'Vom Team gestoppt.',
      'Paused by the robot system.': 'Vom Robotersystem pausiert.', 'Another drive is running.': 'Eine andere Fahrt läuft.',
      'Waiting, then tries again.': 'Wartet und versucht es erneut.'
    });
  }

  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function put(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function toast(t) { if (window.Lab && Lab.toast) Lab.toast(t); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hms(t) { var d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function stamp(t) { var d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  /* ---------- the robot (Android bridge); no robot = no places, nothing breaks ---------- */
  function app() { return window.BellatrixApp || null; }
  function has(fn) { var a = app(); return !!(a && typeof a[fn] === 'function'); }
  function bell(fn, arg) {
    try {
      var a = app();
      if (!a || typeof a[fn] !== 'function') return null;
      var v = arg === undefined ? a[fn]() : a[fn](arg);
      if (typeof v !== 'string') return v == null ? null : v;
      try { return JSON.parse(v); } catch (e) { return v; }
    } catch (e) { return null; }
  }
  function all() {
    var l = bell('robotPlaces'), out = [];
    if (!Array.isArray(l)) return out;
    l.forEach(function (p) { var n = p && typeof p === 'object' ? p.name : p; if (typeof n === 'string' && n && out.indexOf(n) < 0) out.push(n); });
    return out;
  }

  /* ---------- roles ---------- */
  function cfg() { try { var c = JSON.parse(ls(KEY) || 'null'); return c && typeof c === 'object' && c.roles && typeof c.roles === 'object' ? c : null; } catch (e) { return null; } }
  function configured() { return !!cfg(); }
  function oldHome() { return ls('bellatrix-home-place').trim() || 'Standby-Punkt'; }
  /* The base the settings propose: the old home place if the map has it, else an office-like name. */
  function defaultBase(list) {
    list = list || all();
    var h = oldHome(), i;
    if (list.indexOf(h) >= 0) return h;
    for (i = 0; i < list.length; i++) if (BASE_RE.test(list[i]) && !CHARGE_RE.test(list[i])) return list[i];
    return '';
  }
  function defaultRole(p) { return CHARGE_RE.test(p) ? 'other' : 'room'; }
  function role(p) {
    var c = cfg();
    if (!c) return p && p === defaultBase() ? 'base' : defaultRole(p);
    if (c.base && c.base === p) return 'base';
    var r = c.roles[p];
    return r === 'room' || r === 'other' ? r : defaultRole(p);
  }
  function base() { var c = cfg(); return c && c.base ? c.base : oldHome(); }
  function rooms() {
    var list = all();
    if (!configured()) return list;
    return list.filter(function (p) { return role(p) === 'room'; });
  }
  /* Saves one role; the first change saves the proposed roles of every place too (then it is "configured"). */
  function setRole(p, r) {
    if (!p || ['base', 'room', 'other'].indexOf(r) < 0) return false;
    var list = all(), c = cfg();
    if (!c) {
      c = { v: 1, base: defaultBase(list), roles: {} };
      list.forEach(function (x) { if (x !== c.base) c.roles[x] = defaultRole(x); });
    }
    if (r === 'base') {
      if (c.base && c.base !== p) c.roles[c.base] = 'room';
      c.base = p; delete c.roles[p];
    } else {
      if (c.base === p) c.base = '';
      c.roles[p] = r;
    }
    c.at = new Date().toISOString();
    var ok = put(KEY, JSON.stringify(c));
    if (ok && c.base) put('bellatrix-home-place', c.base);   /* older readers of the home place agree */
    return ok;
  }

  /* ---------- the resident's room (Care Team prefs, 'place') ---------- */
  function rawRoom(code) {
    var v;
    if (window.StaffUI && StaffUI.pref) v = StaffUI.pref(code, 'place');
    else { try { var s = JSON.parse(ls(STORE) || '{}') || {}, p = (s.patients || {})[code]; v = p && p.prefs ? p.prefs.place : ''; } catch (e) { v = ''; } }
    return typeof v === 'string' ? v : '';
  }
  function roomOf(code) {
    if (!code) return '';
    var v = rawRoom(code), list = all();
    if (!v) return '';
    if (!list.length) return v;   /* no robot now: what was saved */
    return rooms().indexOf(v) >= 0 ? v : '';
  }
  function setRoom(code, p) {
    if (!code) return false;
    if (window.StaffUI && StaffUI.setPref) return StaffUI.setPref(code, 'place', p || '');
    try {
      var s = JSON.parse(ls(STORE) || '{}') || {};
      s.patients = s.patients || {};
      var r = s.patients[code] = s.patients[code] || { content: {}, prefs: {} };
      r.prefs = r.prefs || {};
      if (p) r.prefs.place = p; else delete r.prefs.place;
      return put(STORE, JSON.stringify(s));
    } catch (e) { return false; }
  }
  function label(p) { return p ? String(p) : '–'; }
  function strict() { return ls(STRICT) === '1'; }
  function canStart(v) { return !strict() || !!v || !rooms().length; }
  function pickerHtml(o) {
    o = o || {};
    var list = o.list || rooms(), v = o.value !== undefined ? String(o.value || '') : (o.code ? roomOf(o.code) : '');
    if (list.indexOf(v) < 0) v = '';
    return '<select' + (o.id ? ' id="' + esc(o.id) + '"' : '') + (o.cls ? ' class="' + esc(o.cls) + '"' : '') + (o.attrs || '') + '>' +
      '<option value=""' + (v ? '' : ' selected') + '>–</option>' +
      list.map(function (p) { return '<option value="' + esc(p) + '"' + (p === v ? ' selected' : '') + '>' + esc(label(p)) + '</option>'; }).join('') + '</select>';
  }

  /* ---------- navigation codes in plain words ---------- */
  var ROUTE = 'Destination not on the route: relocalize the robot (at the charging pile) or choose another point.';
  var NOLOC = 'The robot is not localized: relocalize it at the charging pile.';
  var CODES = {
    '20010016': ROUTE, '-1': 'Another action is still running: the robot tries again.', '-6': 'The robot is busy with another app: it tries again.',
    '-108': 'This place does not exist on the map.', '-109': 'The destination cannot be reached.', '-113': 'Already at the destination.',
    '-116': NOLOC, '-120': 'Navigation failed.', '1018': 'Avoiding an obstacle.', '1020': 'The robot is outside the map.', '1025': 'No path found (obstacle or closed door).'
  };
  var REASONS = {
    'not-localized': NOLOC, 'unknown-place': 'This place does not exist on the map.', emergency: 'Emergency stop pressed.', blocked: 'No way through for 5 minutes.',
    disconnected: 'The robot connection was lost.', stopped: 'Stopped by the team.', suspended: 'Paused by the robot system.', busy: 'Another drive is running.',
    'not-connected': 'Not connected', waiting: 'Waiting, then tries again.', retrying: 'Waiting, then tries again.', avoiding: 'Avoiding an obstacle.'
  };
  /* The code of a drive: an 8-digit navigation code in the SDK's text wins (20010016 comes that way), else the number. */
  function codeOf(n) {
    if (!n || typeof n !== 'object') return '';
    var m = /\b(2\d{7})\b/.exec(String(n.codeText || ''));
    if (m) return m[1];
    return n.code ? String(n.code) : '';
  }
  function meaning(code, reason, text) {
    code = code == null ? '' : String(code);
    if (CODES[code]) return S(CODES[code]);
    if (/not within the route/i.test(String(text || ''))) return S(ROUTE);
    if (reason && REASONS[reason]) return S(REASONS[reason]);
    return '';
  }

  /* ---------- the drives log: every drive of the robot, whoever started it (robotNav, once a second) ---------- */
  function navLog() { try { var l = JSON.parse(ls(LOG) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function saveLog(l) { put(LOG, JSON.stringify(l.slice(0, MAXLOG))); }
  function endOf(n) {
    if (n.state === 'arrived') return 'arrived';
    if (n.state === 'failed') return 'failed';
    return 'stopped';
  }
  function tick() {
    var n = bell('robotNav');
    if (!n || typeof n !== 'object' || !n.state) return false;
    var log = navLog(), open = null, changed = false, c = codeOf(n), i;
    for (i = 0; i < log.length && !open; i++) if (log[i] && log[i].result === 'moving') open = log[i];   /* a refusal may sit above it */
    if (n.state === 'moving') {
      if (!open || open.since !== n.since) {
        if (open) { open.result = 'stopped'; open.reason = open.reason || 'stopped'; }
        open = { at: Date.now(), since: n.since, place: n.place || '', result: 'moving', reason: '', code: '', text: '', tries: 0, dur: 0 };
        log.unshift(open); changed = true;
      }
      if (n.attempt && open.tries !== n.attempt) { open.tries = n.attempt; changed = true; }
      if (c && c !== open.code) { open.code = c; open.text = String(n.codeText || '').slice(0, 160); changed = true; }
      if ((n.reason || '') !== open.reason) { open.reason = n.reason || ''; changed = true; }
      if (typeof n.waitedS === 'number' && n.waitedS !== open.dur) { open.dur = n.waitedS; changed = true; }
    } else if (open) {
      open.result = endOf(n); open.reason = n.reason || ''; changed = true;
      if (c) { open.code = c; open.text = String(n.codeText || '').slice(0, 160); }
      open.dur = typeof n.waitedS === 'number' ? n.waitedS : Math.round((Date.now() - open.at) / 1000);
      if (n.attempt) open.tries = n.attempt;
    } else if (trk.since !== null && n.since !== trk.since && n.state === 'failed') {
      /* refused at once (not localized, emergency stop, unknown place): it never moved */
      log.unshift({ at: Date.now(), since: n.since, place: n.place || '', result: 'refused', reason: n.reason || '', code: c, text: String(n.codeText || '').slice(0, 160), tries: 0, dur: 0 });
      changed = true;
    }
    trk.since = n.since;
    if (changed) saveLog(log);
    return changed;
  }
  function refused(place, why) {
    var log = navLog();
    log.unshift({ at: Date.now(), since: 0, place: place || '', result: 'refused', reason: why, code: '', text: '', tries: 0, dur: 0 });
    saveLog(log);
  }
  function resultWord(r) { return S({ arrived: 'Arrived', failed: 'Failed', stopped: 'Stopped', refused: 'Refused', moving: 'Under way' }[r] || 'Under way'); }
  function durText(s) { s = Math.max(0, Math.round(s || 0)); return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + pad(s % 60) + ' s'; }

  /* ---------- actions (the panel's buttons; also used by the tests) ---------- */
  function go(p) {
    if (!p) return '';
    if (!has('robotGo')) { refused(p, 'not-connected'); return 'not-connected'; }
    tick();   /* the state before: a drive refused at once is then seen as new */
    var r = bell('robotGo', p);
    if (r !== 'ok') refused(p, r === 'busy' ? 'busy' : 'not-connected');
    tick(); renderPanel();
    return r;
  }
  function stop() { var r = bell('robotStop'); tick(); renderPanel(); return r; }
  function relocalize() {
    if (!has('robotRelocalize')) return '';
    var r = bell('robotRelocalize');
    toast(r === 'ok' ? S('Relocalizing…') : r === 'busy' ? S('Another drive is running.') : S('Not connected'));
    renderPanel();
    return r;
  }
  function logText() {
    var st = bell('robotState') || {}, lines = [];
    lines.push(S('Navigation log') + ' · ' + stamp(Date.now()));
    lines.push(S('Connection') + ': ' + (st.connected ? S('Connected') : S('Not connected')) + ' · ' + S('Localized') + ': ' + (st.localized ? S('Yes') : S('No')) +
      (typeof st.battery === 'number' && st.battery >= 0 ? ' · ' + S('Battery') + ': ' + st.battery + ' %' : '') + (st.mapName ? ' · ' + S('Map') + ': ' + st.mapName : '') +
      ' · ' + S('Base') + ': ' + base());
    navLog().forEach(function (e) {
      lines.push([hms(e.at), e.place, resultWord(e.result) + (e.tries > 1 ? ' (' + S('try {n}', { n: e.tries }) + ')' : ''), durText(e.dur), e.code || '-', meaning(e.code, e.reason, e.text) || e.text || ''].join('\t'));
    });
    return lines.join('\n');
  }
  function copy() {
    var t = logText(), done = function () { toast(S('Copied.')); };
    function old() {
      try {
        var ta = document.createElement('textarea');
        ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); done();
      } catch (e) { /* nothing to copy with */ }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(done, old); return t; }
    } catch (e) { /* the old way */ }
    old();
    return t;
  }

  /* ---------- Tools > Settings: the Places block ---------- */
  function settingsHtml() {
    var list = all(), h = '<section class="pl-set" id="plSet"><h2 class="pl-h">' + esc(S('Places')) + '</h2>';
    if (!list.length) h += '<p class="pl-none">' + esc(S('No robot connected.')) + '</p>';
    else {
      h += '<div class="pl-roles">' + list.map(function (p, i) {
        var r = role(p);
        return '<div class="pl-role"><span class="pl-name">' + esc(p) + '</span><div class="pl-seg" role="radiogroup" aria-label="' + esc(p) + '">' +
          ['base', 'room', 'other'].map(function (k) {
            return '<label><input type="radio" name="plr' + i + '" data-pl-role="' + k + '" data-pl-place="' + esc(p) + '"' + (r === k ? ' checked' : '') + '><span>' + esc(S({ base: 'Base', room: 'Room', other: 'Other place' }[k])) + '</span></label>';
          }).join('') + '</div></div>';
      }).join('') + '</div>';
    }
    return h + '<div class="pl-setbar"><button type="button" class="ghost" data-pl="open-test">' + esc(S('Navigation test')) + '</button></div></section>';
  }
  function repaintSettings() { var el = $('plSet'); if (el) el.outerHTML = settingsHtml(); }

  /* ---------- the Navigation test panel ---------- */
  function stateHtml(st) {
    var conn = st.connected ? S('Connected') : st.connecting ? S('Connecting…') : S('Not connected'), rows = [];
    function row(k, v, cls) { rows.push('<div class="pl-kv' + (cls ? ' ' + cls : '') + '"><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>'); }
    row(S('Connection'), conn, st.connected ? 'pl-ok' : 'pl-bad');
    row(S('Localized'), st.localized ? S('Yes') : S('No'), st.localized ? 'pl-ok' : 'pl-bad');
    if (typeof st.battery === 'number' && st.battery >= 0) row(S('Battery'), st.battery + ' %' + (st.charging ? ' · ' + S('charging') : ''));
    if (st.pose && typeof st.pose.x === 'number') row(S('Pose'), 'x ' + st.pose.x.toFixed(2) + ' · y ' + st.pose.y.toFixed(2) + (typeof st.pose.theta === 'number' ? ' · ' + Math.round(st.pose.theta * 180 / Math.PI) + '°' : ''));
    if (st.mapName) row(S('Map'), st.mapName);
    row(S('Base'), base());
    if (st.lastError) row(S('Last error'), st.lastError);
    return (st.estop ? '<p class="pl-estop">' + esc(S('Emergency stop pressed.')) + '</p>' : '') + '<dl class="pl-state">' + rows.join('') + '</dl>';
  }
  function liveHtml(n, st) {
    n = n || {};
    var p = n.place || '', w, cls = 'pl-live';
    if (n.state === 'moving') { w = S('Moving to {place}', { place: p }); cls += ' pl-moving'; }
    else if (n.state === 'arrived') { w = S('Arrived at {place}', { place: p }); cls += ' pl-arrived'; }
    else if (n.state === 'failed') { w = S('Failed: {place}', { place: p }); cls += ' pl-failed'; }
    else w = n.reason === 'stopped' ? S('Stopped') : S('Idle');
    var bits = [];
    if (n.state === 'moving' || n.state === 'failed' || n.state === 'arrived') {
      if (n.attempt > 1) bits.push(S('try {n}', { n: n.attempt }));
      if (typeof n.waitedS === 'number' && n.waitedS > 0) bits.push(durText(n.waitedS));
    }
    var c = codeOf(n), m = n.state === 'idle' && n.reason !== 'stopped' ? '' : meaning(c, n.reason, n.codeText);
    var reloc = st && st.reloc && st.reloc.state && st.reloc.state !== 'idle' && (st.reloc.state === 'running' || !st.reloc.at || Date.now() - st.reloc.at < 120000) ? (st.reloc.state === 'running' ? S('Relocalizing…') : st.reloc.state === 'ok' ? S('Relocalized.') : S('Relocalization failed.')) : '';
    return '<div class="' + cls + '" role="status" aria-live="polite"><b>' + esc(w) + '</b>' + (bits.length ? '<span> · ' + esc(bits.join(' · ')) + '</span>' : '') +
      (c || m ? '<p class="pl-code">' + (c ? '<b>' + esc(c) + '</b> ' : '') + esc(m) + '</p>' : '') + (reloc ? '<p class="pl-reloc">' + esc(reloc) + '</p>' : '') + '</div>';
  }
  function listHtml(moving) {
    var list = all();
    if (!list.length) return '<p class="pl-none">' + esc(S('No robot connected.')) + '</p>';
    return list.map(function (p) {
      var r = role(p);
      return '<div class="pl-place"><span class="pl-name">' + esc(p) + '</span><span class="pl-tag pl-tag-' + r + '">' + esc(S({ base: 'Base', room: 'Room', other: 'Other place' }[r])) + '</span>' +
        '<button type="button" class="ghost" data-pl="go" data-pl-place="' + esc(p) + '"' + (moving ? ' disabled' : '') + '>' + esc(S('Go')) + '</button></div>';
    }).join('');
  }
  function logHtml() {
    var l = navLog();
    if (!l.length) return '<p class="pl-none">' + esc(S('No attempt yet.')) + '</p>';
    return '<table><thead><tr><th>' + esc(S('Time')) + '</th><th>' + esc(S('Target')) + '</th><th>' + esc(S('Result')) + '</th><th>' + esc(S('Duration')) + '</th><th>' + esc(S('Code')) + '</th><th>' + esc(S('Meaning')) + '</th></tr></thead><tbody>' +
      l.map(function (e) {
        return '<tr class="pl-r-' + esc(e.result) + '"><td>' + esc(hms(e.at)) + '</td><td>' + esc(e.place) + '</td><td>' + esc(resultWord(e.result)) + (e.tries > 1 ? ' <small>' + esc(S('try {n}', { n: e.tries })) + '</small>' : '') + '</td>' +
          '<td>' + esc(durText(e.dur)) + '</td><td>' + esc(e.code || '–') + '</td><td>' + esc(meaning(e.code, e.reason, e.text) || e.text || '') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function panelHtml() {
    var st = bell('robotState') || {}, n = bell('robotNav') || st.nav || {}, moving = n.state === 'moving';
    return '<div class="st-wrap pl-wrap"><header class="st-head pl-head"><button type="button" class="st-back" data-pl="close" aria-label="' + esc(S('Back')) + '">‹</button>' +
      '<h1>' + esc(S('Navigation test')) + '</h1><button type="button" class="pl-stop" data-pl="stop">' + esc(S('STOP')) + '</button></header>' +
      '<div class="pl-grid"><div class="pl-col"><div id="plState">' + stateHtml(st) + '</div><div id="plLive">' + liveHtml(n, st) + '</div>' +
      '<div class="pl-acts"><button type="button" class="go" data-pl="base"' + (moving ? ' disabled' : '') + '>' + esc(S('Back to base')) + ' · ' + esc(base()) + '</button>' +
      (has('robotRelocalize') ? '<button type="button" class="ghost" data-pl="reloc"' + (moving ? ' disabled' : '') + '>' + esc(S('Relocalize at the charging pile')) + '</button>' : '') + '</div></div>' +
      '<div class="pl-col"><h2 class="pl-h">' + esc(S('Places')) + '</h2><div class="pl-list" id="plList">' + listHtml(moving) + '</div></div></div>' +
      '<div class="pl-logbar"><h2 class="pl-h">' + esc(S('Last attempts')) + '</h2><button type="button" class="ghost" data-pl="copy">' + esc(S('Copy')) + '</button></div>' +
      '<div class="st-jtable pl-log" id="plLog">' + logHtml() + '</div></div>';
  }
  function renderPanel() {
    var el = typeof document !== 'undefined' && document.getElementById ? $('plPanel') : null;
    if (!el || el.hidden) return;
    var st = bell('robotState') || {}, n = bell('robotNav') || st.nav || {}, moving = n.state === 'moving';
    var sig = all().join('|') + '#' + moving + '#' + has('robotRelocalize') + '#' + base();
    if (sig !== panelSig || !$('plState')) { panelSig = sig; el.innerHTML = panelHtml(); return; }
    $('plState').innerHTML = stateHtml(st); $('plLive').innerHTML = liveHtml(n, st); $('plLog').innerHTML = logHtml();
  }
  function openTest() {
    var el = $('plPanel');
    if (!el) {
      el = document.createElement('div');
      el.id = 'plPanel'; el.className = 'st-sheet pl-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
      document.body.appendChild(el);
    }
    el.hidden = false; panelSig = '';
    document.body.classList.add('st-noscroll');
    tick(); renderPanel();
    clearInterval(panelT); panelT = setInterval(function () { tick(); renderPanel(); }, 1000);
    el.scrollTop = 0;
  }
  function closeTest() {
    var el = $('plPanel');
    if (el) el.hidden = true;
    clearInterval(panelT); panelT = 0;
    if (!$('stSheet') || $('stSheet').hidden) document.body.classList.remove('st-noscroll');
  }

  /* ---------- events: one listener for the settings block and the panel ---------- */
  function onClick(e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-pl]') : null;
    if (!b || b.disabled) return;
    var a = b.getAttribute('data-pl');
    if (a === 'open-test') openTest();
    else if (a === 'close') closeTest();
    else if (a === 'stop') stop();
    else if (a === 'go') go(b.getAttribute('data-pl-place'));
    else if (a === 'base') go(base());
    else if (a === 'reloc') relocalize();
    else if (a === 'copy') copy();
  }
  function onChange(e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    /* the resident changed on the Activities tab: the Position list shows their room at once */
    if (t.id === 'fParticipant' && window.LinkStaff && LinkStaff._fillPos) { setTimeout(function () { LinkStaff._fillPos(); }, 0); return; }
    /* a room chosen at the start for a resident who has none yet: kept as their room (asked once, as the family visit does) */
    if (t.id === 'lkPos' && t.tagName === 'SELECT') {
      var who = window.Lab && Lab.patient ? String(Lab.patient) : '';
      if (who && t.value && !rawRoom(who) && rooms().indexOf(t.value) >= 0) setRoom(who, t.value);
      return;
    }
    if (!t.getAttribute('data-pl-role')) return;
    if (setRole(t.getAttribute('data-pl-place'), t.getAttribute('data-pl-role'))) toast(S('Saved.'));
    repaintSettings();
  }
  function boot() {
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    /* the drives are logged even while the panel is closed (an activity's trip, the return to base) */
    if (has('robotNav')) { tick(); tickT = setInterval(tick, 1000); }
  }
  if (typeof document !== 'undefined' && document.addEventListener && !window.__placesTest) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  }

  return {
    configured: configured, all: all, rooms: rooms, base: base, role: role, roomOf: roomOf, setRoom: setRoom, setRole: setRole, label: label,
    pickerHtml: pickerHtml, strict: strict, canStart: canStart, meaning: meaning, navLog: navLog, openTest: openTest, closeTest: closeTest,
    settingsHtml: settingsHtml,
    _tick: tick, _go: go, _stop: stop, _relocalize: relocalize, _panelHtml: panelHtml, _logText: logText, _codeOf: codeOf, _boot: boot, _onChange: onChange
  };
})();
