/* Family portal 1.16 (agent N2): calls and notifications (BF-17, BF-19, BF-25).
   - A tab "Calls" (Portail.addTab, js/portail.js): the invitation of the moment with a big "Join"
     button (famille.html#j=…, the existing call page), "Ask for a call" (when: as soon as possible,
     today, tomorrow; a short note for the care team), the state of the request, the last calls.
   - A bell at the top of every screen: the in-app notification centre (works everywhere, polled
     every 30 s), with the number of unread notices.
   - When an invitation arrives while the portal is open: a large card "Mamie is waiting… Join".
   - Notifications on the phone (Web Push, sw-portail.js): asked gently, only when it makes sense
     (after a call request, in the bell, in the Calls tab), never at the first visit; explained in
     one line; the browser's own question only comes after the person tapped "Turn on".
   - The reminder (14 Nov): "You have not talked with Marie for 7 days" as a banner at the top of the portal
     (and a notification on the phone), with "Now" (the Calls screen) and "Plan a date" (a day and a time,
     saved as a planned call the care team sees). portail.html#remind=<resident>&a=now|plan opens it.
   Without the tab registry (an older portail.js) the same Calls screen opens from the bell.
   The server: labland/family-calls (family-callreq.mjs) and family-notify.mjs. Look: css/portail-calls.css,
   loaded by this file. Texts: English keys, French and German below. ES5. */
