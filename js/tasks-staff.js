/* Task list on the robot HEAD (Care Team, 16 Nov, for the testing phase). The team prepares several runs, each
   "this resident, this activity, this place", the way it starts one: the same setup screen, then "Add to the task
   list" instead of "Start on the patient screen" (the run is caught by LinkStaff.collect, so it is exactly the run
   Start would have sent). "Start the list" sends them one after the other through the usual link: when one is
   finished, the robot goes on to the next place (LinkStaff.keepOutTasks: no trip to the base in between); after
   the last one, or when a task is cancelled, it goes back to its base as always. Kept in localStorage
   'bellatrix-tasks'. Only with the link (head + tablet). ES5. */
window.TasksStaff = (function () {
  'use strict';
  var KEY = 'bellatrix-tasks', NEXT_MS = 2000;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var S = function (k, v) { return window.ST ? ST(k, v) : k; };
  if (window.ST && ST.add) {
    ST.add('fr', {
      'Add to the task list': 'Ajouter à la liste', 'Task list': 'Liste de tâches', 'Start the list': 'Lancer la liste',
      'Stop the list': 'Arrêter la liste', 'Clear': 'Vider', 'Remove': 'Retirer', 'Added to the task list ({n}).': 'Ajouté à la liste ({n}).',
      'Task {i} of {n}': 'Tâche {i} sur {n}', 'The list is finished.': 'La liste est terminée.', 'The list stopped.': 'La liste est arrêtée.',
      'A run is still under way.': 'Une activité est encore en cours.', 'The patient screen did not answer.': 'L’écran patient n’a pas répondu.'
    });
    ST.add('de', {
      'Add to the task list': 'Zur Aufgabenliste', 'Task list': 'Aufgabenliste', 'Start the list': 'Liste starten',
      'Stop the list': 'Liste stoppen', 'Clear': 'Leeren', 'Remove': 'Entfernen', 'Added to the task list ({n}).': 'Zur Aufgabenliste hinzugefügt ({n}).',
      'Task {i} of {n}': 'Aufgabe {i} von {n}', 'The list is finished.': 'Die Liste ist fertig.', 'The list stopped.': 'Die Liste wurde gestoppt.',
      'A run is still under way.': 'Eine Aktivität läuft noch.', 'The patient screen did not answer.': 'Der Patientenbildschirm hat nicht geantwortet.'
    });
  }
  function load() { try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && Array.isArray(v.list) ? v : { list: [], run: null }; } catch (e) { return { list: [], run: null }; } }
  var st = load(), adding = false;   /* { list: [{ run, pos, label }], run: null | { i, runId } } */
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* this page only */ } }
  function toast(t) { if (window.Lab && Lab.toast) Lab.toast(t); }
  function linked() { return !!(window.LinkStaff && LinkStaff.configured && LinkStaff.configured()); }
  function cur() { try { return LinkStaff._cur ? LinkStaff._cur() : null; } catch (e) { return null; } }
  function busy() { var c = cur(); return !!(c && c.state !== 'finished' && c.state !== 'cancelled'); }

  /* ---------- adding: the same run Start would send ---------- */
  function add() {
    if (!linked()) return;
    var go = $('go');
    if (!go) return;
    var label = ($('startSummary') && $('startSummary').textContent || '').trim();
    adding = true;
    LinkStaff.collect(function (run, pos) {
      st.list.push({ run: run, pos: pos || '', label: label + (pos ? ' → ' + pos : '') });
      save(); paint();
      toast(S('Added to the task list ({n}).', { n: st.list.length }));
    });
    try { go.click(); } finally { adding = false; }
  }

  /* ---------- running ---------- */
  function start() {
    if (st.run || !st.list.length) return;
    if (busy()) { toast(S('A run is still under way.')); return; }
    st.run = { i: -1, runId: '' };
    save();
    next();
  }
  function next() {
    if (!st.run) return;
    st.run.i++; st.run.runId = '';
    if (st.run.i >= st.list.length) { end(S('The list is finished.')); return; }
    var t = st.list[st.run.i], run = JSON.parse(JSON.stringify(t.run)), my = st.run;
    run.id = 'T' + Date.now().toString(36) + st.run.i; run.at = Date.now();
    save(); paint();
    Promise.resolve(LinkStaff.send(run, t.pos)).then(function () {
      if (st.run !== my) return;
      var c = cur();
      if (c && c.id === run.id) { st.run.runId = run.id; save(); paint(); }
      else end(S('The patient screen did not answer.'));
    }, function () { end(S('The patient screen did not answer.')); });
  }
  function end(msg) {
    var was = !!st.run;
    st.run = null; save(); paint();
    if (was && msg) toast(msg);
  }
  function stop() {
    if (!st.run) return;
    var c = cur(), id = st.run.runId;
    end(S('The list stopped.'));
    if (c && c.id === id && busy()) LinkStaff.cancel();   /* the robot then goes home as after any cancel */
  }
  /* js/link-staff.js asks when a run ends: true = stay out, the list goes on */
  function keepOutTasks(c) {
    return !!(st.run && c && c.id === st.run.runId && c.state === 'finished' && st.run.i + 1 < st.list.length);
  }
  function onFinal(c) {
    if (!st.run || !c || c.id !== st.run.runId) return;
    if (c.state === 'finished' && st.run.i + 1 < st.list.length) { st.run.runId = ''; save(); setTimeout(next, NEXT_MS); }
    else end(c.state === 'finished' ? S('The list is finished.') : S('The list stopped.'));
  }

  /* ---------- screen: a button next to Start, the list under the start bar ---------- */
  function mount() {
    var bar = document.querySelector('.startbar'), go = $('go');
    if (!bar || !go) return false;
    if (!$('tkAdd')) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ghost'; b.id = 'tkAdd';
      b.addEventListener('click', add);
      bar.insertBefore(b, go);
      /* a real tap on Start never goes to the list (an Add that was not taken, e.g. a locked activity) */
      go.addEventListener('click', function () { if (!adding) LinkStaff.collect(null); }, true);
    }
    if (!$('tkList')) {
      var d = document.createElement('div');
      d.id = 'tkList'; d.className = 'tk-list'; d.hidden = true;
      d.addEventListener('click', function (e) {
        var x = e.target && e.target.closest ? e.target.closest('[data-tk]') : null;
        if (!x) return;
        var what = x.getAttribute('data-tk');
        if (what === 'start') start();
        else if (what === 'stop') stop();
        else if (what === 'clear') { if (!st.run) { st.list = []; save(); paint(); } }
        else if (what === 'rm') { var i = parseInt(x.getAttribute('data-i'), 10); if (!st.run && i >= 0) { st.list.splice(i, 1); save(); paint(); } }
      });
      bar.parentNode.insertBefore(d, bar.nextSibling);
    }
    return true;
  }
  function paint() {
    if (!mount()) return;
    var on = linked(), b = $('tkAdd'), d = $('tkList');
    b.hidden = !on; b.textContent = S('Add to the task list');
    d.hidden = !on || !st.list.length;
    if (d.hidden) return;
    var r = st.run;
    d.innerHTML = '<div class="tk-head"><b>' + esc(S('Task list')) + '</b>' + (r ? ' · ' + esc(S('Task {i} of {n}', { i: Math.max(1, r.i + 1), n: st.list.length })) : '') + '</div>' +
      '<ol class="tk-items">' + st.list.map(function (t, i) {
        return '<li class="' + (r && i === r.i ? 'tk-now' : r && i < r.i ? 'tk-done' : '') + '"><span>' + esc(t.label || t.run.key) + '</span>' +
          (r ? '' : '<button type="button" class="tk-rm" data-tk="rm" data-i="' + i + '" aria-label="' + esc(S('Remove')) + '">×</button>') + '</li>';
      }).join('') + '</ol>' +
      '<div class="tk-btns">' + (r ? '<button type="button" class="ghost" data-tk="stop">' + esc(S('Stop the list')) + '</button>' :
        '<button type="button" class="go" data-tk="start">' + esc(S('Start the list')) + '</button><button type="button" class="ghost" data-tk="clear">' + esc(S('Clear')) + '</button>') + '</div>';
  }
  function boot() {
    if (!window.LinkStaff) return;
    LinkStaff.keepOutTasks = keepOutTasks;
    LinkStaff.onFinal = onFinal;
    LinkStaff.onCornerStop = function () { end(S('The list stopped.')); };   /* 3 corner taps: the robot stops, so does the list */
    /* a list that was running when the page reloaded: the run in progress decides */
    if (st.run) { var c = cur(); if (!c || c.id !== st.run.runId) { st.run = null; save(); } }
    paint();
    setInterval(paint, 5000);
  }
  if (typeof document !== 'undefined' && document.addEventListener && !window.__tasksTest) document.addEventListener('DOMContentLoaded', boot);
  return { add: add, start: start, stop: stop, keepOutTasks: keepOutTasks, onFinal: onFinal, _state: function () { return st; }, _boot: boot, paint: paint };
})();
