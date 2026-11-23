/* Care Team side of the Care Lab: choosing the patient and the activity, the hand-over to the
   patient screen, the notes after a session and the saved results. Everything is kept in this
   browser; reports can be downloaded as Markdown or CSV (the files stay in English).
   Every text on this page goes through ST() (js/i18n-staff.js): the care team chooses FR, EN or DE
   at the top right, separately from each patient's language. */
(function () {
  'use strict';
  var KEY = 'bellatrix-care-lab-v1';
  var $ = function (id) { return document.getElementById(id); };
  var esc = Lab.esc;
  var id = function (s) { return s; };

  var RESULTS = ['Pass', 'Pass with friction', 'Fail', 'Blocked'];
  var SCORES = [['3', 'reliable and intuitive'], ['2', 'works with minor friction'], ['1', 'unstable or staff-dependent'], ['0', 'not usable']];
  var ROLE_QS = ['What did you think the robot wanted you to do?', 'What felt easy?', 'What felt confusing, too fast, too loud, or uncomfortable?', 'Did you feel able to stop?', 'Would you choose this interaction again?'];
  var CARE_QS = ['Did the robot fit the routine?', 'Where did you need to intervene?', 'Was setup worth the value?', 'Could another colleague repeat it tomorrow?', 'What single change would matter most?'];

  /* Readable names for what the activities count. */
  var STAT_LABELS = {
    albumMinutes: 'Memories: minutes', albumPictures: 'Memories: pictures seen', albumDaily: 'Memories: pictures of the day seen', readingPages: 'Reading: pages read', readingPremiumAsked: 'Reading: Premium asked for',
    readingSpeed: 'Reading: voice speed', readingChosen: 'Reading: books chosen', readingFinished: 'Reading: books finished',
    playNextShown: 'Bellatrix Play: next-song ideas shown', playNextChosen: 'Bellatrix Play: next-song ideas chosen', playStops: 'Bellatrix Play: songs stopped', playWeekly: 'Bellatrix Play: playlist of the week played',
    replays: 'Played again', storyRepeats: 'Story repeated', memoriesShared: 'Memories shared', chosen: 'Pictures chosen',
    rightFirstTry: 'Right on the first try', rightAfterRetry: 'Right after another try', notQuite: 'Not quite (tries)', answersShown: 'Answers shown', skipped: 'Sayings skipped',
    category: 'Kind of music', songsRight: 'Songs guessed', songsOther: 'Another song chosen', songsSkipped: 'Songs skipped', volumeChanges: 'Volume changes', musicPlays: 'Music started',
    moves: 'Movements', chessMode: 'Chess: who played', chessResult: 'Chess: result', chessMoves: 'Chess: moves', chessHints: 'Chess: hints used', chessUndos: 'Chess: moves taken back', chessMinutes: 'Chess: minutes', ludoPlayers: 'Ludo: players', ludoWhere: 'Ludo: where the players were', ludoWinner: 'Ludo: winner', ludoTurns: 'Ludo: steps played', ludoTokens: 'Ludo: tokens per player', ludoGuests: 'Ludo: other robots joined', pairSeconds: 'Seconds per pair', notAPair: 'Not-a-pair tries', roundsDone: 'Levels done', roundsSkipped: 'Levels skipped', roundSeconds: 'Seconds per level', levelReached: 'Highest level reached', peeks: 'Cards shown again',
    lunch: 'Lunch chosen', afternoon: 'Afternoon chosen', choicesSent: 'Daily Choice: sent to the care team',
    todayShown: 'Hello: date and season shown', birthday: 'Hello: birthday greeting', singAlongs: 'Songs sung along',
    callFrom: 'Family call: from', callRelation: 'Family call: who they are', callAnswered: 'Family call: answered', callEndedBy: 'Family call: ended by',
    chessResumed: 'Chess: unfinished game continued', chessPuzzlesSolved: 'Chess: puzzles solved', chessPuzzlesTried: 'Chess: puzzles tried', ludoFlicks: 'Ludo: die thrown by a flick of the hand', playItems: 'Bellatrix Play: songs and films', playMinutes: 'Bellatrix Play: minutes listened', playLikes: 'Bellatrix Play: hearts',
    playDislikes: 'Bellatrix Play: not for me', playLiked: 'Bellatrix Play: liked', playSkipped: 'Bellatrix Play: not for them', playStart: 'Bellatrix Play: started with', playBorn: 'Bellatrix Play: year of birth used',
    playEnded: 'Bellatrix Play: listened to the end', playErrors: 'Bellatrix Play: videos that could not play', playLists: 'Bellatrix Play: playlists chosen', playChosen: 'Bellatrix Play: which playlists', changes: 'Changed their mind',
    moveZone: 'Seated movement: body part', moveSource: 'Seated movement: movements of the day', moveVideo: 'Seated movement: video',
    hungUp: 'Call ended', cameraToggles: 'Camera switched during the call', callSeconds: 'Call length (s)', answers: 'Answers'
  };

  /* ---------- storage ---------- */
  var store = load();
  function load() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }
    s.sessions = s.sessions || []; s.settings = s.settings || {}; s.patients = s.patients || {};
    /* Texts edited in version 1.0 were the same for everybody: they become the current patient's. */
    if (s.content && Object.keys(s.content).length) {
      var code = s.settings.participant || 'P1';
      s.patients[code] = s.patients[code] || { content: {}, prefs: {} };
      if (!Object.keys(s.patients[code].content || {}).length) s.patients[code].content = s.content;
    }
    delete s.content;
    if (s.settings.staff === 'Rahma') s.settings.staff = '';
    /* The robot cannot listen: voice answers stay off. */
    s.settings.voice = false;
    return s;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); $('storeWarn').hidden = true; return true; }
    catch (e) { $('storeWarn').hidden = false; return false; }
  }

  /* ---------- small helpers ---------- */
  function download(name, text, type) {
    /* In the robot app a download link does nothing: the file is saved in the app's folder on
       the robot, and "Collect results from robot.bat" copies it to the laptop. */
    if (window.BellatrixApp && window.BellatrixApp.saveFile) {
      var where = '';
      try { where = window.BellatrixApp.saveFile(name, text); } catch (e) { where = ''; }
      Lab.toast(where ? ST('Saved on the robot: {name}', { name: name }) : ST('The robot could not save {name}.', { name: name }));
      return;
    }
    var blob = new Blob([text], { type: type || 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function csv(rows) { return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'); }
  function stamp() { var d = new Date(); return Lab.today(d) + '-' + Lab.pad(d.getHours()) + Lab.pad(d.getMinutes()); }
  function dur(s) { s = s || 0; return Math.floor(s / 60) + ' min ' + (s % 60) + ' s'; }
  function hhmm(iso) { return iso ? Lab.clock(new Date(iso)).slice(0, 5) : ''; }
  function mdCell(v) { return String(v == null ? '' : v).replace(/\|/g, '/').replace(/\n/g, ' '); }
  function val(id) { var el = $(id); return el ? el.value : ''; }
  /* An activity's name in the team's language (the patient side already translates the names). */
  function actName(a) { return ST(a && a.name || ''); }

  /* ---------- tabs (15 Nov: four) and their sub-sections ----------
     Family: messages to approve and family accounts (js/messages-staff.js), calls (js/family-staff.js).
     Every change is announced with the window event 'bellatrix-staff-sub' { tab, sub }: each module
     draws its part when it is shown (StaffUI.current() says what is shown now).
     15 Nov (Rahma): the "Music & photos" tab (id 'contents') is gone. Its parts are in the settings of
     the activity that uses them (Personalise, see actHosts below): Memories the family photos and the
     album, Book reading the books, Bellatrix Play the playlists, Group karaoke the karaoke lists. */
  var TABS = ['session', 'results', 'family', 'library'];
  var SUBS = { family: ['queue', 'accounts', 'calls'] };
  /* The tabs of version 1.14 (a module per tab) lead to their new place. */
  var OLD_TABS = { messages: ['family', 'queue'] };
  /* The old sub-sections of "Music & photos", asked by name: the activity that holds that part now. */
  var OLD_SUBS = { music: 'play', karaoke: 'karaoke', album: 'album', reading: 'reading' };
  var shown = { tab: 'session', sub: null };
  function remembered(tab) { try { return sessionStorage.getItem('labSub-' + tab); } catch (e) { return null; } }
  function announce() {
    try { window.dispatchEvent(new CustomEvent('bellatrix-staff-sub', { detail: { tab: shown.tab, sub: shown.sub } })); } catch (e) { /* old browser */ }
  }
  function showSub(tab, sub, quiet) {
    var list = SUBS[tab], panel = $('tab-' + tab);
    if (!list || !panel) return;
    if (list.indexOf(sub) < 0) sub = remembered(tab);
    if (list.indexOf(sub) < 0) sub = list[0];
    Array.prototype.forEach.call(panel.querySelectorAll('.subnav [data-sub]'), function (b) { b.setAttribute('aria-selected', b.getAttribute('data-sub') === sub ? 'true' : 'false'); });
    Array.prototype.forEach.call(panel.querySelectorAll('.subpanel'), function (p) { p.hidden = (' ' + (p.getAttribute('data-for') || '') + ' ').indexOf(' ' + sub + ' ') < 0; });
    shown = { tab: tab, sub: sub };
    try { sessionStorage.setItem('labSub-' + tab, sub); } catch (e) { /* not needed */ }
    if (sub === 'calls' && window.FamilyStaff) FamilyStaff.open();
    if (!quiet) announce();
  }
  function showTab(name, sub) {
    if (OLD_TABS[name]) { sub = OLD_TABS[name][1]; name = OLD_TABS[name][0]; }
    if (name === 'contents' && OLD_SUBS[sub]) { openActivity(OLD_SUBS[sub]); return; }
    if (TABS.indexOf(name) < 0) name = 'session';
    document.querySelectorAll('.ctop .tabs [data-tab]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === name ? 'true' : 'false'); });
    TABS.forEach(function (t) { var p = $('tab-' + t); if (p) p.hidden = t !== name; });
    shown = { tab: name, sub: null };
    if (name === 'results') { seenResults(); renderResults(); }
    if (name === 'library' && window.Library) Library.open();
    if (SUBS[name]) showSub(name, sub, true);
    try { sessionStorage.setItem('labTab', name); } catch (e) { /* not needed */ }
    announce();
  }

  /* ---------- the team's language: FR / EN / DE at the top right ---------- */
  function renderLangSwitch() {
    var cur = ST.lang(), box = $('langSwitch');
    if (!box) return;
    box.setAttribute('aria-label', ST('Language of this page'));
    Array.prototype.forEach.call(box.querySelectorAll('[data-ui-lang]'), function (b) {
      var on = b.getAttribute('data-ui-lang') === cur;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function setTeamLang(l) {
    /* Redrawn also when the stored language already changed (another tab, a script) but this page
       still shows the one it was drawn in. */
    if (l === ST.lang() && l === document.documentElement.lang) return;
    ST.setLang(l);
    /* Everything is drawn again in the new language (the open tab is kept). */
    location.reload();
  }

  /* ---------- patients ----------
     Everything staff personalise is kept per patient code: the texts of each activity, the name
     Bellatrix greets them with and their screen settings. Their pictures and songs live in Media. */
  function patientCode() { return (val('fParticipant') || '').trim() || 'P1'; }
  function patient(code) {
    code = code || patientCode();
    var p = store.patients[code] = store.patients[code] || { content: {}, prefs: {} };
    p.content = p.content || {}; p.prefs = p.prefs || {};
    return p;
  }
  function usePatient(code) { Lab.patient = code; Lab.content = patient(code).content; }

  /* ---------- session setup ---------- */
  function renderSetup() {
    var st = store.settings;
    $('fParticipant').value = st.participant || 'P1';
    /* 23 Nov: the prototypes (red heart, then object + button) are a fourth choice: pointing in the air with them */
    var q = function (v) { return document.querySelector('input[name="camMode"][value="' + v + '"]'); };
    var mode = (st.camMode === 'air' && st.airInput && q(st.airInput)) || q(st.camMode || 'off');
    if (mode) mode.checked = true;
    $('optCamMove').checked = true;   /* the camera counts the movements automatically */
    buildTiles();
    renderFilter();
    if ($('topFace')) $('topFace').innerHTML = Lab.faceHtml();
    renderPatient();
    renderSupport();
  }
  /* The tiles, one per activity this screen has: the built-in ones and those of the packs installed
     from the Library (they arrive a moment after the page, once their signature is checked). */
  function buildTiles() {
    var st = store.settings, want = st.activity || 'hello';
    if (!Lab.byKey[want] || Lab.byKey[want].hidden) want = 'hello';
    /* act.hidden: started by something else, never from a tile (the incoming family call). */
    /* 1.16: Hello & Today is now the patient's waiting screen: no tile (kept in Lab, nothing deleted). */
    if (want === 'hello') want = (Lab.activities.filter(function (a) { return !a.hidden && a.key !== 'hello'; }).sort(function (a, b) { return a.day - b.day; })[0] || {}).key || 'hello';
    $('actList').innerHTML = Lab.activities.filter(function (a) { return !a.hidden && a.key !== 'hello'; }).sort(function (a, b) { return a.day - b.day; }).map(function (a, i, all) {
      var cat = catOf(a);
      /* the care team's own games (js/games.js) come last, under their heading, "New" until played */
      return (a.team && !(i && all[i - 1].team) ? '<h3 class="tsec">' + esc(ST('Team games')) + '</h3>' : '') +
        '<label class="tile' + (a.team ? ' team' : '') + '" data-key="' + a.key + '"><input type="radio" name="activity" value="' + a.key + '"' + (want === a.key ? ' checked' : '') + '>' +
        '<span class="tart">' + tileArt(a) + '</span><span class="tfavmark" aria-hidden="true">★</span><span class="tbadge" hidden></span><span class="tlock" hidden>🔒 ' + esc(ST('Library')) + '</span>' +
        '<span class="tbody"><span class="tname">' + esc(actName(a)) + '</span><span class="tmeta"><span class="tcat ' + catCls(cat) + '">' + esc(ST(cat)) + '</span>' + (a.team ? '<span class="tnew">' + esc(ST('New')) + '</span>' : '') + '</span></span></label>';
    }).join('');
  }
  function locked(key) { return typeof Store !== 'undefined' && !Store.allowed(key); }
  /* What this screen cannot do, in one short line. Runs again when the robot's voice is ready. */
  function renderSupport() {
    var notes = [];
        if (!window.isSecureContext) notes.push(ST('The camera needs the page opened from localhost.'));
    $('support').textContent = notes.join(' ');
    $('support').hidden = !notes.length;
  }
  window.addEventListener('bellatrixvoice', function () { if ($('support')) renderSupport(); });
  /* Shows the chosen patient's settings and the personalisation of the chosen activity. */
  function renderPatient() {
    var code = patientCode(), pr = patient(code).prefs, codes = Object.keys(store.patients).sort();
    usePatient(code);
    $('patientList').innerHTML = codes.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('');
    $('fGreet').value = pr.greet || '';
    if (ensureSector()) $('fSector').value = pr.sector || '';   /* 1.17 */
    $('optRate').value = String(pr.rate || 0.92);
    $('optVolume').value = String(Math.round((pr.volume || 0.9) * 100));
    $('optText').value = pr.textSize || 'normal';
    $('optSubs').checked = !!pr.subtitles;
    $('optLang').value = I18N.valid(pr.lang);
    $('optMood').checked = pr.mood !== false;
    renderLife(code, pr);
    renderContent();
    refreshApps();
  }
  /* ---------- the life story (version 1.11) ----------
     One place per patient for what Bellatrix should know: Bellatrix Play takes the year of birth
     and the music, Hello & Today the birthday, the monthly summary all of it. The fields that
     existed inside those activities before are taken over once. */
  var LIFE_FIELDS = { born: 'fBorn', birthday: 'fBirthday', home: 'fHome', loves: 'fLoves', avoid: 'fAvoid', talk: 'fTalk' };
  function lifeOf(code) {
    var p = patient(code);
    if (!p.prefs.life) {
      var c = p.content || {}, play = c.play || {}, hello = c.hello || {};
      p.prefs.life = { born: play.born || '', birthday: hello.birthday || '', home: '', loves: play.loves || '', avoid: play.avoid || '', talk: '' };
    }
    return p.prefs.life;
  }
  function familyOf(code) {
    try { var b = JSON.parse(localStorage.getItem('bellatrix-family') || '{}'); return ((b.residents || {})[code] || {}).contacts || []; } catch (e) { return []; }
  }
  function renderLife(code, pr) {
    var life = lifeOf(code);
    Object.keys(LIFE_FIELDS).forEach(function (k) { if ($(LIFE_FIELDS[k])) $(LIFE_FIELDS[k]).value = life[k] || ''; });
    var fam = familyOf(code);
    if ($('lifeFamily')) $('lifeFamily').innerHTML = '<b>' + esc(ST('Family')) + ':</b> ' + (fam.length
      ? fam.map(function (c) { return esc(c.name || '') + (c.relation ? ' (' + esc(c.relation) + ')' : ''); }).join(', ') + ' · <a href="#" id="toFamily">' + esc(ST('edit')) + '</a>'
      : esc(ST('nobody yet.')) + ' <a href="#" id="toFamily">' + esc(ST('Add someone')) + '</a>');
    var link = $('toFamily');
    if (link) link.addEventListener('click', function (e) { e.preventDefault(); showTab('family'); });
  }
  function readLife(pr) {
    var life = pr.life = pr.life || {};
    Object.keys(LIFE_FIELDS).forEach(function (k) { if ($(LIFE_FIELDS[k])) life[k] = $(LIFE_FIELDS[k]).value.trim(); });
    return life;
  }
  function selected() {
    var r = document.querySelector('input[name="activity"]:checked');
    return Lab.byKey[r ? r.value : 'hello'] || Lab.activities[0];
  }

  /* ---------- the activities as app tiles ----------
     Each activity is a tile with its picture, its name and a category. The radio button inside
     each tile is the choice (selected() reads it). Favourites are kept per patient; the filter is
     a convenience of this screen only. */
  /* 1.16: 'postcards' is part of Memories ('album', agent G) and 'musicmoment' is gone (agent E). */
  var CATS = { hello: 'Daily life', sayings: 'Memory', song: 'Music', move: 'Movement', pairs: 'Games',
    choice: 'Daily life', call: 'Social', quiz: 'Social', chess: 'Games', ludo: 'Games', play: 'Music',
    karaoke: 'Music', messages: 'Social', album: 'Memory', reading: 'Daily life' };
  var CAT_ORDER = ['Memory', 'Music', 'Movement', 'Games', 'Social', 'Daily life'];
  /* One short sentence per activity (the long description stays in the activity itself). */
  var DESC = {
    hello: 'The day’s welcome: date, season and time, shown while Bellatrix waits.',
    sayings: 'Finish well-known sayings, with no pressure.',
    song: 'Listen to a short clip and guess the song.',
    move: 'Gentle seated movements, new every day.',
    pairs: 'Turn the cards over and find the pairs.',
    choice: 'Choose lunch and the afternoon activity.',
    call: 'Practise a video call with a pretend relative.',
    quiz: 'A light quiz about kindness.',
    play: 'Music of every era, chosen for them, with the words.',
    chess: 'Chess against Bellatrix, with a partner, or short puzzles.',
    ludo: 'Ludo for 2 to 6 players; Bellatrix takes the free places.',
    karaoke: 'Sing well-known songs together, with the words on the screen.',
    messages: 'Photos and words from the family.',
    album: 'Photos and pictures to talk about, each with its story.',
    reading: 'Books read aloud, page by page.'
  };
  function descOf(a) {
    if (DESC[a.key]) return ST(DESC[a.key]);
    var first = String(a.flow || '').split(/(?:\.|:)\s/)[0];
    return ST(first.replace(/\.$/, '') + '.');
  }
  var CAM_NAME = { off: 'touch', signs: 'hand signs', air: 'pointing in the air', heart: 'red heart', object: 'object and button' };
  var LANG_SHORT = { en: 'English', fr: 'Français', de: 'Deutsch' };
  var filter = 'all';
  try { filter = sessionStorage.getItem('labFilter') || 'all'; } catch (e) { filter = 'all'; }
  function catOf(a) { return a && a.team ? 'Team games' : CATS[a.key] || 'Other'; }
  function catCls(c) { return 'c-' + c.toLowerCase().replace(/[^a-z]+/g, '-'); }
  function tileArt(a) { try { return a.art ? a.art(Lab._t.api) : ''; } catch (e) { return ''; } }
  function favs() { var pr = patient().prefs; pr.favs = pr.favs || []; return pr.favs; }
  function days(iso) { return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); }
  function ago(iso) {
    if (!iso) return '';
    var d = days(iso);
    return d <= 0 ? ST('today') : d === 1 ? ST('yesterday') : ST('{n} days ago', { n: d });
  }
  function playedBadge(iso) {
    var d = days(iso);
    return d <= 0 ? ST('Played today') : d === 1 ? ST('Played yesterday') : ST('Played {n} days ago', { n: d });
  }
  function lastFor(code, key) {
    var hit = null;
    store.sessions.forEach(function (s) { if (s.participant === code && (!key || s.activity === key) && (!hit || s.startedAt > hit.startedAt)) hit = s; });
    return hit;
  }
  function renderFilter() {
    var list = [['all', 'All'], ['fav', '★ Favourites']].concat(CAT_ORDER.map(function (c) { return [c, c]; }));
    $('actFilter').setAttribute('aria-label', ST('Show'));
    $('actFilter').innerHTML = list.map(function (f) {
      return '<button type="button" class="chip' + (f[0] === filter ? ' on' : '') + (f[0] !== 'all' && f[0] !== 'fav' ? ' ' + catCls(f[0]) : '') + '" data-f="' + esc(f[0]) + '">' + esc(ST(f[1])) + '</button>';
    }).join('');
  }
  function renderTiles() {
    var code = patientCode(), fav = favs(), cur = selected().key;
    Array.prototype.forEach.call(document.querySelectorAll('#actList .tile'), function (t) {
      var key = t.getAttribute('data-key'), a = Lab.byKey[key], last = lastFor(code, key);
      var show = filter === 'all' || (filter === 'fav' ? fav.indexOf(key) >= 0 : catOf(a) === filter);
      t.hidden = !show;
      t.classList.toggle('on', key === cur);
      t.classList.toggle('fav', fav.indexOf(key) >= 0);
      var b = t.querySelector('.tbadge'), lock = locked(key);
      b.textContent = last ? playedBadge(last.startedAt) : '';
      b.hidden = !last || lock;
      t.classList.toggle('locked', lock);
      t.querySelector('.tlock').hidden = !lock;
      var nw = t.querySelector('.tnew');
      if (nw) nw.hidden = store.sessions.some(function (s) { return s.activity === key; });
    });
    var any = Array.prototype.some.call(document.querySelectorAll('#actList .tile'), function (t) { return !t.hidden; });
    $('actEmpty').hidden = any;
    var sec = document.querySelector('#actList .tsec');
    if (sec) sec.hidden = !document.querySelector('#actList .tile.team:not([hidden])');
  }
  function renderDetail() {
    var a = selected(), fav = favs().indexOf(a.key) >= 0, cat = catOf(a);
    var favLabel = fav ? ST('Favourite') : ST('Add to favourites');
    $('actHead').innerHTML = '<div class="dart">' + tileArt(a) + '</div>' +
      '<div class="dtext"><p class="dkick"><span class="tcat ' + catCls(cat) + '">' + esc(ST(cat)) + '</span></p>' +
      '<h2 class="dname">' + esc(actName(a)) + '</h2><p class="ddesc">' + esc(descOf(a)) + '</p></div>' +
      '<button type="button" class="favbtn' + (fav ? ' on' : '') + '" id="favBtn" aria-pressed="' + fav + '" title="' + esc(favLabel) + '" aria-label="' + esc(favLabel) + '">' + (fav ? '★' : '☆') + '</button>';
    $('favBtn').addEventListener('click', toggleFav);
    var lock = locked(a.key);
    if (lock) {
      $('actHead').insertAdjacentHTML('beforeend', '<div class="lockmsg"><span>🔒 ' + esc(ST('Not active in this care home.')) + '</span>' +
        '<button type="button" class="go" id="toLibrary">' + esc(ST('Open the Library')) + '</button></div>');
      $('toLibrary').addEventListener('click', function () { showTab('library'); });
    }
    $('go').disabled = lock; $('preview').disabled = lock;
    /* The movement camera only matters for the seated movements. */
    $('camMoveRow').hidden = true;
    renderCamNote();
    if (a.key === 'play' && !lock) renderPlayTaste();
    if (a.team && window.GamesStaff) GamesStaff.detail(a, $('actHead'));   /* Try, Update, Remove (js/games-staff.js) */
  }
  /* Bellatrix Play: what this patient likes (learned on the patient screen from the hearts and the
     songs listened to the end), and a one-tap "calm music now" for difficult moments. */
  function renderPlayTaste() {
    var code = patientCode(), mine = {};
    try { mine = (JSON.parse(localStorage.getItem('bellatrix-play-taste') || '{}') || {})[code] || {}; } catch (e) { mine = {}; }
    var list = Object.keys(mine).map(function (k) { return mine[k]; });
    function names(arr) { return arr.map(function (t) { return esc((t.a ? t.a + ' – ' : '') + (t.t || '')); }).join(' · '); }
    var life = lifeOf(code), born = parseInt(life.born, 10);
    var liked = list.filter(function (t) { return t.s >= 2; }).sort(function (x, y) { return y.s - x.s; }).slice(0, 6);
    var not = list.filter(function (t) { return t.s <= -3; }).slice(0, 4);
    $('actHead').insertAdjacentHTML('beforeend', '<div class="playtaste"><div>' +
      '<p><b>' + esc(ST('Likes')) + ':</b> ' + (liked.length ? names(liked) : esc(ST('nothing yet.'))) + '</p>' +
      (not.length ? '<p class="note"><b>' + esc(ST('Not for them')) + ':</b> ' + names(not) + '</p>' : '') +
      (born ? '' : '<p class="note">' + esc(ST('Add the year of birth in the Life story.')) + '</p>') + '</div>' +
      '<div class="playbtns"><button type="button" class="ghost" id="toPlaylists">' + esc(ST('Playlists of the week')) + '</button>' +
      '<button type="button" class="go" id="calmNow">😌 ' + esc(ST('Calm music now')) + '</button></div></div>');
    /* 1.16: the short way to this resident's weekly and monthly playlists (test 7). */
    $('toPlaylists').addEventListener('click', function () {
      if (window.RecoStaff && RecoStaff.show) RecoStaff.show(code); else openActivity('play', code);
    });
    $('calmNow').addEventListener('click', function () {
      try { localStorage.setItem('bellatrix-play-start', 'calm'); } catch (e) { /* starts on the channel instead */ }
      handOver(false);
    });
  }
  function toggleFav() {
    var key = selected().key, list = favs(), i = list.indexOf(key);
    if (i >= 0) list.splice(i, 1); else list.push(key);
    save(); renderDetail(); renderTiles();
  }
  /* the choice as the patient screen knows it: the red heart (23 Nov prototype) is pointing in the air ('air') with
     airInput 'heart' */
  function camChoice() { var m = document.querySelector('input[name="camMode"]:checked'); return m ? m.value : 'off'; }
  function camMode() { var c = camChoice(); return c === 'heart' || c === 'object' ? 'air' : c; }
  function renderCamNote() {
    var cam = camMode() !== 'off' || (selected().key === 'move' && $('optCamMove').checked);
    $('camNote').hidden = !cam;
  }
  function renderSummary() {
    var a = selected(), pr = patient().prefs;
    $('startSummary').innerHTML = '<b>' + esc(patientCode()) + '</b> · ' + esc(actName(a)) + ' · ' + esc(LANG_SHORT[I18N.valid(pr.lang)]) + ' · ' + esc(ST(CAM_NAME[camChoice()]));
  }
  function renderPatientCard() {
    var code = patientCode();
    $('pAvatar').textContent = code.slice(0, 3).toUpperCase();
    var played = lastFor(code);
    /* 1.15 (user, 10 Nov): the mood question is gone, so the card shows the last activity only.
       1.16: and a short way to this resident's Results (the tester did not find the page). */
    /* 12 Nov (Rahma): the "Last activity" box is gone from the patient card (cleaner). The Results tab stays the way to the sessions. */
    $('pMood').innerHTML = ''; $('pMood').hidden = true;
    var link = $('toResults');
    if (link) link.addEventListener('click', function (e) { e.preventDefault(); resultsFor = code; showTab('results'); });
  }
  function refreshApps() { renderPatientCard(); renderTiles(); renderDetail(); renderSummary(); }

  /* ---------- personalising an activity for a patient ----------
     The fields come from each activity's `content` (in English): their labels, notes and options
     are translated here. Long hints are shortened (SHORT) or left out. */
  var DECADE_LIST = ['1920s', '1930s', '1940s', '1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
  var COL_LABEL = { title: 'Title', kind: 'Kind of music', decade: 'Decade' };
  var SHORT = {
    'The birthday comes from the patient’s life story (Activities, 1 Patient): on that day Bellatrix wishes a happy birthday and sings with them.': 'The birthday comes from the Life story.',
    'Year of birth, favourite music and music to avoid come from the patient’s life story (Activities, 1 Patient).': 'Year of birth and music come from the Life story.',
    'Use only clips Labland may play (licensed or made internally). The title becomes the answer card. Decade cards appear once the songs cover two or more decades.': 'The title becomes the answer card.',
    'Optional: up to six pictures the patient knows (for example familiar objects). Missing ones are filled with the built-in symbols.': 'Optional: up to six pictures they know.',
    'Optional for each mood. Without songs, built-in tunes play. Use only music Labland may play.': 'Optional. Without songs, built-in tunes play.',
    'Only with the contact’s agreement. Without a photo, a drawn picture with the first letter is shown.': 'Only with the contact’s agreement.',
    'One per line: the question | three answers split by / | what Bellatrix says after any answer.': 'One per line: question | answer / answer / answer | reply.',
    'Only with the agreement of the people in the video. For example: Leo’s first steps | https://youtu.be/…': 'Only with the agreement of the people filmed.',
    'At every level she plays a checkmate when she has one, never leaves her queen or a rook to be taken for nothing, and always takes a queen or rook that is given away.': '',
    'An unfinished game is kept for 30 days: next time, Bellatrix offers to continue it or start a new one.': '',
    'About how long, with Bellatrix and easy rules: 2 players 3, 5 or 12 minutes (1, 2 or 4 tokens); 4 players 5, 12 or 35 minutes; 6 players 10, 30 or over 90 minutes.': '',
    'The other places are taken by people at other robots, or by Bellatrix.': '',
    'The patient can always tap “I’m ready” to turn them over sooner.': ''
  };
  /* A hint, translated, or nothing when it is long and not needed. */
  function hint(s) {
    if (!s) return '';
    if (Object.prototype.hasOwnProperty.call(SHORT, s)) return SHORT[s] ? ST(SHORT[s]) : '';
    return s.length > 110 ? '' : ST(s);
  }
  var preview = null;
  function mq(act, slot, type) { return { patient: Lab.patient, activity: act.key, slot: slot, type: type }; }
  /* 1.16 "Contenu du jour" (Daily.peek) with "Ne plus proposer" per item, for the four daily activities. */
  var DAILY_KIND = { sayings: 'sayings', quiz: 'quiz', album: 'memories', move: 'move' };
  function dailyText(kind, it) { return kind === 'sayings' ? it.start + ' ' + it.end : kind === 'quiz' ? it.q : it.title; }
  function dailyListHtml(act) {
    var kind = DAILY_KIND[act.key];
    if (!kind || typeof Daily === 'undefined' || !Daily.peek) return '';
    var lg = I18N.valid(patient().prefs.lang), o = { lang: lg, code: Lab.patient }, day = null, gone = [];
    try { day = Daily.peek(kind, o); gone = Daily.blocked(kind, Lab.patient) || []; } catch (e) { return ''; }
    var items = day && day.length ? Array.prototype.slice.call(day) : [];
    if (!items.length && !gone.length) return '';
    return '<div class="field dailylist" data-kind="' + kind + '"><h3 class="ph">' + esc(ST('Today’s content')) + '</h3>' +
      (items.length ? '<ul class="dlist">' + items.map(function (it) {
        return '<li><span>' + esc(dailyText(kind, it)) + '</span> <button type="button" class="ghost sm" data-dblock="' + esc(it.id) + '">' + esc(ST('Do not offer again')) + '</button></li>';
      }).join('') + '</ul>' : '') +
      (gone.length ? '<p class="note"><span>' + esc(ST('Removed: {n}', { n: gone.length })) + '</span> · <a href="#" data-dshow="1">' + esc(ST('Offer again')) + '</a></p><ul class="dlist" hidden>' +
        gone.map(function (g) { return '<li><span>' + esc(g.label) + '</span> <button type="button" class="ghost sm" data-dunblock="' + esc(g.id) + '">' + esc(ST('Offer again')) + '</button></li>'; }).join('') + '</ul>' : '') + '</div>';
  }
  function wireDaily() {
    $('contentBox').addEventListener('click', function (e) {
      var t = e.target, wrap = t.closest ? t.closest('.dailylist') : null, kind = wrap && wrap.getAttribute('data-kind');
      if (!kind) return;
      if (t.hasAttribute('data-dshow')) { e.preventDefault(); var u = wrap.querySelector('ul[hidden]'); if (u) u.hidden = false; return; }
      if (t.hasAttribute('data-dblock')) Daily.block(kind, t.getAttribute('data-dblock'), Lab.patient);
      else if (t.hasAttribute('data-dunblock')) Daily.unblock(kind, t.getAttribute('data-dunblock'), Lab.patient);
      else return;
      renderContent();
    });
  }
  /* 15 Nov: what lived in "Music & photos" is drawn inside Personalise, for its activity only
     (staff.html .acthost[data-act-host]). The modules draw it on the window event
     'bellatrix-staff-act' { key, code }, sent when another activity is chosen (StaffUI.activity()
     says which one is chosen now). Returns true when the chosen activity has such a part.
     An activity without settings of its own (Memories, Bellatrix Play) shows that part first, above
     "Today's content"; the others (Group karaoke, Book reading) after their own settings. */
  var hostsFor = null;
  function actHosts(force) {
    var act = selected(), key = act.key, any = false, box = $('contentBox'), reset = $('cReset') ? $('cReset').parentNode : null;
    var first = !(act.content || []).some(function (f) { return !f.hide; }), at = first ? box : reset;
    Array.prototype.forEach.call(document.querySelectorAll('#persBox [data-act-host]'), function (h) {
      var on = (' ' + h.getAttribute('data-act-host') + ' ').indexOf(' ' + key + ' ') >= 0;
      h.hidden = !on;
      if (!on) return;
      any = true;
      /* moved only when its place changes (a field being typed in keeps its focus) */
      if (at && at.parentNode === h.parentNode && h.nextElementSibling !== at) h.parentNode.insertBefore(h, at);
      h.classList.toggle('first', first);
    });
    if (force || key !== hostsFor) {
      hostsFor = key;
      try { window.dispatchEvent(new CustomEvent('bellatrix-staff-act', { detail: { key: key, code: patientCode() } })); } catch (e) { /* old browser */ }
    }
    return any;
  }
  /* One activity's settings for one resident, opened: Activities, that resident, that activity,
     Personalise unfolded (the family photos of Memories from a family notification, the playlists
     of Bellatrix Play from "To do"). */
  function openActivity(key, code) {
    showTab('session');
    var f = $('fParticipant'), r = document.querySelector('input[name="activity"][value="' + key + '"]'), p = $('persBox');
    code = code ? String(code).trim() : '';
    if (code && f && f.value.trim() !== code) { f.value = code; f.dispatchEvent(new Event('change', { bubbles: true })); }
    if (r && !r.checked) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    var tile = r && r.closest ? r.closest('.tile') : null;
    if (tile && tile.hidden) { filter = 'all'; renderFilter(); renderTiles(); }
    if (p) p.open = true;
    actHosts(true);
    /* "Personalise for P1" at the top, that activity's part right under it */
    if (p && p.scrollIntoView) p.scrollIntoView({ block: 'start' });
  }
  function renderContent() {
    var act = selected(), box = $('contentBox'), c = Lab.content[act.key] || {};
    $('persTitle').textContent = ST('Personalise for {code}', { code: Lab.patient });
    var hosted = actHosts();
    /* 1.17: fields marked hide:true are not asked any more; their default values still apply. */
    var shown = (act.content || []).filter(function (f) { return !f.hide; });
    if (!shown.length) { box.innerHTML = (hosted ? '' : '<p class="note">' + esc(ST('Nothing to personalise here.')) + '</p>') + dailyListHtml(act); return; }
    /* Untouched texts show the defaults in the patient's language. */
    var lang = I18N.valid(patient().prefs.lang);
    box.innerHTML = shown.map(function (f) { return fieldHtml(act, f, c[f.id] !== undefined ? c[f.id] : I18N.pick(lang, f.value)); }).join('') + dailyListHtml(act);
    $('mediaWarn').hidden = Media.persistent();
  }
  function fieldHtml(act, f, v) {
    if (f.type === 'heading') {
      /* A long heading is a hint, not a title. */
      if (f.label.length <= 50) return '<h3 class="ph">' + esc(ST(f.label)) + '</h3>';
      var h = hint(f.label);
      return h ? '<p class="note ph-note">' + esc(h) + '</p>' : '';
    }
    var note = hint(f.note);
    var label = '<span>' + esc(ST(f.label)) + '</span>' + (note ? '<span class="note">' + esc(note) + '</span>' : '');
    if (f.type === 'image') {
      var m = Media.first(mq(act, f.slot, 'image'));
      return '<div class="field mslot' + (f.small ? ' small' : '') + '">' + label + '<div class="mrow"><div class="thumb">' + (m ? '<img src="' + m.url + '" alt="">' : (f.preview ? f.preview() : '')) + '</div>' +
        '<div class="mbtns"><label class="ghost filebtn">' + esc(m ? ST('Change the picture…') : ST('Choose a picture…')) + '<input type="file" accept="image/*" data-up="' + f.slot + '" data-type="image" data-one="1"></label>' +
        (m ? '<button type="button" class="ghost sm" data-delslot="' + f.slot + '">' + esc(ST('Use the default picture')) + '</button>' : '') + '</div></div></div>';
    }
    if (f.type === 'images') {
      var imgs = Media.list(mq(act, f.slot, 'image'));
      return '<div class="field mslot">' + label + '<div class="thumbs">' + imgs.map(function (x) {
        return '<figure class="thumb"><img src="' + x.url + '" alt=""><button type="button" class="ghost sm danger" data-del="' + x.id + '">' + esc(ST('Remove')) + '</button></figure>';
      }).join('') + '</div><div class="row"><label class="ghost filebtn">' + esc(ST('Add pictures…')) + '<input type="file" accept="image/*" multiple data-up="' + f.slot + '" data-type="image"></label>' +
        (imgs.length ? '<span class="note">' + esc(ST('{n} pictures', { n: imgs.length })) + (imgs.length < 3 ? ' ' + esc(ST('(at least 3 are needed)')) : '') + '</span>' : '') + '</div></div>';
    }
    if (f.type === 'audio' || f.type === 'audios') {
      var many = f.type === 'audios', songs = Media.list(mq(act, f.slot, 'audio')), cols = f.cols || ['title'];
      var kinds = {}; Media.list({ patient: Lab.patient, type: 'audio' }).forEach(function (x) { if (x.kind) kinds[x.kind] = 1; });
      return '<div class="field mslot">' + label +
        (songs.length ? '<datalist id="kinds-' + f.slot + '">' + Object.keys(kinds).map(function (k) { return '<option value="' + esc(k) + '">'; }).join('') + '</datalist>' +
          '<div class="tblwrap"><table class="tbl"><thead><tr>' + cols.map(function (k) { return '<th>' + esc(ST(COL_LABEL[k] || k)) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' +
          songs.map(function (x) {
            return '<tr>' + cols.map(function (k) {
              if (k === 'decade') return '<td><select data-meta="decade" data-id="' + x.id + '"><option value="">' + esc(ST('not known')) + '</option>' + DECADE_LIST.map(function (d) { return '<option' + (x.decade === d ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select></td>';
              if (k === 'kind') return '<td><input data-meta="kind" data-id="' + x.id + '" list="kinds-' + f.slot + '" value="' + esc(x.kind) + '" placeholder="' + esc(ST('e.g. Schlager')) + '"></td>';
              return '<td><input data-meta="title" data-id="' + x.id + '" value="' + esc(x.title) + '"><span class="note">' + esc(x.name) + '</span></td>';
            }).join('') + '<td class="nowrap"><button type="button" class="ghost sm" data-play="' + x.id + '">' + esc(ST('Play')) + '</button> <button type="button" class="ghost sm danger" data-del="' + x.id + '">' + esc(ST('Remove')) + '</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '') +
        '<div class="row"><label class="ghost filebtn">' + esc(many ? ST('Add songs…') : (songs.length ? ST('Change the song…') : ST('Choose a song…'))) +
        '<input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg"' + (many ? ' multiple' : ' data-one="1"') + ' data-up="' + f.slot + '" data-type="audio"></label>' +
        '<span class="note">' + esc(songs.length ? (songs.length === 1 ? ST('1 song') : ST('{n} songs', { n: songs.length })) : '') + '</span></div></div>';
    }
    if (f.type === 'checks') {
      var on = String(v).split(',');
      return '<div class="field">' + label + '<div class="checks">' + f.options.map(function (o) {
        return '<label class="check"><input type="checkbox" data-checks="' + f.id + '" value="' + o[0] + '"' + (on.indexOf(o[0]) >= 0 ? ' checked' : '') + '> ' + esc(ST(o[1])) + '</label>';
      }).join('') + '</div></div>';
    }
    if (f.type === 'select') {
      return '<label class="field">' + label + '<select data-c="' + f.id + '">' + f.options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(v) === o[0] ? ' selected' : '') + '>' + esc(ST(o[1])) + '</option>'; }).join('') + '</select></label>';
    }
    if (f.type === 'number') return '<label class="field">' + label + '<input type="number" data-c="' + f.id + '" min="' + f.min + '" max="' + f.max + '" value="' + esc(v) + '"></label>';
    if (f.type === 'line') return '<label class="field">' + label + '<input type="text" data-c="' + f.id + '" value="' + esc(v) + '"></label>';
    return '<label class="field">' + label + '<textarea data-c="' + f.id + '" rows="' + (f.rows || 3) + '">' + esc(v) + '</textarea></label>';
  }
  function keepContent(key, value) {
    var act = selected();
    Lab.content[act.key] = Lab.content[act.key] || {};
    Lab.content[act.key][key] = value;
    save();
  }
  function wireContent() {
    var box = $('contentBox');
    function onEdit(e) {
      var t = e.target;
      if (t.hasAttribute('data-c')) keepContent(t.getAttribute('data-c'), t.value);
      else if (t.hasAttribute('data-checks')) {
        var k = t.getAttribute('data-checks');
        keepContent(k, Array.prototype.slice.call(box.querySelectorAll('[data-checks="' + k + '"]:checked')).map(function (x) { return x.value; }).join(','));
      } else if (t.hasAttribute('data-meta') && e.type === 'change') {
        var f = {}; f[t.getAttribute('data-meta')] = t.value.trim();
        Media.update(t.getAttribute('data-id'), f);
      }
    }
    box.addEventListener('input', onEdit);
    box.addEventListener('change', function (e) {
      var t = e.target;
      if (t.hasAttribute('data-up')) {
        var act = selected(), type = t.getAttribute('data-type');
        Media.add(t.files, { patient: Lab.patient, activity: act.key, slot: t.getAttribute('data-up'), type: type, replace: t.hasAttribute('data-one') })
          .then(function (n) { if (!n) window.alert(type === 'image' ? ST('Those files are not pictures.') : ST('Those files are not audio files.')); });
        return;
      }
      onEdit(e);
    });
    box.addEventListener('click', function (e) {
      var act = selected();
      var del = e.target.closest('[data-del]'), delSlot = e.target.closest('[data-delslot]'), play = e.target.closest('[data-play]');
      if (del && window.confirm(ST('Remove it for this patient?'))) Media.remove(del.getAttribute('data-del'));
      if (delSlot) Media.removeWhere(mq(act, delSlot.getAttribute('data-delslot'), 'image'));
      if (play) {
        var m = Media.list({ id: play.getAttribute('data-play') })[0];
        if (!m) return;
        if (preview) {
          preview.pause(); var was = preview.src === m.url; preview = null;
          box.querySelectorAll('[data-play]').forEach(function (b) { b.textContent = ST('Play'); });
          if (was) return;
        }
        preview = new Audio(m.url); preview.volume = Lab.opt.volume;
        preview.play().then(function () { play.textContent = ST('Stop'); }, function () { window.alert(ST('This browser cannot play {name}. Try an MP3 file.', { name: m.name })); preview = null; });
        preview.onended = function () { play.textContent = ST('Play'); preview = null; };
      }
    });
    Media.onChange(function () { if (!Lab.isOn()) renderContent(); });
  }
  function resetActivity() {
    var act = selected();
    if (!window.confirm(ST('Put {activity} back to the default texts, pictures and songs for {code}?', { activity: actName(act), code: Lab.patient }))) return;
    delete Lab.content[act.key]; save();
    Media.removeWhere({ patient: Lab.patient, activity: act.key }).then(renderContent);
  }
  /* ---------- moving patients to the robot ----------
     One file holds every patient: settings, texts, pictures and songs. "Deploy to robot" puts the
     newest export where the robot's screen finds it (transfer/patients.json). The button is no
     longer on the page; StaffUI.exportPatients() still makes the file. */
  function blobToData(b) { return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = no; r.readAsDataURL(b); }); }
  function exportPatients() {
    var codes = Object.keys(store.patients);
    if (!codes.length) { window.alert(ST('There are no patients yet.')); return; }
    var media = Media.list({}).filter(function (m) { return codes.indexOf(m.patient) >= 0; });
    Promise.all(media.map(function (m) {
      return blobToData(m.blob).then(function (d) {
        return { patient: m.patient, activity: m.activity, slot: m.slot, type: m.type, name: m.name, title: m.title, kind: m.kind, decade: m.decade, added: m.added, data: d };
      });
    })).then(function (list) {
      var pkg = { app: 'bellatrix-care-lab', kind: 'patients', version: Lab.version, exported: new Date().toISOString(), patients: store.patients, media: list };
      download('bellatrix-patients-' + stamp() + '.json', JSON.stringify(pkg), 'application/json');
    });
  }
  function importPatients(pkg) {
    if (!pkg || pkg.kind !== 'patients' || !pkg.patients) return Promise.resolve(false);
    var codes = Object.keys(pkg.patients);
    if (!window.confirm(ST('Load {n} patients ({codes})? Their settings, pictures and songs on this device are replaced.', { n: codes.length, codes: codes.join(', ') }))) return Promise.resolve(false);
    codes.forEach(function (c) { store.patients[c] = pkg.patients[c]; });
    save();
    return Promise.all(codes.map(function (c) { return Media.removeWhere({ patient: c }); })).then(function () {
      return Promise.all((pkg.media || []).map(function (m) {
        return fetch(m.data).then(function (r) { return r.blob(); }).then(function (blob) {
          var item = {}; Object.keys(m).forEach(function (k) { if (k !== 'data') item[k] = m[k]; });
          item.blob = blob;
          return item;
        });
      }));
    }).then(function (items) { return Media.addItems(items); }).then(function () {
      if (!store.patients[patientCode()]) $('fParticipant').value = codes[0];
      renderPatient(); readSetup();
      Lab.toast(ST('{n} patients loaded.', { n: codes.length }));
      return true;
    });
  }
  /* On the robot (opened with ?robot=1): offer the file the laptop prepared, once per export. */
  function offerTransfer() {
    if (!Lab.robotMode || location.protocol === 'file:') return;
    fetch('transfer/patients.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (pkg) {
      if (!pkg || pkg.kind !== 'patients' || pkg.exported === store.settings.lastImport) return;
      $('xferText').textContent = ST('{n} patients from the laptop are ready to load.', { n: Object.keys(pkg.patients).length });
      $('xferBanner').hidden = false;
      $('xferLoad').onclick = function () {
        importPatients(pkg).then(function (ok) { if (ok) { store.settings.lastImport = pkg.exported; save(); $('xferBanner').hidden = true; } });
      };
      $('xferLater').onclick = function () { $('xferBanner').hidden = true; };
    }).catch(function () { /* nothing prepared */ });
  }

  function readSetup() {
    var act = selected(), o = Lab.opt, st = store.settings, code = patientCode(), pr = patient(code).prefs;
    usePatient(code);
    /* The report fields (staff, zone, map, software) are no longer on the page: the saved values,
       or the activity's own zone, still go into the reports. */
    o.staff = st.staff || ''; o.participant = code;
    o.zone = (st.zoneFor && st.zoneFor[act.key]) || act.zone; o.mapRev = st.mapRev || ''; o.sw = st.sw || '';
    o.voice = false; o.camMode = camMode(); o.camMove = act.key === 'move' && $('optCamMove').checked;
    /* 23 Nov (Rahma's prototype): point with the red heart instead of the hand (js/core.js, the app's HeartSpot) */
    o.airInput = camChoice() === 'heart' || camChoice() === 'object' ? camChoice() : '';
    pr.greet = val('fGreet').trim();
    if ($('fSector')) pr.sector = val('fSector').trim().slice(0, 24);   /* 1.17 */
    pr.rate = parseFloat(val('optRate')) || 0.92; pr.volume = (parseInt(val('optVolume'), 10) || 90) / 100;
    pr.textSize = val('optText') || 'normal'; pr.subtitles = $('optSubs').checked;
    pr.lang = I18N.valid(val('optLang')); pr.mood = $('optMood').checked;
    o.profile = pr.profile || ''; o.greet = pr.greet; o.rate = pr.rate; o.volume = pr.volume; o.textSize = pr.textSize; o.subtitles = pr.subtitles;
    o.lang = pr.lang; o.mood = pr.mood;
    o.life = JSON.parse(JSON.stringify(readLife(pr)));
    st.airInput = o.airInput;
    st.participant = code; st.voice = false; st.camMode = o.camMode; st.camMove = $('optCamMove').checked; st.activity = act.key;
    save();
    if ($('startSummary')) { renderSummary(); renderCamNote(); }
    return act;
  }

  /* ---------- metrics ----------
     tr translates: ST on the page, nothing (English) in the downloaded reports. */
  function moveTable(rec) {
    var att = rec.events.filter(function (e) { return e.kind === 'attempt'; });
    var det = rec.events.filter(function (e) { return e.kind === 'detect'; });
    if (!att.length && !det.length) return null;
    var used = {}, rows = {};
    function row(k) { return rows[k] = rows[k] || { attempted: 0, detected: 0, missed: 0, falseDetections: 0 }; }
    att.forEach(function (a) {
      var r = row(a.move || 'unknown');
      r.attempted++;
      var hit = -1;
      det.forEach(function (d, i) { if (hit < 0 && !used[i] && (!a.move || d.move === a.move) && d.ms >= a.ms - 2000 && d.ms <= a.ms + 3000) hit = i; });
      if (hit >= 0) { used[hit] = true; r.detected++; } else r.missed++;
    });
    det.forEach(function (d, i) { if (!used[i]) row(d.move || 'unknown').falseDetections++; });
    return rows;
  }
  function metrics(rec, tr) {
    tr = tr || function (s, v) { return I18N.t('en', s, v); };
    var c = rec.counts, t = rec.taps, all = t.hit + t.miss;
    var m = [
      [tr('Duration'), dur(rec.durationS)],
      [tr('Outcome'), outcomeName(rec.outcome, tr)],
      [tr('Would do it again'), rec.again ? tr(String(rec.again)) : tr('not asked or skipped')],
      [tr('Inputs'), tr('touch {a}, hand signs {b}, pointing in the air {c}, keyboard {d}, staff taps {e}', { a: c.touch, b: c.hand, c: c.air || 0, d: c.key, e: c.staff }) + (c.voice ? ', voice ' + c.voice : '')],
      [tr('Taps on target'), all ? tr('{p}% ({hit} of {all} taps)', { p: Math.round(100 * t.hit / all), hit: t.hit, all: all }) : tr('no taps')],
      [tr('Help / Stop / Back / Skip'), c.help + ' / ' + c.stop + ' / ' + c.back + ' / ' + c.skip],
      [tr('Gentle reminders after silence'), c.reprompt],
      [tr('Consent'), Object.keys(rec.consent).map(function (k) { return k + ': ' + rec.consent[k]; }).join(', ') || tr('none asked')],
      [tr('Camera'), rec.camMs ? tr('on for {s} s, not recorded', { s: Math.round(rec.camMs / 1000) }) : tr('never on')],
      [tr('App errors'), rec.events.filter(function (e) { return e.kind === 'error'; }).length]
    ];
    if (c.unclear) m.splice(5, 0, [tr('Not understood (voice)'), c.unclear]);
    Object.keys(rec.stats).forEach(function (k) {
      var v = rec.stats[k];
      if (Array.isArray(v)) v = v.map(function (x) { return typeof x === 'object' && x ? Object.keys(x).map(function (q) { return q + ' ' + x[q]; }).join(', ') : x; }).join('; ');
      m.push([STAT_LABELS[k] ? tr(STAT_LABELS[k]) : k.replace(/_/g, ' '), v]);
    });
    var mv = moveTable(rec);
    if (mv) Object.keys(mv).forEach(function (k) {
      var r = mv[k];
      m.push([tr('Movement {k} (camera)', { k: k }), tr('attempted {a}, seen by the camera {b}, missed {c}, false detections {d}', { a: r.attempted, b: r.detected, c: r.missed, d: r.falseDetections })]);
    });
    return m;
  }

  /* ---------- hand-over to the patient app ----------
     The care team prepares a session here; the patient app (patient.html, or the "Bellatrix" icon
     on the robot) picks it up from this device's storage and shows a Begin button. Finished
     sessions come back through an inbox and land in Results. */
  var RUN = 'bellatrix-care-lab-run', INBOX = 'bellatrix-care-lab-inbox';
  function handOver(isPreview) {
    var act = readSetup();
    if (locked(act.key)) { showTab('library'); return; }
    var run = { id: 'R' + Date.now().toString(36), key: act.key, preview: !!isPreview, patient: Lab.patient, opt: JSON.parse(JSON.stringify(Lab.opt)), at: Date.now() };
    /* Link set (js/link-staff.js): the activity goes to the patient tablet through the server; nothing opens on this head. */
    if (window.LinkStaff && LinkStaff.configured()) { LinkStaff.send(run); return; }
    try { localStorage.setItem(RUN, JSON.stringify(run)); }
    catch (e) { window.alert(ST('This device could not prepare the session.')); return; }
    if (window.BellatrixApp && window.BellatrixApp.openPatient) window.BellatrixApp.openPatient();
    else location.href = 'patient.html' + location.search;
  }
  /* ---------- "To do": everything that waits, under one tag (1.15; 1.16) ----------
     Several things may wait at once (Daily Choice, Premium request, family offer, cleaning reminder,
     checklist, staff only, and since 1.16 the family messages and the playlists to approve).
     1.16 (the tester did not see the line): as soon as ONE thing waits, the tag "To do · n" shows:
     - one item: the tag, then that item's banner with its buttons, side by side;
     - several: one line (tag, the most urgent item's title "· and 2 more", Show) that opens into the
       banners; Hide folds them again. Open or closed is kept for this session.
     Modules put their banners next to #choiceBanner, so they are all in #trayList; this only watches
     it. Nothing waits: no tray at all. */
  var TRAY_KEY = 'labTrayOpen';
  function trayOpen() { try { return sessionStorage.getItem(TRAY_KEY) === '1'; } catch (e) { return false; } }
  function shownIn(el, list) {
    for (var x = el; x && x !== list; x = x.parentNode) if (x.hidden) return false;
    return true;
  }
  function trayItems() {
    var list = $('trayList');
    if (!list) return [];
    return Array.prototype.filter.call(list.querySelectorAll('.banner'), function (b) { return shownIn(b, list); });
  }
  /* A banner's title for the folded line: the bold words of the tools' banners (staff only, clean
     the screen), else its first text without the time in brackets. */
  function titleOf(b) {
    var span = b.querySelector('span'), c, t;
    if (!span) return '';
    if (/(^| )st-banner( |$)/.test(b.className)) { t = span.querySelector('b'); if (t) return t.textContent.trim(); }
    c = span.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll('small, .pcrown'), function (x) { x.parentNode.removeChild(x); });
    return c.textContent.replace(/\s+/g, ' ').trim();
  }
  /* The most urgent first: staff only, then the cleaning reminder, then a resident's Premium request;
     the others keep the page order. */
  var URGENT_ORDER = ['st-red', 'st-hyg', 'premiumBanner'];
  function urgentRank(b) {
    for (var i = 0; i < URGENT_ORDER.length; i++) if (b.id === URGENT_ORDER[i] || (' ' + b.className + ' ').indexOf(' ' + URGENT_ORDER[i] + ' ') >= 0) return i;
    return 99;
  }
  /* TRAY100:begin (1.17: the tray for 100 residents: urgency order, groups, "I take it", filters)
     Pure helpers first (tested in tests/staff-tools.test.mjs), the page code after them.
     A row is one item of a banner: its text (span) with its buttons. Types: 0 call request,
     1 access request, 2 Premium request or gift, 3 the rest. Claims live in localStorage. */
  var TRAY_CLAIMS = 'bellatrix-tray-claims', TRAY_GRP = 'labTrayGrp', TRAY_FILT = 'labTrayFilt', TRAY_MAXGRP = 3;
  var TRAY_TYPE_NAMES = ['Call requests', 'Access requests', 'Premium and gifts', 'Other'];
  function trInitials(name) {
    var w = String(name || '').replace(/[^A-Za-zÀ-ÿ \-]/g, ' ').split(/[\s\-]+/).filter(Boolean);
    if (!w.length) return '';
    return (w.length === 1 ? w[0].slice(0, 2) : w[0].charAt(0) + w[w.length - 1].charAt(0)).toUpperCase();
  }
  function trRowKey(r) { return r.type + '|' + (r.code || '') + '|' + (r.hm || '') + '|' + String(r.text || '').replace(/\s+/g, ' ').slice(0, 60); }
  /* Urgency first, then the oldest (no time: last), then the page order. */
  function trSort(rows) {
    return rows.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) {
      var x = a.r, y = b.r;
      if (x.type !== y.type) return x.type - y.type;
      var ax = x.at || 9e15, ay = y.at || 9e15;
      return ax !== ay ? ax - ay : a.i - b.i;
    }).map(function (o) { return o.r; });
  }
  function trMatch(r, f, sectorOf) {
    var codes = r.codes && r.codes.length ? r.codes : (r.code ? [r.code] : []);
    if (!codes.length) return true;   /* a row that names nobody cannot be filtered out */
    return codes.some(function (c) { return (!f.code || c === f.code) && (!f.sector || sectorOf(c) === f.sector); });
  }
  function trCounts(rows) {
    var n = [0, 0, 0, 0];
    rows.forEach(function (r) { n[r.type]++; });
    return n;
  }
  function trFolded(counts, type, open) { return counts[type] > TRAY_MAXGRP && !(open && open[type]); }
  function trPrune(claims, now) {
    var out = {};
    Object.keys(claims || {}).forEach(function (k) { if (claims[k] && now - claims[k].at < 24 * 3600000) out[k] = claims[k]; });
    return out;
  }
  /* TRAY100:end-pure */
  function trJ(box, k, d) { try { var v = JSON.parse(box.getItem(k) || 'null'); return v === null ? d : v; } catch (e) { return d; } }
  function trClaims() { return trPrune(trJ(localStorage, TRAY_CLAIMS, {}), Date.now()); }
  function trWho() { var n = trInitials((store.settings && store.settings.staff) || ''); return n || ST('Team'); }
  function sectorOfCode(c) { var p = store.patients && store.patients[c]; return (p && p.prefs && p.prefs.sector) || ''; }
  function trFilter() { var f = trJ(sessionStorage, TRAY_FILT, null) || {}; return { code: f.code || '', sector: f.sector || '' }; }
  function trTime(small) {
    var m = /(\d{1,2}):(\d{2})/.exec(small || '');
    if (!m) return { at: 0, hm: '' };
    var d = new Date(); d.setHours(+m[1], +m[2], 0, 0);
    if (d.getTime() > Date.now() + 3600000) d.setDate(d.getDate() - 1);
    return { at: d.getTime(), hm: m[0] };
  }
  function trKnownCode(text) {
    var codes = Object.keys(store.patients || {}), i;
    for (i = 0; i < codes.length; i++) if (new RegExp('(^|[^A-Za-z0-9])' + codes[i].replace(/[^A-Za-z0-9]/g, '\\$&') + '($|[^A-Za-z0-9])').test(text)) return codes[i];
    return '';
  }
  /* The rows of the shown banners; each row remembers its elements. */
  function trRows(banners) {
    var rows = [];
    banners.forEach(function (b) {
      var cur = null;
      Array.prototype.slice.call(b.children).forEach(function (el) {
        if (/(^| )tr-add( |$)/.test(el.className)) { if (cur) cur.add = el; return; }
        if (el.tagName === 'SPAN' || !cur) { cur = { b: b, els: [], hasSpan: el.tagName === 'SPAN' }; rows.push(cur); }
        cur.els.push(el);
      });
    });
    rows.forEach(function (r) {
      var span = r.hasSpan ? r.els[0] : null, bold = span && span.querySelector('b'), btn = null, m;
      r.els.forEach(function (e) { if (!btn) btn = (e.matches && e.matches('[data-m],[data-premium]')) ? e : (e.querySelector ? e.querySelector('[data-m],[data-premium]') : null); });
      m = btn ? (btn.getAttribute('data-m') || '') : '';
      r.text = (span || r.b).textContent.replace(/\s+/g, ' ').trim();
      var small = span && span.querySelector('small'), t = trTime(small ? small.textContent : '');
      r.at = t.at; r.hm = t.hm;
      r.type = r.b.id === 'callReqBanner' ? 0 : /^access/.test(m) ? 1 : (/^offer/.test(m) || (btn && btn.hasAttribute('data-premium')) || r.b.id === 'premiumBanner' || r.b.id === 'premiumNewsBanner') ? 2 : 3;
      r.code = (btn && btn.getAttribute('data-code')) || (bold && trKnownCode(bold.textContent) ? bold.textContent.trim() : '') || trKnownCode(r.text);
      r.codes = r.code ? [r.code] : [];
      if (r.type === 0) {   /* one banner for all the requests: ask the module who and since when */
        try {
          var w = window.CallReqStaff && CallReqStaff._waiting ? CallReqStaff._waiting() : [];
          r.codes = w.map(function (q) { return q.code; }).filter(Boolean);
          var old = w.map(function (q) { return Date.parse(q.at); }).filter(isFinite).sort()[0];
          if (old) { var od = new Date(old); r.at = old; r.hm = ('0' + od.getHours()).slice(-2) + ':' + ('0' + od.getMinutes()).slice(-2); }
          if (r.codes.length === 1) r.code = r.codes[0];
        } catch (e) { /* the text still shows */ }
      }
      r.key = trRowKey(r);
    });
    return rows;
  }
  function setCls(el, c, on) { if (el && el.classList.contains(c) !== on) el.classList.toggle(c, on); }
  function setOrder(el, v) { if (el && el.style.order !== String(v)) el.style.order = String(v); }
  /* Filters above the tray: a resident, and (if the cards have a "Secteur") a floor or sector. */
  function trFilters(rows, f) {
    var tray = $('bannerTray'), box = $('trayFilters');
    if (!tray) return;
    var codes = [], secs = [];
    rows.forEach(function (r) { r.codes.forEach(function (c) { if (codes.indexOf(c) < 0) codes.push(c); }); });
    codes.sort();
    Object.keys(store.patients || {}).forEach(function (c) { var s = sectorOfCode(c); if (s && secs.indexOf(s) < 0) secs.push(s); });
    secs.sort();
    var show = codes.length > 1 || !!f.code || !!f.sector;
    if (!box) {
      box = document.createElement('div'); box.id = 'trayFilters'; box.className = 'trayfilters';
      tray.insertBefore(box, tray.firstChild);
      box.addEventListener('change', function (e) {
        var t = e.target, cur = trFilter();
        if (t.id === 'trayFCode') cur.code = t.value; else if (t.id === 'trayFSec') cur.sector = t.value;
        try { sessionStorage.setItem(TRAY_FILT, JSON.stringify(cur)); } catch (err) { /* this view only */ }
        foldTray();
      });
    }
    box.hidden = !show;
    if (!show) return;
    function sel(id, label, vals, cur) {
      return '<label class="trf"><span>' + esc(label) + '</span><select id="' + id + '"><option value="">' + esc(ST('All')) + '</option>' +
        vals.map(function (v) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') + '</select></label>';
    }
    var h = sel('trayFCode', ST('Resident'), codes, f.code) + (secs.length ? sel('trayFSec', ST('Floor / sector'), secs, f.sector) : '');
    if (box.getAttribute('data-h') !== h) { box.innerHTML = h; box.setAttribute('data-h', h); }
  }
  /* Order, group, claim, filter. Returns what foldTray needs. */
  function trDecorate(banners) {
    var f = trFilter(), claims = trClaims(), open = trJ(sessionStorage, TRAY_GRP, {}), all = trRows(banners), list = $('trayList');
    trFilters(all, f);
    var rows = all.filter(function (r) { return trMatch(r, f, sectorOfCode); }), counts = trCounts(rows), sorted = trSort(rows), who = trWho();
    all.forEach(function (r) { r.shown = rows.indexOf(r) >= 0; });
    sorted.forEach(function (r, i) { r.rank = i; });
    all.forEach(function (r) {
      var hide = !r.shown || trFolded(counts, r.type, open), c = claims[r.key], pos = r.shown ? r.rank * 10 + 8 : 9999;
      r.els.forEach(function (el, k) { setCls(el, 'tr-hid', hide); setOrder(el, pos); if (k === 0 && r.hasSpan) setCls(el, 'tr-line', true); });
      if (!r.add || !r.add.parentNode) {
        r.add = document.createElement('button'); r.add.type = 'button'; r.add.className = 'ghost tr-add tr-take';
        var last = r.els[r.els.length - 1]; last.parentNode.insertBefore(r.add, last.nextSibling);
      }
      var txt = c ? ST('Taken by {who}', { who: c.by }) : ST('I take it');
      if (r.add.textContent !== txt) r.add.textContent = txt;
      if (r.add.getAttribute('data-take') !== r.key) r.add.setAttribute('data-take', r.key);
      r.add.setAttribute('aria-pressed', c ? 'true' : 'false');
      setCls(r.add, 'on', !!c); setCls(r.add, 'tr-hid', hide); setOrder(r.add, pos);
    });
    /* banners without a visible row disappear; the others keep the place of their first row */
    banners.forEach(function (b) {
      var mine = all.filter(function (r) { return r.b === b && r.shown; });
      setCls(b, 'tr-hid', !mine.length);
      setOrder(b, mine.length ? Math.min.apply(null, mine.map(function (r) { return r.rank; })) * 10 + 10 : 9999);
    });
    /* group headers: one per type with more than 3 rows, folded by default */
    var firstOf = {};
    sorted.forEach(function (r) { if (!(r.type in firstOf)) firstOf[r.type] = r; });
    TRAY_TYPE_NAMES.forEach(function (name, t) {
      var h = list.querySelector('.tr-grp[data-type="' + t + '"]');
      if (counts[t] <= TRAY_MAXGRP) { if (h) h.parentNode.removeChild(h); return; }
      if (!h) {
        h = document.createElement('button'); h.type = 'button'; h.className = 'tr-grp'; h.setAttribute('data-type', String(t));
        list.appendChild(h);
      }
      var isOpen = !trFolded(counts, t, open), ht = ST(name) + ' · ' + counts[t] + ' ' + (isOpen ? '−' : '+');
      if (h.textContent !== ht) h.textContent = ht;
      h.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      setOrder(h, firstOf[t].rank * 10 + 5);
    });
    return { n: rows.length, total: all.length, first: sorted[0] ? sorted[0].b : null };
  }
  function wireTrayRows() {
    var list = $('trayList');
    if (!list) return;
    list.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('.tr-take, .tr-grp') : null;
      if (!t) return;
      if (t.className.indexOf('tr-grp') >= 0) {
        var open = trJ(sessionStorage, TRAY_GRP, {}), ty = t.getAttribute('data-type');
        open[ty] = !open[ty];
        try { sessionStorage.setItem(TRAY_GRP, JSON.stringify(open)); } catch (err) { /* this view only */ }
      } else {
        var cl = trClaims(), k = t.getAttribute('data-take');
        if (cl[k]) delete cl[k]; else cl[k] = { by: trWho(), at: Date.now() };
        try { localStorage.setItem(TRAY_CLAIMS, JSON.stringify(cl)); } catch (err) { /* this device only */ }
      }
      foldTray();
    });
    window.addEventListener('storage', function (e) { if (e.key === TRAY_CLAIMS) foldTray(); });
  }
  /* The card field "Secteur" (floor or sector), made here so the page markup stays as it is. */
  function ensureSector() {
    if ($('fSector')) return $('fSector');
    var g = $('fGreet'), lab = g && g.parentNode;
    if (!lab || !lab.parentNode) return null;
    var n = document.createElement('label');
    n.className = 'field';
    n.innerHTML = '<span data-st="Floor / sector">' + esc(ST('Floor / sector')) + '</span><input id="fSector" type="text" maxlength="24" autocomplete="off">';
    lab.parentNode.insertBefore(n, lab.nextSibling);
    return $('fSector');
  }
  /* TRAY100:end */
  var trayBusy = false, trayN = 0;
  function foldTray() {
    var tray = $('bannerTray'), line = $('trayLine'), list = $('trayList');
    if (!tray || !line || !list || trayBusy) return;
    trayBusy = true;
    try {
      var items = trayItems(), d = items.length ? trDecorate(items) : { n: 0, total: 0, first: null }, n = d.n, open = trayOpen(), folded = n > 1;   /* 1.17: rows, not banners */
      trayN = n;
      tray.hidden = !d.total;
      line.hidden = !d.total;
      list.hidden = folded && !open;
      tray.classList.toggle('single', n === 1);
      tray.classList.toggle('open', folded && open);
      if (!d.total) return;
      var first = d.first || items[0];
      var html = '<span class="ttag">' + esc(ST('To do · {n}', { n: n })) + '</span>';
      if (folded) {
        var title = titleOf(first);
        html += '<span class="tlabel">' + esc(!title ? '' : n === 2 ? ST('{label} · and 1 more', { label: title }) : ST('{label} · and {n} more', { label: title, n: n - 1 })) + '</span>' +
          '<span class="tmore">' + esc(open ? ST('Hide') : ST('Show')) + '</span><span class="tchev" aria-hidden="true"></span>';
      }
      if (line.innerHTML !== html) line.innerHTML = html;
      line.classList.toggle('urgent', folded && (urgentRank(first) === 0 || first.id === 'callReqBanner'));
      line.tabIndex = folded ? 0 : -1;
      if (folded) { line.setAttribute('aria-expanded', open ? 'true' : 'false'); line.removeAttribute('aria-disabled'); }
      else { line.removeAttribute('aria-expanded'); line.setAttribute('aria-disabled', 'true'); }
    } finally { trayBusy = false; }
  }
  function wireTray() {
    var line = $('trayLine'), list = $('trayList');
    if (!line || !list) return;
    wireTrayRows();
    line.addEventListener('click', function () {
      if (trayN < 2) return; /* one item: the tag only names it */
      try { sessionStorage.setItem(TRAY_KEY, trayOpen() ? '0' : '1'); } catch (e) { /* this view only */ }
      foldTray();
    });
    if (window.MutationObserver) {
      var t = null;
      new MutationObserver(function () { clearTimeout(t); t = setTimeout(foldTray, 0); })
        .observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
    } else setInterval(foldTray, 2000);
    foldTray();
  }

  /* ---------- two more things in "To do" (1.16): new family messages, playlists to approve ----------
     Family messages (portal spec BF-11/12, 10 Nov): no approval any more; each message that arrives
     for a resident is a NOTIFICATION here, with the resident's code and the kind of message. "Open"
     goes to Family > Messages, "Seen" marks them seen. From js/messages-staff.js (agent M):
       MessagesStaff.notifications() / MessagesStaff.seen(ids) when that module has them; otherwise
       its last server state: state.notifications (1.16 server: { id, code, label, kind, from, seen }),
       marked seen with the server's robot/notification/seen; with a 1.15 server, state.queue.
     This page also keeps the ids it marked seen (FAM_SEEN), so "Seen" works with either module. It
     redraws when that module redraws its count on the Family tab (watched here), on the event
     'bellatrix-family-notify', and on focus. Playlists: drafts from js/reco.js, "Open" goes to them. */
  var FAM_SEEN = 'bellatrix-staff-family-seen';
  function famSeenIds() { try { return JSON.parse(localStorage.getItem(FAM_SEEN) || '[]') || []; } catch (e) { return []; } }
  function famNotes() {
    var M = window.MessagesStaff, list = null, t = Date.now(), seen = famSeenIds();
    try { if (M && typeof M.notifications === 'function') list = M.notifications() || []; } catch (e) { list = null; }
    if (!list) {
      var s = null;
      try { s = M && M._state ? M._state() : null; } catch (e) { s = null; }
      if (s && s.notifications && s.notifications.filter) list = s.notifications.filter(function (n) { return n && !n.seen; });
      else list = s && s.queue && s.queue.filter ? s.queue.filter(function (m) { return m && (m.status !== 'postponed' || !m.until || Date.parse(m.until) <= t); }) : [];
    }
    return list.filter(function (m) { return m && seen.indexOf(String(m.id)) < 0; });
  }
  var KIND_TEXT = { text: 'a text', photo: 'a photo', voice: 'a voice message', audio: 'a voice message', video: 'a short video', album: 'a photo for the album' };
  function famKind(m) { return ST(KIND_TEXT[m.kind] || (m.photo ? 'a photo' : m.text ? 'a text' : 'a message')); }
  function famSeen(list) {
    var ids = list.map(function (m) { return String(m.id); }), all = famSeenIds().concat(ids).slice(-300);
    try { localStorage.setItem(FAM_SEEN, JSON.stringify(all)); } catch (e) { /* shown again after a reload */ }
    var M = window.MessagesStaff, s = null;
    try { s = M && M._state ? M._state() : null; } catch (e) { s = null; }
    try {
      if (M && typeof M.seen === 'function') M.seen(ids);
      else if (ids.length && s && s.notifications && window.FamilyMessages && FamilyMessages.request) {
        FamilyMessages.request('POST', 'robot/notification/seen', { ids: ids }).then(function () { return M.refresh ? M.refresh() : null; }, function () { /* kept seen here */ });
      }
    } catch (e) { /* that module's problem */ }
    renderWaits();
  }
  function plDrafts() {
    try {
      var R = window.Reco && Reco.shared ? Reco.shared() : null;
      return R ? R.playlists({ status: 'draft' }).filter(function (p) { return R.isOn(p.residentId); }) : [];
    } catch (e) { return []; }
  }
  function waitHtml(text, what) {
    return text ? '<span>' + esc(text) + '</span><button type="button" class="go" data-wait="' + what + '">' + esc(ST('Open')) + '</button>' : '';
  }
  function famHtml(list) {
    if (!list.length) return '';
    /* BF-12: who it is for (the first name the family uses, and the code) and the kind of message */
    var lines = list.slice(0, 3).map(function (m) { return esc((m.label ? m.label + ' (' + (m.code || '?') + ')' : (m.code || '?')) + ' · ' + famKind(m)); }).join(', ') + (list.length > 3 ? ', …' : '');
    return '<span><b>' + esc(list.length === 1 ? ST('1 new family message') : ST('{n} new family messages', { n: list.length })) + '</b> <small>' + lines + '</small></span>' +
      '<button type="button" class="go" data-wait="family">' + esc(ST('Open')) + '</button><button type="button" class="ghost" data-wait="family-seen">' + esc(ST('Seen')) + '</button>';
  }
  function renderWaits() {
    var f = $('famWaitBanner'), p = $('plWaitBanner'), notes = famNotes(), n = notes.length, d = plDrafts().length, h;
    if (f) {
      h = famHtml(notes);
      if (f.getAttribute('data-h') !== h) { f.innerHTML = h; f.setAttribute('data-h', h); }
      f.hidden = !n;
    }
    if (p) {
      h = waitHtml(d ? (d === 1 ? ST('1 playlist to approve') : ST('{n} playlists to approve', { n: d })) : '', 'playlists');
      if (p.getAttribute('data-h') !== h) { p.innerHTML = h; p.setAttribute('data-h', h); }
      p.hidden = !d;
    }
  }
  function openWait(what) {
    if (what === 'family-seen') { famSeen(famNotes()); return; }
    if (what === 'family') { famSeen(famNotes()); showTab('family', 'queue'); return; }
    /* the playlists are in the settings of Bellatrix Play, for the resident whose playlist waits */
    var first = plDrafts()[0];
    if (first && window.RecoStaff && RecoStaff.show) RecoStaff.show(first.residentId); else openActivity('play', first ? first.residentId : '');
  }
  function wireWaits() {
    var list = $('trayList'), fam = document.querySelector('.ctop .tabs [data-tab="family"]');
    if (list) list.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-wait]') : null;
      if (b) openWait(b.getAttribute('data-wait'));
    });
    if (fam && window.MutationObserver) {
      var t = null;
      new MutationObserver(function () { clearTimeout(t); t = setTimeout(renderWaits, 0); }).observe(fam, { childList: true, subtree: true, characterData: true });
    }
    window.addEventListener('bellatrix-reco', renderWaits);
    window.addEventListener('bellatrix-family-notify', renderWaits);
    window.addEventListener('storage', function (e) { if (!e.key || e.key.indexOf('bellatrix-reco') === 0) renderWaits(); });
    window.addEventListener('focus', renderWaits);
    renderWaits();
    /* the modules mount after this page's own start, and the first server answer comes later */
    setTimeout(renderWaits, 0); setTimeout(renderWaits, 3000);
  }

  /* ---------- Results: how many sessions came back since the tab was last opened (1.16) ---------- */
  var NEW_RES = 'labNewResults', resultsFor = '';
  function newResults() { try { return parseInt(sessionStorage.getItem(NEW_RES), 10) || 0; } catch (e) { return 0; } }
  function markResults(n) {
    try { sessionStorage.setItem(NEW_RES, String(n || 0)); } catch (e) { /* this view only */ }
    var tab = document.querySelector('.ctop .tabs [data-tab="results"]'), b = tab ? tab.querySelector('.newbadge') : null;
    if (!tab) return;
    if (!n) { if (b) b.parentNode.removeChild(b); return; }
    if (!b) { b = document.createElement('span'); b.className = 'tabbadge newbadge'; tab.appendChild(b); }
    b.textContent = String(n);
    b.setAttribute('aria-label', ST('New sessions: {n}', { n: n }));
  }
  function seenResults() { markResults(0); }

  /* Daily Choice sends the patient's choices here. They stay at the top of the page for a day,
     until someone marks them as passed on. */
  function renderChoiceBanner() {
    var el = $('choiceBanner');
    if (!el) return;
    var since = Date.now() - 24 * 3600 * 1000;
    var list = store.sessions.filter(function (s) { return s.activity === 'choice' && s.stats && s.stats.choicesSent && !s.passedOn && new Date(s.startedAt).getTime() > since; });
    el.hidden = !list.length;
    el.innerHTML = list.map(function (s) {
      var what = [s.stats.lunch ? ST('{x} for lunch', { x: esc(s.stats.lunch) }) : '', s.stats.afternoon ? ST('{x} this afternoon', { x: esc(s.stats.afternoon) }) : ''].filter(Boolean).join(', ');
      return '<span>' + ST('<b>{code}</b> chose {what}', { code: esc(s.participant), what: what }) + ' <small>(' + esc(hhmm(s.startedAt)) + ')</small></span>' +
        '<button type="button" class="go" data-passed="' + esc(s.id) + '">' + esc(ST('Passed on ✓')) + '</button>';
    }).join('');
  }
  /* ---------- Premium banners (1.16, agent P: js/premium.js v3, the window in js/library.js) ----------
     Premium is per resident AND per product (Bellatrix Play Premium, Books Premium).
     - #premiumBanner: a resident asked (Play or the reading app). One row per ask: "P2 would like Books
       Premium" · See the request (the window for that resident and product) · Later. Urgent in the tray;
       a red count on the Activities tab.
     - #premiumNewsBanner: what the family did with a payment request (paid and now active, refused,
       expired), until the team taps OK. */
  function premiumBanner() {
    var el = $('premiumBanner'), news = $('premiumNewsBanner');
    if (!el) {
      var after = $('choiceBanner');
      if (!after) return null;
      el = document.createElement('div');
      el.id = 'premiumBanner'; el.className = 'banner xfer premiumbanner'; el.hidden = true;
      after.parentNode.insertBefore(el, after.nextSibling);
      el.addEventListener('click', onPremiumBanner);
    }
    if (!news) {
      news = document.createElement('div');
      news.id = 'premiumNewsBanner'; news.className = 'banner xfer premiumbanner premiumnews'; news.hidden = true;
      el.parentNode.insertBefore(news, el.nextSibling);
      news.addEventListener('click', onPremiumBanner);
    }
    return el;
  }
  function onPremiumBanner(e) {
    var b = e.target.closest ? e.target.closest('[data-premium]') : null;
    if (!b || !window.Premium) return;
    var what = b.getAttribute('data-premium'), code = b.getAttribute('data-code'), pr = b.getAttribute('data-product') || 'play';
    if (what === 'see' && window.PlayPremium && !Premium.isOn(code, pr)) PlayPremium.open({ patient: code, product: pr });
    else if (what === 'see' || what === 'later') Premium.unask(code, pr);
    else if (what === 'seen') Premium.seen(b.getAttribute('data-id'));
  }
  function renderTabBadge(n) {
    var tab = document.querySelector('.tabs [data-tab="session"]');
    if (!tab) return;
    var badge = tab.querySelector('.tabbadge');
    if (!n) { if (badge) badge.parentNode.removeChild(badge); return; }
    if (!badge) { badge = document.createElement('span'); badge.className = 'tabbadge'; tab.appendChild(badge); }
    badge.textContent = String(n);
    badge.setAttribute('aria-label', ST('Requests waiting: {n}', { n: n }));
  }
  function premiumName(p) { return window.PlayPremium && PlayPremium.name ? PlayPremium.name(p) : ST(p === 'books' ? 'Books Premium' : 'Bellatrix Play Premium'); }
  /* The asks still open: a resident who has that product already needs nothing. */
  function renderPremiumAsks(el) {
    var asks = Premium.asks().filter(function (a) {
      if (!Premium.isOn(a.code, a.product)) return true;
      Premium.unask(a.code, a.product, true); return false;   /* quiet: no event while drawing */
    });
    renderTabBadge(asks.length);
    el.hidden = !asks.length;
    el.innerHTML = asks.slice(0, 4).map(function (a) {
      var attrs = ' data-code="' + esc(a.code) + '" data-product="' + esc(a.product) + '"';
      return '<span><span class="pcrown" aria-hidden="true">♛</span> ' + ST('{who} would like {product}', { who: '<b>' + esc(a.code) + '</b>', product: esc(premiumName(a.product)) }) +
        (a.at ? ' <small>(' + esc(hhmm(a.at)) + ')</small>' : '') + '</span>' +
        '<button type="button" class="go" data-premium="see"' + attrs + '>' + esc(ST('See the request')) + '</button>' +
        '<button type="button" class="ghost" data-premium="later"' + attrs + '>' + esc(ST('Later')) + '</button>';
    }).join('');
  }
  /* What the family did, not seen by the team yet (the last 7 days). */
  var PREMIUM_NEWS = { active: '{code} · {product}: paid by the family, now active', refused: '{code} · {product}: refused by the family', expired: '{code} · {product}: expired' };
  function renderPremiumNews(el) {
    if (!el) return;
    var t = Date.now(), list = Premium.requests().filter(function (q) {
      return !q.seen && PREMIUM_NEWS[q.state] && q.endedBy !== 'team' && t - Date.parse(q.updatedAt || q.at) < 7 * 864e5;
    }).slice(0, 4);
    el.hidden = !list.length;
    el.innerHTML = list.map(function (q) {
      return '<span><span class="pcrown" aria-hidden="true">♛</span> ' + esc(ST(PREMIUM_NEWS[q.state], { code: q.code, product: premiumName(q.product) })) + '</span>' +
        '<button type="button" class="ghost" data-premium="seen" data-id="' + esc(q.id) + '">' + esc(ST('OK')) + '</button>';
    }).join('');
  }
  function renderPremiumBanner() {
    var el = premiumBanner();
    if (!el || !window.Premium || !Premium.asks) return;
    renderPremiumAsks(el);
    renderPremiumNews($('premiumNewsBanner'));
  }
  function takeInbox() {
    window.LabTakeInbox = takeInbox;
    renderPremiumBanner();
    var inbox = [];
    try { inbox = JSON.parse(localStorage.getItem(INBOX) || '[]') || []; } catch (e) { inbox = []; }
    if (!inbox.length) return;
    var have = {}, added = 0;
    store.sessions.forEach(function (s) { have[s.id] = 1; });
    inbox.forEach(function (r) { if (!have[r.id]) { store.sessions.push(r); added++; } });
    if (save()) { try { localStorage.removeItem(INBOX); } catch (e) { /* taken again next time, without duplicates */ } }
    $('resCount').textContent = '(' + store.sessions.length + ')';
    if (!$('tab-results').hidden) renderResults();
    else if (added) markResults(newResults() + added);
    Lab.toast(inbox.length === 1 ? ST('1 new session in Results.') : ST('{n} new sessions in Results.', { n: inbox.length }));
    renderChoiceBanner();
    if ($('actList')) refreshApps();
  }

  /* ---------- notes after a session ----------
     Three short notes first; the rest of the protocol (goal, workaround, the ten questions) and
     what the app measured fold away. */
  function radios(name, items, value) {
    return items.map(function (it) {
      var v = Array.isArray(it) ? it[0] : it, label = Array.isArray(it) ? it[0] + ' · ' + ST(it[1]) : ST(it);
      return '<label class="pill"><input type="radio" name="' + name + '" value="' + esc(v) + '"' + (value === v ? ' checked' : '') + '> <span>' + esc(label) + '</span></label>';
    }).join('');
  }
  function showDebrief(rec) {
    var d = rec.debrief || {};
    $('setup').hidden = false;
    $('tabsWrap').hidden = true;
    var box = $('debrief');
    box.hidden = false;
    var more = d.goal || d.workaround || d.evidence || (d.role || []).some(Boolean) || (d.care || []).some(Boolean);
    box.innerHTML =
      '<h1>' + esc(ST('Notes')) + '</h1><p class="note">' + esc(rec.date + ' ' + hhmm(rec.startedAt) + ' · ' + ST(rec.activityName) + ' · ' + rec.participant) + '</p>' +
      '<h2>' + esc(ST('Result')) + '</h2><div class="pills">' + radios('dResult', RESULTS, d.result) + '</div>' +
      '<h2>' + esc(ST('Score')) + '</h2><div class="pills">' + radios('dScore', SCORES, d.score) + '</div>' +
      field('dParticipant', ST('What the patient said or did'), d.participantSignal, 2) +
      field('dTechnical', ST('What did not work'), d.technicalSignal, 2) +
      field('dNext', ST('Next step'), d.nextAction, 2) +
      '<details class="more"' + (more ? ' open' : '') + '><summary>' + esc(ST('More notes')) + '</summary>' +
        field('dGoal', ST('Goal'), d.goal, 2) +
        field('dWorkaround', ST('What you did to finish safely'), d.workaround, 2) +
        field('dEvidence', ST('Photo, video or log, if any'), d.evidence, 1) +
        '<h3 class="ph">' + esc(ST('Questions for the role-players')) + '</h3>' + ROLE_QS.map(function (q, i) { return field('dRole' + i, (i + 1) + '. ' + ST(q), (d.role || [])[i], 1); }).join('') +
        '<h3 class="ph">' + esc(ST('Questions for the care professional')) + '</h3>' + CARE_QS.map(function (q, i) { return field('dCare' + i, (i + 1) + '. ' + ST(q), (d.care || [])[i], 1); }).join('') +
      '</details>' +
      '<details class="more"><summary>' + esc(ST('Measured by the app')) + '</summary><dl class="metrics">' + metrics(rec, ST).map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl></details>' +
      '<div class="row"><button type="button" class="go" id="dSave">' + esc(ST('Save')) + '</button><button type="button" class="ghost" id="dSaveDl">' + esc(ST('Save and download')) + '</button>' +
      '<button type="button" class="ghost" id="dCsv">' + esc(ST('Event log (.csv)')) + '</button><span class="grow"></span><button type="button" class="ghost danger" id="dDiscard">' + esc(ST('Delete this session')) + '</button></div>';
    $('dSave').addEventListener('click', function () { readDebrief(rec); closeDebrief(); });
    $('dSaveDl').addEventListener('click', function () { readDebrief(rec); download(fileBase(rec) + '.md', sessionMd(rec), 'text/markdown'); closeDebrief(); });
    $('dCsv').addEventListener('click', function () { download(fileBase(rec) + '-events.csv', eventsCsv(rec), 'text/csv'); });
    $('dDiscard').addEventListener('click', function () {
      if (!window.confirm(ST('Delete this session and its log? This cannot be undone.'))) return;
      store.sessions = store.sessions.filter(function (s) { return s.id !== rec.id; }); save(); closeDebrief();
    });
    window.scrollTo(0, 0);
  }
  function field(fid, label, value, rows) {
    return '<label class="field">' + esc(label) + '<textarea id="' + fid + '" rows="' + (rows || 2) + '">' + esc(value || '') + '</textarea></label>';
  }
  function checkedValue(name) { var r = document.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ''; }
  function readDebrief(rec) {
    rec.debrief = {
      result: checkedValue('dResult'), score: checkedValue('dScore'),
      goal: val('dGoal'), participantSignal: val('dParticipant'), technicalSignal: val('dTechnical'),
      workaround: val('dWorkaround'), nextAction: val('dNext'), evidence: val('dEvidence'),
      role: ROLE_QS.map(function (q, i) { return val('dRole' + i); }),
      care: CARE_QS.map(function (q, i) { return val('dCare' + i); }),
      savedAt: new Date().toISOString()
    };
    var i = store.sessions.map(function (s) { return s.id; }).indexOf(rec.id);
    if (i >= 0) store.sessions[i] = rec; else store.sessions.push(rec);
    save();
  }
  function closeDebrief() {
    $('debrief').hidden = true; $('debrief').innerHTML = '';
    $('tabsWrap').hidden = false;
    showTab('results');
  }

  /* ---------- reports (downloaded files, in English) ---------- */
  function fileBase(rec) { return 'bellatrix-' + rec.date + '-' + rec.testId + '-' + rec.activity + '-' + rec.participant.replace(/[^\w-]/g, ''); }
  function sessionMd(rec) {
    var d = rec.debrief || {}, s = rec.settings || {};
    var score = SCORES.filter(function (x) { return x[0] === d.score; })[0];
    var out = [];
    out.push('## ' + rec.date + ' / ' + rec.testId + ' ' + rec.activityName + ' / map ' + (rec.mapRev || 'not given') + ' / software ' + (rec.sw || 'not given') + ' / Care Lab ' + rec.app);
    out.push('');
    /* The structure of brief 10.1, one item per line. */
    [
      ['Goal', d.goal],
      ['Setup', 'zone ' + rec.zone + '; participant ' + rec.participant + ' (' + (rec.profile || 'profile not given') + '); staff ' + rec.staff +
        '; voice ' + (s.voice ? 'on' : 'off') + ', camera ' + ({ off: 'off', signs: 'hand signs', air: 'pointing in the air' }[s.camera] || (s.hands ? 'hand signs' : 'off')) +
        ', movement camera ' + (s.camMove ? 'on' : 'off') + ', speaking speed ' + s.rate + (s.textSize === 'large' ? ', large text' : '') + (s.subtitles ? ', subtitles' : '') + '; started ' + hhmm(rec.startedAt)],
      ['Language', LANG_NAME[s.lang || 'en']],
      ['Mood', moodText(rec) || 'not asked'],
      ['Result', (d.result || 'not rated') + (score ? ' · score ' + score[0] + ' (' + score[1] + ')' : '')],
      ['Participant signal', d.participantSignal], ['Technical signal', d.technicalSignal], ['Workaround', d.workaround],
      ['Next action', d.nextAction], ['Evidence', d.evidence || 'event log below']
    ].forEach(function (x) { out.push('- **' + x[0] + ':** ' + (x[1] || '')); });
    out.push('');
    out.push('### Measured by the app');
    metrics(rec).forEach(function (m) { out.push('- ' + m[0] + ': ' + m[1]); });
    if (d.role && d.role.some(Boolean)) {
      out.push('', '### Role-players');
      ROLE_QS.forEach(function (q, i) { out.push((i + 1) + '. ' + q + ' ' + (d.role[i] ? '— ' + d.role[i] : '—')); });
    }
    if (d.care && d.care.some(Boolean)) {
      out.push('', '### Care professional');
      CARE_QS.forEach(function (q, i) { out.push((i + 1) + '. ' + q + ' ' + (d.care[i] ? '— ' + d.care[i] : '—')); });
    }
    out.push('', '### Event log', '', '| Time | Step | Input | Event |', '|---|---|---|---|');
    rec.events.forEach(function (e) { out.push('| ' + e.time + ' | ' + mdCell(e.step) + ' | ' + mdCell(e.src) + ' | ' + mdCell(e.msg) + ' |'); });
    return out.join('\n') + '\n';
  }
  function eventsCsv(rec) {
    return csv([['time', 'seconds', 'step', 'input', 'kind', 'event']].concat(rec.events.map(function (e) {
      return [e.time, (e.ms / 1000).toFixed(1), e.step, e.src, e.kind, e.msg];
    })));
  }
  function summaryCsv() {
    var head = ['date', 'start', 'test id', 'activity', 'zone', 'participant', 'profile', 'outcome', 'duration s', 'result', 'score',
      'touch', 'voice', 'hand', 'air', 'keyboard', 'staff taps', 'taps on target', 'taps missed', 'taps on target %', 'not understood', 'help', 'stop', 'back', 'skip',
      'reminders', 'again', 'consent', 'camera s', 'language', 'mood before', 'mood after', 'participant signal', 'technical signal', 'workaround', 'next action'];
    return csv([head].concat(store.sessions.map(function (r) {
      var c = r.counts, t = r.taps, d = r.debrief || {}, all = t.hit + t.miss;
      return [r.date, hhmm(r.startedAt), r.testId, r.activityName, r.zone, r.participant, r.profile, r.outcome, r.durationS, d.result, d.score,
        c.touch, c.voice, c.hand, c.air || 0, c.key, c.staff, t.hit, t.miss, all ? Math.round(100 * t.hit / all) : '', c.unclear, c.help, c.stop, c.back, c.skip,
        c.reprompt, r.again, Object.keys(r.consent).map(function (k) { return k + ':' + r.consent[k]; }).join(' '), Math.round((r.camMs || 0) / 1000),
        (r.settings || {}).lang || 'en', moodName((r.mood || {}).before), moodName((r.mood || {}).after),
        d.participantSignal, d.technicalSignal, d.workaround, d.nextAction];
    })));
  }

  /* ---------- results tab ---------- */
  var OUTCOME = { completed: 'Finished', stopped: 'Stopped', unfinished: 'Not finished', declined: 'Declined', 'ended by staff': 'Ended by the care team',
    'replaced by a new session from the care team': 'Replaced by a new session' };
  function outcomeName(o, tr) { tr = tr || id; return OUTCOME[o] ? tr(OUTCOME[o]) : tr(o || ''); }
  /* One line per session, newest first; filtered to one patient, so their progress reads top to bottom. */
  function progress(r) {
    var s = r.stats || {}, bits = [];
    if (s.moves) bits.push(ST('{list} reps', { list: s.moves.map(function (m) { return m.move + ' ' + m.reps; }).join(', ') }));
    if (s.rightFirstTry !== undefined) bits.push(ST('{n} sayings first try', { n: s.rightFirstTry }));
    if (s.songsRight !== undefined) bits.push(ST('{n} songs guessed', { n: s.songsRight }));
    if (s.levelReached !== undefined) bits.push(ST('pairs level {n}', { n: s.levelReached }));
    else if (s.roundsDone !== undefined) bits.push(ST('{n} pair rounds', { n: s.roundsDone }));
    if (s.pairSeconds && s.pairSeconds.length) bits.push(ST('{n} s per pair', { n: Math.round(s.pairSeconds.reduce(function (a, b) { return a + b; }, 0) / s.pairSeconds.length) }));
    if (s.memoriesShared) bits.push(ST('{n} memories shared', { n: s.memoriesShared }));
    if (s.chessResult) bits.push(ST('chess: {result}', { result: ST(s.chessResult) }) + (s.chessMoves ? ', ' + ST('{n} moves', { n: s.chessMoves }) : '') + (s.chessHints ? ', ' + ST('{n} hints', { n: s.chessHints }) : ''));
    else if (s.chessPuzzlesTried) bits.push(ST('chess puzzles: {a} of {b} solved', { a: s.chessPuzzlesSolved || 0, b: s.chessPuzzlesTried }));
    else if (s.chessMode) bits.push(ST('chess, not finished'));
    if (s.ludoWinner) bits.push(ST('ludo, {n} players: {winner}', { n: s.ludoPlayers || '?', winner: s.ludoWinner }));
    else if (s.ludoPlayers) bits.push(ST('ludo, {n} players, not finished', { n: s.ludoPlayers }));
    if (s.lunch || s.afternoon) bits.push(ST('chose: {what}', { what: [s.lunch, s.afternoon].filter(Boolean).join(', ') }) + (s.choicesSent ? ' ' + ST('(sent to the care team)') : ''));
    if (s.answers && s.answers.join) bits.push(ST('postcards: {list}', { list: s.answers.join(', ') }));
    if (s.birthday) bits.push(ST('birthday greeting'));
    if (s.singAlongs) bits.push(ST('{n} sung along', { n: s.singAlongs }));
    if (s.callFrom !== undefined) bits.push(ST('family call from {who}', { who: s.callFrom + (s.callRelation ? ' (' + s.callRelation + ')' : '') }) + ': ' +
      (s.callAnswered ? (s.callSeconds ? ST('{n} min', { n: Math.max(1, Math.round(s.callSeconds / 60)) }) : ST('answered')) : ST('not answered')));
    if (s.chessResumed) bits.push(ST('chess game resumed'));
    if (s.playItems) bits.push(ST('Bellatrix Play: {min} min, {n} songs or films', { min: s.playMinutes || 0, n: s.playItems }) + (s.playLikes ? ', ' + s.playLikes + ' ♥' : ''));
    return bits.join(' · ');
  }
  /* ---------- mood, before and after (3 good, 2 okay, 1 not so good) ---------- */
  var LANG_NAME = { en: 'English', fr: 'French', de: 'German' };
  var MOOD_NAME = { 3: 'Good', 2: 'Okay', 1: 'Not so good' };
  function moodName(v, tr) { return MOOD_NAME[v] ? (tr || id)(MOOD_NAME[v]) : ''; }
  function moodText(r, tr) {
    tr = tr || id;
    var m = r.mood || {};
    if (!m.before && !m.after) return '';
    return (moodName(m.before, tr) || tr('skipped')) + ' → ' + (moodName(m.after, tr) || (r.outcome === 'completed' ? tr('skipped') : tr('not asked')));
  }
  /* One patient's sessions, oldest first: a ring before the activity, a dot after it, joined by a
     line. Colour is never alone: ring vs dot, the legend, the tooltip and the Mood column. */
  function moodChart(list) {
    var rows = list.filter(function (r) { var m = r.mood || {}; return m.before || m.after; }).slice(0, 20).reverse();
    if (!rows.length) return '<p class="note">' + esc(ST('No mood answers yet for this patient.')) + '</p>';
    var both = rows.filter(function (r) { return r.mood.before && r.mood.after; });
    var better = both.filter(function (r) { return r.mood.after > r.mood.before; }).length;
    var W = 760, H = 210, L = 118, R = 20, T = 18, B = 40, step = (W - L - R) / Math.max(rows.length, 1);
    function y(v) { return T + (3 - v) * (H - T - B) / 2; }
    var g = '';
    [3, 2, 1].forEach(function (v) {
      g += '<line class="mgrid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
        '<text class="mlabel" x="' + (L - 12) + '" y="' + (y(v) + 5) + '" text-anchor="end">' + esc(ST(MOOD_NAME[v])) + '</text>';
    });
    var every = Math.ceil(rows.length / 8);
    rows.forEach(function (r, i) {
      var cx = L + step * (i + 0.5), m = r.mood, bx = cx - 8, ax = cx + 8;
      if (m.before && m.after) g += '<line class="mlink" x1="' + bx + '" x2="' + ax + '" y1="' + y(m.before) + '" y2="' + y(m.after) + '"/>';
      if (m.before) g += '<circle class="mbefore" cx="' + bx + '" cy="' + y(m.before) + '" r="7"/>';
      if (m.after) g += '<circle class="mafter" cx="' + ax + '" cy="' + y(m.after) + '" r="7"/>';
      if (i % every === 0 || i === rows.length - 1) g += '<text class="mlabel" x="' + cx + '" y="' + (H - 12) + '" text-anchor="middle">' + esc(r.date.slice(5)) + '</text>';
      g += '<rect class="mhit" x="' + (cx - step / 2) + '" y="0" width="' + step + '" height="' + H + '" data-tip="' +
        esc(r.date + ' ' + hhmm(r.startedAt) + ' · ' + ST(r.activityName) + ' · ' + moodText(r, ST)) + '"/>';
    });
    return '<div class="moodbox">' +
      '<p class="moodhead">' + (both.length ? ST('Better mood after {a} of {b} sessions', { a: '<b>' + better + '</b>', b: both.length }) : esc(ST('Mood before and after each activity'))) + '</p>' +
      '<div class="moodlegend"><span><svg width="18" height="18" aria-hidden="true"><circle class="mbefore" cx="9" cy="9" r="6"/></svg> ' + esc(ST('Before')) + '</span>' +
      '<span><svg width="18" height="18" aria-hidden="true"><circle class="mafter" cx="9" cy="9" r="6"/></svg> ' + esc(ST('After')) + '</span></div>' +
      '<div class="moodplot"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(ST('Mood before and after each activity')) + '">' + g + '</svg><div class="moodtip" hidden></div></div></div>';
  }
  function wireMoodChart() {
    var plot = document.querySelector('.moodplot');
    if (!plot) return;
    var tip = plot.querySelector('.moodtip');
    plot.addEventListener('pointermove', function (e) {
      var t = e.target.closest ? e.target.closest('.mhit') : null;
      if (!t) { tip.hidden = true; return; }
      var b = plot.getBoundingClientRect();
      tip.textContent = t.getAttribute('data-tip');
      tip.hidden = false;
      tip.style.left = Math.min(b.width - tip.offsetWidth - 4, Math.max(4, e.clientX - b.left + 12)) + 'px';
      tip.style.top = Math.max(4, e.clientY - b.top - 44) + 'px';
    });
    plot.addEventListener('pointerleave', function () { tip.hidden = true; });
  }
  function renderResults() {
    /* "See the results" on the patient card opens this tab for that resident (1.16). */
    var who = resultsFor || val('resPatient'), codes = {};
    resultsFor = '';
    store.sessions.forEach(function (r) { codes[r.participant] = 1; });
    if (who) codes[who] = 1;
    $('resPatient').innerHTML = '<option value="">' + esc(ST('All patients')) + '</option>' + Object.keys(codes).sort().map(function (c) { return '<option' + (c === who ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    var list = store.sessions.filter(function (r) { return !who || r.participant === who; }).reverse();
    $('resCount').textContent = store.sessions.length ? '(' + store.sessions.length + ')' : '';
    if (!list.length) { $('resBody').innerHTML = '<p class="empty">' + esc(ST('No sessions yet.')) + '<small>' + esc(ST('Started sessions appear here (previews are not saved).')) + '</small></p>'; return; }
    var chart = who ? moodChart(list) : '';
    $('resBody').innerHTML = chart + '<div class="tblwrap"><table class="tbl"><thead><tr><th>' + [ST('Date'), ST('Activity'), ST('Who'), ST('Outcome'), ST('Mood'), ST('Progress'), ST('Notes')].map(esc).join('</th><th>') + '</th><th></th></tr></thead><tbody>' +
      list.map(function (r) {
        var d = r.debrief || {};
        return '<tr><td class="nowrap">' + esc(r.date + ' ' + hhmm(r.startedAt)) + '</td><td>' + esc(ST(r.activityName)) + '</td><td>' + esc(r.participant) + '</td><td>' + esc(outcomeName(r.outcome, ST)) + '</td>' +
          '<td>' + esc(moodText(r, ST) || '–') + '</td>' +
          '<td>' + esc(progress(r) || '–') + '</td><td>' + esc(d.result ? ST(d.result) + (d.score ? ' · ' + d.score : '') : '–') + '</td>' +
          '<td class="nowrap"><button type="button" class="ghost sm" data-r="edit" data-id="' + r.id + '">' + esc(d.result ? ST('Edit notes') : ST('Add notes')) + '</button> <button type="button" class="ghost sm" data-r="md" data-id="' + r.id + '" title="' + esc(ST('Download')) + '">.md</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    wireMoodChart();
  }
  function byId(sid) { return store.sessions.filter(function (s) { return s.id === sid; })[0]; }

  /* The monthly summary itself is in the patient's language (wrapped.js); its tool bar on this page
     follows the team's language. */
  function translateWrapped(code) {
    var o = $('wrapOverlay');
    if (!o || ST.lang() === 'en') return;
    var b = o.querySelector('.wraptools b'), n = o.querySelector('.wraptools .note');
    if (b) b.textContent = ST('Monthly summary') + ' · ' + code;
    if (n) {
      var m = /^(\d+) session/.exec(n.textContent);
      n.textContent = !m ? ST('No session in the last 30 days') : m[1] === '1' ? ST('1 session in the last 30 days, in the patient’s language') : ST('{n} sessions in the last 30 days, in the patient’s language', { n: m[1] });
    }
    Array.prototype.forEach.call(o.querySelectorAll('[data-w]'), function (x) { x.textContent = ST(x.getAttribute('data-w') === 'save' ? 'Download for the family' : 'Close'); });
    Array.prototype.forEach.call(o.querySelectorAll('[aria-label="Monthly summary"], [title="Monthly summary"]'), function (x) {
      if (x.getAttribute('aria-label')) x.setAttribute('aria-label', ST('Monthly summary'));
      if (x.getAttribute('title')) x.setAttribute('title', ST('Monthly summary'));
    });
  }

  /* ---------- wiring ---------- */
  function exportAll() {
    if (!store.sessions.length) { window.alert(ST('No sessions yet.')); return; }
    var md = '# Bellatrix field test log\n\nExported ' + new Date().toLocaleString('en-GB') + ', ' + store.sessions.length + ' sessions.\n\n' +
      store.sessions.map(sessionMd).join('\n---\n\n');
    download('bellatrix-field-test-log-' + stamp() + '.md', md, 'text/markdown');
  }
  document.addEventListener('DOMContentLoaded', function () {
    /* The page's fixed texts in the team's language, before anything is drawn. */
    document.documentElement.lang = ST.lang();
    document.title = ST('Bellatrix Care Team');
    ST.apply(document);
    renderLangSwitch();
    $('langSwitch').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-ui-lang]') : null;
      if (b) setTeamLang(b.getAttribute('data-ui-lang'));
    });
    $('preview').title = ST('Not saved in Results');
    renderSetup();
    document.querySelectorAll('.ctop .tabs [data-tab]').forEach(function (b) { b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); }); });
    Array.prototype.forEach.call(document.querySelectorAll('.subnav'), function (nav) {
      nav.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-sub]') : null, panel = nav.parentNode;
        if (b && panel && panel.id) showSub(panel.id.replace(/^tab-/, ''), b.getAttribute('data-sub'));
      });
    });
    $('actList').addEventListener('change', function () {
      var act = selected();
      store.settings.activity = act.key; save();
      renderContent();
      refreshApps();
    });
    $('actFilter').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-f]') : null;
      if (!b) return;
      filter = b.getAttribute('data-f');
      try { sessionStorage.setItem('labFilter', filter); } catch (err) { /* only a convenience */ }
      renderFilter(); renderTiles();
    });
    ensureSector();
    ['fGreet', 'optCamMove', 'optRate', 'optVolume', 'optText', 'optSubs', 'optLang', 'optMood',
      'fBorn', 'fBirthday', 'fHome', 'fLoves', 'fAvoid', 'fTalk', 'fSector'].forEach(function (fid) {
      $(fid).addEventListener('change', readSetup);
    });
    $('optLang').addEventListener('change', function () { renderContent(); });
    document.querySelectorAll('input[name="camMode"]').forEach(function (r) { r.addEventListener('change', readSetup); });
    /* A new patient code first shows that patient's own settings, then saves. */
    $('fParticipant').addEventListener('change', function () { renderPatient(); readSetup(); });
    $('cReset').addEventListener('click', resetActivity);
    wireContent();
    wireDaily();
    Media.ready.then(function () {
      renderContent();
      offerTransfer();
      if (!store.settings.clipsMoved) {
        Media.migrateOldClips(patientCode()).then(function (n) {
          store.settings.clipsMoved = true; save();
          if (n) Lab.toast(ST('{n} songs from the earlier version now belong to {code}.', { n: n, code: patientCode() }));
        });
      }
    });
    /* Packs from the Library: new tiles once their signature is checked, locks when the licence changes. */
    window.addEventListener('bellatrix-store', function () { buildTiles(); renderContent(); refreshApps(); });
    /* The care team's own games (js/games.js): the list of the server, added or removed. */
    window.addEventListener('bellatrix-games', function () { buildTiles(); renderContent(); refreshApps(); });
    window.StaffUI = {
      showTab: showTab,
      showSub: showSub,
      current: function () { return { tab: shown.tab, sub: shown.sub }; },
      /* 15 Nov: the chosen activity (its settings may hold a module's part), and one activity's
         settings opened for a resident (AlbumStaff.open, RecoStaff.show). */
      activity: function () { return selected().key; },
      openActivity: openActivity,
      /* 14 Nov (js/family-visit-staff.js): one Care Team setting of a resident, kept with the other prefs (e.g. 'place'). */
      pref: function (code, k) { var p = store.patients[code]; return p && p.prefs ? p.prefs[k] : undefined; },
      setPref: function (code, k, v) {
        if (!code) return false;
        var p = store.patients[code] = store.patients[code] || { content: {}, prefs: {} };
        p.prefs = p.prefs || {};
        if (v === undefined || v === null || v === '') delete p.prefs[k]; else p.prefs[k] = v;
        return save();
      },
      exportPatients: exportPatients,
      choose: function (key) {
        showTab('session');
        var r = document.querySelector('input[name="activity"][value="' + key + '"]');
        if (!r) return;
        r.checked = true;
        r.dispatchEvent(new Event('change', { bubbles: true }));
        var t = r.closest('.tile'); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'center' });
      }
    };
    renderChoiceBanner();
    $('choiceBanner').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-passed]') : null, rec = b ? byId(b.getAttribute('data-passed')) : null;
      if (!rec) return;
      rec.passedOn = new Date().toISOString();
      save();
      renderChoiceBanner();
    });
    $('go').addEventListener('click', function () { handOver(false); });
    $('preview').addEventListener('click', function () { handOver(true); });
    takeInbox();
    window.addEventListener('bellatrix-play-premium', renderPremiumBanner);
    window.addEventListener('storage', function (e) { if (e.key === INBOX) takeInbox(); });
    window.addEventListener('focus', takeInbox);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') takeInbox(); });
    $('resPatient').addEventListener('change', renderResults);
    $('resBody').addEventListener('click', function (e) {
      var b = e.target.closest('[data-r]');
      if (!b) return;
      var rec = byId(b.getAttribute('data-id'));
      if (!rec) return;
      var what = b.getAttribute('data-r');
      if (what === 'md') download(fileBase(rec) + '.md', sessionMd(rec), 'text/markdown');
      else if (what === 'csv') download(fileBase(rec) + '-events.csv', eventsCsv(rec), 'text/csv');
      else showDebrief(rec);
    });
    $('resAllMd').addEventListener('click', exportAll);
    /* The monthly summary of the patient shown in Results (or of the current patient). */
    $('resWrapped').addEventListener('click', function () {
      if (!window.Wrapped) return;
      var code = val('resPatient') || patientCode();
      Wrapped.open(code);
      translateWrapped(code);
    });
    $('resAllCsv').addEventListener('click', function () { download('bellatrix-sessions-' + stamp() + '.csv', summaryCsv(), 'text/csv'); });
    $('resClear').addEventListener('click', function () {
      if (!store.sessions.length || !window.confirm(ST('Delete all {n} saved sessions from this device? Download them first if you need them.', { n: store.sessions.length }))) return;
      store.sessions = []; save(); renderResults();
    });
    var tab = 'session';
    try { tab = sessionStorage.getItem('labTab') || 'session'; } catch (e) { /* default tab */ }
    showTab(tab);
    /* Once every module has mounted (their DOMContentLoaded comes after this one), say again what is shown. */
    setTimeout(announce, 0);
    setTimeout(function () { actHosts(true); }, 0);
    wireTray();
    wireWaits();
    markResults(newResults());
    $('resCount').textContent = store.sessions.length ? '(' + store.sessions.length + ')' : '';
    $('version').textContent = 'Version ' + Lab.version;
  });

  Lab._staff = { metrics: metrics, sessionMd: sessionMd, summaryCsv: summaryCsv, store: function () { return store; } };
})();
