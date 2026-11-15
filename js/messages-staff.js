/* The Care Team's family portal (agent M, 1.16: "Besoins fonctionnels – Portail famille"). In the Family
   tab, sub-sections "Messages" and "Accounts" (#msgBody in staff.html; staff.js switches them and says so
   with the 'bellatrix-staff-sub' event). Texts through ST(); French and German below.
   - Messages (BF-11/12/13): no approval any more. Each family message goes straight to the robot and
     the team gets a notification here: the resident's name, the kind of message (text, photo, voice,
     video, album photo), who sent it and when. "Seen"; "Send the robot to {name}" (BF-13: logged, the
     LuckiBot navigation SDK is not integrated yet); "Withdraw from the robot" (a safety net).
   - Accounts (BF-02/03/04/27): the consent the resident (or their legal representative) gave, in three
     levels the team can lower at any time (effect at the family's next request); invitation code + QR
     code + print; accounts made by the team; one-time sign-in codes to read out (no email is sent);
     each access can be validated (active), suspended or removed: the relative's data stays. The
     relative's video-call link (Family tab contacts); erase a relative's data or all of a resident's.
   - 1.16 (agent P): family gifts PER PRODUCT and per resident. "La famille de P1 a offert Livres
     Premium (3 mois)": Activer turns THAT product on for P1 ONLY until the offer's end (Premium.gift,
     js/premium.js v3) / Plus tard. When the family stops it or it runs out, only P1's Premium of that
     product goes off, and only if it still comes from that offer (Premium.giftsEnded).
   Family album photos go straight into the album (FamilyMessages.sync, js/messages.js).
   The server: labland/family-portal.mjs (robot API, this robot's key in the Authorization header). */
