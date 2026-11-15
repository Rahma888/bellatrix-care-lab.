/* The family's page (famille.html#t=…): a relative calls the resident on Bellatrix's screen.
   No account and no app: the private link the care team sent is the key (the token stays in the
   #hash, so it is never sent to a server in a request line or a referrer). The page language is the
   one the care team chose for this link. Picture and sound go straight to Bellatrix's screen
   (WebRTC); the call server only passes the connection details on, and nothing is recorded.
   Plain ES5, like the rest of the app, so older phones work too. */
(function () {
  'use strict';
  var API = 'call/api/';
  /* STUN/TURN servers come from the call server (GET call/api/ice); without an answer, none (then the
     call works on the same network only). ICE gathering waits up to 5 s: STUN/TURN candidates are slower. */
  var ICE = [];
  var POLL_MS = 8000, GATHER_MS = 5000;

  var TEXT = {
    fr: {
      loading: 'Un instant…',
      title: 'Appel vidéo avec {label}',
      waiting: '{label} vous attend pour un appel vidéo.', join: 'Rejoindre',
      joinOver: 'Cet appel n’est plus disponible. L’équipe soignante peut vous rappeler.',
      available: '{label} est disponible.',
      busy: '{label} n’est pas disponible pour le moment. Réessayez dans quelques minutes.',
      notnowAt: 'Ce n’est pas l’heure des appels. Prochaine plage : {time}.',
      notnow: 'Les appels ne sont pas possibles pour le moment.',
      offline: 'L’écran de Bellatrix n’est pas joignable pour le moment. Réessayez plus tard.',
      call: 'Appeler {label}',
      askMedia: 'Votre navigateur va demander l’accès à la caméra et au micro : acceptez, pour que {label} puisse vous voir et vous entendre.',
      privacy: 'Votre image et votre voix vont directement à l’écran de Bellatrix, chiffrées. Rien n’est enregistré.',
      preparing: 'Préparation de l’appel…',
      ringing: 'Ça sonne chez {label}…',
      ringingNote: 'Bellatrix annonce votre appel.',
      cancel: 'Annuler',
      connecting: 'Connexion…',
      voiceOnly: 'Pas de caméra : l’appel se fait avec la voix seulement.',
      mute: 'Couper le micro', unmute: 'Activer le micro',
      camOff: 'Couper la caméra', camOn: 'Activer la caméra',
      hangup: 'Raccrocher',
      tapSound: 'Toucher pour activer le son',
      ended: 'Appel terminé',
      duration: 'Durée : {d}',
      thanks: 'Merci d’avoir appelé !',
      again: 'Rappeler',
      back: 'Retour',
      missed: '{label} n’a pas répondu. Vous pouvez réessayer plus tard.',
      declined: '{label} ne peut pas répondre maintenant. Vous pouvez réessayer plus tard.',
      lost: 'La connexion a été interrompue.',
      noconnect: 'La vidéo n’a pas pu se connecter. Connectez votre téléphone au même Wi-Fi que le robot, puis réessayez.',
      invalid: 'Ce lien ne fonctionne pas. Demandez un nouveau lien à l’équipe soignante.',
      revoked: 'Ce lien n’est plus valable. Demandez un nouveau lien à l’équipe soignante.',
      server: 'Le service d’appel ne répond pas. Vérifiez votre connexion internet, puis réessayez.',
      retry: 'Réessayer',
      denied: 'L’accès à la caméra et au micro a été refusé. Autorisez-le dans votre navigateur (icône à gauche de l’adresse), puis réessayez.',
      nomic: 'Aucun micro n’a été trouvé. Branchez un micro ou utilisez un téléphone, puis réessayez.',
      inuse: 'La caméra ou le micro est utilisé par une autre application. Fermez-la, puis réessayez.',
      insecure: 'Pour utiliser la caméra et le micro, cette page doit être ouverte avec une adresse sécurisée (https://). Demandez le bon lien à l’équipe soignante.',
      failed: 'L’appel n’a pas pu démarrer : {msg}',
      min: '{m} min {s} s', sec: '{s} s',
      joinCall: 'Rejoindre l’appel', live: '{label} est en appel avec la famille. Vous pouvez rejoindre l’appel.',
      full: 'Appel complet', fullNote: 'Quatre personnes au maximum. Réessayez plus tard.',
      ringingElse: 'Ça sonne déjà chez {label}. Un instant…',
      gInvite: '{label} veut jouer aux petits chevaux avec vous.',
      gAccept: 'Accepter', gDecline: 'Pas maintenant',
      gGame: 'Petits chevaux', gYou: 'Vous',
      gYourTurn: 'À vous de jouer.', gTheirTurn: '{label} joue…', gStarting: 'La partie commence…',
      gRoll: 'Lancer le dé', gWait: 'Un instant…',
      gOut: 'Pion {n} : sortir', gHome: 'Pion {n} : rentrer', gMove: 'Pion {n} : avancer de {d}', gTakes: 'il prend !',
      gYouWon: 'Vous avez gagné !', gWon: '{label} a gagné !', gThanks: 'Merci pour la partie !',
      gBack: 'Revenir à l’appel', gStopped: 'La partie est terminée.',
      eRollYou: 'Vous faites {die}.', eRoll: '{label} fait {die}.', eNoMove: 'Aucun coup possible.',
      eEnterYou: 'Vous sortez votre pion.', eEnter: '{label} sort son pion.',
      eCaptureYou: 'Vous renvoyez le pion de {label} à la maison !', eCapture: '{label} renvoie votre pion à la maison !',
      eFinishYou: 'Votre pion est arrivé !', eFinish: '{label} rentre son pion.',
      eSixYou: 'Un six : vous rejouez.', eSix: 'Un six : {label} rejoue.'
    },
    de: {
      loading: 'Einen Moment…',
      title: 'Videoanruf mit {label}',
      waiting: '{label} wartet auf Sie für einen Videoanruf.', join: 'Beitreten',
      joinOver: 'Dieser Anruf ist nicht mehr verfügbar. Das Pflegeteam kann Sie erneut anrufen.',
      available: '{label} ist jetzt erreichbar.',
      busy: '{label} ist gerade nicht erreichbar. Versuchen Sie es in ein paar Minuten noch einmal.',
      notnowAt: 'Gerade ist keine Anrufzeit. Nächste Anrufzeit: {time} Uhr.',
      notnow: 'Anrufe sind gerade nicht möglich.',
      offline: 'Der Bildschirm von Bellatrix ist gerade nicht erreichbar. Versuchen Sie es später noch einmal.',
      call: '{label} anrufen',
      askMedia: 'Ihr Browser fragt nach Kamera und Mikrofon: Erlauben Sie beides, damit {label} Sie sehen und hören kann.',
      privacy: 'Ihr Bild und Ihre Stimme gehen verschlüsselt direkt zum Bildschirm von Bellatrix. Nichts wird aufgezeichnet.',
      preparing: 'Der Anruf wird vorbereitet…',
      ringing: 'Es klingelt bei {label}…',
      ringingNote: 'Bellatrix kündigt Ihren Anruf an.',
      cancel: 'Abbrechen',
      connecting: 'Verbindung wird hergestellt…',
      voiceOnly: 'Keine Kamera: Der Anruf läuft nur mit Ton.',
      mute: 'Mikrofon aus', unmute: 'Mikrofon an',
      camOff: 'Kamera aus', camOn: 'Kamera an',
      hangup: 'Auflegen',
      tapSound: 'Tippen, um den Ton einzuschalten',
      ended: 'Anruf beendet',
      duration: 'Dauer: {d}',
      thanks: 'Danke für Ihren Anruf!',
      again: 'Nochmals anrufen',
      back: 'Zurück',
      missed: '{label} hat nicht abgenommen. Sie können es später noch einmal versuchen.',
      declined: '{label} kann gerade nicht abnehmen. Sie können es später noch einmal versuchen.',
      lost: 'Die Verbindung wurde unterbrochen.',
      noconnect: 'Die Videoverbindung kam nicht zustande. Verbinden Sie Ihr Telefon mit demselben WLAN wie der Roboter und versuchen Sie es dann erneut.',
      invalid: 'Dieser Link funktioniert nicht. Bitten Sie das Pflegeteam um einen neuen Link.',
      revoked: 'Dieser Link ist nicht mehr gültig. Bitten Sie das Pflegeteam um einen neuen Link.',
      server: 'Der Anrufdienst antwortet nicht. Prüfen Sie Ihre Internetverbindung und versuchen Sie es noch einmal.',
      retry: 'Erneut versuchen',
      denied: 'Der Zugriff auf Kamera und Mikrofon wurde verweigert. Erlauben Sie ihn in Ihrem Browser (Symbol links neben der Adresse) und versuchen Sie es noch einmal.',
      nomic: 'Es wurde kein Mikrofon gefunden. Schließen Sie ein Mikrofon an oder nehmen Sie ein Telefon und versuchen Sie es noch einmal.',
      inuse: 'Kamera oder Mikrofon werden von einer anderen App benutzt. Schließen Sie sie und versuchen Sie es noch einmal.',
      insecure: 'Für Kamera und Mikrofon muss diese Seite über eine sichere Adresse (https://) geöffnet werden. Bitten Sie das Pflegeteam um den richtigen Link.',
      failed: 'Der Anruf konnte nicht starten: {msg}',
      min: '{m} Min. {s} Sek.', sec: '{s} Sek.',
      joinCall: 'Anruf beitreten', live: '{label} ist im Gespräch mit der Familie. Sie können dem Anruf beitreten.',
      full: 'Anruf voll', fullNote: 'Höchstens vier Personen. Versuchen Sie es später noch einmal.',
      ringingElse: 'Es klingelt schon bei {label}. Einen Moment…',
      gInvite: '{label} möchte mit Ihnen „Mensch ärgere dich nicht“ spielen.',
      gAccept: 'Annehmen', gDecline: 'Jetzt nicht',
      gGame: 'Mensch ärgere dich nicht', gYou: 'Sie',
      gYourTurn: 'Sie sind dran.', gTheirTurn: '{label} ist dran…', gStarting: 'Das Spiel beginnt…',
      gRoll: 'Würfeln', gWait: 'Einen Moment…',
      gOut: 'Figur {n}: herauskommen', gHome: 'Figur {n}: ins Ziel', gMove: 'Figur {n}: {d} Felder vor', gTakes: 'schlägt!',
      gYouWon: 'Sie haben gewonnen!', gWon: '{label} hat gewonnen!', gThanks: 'Danke für das Spiel!',
      gBack: 'Zurück zum Anruf', gStopped: 'Das Spiel ist beendet.',
      eRollYou: 'Sie würfeln eine {die}.', eRoll: '{label} würfelt eine {die}.', eNoMove: 'Kein Zug möglich.',
      eEnterYou: 'Sie bringen Ihre Figur ins Spiel.', eEnter: '{label} bringt eine Figur ins Spiel.',
      eCaptureYou: 'Sie schicken die Figur von {label} zurück nach Hause!', eCapture: '{label} schickt Ihre Figur zurück nach Hause!',
      eFinishYou: 'Ihre Figur ist im Ziel!', eFinish: '{label} bringt eine Figur ins Ziel.',
      eSixYou: 'Eine Sechs: Sie würfeln noch einmal.', eSix: 'Eine Sechs: {label} würfelt noch einmal.'
    },
    en: {
      loading: 'One moment…',
      title: 'Video call with {label}',
      waiting: '{label} is waiting for you for a video call.', join: 'Join',
      joinOver: 'This call is no longer available. The care team can call you again.',
      available: '{label} is available.',
      busy: '{label} is busy right now. Please try again in a few minutes.',
      notnowAt: 'It is not call time right now. Next call time: {time}.',
      notnow: 'Calls are not possible right now.',
      offline: 'Bellatrix’s screen cannot be reached right now. Please try again later.',
      call: 'Call {label}',
      askMedia: 'Your browser will ask for the camera and microphone: allow both, so that {label} can see and hear you.',
      privacy: 'Your picture and voice go straight to Bellatrix’s screen, encrypted. Nothing is recorded.',
      preparing: 'Getting the call ready…',
      ringing: 'Ringing {label}…',
      ringingNote: 'Bellatrix is announcing your call.',
      cancel: 'Cancel',
      connecting: 'Connecting…',
      voiceOnly: 'No camera: this call is voice only.',
      mute: 'Mute', unmute: 'Unmute',
      camOff: 'Camera off', camOn: 'Camera on',
      hangup: 'Hang up',
      tapSound: 'Tap to turn the sound on',
      ended: 'Call ended',
      duration: 'Length: {d}',
      thanks: 'Thank you for calling!',
      again: 'Call again',
      back: 'Back',
      missed: '{label} did not answer. You can try again later.',
      declined: '{label} cannot answer right now. You can try again later.',
      lost: 'The connection was lost.',
      noconnect: 'The video could not connect. Connect your phone to the same Wi-Fi as the robot, then try again.',
      invalid: 'This link does not work. Please ask the care team for a new link.',
      revoked: 'This link is no longer valid. Please ask the care team for a new link.',
      server: 'The call service does not answer. Check your internet connection, then try again.',
      retry: 'Try again',
      denied: 'Access to the camera and microphone was refused. Allow it in your browser (the icon left of the address), then try again.',
      nomic: 'No microphone was found. Plug one in or use a phone, then try again.',
      inuse: 'The camera or microphone is used by another app. Close it, then try again.',
      insecure: 'To use the camera and microphone, this page must be opened from a secure address (https://). Please ask the care team for the right link.',
      failed: 'The call could not start: {msg}',
      min: '{m} min {s} s', sec: '{s} s',
      joinCall: 'Join the call', live: '{label} is in a call with the family. You can join the call.',
      full: 'Call full', fullNote: 'Four people at most. Please try again later.',
      ringingElse: 'It is already ringing at {label}. One moment…',
      gInvite: '{label} would like to play Ludo with you.',
      gAccept: 'Accept', gDecline: 'Not now',
      gGame: 'Ludo', gYou: 'You',
      gYourTurn: 'Your turn.', gTheirTurn: '{label} is playing…', gStarting: 'The game is starting…',
      gRoll: 'Roll the die', gWait: 'One moment…',
      gOut: 'Token {n}: come out', gHome: 'Token {n}: go home', gMove: 'Token {n}: move {d}', gTakes: 'capture!',
      gYouWon: 'You won!', gWon: '{label} won!', gThanks: 'Thank you for the game!',
      gBack: 'Back to the call', gStopped: 'The game is over.',
      eRollYou: 'You roll {die}.', eRoll: '{label} rolls {die}.', eNoMove: 'No move possible.',
      eEnterYou: 'You bring your token out.', eEnter: '{label} brings a token out.',
      eCaptureYou: 'You send {label}’s token back home!', eCapture: '{label} sends your token back home!',
      eFinishYou: 'Your token is home!', eFinish: '{label} brings a token home.',
      eSixYou: 'A six: you play again.', eSix: 'A six: {label} plays again.'
    }
  };
  /* French typography: a no-break space before ? ! : ; (as in the robot's texts). */
  Object.keys(TEXT.fr).forEach(function (k) { TEXT.fr[k] = TEXT.fr[k].replace(/ ([?!:;»])/g, ' $1'); });

  function svg(body) { return '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">' + body + '</svg>'; }
  var HANDSET = '<path d="M8 58 C30 30 70 30 92 58 L82 72 L64 62 L64 50 C56 46 44 46 36 50 L36 62 L18 72 Z" fill="currentColor"/>';
  var I = {
    phone: svg('<g transform="rotate(-140 50 50)">' + HANDSET + '</g>'),
    hangup: svg(HANDSET),
    mic: svg('<rect x="36" y="10" width="28" height="50" rx="14" fill="currentColor"/><path d="M24 46 a26 26 0 0 0 52 0" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><rect x="46" y="72" width="8" height="16" fill="currentColor"/><rect x="32" y="84" width="36" height="8" rx="4" fill="currentColor"/>'),
    cam: svg('<rect x="8" y="28" width="58" height="44" rx="10" fill="currentColor"/><path d="M66 44 L92 30 V70 L66 56 Z" fill="currentColor"/>'),
    slash: '<line x1="12" y1="12" x2="88" y2="88" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>'
  };

  var app = document.getElementById('app');
  var lang = guessLang(), token = tokenFromHash(), KIND = kindFromHash(), label = '', view = '', pollTimer = null, tickTimer = null, call = null, lastState = null;
  /* 15 Nov: #j=…&go=1, the relative tapped "Annehmen" (the ringing portal or the phone's notification): the page joins
     the call at once, without a second "Join". Once only: the address keeps #j=… without it. */
  var GO = KIND === 'join' && /[#&]go=1(&|$)/.test(location.hash || '');
  if (GO && window.history && history.replaceState) { try { history.replaceState(null, '', location.pathname + location.search + '#j=' + token); } catch (e) { /* the address keeps it */ } }

  function guessLang() {
    var l = String((navigator.languages && navigator.languages[0]) || navigator.language || 'en').slice(0, 2).toLowerCase();
    return TEXT[l] ? l : 'en';
  }
  /* #t=… the family's own link (they call); #j=… a call the care team started (they join it, once). */
  function tokenFromHash() { var m = /[#&][tj]=([A-Za-z0-9_-]{16,64})/.exec(location.hash || ''); return m ? m[1] : ''; }
  function kindFromHash() { return /[#&]j=/.test(location.hash || '') ? 'join' : 'call'; }
  function iceServers() { return request('GET', 'ice').then(function (o) { return o && Array.isArray(o.iceServers) ? o.iceServers : ICE; }, function () { return ICE; }); }
  function t(k, v) {
    var s = (TEXT[lang] && TEXT[lang][k]) || TEXT.en[k] || k;
    return v ? s.replace(/\{(\w+)\}/g, function (m, n) { return v[n] !== undefined && v[n] !== null ? String(v[n]) : m; }) : s;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function L() { return { label: label }; }
  function initial() { return esc((label || 'B').trim().charAt(0).toUpperCase()); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function mmss(s) { return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
  function length(s) { return s >= 60 ? t('min', { m: Math.floor(s / 60), s: s % 60 }) : t('sec', { s: s }); }
  function noop() {}
  function stop(stream) { if (stream) stream.getTracks().forEach(function (tr) { try { tr.stop(); } catch (e) { /* already stopped */ } }); }
  function setLang(l) {
    lang = TEXT[l] ? l : lang;
    document.documentElement.lang = lang;
    document.title = label ? 'Bellatrix · ' + t('title', L()) : 'Bellatrix';
  }

  function request(method, path, body) {
    var o = { method: method, cache: 'no-store' };
    if (body) { o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(body); }
    return fetch(API + path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || 'HTTP ' + r.status); e.status = r.status; e.body = j; throw e; }
        return j;
      });
    }, function () { var e = new Error('network'); e.status = 0; throw e; });
  }

  /* ---------- views ---------- */
  function show(name, html) {
    view = name;
    app.className = 'v-' + name;
    app.innerHTML = html;
    clearTimeout(pollTimer);
  }
  function stateText(s) {
    if (!s) return '';
    if (s.state === 'available') return t('available', L());
    if (s.state === 'waiting') return t('waiting', L());
    if (s.state === 'busy') return t('busy', L());
    if (s.state === 'live') return t('live', L());
    if (s.state === 'full') return t('full');
    if (s.state === 'ringing') return t('ringingElse', L());
    if (s.state === 'notnow') return s.next ? t('notnowAt', { time: s.next }) : t('notnow');
    return t('offline');
  }
  function home(s) {
    lastState = s;
    var ok = s.state === 'available' || s.state === 'waiting' || s.state === 'live';
    show('home',
      '<section class="card home">' +
      '<p class="brand">Bellatrix</p>' +
      '<div class="avatar" aria-hidden="true">' + initial() + '</div>' +
      '<h1>' + esc(t('title', L())) + '</h1>' +
      '<p class="state ' + (ok ? 'ok' : s.state === 'offline' ? 'off' : 'wait') + (s.state === 'full' ? ' full' : '') + '" id="state" role="status">' + esc(stateText(s)) + '</p>' +
      '<button type="button" class="callbtn" data-act="call"' + (ok ? '' : ' disabled') + '>' + I.phone + '<span>' + esc(t(s.state === 'live' ? 'joinCall' : KIND === 'join' ? 'join' : 'call', L())) + '</span></button>' +
      (s.state === 'full' ? '<p class="note">' + esc(t('fullNote')) + '</p>' : '') +
      '<p class="note">' + esc(t('askMedia', L())) + '</p>' +
      '<p class="note privacy">' + esc(t('privacy')) + '</p>' +
      '</section>');
    schedulePoll();
  }
  function message(kind, text, buttons) {
    show(kind, '<section class="card msg"><p class="brand">Bellatrix</p>' + (label ? '<div class="avatar" aria-hidden="true">' + initial() + '</div>' : '') +
      '<p class="big" role="alert">' + esc(text) + '</p>' +
      '<div class="row">' + (buttons || []).map(function (b) { return '<button type="button" class="' + (b.primary ? 'callbtn small' : 'ghost') + '" data-act="' + b.act + '">' + esc(b.label) + '</button>'; }).join('') + '</div></section>');
  }
  function schedulePoll() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(function () {
      if (view !== 'home') return;
      if (document.visibilityState === 'hidden') { schedulePoll(); return; }
      refresh(true);
    }, POLL_MS);
  }
  /* Asks the call server about the link and whether the resident can take a call now. */
  function refresh(quietly) {
    if (!token) { message('error', t('invalid')); return; }
    if (!quietly) show('load', '<section class="card"><p class="big">' + esc(t('loading')) + '</p></section>');
    request('GET', 'status?' + (KIND === 'join' ? 'j=' : 't=') + encodeURIComponent(token)).then(function (s) {
      label = String(s.label || '').trim();
      setLang(s.lang);
      if (GO && (s.state === 'waiting' || s.state === 'live') && !call) { GO = false; startCall(); return; }
      GO = false;
      if (view === 'home' && lastState && lastState.state === s.state && lastState.next === s.next) { schedulePoll(); return; }
      if (view === 'home' || view === 'load' || !quietly) home(s);
    }, function (e) {
      if (e.status === 404 || e.status === 410) {
        if (e.body && e.body.lang) setLang(e.body.lang);
        message('error', t(e.status === 410 ? (KIND === 'join' ? 'joinOver' : 'revoked') : 'invalid'));
        return;
      }
      if (quietly && view === 'home') { schedulePoll(); return; }
      message('error', t('server'), [{ act: 'retry', label: t('retry'), primary: true }]);
    });
  }

  /* ---------- camera and microphone ---------- */
  function mediaError(kind, e) { var x = new Error(kind); x.media = kind; x.cause = e; return x; }
  function getMedia() {
    var md = navigator.mediaDevices;
    if (!window.isSecureContext || !md || !md.getUserMedia) return Promise.reject(mediaError('insecure'));
    var audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    var both = { audio: audio, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } };
    return md.getUserMedia(both).catch(function (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'PermissionDeniedError')) throw mediaError('denied', e);
      /* A camera just released can refuse for a moment: one more try, then the voice only. */
      return new Promise(function (ok) { setTimeout(ok, 700); }).then(function () { return md.getUserMedia(both); });
    }).catch(function (e) {
      if (e && e.media) throw e;
      /* No camera, or it is busy: the call can still go ahead with the voice. */
      return md.getUserMedia({ audio: audio, video: false }).catch(function (e2) {
        var n = e2 && e2.name;
        throw mediaError(n === 'NotAllowedError' ? 'denied' : n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'DevicesNotFoundError' ? 'nomic' : 'inuse', e2);
      });
    });
  }
  function gathered(pc, ms) {
    return new Promise(function (ok) {
      if (pc.iceGatheringState === 'complete') { ok(); return; }
      var tm = setTimeout(done, ms);
      function check() { if (pc.iceGatheringState === 'complete') done(); }
      function done() { clearTimeout(tm); pc.removeEventListener('icegatheringstatechange', check); ok(); }
      pc.addEventListener('icegatheringstatechange', check);
    });
  }

  /* ---------- the call ---------- */
  function startCall() {
    if (call) return;
    var c = call = { id: '', peer: '', pc: null, local: null, remote: null, since: 0, connectedAt: 0, over: false, muted: false, camOff: false, voiceOnly: false, fails: 0,
      dc: null, game: null, sent: false, ice: [], peers: {} };
    show('prep', '<section class="card"><div class="avatar pulse" aria-hidden="true">' + initial() + '</div><p class="big">' + esc(t('preparing')) + '</p>' +
      '<div class="row"><button type="button" class="ghost" data-act="cancel">' + esc(t('cancel')) + '</button></div></section>');
    getMedia().then(function (stream) {
      return iceServers().then(function (ice) { return { stream: stream, ice: ice }; });
    }).then(function (got) {
      var stream = got.stream;
      if (c.over) { stop(stream); return null; }
      c.local = stream;
      c.ice = got.ice;
      c.voiceOnly = !stream.getVideoTracks().length;
      var pc = c.pc = new RTCPeerConnection({ iceServers: got.ice });
      stream.getTracks().forEach(function (tr) { pc.addTrack(tr, stream); });
      /* Always receive Bellatrix's picture and sound, even when sending the voice only. */
      if (c.voiceOnly) pc.addTransceiver('video', { direction: 'recvonly' });
      /* Playing together during the call (Ludo): a data channel that travels inside the call itself,
         opened before the offer so that it is part of it. */
      openGameChannel(c, pc);
      pc.ontrack = function (e) {
        var s = e.streams && e.streams[0];
        if (s) c.remote = s; else { c.remote = c.remote || new MediaStream(); c.remote.addTrack(e.track); }
        attach();
      };
      pc.onconnectionstatechange = function () { onConnection(c); };
      /* Browsers without connectionState (older Safari): the ICE state says the same. */
      pc.oniceconnectionstatechange = function () {
        if (c !== call || c.over || !c.pc) return;
        var s = c.pc.iceConnectionState;
        if ((s === 'connected' || s === 'completed') && !c.connectedAt && !('connectionState' in c.pc)) { c.connectedAt = Date.now(); var w0 = document.getElementById('cwait'); if (w0) w0.hidden = true; }
        else if (s === 'failed') finish(c, 'lost');
      };
      return pc.createOffer()
        .then(function (o) { return pc.setLocalDescription(o); })
        .then(function () { return gathered(pc, GATHER_MS); })
        .then(function () { return KIND === 'join' ? request('POST', 'join', { j: token, sdp: pc.localDescription.sdp }) : request('POST', 'call', { t: token, sdp: pc.localDescription.sdp }); })
        .then(function (r) {
          if (c.over) { if (r.call) request('POST', 'call/' + encodeURIComponent(r.call), { type: 'hangup', t: token, peer: r.peer }).catch(noop); return; }
          if (!r.call) { end(c, null); home({ state: r.state || 'offline', next: r.next || '' }); return; }
          c.id = r.call; c.peer = r.peer || '';
          if (r.joined) {
            /* The call already runs: straight into it. The robot answers our offer; then we offer to each
               relative who is already there (the newest always offers). */
            c.since = r.since || 0;
            callView();
            armTimeout(c);
            waitLoop(c);
            (r.peers || []).forEach(function (pid) { offerTo(c, pid); });
            applyCaps(c);
            return;
          }
          ringView();
          waitLoop(c);
        });
    }).catch(function (e) {
      if (c.over) return;
      end(c, null);
      if (e && e.media) { message('media', t(e.media, L()), [{ act: 'call', label: t('retry'), primary: true }, { act: 'home', label: t('back') }]); return; }
      if (e && (e.status === 404 || e.status === 410)) { message('error', t(e.status === 410 ? (KIND === 'join' ? 'joinOver' : 'revoked') : 'invalid')); return; }
      if (e && e.status === 0) { message('error', t('server'), [{ act: 'retry', label: t('retry'), primary: true }]); return; }
      message('error', t('failed', { msg: e && e.message ? e.message : String(e) }), [{ act: 'retry', label: t('retry'), primary: true }]);
    });
  }
  function ringView() {
    show('ring', '<section class="ring">' +
      '<video class="preview" id="selfv" muted playsinline autoplay></video>' +
      '<div class="ringbox"><div class="avatar pulse" aria-hidden="true">' + initial() + '</div>' +
      '<h1 role="status">' + esc(t('ringing', L())) + '</h1><p>' + esc(t('ringingNote')) + '</p>' +
      (call && call.voiceOnly ? '<p class="note">' + esc(t('voiceOnly')) + '</p>' : '') +
      '<button type="button" class="cbtn danger" data-act="cancel">' + I.hangup + '<span>' + esc(t('cancel')) + '</span></button></div></section>');
    attach();
  }
  function callView() {
    var c = call;
    show('call', '<section class="incall">' +
      '<video class="remote" id="remotev" autoplay playsinline></video>' +
      '<div class="others n0" id="others"></div>' +
      '<button type="button" class="tapsound" id="tapsound" data-act="sound" hidden>' + esc(t('tapSound')) + '</button>' +
      '<div class="cwait" id="cwait"><div class="avatar pulse" aria-hidden="true">' + initial() + '</div><p id="cstate" role="status">' + esc(t('connecting')) + '</p></div>' +
      '<div class="ctop"><span class="cname">' + esc(label) + '</span><span class="ctime" id="ctime">00:00</span></div>' +
      (c.voiceOnly ? '<p class="cnote">' + esc(t('voiceOnly')) + '</p>' : '<video class="self" id="selfv" muted playsinline autoplay></video>') +
      /* Ludo with the resident: the invitation, then the board (filled in by renderGame). */
      '<div class="ginvite" id="ginvite" role="dialog" aria-live="assertive" hidden><p class="big">' + esc(t('gInvite', L())) + '</p>' +
      '<div class="row"><button type="button" class="callbtn small" data-act="gaccept">' + esc(t('gAccept')) + '</button>' +
      '<button type="button" class="ghost" data-act="gdecline">' + esc(t('gDecline')) + '</button></div></div>' +
      '<div class="game" id="game" hidden><div class="gboard" id="gboard"></div><div class="gside">' +
      '<div class="gstatus"><span class="gdie" id="gdie"></span><div><p class="gturn" id="gturn" role="status"></p><p class="glegend" id="glegend"></p></div></div>' +
      '<p class="gnote" id="gnote"></p><div class="gbtns" id="gbtns"></div>' +
      '<button type="button" class="ghost gleave" data-act="gleave">' + esc(t('gBack')) + '</button></div></div>' +
      '<p class="gtoast" id="gtoast" hidden></p>' +
      '<div class="cbar">' +
      '<button type="button" class="cbtn" data-act="mute" aria-pressed="false">' + I.mic + '<span>' + esc(t('mute')) + '</span></button>' +
      (c.voiceOnly ? '' : '<button type="button" class="cbtn" data-act="cam" aria-pressed="false">' + I.cam + '<span>' + esc(t('camOff')) + '</span></button>') +
      '<button type="button" class="cbtn danger" data-act="hangup">' + I.hangup + '<span>' + esc(t('hangup')) + '</span></button>' +
      '</div></section>');
    attach();
    renderOthers(c);
    clearInterval(tickTimer);
    tickTimer = setInterval(function () {
      var el = document.getElementById('ctime');
      if (el && call && call.connectedAt) el.textContent = mmss(Math.round((Date.now() - call.connectedAt) / 1000));
    }, 1000);
  }
  function attach() {
    if (!call) return;
    var s = document.getElementById('selfv'), r = document.getElementById('remotev');
    if (s && call.local && s.srcObject !== call.local) { s.srcObject = call.local; s.play().catch(noop); }
    if (r && call.remote && r.srcObject !== call.remote) { r.srcObject = call.remote; playOrAsk(r); }
    renderOthers(call);
  }
  /* ---------- the other relatives (tiles) ---------- */
  function livePeerIds(c) { return Object.keys(c.peers).filter(function (id) { return !c.peers[id].gone; }); }
  function renderOthers(c) {
    var box = el('others');
    if (!box || !c) return;
    var ids = livePeerIds(c);
    Array.prototype.slice.call(box.children).forEach(function (n) { if (ids.indexOf(n.getAttribute('data-peer')) < 0) n.parentNode.removeChild(n); });
    ids.forEach(function (id) {
      var pe = c.peers[id], n = box.querySelector('[data-peer="' + id + '"]');
      if (!n) {
        n = document.createElement('div'); n.className = 'otile'; n.setAttribute('data-peer', id);
        n.innerHTML = '<video autoplay playsinline></video><span class="oname"></span>';
        box.appendChild(n);
      }
      n.querySelector('.oname').textContent = pe.name || '';
      var v = n.querySelector('video');
      if (pe.remote && v.srcObject !== pe.remote) { v.srcObject = pe.remote; playOrAsk(v); }
      n.classList.toggle('on', !!pe.remote);
    });
    box.className = 'others n' + ids.length;
    if (box.parentNode) box.parentNode.classList.toggle('group', ids.length > 0);
  }
  /* A connection to another relative: both ends have the same camera and microphone, the picture of
     the other comes into a small tile. The newest relative offers, the older ones answer. */
  function peerConn(c, pid) {
    var pe = c.peers[pid] || (c.peers[pid] = { id: pid, name: '', pc: null, remote: null, gone: false });
    if (pe.pc) return pe;
    var pc = pe.pc = new RTCPeerConnection({ iceServers: c.ice });
    if (c.local) c.local.getTracks().forEach(function (tr) { pc.addTrack(tr, c.local); });
    pc.ontrack = function (e) {
      var s = e.streams && e.streams[0];
      if (s) pe.remote = s; else { pe.remote = pe.remote || new MediaStream(); pe.remote.addTrack(e.track); }
      renderOthers(c);
    };
    pc.onconnectionstatechange = function () {
      if (pc.connectionState === 'failed' && !c.over) removePeer(c, pid);
      else if (pc.connectionState === 'connected') applyCaps(c);
    };
    return pe;
  }
  function sendSignal(c, to, kind, pc) {
    return request('POST', 'call/' + encodeURIComponent(c.id) + '/signal', { t: token, peer: c.peer, to: to, kind: kind, sdp: pc.localDescription.sdp });
  }
  function offerTo(c, pid) {
    var pe = peerConn(c, pid), pc = pe.pc;
    if (c.voiceOnly) pc.addTransceiver('video', { direction: 'recvonly' });
    pc.createOffer().then(function (o) { return pc.setLocalDescription(o); })
      .then(function () { return gathered(pc, GATHER_MS); })
      .then(function () { if (!c.over && !pe.gone) return sendSignal(c, pid, 'offer', pc); })
      .catch(function () { removePeer(c, pid); });
    renderOthers(c);
  }
  function answerFrom(c, pid, sdp) {
    var pe = peerConn(c, pid), pc = pe.pc;
    pc.setRemoteDescription({ type: 'offer', sdp: sdp }).then(function () { return pc.createAnswer(); })
      .then(function (a) { return pc.setLocalDescription(a); })
      .then(function () { return gathered(pc, GATHER_MS); })
      .then(function () { if (!c.over && !pe.gone) return sendSignal(c, pid, 'answer', pc); })
      .catch(function () { removePeer(c, pid); });
    renderOthers(c);
    applyCaps(c);
  }
  function removePeer(c, pid) {
    var pe = c.peers[pid];
    if (!pe || pe.gone) return;
    pe.gone = true;
    if (pe.pc) { try { pe.pc.close(); } catch (e) { /* closed */ } }
    renderOthers(c);
    applyCaps(c);
  }
  /* With other relatives in the call the picture we send is smaller and slower (about 360p, 15 images a
     second), so that phones and the robot stay smooth. */
  function applyCaps(c) {
    var group = livePeerIds(c).length >= 1;
    var pcs = [c.pc].concat(livePeerIds(c).map(function (id) { return c.peers[id].pc; }));
    pcs.forEach(function (pc) {
      if (!pc || !pc.getSenders) return;
      pc.getSenders().forEach(function (snd) {
        if (!snd.track || snd.track.kind !== 'video' || !snd.getParameters) return;
        try {
          var prm = snd.getParameters();
          if (!prm.encodings || !prm.encodings.length) prm.encodings = [{}];
          var e = prm.encodings[0];
          if (group) { e.maxBitrate = 450000; e.maxFramerate = 15; if (snd.track.getSettings && (snd.track.getSettings().height || 0) > 400) e.scaleResolutionDownBy = Math.max(1, (snd.track.getSettings().height || 360) / 360); }
          else { delete e.maxBitrate; delete e.maxFramerate; delete e.scaleResolutionDownBy; }
          snd.setParameters(prm).catch(noop);
        } catch (err) { /* the browser keeps its defaults */ }
      });
    });
  }
  /* iPhone (Safari) may refuse to start the sound without a tap on the page: then one plain button
     "Tap to turn the sound on" over the picture; a tap anywhere starts it. */
  function playOrAsk(v) {
    var p;
    try { p = v.play(); } catch (e) { p = null; }
    if (p && p.then) p.then(function () { soundAsk(false); }, function (e) { if (!e || e.name !== 'AbortError') soundAsk(true); });
  }
  function soundAsk(on) { var b = document.getElementById('tapsound'); if (b) b.hidden = !on; }
  function soundTap() {
    var b = document.getElementById('tapsound'), r = document.getElementById('remotev');
    if (!b || b.hidden || !r) return;
    try {
      Array.prototype.slice.call(document.querySelectorAll('#others video')).forEach(function (v) { try { v.play().catch(noop); } catch (e2) { /* next tap */ } });
      var p = r.play(); if (p && p.then) p.then(function () { soundAsk(false); }, noop); else soundAsk(false);
    } catch (e) { /* the next tap */ }
  }
  function waitLoop(c) {
    if (c !== call || c.over || !c.id) return;
    request('GET', 'call/' + encodeURIComponent(c.id) + '/wait?since=' + c.since + (c.peer ? '&peer=' + encodeURIComponent(c.peer) : '')).then(function (d) {
      if (c !== call || c.over) return;
      c.fails = 0;
      c.since = d.last || c.since;
      (d.events || []).forEach(function (ev) { onEvent(c, ev); });
      setTimeout(function () { waitLoop(c); }, 30);
    }, function (e) {
      if (c !== call || c.over) return;
      if (e && e.status === 404) { finish(c, c.connectedAt ? 'ended' : 'lost'); return; }
      c.fails++;
      setTimeout(function () { waitLoop(c); }, Math.min(10000, 1000 * c.fails));
    });
  }
  function onEvent(c, ev) {
    if (c.over) return;
    if (ev.type === 'answer') {
      c.answeredAt = Date.now();
      if (view !== 'call') callView();
      c.pc.setRemoteDescription({ type: 'answer', sdp: ev.sdp }).catch(function () { finish(c, 'lost'); });
      armTimeout(c);
    } else if (ev.type === 'peer-joined') { if (ev.peer && !c.peers[ev.peer]) { c.peers[ev.peer] = { id: ev.peer, name: '', pc: null, remote: null, gone: false }; renderOthers(c); applyCaps(c); } }
    else if (ev.type === 'peer-left') removePeer(c, ev.peer);
    else if (ev.type === 'signal') {
      if (ev.kind === 'offer') answerFrom(c, ev.from, ev.sdp);
      else if (ev.kind === 'answer' && c.peers[ev.from] && c.peers[ev.from].pc) c.peers[ev.from].pc.setRemoteDescription({ type: 'answer', sdp: ev.sdp }).catch(function () { removePeer(c, ev.from); });
    } else if (ev.type === 'decline') finish(c, 'declined');
    else if (ev.type === 'missed') finish(c, 'missed');
    else if (ev.type === 'busy') finish(c, 'busy');
    else if (ev.type === 'hangup' && ev.by === 'robot') finish(c, ev.was === 'live' ? 'ended' : 'declined');
  }
  /* Answered, but no connection after 20 s: give up rather than wait for ever. */
  function armTimeout(c) { setTimeout(function () { if (c === call && !c.over && !c.connectedAt) finish(c, 'lost'); }, 20000); }
  function onConnection(c) {
    if (c !== call || c.over || !c.pc) return;
    var s = c.pc.connectionState;
    if (s === 'connected') {
      if (!c.connectedAt) c.connectedAt = Date.now();
      var w = document.getElementById('cwait'); if (w) w.hidden = true;
    } else if (s === 'failed') finish(c, 'lost');
    else if (s === 'disconnected') {
      var st = document.getElementById('cstate'), w2 = document.getElementById('cwait');
      if (st && w2) { st.textContent = t('connecting'); w2.hidden = false; }
      setTimeout(function () { if (c === call && !c.over && c.pc && c.pc.connectionState !== 'connected') finish(c, 'lost'); }, 8000);
    }
  }
  /* Ends the call on this side; kind null: no end screen (the caller decides what comes next). */
  function end(c, kind) {
    var secs = c && c.connectedAt ? Math.round((Date.now() - c.connectedAt) / 1000) : 0;
    if (c) {
      c.over = true;
      stop(c.local);
      if (c.pc) { try { c.pc.close(); } catch (e) { /* closed */ } }
      Object.keys(c.peers || {}).forEach(function (id) { var pe = c.peers[id]; pe.gone = true; if (pe.pc) { try { pe.pc.close(); } catch (e) { /* closed */ } } });
    }
    if (call === c) call = null;
    clearInterval(tickTimer);
    return secs;
  }
  function finish(c, kind) {
    /* Answered but the picture and sound never got through (14 Nov): without a TURN server this happens
       when the phone and the robot are on different networks (mobile data / clinic Wi-Fi). A calm,
       useful message instead of "the connection was interrupted". */
    var never = !!c && !c.connectedAt && (kind === 'lost' || (kind === 'ended' && !!c.answeredAt));
    var secs = end(c, kind);
    if (kind === 'busy') { home({ state: 'busy', next: '' }); return; }
    if (never) { message('end', t('noconnect', L()), [{ act: 'retry', label: t('retry'), primary: true }]); return; }
    if (kind === 'ended' || (kind === 'lost' && secs)) {
      message('end', '', []);
      app.querySelector('.msg').innerHTML = '<p class="brand">Bellatrix</p><div class="avatar" aria-hidden="true">' + initial() + '</div>' +
        '<h1>' + esc(kind === 'lost' ? t('lost') : t('ended')) + '</h1>' +
        '<p class="big" id="endlen">' + esc(t('duration', { d: length(secs) })) + '</p>' +
        '<p class="big thanks">' + esc(t('thanks')) + '</p>' +
        /* A call the care team started is used once: no "call again" button then. */
        (KIND === 'join' ? '' : '<div class="row"><button type="button" class="callbtn small" data-act="retry">' + I.phone + '<span>' + esc(t('again')) + '</span></button></div>');
      return;
    }
    message('end', t(kind === 'missed' ? 'missed' : kind === 'declined' ? 'declined' : 'lost', L()), [{ act: 'retry', label: t('back'), primary: true }]);
  }
  function hangUp() {
    var c = call;
    if (!c) return;
    if (c.id) request('POST', 'call/' + encodeURIComponent(c.id), { type: 'hangup', t: token, peer: c.peer }).catch(noop);
    if (c.connectedAt) { finish(c, 'ended'); return; }
    /* Cancelled before the call was answered: back to the call button. */
    end(c, null);
    refresh(false);
  }
  function toggle(kind, btn) {
    var c = call;
    if (!c || !c.local) return;
    var off = kind === 'mute' ? (c.muted = !c.muted) : (c.camOff = !c.camOff);
    (kind === 'mute' ? c.local.getAudioTracks() : c.local.getVideoTracks()).forEach(function (tr) { tr.enabled = !off; });
    btn.setAttribute('aria-pressed', off ? 'true' : 'false');
    btn.innerHTML = (kind === 'mute' ? I.mic : I.cam).replace('</svg>', off ? I.slash + '</svg>' : '</svg>') +
      '<span>' + esc(t(kind === 'mute' ? (off ? 'unmute' : 'mute') : (off ? 'camOn' : 'camOff'))) + '</span>';
    var self = document.getElementById('selfv'); if (self && kind === 'cam') self.classList.toggle('off', off);
  }

  /* ---------- Ludo with the resident, during the call ----------
     Bellatrix's screen holds the game: it sends the whole board and, on our turn, the moves we may
     make; this page draws it (js/ludo-board.js, the same drawing as on the robot) and only sends
     "roll" or "move". Everything travels on the call's data channel "game". */
  function openGameChannel(c, pc) {
    var dc;
    try { dc = pc.createDataChannel('game', { ordered: true }); } catch (e) { return; }
    c.dc = dc;
    dc.onopen = function () { gameSend(c, { type: 'hello', v: 1, games: window.LudoBoard ? ['ludo'] : [] }); };
    dc.onmessage = function (e) {
      var m = null;
      try { m = JSON.parse(e.data); } catch (x) { m = null; }
      if (m && typeof m === 'object' && c === call && !c.over) onGame(c, m);
    };
    dc.onclose = function () { if (c === call && c.game) closeGame(c, ''); };
  }
  function gameSend(c, m) {
    if (!c || !c.dc || c.dc.readyState !== 'open') return false;
    try { c.dc.send(JSON.stringify(m)); return true; } catch (e) { return false; }
  }
  function el(id) { return document.getElementById(id); }
  function onGame(c, m) {
    var inv = el('ginvite');
    if (m.type === 'invite') { if (inv && !c.game) { inv.hidden = false; var b = inv.querySelector('[data-act="gaccept"]'); if (b) b.focus(); } return; }
    if (m.type === 'cancel') { if (inv) inv.hidden = true; return; }
    if (m.type === 'end') { closeGame(c, t('gStopped')); return; }
    if (m.type === 'roster' && Array.isArray(m.peers)) {
      /* The names of everybody in the call, from the robot: the tiles of the other relatives carry them. */
      m.peers.forEach(function (x) { if (x && x.peer && x.peer !== m.you && c.peers[x.peer]) c.peers[x.peer].name = String(x.name || '').slice(0, 40); });
      renderOthers(c);
      return;
    }
    if (m.type === 'state' && m.state && m.state.seats) {
      if (inv) inv.hidden = true;
      c.game = m; c.sent = false;
      var box = app.querySelector('.incall');
      if (box) box.classList.add('gaming');
      if (el('game')) el('game').hidden = false;
      renderGame(c);
    }
  }
  function eventsText(you, events) {
    var parts = [], who = L();
    (events || []).forEach(function (e) {
      var me = e.seat === you;
      if (e.type === 'roll') parts.push(t(me ? 'eRollYou' : 'eRoll', { label: label, die: e.die }));
      else if (e.type === 'nomove') parts.push(t('eNoMove'));
      else if (e.type === 'enter') parts.push(t(me ? 'eEnterYou' : 'eEnter', who));
      else if (e.type === 'capture') parts.push(t(e.by === you ? 'eCaptureYou' : 'eCapture', who));
      else if (e.type === 'finish') parts.push(t(me ? 'eFinishYou' : 'eFinish', who));
      else if (e.type === 'extra' && e.reason === 'six') parts.push(t(me ? 'eSixYou' : 'eSix', who));
    });
    return parts.join(' ');
  }
  function renderGame(c) {
    var m = c.game, LB = window.LudoBoard;
    if (!m || !LB) return;
    var s = m.state, you = m.you, mine = !m.over && s.turn === you, hot = {}, moves = mine && s.phase === 'move' ? (m.moves || []) : [];
    hot[you] = moves.map(function (x) { return x.token; });
    el('gboard').innerHTML = LB.boardSvg(s, { hot: hot });
    el('gdie').innerHTML = m.die ? LB.dieSvg(m.die.n, LB.COLORS[s.seats[m.die.seat].color]) : '';
    el('gturn').textContent = m.over ? (s.winner === you ? t('gYouWon') : t('gWon', L())) : mine ? t('gYourTurn') : t('gTheirTurn', L());
    el('glegend').innerHTML = '<span>' + LB.tokenIcon(s.seats[you].color, '') + esc(t('gYou')) + '</span><span>' + LB.tokenIcon(s.seats[1 - you].color, '') + esc(label) + '</span>';
    var note = eventsText(you, m.events);
    if (note || m.over) el('gnote').textContent = m.over ? (note + ' ' + t('gThanks')).trim() : note;
    var html = '';
    if (mine && s.phase === 'roll') html = '<button type="button" class="callbtn groll" data-act="groll">' + svgDie() + '<span>' + esc(t('gRoll')) + '</span></button>';
    else if (moves.length) {
      html = moves.map(function (x) {
        var what = x.enters ? t('gOut', { n: x.token + 1 }) : x.finishes ? t('gHome', { n: x.token + 1 }) : t('gMove', { n: x.token + 1, d: s.die });
        return '<button type="button" class="gtoken" data-act="gmove" data-token="' + x.token + '">' + LB.tokenIcon(s.seats[you].color, x.token + 1) +
          '<span>' + esc(what) + (x.captures ? ' · ' + esc(t('gTakes')) : '') + '</span></button>';
      }).join('');
    }
    el('gbtns').innerHTML = html;
  }
  function svgDie() {
    return svg('<rect x="12" y="12" width="76" height="76" rx="16" fill="none" stroke="currentColor" stroke-width="8"/><circle cx="32" cy="32" r="7" fill="currentColor"/>' +
      '<circle cx="68" cy="32" r="7" fill="currentColor"/><circle cx="50" cy="50" r="7" fill="currentColor"/><circle cx="32" cy="68" r="7" fill="currentColor"/><circle cx="68" cy="68" r="7" fill="currentColor"/>');
  }
  /* A tap on our turn: sent once, then the buttons wait for the next board from Bellatrix. */
  function gamePlay(c, msg) {
    if (!c.game || c.sent) return;
    msg.step = c.game.state.step;
    if (!gameSend(c, msg)) return;
    c.sent = true;
    el('gbtns').innerHTML = '<p class="gnote">' + esc(t('gWait')) + '</p>';
  }
  function closeGame(c, note) {
    c.game = null;
    var box = app.querySelector('.incall'), g = el('game'), tip = el('gtoast');
    if (box) box.classList.remove('gaming');
    if (g) g.hidden = true;
    if (tip && note) {
      tip.textContent = note; tip.hidden = false;
      clearTimeout(closeGame.t); closeGame.t = setTimeout(function () { tip.hidden = true; }, 4000);
    }
  }

  app.addEventListener('click', function (e) {
    soundTap();
    var b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b || b.disabled) return;
    var a = b.getAttribute('data-act');
    if (a === 'call') startCall();
    else if (a === 'cancel' || a === 'hangup') hangUp();
    else if (a === 'retry' || a === 'home') refresh(false);
    else if (a === 'mute' || a === 'cam') toggle(a, b);
    else if (call && a === 'gaccept') { el('ginvite').hidden = true; if (gameSend(call, { type: 'accept' })) el('gtoast').hidden = true; }
    else if (call && a === 'gdecline') { el('ginvite').hidden = true; gameSend(call, { type: 'decline' }); }
    else if (call && a === 'groll') gamePlay(call, { type: 'roll' });
    else if (call && a === 'gmove') gamePlay(call, { type: 'move', token: parseInt(b.getAttribute('data-token'), 10) });
    else if (call && a === 'gleave') { gameSend(call, { type: 'leave' }); closeGame(call, ''); }
  });
  /* Closing the page during a call hangs up at once, so Bellatrix does not keep ringing. */
  window.addEventListener('pagehide', function () {
    if (call && call.id && navigator.sendBeacon) {
      try { navigator.sendBeacon(API + 'call/' + encodeURIComponent(call.id), JSON.stringify({ type: 'hangup', t: token, peer: call.peer })); } catch (e) { /* best effort */ }
    }
  });
  window.addEventListener('hashchange', function () { if (!call) { token = tokenFromHash(); KIND = kindFromHash(); refresh(false); } });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && view === 'home') refresh(true); });

  setLang(lang);
  if (!window.fetch || !window.Promise) message('error', t('server'));
  else refresh(false);
})();
