/* Family portal 1.16 (agent F2): the resident's follow-up in the portal (BF-05 to BF-09).
   One tab "Suivi" (Portail.addTab, js/portail.js), shown only at consent level 'all' (BF-27), with
   five parts: Aujourd'hui (live: asked again every 30 s while it is on screen), Historique (by date),
   Écoutes (music, podcasts, books, karaoke), Résumé (the day and the last 7 days, compared with the
   7 days before; participation only when the data exists, BF-07; NO mood, Rahma 10 Nov) and Moments (photos and
   moments shared by the care team, important events, BF-09).
   The server: labland/family-feed.mjs (/portal/api/feed/family/...). Its look: css/portail-feed.css,
   loaded by this file. Texts: English keys, French and German below. ES5. */
(function () {
  'use strict';
  if (typeof I18N === 'undefined') return;

  /* ---------- texts ---------- */
  (function () {
    function addNew(l, t) { var have = I18N.dict[l] || {}, out = {}; Object.keys(t).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(have, k)) out[k] = t[k]; }); I18N.add(l, out); }
    addNew('fr', {
      '7 days': '7 jours', 'The day of {name}': 'La journée de {name}', 'Follow-up': 'Suivi', 'Today': 'Aujourd’hui', 'History': 'Historique', 'Listening': 'Écoutes', 'Summary': 'Résumé', 'Moments': 'Moments',
      'Live': 'En direct', 'Updated at {time}': 'Mis à jour à {time}', 'New': 'Nouveau',
      'Activities': 'Activités', 'Time': 'Temps', 'Heard': 'Écoute', 'Games won': 'Parties gagnées',
      'Nothing yet today': 'Rien encore aujourd’hui',
      'Each activity {name} finishes appears here.': 'Chaque activité terminée par {name} apparaît ici.',
      'Nothing on this day': 'Rien ce jour-là', 'Choose another day.': 'Choisissez un autre jour.',
      'Other date': 'Autre date', 'Kept {n} days': 'Gardé {n} jours',
      'No listening in these 7 days': 'Aucune écoute ces 7 jours',
      'Songs, podcasts, books and karaoke appear here.': 'Chansons, podcasts, livres et karaoké apparaissent ici.',
      'All': 'Tout', 'Music': 'Musique', 'Podcasts': 'Podcasts', 'Books': 'Livres', 'Karaoke': 'Karaoké',
      'Podcast': 'Podcast', 'Book': 'Livre',
      'Last 7 days': '7 derniers jours', 'vs the 7 days before': 'vs les 7 jours d’avant', 'First week: no comparison yet.': 'Première semaine : pas encore de comparaison.',
      'Most done': 'Le plus fait', 'Participation': 'Participation', 'Done to the end: {a} of {b}': 'Terminées : {a} sur {b}',
      'Would do it again: {n}': 'Envie de recommencer : {n}',
      'No moments yet': 'Pas encore de moment', 'The care team shares photos and good moments here.': 'L’équipe partage ici des photos et de beaux moments.',
      'Shared by the care team': 'Partagé par l’équipe',
      'No summary yet': 'Pas encore de résumé', 'It starts with the first activity.': 'Il commence avec la première activité.',
      'Could not load.': 'Chargement impossible.', 'Try again': 'Réessayer',
      'Done': 'Terminée', 'Stopped early': 'Arrêtée plus tôt',
      '{m} min': '{m} min', '{h} h {m} min': '{h} h {m}', '{h} h': '{h} h', 'under a minute': 'moins d’une minute', '{n} min of listening': '{n} min d’écoute',
      'Won': 'Gagné', 'Bellatrix won': 'Bellatrix a gagné', 'Draw': 'Match nul', 'Two players': 'À deux', 'No winner': 'Sans vainqueur',
      '{n} of {of} puzzles': '{n} énigmes sur {of}', 'Level {n}': 'Niveau {n}',
      '1 saying found': '1 proverbe trouvé', '{n} sayings found': '{n} proverbes trouvés',
      '1 song guessed': '1 chanson devinée', '{n} songs guessed': '{n} chansons devinées',
      '1 movement': '1 mouvement', '{n} movements': '{n} mouvements',
      '1 song sung': '1 chanson chantée', '{n} songs sung': '{n} chansons chantées',
      '1 photo': '1 photo', '{n} photos': '{n} photos',
      '1 page': '1 page', '{n} pages': '{n} pages',
      '1 title': '1 titre', '{n} titles': '{n} titres',
      'Call: {n} min': 'Appel : {n} min', '1 message read': '1 message lu', '{n} messages read': '{n} messages lus',
      'Happy birthday!': 'Joyeux anniversaire !', 'First karaoke!': 'Premier karaoké !', 'First game won!': 'Première partie gagnée !', 'A whole book heard': 'Un livre écouté en entier',
      'Hello & Today': 'Bonjour et programme du jour', 'Finish the Saying': 'Complétez le proverbe', 'Guess the Song': 'Devinez la chanson',
      'Seated Move Along': 'Bouger assis', 'Picture Pair': 'Paires d’images', 'Daily Choice': 'Choix du jour', 'Kindness Quiz': 'Quiz de la gentillesse',
      'Memories': 'Souvenirs', 'Family call': 'Appel de la famille', 'Group karaoke': 'Karaoké de groupe', 'Family messages': 'Messages de la famille',
      'Bellatrix Play': 'Bellatrix Play', 'Book reading': 'Lecture', 'Chess': 'Échecs', 'Ludo': 'Petits chevaux', 'Activity': 'Activité', 'Welcome': 'Accueil du jour'
    });
    addNew('de', {
      '7 days': '7 Tage', 'The day of {name}': 'Der Tag von {name}', 'Follow-up': 'Verlauf', 'Today': 'Heute', 'History': 'Kalender', 'Listening': 'Gehört', 'Summary': 'Übersicht', 'Moments': 'Momente',
      'Live': 'Live', 'Updated at {time}': 'Aktualisiert um {time}', 'New': 'Neu',
      'Activities': 'Aktivitäten', 'Time': 'Zeit', 'Heard': 'Gehört', 'Games won': 'Gewonnene Spiele',
      'Nothing yet today': 'Heute noch nichts',
      'Each activity {name} finishes appears here.': 'Jede Aktivität, die {name} beendet, erscheint hier.',
      'Nothing on this day': 'An diesem Tag nichts', 'Choose another day.': 'Wählen Sie einen anderen Tag.',
      'Other date': 'Anderes Datum', 'Kept {n} days': '{n} Tage gespeichert',
      'No listening in these 7 days': 'In diesen 7 Tagen nichts gehört',
      'Songs, podcasts, books and karaoke appear here.': 'Lieder, Podcasts, Bücher und Karaoke erscheinen hier.',
      'All': 'Alle', 'Music': 'Musik', 'Podcasts': 'Podcasts', 'Books': 'Bücher', 'Karaoke': 'Karaoke',
      'Podcast': 'Podcast', 'Book': 'Buch',
      'Last 7 days': 'Letzte 7 Tage', 'vs the 7 days before': 'ggü. den 7 Tagen davor', 'First week: no comparison yet.': 'Erste Woche: noch kein Vergleich.',
      'Most done': 'Am häufigsten', 'Participation': 'Teilnahme', 'Done to the end: {a} of {b}': 'Bis zum Ende: {a} von {b}',
      'Would do it again: {n}': 'Möchte es wieder tun: {n}',
      'No moments yet': 'Noch keine Momente', 'The care team shares photos and good moments here.': 'Das Pflegeteam teilt hier Fotos und schöne Momente.',
      'Shared by the care team': 'Vom Pflegeteam geteilt',
      'No summary yet': 'Noch keine Übersicht', 'It starts with the first activity.': 'Sie beginnt mit der ersten Aktivität.',
      'Could not load.': 'Laden nicht möglich.', 'Try again': 'Erneut versuchen',
      'Done': 'Abgeschlossen', 'Stopped early': 'Früher beendet',
      '{m} min': '{m} Min.', '{h} h {m} min': '{h} Std. {m} Min.', '{h} h': '{h} Std.', 'under a minute': 'unter einer Minute', '{n} min of listening': '{n} Min. gehört',
      'Won': 'Gewonnen', 'Bellatrix won': 'Bellatrix hat gewonnen', 'Draw': 'Unentschieden', 'Two players': 'Zu zweit', 'No winner': 'Ohne Sieger',
      '{n} of {of} puzzles': '{n} von {of} Rätseln', 'Level {n}': 'Stufe {n}',
      '1 saying found': '1 Sprichwort gefunden', '{n} sayings found': '{n} Sprichwörter gefunden',
      '1 song guessed': '1 Lied erraten', '{n} songs guessed': '{n} Lieder erraten',
      '1 movement': '1 Bewegung', '{n} movements': '{n} Bewegungen',
      '1 song sung': '1 Lied gesungen', '{n} songs sung': '{n} Lieder gesungen',
      '1 photo': '1 Foto', '{n} photos': '{n} Fotos',
      '1 page': '1 Seite', '{n} pages': '{n} Seiten',
      '1 title': '1 Titel', '{n} titles': '{n} Titel',
      'Call: {n} min': 'Anruf: {n} Min.', '1 message read': '1 Nachricht gelesen', '{n} messages read': '{n} Nachrichten gelesen',
      'Happy birthday!': 'Alles Gute zum Geburtstag!', 'First karaoke!': 'Erstes Karaoke!', 'First game won!': 'Erstes Spiel gewonnen!', 'A whole book heard': 'Ein ganzes Buch gehört',
      'Hello & Today': 'Guten Tag & Tagesplan', 'Finish the Saying': 'Sprichwörter ergänzen', 'Guess the Song': 'Lieder raten',
      'Seated Move Along': 'Bewegung im Sitzen', 'Picture Pair': 'Bilderpaare', 'Daily Choice': 'Wahl des Tages', 'Kindness Quiz': 'Freundlichkeits-Quiz',
      'Memories': 'Erinnerungen', 'Family call': 'Anruf der Familie', 'Group karaoke': 'Gruppen-Karaoke', 'Family messages': 'Nachrichten der Familie',
      'Bellatrix Play': 'Bellatrix Play', 'Book reading': 'Lesen', 'Chess': 'Schach', 'Ludo': 'Mensch ärgere dich nicht', 'Activity': 'Aktivität', 'Welcome': 'Begrüßung'
    });
  })();

  /* ---------- drawing ---------- */
  function svg(d, extra) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"' + (extra || '') + '>' + d + '</svg>'; }
  var S2 = ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  var G = {
    feed: svg('<path d="M3 12 h4 l3-7 4 14 3-7 h4"' + S2 + '/>'),
    today: svg('<circle cx="12" cy="12" r="4"' + S2 + '/><path d="M12 2.5 v2 M12 19.5 v2 M2.5 12 h2 M19.5 12 h2 M5.3 5.3 l1.4 1.4 M17.3 17.3 l1.4 1.4 M5.3 18.7 l1.4-1.4 M17.3 6.7 l1.4-1.4"' + S2 + '/>'),
    history: svg('<rect x="3.5" y="5" width="17" height="15" rx="3"' + S2 + '/><path d="M3.5 10 h17 M8 3 v4 M16 3 v4"' + S2 + '/>'),
    listen: svg('<path d="M4 15 v-3 a8 8 0 0 1 16 0 v3"' + S2 + '/><rect x="3" y="14" width="5" height="7" rx="2" fill="currentColor"/><rect x="16" y="14" width="5" height="7" rx="2" fill="currentColor"/>'),
    summary: svg('<path d="M5 20 V11 M12 20 V5 M19 20 v-6"' + S2 + ' stroke-width="3"/>'),
    moments: svg('<path d="M12 20 C5 15.5 3 12 4.5 9 C6 6 9.5 6 12 9 C14.5 6 18 6 19.5 9 C21 12 19 15.5 12 20 Z"' + S2 + '/>'),
    music: svg('<path d="M9 18 V5 l11-2 v13"' + S2 + '/><circle cx="6.5" cy="18" r="2.6" fill="currentColor"/><circle cx="17.5" cy="16" r="2.6" fill="currentColor"/>'),
    podcast: svg('<circle cx="12" cy="11" r="2.2" fill="currentColor"/><path d="M8.3 14.7 a5.2 5.2 0 0 1 0-7.4 M15.7 7.3 a5.2 5.2 0 0 1 0 7.4 M5.5 17.5 a9.2 9.2 0 0 1 0-13 M18.5 4.5 a9.2 9.2 0 0 1 0 13 M12 13.5 V21"' + S2 + '/>'),
    book: svg('<path d="M12 6.5 C9.5 4.5 6 4.5 3 5.5 V19 C6 18 9.5 18 12 20 C14.5 18 18 18 21 19 V5.5 C18 4.5 14.5 4.5 12 6.5 Z M12 6.5 V20"' + S2 + '/>'),
    karaoke: svg('<rect x="8.5" y="2.5" width="7" height="11" rx="3.5" fill="currentColor"/><path d="M5.5 10.5 a6.5 6.5 0 0 0 13 0 M12 17 V21 M8.5 21 h7"' + S2 + '/>'),
    game: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="4"' + S2 + '/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor"/>'),
    chess: svg('<path d="M9 21 h7.5 a1 1 0 0 0 1-1 v-1 a1 1 0 0 0-1-1 h-7.5 a1 1 0 0 0-1 1 v1 a1 1 0 0 0 1 1 Z M9.5 17 h6.5 c-.6-2.6-.6-4.4.7-6.4 l1.3-2 c.4-.7.2-1.6-.5-2 L14.6 4.2 C13.8 3.7 13 3.4 12 3.5 L10.5 2.5 v2.2 C8.6 5.8 7.5 7.6 7 10 l2.4.6 1.8-1.6 c.3 3.5-.8 5.3-1.7 8 Z" fill="currentColor"/>'),
    words: svg('<path d="M4 5 h16 v11 h-9 l-5 4 v-4 h-2 z"' + S2 + '/><path d="M8 9 h8 M8 12 h5"' + S2 + '/>'),
    move: svg('<circle cx="12" cy="4.5" r="2"' + S2 + '/><path d="M12 7 v6 M7 10 l5-2 5 2 M9 21 l3-8 3 8"' + S2 + '/>'),
    photo: svg('<rect x="3" y="5" width="18" height="15" rx="3"' + S2 + '/><path d="M6.5 16.5 l4-4.5 3 3.5 2-2 2.5 3"' + S2 + '/><circle cx="9" cy="9.5" r="1.5" fill="currentColor"/>'),
    call: svg('<rect x="2.5" y="6" width="13" height="12" rx="3" fill="currentColor"/><path d="M16.5 10.5 L21.5 7.5 V16.5 L16.5 13.5 Z" fill="currentColor"/>'),
    message: svg('<rect x="3" y="5" width="18" height="14" rx="3"' + S2 + '/><path d="M3.5 6.5 L12 13 L20.5 6.5"' + S2 + '/>'),
    sun: svg('<circle cx="12" cy="12" r="4.5"' + S2 + '/><path d="M12 2.5 v2 M12 19.5 v2 M2.5 12 h2 M19.5 12 h2"' + S2 + '/>'),
    list: svg('<path d="M9 6 h11 M9 12 h11 M9 18 h11"' + S2 + '/><circle cx="4.5" cy="6" r="1.4" fill="currentColor"/><circle cx="4.5" cy="12" r="1.4" fill="currentColor"/><circle cx="4.5" cy="18" r="1.4" fill="currentColor"/>'),
    cake: svg('<path d="M4 20 h16 V12 a2 2 0 0 0-2-2 H6 a2 2 0 0 0-2 2 Z M4 15 c2.5 1.5 5.5 1.5 8 0 c2.5 1.5 5.5 1.5 8 0 M12 10 V6.5"' + S2 + '/><path d="M12 2.8 c1.2 1.4 1.2 2.6 0 3.4 c-1.2-.8-1.2-2 0-3.4 Z" fill="currentColor"/>'),
    trophy: svg('<path d="M7 4 h10 v4 a5 5 0 0 1-10 0 Z M7 6 H4 v1 a3 3 0 0 0 3 3 M17 6 h3 v1 a3 3 0 0 1-3 3 M12 13 v4 M8 20 h8 M9.5 17 h5"' + S2 + '/>'),
    up: svg('<path d="M12 19 V5 M6 11 l6-6 6 6"' + S2 + ' stroke-width="2.6"/>'),
    down: svg('<path d="M12 5 v14 M6 13 l6 6 6-6"' + S2 + ' stroke-width="2.6"/>'),
    flat: svg('<path d="M5 12 h14"' + S2 + ' stroke-width="2.6"/>'),
    clock: svg('<circle cx="12" cy="12" r="8.5"' + S2 + '/><path d="M12 7 v5 l3 2"' + S2 + '/>'),
  };
  /* activity key -> [English name (the robot's own), glyph, colour family] */
  var ACT = {
    hello: ['Hello & Today', 'sun', 'c-ochre'], welcome: ['Welcome', 'sun', 'c-ochre'], daily: ['Welcome', 'sun', 'c-ochre'],
    sayings: ['Finish the Saying', 'words', 'c-sage'], quiz: ['Kindness Quiz', 'words', 'c-sage'], choice: ['Daily Choice', 'list', 'c-sage'],
    song: ['Guess the Song', 'music', 'c-apricot'], play: ['Bellatrix Play', 'music', 'c-apricot'], karaoke: ['Group karaoke', 'karaoke', 'c-apricot'],
    move: ['Seated Move Along', 'move', 'c-terra'], pairs: ['Picture Pair', 'game', 'c-green'], chess: ['Chess', 'chess', 'c-green'], ludo: ['Ludo', 'game', 'c-green'],
    album: ['Memories', 'photo', 'c-ochre'], reading: ['Book reading', 'book', 'c-sage'], familycall: ['Family call', 'call', 'c-terra'], messages: ['Family messages', 'message', 'c-terra']
  };
  var TYPE = { music: ['Music', 'music', 'c-apricot'], podcast: ['Podcast', 'podcast', 'c-sage'], book: ['Book', 'book', 'c-green'], karaoke: ['Karaoke', 'karaoke', 'c-terra'] };
  var EVENT = { 'birthday': ['Happy birthday!', 'cake'], 'first-karaoke': ['First karaoke!', 'karaoke'], 'first-win': ['First game won!', 'trophy'], 'first-book': ['A whole book heard', 'book'] };
  var LOCALE = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE' };
  var SUBS = [['today', 'Today', 'today'], ['summary', '7 days', 'summary'], ['moments', 'Moments', 'moments']];
  var MORE = [['history', 'History'], ['listen', 'Listening']];

  /* ---------- state (per page; kept while the tab is closed and opened again) ---------- */
  var S = { lang: 'fr', sub: 'today', day: '', type: 'all', rid: '', label: '', cache: {}, known: null, fresh: {}, timer: null, el: null, ctx: null, photos: {}, updated: 0, loading: {}, failed: {} };
  function T(s, v) { return I18N.t(S.lang, s, v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(day, n) { var d = new Date(Date.parse(day + 'T12:00:00Z') + n * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function dayDate(day) { var p = day.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function fmt(d, o) { try { return d.toLocaleString(LOCALE[S.lang], o); } catch (e) { return d.toDateString(); } }
  function hhmm(isoT) { return fmt(new Date(isoT), { hour: '2-digit', minute: '2-digit' }); }
  function dayLong(day) { return day === today() ? T('Today') : fmt(dayDate(day), { weekday: 'long', day: 'numeric', month: 'long' }); }
  function dur(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    if (sec < 60) return T('under a minute');
    var m = Math.round(sec / 60);
    if (m < 60) return T('{m} min', { m: m });
    var h = Math.floor(m / 60), r = m % 60;
    return r ? T('{h} h {m} min', { h: h, m: S.lang === 'fr' ? pad(r) : r }) : T('{h} h', { h: h });
  }
  function mins(m) { return dur((m || 0) * 60); }
  /* the big numbers: "1 h 20" in every language, so it fits a tile */
  function short(m) { m = Math.round(m || 0); if (m < 60) return T('{m} min', { m: m }); var h = Math.floor(m / 60), r = m % 60; return h + ' h' + (r ? ' ' + pad(r) : ''); }
  function plural(n, one, many, v) { v = v || {}; v.n = n; return T(n === 1 ? one : many, v); }
  function actName(k) { return T((ACT[k] || ['Activity'])[0]); }
  function resultText(r) {
    if (!r) return '';
    var n = r.n || 0;
    switch (r.k) {
      case 'chess': case 'ludo': return r.v === 'win' ? T('Won') : r.v === 'loss' ? T('Bellatrix won') : r.v === 'draw' ? T('Draw') : r.v === 'two-players' ? T('Two players') : r.v === 'none' ? T('No winner') : '';
      case 'puzzles': return T('{n} of {of} puzzles', { n: n, of: r.of || 0 });
      case 'pairs': return T('Level {n}', { n: n });
      case 'sayings': return plural(n, '1 saying found', '{n} sayings found');
      case 'songs': return plural(n, '1 song guessed', '{n} songs guessed');
      case 'reps': return plural(n, '1 movement', '{n} movements');
      case 'karaoke': return plural(n, '1 song sung', '{n} songs sung');
      case 'pictures': return plural(n, '1 photo', '{n} photos');
      case 'pages': return plural(n, '1 page', '{n} pages');
      case 'play': return plural(n, '1 title', '{n} titles');
      case 'call': return T('Call: {n} min', { n: n });
      case 'messages': return plural(n, '1 message read', '{n} messages read');
    }
    return '';
  }

  /* ---------- talking to the server ---------- */
  function headers() {
    var h = {}, tok = '';
    try { tok = localStorage.getItem('bellatrix-portail-token') || ''; } catch (e) { tok = ''; }
    if (tok) h.Authorization = 'Bearer ' + tok;
    if (S.rid) h['X-Resident'] = S.rid;
    return h;
  }
  function get(path, blob) {
    var P = window.Portail;
    /* the portal's own call: this phone's session and the chosen resident (X-Resident) */
    if (P && typeof P.api === 'function') return Promise.resolve(P.api('feed/family/' + path, { method: 'GET', blob: !!blob }));
    return fetch('portal/api/feed/family/' + path, { headers: headers(), cache: 'no-store' }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { var e = new Error(j.error || 'http-' + r.status); e.code = j.error || ''; e.status = r.status; throw e; });
      return blob ? r.blob() : r.json();
    });
  }
  function load(key, path, done) {
    if (S.loading[key]) return;
    S.loading[key] = true;
    get(path).then(function (j) {
      S.loading[key] = false; S.failed[key] = false; S.cache[S.rid + '|' + key] = j; S.updated = Date.now();
      if (done) done(j);
      paint();
    }, function (e) {
      S.loading[key] = false; S.failed[key] = true;
      if (e && e.code === 'consent') S.cache[S.rid + '|' + key] = null;
      paint();
    });
  }
  function cached(key) { return S.cache[S.rid + '|' + key]; }
  function photo(id) {
    if (S.photos[id]) return;
    S.photos[id] = 'loading';
    get('photo?id=' + encodeURIComponent(id), true).then(function (b) {
      S.photos[id] = URL.createObjectURL(b);
      var imgs = S.el ? S.el.querySelectorAll('img[data-photo="' + id + '"]') : [];
      Array.prototype.forEach.call(imgs, function (im) { im.src = S.photos[id]; im.parentNode.classList.add('ready'); });
    }, function () { S.photos[id] = 'failed'; });
  }

  /* ---------- the parts ---------- */
  function badge(cls, glyph) { return '<span class="ff-ic ' + cls + '">' + G[glyph] + '</span>'; }
  function empty(glyph, title, line) {
    return '<div class="ff-empty"><span class="ff-emptyart">' + G[glyph] + '</span><h3>' + esc(title) + '</h3><p>' + esc(line) + '</p></div>';
  }
  function failedBox(key) { return '<div class="ff-empty"><p>' + esc(T('Could not load.')) + '</p><button type="button" class="ff-retry" data-ff="retry" data-key="' + key + '">' + esc(T('Try again')) + '</button></div>'; }
  function loadingBox() { return '<div class="ff-skel" aria-hidden="true"><i></i><i></i><i></i></div>'; }
  function tiles(sum) {
    var t = [[T('Activities'), String(sum.count || 0)], [T('Time'), sum.minutes ? short(sum.minutes) : '–'], [T('Heard'), sum.listenMinutes ? short(sum.listenMinutes) : '–']];
    if (sum.games && sum.games.played) t.push([T('Games won'), sum.games.won + ' / ' + sum.games.played]);
    return '<div class="ff-tiles">' + t.map(function (x) { return '<div class="ff-tile"><small>' + esc(x[0]) + '</small><b>' + esc(x[1]) + '</b></div>'; }).join('') + '</div>';
  }
  function sessionRow(x) {
    var a = ACT[x.activity] || ['Activity', 'feed', 'c-green'], res = resultText(x.result), isNew = S.fresh[x.id];
    var meta = [dur(x.dur)];
    if (x.outcome === 'completed') meta.push(T('Done')); else if (x.outcome === 'stopped') meta.push(T('Stopped early'));
    return '<li class="ff-item' + (isNew ? ' new' : '') + '"><time class="ff-time" datetime="' + esc(x.start) + '">' + esc(hhmm(x.start)) + '</time>' + badge(a[2], a[1]) +
      '<div class="ff-body"><b>' + esc(T(a[0])) + (isNew ? ' <span class="ff-new">' + esc(T('New')) + '</span>' : '') + '</b><small>' + esc(meta.join(' · ')) + '</small>' +
      (res ? '<span class="ff-res' + (x.result && x.result.v === 'win' ? ' win' : '') + '">' + (x.result && x.result.v === 'win' ? G.trophy : '') + esc(res) + '</span>' : '') + '</div></li>';
  }
  function momentRow(m) {
    if (m.kind === 'event') {
      var e = EVENT[m.event] || ['Shared by the care team', 'moments'];
      return '<li class="ff-item ff-ev"><time class="ff-time" datetime="' + esc(m.at) + '">' + esc(hhmm(m.at)) + '</time>' + badge('c-heart', e[1]) + '<div class="ff-body"><b>' + esc(T(e[0])) + '</b>' + (m.activity ? '<small>' + esc(actName(m.activity)) + '</small>' : '') + '</div></li>';
    }
    if (m.hasPhoto) photo(m.id);
    var src = S.photos[m.id] && S.photos[m.id].indexOf('blob:') === 0 ? S.photos[m.id] : '';
    return '<li class="ff-item ff-mo"><time class="ff-time" datetime="' + esc(m.at) + '">' + esc(hhmm(m.at)) + '</time>' + badge('c-heart', 'moments') +
      '<div class="ff-body"><b>' + esc(m.text || T('Shared by the care team')) + '</b>' +
      (m.hasPhoto ? '<span class="ff-pic' + (src ? ' ready' : '') + '"><img data-photo="' + esc(m.id) + '" alt="' + esc(m.text || '') + '"' + (src ? ' src="' + src + '"' : '') + '></span>' : '') + '</div></li>';
  }
  function timeline(j) {
    var rows = [];
    (j.items || []).forEach(function (x) { rows.push({ at: x.start, h: sessionRow(x) }); });
    (j.moments || []).forEach(function (m) { rows.push({ at: m.at, h: momentRow(m) }); });
    rows.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    return '<ol class="ff-list">' + rows.map(function (r) { return r.h; }).join('') + '</ol>';
  }
  function dayPart(j, live) {
    var has = j && ((j.items || []).length || (j.moments || []).length || (j.listens || []).length);
    var h = '';
    if (live) h += '<p class="ff-live"><span class="ff-dot"></span>' + esc(T('Live')) + (S.updated ? '<small>' + esc(T('Updated at {time}', { time: hhmm(new Date(S.updated).toISOString()) })) + '</small>' : '') + '</p>';
    if (!has) return h + (live ? empty('today', T('Nothing yet today'), T('Each activity {name} finishes appears here.', { name: S.label })) : empty('history', T('Nothing on this day'), T('Choose another day.')));
    h += tiles(j.summary || {});
    h += timeline(j);
    if ((j.listens || []).length) h += '<h3 class="ff-h">' + esc(T('Listening')) + '</h3>' + listenList(j.listens);
    return h;
  }
  function listenList(list) {
    return '<ol class="ff-list ff-listen">' + list.map(function (x) {
      var t = TYPE[x.type] || TYPE.music;
      return '<li class="ff-item"><time class="ff-time" datetime="' + esc(x.start) + '">' + esc(hhmm(x.start)) + '</time>' + badge(t[2], t[1]) +
        '<div class="ff-body"><b>' + esc(x.title) + '</b><small>' + esc([x.artist, T(t[0]), dur(x.dur)].filter(Boolean).join(' · ')) + '</small></div></li>';
    }).join('') + '</ol>';
  }
  function partToday() {
    var j = cached('day:' + today());
    if (j === undefined) return S.failed['day:' + today()] ? failedBox('today') : loadingBox();
    return dayPart(j, true);
  }
  function partHistory() {
    var days = cached('days'), t = today(), day = S.day || addDays(t, -1), have = {};
    ((days && days.days) || []).forEach(function (d) { have[d.day] = d; });
    var strip = '<div class="ff-strip" role="listbox" aria-label="' + esc(T('History')) + '">';
    for (var i = 13; i >= 0; i--) {
      var k = addDays(t, -i), d = dayDate(k), on = k === day, has = !!have[k];
      strip += '<button type="button" role="option" aria-selected="' + on + '" class="ff-day' + (on ? ' on' : '') + (has ? ' has' : '') + '" data-ff="day" data-day="' + k + '">' +
        '<small>' + esc(fmt(d, { weekday: 'short' })) + '</small><b>' + d.getDate() + '</b><i></i></button>';
    }
    strip += '</div>';
    var from = days && days.from ? days.from : addDays(t, -29);
    var h = strip + '<div class="ff-pick"><label><span>' + esc(T('Other date')) + '</span><input type="date" data-ff="date" min="' + from + '" max="' + t + '" value="' + day + '"></label>' +
      (days ? '<small>' + esc(T('Kept {n} days', { n: days.keepDays })) + '</small>' : '') + '</div>';
    h += '<h2 class="ff-title">' + esc(dayLong(day)) + '</h2>';
    var j = cached('day:' + day);
    if (j === undefined) return h + (S.failed['day:' + day] ? failedBox('history') : loadingBox());
    return h + dayPart(j, false);
  }
  function partListen() {
    var j = cached('listening'), types = [['all', 'All']].concat([['music', 'Music'], ['podcast', 'Podcasts'], ['book', 'Books'], ['karaoke', 'Karaoke']]);
    if (j === undefined) return S.failed.listening ? failedBox('listen') : loadingBox();
    var tot = (j && j.totals) || {};
    var h = '<div class="ff-chips" role="group">' + types.map(function (t) {
      var on = S.type === t[0], c = t[0] === 'all' ? (j.items || []).length : (tot[t[0]] || {}).count || 0;
      return '<button type="button" class="ff-chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-ff="type" data-type="' + t[0] + '">' + (t[0] !== 'all' ? G[TYPE[t[0]][1]] : '') + esc(T(t[1])) + (c ? '<i>' + c + '</i>' : '') + '</button>';
    }).join('') + '</div>';
    var list = (j.items || []).filter(function (x) { return S.type === 'all' || x.type === S.type; });
    if (!list.length) return h + empty('listen', T('No listening in these 7 days'), T('Songs, podcasts, books and karaoke appear here.'));
    var by = [], cur = null;
    list.forEach(function (x) { if (!cur || cur.day !== x.day) { cur = { day: x.day, items: [] }; by.push(cur); } cur.items.push(x); });
    return h + by.map(function (g) {
      var secs = g.items.reduce(function (a, x) { return a + (x.dur || 0); }, 0);
      return '<h3 class="ff-h">' + esc(dayLong(g.day)) + '<small>' + esc(T('{n} min of listening', { n: Math.round(secs / 60) })) + '</small></h3>' + listenList(g.items);
    }).join('');
  }
  function trend(diff, p, hasPrev, isMin) {
    if (!hasPrev) return '';
    var cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat', sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
    var txt = p !== null && p !== undefined ? sign + Math.abs(p) + ' %' : sign + (isMin ? short(Math.abs(diff)) : Math.abs(diff));
    return '<span class="ff-trend ' + cls + '">' + G[cls] + esc(txt) + '</span>';
  }
  function partSummary() {
    var j = cached('summary');
    if (j === undefined) return S.failed.summary ? failedBox('summary') : loadingBox();
    if (!j.week.count && !j.week.listens && !j.prev.count) return empty('summary', T('No summary yet'), T('It starts with the first activity.'));
    var tr = j.trend || {}, w = j.week, max = 1;
    (j.perDay || []).concat(j.prevPerDay || []).forEach(function (d) { if (d.minutes > max) max = d.minutes; });
    var h = '<section class="ff-card"><h3 class="ff-label">' + esc(T('Today')) + '</h3>' + tiles(j.today) + '</section>';
    h += '<section class="ff-card ff-week"><h3 class="ff-label">' + esc(T('Last 7 days')) + '</h3>' +
      '<div class="ff-big"><div><small>' + esc(T('Activities')) + '</small><b>' + w.count + '</b>' + trend(tr.count, tr.countPct, tr.hasPrev, false) + '</div>' +
      '<div><small>' + esc(T('Time')) + '</small><b>' + esc(w.minutes ? short(w.minutes) : '–') + '</b>' + trend(tr.minutes, tr.minutesPct, tr.hasPrev, true) + '</div>' +
      '<div><small>' + esc(T('Heard')) + '</small><b>' + esc(w.listenMinutes ? short(w.listenMinutes) : '–') + '</b>' + trend(tr.listenMinutes, tr.listenPct, tr.hasPrev, true) + '</div></div>' +
      '<p class="ff-note">' + esc(tr.hasPrev ? T('vs the 7 days before') : T('First week: no comparison yet.')) + '</p>' +
      '<div class="ff-bars" role="img" aria-label="' + esc((j.perDay || []).map(function (d) { return fmt(dayDate(d.day), { weekday: 'long' }) + ' ' + mins(d.minutes); }).join(', ')) + '">' +
      (j.perDay || []).map(function (d, i) {
        var p = (j.prevPerDay || [])[i] || { minutes: 0 }, isT = d.day === j.day;
        return '<div class="ff-bar' + (isT ? ' on' : '') + '"><span class="ff-prev" style="height:' + Math.round(100 * p.minutes / max) + '%"></span><span class="ff-now" style="height:' + Math.max(d.minutes ? 4 : 0, Math.round(100 * d.minutes / max)) + '%"></span><small>' + esc(fmt(dayDate(d.day), { weekday: 'narrow' })) + '</small></div>';
      }).join('') + '</div></section>';
    if ((j.top || []).length) {
      h += '<section class="ff-card"><h3 class="ff-label">' + esc(T('Most done')) + '</h3><ol class="ff-top">' + j.top.map(function (t) {
        var a = ACT[t.activity] || ['Activity', 'feed', 'c-green'];
        return '<li>' + badge(a[2], a[1]) + '<span>' + esc(T(a[0])) + '</span><b>' + t.count + '×</b><small>' + esc(short(t.minutes)) + '</small></li>';
      }).join('') + '</ol></section>';
    }
    /* BF-07: only when the data exists */
    if (j.part && j.part.started) {
      h += '<section class="ff-card"><h3 class="ff-label">' + esc(T('Participation')) + '</h3><div class="ff-meter"><span style="width:' + Math.round(100 * j.part.completed / j.part.started) + '%"></span></div>' +
        '<p class="ff-line">' + esc(T('Done to the end: {a} of {b}', { a: j.part.completed, b: j.part.started })) + '</p>' +
        (j.part.again && j.part.again.yes ? '<p class="ff-line">' + esc(T('Would do it again: {n}', { n: j.part.again.yes })) + '</p>' : '') + '</section>';
    }
    return h;
  }
  function partMoments() {
    var j = cached('moments');
    if (j === undefined) return S.failed.moments ? failedBox('moments') : loadingBox();
    var list = (j && j.items) || [];
    if (!list.length) return empty('moments', T('No moments yet'), T('The care team shares photos and good moments here.'));
    return '<ul class="ff-moments">' + list.map(function (m) {
      var when = fmt(new Date(m.at), { day: 'numeric', month: 'long' }) + ' · ' + hhmm(m.at);
      if (m.kind === 'event') {
        var e = EVENT[m.event] || ['Shared by the care team', 'moments'];
        return '<li class="ff-moment ev">' + badge('c-heart', e[1]) + '<div><b>' + esc(T(e[0])) + '</b><small>' + esc((m.activity ? actName(m.activity) + ' · ' : '') + when) + '</small></div></li>';
      }
      if (m.hasPhoto) photo(m.id);
      var src = S.photos[m.id] && S.photos[m.id].indexOf('blob:') === 0 ? S.photos[m.id] : '';
      return '<li class="ff-moment' + (m.hasPhoto ? ' pic' : '') + '">' + (m.hasPhoto ? '<span class="ff-pic' + (src ? ' ready' : '') + '"' + (m.w && m.h ? ' style="aspect-ratio:' + m.w + '/' + m.h + '"' : '') + '><img data-photo="' + esc(m.id) + '" alt="' + esc(m.text || '') + '"' + (src ? ' src="' + src + '"' : '') + '></span>' : badge('c-heart', 'moments')) +
        '<div><b>' + esc(m.text || T('Shared by the care team')) + '</b><small>' + esc(when) + '</small></div></li>';
    }).join('') + '</ul>';
  }

  /* ---------- the tab ---------- */
  function fetchSub(force) {
    var t = today();
    if (S.sub === 'today') {
      var key = 'day:' + t;
      if (force || cached(key) === undefined || Date.now() - S.updated > 25000) load(key, 'day?day=' + t + '&today=' + t, markFresh);
    } else if (S.sub === 'history') {
      var d = S.day || addDays(t, -1);
      if (force || cached('days') === undefined) load('days', 'days?today=' + t);
      if (force || cached('day:' + d) === undefined) load('day:' + d, 'day?day=' + d + '&today=' + t);
    } else if (S.sub === 'listen') {
      if (force || cached('listening') === undefined) load('listening', 'listening?day=' + t + '&days=7&today=' + t);
    } else if (S.sub === 'summary') {
      if (force || cached('summary') === undefined) load('summary', 'summary?day=' + t + '&today=' + t);
    } else if (S.sub === 'moments') {
      if (force || cached('moments') === undefined) load('moments', 'moments?today=' + t);
    }
  }
  /* Live: an item not seen at the first load of this page is "new" for two minutes. */
  function markFresh(j) {
    var ids = (j.items || []).map(function (x) { return x.id; }), tt = Date.now();
    if (!S.known) S.known = {};
    var first = !S.known[S.rid];
    S.known[S.rid] = S.known[S.rid] || {};
    ids.forEach(function (id) { if (!S.known[S.rid][id]) { S.known[S.rid][id] = tt; if (!first) S.fresh[id] = tt; } });
    Object.keys(S.fresh).forEach(function (id) { if (tt - S.fresh[id] > 120000) delete S.fresh[id]; });
  }
  function paint() {
    var el = S.el;
    if (!el || !document.body.contains(el)) { stopLive(); return; }
    var body = S.sub === 'history' ? partHistory() : S.sub === 'listen' ? partListen() : S.sub === 'summary' ? partSummary() : S.sub === 'moments' ? partMoments() : partToday();
    var nav = '<nav class="ff-nav" role="tablist" aria-label="' + esc(T('Follow-up')) + '">' + SUBS.map(function (s) {
      var on = S.sub === s[0];
      return '<button type="button" role="tab" aria-selected="' + on + '" class="' + (on ? 'on' : '') + '" data-ff="sub" data-sub="' + s[0] + '"><span>' + esc(T(s[1])) + '</span></button>';
    }).join('') + '</nav>';
    var more = S.sub === 'moments' ? '' : '<p class="ff-more">' + MORE.map(function (s) {
      return '<button type="button" class="ff-link' + (S.sub === s[0] ? ' on' : '') + '" data-ff="sub" data-sub="' + s[0] + '">' + esc(T(s[1])) + '</button>';
    }).join('') + '</p>';
    var x = el.querySelector('.ff-nav'), sl = x ? x.scrollLeft : 0;
    el.innerHTML = '<div class="ff" lang="' + S.lang + '"><h1 class="ff-pagetitle">' + esc(T('The day of {name}', { name: S.label || T('your loved one') })) + '</h1>' + nav + '<div class="ff-part ff-' + S.sub + '">' + body + '</div>' + more + '</div>';
    /* the portal's own page margins, so the bar and the strips reach the edges */
    var ff = el.querySelector('.ff'), main = el.closest ? el.closest('.main') : null, cs = main && window.getComputedStyle ? getComputedStyle(main) : null;
    if (ff && cs) { ff.style.setProperty('--ff-px', cs.paddingLeft); ff.style.setProperty('--ff-pt', cs.paddingTop); }
    var n2 = el.querySelector('.ff-nav'), hd = document.querySelector('header.top');
    if (n2) { n2.scrollLeft = sl; n2.style.top = (hd ? hd.offsetHeight : 0) + 'px'; }
    /* the strip of days opens on the chosen day (the most recent ones at the right) */
    var strip = el.querySelector('.ff-strip'), on = el.querySelector('.ff-day.on');
    if (strip && on) strip.scrollLeft = Math.max(0, on.offsetLeft - strip.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2);
  }
  function stopLive() { if (S.timer) { clearInterval(S.timer); S.timer = null; } }
  function startLive() {
    stopLive();
    S.timer = setInterval(function () {
      if (!S.el || !document.body.contains(S.el)) { stopLive(); return; }
      if (document.hidden || S.sub !== 'today') return;
      fetchSub(true);
    }, 30000);
  }
  function wire(el) {
    if (el.__ffWired) return;
    el.__ffWired = true;
    el.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-ff]') : null;
      if (!b || b.tagName === 'INPUT') return;
      var what = b.getAttribute('data-ff');
      if (what === 'sub') { S.sub = b.getAttribute('data-sub'); fetchSub(false); paint(); try { window.scrollTo(0, 0); } catch (x) { /* fine */ } }
      else if (what === 'day') { S.day = b.getAttribute('data-day'); fetchSub(false); paint(); }
      else if (what === 'type') { S.type = b.getAttribute('data-type'); paint(); }
      else if (what === 'retry') { S.failed = {}; fetchSub(true); paint(); }
    });
    el.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-ff') === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) { S.day = t.value; fetchSub(false); paint(); }
    });
  }
  function residentOf(ctx) {
    var r = (ctx && ctx.resident) || {};
    return { rid: r.rid || r.id || '', label: r.label || r.name || '' };
  }
  function levelOf(ctx) { return ctx ? (ctx.consent !== undefined ? ctx.consent : ctx.consentLevel !== undefined ? ctx.consentLevel : (ctx.resident && ctx.resident.consent)) : null; }
  function render(el, ctx) {
    S.ctx = ctx || {};
    S.lang = I18N.valid((ctx && (ctx.lang || ctx.language)) || document.documentElement.lang || 'fr');
    var r = residentOf(ctx);
    if (r.rid !== S.rid) { S.rid = r.rid; S.day = ''; S.fresh = {}; }
    S.label = r.label;
    S.el = el;
    css();
    wire(el);
    fetchSub(false);
    paint();
    startLive();
  }
  function css() {
    if (document.getElementById('ff-css')) return;
    var l = document.createElement('link');
    l.id = 'ff-css'; l.rel = 'stylesheet';
    var me = document.querySelector('script[src*="portail-feed.js"]'), v = me ? (/\?v=([^&]+)/.exec(me.getAttribute('src')) || [])[1] : '';
    l.href = 'css/portail-feed.css' + (v ? '?v=' + v : '');
    document.head.appendChild(l);
  }

  var TAB = {
    id: 'feed', label: { fr: 'Journée', de: 'Tagesablauf', en: 'Day' }, icon: G.feed, order: 25,
    render: render,
    /* BF-27: the follow-up only at level 'all' */
    visible: function (ctx) { return ctx && ctx.features && ctx.features.feed !== undefined ? !!ctx.features.feed : levelOf(ctx) === 'all'; }
  };
  /* Family app 2.0 (Rahma's review, 24 Nov: "fusionne-la mais garde le code de l'ancienne version"): with
     V2_FEED_IN_MESSAGES the day's activities and moments show as small grey cards in the Messages
     conversation and this tab is hidden; false = exactly the old Journée tab. */
  var V2_FEED_IN_MESSAGES = true;
  var tabVisible = TAB.visible;
  TAB.visible = function (ctx) { return V2_FEED_IN_MESSAGES ? false : tabVisible(ctx); };
  function chatCard(at, glyphCls, glyph, title, line) {
    return { at: at, html: '<li class="v2-ev">' + badge(glyphCls, glyph) + '<span class="v2-ev-t"><b>' + esc(title) + '</b><small>' + esc(line) + '</small></span></li>' };
  }
  function chatEvents(ctx) {
    if (!V2_FEED_IN_MESSAGES || !ctx || !tabVisible(ctx)) return [];
    css();
    S.lang = I18N.valid((ctx && ctx.lang) || 'fr');
    var r = residentOf(ctx);
    if (r.rid !== S.rid) { S.rid = r.rid; S.day = ''; S.fresh = {}; }
    var t = today(), key = 'day:' + t, j = cached(key);
    if ((j === undefined || Date.now() - S.updated > 60000) && !S.loading[key]) {
      load(key, 'day?day=' + t + '&today=' + t, function () {
        var P = window.Portail, typing = document.activeElement && /^(msgText|textarea)$/i.test(document.activeElement.id || document.activeElement.tagName);
        if (P && P.state && P.state.screen === 'home' && P.state.tab === 'messages' && !P.state.sheet && !P.state.rec && !P.state.attach && !typing) P.render();
      });
    }
    if (!j) return [];
    var rows = [];
    (j.items || []).forEach(function (x) {
      var a = ACT[x.activity] || ['Activity', 'feed', 'c-green'], res = resultText(x.result), meta = [hhmm(x.start), dur(x.dur)];
      if (res) meta.push(res);
      rows.push(chatCard(x.start, a[2], a[1], T(a[0]), meta.join(' · ')));
    });
    (j.moments || []).forEach(function (m) {
      if (m.kind === 'event') { var e = EVENT[m.event] || ['Shared by the care team', 'moments']; rows.push(chatCard(m.at, 'c-heart', e[1], T(e[0]), hhmm(m.at))); }
      else rows.push(chatCard(m.at, 'c-heart', 'moments', m.text || T('Shared by the care team'), hhmm(m.at)));
    });
    return rows;
  }
  var added = false;
  function register() {
    if (added) return true;
    if (window.Portail && typeof window.Portail.addTab === 'function') { window.Portail.addTab(TAB); added = true; return true; }
    return false;
  }
  if (!register()) {
    document.addEventListener('DOMContentLoaded', register);
    window.addEventListener('load', register);
  }
  window.PortailFeed = { tab: TAB, render: render, chatEvents: chatEvents, _state: S };
})();
