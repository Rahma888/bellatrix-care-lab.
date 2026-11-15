/* The ten micro-sessions of the field test brief (section 6), one per test day. Chess (11) and Ludo (12) come from the Library: the Board games pack (labland/packs/board-games).
   Each activity returns its first step; the engine adds the opening script, the camera
   consent, Help, Stop, Back and the closing question around it.
   `content` lists what staff can change per patient on the setup page: texts, the patient's own
   pictures (type image / images) and songs (type audio / audios).
   Everything the patient sees or hears goes through L.t(englishText, vars): the English text is
   the key, French and German are in js/i18n-activities.js. Default content values are
   { en, fr, de }. */
(function () {
  'use strict';
  var esc = Lab.esc;

  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function spokenTime(t) { return t.replace(/^0(\d)/, '$1'); }
  /* A label inside a sentence ("the sea, the mountain or the forest"). English and French lower-case
     it as before (firstOnly: just the first letter); German keeps its capitalised nouns and only
     lowers a leading article or preposition ("das Meer", "nach Jahrzehnt", but "Kinderlieder"). */
  var DE_SMALL = /^(der|die|das|den|dem|des|ein|eine|einen|einem|einer|nach|von|vom|mit|im|am|zum|zur|alle|jede|jedes|jeder|etwas)\s/i;
  function inSentence(L, s, firstOnly) {
    if (L.lang() === 'de') return DE_SMALL.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
    return firstOnly ? s.charAt(0).toLowerCase() + s.slice(1) : s.toLowerCase();
  }
  /* Built-in tunes have a title in every language; the patient's own songs keep the title staff gave them. */
  function songTitle(L, s) { return s.clip ? s.title : L.t(s.title); }
  var ACK = '<div class="ack" aria-live="polite"></div>';
  var DONE_WORDS = ['done', 'finish', 'finished', 'im done', 'nothing else', 'enough', 'thats all', 'no more'];
  function doneAction(L, label) {
    return { label: label || L.t('I’m done'), gesture: 'fist', words: DONE_WORDS, noLabelWords: true, run: function () { L.finish(); } };
  }
  /* Wraps the engine API so that go(null) is ignored: helpers may finish the activity themselves. */
  function safe(L) { var W = Object.create(L), go = L.go; W.go = function (step, o) { if (step) go(step, o); }; return W; }

  /* Sing along (version 1.10): the words of the traditional tunes, all long out of copyright, shown
     line by line while the melody plays. A song is sung in the patient's language when a traditional
     version exists, otherwise in its own language. */
  var LYRICS = {
    twinkle: {
      en: ['Twinkle, twinkle, little star,', 'How I wonder what you are!', 'Up above the world so high,', 'Like a diamond in the sky.', 'Twinkle, twinkle, little star,', 'How I wonder what you are!'],
      fr: ['Ah ! vous dirai-je, maman,', 'Ce qui cause mon tourment ?', 'Papa veut que je raisonne', 'Comme une grande personne.', 'Moi, je dis que les bonbons', 'Valent mieux que la raison.'] },
    mary: { en: ['Mary had a little lamb,', 'Little lamb, little lamb,', 'Mary had a little lamb,', 'Its fleece was white as snow.'] },
    row: { en: ['Row, row, row your boat', 'Gently down the stream.', 'Merrily, merrily, merrily, merrily,', 'Life is but a dream.'] },
    frere: {
      fr: ['Frère Jacques, Frère Jacques,', 'Dormez-vous ? Dormez-vous ?', 'Sonnez les matines, sonnez les matines,', 'Ding, dang, dong. Ding, dang, dong.'],
      de: ['Bruder Jakob, Bruder Jakob,', 'Schläfst du noch? Schläfst du noch?', 'Hörst du nicht die Glocken? Hörst du nicht die Glocken?', 'Ding, dang, dong. Ding, dang, dong.'],
      en: ['Are you sleeping, are you sleeping,', 'Brother John, Brother John?', 'Morning bells are ringing, morning bells are ringing,', 'Ding, dang, dong. Ding, dang, dong.'] },
    london: { en: ['London Bridge is falling down,', 'Falling down, falling down,', 'London Bridge is falling down,', 'My fair lady.'] },
    macdonald: { en: ['Old MacDonald had a farm,', 'E-I-E-I-O!', 'And on that farm he had a cow,', 'E-I-E-I-O!'] },
    jingle: { en: ['Jingle bells, jingle bells,', 'Jingle all the way!', 'Oh, what fun it is to ride', 'In a one-horse open sleigh!'] },
    ode: { de: ['Freude, schöner Götterfunken,', 'Tochter aus Elysium,', 'Wir betreten feuertrunken,', 'Himmlische, dein Heiligtum!'] }
  };
  function lyricsFor(L, id) { var l = LYRICS[id]; return l ? l[L.lang()] || l.en || l.de || l.fr : null; }
  function birthdayLyrics(L, name) {
    if (L.lang() === 'fr') return ['Joyeux anniversaire,', 'Joyeux anniversaire,', name ? 'Joyeux anniversaire, ' + name + ',' : 'Joyeux anniversaire à vous,', 'Joyeux anniversaire !'];
    if (L.lang() === 'de') return ['Zum Geburtstag viel Glück,', 'Zum Geburtstag viel Glück,', name ? 'Zum Geburtstag, ' + name + ',' : 'Zum Geburtstag alles Gute,', 'Zum Geburtstag viel Glück!'];
    return ['Happy birthday to you,', 'Happy birthday to you,', name ? 'Happy birthday, dear ' + name + ',' : 'Happy birthday, dear friend,', 'Happy birthday to you!'];
  }
  function songSeconds(song, tempo) {
    var beats = song.notes.trim().split(/\s+/).reduce(function (n, tok) { var p = tok.split(':'); return n + (p[1] ? parseFloat(p[1]) : 1); }, 0);
    return beats * 60 / (song.bpm * (tempo || 1));
  }
  function lyricsHtml(lines) { return '<ol class="lyrics">' + lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ol>'; }
  /* Plays the melody and lights the line being sung (the lines share the time equally, close enough
     for these short songs). o: { song, lines, tempo, onEnd } */
  function singAlong(L, o) {
    var tempo = o.tempo || 0.85, total = songSeconds(o.song, tempo) * 1000, t0 = Date.now(), n = o.lines.length;
    function mark(k) {
      var items = document.querySelectorAll('#stage .lyrics li');
      for (var i = 0; i < items.length; i++) items[i].className = i === k ? 'on' : i < k ? 'sung' : '';
    }
    function light() {
      var k = Math.min(n - 1, Math.floor((Date.now() - t0) / total * n));
      mark(k);
      if (Date.now() - t0 < total) L.later(light, 200);
    }
    L.music(o.song, { tempo: tempo, wave: 'triangle', onEnd: function () { mark(n); if (o.onEnd) o.onEnd(); } });
    light();
  }

  /* Hello & Today (version 1.10): the day, the date, the season and the time, said and shown. */
  var SEASON_NAME = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };
  var SEASON_SAY = { spring: 'It is spring.', summer: 'It is summer.', autumn: 'It is autumn.', winter: 'It is winter.' };
  var SEASON_ART = {
    spring: '<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="#E58FB0">' + [0, 72, 144, 216, 288].map(function (a) { return '<ellipse cx="50" cy="28" rx="13" ry="20" transform="rotate(' + a + ' 50 50)"/>'; }).join('') + '</g><circle cx="50" cy="50" r="12" fill="#F2C14E"/></svg>',
    summer: '<svg viewBox="0 0 100 100" aria-hidden="true"><g stroke="#E8A21C" stroke-width="7" stroke-linecap="round">' + [0, 45, 90, 135, 180, 225, 270, 315].map(function (a) { return '<line x1="50" y1="8" x2="50" y2="20" transform="rotate(' + a + ' 50 50)"/>'; }).join('') + '</g><circle cx="50" cy="50" r="22" fill="#F2C14E"/></svg>',
    autumn: '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 6 C60 26 80 28 88 40 C74 46 76 58 84 70 C68 68 60 74 54 88 L50 76 L46 88 C40 74 32 68 16 70 C24 58 26 46 12 40 C20 28 40 26 50 6 Z" fill="#D2691E"/><path d="M50 30 L50 96" stroke="#7A3B10" stroke-width="4" stroke-linecap="round"/></svg>',
    winter: '<svg viewBox="0 0 100 100" aria-hidden="true"><g stroke="#5BA4CF" stroke-width="6" stroke-linecap="round">' + [0, 60, 120].map(function (a) { return '<g transform="rotate(' + a + ' 50 50)"><line x1="50" y1="10" x2="50" y2="90"/><line x1="50" y1="24" x2="40" y2="15"/><line x1="50" y1="24" x2="60" y2="15"/><line x1="50" y1="76" x2="40" y2="85"/><line x1="50" y1="76" x2="60" y2="85"/></g>'; }).join('') + '</g></svg>'
  };
  function seasonOf(d) { var md = (d.getMonth() + 1) * 100 + d.getDate(); return md >= 1221 || md < 320 ? 'winter' : md < 621 ? 'spring' : md < 922 ? 'summer' : 'autumn'; }
  var CAKE = '<svg viewBox="0 0 400 300" aria-hidden="true"><rect width="400" height="300" fill="#F7F7F7"/>' +
    [150, 200, 250].map(function (x) { return '<rect x="' + (x - 6) + '" y="78" width="12" height="44" rx="4" fill="#E8A0B4"/><ellipse class="flame" cx="' + x + '" cy="66" rx="9" ry="15" fill="#F59E0B"/>'; }).join('') +
    '<rect x="115" y="118" width="170" height="62" rx="12" fill="#F2C14E"/><rect x="85" y="172" width="230" height="82" rx="14" fill="#C9677F"/>' +
    '<path d="M85 194 q29 20 57 0 q29 20 57 0 q29 20 57 0 q29 20 59 0" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round"/>' +
    '<rect x="55" y="252" width="290" height="12" rx="6" fill="#8C5A3C"/></svg>';

  /* ---------- Activity 1: Hello & Today ---------- */
  Lab.define({
    key: 'hello', day: 1, name: 'Hello & Today', zone: 'ROSE_ROOM',
    flow: 'The day’s welcome: the date, the season and the time, with one line of the day. Optionally a choice of today’s plan, a picture or a music clip.',
    learn: 'Approach distance, first impression, touch comprehension and exit.',
    art: function (L) { return L.image('picture', ART.garden); },
    /* 1.16: by default only the day's welcome (orientation: date, season, time, one line of the day
       from js/daily.js). The plan, the picture and the music are kept: 'After the welcome' brings
       the old choice back. */
    content: [
      { id: 'after', label: 'After the welcome', type: 'select', value: 'welcome',
        options: [['welcome', 'Nothing: the day’s welcome only'], ['menu', 'A choice: today’s plan, a picture or music']] },
      { id: 'plan', label: 'Today’s plan', type: 'text', note: 'One line per item: the time, a bar, then what happens.', rows: 6,
        value: {
          en: '09:30 | Breakfast in the dining bay\n11:00 | Music in the community circle\n12:30 | Lunch\n15:00 | Coffee and cake\n16:30 | A short walk in the garden',
          fr: '09h30 | Petit-déjeuner dans la salle à manger\n11h00 | Musique dans la salle commune\n12h30 | Déjeuner\n15h00 | Café et gâteau\n16h30 | Une petite promenade au jardin',
          de: '09:30 | Frühstück im Speisesaal\n11:00 | Musik im Gemeinschaftsraum\n12:30 | Mittagessen\n15:00 | Kaffee und Kuchen\n16:30 | Ein kurzer Spaziergang im Garten' } },
      { id: 'picture', label: 'The picture', type: 'image', slot: 'picture', preview: function () { return ART.garden; } },
      { id: 'caption', label: 'What Bellatrix says about the picture', type: 'line',
        value: {
          en: 'The garden in spring. The flowers are out and the sun is shining.',
          fr: 'Le jardin au printemps. Les fleurs sont écloses et le soleil brille.',
          de: 'Der Garten im Frühling. Die Blumen blühen und die Sonne scheint.' } },
      { id: 'message', label: 'Message from the care team', type: 'text', rows: 2,
        value: {
          en: 'Good morning from the care team. We look forward to the music at eleven.',
          fr: 'Bonjour de la part de l’équipe soignante. Nous nous réjouissons d’écouter la musique à onze heures.',
          de: 'Guten Morgen vom Pflegeteam. Wir freuen uns auf die Musik um elf Uhr.' } },
      { id: 'music', label: 'The music clip', type: 'audio', slot: 'music', note: 'Optional: a song the patient likes. Without one, a built-in tune plays.' },
      { type: 'heading', label: 'The birthday comes from the patient’s life story (Activities, 1 Patient): on that day Bellatrix wishes a happy birthday and sings with them.' }
    ],
    start: function (L) {
      var seen = {}, full = L.text('after') === 'menu';
      function more() {
        return [
          { label: L.t('Something else'), primary: true, gesture: 'open', words: ['something else', 'else', 'other', 'another', 'more', 'menu'], noLabelWords: true, run: function () { L.go(menu(), { clear: true }); } },
          doneAction(L)
        ];
      }
      function menu() {
        return {
          id: 'menu', eyebrow: L.t('Hello & Today'), title: L.t('What would you like to see?'), back: false, pic: L.image('picture', ART.garden),
          say: function () { return L.t('What would you like to see?'); },
          choices: [
            { label: L.t('Today’s plan'), icon: ART.icon.calendar, cls: seen.plan ? 'seen' : '', words: ['plan', 'today', 'schedule', 'day', 'programme', 'program'], run: function () { seen.plan = 1; L.go(plan()); } },
            { label: L.t('A picture'), icon: ART.icon.picture, cls: seen.pic ? 'seen' : '', words: ['picture', 'photo', 'image'], run: function () { seen.pic = 1; L.go(picture()); } },
            { label: L.t('A music clip'), icon: ART.icon.note, cls: seen.music ? 'seen' : '', words: ['music', 'song', 'clip', 'tune'], run: function () { seen.music = 1; L.go(music()); } }
          ],
          actions: [doneAction(L)]
        };
      }
      function plan() {
        var rows = L.lines('plan').map(function (l) { var p = l.split('|'); return { t: (p[0] || '').trim(), w: (p[1] || p[0] || '').trim() }; });
        return {
          id: 'plan', eyebrow: L.t('Hello & Today'), title: L.t('Today’s plan'),
          body: '<ul class="plan">' + rows.map(function (r) { return '<li><b>' + esc(r.t) + '</b><span>' + esc(r.w) + '</span></li>'; }).join('') + '</ul>',
          say: L.t('Here is today’s plan.') + ' ' + rows.map(function (r) { return L.t('At {time}, {what}.', { time: spokenTime(r.t), what: r.w }); }).join(' '),
          actions: more()
        };
      }
      function picture() {
        var cap = L.text('caption'), msg = L.text('message');
        return {
          id: 'picture', eyebrow: L.t('Hello & Today'), title: L.t('A picture for you'), pic: L.image('picture', ART.garden),
          body: '<p class="story">' + esc(cap) + '</p>' + (msg ? '<p class="msg"><b>' + esc(L.t('From the care team:')) + '</b> ' + esc(msg) + '</p>' : ''),
          say: cap + (msg ? ' ' + L.t('A message from the care team: {message}', { message: msg }) : ''),
          actions: more()
        };
      }
      function music() {
        var own = L.audios('music')[0];
        function play() { L.music(own || Music.byId('twinkle'), { seconds: 45, tempo: 0.8, wave: 'sine', onEnd: function () { L.say(L.t('Would you like something else?')); } }); }
        return {
          id: 'music', eyebrow: L.t('Hello & Today'), title: own ? own.title : L.t('A short piece of music'), pic: ART.music, listenDuringMusic: !own,
          say: L.t('Here is a short piece of music.'), afterSay: play,
          actions: [
            { label: L.t('Play again'), pair: true, gesture: 'thumb', words: ['again', 'play again', 'repeat', 'once more'], noLabelWords: true, run: function () { L.stat('replays'); play(); } },
            { label: L.t('Stop the music'), pair: true, duringMusic: true, words: ['stop the music', 'stop music', 'stop', 'quiet', 'pause'], noLabelWords: true, run: function (src) { L.stopMusic(src); } }
          ].concat(more())
        };
      }
      /* First the day: the greeting for the time of day, the date, the season and the time. */
      function today() {
        var d = new Date(), loc = I18N.BCP47[L.lang()] || 'en-US', s = seasonOf(d), h = d.getHours(), name = L.greet();
        var hi = h < 12 ? (name ? L.t('Good morning, {name}!', { name: name }) : L.t('Good morning!'))
          : h < 18 ? (name ? L.t('Good afternoon, {name}!', { name: name }) : L.t('Good afternoon!'))
          : (name ? L.t('Good evening, {name}!', { name: name }) : L.t('Good evening!'));
        var date = d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        var time = d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
        var told = L.t('Today is {date}.', { date: date }) + ' ' + L.t(SEASON_SAY[s]) + ' ' + L.t('It is {time}.', { time: time });
        var card = '<div class="today s-' + s + '"><span class="tdow">' + esc(d.toLocaleDateString(loc, { weekday: 'long' })) + '</span><span class="tday">' + d.getDate() + '</span>' +
          '<span class="tmon">' + esc(d.toLocaleDateString(loc, { month: 'long', year: 'numeric' })) + '</span><span class="tseason">' + SEASON_ART[s] + '<b>' + esc(L.t(SEASON_NAME[s])) + '</b></span>' +
          '<span class="ttime">' + esc(time) + '</span></div>';
        var b = /^\s*(\d{1,2})\s*[.\/\-]\s*(\d{1,2})/.exec((Lab.opt.life || {}).birthday || '');
        var birthday = !!b && +b[1] === d.getDate() && +b[2] === d.getMonth() + 1;
        /* One short line of the day (the season, the month), new each day; none without js/daily.js. */
        var w = dailyBatch('welcome', dailyOpts(L)), line = w && w[0] ? w[0].line : '';
        L.stat('todayShown', s);
        var go = { label: birthday ? L.t('A surprise for you') : L.t('Continue'), primary: true, gesture: 'open', words: ['continue', 'next', 'yes', 'ok', 'okay', 'go', 'surprise'], noLabelWords: true,
          run: function () { if (birthday) L.go(party(name), { clear: true }); else if (full) L.go(menu(), { clear: true }); else L.finish(); } };
        return {
          id: 'today', eyebrow: L.t('Hello & Today'), title: hi, lead: line, back: false, pic: card, picCls: 'todaybox',
          say: hi + ' ' + told + (line ? ' ' + line : ''),
          actions: full || birthday ? [go, doneAction(L)] : [go]
        };
      }
      function party(name) {
        var lines = birthdayLyrics(L, name), song = Music.byId('birthday'), wish = name ? L.t('Happy birthday, {name}!', { name: name }) : L.t('Happy birthday!');
        L.stat('birthday', true);
        L.log('Birthday greeting', 'result');
        return {
          id: 'birthday', eyebrow: L.t('Hello & Today'), title: wish, back: false, pic: CAKE, picCls: 'cakebox', body: lyricsHtml(lines),
          say: wish + ' ' + L.t('The whole team wishes you a wonderful day. Let us sing together.'),
          afterSay: function () { singAlong(L, { song: song, lines: lines, tempo: 0.9 }); },
          actions: [
            { label: L.t('Continue'), primary: true, gesture: 'open', words: ['continue', 'next', 'thank you', 'thanks', 'ok', 'okay'], noLabelWords: true, run: function () { L.stopMusic(); if (full) L.go(menu(), { clear: true }); else L.finish(); } },
            { label: L.t('Sing again'), gesture: 'thumb', words: ['again', 'sing again', 'once more'], noLabelWords: true, run: function () { L.stopMusic(); singAlong(L, { song: song, lines: lines, tempo: 0.9 }); } }
          ]
        };
      }
      return today();
    }
  });

  /* ---------- Activity 2: Memory Postcards → part of Memories (1.16) ----------
     The postcards (sea, mountain, forest: picture, title, told story, question, "Hear again") are
     part of the 'album' activity now (js/album.js, js/album-data.js): the same landscapes and stories
     are generic cards of the theme "Nature", and each resident's postcard pictures and texts are
     taken over once (Album.migratePostcards). The 'postcards' key no longer exists. */

  /* ---------- New content every day (1.16, js/daily.js) ----------
     Finish the Saying, the Kindness Quiz and the welcome of Hello & Today take the day's batch for
     this resident and language from Daily (cached for the day: the same batch when the activity is
     opened again). Without js/daily.js, or when it gives nothing, each keeps its own content below. */
  function dailyBatch(kind, o) {
    if (!window.Daily || typeof Daily.get !== 'function') return null;
    var b = null;
    try { b = Daily.get(kind, o); } catch (e) { b = null; }
    return b && b.length ? b : null;
  }
  function dailyOpts(L, more) {
    var o = { lang: L.lang(), code: Lab.patient, life: Lab.opt.life || {} };
    Object.keys(more || {}).forEach(function (k) { o[k] = more[k]; });
    return o;
  }
  /* True when the care team wrote its own text in a field (not the built-in default of any language). */
  function ownText(key, id) {
    var c = (Lab.content[key] || {})[id], act = Lab.byKey[key];
    if (c === undefined || !String(c).trim() || !act) return false;
    var f = (act.content || []).filter(function (x) { return x.id === id; })[0], v = (f && f.value) || {};
    function n(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
    return ['en', 'fr', 'de'].every(function (l) { return n(v[l]) !== n(c); });
  }
  function dailyFields() {
    return [
      { id: 'daily', label: 'New every day', type: 'select', value: 'on', options: [['on', 'Yes'], ['off', 'No: only the list below']] },
      { id: 'level', label: 'Difficulty', type: 'select', value: 'usual', options: [['usual', 'Usual'], ['gentle', 'Easier']] }
    ];
  }
  /* "Rapide comme l’" + "éclair": no space after an elided word. */
  function glue(start) { return /[’'\-]$/.test(start) ? '' : ' '; }

  /* ---------- Activity 3: Finish the Saying ---------- */
  var PRAISE = ['Yes, that is right!', 'Well done!', 'Lovely, that is it!'];
  Lab.define({
    key: 'sayings', day: 3, name: 'Finish the Saying', zone: 'COMMUNITY_CIRCLE',
    flow: 'Complete well-known sayings, new ones every day, with a show answer option.',
    learn: 'Group turn-taking, noise, pacing and no-pressure design.',
    art: function () { return ART.bubbles; },
    /* 1.16: new sayings every day from js/daily.js (the team's own sayings, when it wrote some, are
       mixed in, two a day); "No" keeps only the list, as before. */
    content: dailyFields().concat([
      { id: 'sayings', label: 'Sayings', type: 'text', rows: 7, note: 'One per line: the start, a bar, then the ending.',
        value: {
          en: 'A stitch in time saves | nine\nBetter late than | never\nActions speak louder than | words\nThe early bird catches the | worm\nMany hands make light | work\nEvery cloud has a silver | lining',
          fr: 'Mieux vaut tard que | jamais\nPetit à petit, l’oiseau fait son | nid\nAprès la pluie, le beau | temps\nIl n’y a pas de fumée sans | feu\nL’habit ne fait pas le | moine\nLa nuit porte | conseil',
          de: 'Morgenstund hat Gold im | Mund\nÜbung macht den | Meister\nBesser spät als | nie\nDer Apfel fällt nicht weit vom | Stamm\nReden ist Silber, Schweigen ist | Gold\nViele Köche verderben den | Brei' } }
    ]),
    start: function (L) {
      var own = L.lines('sayings').map(function (l) { var p = l.split('|'); return p.length < 2 ? null : { start: p[0].trim(), end: p[1].split('/')[0].trim() }; })
        .filter(function (s) { return s && s.start && s.end; });
      var batch = L.text('daily') === 'off' ? null
        : dailyBatch('sayings', dailyOpts(L, { level: L.text('level') === 'gentle' ? 'gentle' : 'usual', own: ownText('sayings', 'sayings') ? own : [] }));
      var list = batch ? batch.map(function (s) { return { id: s.id, start: s.start, end: s.end, wrong: s.wrong || [] }; }) : own;
      if (batch) L.log('Sayings of ' + batch.date + ' (' + batch.src + ')', 'daily');
      if (!list.length) list = [{ start: L.t('Better late than'), end: L.t('never') }];
      var EXTRA = ['house', 'door', 'river', 'light', 'song', 'table'].map(function (w) { return L.t(w); });
      function options(i) {
        /* The day's sayings bring their own wrong endings (one at the easier level: two buttons). */
        if (list[i].wrong && list[i].wrong.length) return shuffle([{ w: list[i].end, ok: true }].concat(list[i].wrong.slice(0, 2).map(function (w) { return { w: w, ok: false }; })));
        var right = list[i].end.toLowerCase();
        var pool = shuffle(list.map(function (s) { return s.end; }).filter(function (w, k) { return k !== i && w.toLowerCase() !== right; }));
        /* German nouns are capitalised, so the right answer is compared without case (the English extras are lower case). */
        EXTRA.forEach(function (w) { if (pool.indexOf(w) < 0 && w.toLowerCase() !== right) pool.push(w); });
        var wrong = [];
        pool.forEach(function (w) { if (wrong.length < 2 && wrong.indexOf(w) < 0) wrong.push(w); });
        return shuffle([{ w: list[i].end, ok: true }].concat(wrong.map(function (w) { return { w: w, ok: false }; })));
      }
      function saying(i, lead) {
        var s = list[i], opts = options(i), tries = 0, sp = glue(s.start);
        var st = {
          id: 'saying-' + (i + 1), eyebrow: L.t('Finish the saying · {n} of {total}', { n: i + 1, total: list.length }), back: false, fastVoice: true,
          say: function () {
            return (lead || '') + (i === 0 ? L.t('Let us finish some sayings together. I say the beginning, and you choose the ending.') : L.t('Next one.')) + ' ' + s.start + ' …';
          }
        };
        function card(revealed) {
          return '<div class="sayingcard"><p class="saytext">' + esc(s.start) + sp + '<span class="blank' + (revealed ? ' shown' : '') + '">' + (revealed ? esc(s.end) : '&nbsp;') + '</span></p></div>';
        }
        function reveal(how) {
          st.body = card(true); st.choices = []; st.fastVoice = false;
          st.actions = [{ label: i + 1 < list.length ? L.t('Next saying') : L.t('Finish'), primary: true, gesture: 'open', words: ['next', 'continue', 'another', 'yes', 'ok', 'okay', 'finish'], noLabelWords: true, run: next }];
          L.refresh();
          if (how === 'right') L.say(L.t(PRAISE[i % PRAISE.length]) + ' ' + s.start + sp + s.end + '.', next);
          else L.say(L.t('The answer is {end}.', { end: s.end }) + ' ' + s.start + sp + s.end + '.');
        }
        function next() { if (L.step() !== st) return; if (i + 1 < list.length) L.go(saying(i + 1), { replace: true }); else L.finish(); }
        st.body = card(false);
        st.choices = opts.map(function (o) {
          var c = { label: o.w, words: [o.w], noLabelWords: true, run: function () {
            if (o.ok) {
              L.stat(tries === 0 ? 'rightFirstTry' : 'rightAfterRetry');
              L.log('Saying finished: ' + s.start + sp + s.end + (tries === 0 ? ' (first try)' : ' (after ' + tries + ' not quite)'), 'result', s.id ? { daily: 'sayings', item: s.id } : undefined);
              reveal('right');
            } else {
              tries++; c.disabled = true; L.stat('notQuite');
              L.refresh();
              L.say(L.t('Not quite. Try again.'));
            }
          } };
          return c;
        });
        st.actions = [
          { label: L.t('Show answer'), gesture: 'open', words: ['answer', 'show answer', 'show', 'tell me', 'give up', 'dont know', 'no idea'], noLabelWords: true, run: function () { L.stat('answersShown'); reveal('shown'); } }
        ];
        return st;
      }
      return saying(0);
    }
  });

  /* ---------- Activity 4: Guess the Song ---------- */
  var BUILTIN_KIND = { children: 'Children’s songs', classical: 'Classical tunes' };
  var KIND_ICONS = [ART.icon.cheerful, ART.icon.classical, ART.icon.note, ART.icon.calm];
  var TENS = { 2: 'twenties', 3: 'thirties', 4: 'forties', 5: 'fifties', 6: 'sixties', 7: 'seventies', 8: 'eighties', 9: 'nineties' };
  /* How people say a decade: "the sixties", "60s", "1960s", "nineteen sixties". */
  function decadeWords(d) {
    var y = parseInt(d, 10), w = [d, String(y)];
    if (y < 2000) { var t = TENS[(y % 100) / 10]; w.push(String(y).slice(2) + 's'); if (t) w.push(t, 'nineteen ' + t); }
    else if (y === 2000) w.push('two thousands', 'noughties', 'two thousand');
    else if (y === 2010) w.push('twenty tens', 'tens', 'twenty ten');
    else if (y === 2020) w.push('twenty twenties', 'twenty twenty');
    return w;
  }
  /* "1960s" without its "s", for "the {year}s" / "les années {year}" / "die {year}er". */
  function decadeYear(d) { return String(d).replace(/s$/, ''); }
  Lab.define({
    key: 'song', day: 4, name: 'Guess the Song', zone: 'DINING_BAY',
    flow: 'Short clips: the patient’s own songs, or the built-in tunes (all long out of copyright). Choose the kind of music or the decade, then the song, on large cards.',
    learn: 'Audio quality, interaction energy and volume controls.',
    art: function () { return ART.music; },
    content: [
      { id: 'clips', label: 'The patient’s songs', type: 'audios', slot: 'clips', cols: ['title', 'kind', 'decade'] },
      { id: 'source', hide: true, label: 'Songs come from', type: 'select', value: 'auto',
        options: [['auto', 'The patient’s songs if there are any, otherwise the built-in tunes'], ['clips', 'The patient’s songs only'], ['builtin', 'Built-in tunes only'], ['both', 'Both together']] },
      { id: 'rounds', label: 'Songs per session', type: 'number', min: 1, max: 6, value: '3' },
      { id: 'seconds', label: 'Play each song for (seconds)', type: 'number', min: 5, max: 60, value: '15' }
    ],
    start: function (L) {
      var rounds = Math.max(1, Math.min(6, parseInt(L.text('rounds'), 10) || 3));
      var seconds = Math.max(5, Math.min(60, parseInt(L.text('seconds'), 10) || 15));
      var source = L.text('source') || 'auto';
      var own = L.audios('clips');
      var built = Music.SONGS.filter(function (s) { return s.cat !== 'special'; }).map(function (s) { return { id: s.id, title: s.title, kind: BUILTIN_KIND[s.cat], decade: '', song: s }; });
      var all = source === 'builtin' ? built : source === 'both' ? own.concat(built) : own.length ? own : built;
      if (source === 'clips' && !own.length) L.log('This patient has no songs yet, so the built-in tunes are used', 'error');
      L.stat('source', all === built ? 'built-in tunes' : source === 'both' ? 'own songs and built-in tunes' : 'own songs (' + own.length + ')');

      function counted(key) {
        var c = {};
        all.forEach(function (s) { if (s[key]) c[s[key]] = (c[s[key]] || 0) + 1; });
        return Object.keys(c).sort(function (a, b) { return c[b] - c[a] || (a < b ? -1 : 1); });
      }
      var kinds = counted('kind'), decades = counted('decade');

      function how() {
        var ch = [];
        if (kinds.length >= 2) ch.push({ label: L.t('By kind of music'), icon: ART.icon.note, words: ['kind', 'kind of music', 'type', 'style', 'genre'], noLabelWords: true, run: function () { L.go(kindStep()); } });
        ch.push({ label: L.t('By decade'), icon: ART.icon.calendar, words: ['decade', 'year', 'years', 'time', 'era'], noLabelWords: true, run: function () { L.go(decadeStep()); } });
        ch.push({ label: L.t('Surprise me'), icon: ART.icon.cheerful, words: ['surprise', 'anything', 'any', 'dont mind', 'you choose', 'mix'], noLabelWords: true, run: function () { begin(null, 'surprise'); } });
        return {
          id: 'how', eyebrow: L.t('Guess the song'), title: L.t('How shall we choose the songs?'), back: false, pic: ART.music,
          say: function () { return L.t('How shall we choose the songs?'); },
          choices: ch
        };
      }
      function kindStep() {
        var ch = kinds.slice(0, 3).map(function (k, i) {
          var icon = k === BUILTIN_KIND.children ? ART.icon.cheerful : k === BUILTIN_KIND.classical ? ART.icon.classical : KIND_ICONS[(i + 2) % KIND_ICONS.length];
          var words = k === BUILTIN_KIND.children ? ['children', 'childrens', 'nursery', 'kids', 'folk'] : k === BUILTIN_KIND.classical ? ['classical', 'classic', 'beethoven', 'mozart'] : [];
          return { label: L.t(k), icon: icon, words: words, run: function () { begin(function (s) { return s.kind === k; }, 'kind: ' + k); } };
        });
        if (ch.length < 4) ch.push({ label: kinds.length === 2 ? L.t('A mix of both') : L.t('A mix of everything'), icon: ART.icon.note, words: ['mix', 'mixed', 'both', 'everything', 'anything', 'surprise'], noLabelWords: true, run: function () { begin(null, 'kind: mix'); } });
        return {
          id: 'kind', eyebrow: L.t('Guess the song'), title: L.t('Which songs shall we play?'), back: decades.length >= 2, pic: ART.music,
          say: function () { return L.t('Which songs shall we play?'); },
          choices: ch
        };
      }
      function decadeStep() {
        var ch = decades.slice(0, 4).sort().map(function (d) {
          return { label: L.t('The {year}s', { year: decadeYear(d) }), icon: ART.icon.calendar, words: decadeWords(d), noLabelWords: true, run: function () { begin(function (s) { return s.decade === d; }, 'decade: ' + d); } };
        });
        if (ch.length < 4) ch.push({ label: L.t('Any decade'), icon: ART.icon.note, words: ['any', 'any decade', 'mix', 'anything', 'surprise', 'dont mind'], noLabelWords: true, run: function () { begin(null, 'decade: any'); } });
        return {
          id: 'decade', eyebrow: L.t('Guess the song'), title: L.t('Which decade shall we play?'), pic: ART.music,
          say: function () { return L.t('Which decade shall we play?'); },
          choices: ch
        };
      }
      function begin(filter, label) {
        L.stat('category', label);
        var set = filter ? all.filter(filter) : all;
        if (!set.length) set = all;
        var picks = shuffle(set).slice(0, Math.min(rounds, set.length));
        L.go(round(picks, 0, set), { clear: true });
      }
      /* Two other titles for the answer cards: from the same choice first, then from everything. */
      function others(song, set) {
        var seen = {}, out = [];
        seen[song.title.toLowerCase()] = 1;
        [shuffle(set), shuffle(all), shuffle(built)].forEach(function (list) {
          list.forEach(function (s) { var k = s.title.toLowerCase(); if (out.length < 2 && !seen[k]) { seen[k] = 1; out.push(s); } });
        });
        return out;
      }
      function round(picks, i, set) {
        var song = picks[i], opts = shuffle([song].concat(others(song, set))), plays = 0;
        function play() {
          plays++;
          L.music(song.clip ? song : song.song, { seconds: seconds, onEnd: function () {
            L.say(L.t('Which song is it?'));
          } });
        }
        return {
          id: 'song-' + (i + 1), eyebrow: L.t('Guess the song · {n} of {total}', { n: i + 1, total: picks.length }), title: L.t('Which song is it?'), back: false, pic: ART.music,
          say: L.t('Song {n}. Listen.', { n: i + 1 }), afterSay: play,
          choices: opts.map(function (s) {
            return { label: songTitle(L, s), run: function () {
              L.stopMusic();
              var right = s.title === song.title;
              L.stat(right ? 'songsRight' : 'songsOther');
              L.log('Guess: ' + s.title + (right ? ' (right)' : ' (it was ' + song.title + ')') + ', heard ' + plays + 'x' + (song.clip ? ', own song' : ''), 'result');
              L.go(answer(picks, i, set, right), { replace: true });
            } };
          }),
          actions: [
            { label: L.t('Play again'), gesture: 'thumb', words: ['again', 'play again', 'repeat', 'once more', 'one more time'], noLabelWords: true, run: function () { L.stat('replays'); play(); } }
          ]
        };
      }
      function answer(picks, i, set, right) {
        var song = picks[i], last = i + 1 >= picks.length, title = songTitle(L, song), canSing = !song.clip && !!lyricsFor(L, song.id);
        var about = [song.decade ? L.t('the {year}s', { year: decadeYear(song.decade) }) : '', song.clip ? L.t(song.kind) : ''].filter(Boolean).join(' · ');
        return {
          id: 'answer-' + (i + 1), eyebrow: L.t('Guess the song · {n} of {total}', { n: i + 1, total: picks.length }), title: right === true ? L.t('Yes, that was it!') : L.t('It was this song:'),
          lead: title + (about ? ' (' + about + ')' : ''), pic: ART.music, back: false, noHistory: true,
          say: right === true ? L.t('Yes! That was {title}. Well done.', { title: title }) : right === false ? L.t('Good guess. It was {title}.', { title: title }) : L.t('That was {title}.', { title: title }),
          actions: [
            { label: last ? L.t('Finish') : L.t('Next song'), primary: true, gesture: 'open', words: ['next', 'next song', 'yes', 'continue', 'ok', 'okay', 'finish'], noLabelWords: true,
              run: function () { if (last) L.finish(); else L.go(round(picks, i + 1, set), { replace: true }); } },
            { label: L.t('Play it again'), gesture: 'thumb', words: ['again', 'play again', 'repeat', 'once more'], noLabelWords: true, run: function () { L.stat('replays'); L.music(song.clip ? song : song.song, { seconds: seconds }); } }
          ].concat(canSing ? [{ label: L.t('Sing along'), icon: ART.icon.note, words: ['sing', 'sing along', 'sing it', 'together'], noLabelWords: true, run: function () { L.go(sing(picks, i, set), { replace: true }); } }] : [])
        };
      }
      /* The words on the screen, the melody a little slower, the line being sung lit up. */
      function sing(picks, i, set) {
        var song = picks[i], last = i + 1 >= picks.length, lines = lyricsFor(L, song.id), title = songTitle(L, song);
        L.stat('singAlongs');
        return {
          id: 'sing-' + (i + 1), eyebrow: L.t('Guess the song · {n} of {total}', { n: i + 1, total: picks.length }), title: L.t('Sing along: {title}', { title: title }),
          back: false, noHistory: true, pic: ART.music, body: lyricsHtml(lines),
          say: L.t('Let us sing it together.'), afterSay: function () { singAlong(L, { song: song.song, lines: lines, tempo: 0.85 }); },
          actions: [
            { label: last ? L.t('Finish') : L.t('Next song'), primary: true, gesture: 'open', words: ['next', 'next song', 'yes', 'continue', 'ok', 'okay', 'finish'], noLabelWords: true,
              run: function () { L.stopMusic(); if (last) L.finish(); else L.go(round(picks, i + 1, set), { replace: true }); } },
            { label: L.t('Sing again'), gesture: 'thumb', words: ['again', 'sing again', 'once more'], noLabelWords: true, run: function () { L.stopMusic(); singAlong(L, { song: song.song, lines: lines, tempo: 0.85 }); } }
          ]
        };
      }
      if (decades.length >= 2) return how();
      if (kinds.length >= 2) return kindStep();
      L.stat('category', 'all');
      return round(shuffle(all).slice(0, Math.min(rounds, all.length)), 0, all);
    }
  });

  /* ---------- Activity 5: Seated Move Along → js/move.js (1.16) ----------
     Rebuilt in its own file: a part of the body chosen, new movements every day, drawings that move
     and optional official videos. */

  /* ---------- Activity 6: Picture Pair ----------
     A classic memory game in levels (1.17). Every card starts face down: the participant turns two
     at a time. A pair stays open; two cards that do not match turn back after a calm moment.
     After five misses Bellatrix offers to show the cards for 3 seconds. */
  var PAIR_NAMES = { sun: 'sun', heart: 'heart', star: 'star', tree: 'tree', house: 'house', cup: 'cup', fish: 'fish', moon: 'moon', apple: 'apple', boat: 'boat', leaf: 'leaf', key: 'key' };
  var PAIR_LEVELS = [2, 3, 4, 6];           /* pairs per level: 4, 6, 8 and 12 cards */
  var PAIR_MISSES_BEFORE_HELP = 5, PAIR_PEEK_MS = 3000, PAIR_TURN_BACK_MS = 2500;
  var CARD_BACK = '<span class="cback" aria-hidden="true"></span>';
  Lab.define({
    key: 'pairs', day: 6, name: 'Picture Pair', zone: 'ROSE_ROOM',
    flow: 'A memory game in four levels (4, 6, 8, then 12 cards): the cards are face down, turn two at a time and find the pairs by touch or by pointing in the air; staff may tap for a participant.',
    learn: 'Touch targets, response time, memory load per level and assistance pattern.',
    art: function () { return ART.pairs; },
    air: true,
    content: [
      { id: 'pairs', label: 'The patient’s own pictures', type: 'images', slot: 'pairs',
        note: 'Optional: up to six pictures the patient knows (for example familiar objects). Missing ones are filled with the built-in symbols.' },
      { id: 'start', label: 'Start at level', type: 'select', value: '1',
        options: [['1', 'Level 1 · 2 pairs (4 cards)'], ['2', 'Level 2 · 3 pairs (6 cards)'], ['3', 'Level 3 · 4 pairs (8 cards)'], ['4', 'Level 4 · 6 pairs (12 cards)']] },
      { id: 'top', hide: true, label: 'Highest level', type: 'select', value: '4',
        options: [['1', 'Level 1 · 4 cards'], ['2', 'Level 2 · 6 cards'], ['3', 'Level 3 · 8 cards'], ['4', 'Level 4 · 12 cards']] }
    ],
    start: function (L) {
      L = safe(L);
      var TOP = Math.max(1, Math.min(PAIR_LEVELS.length, parseInt(L.text('top'), 10) || PAIR_LEVELS.length));
      var FIRST = Math.max(1, Math.min(TOP, parseInt(L.text('start'), 10) || 1));
      var own = L.images('pairs').map(function (m) { return { k: m.id, name: m.title || 'picture', art: '<img class="own" src="' + m.url + '" alt="">' }; });
      var builtin = Object.keys(ART.pair).map(function (k) { return { k: k, name: PAIR_NAMES[k], art: ART.pair[k] }; });
      var shownAgain = 0;
      L.stat('pictures', own.length ? 'own (' + own.length + ')' : 'built-in');
      /* The patient's own pictures first, the built-in symbols for the rest. */
      function pictures(n) { return shuffle(own).slice(0, n).concat(shuffle(builtin)).slice(0, n); }
      function intro() {
        return {
          id: 'intro', eyebrow: L.t('Picture Pair'), title: L.t('A memory game'), pic: ART.pairs, back: false, airPointer: true,
          actions: [{ label: L.t('Let’s start'), primary: true, gesture: 'open', words: ['start', 'begin', 'yes', 'ready', 'ok', 'okay', 'go'], noLabelWords: true, run: function () { L.go(level(FIRST), { clear: true }); } }]
        };
      }
      function level(n) {
        var pairs = PAIR_LEVELS[n - 1];
        /* Every card starts face down: nothing is shown before the patient turns a card. */
        var cards = shuffle(pictures(pairs).reduce(function (all, p) { return all.concat([p, p]); }, [])).map(function (p) { return { p: p, up: false, done: false, turn: false }; });
        var first = null, busy = false, misses = 0, missesSinceHelp = 0, peeks = 0, t0 = Date.now(), lastPair = t0;
        var showAgain = { label: L.t('Show me the cards'), gesture: 'thumb', words: ['show', 'show me', 'again', 'show the cards', 'help'], noLabelWords: true, run: function () { peek(); } };
        var skip = { label: L.t('Skip this level'), gesture: 'fist', skip: true, words: ['skip', 'pass', 'next level'], noLabelWords: true, run: function () { L.stat('roundsSkipped'); L.log('Level ' + n + ' skipped', 'result'); L.go(between(n, false), { replace: true }); } };
        var st = {
          id: 'pairs-' + n, eyebrow: L.t('Picture Pair · Level {n} of {top}', { n: n, top: TOP }), style: 'grid', gridCls: 'g' + cards.length, back: false, airPointer: true,
          title: L.t('Find the pairs'),
          say: function () {
            return L.t('Level {n}. {pairs} pairs.', { n: n, pairs: pairs }) + ' ' +
              (L.air() ? L.t('The cards are face down. Point at a card to turn it over, then find its partner.') : L.t('The cards are face down. Tap a card to turn it over, then find its partner.'));
          },
          free: function (t) {
            var nums = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
            var picked = t.split(' ').map(function (w) { return nums[w]; }).filter(function (k) { return k && k <= cards.length; });
            if (!picked.length) return false;
            picked.slice(0, 2).forEach(function (k, j) { setTimeout(function () { Lab._t.choose(k - 1, 'voice'); }, j * 700); });
            return true;
          }
        };
        function setPlay() {
          st.hint = (L.air() ? L.t('Point at a card, then at the one that matches.') : L.t('Tap a card, then the one that matches.')) + (L.voice() ? ' ' + L.t('Or say two numbers, like one and four.') : '');
          st.reprompt = L.t('Choose a card, then the one that matches.');
          st.actions = missesSinceHelp >= PAIR_MISSES_BEFORE_HELP ? [showAgain, skip] : [skip];
        }
        function build() {
          st.choices = cards.map(function (c, i) {
            var shown = c.up || c.done;
            return {
              label: shown ? L.t('Card {n}, {name}', { n: i + 1, name: L.t(c.p.name) }) : L.t('Card {n}, face down', { n: i + 1 }), art: shown ? c.p.art : CARD_BACK,
              cls: (c.done ? 'found' : (shown ? 'up' : 'back')) + (c.wrong ? ' wrong' : '') + (c.turn ? ' turn' : ''),
              disabled: c.done, run: function () { tap(i); }
            };
          });
          cards.forEach(function (c) { c.turn = false; });
        }
        function redraw() { build(); L.refresh(); }
        function peek() {
          if (busy) return;
          peeks++; shownAgain++; L.stat('peeks', shownAgain);
          L.log('Cards shown again (level ' + n + ')', 'result');
          busy = true; missesSinceHelp = 0; first = null;
          cards.forEach(function (c) { if (!c.done) { c.up = true; c.turn = true; c.wrong = false; } });
          setPlay(); redraw();
          L.say(L.t('Here are the cards. Look carefully.'));
          L.later(function () {
            cards.forEach(function (c) { if (!c.done) { c.up = false; c.turn = true; } });
            busy = false; redraw();
          }, PAIR_PEEK_MS);
        }
        function tap(i) {
          var c = cards[i];
          if (busy || c.done || c.up) return;
          c.up = true; c.turn = true;
          if (first === null) { first = i; redraw(); return; }
          var a = cards[first], now = Date.now();
          first = null;
          if (a.p.k === c.p.k) {
            a.done = c.done = true;
            L.push('pairSeconds', Math.round((now - lastPair) / 100) / 10);
            lastPair = now;
            L.log('Pair found: ' + c.p.name, 'result');
            redraw();
            if (cards.every(function (x) { return x.done; })) {
              L.stat('roundsDone'); L.stat('levelReached', n);
              L.push('roundSeconds', Math.round((now - t0) / 1000));
              L.log('Level ' + n + ' done: ' + misses + ' misses, cards shown again ' + peeks + 'x', 'result');
              L.say(L.t('Well done. You found all the pairs.'));
              L.later(function () { L.go(between(n, true), { replace: true }); }, 1800);
            } else { L.ack(L.t('A pair. Well done!')); L.say(L.t('A pair. Well done.')); }
          } else {
            misses++; missesSinceHelp++; L.stat('notAPair');
            a.wrong = c.wrong = true; busy = true;
            redraw();
            var offer = missesSinceHelp === PAIR_MISSES_BEFORE_HELP;
            L.say(L.t('Not quite. Try again.'));
            L.later(function () {
              a.wrong = c.wrong = false; a.up = c.up = false; a.turn = c.turn = true; busy = false;
              setPlay(); redraw();
            }, PAIR_TURN_BACK_MS);
          }
        }
        setPlay(); build();
        st.body = ACK;
        return st;
      }
      function between(n, done) {
        var next = n + 1 <= TOP ? n + 1 : 0, acts = [];
        if (next) acts.push({ label: L.t('Next level · {cards} cards', { cards: PAIR_LEVELS[next - 1] * 2 }), primary: true, gesture: 'open', words: ['next', 'next level', 'yes', 'more', 'ok', 'okay', 'go on'], noLabelWords: true, run: function () { L.go(level(next), { replace: true }); } });
        acts.push({ label: L.t('Play this level again'), primary: !next, gesture: 'thumb', words: ['again', 'same', 'same level', 'play again', 'once more'], noLabelWords: true, run: function () { L.go(level(n), { replace: true }); } });
        acts.push(doneAction(L, L.t('No, I’m done')));
        return {
          id: 'between-' + n, center: true, back: false, noHistory: true, airPointer: true,
          title: done ? (next ? L.t('Level {n} done!', { n: n }) : L.t('You finished every level!')) : L.t('No problem.'),
          lead: next ? L.t('Would you like to try level {n}, with {cards} cards?', { n: next, cards: PAIR_LEVELS[next - 1] * 2 }) : L.t('Would you like to play again?'),
          say: function () {
            return (done ? (next ? L.t('Well done. Level {n} is finished.', { n: n }) + ' ' : L.t('Wonderful. You finished every level.') + ' ') : L.t('No problem.') + ' ') +
              (next ? L.t('Would you like to try level {n}, with {cards} cards?', { n: next, cards: PAIR_LEVELS[next - 1] * 2 }) : L.t('Would you like to play again?'));
          },
          actions: acts
        };
      }
      return intro();
    }
  });

  /* ---------- Activity 7: Daily Choice ----------
     15 Nov: hidden (Rahma: it does almost the same as the meal ordering, "Menu", js/meals.js). The code stays: no tile
     on the head, nothing new on the tablet; past sessions and their "to pass on" line still show in Care Team. */
  var DAILY = [
    { id: 'lunch', title: 'What would you like for lunch?', heading: 'Lunch', items: ['Vegetable soup', 'Pasta with tomato sauce', 'Fish with potatoes'], icons: ['soup', 'pasta', 'fish'],
      fr: ['Soupe de légumes', 'Pâtes à la sauce tomate', 'Poisson et pommes de terre'],
      de: ['Gemüsesuppe', 'Nudeln mit Tomatensoße', 'Fisch mit Kartoffeln'] },
    { id: 'afternoon', title: 'What would you like to do this afternoon?', heading: 'Afternoon', items: ['A walk in the garden', 'Music in the community circle', 'A quiet rest'], icons: ['walk', 'musichour', 'rest'],
      fr: ['Une promenade au jardin', 'De la musique dans la salle commune', 'Un moment de repos au calme'],
      de: ['Ein Spaziergang im Garten', 'Musik im Gemeinschaftsraum', 'Eine ruhige Pause'] }
  ];
  Lab.define({
    key: 'choice', hidden: true, day: 7, name: 'Daily Choice', zone: 'DINING_BAY',
    flow: 'Menu-style and activity-style choices with pictures and a confirm screen.',
    learn: 'Operational information clarity; no accidental selections.',
    art: function () { return ART.dining; },
    content: [{ id: 'send', hide: true, label: 'What happens with the choices', type: 'select', value: 'send',
      options: [['send', 'Send them to the care team (shown at the top of Care Team)'], ['practice', 'Practice only: nothing is passed on']] }].concat([].concat.apply([], DAILY.map(function (k) {
      return [{ type: 'heading', label: k.heading }].concat([].concat.apply([], k.items.map(function (item, i) {
        return [
          { id: k.id + (i + 1), label: 'Choice ' + (i + 1), type: 'line', value: { en: item, fr: k.fr[i], de: k.de[i] } },
          { id: k.id + (i + 1) + 'img', label: 'Picture for choice ' + (i + 1), type: 'image', slot: k.id + (i + 1), preview: function () { return ART.icon[k.icons[i]]; }, small: true }
        ];
      })));
    }))),
    start: function (L) {
      var picked = {}, send = String(L.text('send') || 'send') !== 'practice';
      function items(k) {
        var kind = DAILY[k];
        return kind.items.map(function (def, i) {
          var slot = kind.id + (i + 1);
          return { label: L.text(slot) || (L.lang() === 'en' ? def : kind[L.lang()][i]), icon: L.image(slot, ART.icon[kind.icons[i]]) };
        });
      }
      function pick(k) {
        var kind = DAILY[k], list = items(k);
        return {
          id: 'pick-' + kind.id, eyebrow: L.t('Daily choice · {n} of {total}', { n: k + 1, total: DAILY.length }), title: L.t(kind.title), back: false,
          pic: k === 0 ? ART.dining : ART.garden,
          say: function () { return L.t(kind.title); },
          choices: list.map(function (x) { return { label: x.label, icon: x.icon, run: function () { L.go(confirm(k, x), { replace: true }); } }; })
        };
      }
      function confirm(k, x) {
        var kind = DAILY[k];
        return {
          id: 'confirm-' + kind.id, eyebrow: L.t('Daily choice · {n} of {total}', { n: k + 1, total: DAILY.length }), title: L.t('You chose: {choice}', { choice: x.label }), lead: L.t('Is that right?'), back: false,
          body: '<div class="bigicon">' + x.icon + '</div>',
          say: L.t('You chose {choice}.', { choice: x.label }) + ' ' + L.t('Is that right?'),
          actions: [
            { label: L.t('Yes, that’s right'), primary: true, gesture: 'open', words: ['yes', 'right', 'correct', 'thats right', 'ok', 'okay', 'yeah', 'sure'], noLabelWords: true,
              run: function () {
                picked[kind.id] = x.label; L.stat(kind.id, x.label); L.log('Confirmed ' + kind.id + ': ' + x.label, 'result');
                if (k + 1 < DAILY.length) L.go(pick(k + 1), { replace: true }); else L.go(summary(), { replace: true });
              } },
            { label: L.t('No, change it'), gesture: 'fist', words: ['no', 'change', 'change it', 'wrong', 'different', 'something else'], noLabelWords: true,
              run: function () { L.stat('changes'); L.log('Changed the ' + kind.id + ' choice at the confirm screen', 'result'); L.go(pick(k), { replace: true }); } }
          ]
        };
      }
      function summary() {
        var text = L.t('Your choices: {lunch} for lunch, and {afternoon} this afternoon.', { lunch: picked.lunch, afternoon: inSentence(L, picked.afternoon, true) });
        /* Sent: the Care Team app shows the choices at the top until someone marks them as passed on. */
        if (send) { L.stat('choicesSent', true); L.log('Choices sent to the care team', 'result'); }
        return {
          id: 'summary', title: L.t('Thank you'), lead: text + ' ' + (send ? L.t('The care team can see your choices now.') : L.t('I will pass this on to the care team.')), center: true, back: false, noHistory: true,
          say: text + ' ' + (send ? L.t('The care team can see your choices now.') : L.t('I will pass this on to the care team.')),
          body: send ? '' : '<p class="note">' + esc(L.t('Practice only: nothing has been ordered.')) + '</p>',
          actions: [{ label: L.t('Finish'), primary: true, gesture: 'open', words: ['finish', 'ok', 'okay', 'thanks', 'thank you', 'done'], noLabelWords: true, run: function () { L.finish(); } }]
        };
      }
      return pick(0);
    }
  });

  /* ---------- Activity 8: My Music Moment, removed (1.16) ----------
     It did the same as Bellatrix Play (js/play.js), which plays calm, cheerful or classical music. */

  /* ---------- Activity 10: Kindness Quiz ---------- */
  Lab.define({
    key: 'quiz', hidden: true, day: 10, name: 'Kindness Quiz', zone: 'COMMUNITY_CIRCLE',
    flow: 'A light, non-clinical quiz about kindness, new questions every day, with no wrong answers.',
    learn: 'End-to-end group format and scalable facilitation.',
    art: function () { return ART.kind; },
    againQuestion: 'Would you like to do this quiz again another time?',
    /* 1.16: new questions every day from js/daily.js (every answer is a good one); the team's own
       questions, when it wrote some, come first, two a day in turn. "No" keeps only the list. */
    content: dailyFields().concat([
      { id: 'questions', label: 'Questions', type: 'text', rows: 6, note: 'One per line: the question | three answers split by / | what Bellatrix says after any answer.',
        value: {
          en: 'What can make someone’s day brighter? | A smile / A kind word / A small surprise | All of those are lovely. A smile is a gift anyone can give.\n' +
            'What is a kind thing to do for a neighbour? | Say good morning / Share a cake / Help carry a bag | Wonderful ideas. Small things often mean the most.\n' +
            'Which kind words do you like to hear? | Thank you / Well done / Good to see you | Lovely. Kind words stay with people for a long time.\n' +
            'How can we welcome someone new? | Learn their name / Show them around / Invite them for tea | Great choices. Feeling welcome makes a new place feel like home.\n' +
            'What could we do together as a group? | Sing a song / Share a story / Plant some flowers | Lovely. Doing things together brings people closer.',
          fr: 'Qu’est-ce qui peut égayer la journée de quelqu’un ? | Un sourire / Un mot gentil / Une petite surprise | Tout cela est très beau. Un sourire est un cadeau que chacun peut offrir.\n' +
            'Quelle gentillesse peut-on faire pour un voisin ? | Dire bonjour / Partager un gâteau / Aider à porter un sac | De belles idées. Ce sont souvent les petites attentions qui comptent le plus.\n' +
            'Quels mots gentils aimez-vous entendre ? | Merci / Bravo / Quel plaisir de vous voir | C’est beau. Les mots gentils restent longtemps dans le cœur.\n' +
            'Comment accueillir quelqu’un de nouveau ? | Retenir son prénom / Lui faire visiter les lieux / L’inviter à prendre un café | Excellentes idées. Quand on se sent bienvenu, un nouveau lieu devient vite un chez-soi.\n' +
            'Que pourrions-nous faire ensemble, en groupe ? | Chanter une chanson / Partager une histoire / Planter des fleurs | C’est beau. Faire des choses ensemble rapproche les gens.',
          de: 'Was kann den Tag eines Menschen schöner machen? | Ein Lächeln / Ein freundliches Wort / Eine kleine Überraschung | Das ist alles wunderbar. Ein Lächeln ist ein Geschenk, das jeder machen kann.\n' +
            'Was ist eine nette Geste für einen Nachbarn? | Guten Morgen sagen / Einen Kuchen teilen / Beim Tragen helfen | Wunderbare Ideen. Kleine Dinge bedeuten oft am meisten.\n' +
            'Welche freundlichen Worte hören Sie gern? | Danke / Gut gemacht / Schön, Sie zu sehen | Wie schön. Freundliche Worte bleiben lange in Erinnerung.\n' +
            'Wie können wir jemanden willkommen heißen, der neu ist? | Sich den Namen merken / Alles zeigen / Zum Kaffee einladen | Gute Ideen. Wer sich willkommen fühlt, ist an einem neuen Ort schnell zu Hause.\n' +
            'Was könnten wir gemeinsam als Gruppe tun? | Ein Lied singen / Eine Geschichte erzählen / Blumen pflanzen | Schön. Gemeinsame Erlebnisse bringen Menschen näher zusammen.' } }
    ]),
    start: function (L) {
      var qs = L.lines('questions').map(function (l) {
        var p = l.split('|');
        if (p.length < 2) return null;
        var answers = p[1].split('/').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 3);
        return answers.length ? { q: p[0].trim(), a: answers, r: (p[2] || L.t('Lovely choice.')).trim() } : null;
      }).filter(Boolean);
      var batch = L.text('daily') === 'off' ? null : dailyBatch('quiz', dailyOpts(L, { level: L.text('level') === 'gentle' ? 'gentle' : 'usual' }));
      if (batch) {
        /* The team's own questions (when it wrote some): two a day, in turn, before the day's ones. */
        var mine = [];
        if (ownText('quiz', 'questions') && qs.length) {
          var at = Math.floor(Date.now() / 864e5) * 2 % qs.length;
          mine = qs.slice(at).concat(qs.slice(0, at)).slice(0, Math.min(2, qs.length));
        }
        qs = mine.concat(batch.map(function (x) { return { id: x.id, q: x.q, a: x.a, r: x.r || L.t('Lovely choice.') }; })).slice(0, Math.max(batch.length, mine.length));
        L.log('Kindness quiz of ' + batch.date + ' (' + batch.src + ')', 'daily');
      }
      function intro() {
        return {
          id: 'intro', eyebrow: L.t('Kindness quiz'), title: L.t('There are no wrong answers'), pic: ART.kind, back: false,
          actions: [{ label: L.t('Let’s start'), primary: true, gesture: 'open', words: ['start', 'begin', 'yes', 'ready', 'ok', 'okay', 'go'], noLabelWords: true, run: function () { L.go(question(0), { clear: true }); } }]
        };
      }
      function question(i) {
        var q = qs[i];
        return {
          id: 'q' + (i + 1), eyebrow: L.t('Question {n} of {total}', { n: i + 1, total: qs.length }), title: q.q, back: false, pic: ART.kind,
          say: function () { return q.q; },
          choices: q.a.map(function (label) {
            return { label: label, run: function () { L.push('answers', { q: i + 1, a: label }); L.go(feedback(i, label), { replace: true }); } };
          })
        };
      }
      function feedback(i, label) {
        var last = i + 1 >= qs.length;
        return {
          id: 'feedback-' + (i + 1), title: L.t('Lovely choice: {answer}', { answer: label }), lead: qs[i].r, center: true, back: false, noHistory: true,
          say: L.t('Lovely choice.') + ' ' + qs[i].r,
          actions: [{ label: last ? L.t('Finish') : L.t('Next question'), primary: true, gesture: 'open', words: ['next', 'continue', 'yes', 'ok', 'okay', 'finish'], noLabelWords: true, run: function () { next(i); } }]
        };
      }
      function next(i) { if (i + 1 < qs.length) L.go(question(i + 1), { replace: true }); else L.finish(); }
      return qs.length ? intro() : null;
    }
  });
})();