window.MessagesStaff = (function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var FM = window.FamilyMessages, esc = Lab.esc;
  var S = function (k, v) { return window.ST ? ST(k, v) : I18N.t('en', k, v); };
  var KEY = 'bellatrix-care-lab-v1';
  var LOCALE = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE' };
  var consentDraft = {};
  var st = null, ok = null, isOpen = false, thumbs = {}, busy = false, confirmErase = false, lastSync = 0, confirmWithdraw = '';

  /* ---------- the texts (English keys; French and German, only where missing) ---------- */
  (function () {
    if (typeof I18N === 'undefined') return;
    function addNew(l, t) { var have = I18N.dict[l] || {}, out = {}; Object.keys(t).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(have, k)) out[k] = t[k]; }); I18N.add(l, out); }
    addNew('fr', {
      'New messages from the families': 'Nouveaux messages des familles', 'Earlier': 'Plus tôt',
      'Messages go straight to the robot. You are told here.': 'Les messages arrivent directement sur le robot. Vous êtes prévenus ici.',
      'Nothing new.': 'Rien de nouveau.', 'Message for {name}': 'Message pour {name}', 'The robot is with {name}': 'Le robot est auprès de {name}',
      '{name} ({relation}) asks for access to {code}': '{name} ({relation}) demande l’accès à {code}', '{name} asks for access to {code}': '{name} demande l’accès à {code}', 'Refuse': 'Refuser', 'Refused': 'Refusé', 'Waiting for the team': 'En attente de l’équipe', 'Access approved.': 'Accès validé.', 'Request declined.': 'Demande refusée.',
      'Shown on the patient screen.': 'Affiché sur l’écran patient.', 'Hide': 'Masquer', 'Hide this message on the robot?': 'Masquer ce message sur le robot ?', 'Yes, hide': 'Oui, masquer', 'Hidden.': 'Masqué.', 'Hidden by the team': 'Masqué par l’équipe',
      'Text': 'Texte', 'Photo': 'Photo', 'Voice message': 'Message vocal', 'Video': 'Vidéo', 'Album photo': 'Photo d’album',
      'from {name}, {when}': 'de {name}, {when}', 'Seen': 'Vu', 'Send the robot to {name}': 'Envoyer le robot vers {name}',
      'Withdraw from the robot': 'Retirer du robot', 'Withdraw this message from the robot?': 'Retirer ce message du robot ?', 'Yes, withdraw': 'Oui, retirer', 'No': 'Non',
      'Withdrawn.': 'Retiré.',
      'Request saved. The robot will go there by itself once the LuckiBot navigation is connected; for now, take Bellatrix to {name}.': 'Demande enregistrée. Le robot ira seul quand la navigation LuckiBot sera branchée ; pour l’instant, emmenez Bellatrix jusqu’à {name}.',
      'Robot trips asked (navigation not connected yet)': 'Déplacements demandés (navigation pas encore branchée)',
      'Sent': 'Envoyé', 'Received': 'Reçu', 'Read': 'Lu', 'Withdrawn': 'Retiré', 'Deleted': 'Supprimé',
      'Consent of {name}': 'Consentement de {name}', 'What the family may see': 'Ce que la famille peut voir',
      'Everything (messages, album, calls, activity and summaries)': 'Tout (messages, album, appels, activité et résumés)',
      'Messages and album only': 'Messages et album seulement', 'Nothing more (messages, calls and album stay)': 'Rien de plus (messages, appels et album restent)',
      'Not recorded yet': 'Pas encore enregistré', 'Given by': 'Donné par', 'the resident': 'le résident', 'their legal representative': 'son représentant légal',
      'Save the consent': 'Enregistrer le consentement', 'Consent saved: it applies at once.': 'Consentement enregistré : il s’applique tout de suite.',
      'Without a recorded consent, the family sees only messages, calls and the album.': 'Sans consentement enregistré, la famille ne voit que les messages, les appels et l’album.',
      'recorded on {date}': 'enregistré le {date}',
      'Active': 'Actif', 'Suspended': 'Suspendu', 'Removed': 'Retiré', 'Validate': 'Valider', 'Suspend': 'Suspendre', 'Remove the access': 'Retirer l’accès',
      'Erase this relative’s data': 'Effacer les données de ce proche',
      'Erase this access and everything this relative sent to {code}? This cannot be undone.': 'Effacer cet accès et tout ce que ce proche a envoyé à {code} ? C’est définitif.',
      'Access suspended: the relative loses access at once. Nothing is deleted.': 'Accès suspendu : le proche perd l’accès tout de suite. Rien n’est supprimé.',
      'Access removed. Nothing is deleted.': 'Accès retiré. Rien n’est supprimé.', 'Access validated.': 'Accès validé.',
      'linked to {n} residents': 'lié à {n} résidents',
      '1 family message waiting for delivery': '1 message de famille en attente de remise', '{n} family messages waiting for delivery': '{n} messages de famille en attente de remise',
      '1 new family message': '1 nouveau message de la famille', '{n} new family messages': '{n} nouveaux messages de la famille',
      'Kept on the server: what the family sent, deleted {n} days after it was read. On this robot: the messages for offline use.': 'Conservé sur le serveur : ce que la famille a envoyé, supprimé {n} jours après lecture. Sur ce robot : les messages, pour le hors-ligne.',
      'Bellatrix offers new messages by itself when the patient screen is free': 'Bellatrix propose d’elle-même les nouveaux messages quand l’écran patient est libre',
      'Send photos and messages to {name}. Bellatrix shows them.': 'Envoyez des photos et des messages à {name}. Bellatrix les montre.',
      'Your messages are deleted 30 days after they are read. You can withdraw your consent at any time.': 'Vos messages sont supprimés 30 jours après lecture. Vous pouvez retirer votre consentement à tout moment.'
    });
    addNew('de', {
      'New messages from the families': 'Neue Nachrichten der Familien', 'Earlier': 'Früher',
      'Messages go straight to the robot. You are told here.': 'Nachrichten gehen direkt an den Roboter. Sie werden hier informiert.',
      'Nothing new.': 'Nichts Neues.', 'Message for {name}': 'Nachricht für {name}', 'The robot is with {name}': 'Der Roboter ist bei {name}',
      '{name} ({relation}) asks for access to {code}': '{name} ({relation}) bittet um Zugang zu {code}', '{name} asks for access to {code}': '{name} bittet um Zugang zu {code}', 'Refuse': 'Ablehnen', 'Refused': 'Abgelehnt', 'Waiting for the team': 'Wartet auf das Team', 'Access approved.': 'Zugang bestätigt.', 'Request declined.': 'Anfrage abgelehnt.',
      'Shown on the patient screen.': 'Auf dem Bildschirm der Person angezeigt.', 'Hide': 'Ausblenden', 'Hide this message on the robot?': 'Diese Nachricht auf dem Roboter ausblenden?', 'Yes, hide': 'Ja, ausblenden', 'Hidden.': 'Ausgeblendet.', 'Hidden by the team': 'Vom Team ausgeblendet',
      'Text': 'Text', 'Photo': 'Foto', 'Voice message': 'Sprachnachricht', 'Video': 'Video', 'Album photo': 'Albumfoto',
      'from {name}, {when}': 'von {name}, {when}', 'Seen': 'Gesehen', 'Send the robot to {name}': 'Roboter zu {name} schicken',
      'Withdraw from the robot': 'Vom Roboter zurückziehen', 'Withdraw this message from the robot?': 'Diese Nachricht vom Roboter zurückziehen?', 'Yes, withdraw': 'Ja, zurückziehen', 'No': 'Nein',
      'Withdrawn.': 'Zurückgezogen.',
      'Request saved. The robot will go there by itself once the LuckiBot navigation is connected; for now, take Bellatrix to {name}.': 'Anfrage gespeichert. Der Roboter fährt selbst hin, sobald die LuckiBot-Navigation angeschlossen ist; bringen Sie Bellatrix bis dahin zu {name}.',
      'Robot trips asked (navigation not connected yet)': 'Angefragte Fahrten (Navigation noch nicht angeschlossen)',
      'Sent': 'Gesendet', 'Received': 'Empfangen', 'Read': 'Gelesen', 'Withdrawn': 'Zurückgezogen', 'Deleted': 'Gelöscht',
      'Consent of {name}': 'Einwilligung von {name}', 'What the family may see': 'Was die Familie sehen darf',
      'Everything (messages, album, calls, activity and summaries)': 'Alles (Nachrichten, Album, Anrufe, Aktivität und Zusammenfassungen)',
      'Messages and album only': 'Nur Nachrichten und Album', 'Nothing more (messages, calls and album stay)': 'Nichts weiter (Nachrichten, Anrufe und Album bleiben)',
      'Not recorded yet': 'Noch nicht erfasst', 'Given by': 'Erteilt von', 'the resident': 'der Person selbst', 'their legal representative': 'der gesetzlichen Vertretung',
      'Save the consent': 'Einwilligung speichern', 'Consent saved: it applies at once.': 'Einwilligung gespeichert: Sie gilt sofort.',
      'Without a recorded consent, the family sees only messages, calls and the album.': 'Ohne erfasste Einwilligung sieht die Familie nur Nachrichten, Anrufe und das Album.',
      'recorded on {date}': 'erfasst am {date}',
      'Active': 'Aktiv', 'Suspended': 'Ausgesetzt', 'Removed': 'Entfernt', 'Validate': 'Freigeben', 'Suspend': 'Aussetzen', 'Remove the access': 'Zugang entfernen',
      'Erase this relative’s data': 'Daten dieser Person löschen',
      'Erase this access and everything this relative sent to {code}? This cannot be undone.': 'Diesen Zugang und alles, was diese Person an {code} gesendet hat, löschen? Das lässt sich nicht rückgängig machen.',
      'Access suspended: the relative loses access at once. Nothing is deleted.': 'Zugang ausgesetzt: Die Person verliert den Zugang sofort. Nichts wird gelöscht.',
      'Access removed. Nothing is deleted.': 'Zugang entfernt. Nichts wird gelöscht.', 'Access validated.': 'Zugang freigegeben.',
      'linked to {n} residents': 'mit {n} Personen verknüpft',
      '1 family message waiting for delivery': '1 Familiennachricht wartet auf Übergabe', '{n} family messages waiting for delivery': '{n} Familiennachrichten warten auf Übergabe',
      '1 new family message': '1 neue Familiennachricht', '{n} new family messages': '{n} neue Familiennachrichten',
      'Kept on the server: what the family sent, deleted {n} days after it was read. On this robot: the messages for offline use.': 'Auf dem Server: was die Familie gesendet hat, gelöscht {n} Tage nach dem Lesen. Auf diesem Roboter: die Nachrichten, für die Nutzung ohne Netz.',
      'Bellatrix offers new messages by itself when the patient screen is free': 'Bellatrix bietet neue Nachrichten von selbst an, wenn der Bildschirm frei ist',
      'Send photos and messages to {name}. Bellatrix shows them.': 'Senden Sie Fotos und Nachrichten an {name}. Bellatrix zeigt sie.',
      'Your messages are deleted 30 days after they are read. You can withdraw your consent at any time.': 'Ihre Nachrichten werden 30 Tage nach dem Lesen gelöscht. Sie können Ihre Einwilligung jederzeit widerrufen.'
    });
  })();

  /* ---------- helpers ---------- */
  function code() { var el = $('fParticipant'); return (el && el.value || '').trim() || 'P1'; }
  function store() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function prefs(c) { var p = (store().patients || {})[c]; return (p && p.prefs) || {}; }
  function toast(t) { if (Lab.toast) Lab.toast(t); }
  function loc() { return LOCALE[window.ST ? ST.lang() : 'en'] || 'en-GB'; }
  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso), today = new Date(), t = Lab.pad(d.getHours()) + ':' + Lab.pad(d.getMinutes());
    if (d.toDateString() === today.toDateString()) return S('today at {time}', { time: t });
    try { return d.toLocaleDateString(loc(), { day: 'numeric', month: 'short' }) + ' ' + t; } catch (e) { return iso.slice(0, 16).replace('T', ' '); }
  }
  function dayText(iso) { try { return new Date(iso).toLocaleDateString(loc(), { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return String(iso).slice(0, 10); } }
  function resident(c) { return st ? st.residents.filter(function (r) { return r.code === c; })[0] || null : null; }
  function staffInitials() { try { return localStorage.getItem('bellatrix-staff-initials') || ''; } catch (e) { return ''; } }
  function err(e) {
    var map = { 'bad-email': 'Please check the email address.', 'bad-name': 'A first name is needed.', 'account-exists': 'This email address already has an account for this resident.',
      'bad-link': 'This is not a family call link (famille.html#t=…).', 'not-open': 'This offer is no longer open.', 'bad-resident': 'A first name is needed.' };
    return S(map[e && e.code] || 'The family portal server does not answer. Check the server address (Family tab, Settings) or start the server on the PC.');
  }
  var KINDS = { text: 'Text', photo: 'Photo', voice: 'Voice message', video: 'Video', album: 'Album photo' };
  var STATUS = { sent: 'Sent', received: 'Received', read: 'Read', withdrawn: 'Hidden by the team', deleted: 'Deleted' };
  var ICON = {
    text: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5 h16 v11 h-9 l-5 4 v-4 h-2 z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    voice: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5.5 11 a6.5 6.5 0 0 0 13 0 M12 17.5 V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    video: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="13" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16.5 10.5 L21.5 7.5 V16.5 L16.5 13.5 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'
  };

  /* ---------- the Family tab's sub-sections and the banner ---------- */
  var view = 'queue';
  var mounted = false;
  function mount() {
    var body = $('msgBody'), wrap = $('tabsWrap');
    if (!body || !wrap || mounted) return false;
    mounted = true;
    var banner = document.createElement('div');
    banner.id = 'msgOfferBanner'; banner.className = 'banner xfer msgofferbanner'; banner.hidden = true;
    var after = $('premiumBanner') || $('choiceBanner');
    if (after) after.parentNode.insertBefore(banner, after.nextSibling); else wrap.insertBefore(banner, wrap.firstChild);
    window.addEventListener('bellatrix-staff-sub', function (e) { follow(e.detail); });
    body.addEventListener('click', onClick);
    body.addEventListener('change', onChange);
    banner.addEventListener('click', onClick);
    return true;
  }
  function follow(d) {
    var on = !!d && d.tab === 'family' && (d.sub === 'queue' || d.sub === 'accounts');
    if (on) view = d.sub;
    show(on);
  }
  function show(on) {
    var was = isOpen;
    isOpen = on;
    if (on) { render(); if (!was) refresh(); }
  }
  /* ---------- talking to the server ---------- */
  function refresh() {
    if (!FM || location.protocol === 'file:') return Promise.resolve();
    return syncResidents().then(function () { return FM.request('GET', 'robot/state'); }).then(function (s) {
      st = normState(s); ok = true;
      try { if (window.FamilyStaff && FamilyStaff.syncAccounts) FamilyStaff.syncAccounts(st.residents); } catch (e) { /* the contacts fill in next time */ }
      reconcilePremium();
      badge(); banner();
      if (Date.now() - lastSync > 50000) { lastSync = Date.now(); FM.sync().catch(function () { /* next time */ }); }
      if (isOpen && !typing()) render();
    }, function () { ok = false; badge(); if (isOpen && !typing()) render(); });
  }
  /* Every list of the state is an array, even from an older server or a partial answer (an old 1.15
     server still running on the PC has no offers or requests): nothing below can fail on a missing list. */
  function arr(x) { return Array.isArray(x) ? x : []; }
  function normState(s) {
    s = s && typeof s === 'object' ? s : {};
    s.residents = arr(s.residents).filter(function (r) { return r && typeof r === 'object'; }).map(function (r) { r.accounts = arr(r.accounts); r.invites = arr(r.invites); return r; });
    s.notifications = arr(s.notifications); s.messages = arr(s.messages); s.nav = arr(s.nav); s.offers = arr(s.offers); s.requests = arr(s.requests);
    return s;
  }
  /* Every patient card with a first name for the welcome ("Prénom pour l'accueil") is a resident of the portal:
     the server learns it here, at each sync and when the name or language changes. No manual step. */
  var residentsSig = '';
  function syncResidents() {
    var list = [], pt = store().patients || {};
    Object.keys(pt).forEach(function (c) { var p = (pt[c] && pt[c].prefs) || {}, n = String(p.greet || '').trim(); if (n) list.push({ code: c, label: n.slice(0, 40), lang: I18N.valid(p.lang) }); });
    var sig = JSON.stringify(list);
    if (!list.length || sig === residentsSig) return Promise.resolve();
    return post('robot/resident/sync', { residents: list }).then(function () { residentsSig = sig; }, function () { /* next time */ });
  }
  function typing() { var a = document.activeElement; return !!(a && a.closest && a.closest('#msgBody') && /INPUT|TEXTAREA|SELECT/.test(a.tagName)); }
  function post(path, body) { return FM.request('POST', path, body); }
  /* A relative's own request for access (portal "Create an account"): waiting for one tap, Approve or Decline. */
  function pendingAccess() {
    var out = [];
    if (st) arr(st.residents).forEach(function (r) { arr(r.accounts).forEach(function (a) { if (a.status === 'pending') out.push({ id: a.id, code: r.code, name: [a.name, a.last].join(' ').trim(), relation: a.relation || '', phone: a.phone || '' }); }); });
    return out;
  }
  function accessText(q) { return q.relation ? S('{name} ({relation}) asks for access to {code}', { name: q.name, relation: q.relation, code: q.code }) : S('{name} asks for access to {code}', { name: q.name, code: q.code }); }
  function unseen() { return st ? (st.notifications || []).filter(function (n) { return !n.seen; }) : []; }
  function openOffers() { var t = Date.now(); return st ? st.offers.filter(function (o) { return o.state === 'paid' && (!o.laterAt || t - Date.parse(o.laterAt) > 20 * 3600 * 1000); }) : []; }
  /* The count of what waits: on the Family tab and on its "Messages" sub-section. */
  function badge() {
    var n = openOffers().length + pendingAccess().length;   /* a family message is information, not a task (it is handed over by the robot itself) */
    [document.querySelector('.ctop .tabs [data-tab="family"]'), document.querySelector('#tab-family .subnav [data-sub="queue"]')].forEach(function (b) {
      if (!b) return;
      var el = b.querySelector('.tabbadge');
      if (!n) { if (el) el.parentNode.removeChild(el); return; }
      if (!el) { el = document.createElement('span'); el.className = 'tabbadge'; b.appendChild(el); }
      el.textContent = String(n);
      el.setAttribute('aria-label', S('Waiting for the care team: {n}', { n: n }));
    });
  }

  /* ---------- the family Premium offer, per product (1.16) ---------- */
  function offerProduct(o) { return (window.Premium && Premium.product(o && o.product)) || 'play'; }
  function productName(p) { return window.PlayPremium && PlayPremium.name ? PlayPremium.name(p) : S(p === 'books' ? 'Books Premium' : 'Bellatrix Play Premium'); }
  /* "The family of P1 offered Books Premium" (codeHtml: the code, already escaped or in bold). */
  function offerText(o, codeHtml) { return S('The family of {code} offered {product}', { code: codeHtml, product: esc(productName(offerProduct(o))) }); }
  function banner() {
    var el = $('msgOfferBanner');
    if (!el) return;
    var list = openOffers(), asks = pendingAccess();
    el.hidden = !list.length && !asks.length;
    el.innerHTML = asks.map(function (q) {
      return '<span>' + esc(accessText(q)) + '</span>' +
        '<button type="button" class="go" data-m="access-ok" data-id="' + esc(q.id) + '">' + esc(S('Validate')) + '</button>' +
        '<button type="button" class="ghost" data-m="access-no" data-id="' + esc(q.id) + '">' + esc(S('Refuse')) + '</button>';
    }).join('') + list.map(function (o) {
      return '<span><span class="pcrown" aria-hidden="true">♛</span> ' + offerText(o, '<b>' + esc(o.code) + '</b>') +
        ' <small>(' + esc(S('{n} month(s)', { n: o.months })) + (o.from ? ', ' + esc(o.from) : '') + ')</small></span>' +
        '<button type="button" class="go" data-m="offer-on" data-id="' + esc(o.id) + '">' + esc(S('Activate')) + '</button>' +
        '<button type="button" class="ghost" data-m="offer-later" data-id="' + esc(o.id) + '">' + esc(S('Later')) + '</button>';
    }).join('');
  }
  /* Activer: that product for that resident only, until the offer's end. The other product never changes. */
  function activateOffer(id) {
    var o = st && st.offers.filter(function (x) { return x.id === id; })[0];
    if (!o || busy || !window.Premium) return;
    busy = true;
    post('robot/offer', { id: id, decision: 'activate' }).then(function (r) {
      var until = (r && r.offer && r.offer.until) || o.until, pr = offerProduct(o);
      Premium.gift(o.code, pr, id, o.months, until);
      Premium.unask(o.code, pr);
      busy = false;
      toast(S('{product} is active for {who} until {date}.', { product: productName(pr), who: o.code, date: dayText(until) }));
      return refresh();
    }).catch(function (e) { busy = false; toast(err(e)); });
  }
  /* The family stopped, the time ran out, or the team stopped it: off for THAT resident and product
     only, and only if it still comes from that offer. */
  function reconcilePremium() {
    if (!st || !window.Premium) return;
    Premium.giftsEnded(st.offers).forEach(function (x) {
      toast(S('The {product} offered by the family of {code} has ended.', { product: productName(x.product), code: x.code }));
    });
    /* The 1.15 records of js/messages.js (one per resident) are tidied the same way. */
    try { if (FM.reconcileFamilyPremium) FM.reconcileFamilyPremium(st.offers); } catch (e) { /* nothing left to tidy */ }
  }

  /* ---------- drawing: the notifications (BF-12) ---------- */
  function thumb(n) {
    if (!n.hasPhoto) return '<span class="msgthumb">' + (ICON[n.kind] || ICON.text) + '</span>';
    if (!thumbs[n.message]) {
      thumbs[n.message] = 'loading';
      FM.photoBlob(n.message).then(function (b) {
        thumbs[n.message] = URL.createObjectURL(b);
        Array.prototype.forEach.call(document.querySelectorAll('[data-thumb="' + n.message + '"]'), function (el) { el.innerHTML = '<img src="' + thumbs[n.message] + '" alt="">'; });
      }, function () { thumbs[n.message] = ''; });
    }
    var u = thumbs[n.message];
    return '<span class="msgthumb" data-thumb="' + esc(n.message) + '">' + (u && u !== 'loading' ? '<img src="' + u + '" alt="">' : '…') + '</span>';
  }
  function note(n, fresh) {
    var name = n.label || n.code, live = n.status !== 'withdrawn' && n.status !== 'deleted';
    var btns = (fresh ? '<button type="button" class="ghost sm" data-m="seen" data-id="' + esc(n.id) + '">' + esc(S('Seen')) + '</button>' : '') +
      (live ? '<button type="button" class="go" data-m="robot-here" data-rid="' + esc(n.rid) + '" data-code="' + esc(n.code) + '" data-msg="' + esc(n.message) + '" data-id="' + esc(n.id) + '" data-name="' + esc(name) + '">' + esc(S('The robot is with {name}', { name: name })) + '</button>' : '') +
      (live ? (confirmWithdraw === n.message
        ? '<span class="msgconfirm"><small>' + esc(S('Hide this message on the robot?')) + '</small><button type="button" class="ghost sm danger" data-m="withdraw-yes" data-id="' + esc(n.message) + '">' + esc(S('Yes, hide')) + '</button><button type="button" class="ghost sm" data-m="withdraw-no">' + esc(S('No')) + '</button></span>'
        : '<button type="button" class="ghost sm" data-m="withdraw" data-id="' + esc(n.message) + '">' + esc(S('Hide')) + '</button>') : '');
    return '<li class="msgitem' + (fresh ? ' fresh' : '') + '">' + thumb(n) + '<div class="msginfo"><b>' + esc(S('Message for {name}', { name: name })) + ' <small>(' + esc(n.code) + ')</small></b>' +
      '<span class="msgex"><span class="msgtag">' + esc(S(KINDS[n.kind] || 'Text')) + '</span> ' + esc(S('from {name}, {when}', { name: n.from, when: when(n.at) })) + '</span>' +
      (n.text ? '<small class="msgnote">' + esc(n.text) + '</small>' : '') +
      '<small><span class="msgtag ' + (n.status === 'read' ? 'ok' : n.status === 'withdrawn' || n.status === 'deleted' ? 'not' : '') + '">' + esc(S(STATUS[n.status] || 'Sent')) + '</span></small></div>' +
      '<div class="msgbtns">' + btns + '</div></li>';
  }
  function render() {
    var box = $('msgBody');
    if (!box) return;
    var c = code(), r = resident(c);
    var h = '<div class="msgtop"><h2>' + esc(S('Family messages')) + '</h2>' +
      '<span class="msgstatus ' + (ok === true ? 'ok' : ok === false ? 'err' : '') + '"><i></i>' + esc(ok === true ? S('Family portal connected') : ok === false ? S('Family portal not reachable') : S('Checking…')) + '</span>' +
      '<button type="button" class="ghost sm" data-m="refresh">' + esc(S('Refresh')) + '</button></div>';
    if (ok === false) h += '<p class="warn">' + esc(err(null)) + '</p>';
    if (view === 'accounts') { box.innerHTML = h + consentHtml(c, r) + accounts(c, r) + settingsHtml(c, r); return; }

    /* Premium gifts from the families (agent P) */
    var offers = st ? st.offers.filter(function (o) { return o.state === 'paid' || o.state === 'active'; }) : [];
    if (offers.length) {
      h += '<div class="section msgsec"><h3>♛ ' + esc(S('Premium offered by the family')) + '</h3><ul class="msglist">' + offers.map(function (o) {
        return '<li class="msgitem"><div class="msginfo"><b>' + offerText(o, esc(o.code)) + '</b><small>' +
          esc(S('{n} month(s)', { n: o.months })) + (o.from ? ' · ' + esc(o.from) : '') + ' · ' + esc(o.state === 'active' ? S('active until {date}', { date: dayText(o.until) }) : S('waiting for the team')) + '</small></div><div class="msgbtns">' +
          (o.state === 'paid' ? '<button type="button" class="go" data-m="offer-on" data-id="' + esc(o.id) + '">' + esc(S('Activate')) + '</button><button type="button" class="ghost" data-m="offer-later" data-id="' + esc(o.id) + '">' + esc(S('Later')) + '</button>'
            : '<button type="button" class="ghost sm" data-m="offer-stop" data-id="' + esc(o.id) + '">' + esc(S('Stop')) + '</button>') + '</div></li>';
      }).join('') + '</ul></div>';
    }
    var all = st ? st.notifications || [] : [], fresh = all.filter(function (n) { return !n.seen; }), old = all.filter(function (n) { return n.seen; });
    var waiting = all.filter(function (n) { return n.status === 'sent' || n.status === 'received'; }).length;
    if (waiting) h += '<p class="msgnote">' + esc(waiting === 1 ? S('1 family message waiting for delivery') : S('{n} family messages waiting for delivery', { n: waiting })) + '</p>';
    h += '<div class="section msgsec"><h3>' + esc(S('New messages from the families')) + ' <span class="msgcount' + (fresh.length ? '' : ' zero') + '">' + fresh.length + '</span></h3>' +
      (fresh.length ? '<ul class="msglist">' + fresh.map(function (n) { return note(n, true); }).join('') + '</ul>' : '<p class="msgempty">' + esc(st ? S('Nothing new.') : S('Checking…')) + '</p>') +
      '<p class="msgnote">' + esc(S('Messages go straight to the robot. You are told here.')) + '</p></div>';
    if (old.length) h += '<details class="section msgsec"><summary><b>' + esc(S('Earlier')) + '</b> (' + old.length + ')</summary><ul class="msglist">' + old.slice(0, 30).map(function (n) { return note(n, false); }).join('') + '</ul></details>';
    var nav = st && st.nav ? st.nav.slice().reverse() : [];
    if (nav.length) {
      h += '<details class="section msgsec"><summary><b>' + esc(S('Robot trips asked (navigation not connected yet)')) + '</b> (' + nav.length + ')</summary><ul class="msglist">' + nav.map(function (x) {
        var rr = st.residents.filter(function (y) { return y.rid === x.rid; })[0];
        return '<li class="msgitem"><div class="msginfo"><b>' + esc(rr ? rr.label : x.code) + ' (' + esc(x.code) + ')</b><small>' + esc(when(x.at)) + '</small></div></li>';
      }).join('') + '</ul></details>';
    }
    box.innerHTML = h;
  }

  /* ---------- drawing: consent (BF-27) and accounts (BF-02/03/04) ---------- */
  function consentHtml(c, r) {
    if (!r) return '';
    var cs = r.consent || null, d = consentDraft[r.rid] || {}, lvl = d.level || (cs ? cs.level : ''), by = d.by || (cs ? cs.by : '');
    var opt = function (v, label) { return '<label class="msgcheck"><input type="radio" name="msgLevel" value="' + v + '"' + (lvl === v ? ' checked' : '') + '> <span>' + esc(S(label)) + '</span></label>'; };
    return '<div class="section msgsec"><h3>' + esc(S('Consent of {name}', { name: r.label })) + ' · ' + esc(c) + '</h3>' +
      '<p class="msgnote">' + esc(cs ? S('recorded on {date}', { date: dayText(cs.at) }) : S('Not recorded yet')) + ' · ' + esc(S('Without a recorded consent, the family sees only messages, calls and the album.')) + '</p>' +
      '<b>' + esc(S('What the family may see')) + '</b>' +
      opt('all', 'Everything (messages, album, calls, activity and summaries)') + opt('messages_album', 'Messages and album only') + opt('none', 'Nothing more (messages, calls and album stay)') +
      '<div class="msgrow"><label class="msgfield">' + esc(S('Given by')) + '<select id="msgConsentBy"><option value="resident"' + (by === 'resident' ? ' selected' : '') + '>' + esc(S('the resident')) + '</option>' +
      '<option value="representative"' + (by === 'representative' ? ' selected' : '') + '>' + esc(S('their legal representative')) + '</option></select></label>' +
      '<button type="button" class="go" data-m="consent">' + esc(S('Save the consent')) + '</button></div></div>';
  }
  function statusTag(a) { var cls = a.status === 'active' ? 'ok' : 'not'; return '<span class="msgtag ' + cls + '">' + esc(S(a.status === 'active' ? 'Active' : a.status === 'suspended' ? 'Suspended' : a.status === 'pending' ? 'Waiting for the team' : a.status === 'refused' ? 'Refused' : 'Removed')) + '</span>'; }
  function accounts(c, r) {
    var pr = prefs(c), h = '<div class="section msgsec"><h3>' + esc(S('Family accounts')) + ' · ' + esc(c) + '</h3>';
    if (!st) return h + '<p class="msgempty">' + esc(S('Checking…')) + '</p></div>';
    if (!r) {
      return h + '<p class="msgnote">' + esc(S('Family messages are not open for {code} yet. The family will see this first name on their portal.', { code: c })) + '</p>' +
        '<div class="msgrow"><label class="field">' + esc(S('First name the family uses')) + '<input id="msgLabel" type="text" maxlength="40" value="' + esc(pr.greet || '') + '" placeholder="' + esc(S('e.g. Marie, Mamie')) + '"></label>' +
        '<button type="button" class="go" data-m="resident">' + esc(S('Open family messages for {code}', { code: c })) + '</button></div></div>';
    }
    var calls = callLinks(c);
    h += '<div class="msgrow"><label class="field">' + esc(S('First name the family uses')) + '<input id="msgLabel" type="text" maxlength="40" value="' + esc(r.label) + '"></label>' +
      '<button type="button" class="ghost" data-m="resident">' + esc(S('Save')) + '</button></div>';
    h += '<h3>' + esc(S('Invitations')) + '</h3>';
    h += r.invites.map(function (i) {
      var url = FM.portalUrl() + '#i=' + i.code;
      return '<div class="msginv"><span class="msgqr">' + (window.BellatrixQR ? BellatrixQR.svg(url) : '') + '</span><div class="msginfo"><span class="msgcode">' + esc(i.code) + '</span>' +
        '<small>' + esc(S('valid until {date}, one family member', { date: dayText(i.expires) })) + '</small><small>' + esc(url.replace(/#.*$/, '')) + '</small>' +
        '<div class="msgbtns" style="justify-content:flex-start"><button type="button" class="ghost sm" data-m="print" data-code="' + esc(i.code) + '">' + esc(S('Print')) + '</button>' +
        '<button type="button" class="ghost sm" data-m="bigqr" data-code="' + esc(i.code) + '">' + esc(S('Show big')) + '</button>' +
        '<button type="button" class="ghost sm danger" data-m="uninvite" data-code="' + esc(i.code) + '">' + esc(S('Cancel')) + '</button></div></div></div>';
    }).join('');
    h += '<div class="msgrow"><button type="button" class="go" data-m="invite">' + esc(S('New invitation (QR code)')) + '</button></div>';
    h += '<h3>' + esc(S('Accounts')) + '</h3>';
    var linksOf = function (pid) { return st.residents.filter(function (x) { return x.accounts.some(function (a) { return a.pid === pid && a.status !== 'removed'; }); }).length; };
    h += r.accounts.length ? r.accounts.map(function (a) {
      var n = linksOf(a.pid), act = a.status === 'active';
      return '<div class="msgacc' + (act ? '' : ' off') + '"><div class="msgaccmain"><b>' + esc(a.name) + '</b>' + (a.relation ? '<small>(' + esc(a.relation) + ')</small>' : '') + '<small>' + esc(a.email) + '</small>' + statusTag(a) +
        (n > 1 ? '<small class="msgnote">' + esc(S('linked to {n} residents', { n: n })) + '</small>' : '') + '</div>' +
        '<small class="msgnote">' + esc(a.createdBy === 'team' ? S('made by the team') : S('made with an invitation')) + ' · ' +
        esc(a.consentAt ? S('consent given on {date}', { date: dayText(a.consentAt) }) : S('consent at the first sign-in')) + '</small>' +
        (a.code && act ? '<div><small class="msgnote">' + esc(S('Sign-in code to give to {name} (valid 15 minutes):', { name: a.name })) + '</small><br><span class="msgcode">' + esc(a.code) + '</span></div>' : '') +
        '<div class="msgrow">' +
        (act ? '<label class="msgfield" style="flex:1 1 240px">' + esc(S('Video-call link (Family tab)')) + '<select data-m="calllink" data-id="' + esc(a.id) + '"><option value="">' + esc(S('none')) + '</option>' +
          calls.map(function (k) { return '<option value="' + esc(k.link) + '"' + (k.link === a.callLink ? ' selected' : '') + '>' + esc(k.name) + '</option>'; }).join('') +
          (a.callLink && !calls.some(function (k) { return k.link === a.callLink; }) ? '<option value="' + esc(a.callLink) + '" selected>' + esc(S('link kept')) + '</option>' : '') + '</select></label>' +
          '<button type="button" class="ghost sm" data-m="code" data-id="' + esc(a.id) + '">' + esc(S('New sign-in code')) + '</button>' : '') +
        (act ? '<button type="button" class="ghost sm" data-m="status" data-status="suspended" data-id="' + esc(a.id) + '">' + esc(S('Suspend')) + '</button>'
          : '<button type="button" class="go" data-m="status" data-status="active" data-id="' + esc(a.id) + '">' + esc(S('Validate')) + '</button>') +
        (a.status !== 'removed' ? '<button type="button" class="ghost sm danger" data-m="status" data-status="removed" data-id="' + esc(a.id) + '">' + esc(S('Remove the access')) + '</button>' : '') +
        '<button type="button" class="ghost sm danger" data-m="erase-acc" data-id="' + esc(a.id) + '">' + esc(S('Erase this relative’s data')) + '</button></div></div>';
    }).join('') : '<p class="msgempty">' + esc(S('No family account yet.')) + '</p>';
    h += '<details class="msgbox"><summary>' + esc(S('Create an account for a family member')) + '</summary><div class="msgrow">' +
      '<label class="field">' + esc(S('First name')) + '<input id="msgAccName" type="text" maxlength="40"></label>' +
      '<label class="field">' + esc(S('Relation (optional)')) + '<input id="msgAccRel" type="text" maxlength="40" placeholder="' + esc(S('e.g. granddaughter')) + '"></label>' +
      '<label class="field">' + esc(S('Email address')) + '<input id="msgAccEmail" type="email" maxlength="160"></label>' +
      '<label class="field">' + esc(S('Portal language')) + '<select id="msgAccLang"><option value="fr">Français</option><option value="de">Deutsch</option><option value="en">English</option></select></label>' +
      '<button type="button" class="go" data-m="account">' + esc(S('Create')) + '</button></div>' +
      '<p class="msgnote">' + esc(S('No email is sent: give the sign-in code shown here by phone or on paper. The family member gives their consent at the first sign-in.')) + '</p></details>';
    return h + '</div>';
  }
  function callLinks(c) {
    if (!window.FamilyCall) return [];
    var r = FamilyCall.book().residents[c];
    return r && Array.isArray(r.contacts) ? r.contacts.filter(function (k) { return !!k.token; }).map(function (k) { return { name: k.name, link: FamilyCall.link('t', k.token) }; }) : [];
  }
  function settingsHtml(c, r) {
    var s = FM.settings();
    return '<details class="section msgsec"><summary><b>' + esc(S('Settings and data')) + '</b></summary>' +
      '<label class="msgcheck"><input type="checkbox" id="msgAuto"' + (s.auto ? ' checked' : '') + '> <span>' + esc(S('Bellatrix offers new messages by itself when the patient screen is free')) + '</span></label>' +
      '<div class="msgrow"><label class="msgfield">' + esc(S('from')) + '<input type="time" id="msgFrom" value="' + esc(s.from) + '"></label><label class="msgfield">' + esc(S('to')) + '<input type="time" id="msgTo" value="' + esc(s.to) + '"></label></div>' +
      '<p class="msgnote">' + esc(S('Server: {address}', { address: FM.server() || location.origin })) + ' · ' + esc(S('the address of the Family tab (Settings).')) + '</p>' +
      '<p class="msgnote">' + esc(S('Kept on the server: what the family sent, deleted {n} days after it was read. On this robot: the messages for offline use.', { n: st ? st.keepDays : 30 })) + '</p>' +
      (r ? (confirmErase ? '<div class="msgbox warn"><b>' + esc(S('Erase every family portal data of {code}: accounts, invitations, messages, photos and offers? This cannot be undone.', { code: c })) + '</b>' +
        '<div class="msgdecide"><button type="button" class="go" data-m="erase-yes">' + esc(S('Yes, erase')) + '</button><button type="button" class="ghost" data-m="erase-no">' + esc(S('No')) + '</button></div></div>'
        : '<button type="button" class="ghost danger" data-m="erase">' + esc(S('Erase all family data of {code}', { code: c })) + '</button>') : '') +
      '</details>';
  }

  /* ---------- printing and the big QR code ---------- */
  function cardHtml(c) {
    var r = resident(code()), url = FM.portalUrl() + '#i=' + c, name = r ? r.label : code();
    return '<div style="font-family:system-ui,sans-serif;max-width:620px;margin:0 auto;padding:28px;border:2px solid #00519E;border-radius:5px;color:#333333">' +
      '<h1 style="margin:0 0 8px;font-size:26px">Bellatrix · ' + esc(S('Family portal')) + '</h1>' +
      '<p style="font-size:18px;margin:0 0 16px">' + esc(S('Send photos and messages to {name}. Bellatrix shows them.', { name: name })) + '</p>' +
      '<div style="display:flex;gap:24px;align-items:center"><div style="width:220px;height:220px">' + (window.BellatrixQR ? BellatrixQR.svg(url) : '') + '</div>' +
      '<div><p style="margin:0 0 6px">' + esc(S('1. Scan the code with your phone.')) + '</p><p style="margin:0 0 6px">' + esc(S('2. Or open {url} and type the code:', { url: url.replace(/#.*$/, '') })) + '</p>' +
      '<p style="font:700 34px monospace;letter-spacing:.12em;margin:8px 0">' + esc(c) + '</p><p style="margin:0;color:#5C665F;font-size:14px">' + esc(S('Valid 14 days, for one family member.')) + '</p></div></div>' +
      '<p style="margin:16px 0 0;color:#5C665F;font-size:13px">' + esc(S('Your messages are deleted 30 days after they are read. You can withdraw your consent at any time.')) + '</p></div>';
  }
  function printCard(c) {
    if (window.BellatrixApp) { bigQrShow(c); return; }   /* the robot cannot print: shown big instead */
    var f = document.createElement('iframe');
    f.style.position = 'fixed'; f.style.right = '0'; f.style.bottom = '0'; f.style.width = '0'; f.style.height = '0'; f.style.border = '0';
    document.body.appendChild(f);
    var d = f.contentWindow.document;
    d.open(); d.write('<!doctype html><html><head><meta charset="utf-8"><title>Bellatrix</title></head><body>' + cardHtml(c) + '</body></html>'); d.close();
    setTimeout(function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { bigQrShow(c); } setTimeout(function () { f.parentNode.removeChild(f); }, 2000); }, 300);
  }
  function bigQrShow(c) {
    var el = document.createElement('div'), url = FM.portalUrl() + '#i=' + c;
    el.className = 'msgbigqr';
    el.innerHTML = '<h2>' + esc(S('Scan with your phone')) + '</h2><span class="msgqr">' + (window.BellatrixQR ? BellatrixQR.svg(url) : '') + '</span><span class="msgcode">' + esc(c) + '</span>' +
      '<p>' + esc(url.replace(/#.*$/, '')) + '</p><button type="button" class="go">' + esc(S('Close')) + '</button>';
    el.addEventListener('click', function (e) { if (e.target.tagName === 'BUTTON') el.parentNode.removeChild(el); });
    document.body.appendChild(el);
  }

  /* ---------- clicks ---------- */
  function onChange(e) {
    var t = e.target;
    /* The consent being chosen is kept until it is saved, so a redraw meanwhile does not undo it. */
    if (t.name === 'msgLevel' || t.id === 'msgConsentBy') {
      var rr = resident(code());
      if (rr) { var dd = consentDraft[rr.rid] = consentDraft[rr.rid] || {}; if (t.name === 'msgLevel') dd.level = t.value; else dd.by = t.value; }
      return;
    }
    if (t.id === 'msgAuto' || t.id === 'msgFrom' || t.id === 'msgTo') {
      FM.setSettings({ auto: $('msgAuto').checked, from: $('msgFrom').value || '09:00', to: $('msgTo').value || '20:00' });
      toast(S('Saved.'));
      return;
    }
    if (t.getAttribute && t.getAttribute('data-m') === 'calllink') {
      post('robot/account/call', { account: t.getAttribute('data-id'), link: t.value }).then(function () { toast(t.value ? S('The family member now sees a "Video call" button in the portal.') : S('Video-call button removed.')); return refresh(); }, function (er) { toast(err(er)); });
    }
  }
  function onClick(e) {
    var b = e.target.closest ? e.target.closest('[data-m]') : null;
    if (!b || b.disabled || b.tagName === 'SELECT') return;
    var what = b.getAttribute('data-m'), id = b.getAttribute('data-id'), c = code(), r = resident(c);
    if (what === 'refresh') { refresh(); return; }
    if (what === 'offer-on') { activateOffer(id); return; }
    if (what === 'offer-later') { post('robot/offer', { id: id, decision: 'later' }).then(function () { toast(S('All right, later.')); return refresh(); }, function (er) { toast(err(er)); }); return; }
    if (what === 'offer-stop') { post('robot/offer', { id: id, decision: 'stop' }).then(refresh, function (er) { toast(err(er)); }); return; }
    if (what === 'seen') { post('robot/notification/seen', { ids: [id] }).then(refresh, function (er) { toast(err(er)); }); return; }
    /* BF-13: the team brought Bellatrix to the resident: the message opens on the patient screen. The trip
       itself is logged for the day the LuckiBot navigation is connected (robot/navigate). */
    if (what === 'robot-here') {
      var rcode = b.getAttribute('data-code'), msgId = b.getAttribute('data-msg');
      /* 15 Nov: on a robot with a head and a tablet the message is shown on the TABLET, through the same
         visit as "Go to …" (js/family-visit-staff.js), never on the head's own patient screen. */
      if (window.LinkStaff && LinkStaff.configured && LinkStaff.configured() && window.FamilyVisitStaff && FamilyVisitStaff.go) {
        post('robot/notification/seen', { ids: [id] }).catch(function () { /* next time */ });
        FamilyVisitStaff.go(rcode);
        setTimeout(refresh, 800);
        return;
      }
      post('robot/navigate', { rid: b.getAttribute('data-rid'), notification: id, staff: staffInitials(), place: 'with the resident' }).catch(function () { /* only a log */ });
      post('robot/notification/seen', { ids: [id] }).catch(function () { /* next time */ });
      FM.sync().catch(function () { /* the patient screen syncs too */ }).then(function () { FM.showOnPatient(rcode, [msgId]); });
      toast(S('Shown on the patient screen.'));
      if (window.BellatrixApp && window.BellatrixApp.openPatient) { try { window.BellatrixApp.openPatient(); } catch (e2) { /* the patient screen picks it up */ } }
      setTimeout(refresh, 800);
      return;
    }
    if (what === 'withdraw') { confirmWithdraw = id; render(); return; }
    if (what === 'withdraw-no') { confirmWithdraw = ''; render(); return; }
    if (what === 'withdraw-yes') { confirmWithdraw = ''; post('robot/withdraw', { id: id }).then(function () { toast(S('Hidden.')); FM.sync().catch(function () {}); return refresh(); }, function (er) { toast(err(er)); }); return; }
    if (what === 'consent' && r) {
      var lv = document.querySelector('#msgBody input[name="msgLevel"]:checked');
      if (!lv) return;
      post('robot/resident/consent', { rid: r.rid, level: lv.value, by: $('msgConsentBy').value, staff: staffInitials() }).then(function () { delete consentDraft[r.rid]; toast(S('Consent saved: it applies at once.')); return refresh(); }, function (er) { toast(err(er)); });
      return;
    }
    if (what === 'access-ok' || what === 'access-no') {
      post('robot/account/status', { account: id, status: what === 'access-ok' ? 'active' : 'refused', staff: staffInitials() })
        .then(function () { toast(S(what === 'access-ok' ? 'Access approved.' : 'Request declined.')); return refresh(); }, function (er) { toast(err(er)); });
      return;
    }
    if (what === 'status') {
      var s2 = b.getAttribute('data-status');
      post('robot/account/status', { account: id, status: s2, staff: staffInitials() }).then(function () {
        toast(S(s2 === 'suspended' ? 'Access suspended: the relative loses access at once. Nothing is deleted.' : s2 === 'removed' ? 'Access removed. Nothing is deleted.' : 'Access validated.'));
        return refresh();
      }, function (er) { toast(err(er)); });
      return;
    }
    if (what === 'erase-acc') {
      if (!window.confirm(S('Erase this access and everything this relative sent to {code}? This cannot be undone.', { code: c }))) return;
      post('robot/account/erase', { account: id }).then(function () { toast(S('Account removed.')); FM.sync().catch(function () {}); return refresh(); }, function (er) { toast(err(er)); });
      return;
    }
    if (what === 'resident') {
      var label = ($('msgLabel') && $('msgLabel').value || '').trim();
      if (!label) { toast(S('A first name is needed.')); return; }
      post('robot/resident', { code: c, label: label, lang: I18N.valid(prefs(c).lang) }).then(function () { toast(S('Saved.')); return refresh(); }, function (er) { toast(err(er)); });
      return;
    }
    if (what === 'invite' && r) { post('robot/invite', { rid: r.rid }).then(function () { return refresh(); }, function (er) { toast(err(er)); }); return; }
    if (what === 'uninvite' && r) { post('robot/invite/cancel', { code: b.getAttribute('data-code') }).then(refresh, function (er) { toast(err(er)); }); return; }
    if (what === 'print') { printCard(b.getAttribute('data-code')); return; }
    if (what === 'bigqr') { bigQrShow(b.getAttribute('data-code')); return; }
    if (what === 'account' && r) {
      post('robot/account', { rid: r.rid, name: $('msgAccName').value, relation: $('msgAccRel').value, email: $('msgAccEmail').value, lang: $('msgAccLang').value })
        .then(function () { toast(S('Account created. Give the sign-in code to the family member.')); return refresh(); }, function (er) { toast(err(er)); });
      return;
    }
    if (what === 'code') { post('robot/account/code', { account: id }).then(refresh, function (er) { toast(err(er)); }); return; }
    if (what === 'erase') { confirmErase = true; render(); return; }
    if (what === 'erase-no') { confirmErase = false; render(); return; }
    if (what === 'erase-yes' && r) {
      confirmErase = false;
      post('robot/resident/erase', { rid: r.rid }).then(function () { toast(S('Every family portal data of {code} has been erased.', { code: c })); FM.sync().catch(function () {}); return refresh(); }, function (er) { toast(err(er)); });
    }
  }

  /* ---------- start ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    if (!FM || !mount()) return;
    /* The start-of-shift checklist (js/staff-tools.js) lists what waits here. */
    if (window.StaffTools && typeof StaffTools.addDaySource === 'function') {
      StaffTools.addDaySource(function () {
        var out = [];
        pendingAccess().forEach(function (q) { out.push({ text: accessText(q), todo: true }); });
        openOffers().forEach(function (o) { out.push({ text: S('The family of {code} offered {product}', { code: o.code, product: productName(offerProduct(o)) }), todo: true }); });
        return out;
      });
    }
    var p = $('fParticipant');
    if (p) p.addEventListener('change', function () { if (isOpen) render(); });
    window.addEventListener('bellatrix-play-premium', function () { if (isOpen && !typing()) render(); });
    if (window.StaffUI && StaffUI.current) follow(StaffUI.current());
    refresh();
    setInterval(function () { if (document.visibilityState !== 'hidden') refresh(); }, 20000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh(); });
  });

  return { refresh: refresh, open: function () { show(true); }, _state: function () { return st; } };
})();
