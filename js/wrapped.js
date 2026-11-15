/* The monthly summary of a resident (version 1.11), in the spirit of a music service's year in review:
   the last 30 days with Bellatrix in a few big numbers, the mood after the activities, what does the
   most good, the music they loved, the family calls and the games. It is written in the resident's
   language (for the family) and built only from what this device already keeps (Results, the life
   story, the Bellatrix Play favourites). It uses the patient code, never the greeting name. */
var Wrapped = (function () {
  'use strict';
  var esc = Lab.esc;
  function store() { try { return JSON.parse(localStorage.getItem('bellatrix-care-lab-v1') || '{}') || {}; } catch (e) { return {}; } }
  function taste(code) { try { return (JSON.parse(localStorage.getItem('bellatrix-play-taste') || '{}') || {})[code] || {}; } catch (e) { return {}; } }

  function build(code) {
    var st = store(), p = (st.patients || {})[code] || { prefs: {} }, pr = p.prefs || {}, life = pr.life || {};
    var lang = I18N.valid(pr.lang), T = function (k, v) { return I18N.t(lang, k, v); };
    var since = Date.now() - 30 * 86400000;
    var S = (st.sessions || []).filter(function (s) { return s.participant === code && !s.preview && !s.notStarted && new Date(s.startedAt).getTime() >= since; });
    var minutes = Math.round(S.reduce(function (n, s) { return n + (s.durationS || 0); }, 0) / 60);
    var days = {};
    S.forEach(function (s) { days[String(s.startedAt).slice(0, 10)] = 1; });
    var by = {};
    S.forEach(function (s) { var k = s.activityName || s.activity; by[k] = (by[k] || 0) + 1; });
    var top = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }).slice(0, 3);
    /* Mood: before and after, and which activity raises it most. */
    var pairs = S.filter(function (s) { return s.mood && s.mood.before && s.mood.after; });
    var better = pairs.filter(function (s) { return s.mood.after > s.mood.before; }).length;
    var same = pairs.filter(function (s) { return s.mood.after === s.mood.before; }).length;
    var lift = {};
    pairs.forEach(function (s) { var k = s.activityName || s.activity; lift[k] = lift[k] || { d: 0, n: 0 }; lift[k].d += s.mood.after - s.mood.before; lift[k].n++; });
    var bestAct = Object.keys(lift).sort(function (a, b) { return lift[b].d / lift[b].n - lift[a].d / lift[a].n; })[0];
    /* Music, family, games. */
    var play = S.filter(function (s) { return s.stats && s.stats.playItems; });
    var playMin = Math.round(play.reduce(function (n, s) { return n + (s.stats.playMinutes || 0); }, 0));
    var playN = play.reduce(function (n, s) { return n + (s.stats.playItems || 0); }, 0);
    var liked = [];
    var t = taste(code);
    Object.keys(t).map(function (id) { return t[id]; }).filter(function (x) { return x.s >= 2; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 5)
      .forEach(function (x) { liked.push((x.a ? x.a + ' – ' : '') + x.t); });
    var calls = S.filter(function (s) { return s.activity === 'familycall' && s.stats && s.stats.callAnswered; });
    var callMin = Math.round(calls.reduce(function (n, s) { return n + (s.stats.callSeconds || 0); }, 0) / 60);
    var who = {};
    calls.forEach(function (s) { if (s.stats.callFrom) who[s.stats.callFrom] = 1; });
    var games = S.filter(function (s) { return s.activity === 'chess' || s.activity === 'ludo' || (s.stats && s.stats.callGames); }).length;
    var puzzles = S.reduce(function (n, s) { return n + ((s.stats && s.stats.chessPuzzlesSolved) || 0); }, 0);

    var today = new Date().toLocaleDateString(I18N.BCP47[lang], { day: 'numeric', month: 'long', year: 'numeric' });
    var head = [life.born ? T('Born in {year}', { year: life.born }) : '', life.home ? T('Childhood: {place}', { place: life.home }) : ''].filter(Boolean).join(' · ');
    function card(cls, body) { return '<section class="c ' + cls + '">' + body + '</section>'; }
    function big(n, label) { return '<div class="big"><b>' + esc(String(n)) + '</b><span>' + esc(label) + '</span></div>'; }
    var cards = [];
    if (!S.length) cards.push(card('c0', '<p class="lead">' + esc(T('No activity in the last 30 days.')) + '</p>'));
    else {
      cards.push(card('c1', '<div class="bigs">' + big(S.length, T('moments with Bellatrix')) + big(minutes, T('minutes together')) + big(Object.keys(days).length, T('days with an activity')) + '</div>' +
        (top.length ? '<h2>' + esc(T('Favourite activities')) + '</h2><ol class="rank">' + top.map(function (k) { return '<li>' + esc(T(k)) + '</li>'; }).join('') + '</ol>' : '')));
      cards.push(card('c2', '<h2>' + esc(T('Mood after the activities')) + '</h2>' + (pairs.length
        ? '<div class="bar">' + (better ? '<i class="up" style="flex:' + better + '">' + better + ' ' + esc(T('better')) + '</i>' : '') + (same ? '<i class="eq" style="flex:' + same + '">' + same + ' ' + esc(T('the same')) + '</i>' : '') +
          (pairs.length - better - same ? '<i class="dn" style="flex:' + (pairs.length - better - same) + '">' + (pairs.length - better - same) + ' ' + esc(T('lower')) + '</i>' : '') + '</div>' +
          '<p>' + esc(T('Better or the same after {n} of {total} activities.', { n: better + same, total: pairs.length })) + '</p>' +
          (bestAct && lift[bestAct].d > 0 ? '<p class="best">' + esc(T('What does the most good: {activity}', { activity: T(bestAct) })) + '</p>' : '')
        : '<p>' + esc(T('No mood answers yet.')) + '</p>')));
      if (playN || liked.length) cards.push(card('c3', '<h2>' + esc(T('Music')) + '</h2><p class="lead">' + esc(T('{min} minutes of music, {n} songs and films', { min: playMin, n: playN })) + '</p>' +
        (liked.length ? '<h3>' + esc(T('Favourite songs')) + '</h3><ol class="rank">' + liked.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' : '')));
      cards.push(card('c4', '<h2>' + esc(T('Family')) + '</h2>' + (calls.length
        ? '<p class="lead">' + esc(calls.length === 1 ? T('One video call, {min} minutes', { min: callMin }) : T('{n} video calls, {min} minutes', { n: calls.length, min: callMin })) + '</p>' + (Object.keys(who).length ? '<p>' + esc(T('With {names}', { names: Object.keys(who).join(', ') })) + '</p>' : '')
        : '<p>' + esc(T('No video call in this period.')) + '</p>')));
      if (games || puzzles) cards.push(card('c5', '<h2>' + esc(T('Games')) + '</h2>' + (games ? '<p class="lead">' + esc(games === 1 ? T('One game of chess or Ludo') : T('{n} games of chess or Ludo', { n: games })) + '</p>' : '') +
        (puzzles ? '<p>' + esc(puzzles === 1 ? T('One chess puzzle solved') : T('{n} chess puzzles solved', { n: puzzles })) + '</p>' : '')));
    }
    var html = '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + esc(T('Bellatrix · monthly summary')) + ' · ' + esc(code) + '</title><style>' + CSS + '</style></head><body><main>' +
      '<header><p class="kick">' + esc(T('Bellatrix · monthly summary')) + '</p><h1>' + esc(T('{code} · the last 30 days', { code: code })) + '</h1>' + (head ? '<p class="who">' + esc(head) + '</p>' : '') + '</header>' +
      cards.join('') + '<footer>' + esc(T('Prepared by Bellatrix on {date}. The data stays on the care home’s device.', { date: today })) + '</footer></main></body></html>';
    return { html: html, lang: lang, count: S.length };
  }
  var CSS = 'body{margin:0;background:#FFFFFF;color:#333333;font:17px/1.5 "Roboto Condensed","Arial Narrow",Arial,sans-serif}' +
    'main{max-width:760px;margin:0 auto;padding:28px 18px 40px;display:grid;gap:16px}header{padding:6px 2px}.kick{margin:0;color:#00519E;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:13px}' +
    'h1{margin:4px 0;font-size:34px;line-height:1.1}.who{margin:0;color:#666666}h1,h2,h3{color:#00519E;font-weight:500}h2{margin:0 0 10px;font-size:20px}h3{margin:14px 0 6px;font-size:16px}p{margin:6px 0}' +
    '.c{border-radius:5px;padding:20px 22px;color:#FFFFFF}.c h1,.c h2,.c h3{color:#FFFFFF}.c1{background:#00519E}.c2{background:#003E79}.c3{background:#1565B0}' +
    '.c4{background:#00325F}.c5{background:#17406A}.c0{background:#F0F0F0;color:#333333}.c0 h1,.c0 h2,.c0 h3{color:#00519E}' +
    '.bigs{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px}.big b{display:block;font-size:52px;line-height:1;font-variant-numeric:tabular-nums}.big span{color:inherit;opacity:.9}' +
    '.lead{font-size:22px;font-weight:700}.rank{margin:0;padding-left:24px;font-size:19px}.rank li{margin:3px 0}.best{font-weight:700;font-size:19px}' +
    '.bar{display:flex;height:38px;border-radius:5px;overflow:hidden;font-weight:700;font-size:14px;margin:8px 0}.bar i{display:flex;align-items:center;justify-content:center;font-style:normal;white-space:nowrap;padding:0 8px}' +
    '.bar .up{background:#9FD3F5;color:#00325F}.bar .eq{background:#E0E0E0;color:#333333}.bar .dn{background:#B3261E;color:#FFFFFF}footer{color:#666666;font-size:14px;padding:4px 2px}';

  function save(name, text) {
    if (window.BellatrixApp && window.BellatrixApp.saveFile) {
      var path = window.BellatrixApp.saveFile(name, text);
      Lab.toast(path ? 'Saved on the robot: ' + path : 'This device could not save the file.');
      return;
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/html' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function close() { var o = document.getElementById('wrapOverlay'); if (o) o.remove(); }
  /* Shown over the Care Team page, exactly as the downloaded file looks. */
  function open(code) {
    close();
    var w = build(code);
    var o = document.createElement('div');
    o.id = 'wrapOverlay';
    o.className = 'wrapov';
    o.innerHTML = '<div class="wrapbox" role="dialog" aria-label="Monthly summary"><div class="wraptools"><b>Monthly summary · ' + esc(code) + '</b><span class="note">' +
      (w.count ? w.count + (w.count === 1 ? ' session' : ' sessions') + ' in the last 30 days, in the patient’s language' : 'No session in the last 30 days') + '</span>' +
      '<button type="button" class="go" data-w="save">Download (.html) for the family</button><button type="button" class="ghost" data-w="close">Close</button></div>' +
      '<iframe class="wrapframe" title="Monthly summary"></iframe></div>';
    document.body.appendChild(o);
    o.querySelector('iframe').srcdoc = w.html;
    o.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-w]') : null;
      if (e.target === o) { close(); return; }
      if (!b) return;
      if (b.getAttribute('data-w') === 'save') save('bellatrix-summary-' + code + '-' + new Date().toISOString().slice(0, 10) + '.html', w.html);
      else close();
    });
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  I18N.add('fr', {
    'Bellatrix · monthly summary': 'Bellatrix · résumé du mois', '{code} · the last 30 days': '{code} · les 30 derniers jours',
    'Born in {year}': 'Année de naissance : {year}', 'Childhood: {place}': 'Enfance : {place}',
    'moments with Bellatrix': 'moments avec Bellatrix', 'minutes together': 'minutes ensemble', 'days with an activity': 'jours avec une activité',
    'Favourite activities': 'Activités préférées', 'Mood after the activities': 'L’humeur après les activités',
    'better': 'mieux', 'the same': 'pareille', 'lower': 'moins bien',
    'Better or the same after {n} of {total} activities.': 'Mieux ou pareille après {n} activités sur {total}.',
    'What does the most good: {activity}': 'Ce qui fait le plus de bien : {activity}', 'No mood answers yet.': 'Pas encore de réponses sur l’humeur.',
    'Music': 'Musique', '{min} minutes of music, {n} songs and films': '{min} minutes de musique, {n} chansons et films', 'Favourite songs': 'Chansons préférées',
    'Family': 'Famille', '{n} video calls, {min} minutes': '{n} appels vidéo, {min} minutes', 'With {names}': 'Avec {names}', 'No video call in this period.': 'Pas d’appel vidéo sur cette période.',
    'One video call, {min} minutes': 'Un appel vidéo, {min} minutes', 'One game of chess or Ludo': 'Une partie d’échecs ou de petits chevaux', 'One chess puzzle solved': 'Une énigme d’échecs résolue',
    'Games': 'Jeux', '{n} games of chess or Ludo': '{n} parties d’échecs ou de petits chevaux', '{n} chess puzzles solved': '{n} énigmes d’échecs résolues',
    'No activity in the last 30 days.': 'Aucune activité ces 30 derniers jours.',
    'Prepared by Bellatrix on {date}. The data stays on the care home’s device.': 'Préparé par Bellatrix le {date}. Les données restent sur l’appareil de la maison de soins.'
  });
  I18N.add('de', {
    'Bellatrix · monthly summary': 'Bellatrix · Monatsrückblick', '{code} · the last 30 days': '{code} · die letzten 30 Tage',
    'Born in {year}': 'Geburtsjahr: {year}', 'Childhood: {place}': 'Kindheit: {place}',
    'moments with Bellatrix': 'Momente mit Bellatrix', 'minutes together': 'Minuten zusammen', 'days with an activity': 'Tage mit einer Aktivität',
    'Favourite activities': 'Lieblingsaktivitäten', 'Mood after the activities': 'Die Stimmung nach den Aktivitäten',
    'better': 'besser', 'the same': 'gleich', 'lower': 'schlechter',
    'Better or the same after {n} of {total} activities.': 'Besser oder gleich nach {n} von {total} Aktivitäten.',
    'What does the most good: {activity}': 'Was am meisten guttut: {activity}', 'No mood answers yet.': 'Noch keine Antworten zur Stimmung.',
    'Music': 'Musik', '{min} minutes of music, {n} songs and films': '{min} Minuten Musik, {n} Lieder und Filme', 'Favourite songs': 'Lieblingslieder',
    'Family': 'Familie', '{n} video calls, {min} minutes': '{n} Videoanrufe, {min} Minuten', 'With {names}': 'Mit {names}', 'No video call in this period.': 'Kein Videoanruf in diesem Zeitraum.',
    'One video call, {min} minutes': 'Ein Videoanruf, {min} Minuten', 'One game of chess or Ludo': 'Eine Partie Schach oder Mensch ärgere dich nicht', 'One chess puzzle solved': 'Ein Schachrätsel gelöst',
    'Games': 'Spiele', '{n} games of chess or Ludo': '{n} Partien Schach oder Mensch ärgere dich nicht', '{n} chess puzzles solved': '{n} Schachrätsel gelöst',
    'No activity in the last 30 days.': 'Keine Aktivität in den letzten 30 Tagen.',
    'Prepared by Bellatrix on {date}. The data stays on the care home’s device.': 'Erstellt von Bellatrix am {date}. Die Daten bleiben auf dem Gerät des Pflegeheims.'
  });
  return { open: open, build: build };
})();
