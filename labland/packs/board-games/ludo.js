/*
 * ludo.js - BellatrixLudo
 * Ludo rules engine with a simple computer player for the Bellatrix Care Lab app.
 * Plain ES5 browser script (Android 9 WebView / Chrome 95), no DOM access.
 *
 * Every game state is a plain JSON object (it travels between robots as JSON).
 * Functions never change their input: roll() and move() return a NEW state.
 *
 * Public API:
 *   BellatrixLudo.create({ arms: 4|6, seats: [{ id, arm, color, kind, name }], rules, tokens: 1..4 }) -> state
 *     tokens: tokens per player (default 4); fewer tokens make a shorter game.
 *   BellatrixLudo.roll(state, die)    -> { state, events }   die 1..6 drawn by the caller
 *   BellatrixLudo.moves(state)        -> [{ token, from, to, enters, finishes, captures, safe }]
 *   BellatrixLudo.move(state, token)  -> { state, events }
 *   BellatrixLudo.absolute(state, seatIndex, pos) -> loop cell index or null
 *   BellatrixLudo.isSafe(state, abs)  -> bool
 *   BellatrixLudo.bestMove(state, 'easy' | 'normal' [, rand]) -> token index or null
 *   BellatrixLudo.EASY, BellatrixLudo.CLASSIC  (rule presets, frozen)
 *
 * Board model:
 *   L = 13 * arms loop cells (52 or 78). Arm k owns cells k*13 .. k*13+12.
 *   A seat's START cell is (arm*13 + 8) % L. Token pos = steps from its own start:
 *     -1 yard, 0 .. L-2 loop (absolute (arm*13 + 8 + pos) % L),
 *     L-1 .. L+3 own home column (index pos-(L-1), 0 = outer), L+4 finished.
 *   Safe cells (stars): abs % 13 === 8 (start cells) or abs % 13 === 3.
 *
 * Notes:
 *   - "seat" in events, captures and state.winner is the seat INDEX in state.seats.
 *   - Capture is decided per opponent: on a non-safe loop cell, every other player
 *     that has exactly one token there loses it to the yard; a player with two or
 *     more tokens there is not captured (the tokens share the cell).
 *   - moves()[i].safe is true when the token cannot be captured where it lands
 *     (a star cell, the home column or the centre).
 *   - Entering emits only an 'enter' event (no 'move' event). A token that jumps
 *     from the loop straight to the centre emits 'finish' without 'home'.
 *   - 'turn' is emitted only when the turn passes to another seat, not for an
 *     extra roll ('extra' is emitted instead).
 */
