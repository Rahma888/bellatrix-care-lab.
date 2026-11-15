/* Board games pack (LabLand): Activity 11, Chess. The rules and Bellatrix's moves are in chess.js
   (BellatrixChess), loaded before this file in the same pack. */
(function () {
  'use strict';
  var DONE_WORDS = ['done', 'finish', 'finished', 'im done', 'nothing else', 'enough', 'thats all', 'no more'];
  function doneAction(L, label) {
    return { label: label || L.t('I’m done'), gesture: 'fist', words: DONE_WORDS, noLabelWords: true, run: function () { L.finish(); } };
  }
  /* Wraps the engine API so that go(null) is ignored: helpers may finish the activity themselves. */
  function safe(L) { var W = Object.create(L), go = L.go; W.go = function (step, o) { if (step) go(step, o); }; return W; }

  /* ---------- Activity 11: Chess ----------
     Against Bellatrix (easy, medium or harder) or two players taking turns at the screen, or short
     "checkmate in one move" puzzles. A piece is chosen by touch or by pointing in the air, then the
     square it goes to; dots show where it can go. Bellatrix can give a hint and take a move back.
     An unfinished game is kept for the patient (30 days): next time she offers to continue it. */
  var CHESS_PIECES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  var FILES = 'abcdefgh';
  var PIECE_PATH = {
    p: '<circle cx="50" cy="31" r="13"/><path d="M34 80 Q35 58 50 50 Q65 58 66 80 Z"/>',
    r: '<path d="M30 22 h9 v8 h7 v-8 h8 v8 h7 v-8 h9 v20 h-40 Z"/><rect x="35" y="42" width="30" height="38"/>',
    n: '<path d="M33 80 C33 70 38 63 43 57 C35 58 27 57 23 50 C20 44 25 37 32 33 L39 17 L46 27 C60 29 71 41 71 58 L69 80 Z"/>',
    b: '<circle cx="50" cy="19" r="6"/><path d="M33 80 C32 60 40 42 50 28 C60 42 68 60 67 80 Z"/>',
    q: '<path d="M29 80 L23 35 L38 54 L50 27 L62 54 L77 35 L71 80 Z"/><circle cx="23" cy="31" r="5"/><circle cx="50" cy="22" r="5"/><circle cx="77" cy="31" r="5"/>',
    k: '<rect x="46" y="12" width="8" height="28" rx="1"/><rect x="38" y="19" width="24" height="8" rx="1"/><path d="M31 80 C29 55 38 44 50 44 C62 44 71 55 69 80 Z"/>'
  };
  /* Large, high-contrast pieces: white ones with a dark outline, black ones with a light outline. */
  function pieceSvg(color, type, attrs) {
    var white = color === 'w', fill = white ? '#FBFAF5' : '#262626', line = white ? '#1E1E1E' : '#F2EFE6';
    return '<svg viewBox="0 0 100 100" aria-hidden="true"' + (attrs || '') + '><g fill="' + fill + '" stroke="' + line + '" stroke-width="4" stroke-linejoin="round">' +
      PIECE_PATH[type] + '<rect x="25" y="80" width="50" height="10" rx="4"/></g>' +
      (type === 'n' ? '<circle cx="38" cy="41" r="3.5" fill="' + line + '"/>' : '') +
      (type === 'b' ? '<path d="M55 48 L46 60" stroke="' + line + '" stroke-width="4" stroke-linecap="round"/>' : '') + '</svg>';
  }
  function chessArt() {
    var out = '<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><rect width="400" height="300" fill="#F7F7F7"/>';
    for (var r = 0; r < 2; r++) for (var f = 0; f < 3; f++) out += '<rect x="' + (50 + f * 100) + '" y="' + (50 + r * 100) + '" width="100" height="100" fill="' + ((f + r) % 2 ? '#B58863' : '#F0D9B5') + '"/>';
    out += '<rect x="50" y="50" width="300" height="200" fill="none" stroke="#5B3A1E" stroke-width="8"/>';
    out += pieceSvg('w', 'k', ' x="55" y="55" width="90" height="90"') + pieceSvg('b', 'q', ' x="255" y="55" width="90" height="90"') +
      pieceSvg('w', 'n', ' x="155" y="155" width="90" height="90"') + pieceSvg('b', 'p', ' x="255" y="155" width="90" height="90"');
    return out + '</svg>';
  }
  /* A picture of a whole position (the saved game, the start of a puzzle). */
  function boardArt(g, flip) {
    var out = '<svg viewBox="0 0 800 800" preserveAspectRatio="xMidYMid meet" aria-hidden="true">', i, col, row, sq, p;
    for (i = 0; i < 64; i++) {
      col = i % 8; row = Math.floor(i / 8);
      sq = flip ? FILES[7 - col] + (row + 1) : FILES[col] + (8 - row);
      out += '<rect x="' + col * 100 + '" y="' + row * 100 + '" width="100" height="100" fill="' + ((col + row) % 2 ? '#B58863' : '#F0D9B5') + '"/>';
      p = g.pieceAt(sq);
      if (p) out += pieceSvg(p.color, p.type, ' x="' + (col * 100 + 4) + '" y="' + (row * 100 + 4) + '" width="92" height="92"');
    }
    return out + '<rect x="4" y="4" width="792" height="792" fill="none" stroke="#5B3A1E" stroke-width="8"/></svg>';
  }
  function pieceLabel(L, p) { return L.t((p.color === 'w' ? 'white ' : 'black ') + CHESS_PIECES[p.type]); }
  function uci(m) { return m.from + m.to + (m.promotion || ''); }
  /* The 64 squares of a board step, each a button. o: { flip, sel, dots, open, hint: [squares], tap(sq) } */
  function boardChoices(L, g, o) {
    var targets = o.sel ? g.moves(o.sel) : [], last = g.lastMove(), checkSq = g.inCheck() ? g.kingSquare(g.turn()) : null, tgt = {}, out = [], i;
    targets.forEach(function (m) { tgt[m.to] = m; });
    function tapper(sq) { return function () { o.tap(sq); }; }
    for (i = 0; i < 64; i++) {
      var col = i % 8, row = Math.floor(i / 8), sq = o.flip ? FILES[7 - col] + (row + 1) : FILES[col] + (8 - row), p = g.pieceAt(sq);
      var cls = (FILES.indexOf(sq.charAt(0)) + (+sq.charAt(1))) % 2 === 1 ? 'd' : 'l';
      if (last && (last.from === sq || last.to === sq)) cls += ' last';
      if (checkSq === sq) cls += ' check';
      if (o.sel === sq) cls += ' sel';
      if (tgt[sq] && o.dots) cls += ' tgt' + (p || tgt[sq].flags.indexOf('e') >= 0 ? ' cap' : '');
      if (o.hint && o.hint.indexOf(sq) >= 0) cls += ' hint';
      var can = o.open && (!!tgt[sq] || (p && p.color === g.turn() && g.moves(sq).length > 0));
      out.push({ label: sq + ', ' + (p ? pieceLabel(L, p) : L.t('empty square')), art: p ? pieceSvg(p.color, p.type) : '', cls: cls, disabled: !can,
        mark: (row === 7 ? sq.charAt(0) : '') + (col === 0 ? sq.charAt(1) : ''), run: tapper(sq) });
    }
    return out;
  }

  /* ---------- the unfinished game, kept per patient in this browser ----------
     localStorage 'bellatrix-chess-saved' = { <patient code>: { v: 1, mode: 'robot' | 'two', level,
     human: 'w' | 'b' | null, moves: ['e2e4', ...], at: <time of the last move>, started } }.
     A game older than 30 days is not offered any more and is dropped at the next save. */
  var SAVE_KEY = 'bellatrix-chess-saved', PUZZLE_KEY = 'bellatrix-chess-puzzles', KEEP_MS = 30 * 24 * 3600 * 1000;
  function readStore(key) {
    try { var o = JSON.parse(localStorage.getItem(key) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; }
  }
  function writeStore(key, o) { try { localStorage.setItem(key, JSON.stringify(o)); return true; } catch (e) { return false; } }
  function savedGame(patient) {
    var s = readStore(SAVE_KEY)[patient], now = Date.now();
    if (!s || s.v !== 1 || (s.mode !== 'robot' && s.mode !== 'two') || !Array.isArray(s.moves) || !s.moves.length || typeof s.at !== 'number') return null;
    if (s.mode === 'robot' && s.human !== 'w' && s.human !== 'b') return null;
    if (now - s.at > KEEP_MS || s.at > now + 24 * 3600 * 1000) return null;
    return s;
  }
  function putSaved(patient, rec) {
    var all = readStore(SAVE_KEY), now = Date.now();
    Object.keys(all).forEach(function (k) { if (!all[k] || typeof all[k].at !== 'number' || now - all[k].at > KEEP_MS) delete all[k]; });
    if (rec) all[patient] = rec; else delete all[patient];
    writeStore(SAVE_KEY, all);
  }
  /* The saved moves played again from the start; null when one is not legal or the game is over. */
  function replay(moves) {
    var g = BellatrixChess.create(), i, u;
    for (i = 0; i < moves.length; i++) {
      u = String(moves[i]);
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u) || !g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.charAt(4) || undefined })) return null;
    }
    return g.status() === 'playing' ? g : null;
  }
  /* A preview by the care team saves nothing for the patient. */
  function isPreview() { var c = document.getElementById('chipPreview'); return !!(c && !c.hidden); }
  var WEEKDAY_LINES = ['Continue our game from Sunday', 'Continue our game from Monday', 'Continue our game from Tuesday', 'Continue our game from Wednesday',
    'Continue our game from Thursday', 'Continue our game from Friday', 'Continue our game from Saturday'];

  /* ---------- "checkmate in one move" puzzles ----------
     Simple, well-known pictures: back-rank mates, queen and king against king, the scholar's mate,
     a smothered mate. Each has at least one mating move (checked by the tests); any mating move counts. */
  var PUZZLES = [
    'k7/8/1K6/8/8/8/8/6Q1 w - - 0 1',
    '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
    '3r2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1',
    '4k3/8/4K3/8/8/8/8/Q7 w - - 0 1',
    'r7/8/8/8/8/6k1/8/7K b - - 0 1',
    '7k/8/7K/8/8/8/8/R7 w - - 0 1',
    '1q4k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1',
    '6k1/5ppp/8/8/8/8/1Q3PPP/6K1 w - - 0 1',
    '8/8/8/8/8/1k6/2q5/K7 b - - 0 1',
    'k7/7R/8/8/8/8/8/K5R1 w - - 0 1',
    'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2',
    'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
    '4k3/8/4K3/8/1Q6/8/8/8 w - - 0 1',
    '5rk1/5ppp/8/7Q/8/3B4/8/6K1 w - - 0 1',
    '6k1/5ppp/8/8/6n1/8/6PP/6RK b - - 0 1',
    '6k1/5p1p/6pB/8/3Q4/8/5PPP/6K1 w - - 0 1',
    'rnb1k1nr/pppp1ppp/8/2b1p3/4P2q/2NP4/PPP2PPP/R1BQKBNR b KQkq - 2 4',
    '5rk1/5ppp/8/8/8/8/1B4Q1/6K1 w - - 0 1',
    '7k/8/5N2/8/8/8/8/6RK w - - 0 1',
    '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1'
  ];

  Lab.define({
    key: 'chess', day: 11, name: 'Chess', zone: 'COMMUNITY_CIRCLE',
    flow: 'Chess on a large board, against Bellatrix (easy, medium or harder) or between two players taking turns at the screen, or short "checkmate in one move" puzzles. Choose a piece, then its square, by touch or by pointing in the air; dots show the possible moves, and Bellatrix can give a hint or take a move back. An unfinished game is kept: next time, Bellatrix offers to continue it.',
    learn: 'Pointing precision on small targets, turn-taking between two residents, game length and enjoyment, puzzles solved.',
    art: function () { return chessArt(); },
    air: true,
    againQuestion: 'Would you like to play chess again another time?',
    puzzles: PUZZLES,
    /* 1.17: the Care Team is asked the level only; the other fields keep their defaults (hide: true). */
    content: [
      { id: 'mode', hide: true, label: 'Who plays', type: 'select', value: 'ask', note: 'An unfinished game is kept for 30 days: next time, Bellatrix offers to continue it or start a new one.',
        options: [['ask', 'Ask the patient at the start'], ['robot', 'The patient against Bellatrix'], ['two', 'Two players at the screen'], ['puzzles', 'Short puzzles: checkmate in one move']] },
      { id: 'level', label: 'Bellatrix’s level', type: 'select', value: 'medium', note: 'At every level she plays a checkmate when she has one, never leaves her queen or a rook to be taken for nothing, and always takes a queen or rook that is given away.',
        options: [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']] },
      { id: 'color', hide: true, label: 'Against Bellatrix, the patient plays', type: 'select', value: 'w',
        options: [['w', 'White (moves first)'], ['b', 'Black'], ['random', 'By chance']] },
      { id: 'hints', hide: true, label: 'Show where a chosen piece can go', type: 'select', value: 'yes',
        options: [['yes', 'Yes, dots on the board'], ['no', 'No']] },
      { id: 'puzzles', hide: true, label: 'Puzzles per session (short puzzles)', type: 'select', value: '3',
        options: [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6']] }
    ],
    start: function (L) {
      L = safe(L);
      var MODE = String(L.text('mode') || 'ask'), LEVEL = String(L.text('level') || 'medium'), COLOR = String(L.text('color') || 'w');
      var DOTS = String(L.text('hints') || 'yes') !== 'no';
      var PUZZLE_COUNT = Math.max(1, Math.min(6, parseInt(L.text('puzzles'), 10) || 3));
      if (['easy', 'medium', 'hard'].indexOf(LEVEL) < 0) LEVEL = 'medium';
      if (['ask', 'robot', 'two', 'puzzles'].indexOf(MODE) < 0) MODE = 'ask';
      var PATIENT = String(Lab.patient || 'P1'), PREVIEW = isPreview();
      var stageEl = document.getElementById('stage');
      function thinking(on) { if (stageEl) stageEl.classList.toggle('thinking', !!on); }
      function howTo() { return L.air() ? L.t('Point at a piece, then at where it goes.') : L.t('Touch a piece, then where it goes.'); }
      if (typeof BellatrixChess === 'undefined') {
        L.log('Chess rules (js/chess.js) not loaded', 'error');
        return { id: 'chess-missing', title: L.t('Chess is not available on this screen.'), center: true, back: false, actions: [doneAction(L, L.t('Finish'))] };
      }
      function forgetGame() { if (!PREVIEW) putSaved(PATIENT, null); }

      /* First screen: an unfinished game of this patient (unless the care team chose puzzles). */
      function first() {
        if (MODE !== 'puzzles') {
          var sv = savedGame(PATIENT);
          if (sv && (MODE === 'ask' || MODE === sv.mode)) {
            var g = replay(sv.moves);
            if (g) return resumeStep(sv, g);
            L.log('Chess: the saved game could not be read back and was dropped', 'error');
            forgetGame();
          }
        }
        return intro();
      }
      function continueLabel(at) {
        var T = L.t, then = new Date(at), now = new Date(), date;
        var days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
          new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()) / 86400000);
        if (days <= 0) return T('Continue our game from earlier today');
        if (days === 1) return T('Continue our game from yesterday');
        if (days < 7) return T(WEEKDAY_LINES[then.getDay()]);
        try { date = then.toLocaleDateString((typeof I18N !== 'undefined' && I18N.BCP47[L.lang()]) || 'en-US', { day: 'numeric', month: 'long' }); }
        catch (e) { date = then.toISOString().slice(0, 10); }
        return T('Continue our game from {date}', { date: date });
      }
      function resumeStep(sv, g) {
        var T = L.t, n = Math.ceil(sv.moves.length / 2);
        var who = sv.mode === 'two' ? T('Two players were playing.') : sv.human === 'w' ? T('You were playing white against me.') : T('You were playing black against me.');
        var lead = who + ' ' + (n === 1 ? T('One move was played.') : T('{n} moves were played.', { n: n }));
        var level = ['easy', 'medium', 'hard'].indexOf(sv.level) >= 0 ? sv.level : LEVEL;
        return {
          id: 'chess-resume', eyebrow: T('Chess'), title: T('Our game is waiting'), lead: lead, pic: boardArt(g, sv.mode === 'robot' && sv.human === 'b'), back: false, airPointer: true,
          say: T('Welcome back to our game of chess.') + ' ' + T('Shall we continue it, or start a new game?'),
          actions: [
            { label: continueLabel(sv.at), primary: true, gesture: 'open', words: ['continue', 'carry on', 'go on', 'resume', 'our game', 'same game', 'yes', 'continue our game'], noLabelWords: true,
              run: function () {
                L.stat('chessResumed', true);
                L.log('Chess: unfinished game continued (' + sv.moves.length + ' half-moves, last played ' + new Date(sv.at).toISOString().slice(0, 10) + ')', 'result');
                L.go(game(sv.mode, sv.mode === 'robot' ? sv.human : null, { g: g, level: level, started: sv.started }), { clear: true });
              } },
            { label: T('Start a new game'), gesture: 'thumb', words: ['new game', 'new', 'start again', 'a new game', 'start a new game', 'new one', 'another game'], noLabelWords: true,
              run: function () {
                forgetGame();
                L.log('Chess: unfinished game set aside for a new one', 'result');
                L.go(intro(), { replace: true });
              } }
          ]
        };
      }
      function intro() {
        if (MODE === 'ask') return ready('robot');   /* 1.17: against Bellatrix, no question */
        if (MODE === 'robot' || MODE === 'two') return ready(MODE);
        if (MODE === 'puzzles') return puzzleIntro();
        return {
          id: 'chess-who', eyebrow: L.t('Chess'), title: L.t('A game of chess'), lead: L.t('Who is playing today?'), pic: chessArt(), back: false, airPointer: true,
          say: L.t('Let us play chess. Who is playing today: you against me, two players, or a short puzzle?'),
          actions: [
            { label: L.t('Against Bellatrix'), primary: true, gesture: 'open', words: ['against you', 'you', 'bellatrix', 'robot', 'against bellatrix', 'me against you'], noLabelWords: true,
              run: function () { L.go(ready('robot'), { replace: true }); } },
            { label: L.t('Two players'), gesture: 'thumb', words: ['two players', 'two', 'friend', 'together', 'with a friend'], noLabelWords: true,
              run: function () { L.go(ready('two'), { replace: true }); } },
            { label: L.t('A short puzzle'), words: ['puzzle', 'puzzles', 'a puzzle', 'short puzzle', 'a short puzzle', 'riddle', 'checkmate'], noLabelWords: true,
              run: function () { L.go(puzzleIntro(), { replace: true }); } }
          ]
        };
      }
      function ready(mode) {
        var human = mode === 'robot' ? (COLOR === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : (COLOR === 'b' ? 'b' : 'w')) : null;
        var lead = mode === 'two' ? L.t('One player plays white, the other black. White starts. Take turns at the screen.')
          : human === 'w' ? L.t('You play white and start. I play black.') : L.t('You play black. I play white and start.');
        return {
          id: 'chess-ready', eyebrow: L.t('Chess'), title: L.t('A game of chess'), lead: lead, pic: chessArt(), back: false, airPointer: true,
          say: lead,
          actions: [{ label: L.t('Let’s start'), primary: true, gesture: 'open', words: ['start', 'begin', 'yes', 'ready', 'ok', 'okay', 'go'], noLabelWords: true,
            run: function () { L.go(game(mode, human), { clear: true }); } }]
        };
      }
      /* A game. resume: { g, level, started } continues a saved game (its moves already played on g). */
      function game(mode, human, resume) {
        var level = resume ? resume.level : LEVEL;
        var g = resume ? resume.g : BellatrixChess.create(), flip = mode === 'robot' && human === 'b';
        var sel = null, hintMove = null, busy = false, over = false, promoting = null, hints = 0, undos = 0, note = '', t0 = Date.now();
        var started = resume && resume.started ? resume.started : Date.now();
        L.stat('chessMode', mode === 'robot' ? 'against Bellatrix (' + level + ')' : 'two players');
        L.log('Chess: ' + (mode === 'robot' ? 'against Bellatrix, level ' + level + ', patient plays ' + (human === 'w' ? 'white' : 'black') : 'two players') +
          (resume ? ', continued after ' + g.history().length + ' half-moves' : ''), 'result');
        var T0 = L.t, say;
        if (resume) say = mode === 'two' ? T0('Here is the game again.') + ' ' + (g.turn() === 'w' ? T0('White to play.') : T0('Black to play.'))
          : g.turn() === human ? T0('Here is our game again. It is your move.') : T0('Here is our game again. It is my move.');
        else say = mode === 'two' ? T0('White starts.') : human === 'w' ? T0('Your move. White starts.') : T0('I start.');
        var st = {
          id: 'chess-board', eyebrow: mode === 'robot' ? T0('Chess · against Bellatrix') : T0('Chess · two players'), style: 'board',
          back: false, airPointer: true, noAirHint: true, noReprompt: true, say: say
        };
        if (mode === 'robot' && g.turn() !== human) { busy = true; st.afterSay = function () { thinking(true); L.later(robotMove, 600); }; }
        function humanTurn() { return mode === 'two' || g.turn() === human; }
        function sideName(c) { return c === 'w' ? L.t('White') : L.t('Black'); }
        function isCastle(m) { return m.flags.indexOf('k') >= 0 || m.flags.indexOf('q') >= 0; }
        function build() {
          st.choices = boardChoices(L, g, { flip: flip, sel: sel, dots: DOTS, open: !over && !busy && !promoting && humanTurn(),
            hint: hintMove ? [hintMove.from, hintMove.to] : null, tap: tap });
        }
        /* After every move: the game is kept for this patient, to continue another day. */
        function save() {
          if (PREVIEW || over) return;
          var h = g.history();
          if (!h.length) { putSaved(PATIENT, null); return; }
          putSaved(PATIENT, { v: 1, mode: mode, level: level, human: human, moves: h.map(uci), at: Date.now(), started: started });
        }
        function setTurn() {
          var T = L.t;
          if (over) return;
          if (promoting) {
            st.title = T('Your pawn reached the last row. What should it become?');
            st.hint = '';
            st.actions = ['q', 'r', 'b', 'n'].map(function (t) {
              return { label: T(CHESS_PIECES[t].charAt(0).toUpperCase() + CHESS_PIECES[t].slice(1)), icon: pieceSvg(g.turn(), t), cls: 'piecebtn', primary: t === 'q', noLabelWords: true,
                words: [CHESS_PIECES[t]], pair: true, run: function () { var m = promoting; promoting = null; humanMove({ from: m.from, to: m.to, promotion: t }); } };
            });
            return;
          }
          st.title = mode === 'two' ? (g.turn() === 'w' ? T('White to play') : T('Black to play')) : (busy ? T('Bellatrix is thinking…') : T('Your move'));
          st.lead = note;
          st.hint = humanTurn() && !busy ? howTo() : '';
          var acts = [];
          if (humanTurn() && !busy) {
            acts.push({ label: T('Hint'), gesture: 'thumb', words: ['hint', 'help me', 'tip', 'what should i do'], noLabelWords: true, pair: true, run: giveHint });
            acts.push({ label: T('Take back'), words: ['take back', 'undo', 'back'], noLabelWords: true, pair: true, disabled: !canUndo(), run: takeBack });
          }
          st.actions = acts;
        }
        function redraw() { setTurn(); build(); L.refresh(); }
        function canUndo() { return mode === 'robot' ? g.history().length >= 2 : g.history().length >= 1; }
        function tap(sq) {
          if (over || busy || promoting || !humanTurn()) return;
          hintMove = null;
          var opts = sel ? g.moves(sel).filter(function (m) { return m.to === sq; }) : [];
          if (opts.length) {
            if (opts.some(function (m) { return !!m.promotion; })) { promoting = { from: sel, to: sq }; redraw(); L.say(L.t('Your pawn reached the last row. What should it become?')); return; }
            humanMove({ from: sel, to: sq });
            return;
          }
          var p = g.pieceAt(sq);
          sel = p && p.color === g.turn() && sel !== sq && g.moves(sq).length ? sq : null;
          redraw();
        }
        function play(m, who) {
          var done = g.move(m);
          if (!done) return null;
          sel = null; hintMove = null;
          L.log(who + ': ' + done.from + '-' + done.to + (done.captured ? ' takes ' + done.captured : '') + (done.promotion ? ' =' + done.promotion : '') + (g.inCheck() ? ' check' : ''), 'result');
          save();
          return done;
        }
        function humanMove(m) {
          var done = play(m, mode === 'two' ? (g.turn() === 'w' ? 'White' : 'Black') : 'Patient');
          if (!done) { redraw(); return; }
          if (mode === 'two') {
            note = describe(done, false);
            if (finish(note)) return;
            redraw();
            L.say(note + ' ' + (g.turn() === 'w' ? L.t('White to play.') : L.t('Black to play.')));
            return;
          }
          note = '';
          if (finish('')) return;
          busy = true; thinking(true); redraw();
          if (g.inCheck()) L.say(L.t('Check! Well played.'));
          L.later(robotMove, 700);
        }
        function robotMove() {
          var r = BellatrixChess.think(g, level), m = r && r.move;
          thinking(false);
          busy = false;
          if (!m) { finish(''); return; }
          var done = play(m, 'Bellatrix');
          L.log('Bellatrix thought ' + r.ms + ' ms (depth ' + r.depth + ', ' + r.nodes + ' positions)', 'app');
          note = describe(done, true);
          if (finish(note)) return;
          redraw();
          L.say(note);
        }
        function describe(m, robot) {
          var T = L.t, out;
          if (robot) {
            out = isCastle(m) ? T('I castle.') : T('I move {piece} to {to}.', { piece: T('my ' + CHESS_PIECES[m.piece]), to: m.to });
            if (m.captured) out += ' ' + T('I take {piece}.', { piece: T('your ' + CHESS_PIECES[m.captured]) });
            if (m.promotion) out += ' ' + T('My pawn becomes {piece}.', { piece: T('a ' + CHESS_PIECES[m.promotion]) });
          } else {
            var side = sideName(m.color);
            if (isCastle(m)) out = T('{side} castles.', { side: side });
            else if (m.captured) out = T('{side} moves {piece} to {to} and takes {captured}.', { side: side, piece: T('the ' + CHESS_PIECES[m.piece]), to: m.to, captured: T('the ' + CHESS_PIECES[m.captured]) });
            else out = T('{side} moves {piece} to {to}.', { side: side, piece: T('the ' + CHESS_PIECES[m.piece]), to: m.to });
            if (m.promotion) out += ' ' + T('The pawn becomes {piece}.', { piece: T('a ' + CHESS_PIECES[m.promotion]) });
          }
          if (g.inCheck() && g.status() === 'playing') {
            out += ' ' + (mode === 'robot' ? T('Check! Your king is attacked.') : T('{side} is in check.', { side: sideName(g.turn()) }));
          }
          return out;
        }
        function giveHint() {
          if (over || busy || !humanTurn()) return;
          var m = BellatrixChess.bestMove(g, 'medium');
          if (!m) return;
          hints++; L.stat('chessHints', hints);
          hintMove = m; sel = m.from;
          note = L.t('You could move {piece} from {from} to {to}.', { piece: L.t('your ' + CHESS_PIECES[m.piece]), from: m.from, to: m.to });
          redraw();
          L.say(note);
        }
        function takeBack() {
          if (over || busy || !canUndo()) return;
          g.undo();
          if (mode === 'robot') g.undo();
          undos++; L.stat('chessUndos', undos);
          sel = null; hintMove = null; promoting = null;
          save();
          note = L.t('Move taken back.');
          redraw();
          L.say(note);
        }
        /* The game is over: the final board stays on screen with the result and two buttons. */
        function finish(prefix) {
          var s = g.status();
          if (s === 'playing') return false;
          var T = L.t, title, line = '', result;
          if (s === 'checkmate') {
            var winner = g.turn() === 'w' ? 'b' : 'w';
            if (mode === 'robot') { title = winner === human ? T('Checkmate! You win.') : T('Checkmate. I win this time.'); result = winner === human ? 'patient won' : 'Bellatrix won'; }
            else { title = T('Checkmate! {side} wins.', { side: sideName(winner) }); result = winner === 'w' ? 'white won' : 'black won'; }
          } else {
            title = s === 'stalemate' ? T('Stalemate. It is a draw.') : T('It is a draw.');
            line = s === 'draw-repetition' ? T('The same position came up three times.') : s === 'draw-material' ? T('Not enough pieces are left to checkmate.') :
              s === 'draw-50' ? T('Fifty moves without a capture or a pawn move.') : '';
            result = 'draw (' + s + ')';
          }
          forgetGame();
          over = true; busy = false; sel = null; hintMove = null; promoting = null; thinking(false);
          L.stat('chessResult', result); L.stat('chessMoves', Math.ceil(g.history().length / 2)); L.stat('chessMinutes', Math.round((Date.now() - t0) / 60000));
          L.log('Game over: ' + result + ' after ' + g.history().length + ' half-moves', 'result');
          st.title = title; st.lead = ((prefix && prefix !== title ? prefix : '') + (line ? ' ' + line : '')).trim(); st.hint = '';
          st.actions = [
            { label: T('Another game'), primary: true, gesture: 'open', words: ['another', 'again', 'another game', 'play again', 'yes'], noLabelWords: true, run: function () { L.go(game(mode, human), { clear: true }); } },
            { label: T('Finish'), gesture: 'fist', words: ['finish', 'done', 'no', 'enough'], noLabelWords: true, run: function () { L.finish(); } }
          ];
          build(); L.refresh();
          L.say((prefix ? prefix + ' ' : '') + title + (line ? ' ' + line : '') + ' ' + T('Thank you for the game!'));
          return true;
        }
        setTurn(); build();
        return st;
      }

      /* ---------- puzzles: checkmate in one move ----------
         The resident plays the side to move (shown at the bottom). A wrong move is shown, explained
         and taken back; after two wrong tries the mating piece gets a green frame, after four the
         whole move. Each patient goes on through the list where the last session stopped. */
      var pz = { solved: 0, tried: 0, first: -1 };
      function puzzleStart() {
        if (pz.first < 0) {
          var n = readStore(PUZZLE_KEY)[PATIENT];
          pz.first = typeof n === 'number' && n >= 0 ? Math.floor(n) % PUZZLES.length : 0;
          L.stat('chessMode', 'puzzles (checkmate in one move)');
          L.stat('chessPuzzlesSolved', 0); L.stat('chessPuzzlesTried', 0);
        }
        return pz.first;
      }
      function puzzleIntro() {
        var T = L.t, lead = T('I show you a position. Find the move that checkmates the king: it is attacked and cannot escape.');
        var count = PUZZLE_COUNT === 1 ? T('There is one puzzle today.') : T('There are {n} puzzles today.', { n: PUZZLE_COUNT });
        var g = BellatrixChess.create(PUZZLES[puzzleStart()]);
        return {
          id: 'chess-puzzle-intro', eyebrow: T('Chess · puzzles'), title: T('Checkmate in one move'), lead: lead + ' ' + count, pic: boardArt(g, g.turn() === 'b'), back: false, airPointer: true,
          say: lead,
          actions: [{ label: T('Let’s start'), primary: true, gesture: 'open', words: ['start', 'begin', 'yes', 'ready', 'ok', 'okay', 'go'], noLabelWords: true,
            run: function () { L.go(puzzle(0), { clear: true }); } }]
        };
      }
      function puzzle(k) {
        var T = L.t, idx = (puzzleStart() + k) % PUZZLES.length, fen = PUZZLES[idx];
        var g = BellatrixChess.create(fen), side = g.turn(), mates = BellatrixChess.matingMoves(g);
        var sel = null, busy = false, solved = false, wrong = 0, shown = 0, note = '', total = Math.max(PUZZLE_COUNT, k + 1);
        pz.tried++; L.stat('chessPuzzlesTried', pz.tried);
        if (!PREVIEW) { var all = readStore(PUZZLE_KEY); all[PATIENT] = (idx + 1) % PUZZLES.length; writeStore(PUZZLE_KEY, all); }
        L.log('Chess puzzle ' + (idx + 1) + ' of the list: ' + fen, 'result');
        var sideLine = side === 'w' ? T('You play white.') : T('You play black.');
        var st = {
          id: 'chess-puzzle', eyebrow: T('Puzzle {n} of {total}', { n: k + 1, total: total }), style: 'board', back: false, airPointer: true, noAirHint: true, noReprompt: true,
          say: k === 0 ? sideLine + ' ' + T('Find the move that checkmates the king.') : sideLine
        };
        function hintSquares() { return !mates.length || !shown ? null : shown === 1 ? [mates[0].from] : [mates[0].from, mates[0].to]; }
        /* Short title and one message line, so the whole board and the buttons fit an upright screen. */
        function setTurn() {
          if (solved) return;
          st.title = side === 'w' ? T('You play white') : T('You play black');
          st.lead = note || T('Find the move that checkmates the king.');
          st.hint = busy || note ? '' : howTo();
          st.actions = busy ? [] : [
            { label: T('Hint'), gesture: 'thumb', words: ['hint', 'tip', 'show me', 'clue'], noLabelWords: true, pair: true, disabled: shown >= 2 || !mates.length, run: function () { showHelp(true); } },
            { label: T('Skip this puzzle'), words: ['skip', 'next', 'another', 'skip this puzzle', 'next puzzle'], noLabelWords: true, pair: true, run: skip }
          ];
        }
        function build() {
          st.choices = boardChoices(L, g, { flip: side === 'b', sel: sel, dots: DOTS, open: !busy && !solved, hint: hintSquares(), tap: tap });
        }
        function redraw() { setTurn(); build(); L.refresh(); }
        function showHelp(asked) {
          if (!mates.length || shown >= 2) return;
          shown++;
          var m = mates[0];
          note = shown === 1 ? T('Here is a help: the piece in the green frame can give checkmate.')
            : T('Here is the answer: move {piece} from {from} to {to}.', { piece: T('your ' + CHESS_PIECES[m.piece]), from: m.from, to: m.to });
          if (asked) L.log('Puzzle help asked (' + (shown === 1 ? 'piece' : 'whole move') + ')', 'result');
          sel = null;
          redraw();
          L.say(note);
        }
        function tap(sq) {
          if (busy || solved) return;
          var opts = sel ? g.moves(sel).filter(function (m) { return m.to === sq; }) : [];
          if (opts.length) { attempt({ from: sel, to: sq, promotion: opts.some(function (m) { return !!m.promotion; }) ? 'q' : undefined }); return; }
          var p = g.pieceAt(sq);
          sel = p && p.color === g.turn() && sel !== sq && g.moves(sq).length ? sq : null;
          redraw();
        }
        function attempt(m) {
          var done = g.move(m);
          if (!done) { redraw(); return; }
          sel = null;
          var mate = g.status() === 'checkmate';
          L.log('Puzzle move: ' + done.from + '-' + done.to + (mate ? ' checkmate' : g.inCheck() ? ' check, not mate' : ' not mate'), 'result');
          if (mate) { win(); return; }
          wrong++;
          busy = true;
          note = (g.inCheck() ? T('Check, but the king can still escape.') : T('That move does not checkmate the king.')) + ' ' + T('Let us try again.');
          redraw();
          /* The wrong move stays on the board while Bellatrix explains (at least 2 seconds, also
             without a voice), then it is taken back; the explanation stays readable. */
          var reset = false, shownAt = Date.now();
          function back() {
            if (reset || L.step() !== st) return;
            var wait = 2000 - (Date.now() - shownAt);
            if (wait > 0) { L.later(back, wait); return; }
            reset = true;
            g.undo(); busy = false;
            if ((wrong === 2 && shown < 1) || (wrong === 4 && shown < 2)) { showHelp(false); return; }
            redraw();
          }
          L.say(note, back);
          L.later(back, 9000);
        }
        function win() {
          solved = true; busy = false;
          pz.solved++; L.stat('chessPuzzlesSolved', pz.solved);
          var last = k + 1 >= PUZZLE_COUNT;
          st.title = T('Checkmate! Well done.');
          st.lead = wrong === 0 && !shown ? T('You found it at the first try.') : T('You found it.');
          st.hint = '';
          st.actions = [
            last ? { label: T('Continue'), primary: true, gesture: 'open', words: ['continue', 'next', 'yes', 'ok', 'okay', 'go on'], noLabelWords: true, run: function () { L.go(puzzleEnd(k), { clear: true }); } }
              : { label: T('Next puzzle'), primary: true, gesture: 'open', words: ['next', 'next puzzle', 'another', 'yes', 'continue', 'ok', 'okay'], noLabelWords: true, run: function () { L.go(puzzle(k + 1), { clear: true }); } },
            doneAction(L)
          ];
          build(); L.refresh();
          L.say(st.title + ' ' + st.lead);
        }
        function skip() {
          if (solved) return;
          L.log('Puzzle skipped', 'result');
          L.go(k + 1 >= PUZZLE_COUNT ? puzzleEnd(k) : puzzle(k + 1), { clear: true });
        }
        setTurn(); build();
        return st;
      }
      function puzzleEnd(k) {
        var T = L.t, s = pz.solved, n = pz.tried;
        var title = s === n ? (n === 1 ? T('You solved the puzzle!') : T('You solved all {n} puzzles!', { n: n }))
          : s === 0 ? T('That was good practice.') : T('You solved {n} of {total} puzzles.', { n: s, total: n });
        L.log('Puzzles: ' + s + ' solved of ' + n, 'result');
        return {
          id: 'chess-puzzle-end', eyebrow: T('Chess · puzzles'), title: title, lead: T('Thank you, that was fun!'), pic: chessArt(), back: false, airPointer: true,
          say: title + ' ' + T('Thank you, that was fun!'),
          actions: [
            { label: T('Finish'), primary: true, gesture: 'fist', words: DONE_WORDS.concat(['no', 'no thanks']), noLabelWords: true, run: function () { L.finish(); } },
            { label: T('One more puzzle'), gesture: 'thumb', words: ['one more', 'another', 'more', 'one more puzzle', 'again', 'yes'], noLabelWords: true, run: function () { L.go(puzzle(k + 1), { clear: true }); } }
          ]
        };
      }
      return first();
    }
  });
})();