(function () {
  'use strict';
  if (typeof I18N === 'undefined') return;

  /* ---------- texts ---------- */
  (function () {
    function addNew(l, t) { var have = I18N.dict[l] || {}, out = {}; Object.keys(t).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(have, k)) out[k] = t[k]; }); I18N.add(l, out); }
    /* Calls 2.0 (24 Nov) */
    addNew('fr', { 'When would you like to call?': 'Quand voulez-vous appeler ?', 'Choose a precise date': 'Choisir une date précise', 'Coming up': 'À venir', 'Call back': 'Rappeler', 'Video calls with {name}': 'Appels vidéo avec {name}', 'Which day?': 'Quel jour ?', 'At what time?': 'À quelle heure ?', 'Suggest {day} at {time}': 'Proposer {day} à {time}', 'The care team confirms the time.': 'L’équipe soignante confirme l’heure.', 'No call yet.': 'Pas encore d’appel.', 'Today': 'Aujourd’hui' });
    addNew('de', { 'When would you like to call?': 'Wann möchten Sie anrufen?', 'Choose a precise date': 'Ein genaues Datum wählen', 'Coming up': 'Demnächst', 'Call back': 'Zurückrufen', 'Video calls with {name}': 'Videoanrufe mit {name}', 'Which day?': 'Welcher Tag?', 'At what time?': 'Um wie viel Uhr?', 'Suggest {day} at {time}': '{day} um {time} vorschlagen', 'The care team confirms the time.': 'Das Pflegeteam bestätigt die Uhrzeit.', 'No call yet.': 'Noch kein Anruf.', 'Today': 'Heute' });
    addNew('fr', {
      'Notifications on this phone': 'Notifications sur ce téléphone', 'On': 'Activées', 'Off': 'Désactivées',
      'Blocked by the browser: allow them in its settings.': 'Bloquées par le navigateur : autorisez-les dans ses réglages.',
      'iPhone: first install the app on the Home Screen (iOS 16.4 or later).': 'iPhone : installez d’abord l’application sur l’écran d’accueil (iOS 16.4 ou plus récent).',
      'Not possible in this browser.': 'Pas possible dans ce navigateur.', 'Install the app': 'Installer l’application',
      'Bellatrix is on the way to {name}…': 'Bellatrix va voir {name}…', 'On the way': 'En route',
      'You will get the invitation as soon as everything is ready.': 'Vous recevrez l’invitation dès que tout est prêt.',
      'Calls': 'Appels', 'OR': 'OU', 'Notifications': 'Notifications', 'Call {name}': 'Appeler {name}',
      'Bellatrix · {name} is calling you': 'Bellatrix · {name} vous appelle', 'On another device': 'Sur un autre appareil', 'Video call · until {time}': 'Appel vidéo · jusqu’à {time}',
      'Join the call': 'Rejoindre l’appel', 'Later': 'Plus tard', 'Ask for a call': 'Demander un appel',
      'When?': 'Quand ?', 'As soon as possible': 'Dès que possible', 'Today': 'Aujourd’hui', 'Tomorrow': 'Demain',
      'A word for the care team (optional)': 'Un mot pour l’équipe (facultatif)', 'e.g. free after 6 pm': 'ex. libre après 18 h',
      'The care team sends you an invitation when {name} is ready.': 'L’équipe vous envoie une invitation quand {name} est disponible.',
      'Request sent': 'Demande envoyée', 'A little later': 'Un peu plus tard', 'Invitation sent': 'Invitation envoyée',
      'The care team will send you an invitation.': 'L’équipe va vous envoyer une invitation.',
      'The care team will get back to you soon.': 'L’équipe revient vers vous bientôt.',
      'Cancel the request': 'Annuler la demande', 'Request cancelled.': 'Demande annulée.',
      'Last calls': 'Derniers appels', 'Missed call': 'Appel manqué', 'Call taken': 'Appel pris', 'Call cancelled': 'Appel annulé',
      'No notification yet.': 'Aucune notification pour l’instant.', 'Mark all as read': 'Tout marquer comme lu', 'Close': 'Fermer',
      'Be told on this phone?': 'Être prévenu sur ce téléphone ?',
      'Messages read, calls, requests from the care team.': 'Messages lus, appels, demandes de l’équipe.',
      'Turn on': 'Activer', 'Not now': 'Plus tard',
      'Notifications are on for this phone.': 'Notifications activées sur ce téléphone.', 'Send a test': 'Envoyer un test', 'Turn off': 'Désactiver',
      'Notifications blocked. Allow them in the browser settings.': 'Notifications bloquées. Autorisez-les dans les réglages du navigateur.',
      'Add to the Home Screen to receive notifications.': 'Ajouter à l’écran d’accueil pour recevoir les notifications.', 'Share › Add to Home Screen': 'Partager › Sur l’écran d’accueil',
      'No notifications in this browser: everything stays in the bell.': 'Pas de notifications dans ce navigateur : tout reste dans la cloche.',
      'Notifications need the https address.': 'Les notifications demandent l’adresse https.',
      'Notifications could not be turned on: everything stays in the bell.': 'Les notifications n’ont pas pu être activées : tout reste dans la cloche.',
      'Notifications are off for this phone.': 'Notifications désactivées sur ce téléphone.', 'Test sent.': 'Test envoyé.',
      'To be told when the invitation comes:': 'Pour être prévenu de l’invitation :', 'Turn notifications on': 'Activer les notifications',
      'Your request has arrived.': 'Votre demande est arrivée.', 'just now': 'à l’instant', '{n} min ago': 'il y a {n} min',
      'Unread': 'Non lu', 'This invitation has ended.': 'Cette invitation est terminée.',
      'That is plenty for today. You can ask again tomorrow.': 'C’est assez pour aujourd’hui. Vous pourrez redemander demain.',
      'You have not talked with {name} for {span}.': 'Vous n’avez pas parlé avec {name} depuis {span}.', '1 day': '1 jour', '{n} days': '{n} jours',
      'Now': 'Maintenant', 'Plan a date': 'Planifier une date', 'Plan a call with {name}': 'Planifier un appel avec {name}', 'Day': 'Jour', 'At what time': 'Heure',
      'Save the date': 'Enregistrer la date', 'Call planned': 'Appel prévu', 'The care team sees your date.': 'L’équipe voit votre date.', 'Change the date': 'Changer la date',
      'Planned call saved.': 'Appel prévu enregistré.', 'Please choose a day and a time to come.': 'Choisissez un jour et une heure à venir.',
      'Bellatrix video call': 'Appel vidéo Bellatrix', 'is calling': 'vous appelle', 'Answer': 'Répondre', 'Decline': 'Refuser', 'Call declined.': 'Appel refusé.',
      'Calls ring on this phone when notifications are on. On an iPhone only with the app on the Home Screen (iOS 16.4 or later); otherwise it rings while the portal is open.':
        'Les appels sonnent sur ce téléphone quand les notifications sont activées. Sur iPhone, seulement avec l’application sur l’écran d’accueil (iOS 16.4 ou plus récent) ; sinon, ça sonne quand le portail est ouvert.'
    });
    addNew('de', {
      'Notifications on this phone': 'Benachrichtigungen auf diesem Telefon', 'On': 'An', 'Off': 'Aus',
      'Blocked by the browser: allow them in its settings.': 'Vom Browser blockiert: erlauben Sie sie in seinen Einstellungen.',
      'iPhone: first install the app on the Home Screen (iOS 16.4 or later).': 'iPhone: zuerst die App auf den Home-Bildschirm legen (iOS 16.4 oder neuer).',
      'Not possible in this browser.': 'In diesem Browser nicht möglich.', 'Install the app': 'App installieren',
      'Bellatrix is on the way to {name}…': 'Bellatrix ist auf dem Weg zu {name} …', 'On the way': 'Unterwegs',
      'You will get the invitation as soon as everything is ready.': 'Sie bekommen die Einladung, sobald alles bereit ist.',
      'Calls': 'Anrufe', 'OR': 'ODER', 'Notifications': 'Benachrichtigungen', 'Call {name}': '{name} anrufen',
      'Bellatrix · {name} is calling you': 'Bellatrix · {name} ruft Sie an', 'On another device': 'Auf einem anderen Gerät', 'Video call · until {time}': 'Videoanruf · bis {time}',
      'Join the call': 'Anruf beitreten', 'Later': 'Später', 'Ask for a call': 'Um einen Anruf bitten',
      'When?': 'Wann?', 'As soon as possible': 'So bald wie möglich', 'Today': 'Heute', 'Tomorrow': 'Morgen',
      'A word for the care team (optional)': 'Ein Wort für das Pflegeteam (optional)', 'e.g. free after 6 pm': 'z. B. frei ab 18 Uhr',
      'The care team sends you an invitation when {name} is ready.': 'Das Pflegeteam schickt Ihnen eine Einladung, wenn {name} bereit ist.',
      'Request sent': 'Anfrage gesendet', 'A little later': 'Etwas später', 'Invitation sent': 'Einladung gesendet',
      'The care team will send you an invitation.': 'Das Pflegeteam schickt Ihnen eine Einladung.',
      'The care team will get back to you soon.': 'Das Pflegeteam meldet sich bald.',
      'Cancel the request': 'Anfrage zurückziehen', 'Request cancelled.': 'Anfrage zurückgezogen.',
      'Last calls': 'Letzte Anrufe', 'Missed call': 'Verpasster Anruf', 'Call taken': 'Anruf angenommen', 'Call cancelled': 'Anruf abgesagt',
      'No notification yet.': 'Noch keine Benachrichtigung.', 'Mark all as read': 'Alle als gelesen markieren', 'Close': 'Schließen',
      'Be told on this phone?': 'Auf diesem Telefon benachrichtigt werden?',
      'Messages read, calls, requests from the care team.': 'Gelesene Nachrichten, Anrufe, Anfragen des Pflegeteams.',
      'Turn on': 'Einschalten', 'Not now': 'Nicht jetzt',
      'Notifications are on for this phone.': 'Benachrichtigungen sind auf diesem Telefon an.', 'Send a test': 'Test senden', 'Turn off': 'Ausschalten',
      'Notifications blocked. Allow them in the browser settings.': 'Benachrichtigungen blockiert. Erlauben Sie sie in den Browser-Einstellungen.',
      'Add to the Home Screen to receive notifications.': 'Zum Home-Bildschirm hinzufügen, um Benachrichtigungen zu erhalten.', 'Share › Add to Home Screen': 'Teilen › Zum Home-Bildschirm',
      'No notifications in this browser: everything stays in the bell.': 'Keine Benachrichtigungen in diesem Browser: alles bleibt bei der Glocke.',
      'Notifications need the https address.': 'Benachrichtigungen brauchen die https-Adresse.',
      'Notifications could not be turned on: everything stays in the bell.': 'Benachrichtigungen konnten nicht eingeschaltet werden: alles bleibt bei der Glocke.',
      'Notifications are off for this phone.': 'Benachrichtigungen sind auf diesem Telefon aus.', 'Test sent.': 'Test gesendet.',
      'To be told when the invitation comes:': 'Um bei der Einladung benachrichtigt zu werden:', 'Turn notifications on': 'Benachrichtigungen einschalten',
      'Your request has arrived.': 'Ihre Anfrage ist angekommen.', 'just now': 'gerade eben', '{n} min ago': 'vor {n} Min.',
      'Unread': 'Ungelesen', 'This invitation has ended.': 'Diese Einladung ist beendet.',
      'That is plenty for today. You can ask again tomorrow.': 'Das reicht für heute. Sie können morgen wieder fragen.',
      'You have not talked with {name} for {span}.': 'Sie haben seit {span} nicht mit {name} gesprochen.', '1 day': '1 Tag', '{n} days': '{n} Tagen',
      'Now': 'Jetzt', 'Plan a date': 'Termin planen', 'Plan a call with {name}': 'Anruf mit {name} planen', 'Day': 'Tag', 'At what time': 'Uhrzeit',
      'Save the date': 'Termin speichern', 'Call planned': 'Anruf geplant', 'The care team sees your date.': 'Das Pflegeteam sieht Ihren Termin.', 'Change the date': 'Termin ändern',
      'Planned call saved.': 'Geplanter Anruf gespeichert.', 'Please choose a day and a time to come.': 'Bitte wählen Sie einen Tag und eine Uhrzeit in der Zukunft.',
      'Bellatrix video call': 'Videoanruf über Bellatrix', 'is calling': 'ruft an', 'Answer': 'Annehmen', 'Decline': 'Ablehnen', 'Call declined.': 'Anruf abgelehnt.',
      'Calls ring on this phone when notifications are on. On an iPhone only with the app on the Home Screen (iOS 16.4 or later); otherwise it rings while the portal is open.':
        'Anrufe klingeln auf diesem Telefon, wenn Benachrichtigungen an sind. Auf dem iPhone nur mit der App auf dem Home-Bildschirm (iOS 16.4 oder neuer); sonst klingelt es, solange das Portal offen ist.'
    });
  })();

  var LOCALE = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE' };
  var TOKEN = 'bellatrix-portail-token', LANGKEY = 'bellatrix-portail-lang', LATER = 'bellatrix-portail-push-later', DISMISSED = 'bellatrix-portail-invite-seen';
  var S = { lang: 'fr', rid: '', label: '', calls: null, notes: null, sheet: false, panel: false, el: null, when: 'soon', busy: false, push: '', justAsked: false, overlay: null, timer: null, fast: null, plan: false, planDay: '', planTime: '15:00', pending: null };
  var ICON = {
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.6 2H4.4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 21.2a2.2 2.2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    call: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5 9.4 6.3a1.4 1.4 0 0 1 0 2L8 9.7a12 12 0 0 0 6.3 6.3l1.4-1.4a1.4 1.4 0 0 1 2 0l2.8 2.8a1.4 1.4 0 0 1 0 2L19 20.9c-1 1-2.6 1.2-3.9.6A19 19 0 0 1 2.5 8.9c-.6-1.3-.4-2.9.6-3.9l1.5-1.5a1.4 1.4 0 0 1 2 0z" fill="currentColor"/></svg>',
    video: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="13" height="12" rx="3" fill="currentColor"/><path d="M16.5 10.5 L21.5 7.5 V16.5 L16.5 13.5 Z" fill="currentColor"/></svg>',
    missed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l6 6 4-4 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 16h4v-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    msg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5 h16 v11 h-9 l-5 4 v-4 h-2 z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    crown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17 3 7l5 4 4-6 4 6 5-4-1 10z" fill="currentColor"/></svg>',
    belloff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.6 2H4.4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 21.2a2.2 2.2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3.5 3.5 20.5 20.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
  };

  /* ---------- helpers ---------- */
  function T(s, v) { return I18N.t(S.lang, s, v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function put(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* this visit only */ } }
  function token() { return get(TOKEN); }
  function curLang() { return I18N.valid(get(LANGKEY) || document.documentElement.lang || 'fr'); }
  function who() { return S.label || T('your loved one'); }
  function hhmm(iso) { var t = Date.parse(iso); if (!isFinite(t)) return ''; try { return new Date(t).toLocaleTimeString(LOCALE[S.lang], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return new Date(t).toTimeString().slice(0, 5); } }
  function when(iso) {
    var t = Date.parse(iso), m = Math.round((Date.now() - t) / 60000);
    if (!isFinite(t)) return '';
    if (m < 1) return T('just now');
    if (m < 60) return T('{n} min ago', { n: m });
    var d = new Date(t), today = new Date();
    try { return d.toDateString() === today.toDateString() ? hhmm(iso) : d.toLocaleString(LOCALE[S.lang], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return d.toISOString().slice(0, 16).replace('T', ' '); }
  }
  function toast(text) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = text; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 3200);
  }
  /* The portal's own Portail.api (its session, the chosen resident, sign-out on 401), else the same by hand. */
  function api(method, path, body) {
    var P = window.Portail;
    if (P && typeof P.api === 'function') return Promise.resolve(P.api(path, body !== undefined ? { method: method, body: body } : { method: method }));
    var h = {}, tk = token(), rid = S.rid || get('bellatrix-portail-resident');
    if (!tk) return Promise.reject(Object.assign(new Error('signed-out'), { code: 'signed-out' }));
    h.Authorization = 'Bearer ' + tk;
    if (rid) h['X-Resident'] = rid;
    var o = { method: method, headers: h, cache: 'no-store' };
    if (body !== undefined) { h['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return fetch('portal/api/' + path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'http-' + r.status); e.code = j.error || ''; e.status = r.status; throw e; } return j; });
    });
  }
  function signedIn() {
    var P = window.Portail;
    if (P && P.state) return !!P.state.token && P.state.screen === 'home' && !!P.state.me && !!P.state.me.resident;
    return !!token() && !!document.querySelector('#app .top') && !document.querySelector('#app [data-do="to-signin"], #app #invCode, #app #sinEmail, #app #sinCode, #app #regName, #app #firstConsent');
  }
  /* The chosen resident (the portal may link one relative to several residents). */
  function syncResident() {
    var P = window.Portail, c = null;
    try { c = P && P.ctx ? P.ctx() : null; } catch (e) { c = null; }
    var r = c && c.resident;
    if (r && (r.rid || r.id)) {
      if ((r.rid || r.id) !== S.rid) { S.rid = r.rid || r.id; S.calls = null; S.justAsked = false; }
      if (r.label) S.label = r.label;
    }
    if (c && c.lang) S.lang = I18N.valid(c.lang);
  }
  function css() {
    if (document.getElementById('pc-css')) return;
    var l = document.createElement('link'), me = document.querySelector('script[src*="portail-calls.js"]'), v = me ? (/\?v=([^&]+)/.exec(me.getAttribute('src')) || [])[1] : '';
    l.id = 'pc-css'; l.rel = 'stylesheet'; l.href = 'css/portail-calls.css' + (v ? '?v=' + v : '');
    document.head.appendChild(l);
  }
  function joinUrl(tk, go) { var u = 'famille.html#j=' + tk + (go ? '&go=1' : ''); try { return new URL(u, location.href).href; } catch (e) { return u; } }
  /* From the tap itself (Safari wants a tap before a call page may use sound). A new tab; where the
     browser does not give one (an iPhone web app may not), the call page opens here. ('noopener' would
     make window.open return null even when it worked: the opener is cut by hand instead.) */
  function join(tk, go) {
    var url = joinUrl(tk, go), w = null;
    try { w = window.open(url, '_blank'); } catch (e) { w = null; }
    if (w) { try { w.opener = null; } catch (e) { /* fine */ } } else location.assign(url);
  }
  function quote(text) { var q = { en: ['“', '”'], fr: ['« ', ' »'], de: ['„', '“'] }[S.lang] || ['“', '”']; return q[0] + text + q[1]; }

  /* ---------- Web Push on this phone ---------- */
  function isIos() { return /iPhone|iPad|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  /* 'on' | 'off' (allowed, not subscribed) | 'ask' | 'denied' | 'ios' | 'insecure' | 'none' */
  function pushSupport() {
    if (!window.isSecureContext) return 'insecure';
    if (isIos() && !standalone()) return 'ios';
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'none';
    if (Notification.permission === 'denied') return 'denied';
    if (Notification.permission === 'default') return 'ask';
    return 'off';
  }
  function b64ToBytes(s) {
    var b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), out = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  }
  function bytesTo64(buf) { var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function registration() {
    return new Promise(function (ok, no) {
      var done = false, t = setTimeout(function () { if (!done) no(new Error('no-sw')); }, 8000);
      navigator.serviceWorker.getRegistration('portail.html').then(function (r) {
        return r || navigator.serviceWorker.register('sw-portail.js', { scope: 'portail.html' });
      }).then(function () { return navigator.serviceWorker.ready; }).then(function (r) { done = true; clearTimeout(t); ok(r); }, function (e) { done = true; clearTimeout(t); no(e); });
    });
  }
  /* Subscribes (or renews) this phone and gives the subscription to the server. */
  function subscribe() {
    var reg = null;
    return registration().then(function (r) { reg = r; return api('GET', 'family/notify/key'); }).then(function (k) {
      return reg.pushManager.getSubscription().then(function (old) {
        var key = old && old.options && old.options.applicationServerKey ? bytesTo64(old.options.applicationServerKey) : '';
        /* Same server key (or a browser that does not tell it): the phone keeps its subscription. */
        if (old && (key === k.key || !key)) return old;
        return (old ? old.unsubscribe().catch(function () {}) : Promise.resolve()).then(function () {
          return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(k.key) });
        });
      });
    }).then(function (sub) {
      return api('POST', 'family/notify/subscribe', { subscription: JSON.parse(JSON.stringify(sub)), lang: S.lang });
    }).then(function () { S.push = 'on'; return 'on'; });
  }
  function turnOn() {
    var s = pushSupport();
    if (s !== 'ask' && s !== 'off') { S.push = s; paintAll(); return Promise.resolve(s); }
    S.busy = true; paintAll();
    var ask = Notification.permission === 'granted' ? Promise.resolve('granted') : new Promise(function (ok) {
      var p = Notification.requestPermission(ok);
      if (p && p.then) p.then(ok);
    });
    return ask.then(function (perm) {
      if (perm !== 'granted') { S.push = perm === 'denied' ? 'denied' : 'ask'; return S.push; }
      return subscribe();
    }).catch(function () { S.push = 'failed'; return 'failed'; }).then(function (r) {
      S.busy = false; put(LATER, '');
      if (r === 'on') toast(T('Notifications are on for this phone.'));
      paintAll(); loadNotes();
      return r;
    });
  }
  function turnOff() {
    registration().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (!sub) return null;
      var ep = sub.endpoint;
      return sub.unsubscribe().catch(function () {}).then(function () { return api('POST', 'family/notify/unsubscribe', { endpoint: ep }); });
    }).catch(function () { /* already off */ }).then(function () { S.push = 'off'; toast(T('Notifications are off for this phone.')); paintAll(); });
  }
  /* At start: an existing permission is renewed quietly (same phone, maybe a new language or key). */
  function syncPush() {
    var s = pushSupport();
    if (s !== 'off') { S.push = s; return; }
    registration().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      S.push = sub ? 'on' : 'off';
      if (Notification.permission === 'granted') return subscribe();
    }).catch(function () { S.push = S.push || 'off'; }).then(paintAll);
  }
  function pushCard(context) {
    var s = S.push || pushSupport(), h = '';
    if (s === 'on') {
      return '<div class="pc-push on"><p>' + ICON.ok + '<span>' + esc(T('Notifications are on for this phone.')) + '</span></p>' +
        '<div class="pc-row"><button type="button" class="link small" data-pc="test">' + esc(T('Send a test')) + '</button><button type="button" class="link small" data-pc="off">' + esc(T('Turn off')) + '</button></div></div>';
    }
    if (s === 'ask' || s === 'off' || s === 'failed') {
      if (context === 'after' ) return '<div class="pc-push ask"><p class="fine">' + esc(T('To be told when the invitation comes:')) + '</p>' +
        '<button type="button" class="btn" data-pc="on"' + (S.busy ? ' disabled' : '') + '>' + ICON.bell + '<span>' + esc(T('Turn notifications on')) + '</span></button></div>';
      h = '<div class="pc-push ask"><div class="pc-pushhead"><span class="pc-ico">' + ICON.bell + '</span><div><b>' + esc(T('Be told on this phone?')) + '</b>' +
        '<p class="fine">' + esc(T('Messages read, calls, requests from the care team.')) + '</p></div></div>' +
        (s === 'failed' ? '<p class="fine pc-warn">' + esc(T('Notifications could not be turned on: everything stays in the bell.')) + '</p>' : '') +
        '<div class="pc-two"><button type="button" class="btn primary" data-pc="on"' + (S.busy ? ' disabled' : '') + '>' + esc(T('Turn on')) + '</button>' +
        (context === 'sheet' ? '<button type="button" class="btn ghost" data-pc="later">' + esc(T('Not now')) + '</button>' : '') + '</div></div>';
      return h;
    }
    /* iPhone (iOS 16.4 and later): Web Push only for the app added to the Home Screen. */
    if (s === 'ios') return '<div class="pc-push info"><div class="pc-pushhead"><span class="pc-ico">' + ICON.bell + '</span><div><b>' + esc(T('Add to the Home Screen to receive notifications.')) + '</b>' +
      '<p class="fine">' + esc(T('Share › Add to Home Screen')) + '</p></div></div></div>';
    var text = s === 'denied' ? 'Notifications blocked. Allow them in the browser settings.'
      : s === 'insecure' ? 'Notifications need the https address.'
      : 'No notifications in this browser: everything stays in the bell.';
    return context === 'after' ? '' : '<div class="pc-push info"><p class="fine">' + esc(T(text)) + '</p></div>';
  }

  /* 14 Nov (Rahma: "the button for notifications is missing"): the switch for the phone's notifications is
     always the first line of the bell's sheet, with a clear state: on / off / blocked by the browser /
     iPhone: only once the app is on the Home Screen (iOS 16.4 or later). The bell itself is crossed out
     while they are not on. */
  function pushRow() {
    var s = S.push || pushSupport(), st, btn = '';
    if (s === 'on') { st = T('On'); btn = '<button type="button" class="btn sm" data-pc="off">' + esc(T('Turn off')) + '</button>'; }
    else if (s === 'ask' || s === 'off' || s === 'failed') { st = T('Off'); btn = '<button type="button" class="btn sm primary" data-pc="on"' + (S.busy ? ' disabled' : '') + '>' + esc(T('Turn on')) + '</button>'; }
    else if (s === 'denied') st = T('Blocked by the browser: allow them in its settings.');
    else if (s === 'ios') { st = T('iPhone: first install the app on the Home Screen (iOS 16.4 or later).'); btn = '<button type="button" class="btn sm" data-pc="install">' + esc(T('Install the app')) + '</button>'; }
    else if (s === 'insecure') st = T('Notifications need the https address.');
    else st = T('Not possible in this browser.');
    return '<div class="pc-pushrow" data-push="' + esc(s) + '"><span class="pc-ico">' + (s === 'on' ? ICON.bell : ICON.belloff) + '</span>' +
      '<div class="pc-pushtxt"><b>' + esc(T('Notifications on this phone')) + '</b><small>' + esc(st) + '</small></div>' + btn + '</div>';
    /* 24 Nov (Rahma): the long note on how calls ring is gone; the row above already says what to do */
  }
  function pushState() { return S.push || pushSupport(); }

  /* ---------- the server ---------- */
  function loadNotes() {
    if (!signedIn()) return Promise.resolve(null);
    return api('GET', 'family/notify?lang=' + S.lang).then(function (n) {
      var had = S.notes;
      S.notes = n;
      if (n.push && n.push.devices && S.push !== 'on' && pushSupport() === 'off') S.push = 'on';
      paintBell();
      if (S.sheet) paintSheet();
      /* A new invitation while the portal is open: fetch it (its join link comes with the calls). */
      var live = (n.items || []).filter(function (x) { return x.type === 'call_invite' && !x.read && x.until && Date.parse(x.until) > Date.now(); })[0];
      if (live && (!had || !S.calls || !S.calls.invite || S.calls.invite.id !== live.invite)) loadCalls();
      return n;
    }, function () { return null; });
  }
  function loadCalls() {
    if (!signedIn()) return Promise.resolve(null);
    return api('GET', 'family/calls').then(function (c) {
      S.calls = c;
      if (c.label) S.label = c.label;
      paintCalls();
      maybeOverlay();
      paintRemind();
      return c;
    }, function () { return null; });
  }
  function tick() {
    if (document.visibilityState === 'hidden' || !signedIn()) return;
    loadNotes();
    if (S.el && S.el.isConnected || S.panel || (S.calls && (S.calls.invite || S.calls.request))) loadCalls();
  }
  function startPolling() {
    clearInterval(S.timer);
    S.timer = setInterval(tick, 30000);
    clearInterval(S.fast);
    /* While an invitation is live or the Calls screen is open: every 8 s. */
    S.fast = setInterval(function () {
      if (document.visibilityState === 'hidden') return;
      if ((S.el && S.el.isConnected) || S.panel || (S.calls && S.calls.invite)) loadCalls();
    }, 8000);
  }

  /* The QR code of the same link, to open the call on another device (js/qr.js, loaded when first needed). */
  function qrBox(tk) { return '<figure class="pc-qr" data-qr="' + esc(joinUrl(tk)) + '"><figcaption>' + esc(T('On another device')) + '</figcaption></figure>'; }
  function fillQr(root) {
    var boxes = (root || document).querySelectorAll('.pc-qr[data-qr]:not([data-done])');
    if (!boxes.length) return;
    function draw() {
      Array.prototype.forEach.call(boxes, function (b) {
        if (!window.BellatrixQR) return;
        b.setAttribute('data-done', '1');
        var svg = document.createElement('div'); svg.className = 'pc-qrimg'; svg.innerHTML = BellatrixQR.svg(b.getAttribute('data-qr'));
        b.insertBefore(svg, b.firstChild);
      });
    }
    if (window.BellatrixQR) { draw(); return; }
    var sc = document.createElement('script'), me = document.querySelector('script[src*="portail-calls.js"]'), v = me ? (/\?v=([^&]+)/.exec(me.getAttribute('src')) || [])[1] : '';
    sc.src = 'js/qr.js' + (v ? '?v=' + v : ''); sc.onload = draw; document.head.appendChild(sc);
  }

  /* ---------- the Calls screen (the tab, or the panel from the bell) ---------- */
  var WHEN = [['soon', 'As soon as possible'], ['today', 'Today'], ['tomorrow', 'Tomorrow']];
  function callsHtmlOld() {
    var c = S.calls, h = '';
    if (!c) return '<section class="card"><p class="muted">' + esc(T('One moment…')) + '</p></section>';
    if (c.invite) {
      h += '<section class="card pc-invite"><div class="pc-ring" aria-hidden="true">' + ICON.video + '</div>' +
        '<h1>' + esc(T('Bellatrix · {name} is calling you', { name: who() })) + '</h1>' +
        '<p class="fine">' + esc(T('Video call · until {time}', { time: hhmm(c.invite.until) })) + '</p>' +
        '<button type="button" class="btn call" data-pc="join">' + ICON.video + '<span>' + esc(T('Join the call')) + '</span></button>' + qrBox(c.invite.token) + '</section>' +
        '<p class="pc-or" aria-hidden="true"><span>' + esc(T('OR')) + '</span></p>';
    }
    var q = c.request, after = q && q.state !== 'calling' && S.justAsked ? pushCard('after') : '';
    if (S.plan && !(q && q.state === 'calling')) h += planHtml();
    h += '<section class="card pc-ask"><h1>' + esc(T('Call {name}', { name: who() })) + '</h1>';
    /* 14 Nov: the care team sent the robot to the resident ("Go to …" on the robot's head): a calm status
       until the invitation arrives (the tablet starts the call once the robot is there). */
    if (q && q.state !== 'calling' && q.visitAt) {
      h += '<p class="pc-state"><span class="chip s-shown">' + esc(T('On the way')) + '</span> <small class="fine">' + esc(when(q.visitAt)) + '</small></p>' +
        '<p class="pc-visit"><b>' + esc(T('Bellatrix is on the way to {name}…', { name: who() })) + '</b></p>' +
        '<p class="fine">' + esc(T('You will get the invitation as soon as everything is ready.')) + '</p>' + after;
    } else if (q && q.state !== 'calling' && q.when === 'planned' && q.planAt) {
      h += '<p class="pc-state"><span class="chip s-shown">' + esc(T('Call planned')) + '</span></p>' +
        '<p class="pc-planned"><b>' + esc(planText(q.planAt)) + '</b></p><p>' + esc(T('The care team sees your date.')) + '</p>' +
        (q.note ? '<p class="fine">' + esc(quote(q.note)) + '</p>' : '') + after +
        '<div class="pc-row"><button type="button" class="link small" data-pc="plan-open">' + esc(T('Change the date')) + '</button>' +
        '<button type="button" class="link small" data-pc="cancel" data-id="' + esc(q.id) + '">' + esc(T('Cancel the request')) + '</button></div>';
    } else if (q && q.state !== 'calling') {
      var later = q.state === 'later';
      h += '<p class="pc-state"><span class="chip ' + (later ? 's-rec' : 's-shown') + '">' + esc(later ? T('A little later') : T('Request sent')) + '</span> <small class="fine">' + esc(when(q.at)) + '</small></p>' +
        '<p>' + esc(later ? T('The care team will get back to you soon.') : T('The care team will send you an invitation.')) + '</p>' +
        (q.note ? '<p class="fine">' + esc(quote(q.note)) + '</p>' : '') + after +
        '<button type="button" class="link small" data-pc="cancel" data-id="' + esc(q.id) + '">' + esc(T('Cancel the request')) + '</button>';
    } else if (q && q.state === 'calling' && !c.invite) {
      h += '<p class="pc-state"><span class="chip s-ok">' + esc(T('Invitation sent')) + '</span></p>';
    } else if (!q) {
      h += '<p class="muted">' + esc(T('The care team sends you an invitation when {name} is ready.', { name: who() })) + '</p>' +
        '<fieldset class="pc-when"><legend>' + esc(T('When?')) + '</legend><div class="chips" role="radiogroup">' + WHEN.map(function (w) {
          var on = S.when === w[0];
          return '<button type="button" role="radio" aria-checked="' + on + '" class="tchip' + (on ? ' on' : '') + '" data-when="' + w[0] + '">' + esc(T(w[1])) + '</button>';
        }).join('') + '</div></fieldset>' +
        '<label class="field"><span>' + esc(T('A word for the care team (optional)')) + '</span><input id="pcNote" maxlength="120" autocomplete="off" placeholder="' + esc(T('e.g. free after 6 pm')) + '"></label>' +
        '<button type="button" class="btn primary pc-askbtn" data-pc="ask"' + (S.busy ? ' disabled' : '') + '>' + ICON.call + '<span>' + esc(T('Ask for a call')) + '</span></button>' +
        (S.plan ? '' : '<button type="button" class="btn" data-pc="plan-open">' + esc(T('Plan a date')) + '</button>');
    }
    h += '</section>';
    if (c.recent && c.recent.length) {
      h += '<section class="card"><h2>' + esc(T('Last calls')) + '</h2><ul class="pc-recent">' + c.recent.map(function (r) {
        var k = r.state === 'answered' ? ['ok', 'Call taken', ICON.ok] : r.state === 'missed' ? ['miss', 'Missed call', ICON.missed] : ['off', 'Call cancelled', ICON.call];
        return '<li class="' + k[0] + '"><span class="pc-ico">' + k[2] + '</span><b>' + esc(T(k[1])) + '</b><small class="fine">' + esc(when(r.at)) + '</small></li>';
      }).join('') + '</ul></section>';
    }
    /* Once only: not again here when the card just above already asks. */
    if (!after) h += '<section class="card pc-notifcard"><h2>' + esc(T('Notifications')) + '</h2>' + pushCard('tab') + '</section>';
    return h;
  }

  /* ---------- Calls 2.0 (Rahma, review of 24 Nov: "new version") ----------
     One card to ask for a call (when, a word, one big button, a link to a precise date), then "Coming up"
     (the planned call, the robot on its way) and "Last calls" (a missed one can be called back at once).
     The notifications leave this page (Me > Notifications: window.PortailCalls.pushRow / pushCard).
     V2_CALLS = false brings back the screens as they were (callsHtmlOld, planHtmlOld). */
  var V2_CALLS = true;
  function callsHtml() { return V2_CALLS ? callsHtmlV2() : callsHtmlOld(); }
  function planHtml() { return V2_CALLS ? planHtmlV2() : planHtmlOld(); }
  function badge(cls, text) { return '<span class="pc2-badge ' + cls + '">' + esc(text) + '</span>'; }
  function callsHtmlV2() {
    var c = S.calls, h = '';
    if (!c) return '<section class="card"><p class="muted">' + esc(T('One moment…')) + '</p></section>';
    if (c.invite) {
      h += '<section class="card pc-invite"><div class="pc-ring" aria-hidden="true">' + ICON.video + '</div>' +
        '<h1>' + esc(T('Bellatrix · {name} is calling you', { name: who() })) + '</h1>' +
        '<p class="fine">' + esc(T('Video call · until {time}', { time: hhmm(c.invite.until) })) + '</p>' +
        '<button type="button" class="btn call" data-pc="join">' + ICON.video + '<span>' + esc(T('Join the call')) + '</span></button>' + qrBox(c.invite.token) + '</section>';
    }
    var q = c.request;
    if (S.plan && !(q && q.state === 'calling')) return h + planHtml();
    h += '<h1 class="pc2-title">' + esc(T('Video calls with {name}', { name: who() })) + '</h1>';
    if (!q) {
      h += '<section class="pc2-card"><h2>' + esc(T('When would you like to call?')) + '</h2><div class="pc2-chips" role="radiogroup">' + WHEN.map(function (w) {
          var on = S.when === w[0];
          return '<button type="button" role="radio" aria-checked="' + on + '" class="tchip' + (on ? ' on' : '') + '" data-when="' + w[0] + '">' + esc(T(w[1])) + '</button>';
        }).join('') + '</div>' +
        '<label class="field"><span>' + esc(T('A word for the care team (optional)')) + '</span><input id="pcNote" maxlength="120" autocomplete="off" placeholder="' + esc(T('e.g. free after 6 pm')) + '"></label>' +
        '<button type="button" class="btn primary pc2-ask" data-pc="ask"' + (S.busy ? ' disabled' : '') + '>' + ICON.video + '<span>' + esc(T('Ask for a call')) + '</span></button>' +
        '<button type="button" class="link" data-pc="plan-open">' + esc(T('Choose a precise date')) + '</button></section>';
    }
    /* coming up: the request in progress */
    var up = '';
    if (q && q.state !== 'calling' && q.visitAt) up = '<li>' + ICON.call + '<span class="pc2-t"><b>' + esc(T('Bellatrix is on the way to {name}…', { name: who() })) + '</b><small>' + esc(when(q.visitAt)) + '</small></span>' + badge('ok', T('On the way')) + '</li>';
    else if (q && q.state !== 'calling' && q.when === 'planned' && q.planAt) up = '<li>' + ICON.call + '<span class="pc2-t"><b>' + esc(planText(q.planAt)) + '</b><small>' + esc(T('The care team sees your date.')) + '</small>' + (q.note ? '<small>' + esc(quote(q.note)) + '</small>' : '') + '</span>' + badge('wait', T('Call planned')) + '</li>';
    else if (q && q.state !== 'calling') { var later = q.state === 'later'; up = '<li>' + ICON.call + '<span class="pc2-t"><b>' + esc(later ? T('The care team will get back to you soon.') : T('The care team will send you an invitation.')) + '</b><small>' + esc(when(q.at)) + '</small>' + (q.note ? '<small>' + esc(quote(q.note)) + '</small>' : '') + '</span>' + badge(later ? 'wait' : 'ok', later ? T('A little later') : T('Request sent')) + '</li>'; }
    else if (q && q.state === 'calling' && !c.invite) up = '<li>' + ICON.video + '<span class="pc2-t"><b>' + esc(T('Invitation sent')) + '</b></span>' + badge('ok', T('Invitation sent')) + '</li>';
    if (up) {
      h += '<h2 class="pc2-h">' + esc(T('Coming up')) + '</h2><ul class="pc2-list">' + up + '</ul>';
      if (q && q.state !== 'calling') h += '<div class="pc2-row">' + (q.when === 'planned' ? '<button type="button" class="link small" data-pc="plan-open">' + esc(T('Change the date')) + '</button>' : '') +
        '<button type="button" class="link small" data-pc="cancel" data-id="' + esc(q.id) + '">' + esc(T('Cancel the request')) + '</button></div>';
    }
    h += '<h2 class="pc2-h">' + esc(T('Last calls')) + '</h2>';
    if (c.recent && c.recent.length) {
      h += '<ul class="pc2-list">' + c.recent.map(function (r) {
        var k = r.state === 'answered' ? ['ok', 'Call taken', ICON.ok] : r.state === 'missed' ? ['miss', 'Missed call', ICON.missed] : ['off', 'Call cancelled', ICON.call];
        return '<li class="' + k[0] + '">' + k[2] + '<span class="pc2-t"><b>' + esc(T(k[1])) + '</b><small>' + esc(when(r.at)) + '</small></span>' +
          (r.state === 'missed' && !q ? '<button type="button" class="link small" data-pc="recall">' + esc(T('Call back')) + '</button>' : '') + '</li>';
      }).join('') + '</ul>';
    } else h += '<p class="muted">' + esc(T('No call yet.')) + '</p>';
    return h;
  }
  /* a precise date: the next 7 days as cards, the hours as chips, a word for the team, one button */
  var PLAN_TIMES = ['10:00', '11:00', '14:00', '15:00', '16:00', '17:30', '18:30'];
  function planHtmlV2() {
    var today = new Date(), days = [], i, d;
    for (i = 0; i < 7; i++) { d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i); days.push(d); }
    if (!S.planDay) S.planDay = dayValue(days[1]);
    if (!S.planTime) S.planTime = '15:00';
    var loc = LOCALE[S.lang], chosen = days.filter(function (x) { return dayValue(x) === S.planDay; })[0] || days[1];
    var dayName = function (x, o) { try { return x.toLocaleDateString(loc, o); } catch (e) { return dayValue(x); } };
    return '<section class="pc2-card pc2-plan"><h1>' + esc(T('Plan a call with {name}', { name: who() })) + '</h1>' +
      '<h2>' + esc(T('Which day?')) + '</h2><div class="pc2-days" role="radiogroup">' + days.map(function (x, j) {
        var v = dayValue(x), on = v === S.planDay;
        return '<button type="button" role="radio" aria-checked="' + on + '" class="pc2-day' + (on ? ' on' : '') + '" data-pc="pday" data-v="' + v + '">' +
          '<small>' + esc(j === 0 ? T('Today') : dayName(x, { weekday: 'short' })) + '</small><b>' + x.getDate() + '</b></button>';
      }).join('') + '</div>' +
      '<h2>' + esc(T('At what time?')) + '</h2><div class="pc2-chips" role="radiogroup">' + PLAN_TIMES.map(function (t) {
        var on = t === S.planTime;
        return '<button type="button" role="radio" aria-checked="' + on + '" class="tchip' + (on ? ' on' : '') + '" data-pc="ptime" data-v="' + t + '">' + t + '</button>';
      }).join('') + '</div>' +
      '<p class="fine">' + esc(T('The care team confirms the time.')) + '</p>' +
      '<label class="field"><span>' + esc(T('A word for the care team (optional)')) + '</span><input id="pcPlanNote" maxlength="120" autocomplete="off" value="' + esc(S.planNote || '') + '" placeholder="' + esc(T('e.g. free after 6 pm')) + '"></label>' +
      '<button type="button" class="btn primary" data-pc="plan-save"' + (S.busy ? ' disabled' : '') + '>' + esc(T('Suggest {day} at {time}', { day: dayName(chosen, { weekday: 'long', day: 'numeric' }), time: S.planTime })) + '</button>' +
      '<button type="button" class="link" data-pc="plan-close">' + esc(T('Cancel')) + '</button></section>';
  }
  /* ---------- the reminder and the planned call ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dayValue(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function planText(iso) {
    var d = new Date(iso);
    try { return d.toLocaleString(LOCALE[S.lang], { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); } catch (e) { return d.toISOString().slice(0, 16).replace('T', ' '); }
  }
  function planHtmlOld() {
    var today = new Date(), tomorrow = new Date(today.getTime() + 86400000);
    if (!S.planDay) S.planDay = dayValue(tomorrow);
    return '<section class="card pc-plan"><h1>' + esc(T('Plan a call with {name}', { name: who() })) + '</h1>' +
      '<div class="pc-two"><label class="field"><span>' + esc(T('Day')) + '</span><input type="date" id="pcDay" min="' + dayValue(today) + '" value="' + esc(S.planDay) + '"></label>' +
      '<label class="field"><span>' + esc(T('At what time')) + '</span><input type="time" id="pcTime" step="300" value="' + esc(S.planTime) + '"></label></div>' +
      '<button type="button" class="btn primary" data-pc="plan-save"' + (S.busy ? ' disabled' : '') + '>' + esc(T('Save the date')) + '</button>' +
      '<button type="button" class="link" data-pc="plan-close">' + esc(T('Cancel')) + '</button></section>';
  }
  function keepPlan() { var d = document.getElementById('pcDay'), t = document.getElementById('pcTime'), n = document.getElementById('pcPlanNote'); if (d && d.value) S.planDay = d.value; if (t && t.value) S.planTime = t.value; if (n) S.planNote = n.value; }
  function openPlan() { S.plan = true; paintRemind(); if (!showTab()) openPanel(); else paintCalls(); var d = document.getElementById('pcDay'); if (d && d.scrollIntoView) d.scrollIntoView({ block: 'center' }); }
  function savePlan() {
    keepPlan();
    var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(S.planDay), tm = /^(\d\d):(\d\d)/.exec(S.planTime);
    var at = m && tm ? new Date(+m[1], +m[2] - 1, +m[3], +tm[1], +tm[2]) : null;
    if (!at || !isFinite(at.getTime()) || at.getTime() < Date.now()) { toast(T('Please choose a day and a time to come.')); return; }
    S.busy = true; paintCalls();
    api('POST', 'family/calls/plan', S.planNote ? { at: at.toISOString(), note: String(S.planNote).trim().slice(0, 120) } : { at: at.toISOString() }).then(function (r) {
      S.busy = false; S.plan = false; S.planDay = ''; S.planNote = '';
      S.calls = S.calls || {}; S.calls.request = r.request; S.calls.reminder = null;
      toast(T('Planned call saved.'));
      paintCalls(); paintRemind();
      loadCalls();
    }, function (e) {
      S.busy = false; paintCalls();
      toast(e && e.code === 'bad-date' ? T('Please choose a day and a time to come.') : e && e.code === 'enough-today' ? T('That is plenty for today. You can ask again tomorrow.') : T('No connection to Bellatrix right now. Please try again in a moment.'));
    });
  }
  /* The banner at the top of the portal, whatever the tab: one sentence and two buttons. */
  function paintRemind() {
    var main = document.querySelector('#app main.main'), old = document.getElementById('pcRemind');
    var r = signedIn() && S.calls && S.calls.reminder && !S.plan ? S.calls.reminder : null, k = r ? S.lang + '|' + S.rid + '|' + r.at : '';
    if (old && (!r || !main || old.parentNode !== main || old.getAttribute('data-k') !== k)) { old.parentNode.removeChild(old); old = null; }
    if (!r || !main || old) return;
    var n = Math.max(1, Number(r.days) || 1);
    main.insertAdjacentHTML('afterbegin', '<section class="card pc-remind" id="pcRemind" role="status" data-k="' + esc(k) + '">' +
      '<p><b>' + esc(T('You have not talked with {name} for {span}.', { name: who(), span: n === 1 ? T('1 day') : T('{n} days', { n: n }) })) + '</b></p>' +
      '<div class="pc-two"><button type="button" class="btn primary" data-pc="remind-now">' + esc(T('Now')) + '</button>' +
      '<button type="button" class="btn" data-pc="remind-plan">' + esc(T('Plan a date')) + '</button></div></section>');
  }
  function answerRemind() {
    if (S.calls) S.calls.reminder = null;
    paintRemind();
    return api('POST', 'family/calls/remind', {}).then(function () {}, function () { /* asked again at the next visit */ });
  }
  /* From the phone's notification (its buttons) or from the banner: 'now' -> the Calls screen, 'plan' -> the
     day and time, '' -> the portal with its banner. rid: the resident the reminder is about. */
  function remindAction(act, rid) {
    var P = window.Portail, st = P && P.state, known = st && st.me && (st.me.residents || []).some(function (x) { return x.rid === rid; });
    var go = function () {
      if (act === 'plan') { answerRemind(); openPlan(); }
      else if (act === 'now') { answerRemind(); S.plan = false; if (!showTab()) openPanel(); }
      else loadCalls();
    };
    if (rid && known && st.rid !== rid && typeof P.refresh === 'function') {
      st.rid = rid; put('bellatrix-portail-resident', rid); S.rid = rid; S.calls = null;
      Promise.resolve(P.refresh()).then(function () { return loadCalls(); }, function () {}).then(go);
    } else go();
  }
  function paintCalls() {
    var act = document.activeElement;
    if (act && (act.id === 'pcDay' || act.id === 'pcTime')) return;   /* a day or a time is being chosen */
    keepPlan();
    var note = document.getElementById('pcNote'), keep = note ? note.value : '', focus = document.activeElement === note;
    if (S.el && S.el.isConnected) S.el.innerHTML = callsHtml();
    var panel = document.getElementById('pcPanelBody');
    if (S.panel && panel) panel.innerHTML = callsHtml();
    fillQr(S.el && S.el.isConnected ? S.el : panel);
    var n2 = document.getElementById('pcNote');
    if (n2 && keep) n2.value = keep;
    if (n2 && focus) n2.focus();
  }
  function ask() {
    var note = document.getElementById('pcNote');
    S.busy = true; paintCalls();
    api('POST', 'family/calls/request', { when: S.when, note: note ? note.value.trim() : '' }).then(function (r) {
      S.busy = false; S.justAsked = true;
      S.calls = S.calls || {}; S.calls.request = r.request;
      toast(T('Your request has arrived.'));
      paintCalls();
      loadCalls();
    }, function (e) {
      S.busy = false; paintCalls();
      toast(e && e.code === 'enough-today' ? T('That is plenty for today. You can ask again tomorrow.') : e && e.code === 'no-links' ? T('Links cannot be sent. Photos and text only.') : T('No connection to Bellatrix right now. Please try again in a moment.'));
    });
  }

  /* ---------- the bell and its sheet ---------- */
  function unread() { return S.notes ? S.notes.unread || 0 : 0; }
  function paintBell() {
    var top = document.querySelector('#app header.top');
    if (!top || !signedIn()) return;
    var b = top.querySelector('.pc-bell');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button'; b.className = 'pc-bell'; b.setAttribute('data-pc', 'bell');
      var langs = top.querySelector('.langs');
      top.insertBefore(b, langs || null);
    }
    var n = unread(), ps = pushState(), on = ps === 'on', label = T('Notifications') + ' · ' + T(on ? 'On' : 'Off') + (n ? ' · ' + n : '');
    var html = (on ? ICON.bell : ICON.belloff) + (n ? '<i class="pc-badge">' + (n > 9 ? '9+' : n) + '</i>' : '');
    if (b.innerHTML !== html) b.innerHTML = html;
    b.setAttribute('aria-label', label); b.title = label; b.setAttribute('data-push', ps);
    b.className = 'pc-bell' + (on ? '' : ' off');
  }
  function itemIcon(x) { return /^call_(invite)/.test(x.type) ? ICON.video : x.type === 'call_missed' ? ICON.missed : /^call/.test(x.type) ? ICON.call : x.type === 'payment_request' ? ICON.crown : x.type === 'message_read' ? ICON.msg : ICON.bell; }
  function sheetHtml() {
    var items = (S.notes && S.notes.items) || [];
    return '<div class="pc-sheet" role="dialog" aria-modal="true" aria-labelledby="pcSheetTitle"><div class="pc-sheethead"><h2 id="pcSheetTitle">' + ICON.bell + '<span>' + esc(T('Notifications')) + '</span></h2>' +
      '<button type="button" class="pc-x" data-pc="close" aria-label="' + esc(T('Close')) + '">×</button></div>' +
      pushRow() +
      (items.length ? '<ul class="pc-list">' + items.map(function (x) {
        return '<li class="' + (x.read ? '' : 'new') + '"><button type="button" data-pc="item" data-id="' + esc(x.id) + '"><span class="pc-ico t-' + esc(x.type) + '">' + itemIcon(x) + '</span>' +
          '<span class="pc-txt"><b>' + esc(x.title) + '</b>' + (x.body ? '<small>' + esc(x.body) + '</small>' : '') + '<small class="pc-when">' + esc(when(x.at)) + (x.read ? '' : ' · <span class="pc-new">' + esc(T('Unread')) + '</span>') + '</small></span></button></li>';
      }).join('') + '</ul>' : '<p class="muted pc-empty">' + esc(T('No notification yet.')) + '</p>') +
      (unread() ? '<button type="button" class="btn ghost" data-pc="readall">' + esc(T('Mark all as read')) + '</button>' : '') + '</div>';
  }
  function layer(id) {
    var el = document.getElementById(id);
    if (!el) { el = document.createElement('div'); el.id = id; el.className = 'pc-layer'; document.body.appendChild(el); el.addEventListener('click', onClick); }
    return el;
  }
  function paintSheet() {
    var el = layer('pcSheet');
    el.hidden = !S.sheet;
    if (S.sheet) el.innerHTML = '<div class="pc-scrim" data-pc="close"></div>' + sheetHtml();
  }
  function openSheet() { S.sheet = true; paintSheet(); loadNotes(); var x = document.querySelector('#pcSheet .pc-x'); if (x) x.focus(); }
  function closeSheet() { S.sheet = false; paintSheet(); var b = document.querySelector('.pc-bell'); if (b) b.focus(); }
  /* The Calls screen without the tab registry: a full panel. */
  function openPanel() {
    if (showTab()) return;
    S.panel = true;
    var el = layer('pcPanel');
    el.hidden = false;
    el.innerHTML = '<div class="pc-scrim" data-pc="closepanel"></div><div class="pc-sheet pc-full" role="dialog" aria-modal="true"><div class="pc-sheethead"><h2>' + ICON.call + '<span>' + esc(T('Calls')) + '</span></h2>' +
      '<button type="button" class="pc-x" data-pc="closepanel" aria-label="' + esc(T('Close')) + '">×</button></div><div id="pcPanelBody" class="pc-panelbody"></div></div>';
    paintCalls();
    loadCalls();
  }
  function closePanel() { S.panel = false; var el = document.getElementById('pcPanel'); if (el) { el.hidden = true; el.innerHTML = ''; } }
  /* Opens the Calls tab of the portal (its tab button), if there is one. */
  function showTab() {
    var b = document.querySelector('#app nav.tabs [data-tab="calls"]');
    if (b) { b.click(); return true; }
    if (window.Portail && typeof Portail.show === 'function') { try { Portail.show('calls'); return true; } catch (e) { /* below */ } }
    return false;
  }
  function openItem(id) {
    var x = ((S.notes && S.notes.items) || []).filter(function (i) { return i.id === id; })[0];
    if (!x) return;
    api('POST', 'family/notify/read', { ids: [id] }).then(function () { loadNotes(); }, function () {});
    x.read = true;
    closeSheet();
    var tab = x.tab || (/^call/.test(x.type) ? 'calls' : '');
    if (tab === 'calls') { if (!showTab()) openPanel(); return; }
    var b = tab && document.querySelector('#app nav.tabs [data-tab="' + tab + '"]');
    if (b) b.click();
  }

  /* ---------- 15 Nov: a call from Bellatrix RINGS while the portal is open ----------
     family/calls/ring every 3 s (visible, signed in): a full-screen incoming call, the caller's name, a short
     WebAudio ring (muted in the tests by Chrome's --mute-audio), vibration where the phone has it, big green
     "Annehmen" (joins the call: famille.html#j=…&go=1) and red "Ablehnen" (the robot is told). Nobody answers
     within the ring (about 45 s): "Verpasster Anruf", then it closes. Green and red only on these two buttons. */
  var RING = { cur: null, end: 0, done: {}, timer: 0, tone: 0, ctx: null, rings: 0, poll: 0, close: 0 };
  function initialOf(s) { return esc(String(s || '?').trim().charAt(0).toUpperCase() || '?'); }
  function beep() {
    RING.rings++;
    try { if (navigator.vibrate) navigator.vibrate([600, 300, 600]); } catch (e) { /* no vibration */ }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!RING.ctx) RING.ctx = new AC();
      var c = RING.ctx, t0 = c.currentTime;
      if (c.resume) c.resume().catch(function () {});
      [[659, 0], [523, 0.45]].forEach(function (n) {
        var o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, t0 + n[1]); g.gain.exponentialRampToValueAtTime(0.2, t0 + n[1] + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t0 + n[1] + 0.4);
        o.connect(g); g.connect(c.destination); o.start(t0 + n[1]); o.stop(t0 + n[1] + 0.42);
      });
    } catch (e) { /* no sound: the screen and the vibration still ring */ }
  }
  function stopTone() { clearInterval(RING.tone); RING.tone = 0; clearTimeout(RING.timer); try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) { /* fine */ } }
  function ringLayer() { var el = layer('pcRing'); el.className = 'pc-layer pc-ringlayer'; return el; }
  function paintRing(missed) {
    var r = RING.cur, el = ringLayer();
    if (!r) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = '<div class="pc-ringscreen' + (missed ? ' missed' : '') + '" role="alertdialog" aria-modal="true" aria-labelledby="pcRingName">' +
      '<p class="pc-ringbrand">' + esc(T('Bellatrix video call')) + '</p><div class="pc-ringface" aria-hidden="true">' + initialOf(r.label || who()) + '</div>' +
      '<h1 id="pcRingName">' + esc(r.label || who()) + '</h1><p class="pc-ringline" role="status">' + esc(missed ? T('Missed call') : T('is calling')) + '</p>' +
      (missed ? '<div class="pc-ringbtns one"><button type="button" class="btn" data-pc="ring-close">' + esc(T('Close')) + '</button></div>'
        : '<div class="pc-ringbtns"><div class="pc-rb"><button type="button" class="pc-rbtn decline" data-pc="ring-decline" aria-label="' + esc(T('Decline')) + '">' + ICON.call + '</button><span>' + esc(T('Decline')) + '</span></div>' +
          '<div class="pc-rb"><button type="button" class="pc-rbtn accept" data-pc="ring-accept" aria-label="' + esc(T('Answer')) + '">' + ICON.call + '</button><span>' + esc(T('Answer')) + '</span></div></div>') + '</div>';
    var b = el.querySelector(missed ? '[data-pc="ring-close"]' : '[data-pc="ring-accept"]'); if (b) b.focus();
  }
  function startRing(r) {
    RING.cur = r; RING.end = Date.now() + Math.max(1000, Math.min(Number(r.left) || 45000, 60000));
    var o = document.getElementById('pcOverlay'); if (o) o.hidden = true;
    paintRing(false);
    beep(); clearInterval(RING.tone); RING.tone = setInterval(beep, 3000);
    clearTimeout(RING.timer); RING.timer = setTimeout(missedRing, RING.end - Date.now());
  }
  function missedRing() {
    if (!RING.cur) return;
    stopTone(); RING.done[RING.cur.id] = 'missed';
    paintRing(true);
    clearTimeout(RING.close); RING.close = setTimeout(endRing, 8000);
  }
  function endRing() { stopTone(); clearTimeout(RING.close); RING.cur = null; paintRing(false); }
  function onRing(r) {
    if (r && !RING.done[r.id]) { if (!RING.cur || RING.cur.id !== r.id) startRing(r); return; }
    /* it stopped ringing elsewhere (the team cancelled, answered on another phone): quietly closed */
    if (!r && RING.cur && !RING.done[RING.cur.id]) { if (Date.now() >= RING.end - 1500) missedRing(); else endRing(); }
  }
  function pollRing() {
    if (document.visibilityState === 'hidden' || !signedIn()) return Promise.resolve(null);
    return api('GET', 'family/calls/ring').then(function (x) { onRing(x && x.ring); return x; }, function () { return null; });
  }
  function acceptRing() {
    var r = RING.cur; if (!r) return;
    RING.done[r.id] = 'accepted'; endRing(); markInviteRead();
    join(r.token, true);
  }
  function declineRing() {
    var r = RING.cur; if (!r) return;
    RING.done[r.id] = 'declined'; endRing();
    api('POST', 'family/calls/decline', { invite: r.id }).then(function () { toast(T('Call declined.')); loadCalls(); }, function () { toast(T('Call declined.')); });
  }

  /* ---------- an invitation while the portal is open: a large card ---------- */
  function seen() { try { return JSON.parse(get(DISMISSED) || '[]') || []; } catch (e) { return []; } }
  function maybeOverlay() {
    var inv = S.calls && S.calls.invite, el = document.getElementById('pcOverlay');
    var show = !!inv && seen().indexOf(inv.id) < 0 && Date.parse(inv.until) > Date.now() && !inv.ringUntil;
    if (!show) { if (el) el.hidden = true; S.overlay = null; return; }
    if (S.overlay === inv.id && el && !el.hidden) return;
    S.overlay = inv.id;
    el = layer('pcOverlay');
    el.hidden = false;
    el.innerHTML = '<div class="pc-scrim"></div><div class="pc-sheet pc-callcard" role="alertdialog" aria-modal="true" aria-labelledby="pcInvTitle"><div class="pc-ring big" aria-hidden="true">' + ICON.video + '</div>' +
      '<h1 id="pcInvTitle">' + esc(T('Bellatrix · {name} is calling you', { name: who() })) + '</h1>' +
      '<p class="fine">' + esc(T('Video call · until {time}', { time: hhmm(inv.until) })) + '</p>' +
      '<button type="button" class="btn call" data-pc="join">' + ICON.video + '<span>' + esc(T('Join the call')) + '</span></button>' + qrBox(inv.token) +
      '<button type="button" class="link" data-pc="notnow">' + esc(T('Later')) + '</button></div>';
    fillQr(el);
    var b = el.querySelector('.btn.call'); if (b) b.focus();
  }
  function dismissOverlay() {
    var inv = S.calls && S.calls.invite, list = seen();
    if (inv) { list.push(inv.id); put(DISMISSED, JSON.stringify(list.slice(-20))); }
    var el = document.getElementById('pcOverlay'); if (el) el.hidden = true;
  }
  function markInviteRead() {
    var inv = S.calls && S.calls.invite;
    if (!inv || !S.notes) return;
    var ids = (S.notes.items || []).filter(function (x) { return x.invite === inv.id && !x.read; }).map(function (x) { return x.id; });
    if (ids.length) api('POST', 'family/notify/read', { ids: ids }).then(loadNotes, function () {});
  }

  /* ---------- clicks ---------- */
  function onClick(e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-pc], [data-when]') : null;
    if (!b) return;
    if (b.hasAttribute('data-when')) { S.when = b.getAttribute('data-when'); paintCalls(); return; }
    var what = b.getAttribute('data-pc');
    if (b.disabled) return;
    if (what === 'bell') { if (S.sheet) closeSheet(); else openSheet(); return; }
    if (what === 'close') { closeSheet(); return; }
    if (what === 'closepanel') { closePanel(); return; }
    if (what === 'readall') { api('POST', 'family/notify/read', { all: true }).then(loadNotes, function () {}); return; }
    if (what === 'item') { openItem(b.getAttribute('data-id')); return; }
    if (what === 'on') { turnOn(); return; }
    if (what === 'off') { turnOff(); return; }
    if (what === 'later') { put(LATER, String(Date.now())); paintSheet(); return; }
    if (what === 'install') { closeSheet(); if (window.Portail && Portail.openInstall) Portail.openInstall(); return; }
    if (what === 'test') { api('POST', 'family/notify/test', {}).then(function () { toast(T('Test sent.')); setTimeout(loadNotes, 1500); }, function () {}); return; }
    if (what === 'ask') { ask(); return; }
    if (what === 'remind-now') { remindAction('now', ''); return; }
    if (what === 'remind-plan') { remindAction('plan', ''); return; }
    if (what === 'plan-open') { openPlan(); return; }
    if (what === 'pday') { keepPlan(); S.planDay = b.getAttribute('data-v'); paintCalls(); return; }
    if (what === 'ptime') { keepPlan(); S.planTime = b.getAttribute('data-v'); paintCalls(); return; }
    if (what === 'recall') { S.when = 'soon'; ask(); return; }
    if (what === 'plan-close') { S.plan = false; if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); paintCalls(); paintRemind(); return; }
    if (what === 'plan-save') { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); savePlan(); return; }
    if (what === 'cancel') {
      api('POST', 'family/calls/cancel', { id: b.getAttribute('data-id') }).then(function () { S.justAsked = false; toast(T('Request cancelled.')); return loadCalls(); }, function () {});
      return;
    }
    if (what === 'join') {
      var inv = S.calls && S.calls.invite;
      if (!inv) { toast(T('This invitation has ended.')); return; }
      markInviteRead(); dismissOverlay();
      join(inv.token);
      return;
    }
    if (what === 'notnow') { dismissOverlay(); markInviteRead(); return; }
    if (what === 'ring-accept') { acceptRing(); return; }
    if (what === 'ring-decline') { declineRing(); return; }
    if (what === 'ring-close') { endRing(); return; }
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (S.sheet) closeSheet();
    else if (S.panel) closePanel();
  });

  /* ---------- the tab (registry of js/portail.js) ---------- */
  function residentOf(ctx) { var r = (ctx && ctx.resident) || {}; return { rid: r.rid || r.id || '', label: r.label || r.name || '' }; }
  function render(el, ctx) {
    css();
    S.lang = I18N.valid((ctx && (ctx.lang || ctx.language)) || curLang());
    var r = residentOf(ctx);
    if (r.rid && r.rid !== S.rid) { S.rid = r.rid; S.calls = null; S.justAsked = false; }
    if (r.label) S.label = r.label;
    S.el = el;
    if (!el.getAttribute('data-pc-wired')) { el.setAttribute('data-pc-wired', '1'); el.addEventListener('click', onClick); }
    paintCalls();
    loadCalls();
  }
  var TAB = { id: 'calls', label: { fr: 'Appels', de: 'Anrufe', en: 'Calls' }, icon: ICON.call, order: 15, render: render,
    /* BF-27: calls are shown at every consent level, also without consent (the portal's features say so). */
    visible: function (c) { return !c || !c.features || c.features.calls !== false; } };
  var added = false;
  function register() {
    if (added) return true;
    if (window.Portail && typeof window.Portail.addTab === 'function') { window.Portail.addTab(TAB); added = true; return true; }
    return false;
  }

  /* ---------- start: the bell follows every redraw of the portal ---------- */
  function paintAll() { paintBell(); if (S.sheet) paintSheet(); paintCalls(); }
  var watching = false, wasIn = false;
  function onRedraw() {
    S.lang = curLang();
    syncResident();
    var inNow = signedIn();
    if (inNow) {
      paintBell();
      paintRemind();
      if (!wasIn) {
        wasIn = true; syncPush(); loadNotes();
        var pend = S.pending; S.pending = null;
        loadCalls().then(function () { if (pend) remindAction(pend.act, pend.rid); });
      }
    } else if (wasIn) {
      wasIn = false; S.notes = null; S.calls = null; S.push = ''; closeSheet(); closePanel();
      var o = document.getElementById('pcOverlay'); if (o) o.hidden = true;
    }
  }
  function begin() {
    register();
    css();
    var app = document.getElementById('app');
    if (app && !watching && window.MutationObserver) {
      watching = true;
      new MutationObserver(function () { onRedraw(); }).observe(app, { childList: true });
      app.addEventListener('click', function (e) { var b = e.target && e.target.closest ? e.target.closest('.pc-bell, #pcRemind [data-pc]') : null; if (b) onClick(e); });
    }
    /* From the reminder on the phone: portail.html#remind=<resident>&a=now|plan (kept until the portal is ready). */
    var rm = /[#&]remind=([A-Za-z0-9_-]{6,40})/.exec(location.hash || '');
    if (rm) {
      var ra = /[#&]a=(now|plan)\b/.exec(location.hash || '');
      S.pending = { act: ra ? ra[1] : '', rid: rm[1] };
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e0) { /* only the address bar */ }
    }
    onRedraw();
    startPolling();
    /* From a notification on the phone: portail.html#n=<id>&r=<resident> (the service worker opens it, or
       tells an open portal). */
    var m = /[#&]n=([A-Za-z0-9_-]{6,40})/.exec(location.hash || '');
    if (m) {
      var id = m[1], r = /[#&]r=([A-Za-z0-9_-]{6,40})/.exec(location.hash || '');
      if (r && !S.rid) S.rid = r[1];
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* only the address bar */ }
      setTimeout(function () { loadNotes().then(function () { openItem(id); }); }, 600);
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', function (e) {
        var d = e.data || {};
        if (d.type === 'bellatrix-notify-open' && (d.action || d.kind === 'talk_reminder')) {
          if (d.id) api('POST', 'family/notify/read', { ids: [d.id] }).then(loadNotes, function () {});
          if (signedIn()) remindAction(d.action || '', d.rid || ''); else S.pending = { act: d.action || '', rid: d.rid || '' };
        }
        else if (d.type === 'bellatrix-notify-open' && d.id) { loadNotes().then(function () { openItem(d.id); }); }
        else if (d.type === 'bellatrix-notify-push') { loadNotes(); if (/^(call|talk)/.test(d.kind || '')) { loadCalls(); pollRing(); } }
        else if (d.type === 'bellatrix-call-declined' && RING.cur && RING.cur.id === d.invite) { RING.done[d.invite] = 'declined'; endRing(); }
      });
    }
    /* 15 Nov: what rings now, every 3 s while the portal is open */
    clearInterval(RING.poll); RING.poll = setInterval(pollRing, 3000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') tick(); });
    window.addEventListener('focus', tick);
  }
  if (!register()) {
    document.addEventListener('DOMContentLoaded', register);
    window.addEventListener('load', register);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin); else begin();
  window.PortailCalls = { tab: TAB, render: render, state: S, ring: RING, pollRing: pollRing, openSheet: openSheet, openCalls: openPanel, turnOn: turnOn, turnOff: turnOff, pushState: pushState, pushRow: pushRow, pushCard: pushCard, v2: function () { return V2_CALLS; }, remind: remindAction, _load: function () { return Promise.all([loadNotes(), loadCalls()]); } };
})();