var BellatrixLudo = (function () {
  'use strict';

  var TOKENS = 4;
  var ARM_CELLS = 13;
  var START_OFFSET = 8;
  var STAR_OFFSET = 3;
  var LEVEL_EASY_RANDOM = 0.3;

  function freezeRules(r) {
    if (Object.freeze) { Object.freeze(r.enter); Object.freeze(r); }
    return r;
  }

  var EASY = freezeRules({ enter: [6, 1], extraOnSix: true, extraOnCapture: false, threeSixes: false, exact: false });
  var CLASSIC = freezeRules({ enter: [6], extraOnSix: true, extraOnCapture: true, threeSixes: true, exact: true });
  var BOOL_RULES = ['extraOnSix', 'extraOnCapture', 'threeSixes', 'exact'];

  // ----------------------------------------------------------------- helpers
  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

  function indexOf(arr, v) {
    for (var i = 0; i < arr.length; i++) if (arr[i] === v) return i;
    return -1;
  }

  function fail(fn, msg) { throw new Error('BellatrixLudo.' + fn + ': ' + msg); }

  function checkState(state, fn) {
    if (!state || typeof state !== 'object' || !Array.isArray(state.seats) || !state.seats.length ||
        !isInt(state.L) || !isInt(state.turn) || state.turn < 0 || state.turn >= state.seats.length ||
        !state.rules) {
      fail(fn, 'not a Ludo state');
    }
  }

  function normRules(r) {
    var out = { enter: EASY.enter.slice(), extraOnSix: EASY.extraOnSix, extraOnCapture: EASY.extraOnCapture,
                threeSixes: EASY.threeSixes, exact: EASY.exact };
    if (r === undefined || r === null) return out;
    if (typeof r !== 'object') fail('create', 'rules must be an object');
    if (r.enter !== undefined) {
      if (!Array.isArray(r.enter)) fail('create', 'rules.enter must be an array of die values');
      var enter = [];
      for (var i = 0; i < r.enter.length; i++) {
        var d = r.enter[i];
        if (!isInt(d) || d < 1 || d > 6) fail('create', 'rules.enter values must be 1..6');
        if (indexOf(enter, d) < 0) enter.push(d);
      }
      if (!enter.length) fail('create', 'rules.enter must not be empty');
      out.enter = enter;
    }
    for (var k = 0; k < BOOL_RULES.length; k++) {
      if (r[BOOL_RULES[k]] !== undefined) out[BOOL_RULES[k]] = !!r[BOOL_RULES[k]];
    }
    return out;
  }

  function yard(n) { var t = []; for (var i = 0; i < n; i++) t.push(-1); return t; }

  function str(v, dflt) { return v === undefined || v === null ? dflt : String(v); }

  // Loop index of a seat's token position (no validation; pos must be 0..L-2).
  function absOf(state, seatIndex, pos) {
    return (state.seats[seatIndex].arm * ARM_CELLS + START_OFFSET + pos) % state.L;
  }

  function safeCell(abs) {
    var r = abs % ARM_CELLS;
    return r === START_OFFSET || r === STAR_OFFSET;
  }

  function onLoop(state, pos) { return pos >= 0 && pos <= state.L - 2; }

  // Opponent tokens that a token of seat `me` would capture by landing on loop cell `abs`.
  function victimsAt(state, me, abs) {
    var out = [];
    for (var j = 0; j < state.seats.length; j++) {
      if (j === me) continue;
      var toks = state.seats[j].tokens, found = [];
      for (var k = 0; k < toks.length; k++) {
        if (onLoop(state, toks[k]) && absOf(state, j, toks[k]) === abs) found.push(k);
      }
      if (found.length === 1) out.push({ seat: j, token: found[0] });
    }
    return out;
  }

  function legal(state) {
    if (state.phase !== 'move') return [];
    var L = state.L, FIN = L + 4, me = state.turn, die = state.die;
    var toks = state.seats[me].tokens, out = [];
    if (!isInt(die) || die < 1 || die > 6) return [];
    for (var t = 0; t < toks.length; t++) {
      var from = toks[t], to;
      if (from === -1) {
        if (indexOf(state.rules.enter, die) < 0) continue;
        to = 0;
      } else if (from >= FIN) {
        continue;
      } else {
        to = from + die;
        if (to > FIN) {
          if (state.rules.exact) continue;
          to = FIN;
        }
      }
      var abs = onLoop(state, to) ? absOf(state, me, to) : null;
      var safe = abs === null || safeCell(abs);
      out.push({ token: t, from: from, to: to, enters: from === -1, finishes: to === FIN,
                 captures: safe ? [] : victimsAt(state, me, abs), safe: safe });
    }
    return out;
  }

  function passTurn(s, events) {
    s.turn = (s.turn + 1) % s.seats.length;
    s.phase = 'roll';
    s.die = null;
    s.sixes = 0;
    events.push({ type: 'turn', seat: s.turn });
  }

  // --------------------------------------------------------------- public API
  function create(opts) {
    opts = opts || {};
    var arms = opts.arms === undefined ? 4 : opts.arms;
    if (arms !== 4 && arms !== 6) fail('create', 'arms must be 4 or 6');
    var seatsIn = opts.seats;
    if (!Array.isArray(seatsIn) || seatsIn.length < 1 || seatsIn.length > arms) {
      fail('create', 'seats must be an array of 1..' + arms + ' seats');
    }
    var count = opts.tokens === undefined ? TOKENS : opts.tokens;
    if (!isInt(count) || count < 1 || count > TOKENS) fail('create', 'tokens must be 1..' + TOKENS);
    var used = {}, seats = [];
    for (var i = 0; i < seatsIn.length; i++) {
      var si = seatsIn[i] || {};
      if (!isInt(si.arm) || si.arm < 0 || si.arm >= arms) fail('create', 'seat ' + i + ' has an invalid arm');
      if (used[si.arm]) fail('create', 'two seats on arm ' + si.arm);
      used[si.arm] = true;
      seats.push({ id: str(si.id, 'S' + i), arm: si.arm, color: str(si.color, ''),
                   kind: str(si.kind, 'human'), name: str(si.name, ''), tokens: yard(count) });
    }
    return { v: 1, arms: arms, L: ARM_CELLS * arms, seats: seats, turn: 0, phase: 'roll', die: null,
             sixes: 0, winner: null, rules: normRules(opts.rules), step: 0 };
  }

  function roll(state, die) {
    checkState(state, 'roll');
    if (state.phase !== 'roll') fail('roll', 'phase is ' + state.phase + ', not roll');
    if (!isInt(die) || die < 1 || die > 6) fail('roll', 'die must be an integer 1..6');
    var s = copy(state), me = s.turn, events = [{ type: 'roll', seat: me, die: die }];
    s.step = (s.step || 0) + 1;
    s.die = die;
    s.sixes = die === 6 ? (s.sixes || 0) + 1 : 0;
    if (die === 6 && s.rules.threeSixes && s.sixes >= 3) {
      events.push({ type: 'forfeit', seat: me, reason: 'three sixes' });
      passTurn(s, events);
    } else {
      s.phase = 'move';
      if (!legal(s).length) {
        events.push({ type: 'nomove', seat: me });
        passTurn(s, events);
      }
    }
    return { state: s, events: events };
  }

  function moves(state) {
    checkState(state, 'moves');
    return legal(state);
  }

  function move(state, token) {
    checkState(state, 'move');
    if (state.phase !== 'move') fail('move', 'phase is ' + state.phase + ', not move');
    if (typeof token === 'string' && /^[0-9]$/.test(token)) token = +token;
    var list = legal(state), m = null;
    for (var i = 0; i < list.length; i++) if (list[i].token === token) m = list[i];
    if (!m) fail('move', 'token ' + token + ' cannot move');

    var s = copy(state), me = s.turn, L = s.L, toks = s.seats[me].tokens, events = [];
    toks[token] = m.to;
    if (m.enters) events.push({ type: 'enter', seat: me, token: token });
    else events.push({ type: 'move', seat: me, token: token, from: m.from, to: m.to });
    for (var c = 0; c < m.captures.length; c++) {
      var v = m.captures[c];
      s.seats[v.seat].tokens[v.token] = -1;
      events.push({ type: 'capture', seat: v.seat, token: v.token, by: me });
    }
    if (m.from < L - 1 && m.to >= L - 1 && m.to <= L + 3) events.push({ type: 'home', seat: me, token: token });
    if (m.finishes) events.push({ type: 'finish', seat: me, token: token });
    s.step = (s.step || 0) + 1;

    var done = 0;
    for (var t = 0; t < toks.length; t++) if (toks[t] === L + 4) done++;
    if (done === toks.length) {
      s.winner = me;
      s.phase = 'over';
      s.die = null;
      events.push({ type: 'win', seat: me });
      return { state: s, events: events };
    }

    var extra = null;
    if (s.die === 6 && s.rules.extraOnSix) extra = 'six';
    else if (m.captures.length && s.rules.extraOnCapture) extra = 'capture';
    if (extra) {
      s.phase = 'roll';
      s.die = null;
      events.push({ type: 'extra', seat: me, reason: extra });
    } else {
      passTurn(s, events);
    }
    return { state: s, events: events };
  }

  function absolute(state, seatIndex, pos) {
    checkState(state, 'absolute');
    if (!isInt(seatIndex) || seatIndex < 0 || seatIndex >= state.seats.length) return null;
    if (!isInt(pos) || !onLoop(state, pos)) return null;
    return absOf(state, seatIndex, pos);
  }

  function isSafe(state, abs) {
    if (!isInt(abs) || abs < 0 || (state && isInt(state.L) && abs >= state.L)) return false;
    return safeCell(abs);
  }

  // ---------------------------------------------------------- computer player
  // Could an opponent of `me` capture a lone token on loop cell `abs` with one roll?
  // `gone` lists opponent tokens to ignore (just captured).
  function threatened(state, me, abs, gone) {
    var L = state.L;
    for (var j = 0; j < state.seats.length; j++) {
      if (j === me) continue;
      var toks = state.seats[j].tokens;
      for (var k = 0; k < toks.length; k++) {
        var p = toks[k];
        if (!onLoop(state, p)) continue;
        var skip = false;
        for (var g = 0; g < gone.length; g++) if (gone[g].seat === j && gone[g].token === k) skip = true;
        if (skip) continue;
        var d = (abs - absOf(state, j, p) + L) % L;
        if (d >= 1 && d <= 6 && p + d <= L - 2) return true;
      }
    }
    return false;
  }

  // Does seat `me` have a token other than `token` on loop cell `abs`?
  function ownCompany(state, me, token, abs) {
    var toks = state.seats[me].tokens;
    for (var k = 0; k < toks.length; k++) {
      if (k !== token && onLoop(state, toks[k]) && absOf(state, me, toks[k]) === abs) return true;
    }
    return false;
  }

  function tokenInDanger(state, me, token) {
    var pos = state.seats[me].tokens[token];
    if (!onLoop(state, pos)) return false;
    var abs = absOf(state, me, pos);
    if (safeCell(abs) || ownCompany(state, me, token, abs)) return false;
    return threatened(state, me, abs, []);
  }

  function landsInDanger(state, m) {
    if (m.safe) return false;
    var me = state.turn, abs = absOf(state, me, m.to);
    if (ownCompany(state, me, m.token, abs)) return false;
    return threatened(state, me, abs, m.captures);
  }

  function mostAdvanced(list) {
    var best = list[0];
    for (var i = 1; i < list.length; i++) if (list[i].from > best.from) best = list[i];
    return best;
  }

  function normalChoice(state, list) {
    var i, pick = [];
    // 1. finish a token
    for (i = 0; i < list.length; i++) if (list[i].finishes) return list[i];
    // 2. capture, preferring the most advanced victim, then a safe landing
    var best = null, bestScore = -1;
    for (i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m.captures.length) continue;
      var score = 0;
      for (var c = 0; c < m.captures.length; c++) {
        var v = m.captures[c];
        score = Math.max(score, state.seats[v.seat].tokens[v.token]);
      }
      score = score * 2 + (landsInDanger(state, m) ? 0 : 1);
      if (score > bestScore) { best = m; bestScore = score; }
    }
    if (best) return best;
    // 3. enter a token from the yard
    for (i = 0; i < list.length; i++) if (list[i].enters) return list[i];
    // 4. rescue a token in danger (to safety or out of reach)
    for (i = 0; i < list.length; i++) {
      if (tokenInDanger(state, state.turn, list[i].token) && !landsInDanger(state, list[i])) pick.push(list[i]);
    }
    if (pick.length) return mostAdvanced(pick);
    // 5. advance the most advanced token that does not land in danger
    for (i = 0; i < list.length; i++) if (!landsInDanger(state, list[i])) pick.push(list[i]);
    if (pick.length) return mostAdvanced(pick);
    // 6. anything
    return mostAdvanced(list);
  }

  function bestMove(state, level, rand) {
    checkState(state, 'bestMove');
    var list = legal(state);
    if (!list.length) return null;
    if (list.length === 1) return list[0].token;
    if (typeof rand !== 'function') rand = Math.random;
    if (level === 'easy' && rand() < LEVEL_EASY_RANDOM) {
      return list[Math.min(list.length - 1, Math.floor(rand() * list.length))].token;
    }
    return normalChoice(state, list).token;
  }

  return {
    create: create,
    roll: roll,
    moves: moves,
    move: move,
    absolute: absolute,
    isSafe: isSafe,
    bestMove: bestMove,
    EASY: EASY,
    CLASSIC: CLASSIC
  };
})();

if (typeof module !== 'undefined') module.exports = BellatrixLudo;
