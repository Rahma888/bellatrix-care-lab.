/* Activity 12: Ludo. The board (cross for 2 or 4 players, six branches for 6), the dice, the game
   on one robot, and the game across robots on the same Wi-Fi: one robot creates the game, the others
   join from a list, Bellatrix plays every free place. The rules are in js/ludo.js (BellatrixLudo);
   the relay between robots is the app's own small server (Java: NetServer, NetDiscovery).

   Board model (shared with js/ludo.js): arm k owns loop cells k*13 .. k*13+12 in the direction of
   play; on each arm: cells 0-5 go outwards along its left column, 6 is the tip, 7-12 come back
   along its right column. A seat starts on cell 8 of its arm; stars on cells 3 and 8; its home
   column is the middle of its arm (5 cells), then the centre.
   The drawing (board, dice, token icons) is the app's js/ludo-board.js (LudoBoard, app 1.11): the
   game during a family call and the family's page draw the same board. */
(function () {
  'use strict';
  var esc = Lab.esc;
  /* An app older than 1.11 has no shared board: then Ludo is not offered rather than broken. */
  var LB = window.LudoBoard;
  if (!LB) { if (window.console) console.error('Ludo needs js/ludo-board.js (Care Lab 1.11 or later).'); return; }
  var COLORS = LB.COLORS, ORDER = LB.ORDER, COLOR_NAME = LB.COLOR_NAME;
  var boardSvg = LB.boardSvg, dieSvg = LB.dieSvg, tokenIcon = LB.tokenIcon;
  var PORT = 8780;

  function ludoArt() {
    var st = { arms: 4, L: 52, seats: ['red', 'green', 'yellow', 'blue'].map(function (c, i) { return { arm: i, color: c, tokens: [i === 0 ? 2 : -1, -1, i === 2 ? 20 : -1, -1] }; }) };
    return boardSvg(st);
  }

  /* ---------- the network (other robots on the same Wi-Fi) ---------- */
  /* The robot app's bridge, looked up when needed (a test page may add it after loading). */
  function bridge() { return window.BellatrixApp || null; }
  function canHost() { var app = bridge(); return !!(app && app.netAnnounce && app.netAddress); }
  function base(ip) { return 'http://' + ip + ':' + PORT; }
  function send(ip, room, body) {
    /* text/plain keeps it a simple request (no CORS preflight); the server stores the JSON as it is. */
    return fetch(base(ip) + '/room/' + room + '/send', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }
  function poll(ip, room, since, wait) {
    var ctl = window.AbortController ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, (wait + 5) * 1000) : null;
    return fetch(base(ip) + '/room/' + room + '/since/' + since + '?wait=' + wait, ctl ? { signal: ctl.signal } : {})
      .then(function (r) { clearTimeout(timer); return r.json(); }, function (e) { clearTimeout(timer); throw e; });
  }
  function games() {
    var list = [];
    var app = bridge();
    try { list = JSON.parse(app && app.netGames ? app.netGames() : '[]') || []; } catch (e) { list = []; }
    return list.filter(function (g) { return g && g.info && g.info.game === 'ludo' && !g.self && g.info.open; });
  }
  /* A laptop has no discovery: ?ludohost=<ip> lists the games that robot offers (room "ludo-games"). */
  function manualGames() {
    var m = /[?&]ludohost=([0-9.]+)/.exec(location.search);
    if (!m) return Promise.resolve([]);
    return poll(m[1], 'ludo-games', 0, 0).then(function (r) {
      var last = r.messages && r.messages.length ? r.messages[r.messages.length - 1].body : null;
      return last && last.open ? [{ ip: m[1], port: PORT, info: last }] : [];
    }).catch(function () { return []; });
  }

  Lab.define({
    key: 'ludo', day: 12, name: 'Ludo', zone: 'COMMUNITY_CIRCLE',
    flow: 'Ludo for 2, 4 or 6 players (cross board, or a six-branch board for six). On one robot, or each player at their own robot on the same Wi-Fi: one robot creates the game, the others join from a list. Bellatrix plays every free place. Roll and choose a token by touch or by pointing.',
    learn: 'Turn-taking and social play across robots, waiting time, pointing at choices, enjoyment.',
    art: function () { return ludoArt(); },
    air: true,
    againQuestion: 'Would you like to play Ludo again another time?',
    /* 1.17: the Care Team is asked one thing, how many people play here; the board follows that
       number and the other fields keep their defaults (hide: true). */
    content: [
      { id: 'where', label: 'Where the players are', type: 'select', value: 'here',
        options: [['here', 'All at this robot'], ['host', 'Each at their own robot: this robot creates the game'], ['join', 'Each at their own robot: join a game from another robot']] },
      { id: 'players', hide: true, label: 'Players in the game', type: 'select', value: '4', options: [['2', '2 players'], ['4', '4 players'], ['6', '6 players (six-branch board)']] },
      { id: 'humans', label: 'Players', type: 'select', value: '1',
        options: [['1', '1 person'], ['2', '2 people'], ['3', '3 people'], ['4', '4 people'], ['5', '5 people'], ['6', '6 people']],
        note: 'The other places are taken by people at other robots, or by Bellatrix.' },
      { id: 'tokens', hide: true, label: 'Tokens per player (game length)', type: 'select', value: '2',
        options: [['1', '1 token: a short game'], ['2', '2 tokens: a medium game'], ['4', '4 tokens: the full game']],
        note: 'About how long, with Bellatrix and easy rules: 2 players 3, 5 or 12 minutes (1, 2 or 4 tokens); 4 players 5, 12 or 35 minutes; 6 players 10, 30 or over 90 minutes.' },
      { id: 'rules', hide: true, label: 'Rules', type: 'select', value: 'easy',
        options: [['easy', 'Easy: leave home with a 6 or a 1, no exact roll to finish'], ['classic', 'Classic: leave home with a 6, exact roll, three sixes lose the turn']] },
      { id: 'level', hide: true, label: 'How Bellatrix plays', type: 'select', value: 'normal', options: [['easy', 'Gently'], ['normal', 'Well']] }
    ],
    start: function (Lraw) {
      var L = Object.create(Lraw), go0 = Lraw.go;
      L.go = function (step, o) { if (step) go0(step, o); };
      var T = L.t;
      if (typeof BellatrixLudo === 'undefined') {
        L.log('Ludo rules (js/ludo.js) not loaded', 'error');
        return { id: 'ludo-missing', title: T('Ludo is not available on this screen.'), center: true, back: false,
          actions: [{ label: T('Finish'), primary: true, noLabelWords: true, run: function () { L.finish(); } }] };
      }
      var WHERE = String(L.text('where') || 'here'), N = parseInt(L.text('players'), 10) || 4, HUM = Math.max(1, parseInt(L.text('humans'), 10) || 1);
      var RULES = String(L.text('rules') || 'easy') === 'classic' ? BellatrixLudo.CLASSIC : BellatrixLudo.EASY, LEVEL = String(L.text('level') || 'normal');
      if ([2, 4, 6].indexOf(N) < 0) N = 4;
      var TOK = parseInt(L.text('tokens'), 10) || 2;
      if ([1, 2, 3, 4].indexOf(TOK) < 0) TOK = 2;
      if (WHERE === 'host' && !canHost()) WHERE = 'here';
      /* The board is not asked any more: it grows to seat everyone who plays here (2, 4 or 6). */
      HUM = Math.min(HUM, 6);
      if (HUM > N) N = HUM > 4 ? 6 : 4;
      var ARMS = N === 6 ? 6 : 4, ARM_OF = N === 2 ? [0, 2] : N === 4 ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5];
      var me = 'R' + Math.random().toString(36).slice(2, 8), session = Math.random(), sessionAlive = function () { return Lab.isOn() && cur.session === session; };
      var cur = { session: session };
      var stageEl = document.getElementById('stage');
      L.stat('ludoPlayers', N); L.stat('ludoWhere', WHERE);

      function seatName(state, si) {
        var s = state.seats[si];
        return T(COLOR_NAME[s.color]) + (s.kind === 'robot' ? ' (Bellatrix)' : '');
      }
      function howTo(phase) {
        if (phase === 'roll' && L.air()) return T('Throw the die with a quick flick of your hand, or point at the button.');
        if (phase === 'roll' && L.hands()) return T('Throw the die with a quick flick of your hand, or show your open hand.');
        return L.air() ? T('Point at a button and hold still.') : T('Touch a button.');
      }

      /* ---------- one game, on this robot or shared with others ----------
         role: 'here' (all here), 'host' (this robot holds the game), 'guest' (another robot holds it).
         owner[seat]: 'here' = people at this robot, 'bellatrix', or a guest robot's id. */
      function game(role, opts) {
        var state = opts.state, owner = opts.owner, ip = opts.ip, room = opts.room, guests = opts.guests || {};
        var busy = false, over = false, note = '', lastDie = null, rolling = 0, since = opts.since || 0;
        var st = { id: 'ludo-game', eyebrow: T('Ludo'), back: false, airPointer: true, noReprompt: true, noAirHint: true, style: 'opts' };
        function mine(si) { return role === 'guest' ? owner[si] === me : owner[si] === 'here'; }
        function botSeat(si) { return owner[si] === 'bellatrix'; }
        function current() { return state.turn; }
        function setView() {
          var si = current(), s = state.seats[si], moves = BellatrixLudo.moves(state), hot = {};
          var myTurn = !over && !busy && mine(si);
          if (myTurn && state.phase === 'move') hot[si] = moves.map(function (m) { return m.token; });
          st.title = over ? st.title : myTurn ? T('{player}, it is your turn.', { player: T(COLOR_NAME[s.color]) }) : T('{player} is playing…', { player: seatName(state, si) });
          st.lead = note;
          st.pic = boardSvg(state, { hot: hot, moving: rolling && rolling.seat !== undefined ? rolling : null });
          st.picCls = 'ludoboard';
          st.body = lastDie ? '<div class="ludodie">' + dieSvg(lastDie.n, COLORS[state.seats[lastDie.seat].color]) + '</div>' : '';
          st.hint = myTurn ? howTo(state.phase) : '';
          st.choices = null; st.actions = [];
          if (over) return;
          if (myTurn && state.phase === 'roll') st.actions = [{ label: T('Roll the die'), primary: true, gesture: 'open', words: ['roll', 'throw', 'dice', 'go'], noLabelWords: true, run: rollHere }];
          if (myTurn && state.phase === 'move') {
            st.choices = moves.map(function (m) {
              var what = m.enters ? T('come out') : m.finishes ? T('go home') : T('move {n}', { n: state.die });
              return { label: T('Token {n}: {what}', { n: m.token + 1, what: what }) + (m.captures && m.captures.length ? ' · ' + T('capture!') : ''),
                icon: tokenIcon(s.color, m.token + 1), run: function () { moveHere(m.token); } };
            });
          }
        }
        function redraw() { setView(); L.refresh(); }
        /* Throwing the die with a flick of the hand (camera on, pointing or hand signs): the middle of
           the palm moving a quarter of the picture within 0.4 s, at most once every 1.5 s. Pointing
           moves slowly and holds still, so it does not throw by mistake. */
        var flick = [], lastFlick = 0;
        st.onHand = function (lm, now) {
          if (!lm || over || busy || state.phase !== 'roll' || !mine(current())) { flick = []; return; }
          var x = (lm[0].x + lm[9].x) / 2, y = (lm[0].y + lm[9].y) / 2;
          flick.push({ x: x, y: y, t: now });
          while (flick.length && now - flick[0].t > 400) flick.shift();
          if (now - lastFlick < 1500 || flick.length < 3) return;
          var far = 0;
          flick.forEach(function (p) { far = Math.max(far, Math.hypot(x - p.x, y - p.y)); });
          if (far > 0.25) { lastFlick = now; flick = []; L.log('Die thrown with a flick of the hand', 'gesture'); L.stat('ludoFlicks'); rollHere(); }
        };

        /* What happened, said aloud in the patient's language (only the notable parts). */
        function tell(events) {
          var parts = [];
          events.forEach(function (e) {
            var who = e.seat !== undefined ? seatName(state, e.seat) : '';
            if (e.type === 'roll') lastDie = { n: e.die, seat: e.seat };
            else if (e.type === 'nomove') parts.push(T('No move possible.'));
            else if (e.type === 'capture') parts.push(T('{by} sends a token of {player} back home!', { by: seatName(state, e.by), player: who }));
            else if (e.type === 'extra') parts.push(e.reason === 'six' ? T('A six: {player} plays again.', { player: who }) : T('{player} plays again.', { player: who }));
            else if (e.type === 'forfeit') parts.push(T('Three sixes: the turn passes.'));
            else if (e.type === 'win') parts.push(T('{player} wins!', { player: who }));
          });
          return parts.join(' ');
        }
        function after(events, spoken) {
          var line = tell(events);
          note = line || note;
          if (state.phase === 'over') return finishGame(line);
          redraw();
          if (line && spoken !== false) L.say(line, next); else next();
        }
        /* Whose move is next: a person here (wait), Bellatrix (only the robot holding the game plays
           for her), or a person at another robot (wait for their message). */
        function next() {
          if (over || !sessionAlive()) return;
          var si = current();
          if (role !== 'guest' && botSeat(si)) { if (busy) return; busy = true; redraw(); L.later(botTurn, 900); return; }
          if (mine(si) && state.phase === 'roll') L.say(T('{player}, it is your turn.', { player: T(COLOR_NAME[state.seats[si].color]) }));
        }
        function rollDie() { return 1 + Math.floor(Math.random() * 6); }
        function animateRoll(n, seat, done) {
          var k = 0;
          (function spin() {
            lastDie = { n: k < 5 ? 1 + Math.floor(Math.random() * 6) : n, seat: seat };
            setView(); L.refresh();
            if (k++ < 5) L.later(spin, 90); else done();
          })();
        }
        function hop(seat, token, from, to, done) {
          if (from < 0 || to <= from) { done(); return; }
          var pos = from;
          (function stepOn() {
            pos++;
            rolling = { seat: seat, token: token, pos: pos };
            setView(); L.refresh();
            if (pos < to) L.later(stepOn, 130); else { rolling = 0; done(); }
          })();
        }
        function apply(fn) {
          var r = fn(state);
          state = r.state;
          if (role === 'host') broadcast(r.events);
          return r.events;
        }
        function botTurn() {
          if (over || !sessionAlive()) return;
          var si = current(), n = rollDie();
          if (state.phase !== 'roll' || !botSeat(si)) return;
          animateRoll(n, si, function () {
            if (state.phase !== 'roll' || state.turn !== si) return;
            var ev = apply(function (s) { return BellatrixLudo.roll(s, n); });
            if (state.phase === 'move' && state.turn === si) {
              redraw();
              var t = BellatrixLudo.bestMove(state, LEVEL), from = state.seats[si].tokens[t];
              L.later(function () {
                var ev2 = apply(function (s) { return BellatrixLudo.move(s, t); });
                var to = state.seats[si].tokens[t];
                hop(si, t, from, to >= 0 ? to : from, function () { busy = false; after(ev.concat(ev2)); });
              }, 700);
            } else { busy = false; after(ev); }
          });
        }
        function rollHere() {
          /* A second tap on a button that is already gone must do nothing. */
          if (busy || over || state.phase !== 'roll' || !mine(current())) return;
          var si = current();
          if (role === 'guest') { busy = true; redraw(); send(ip, room, { type: 'roll', from: me, seat: si, step: state.step }).catch(lost); return; }
          busy = true;
          var n = rollDie();
          animateRoll(n, si, function () {
            var ev = apply(function (s) { return BellatrixLudo.roll(s, n); });
            busy = false;
            after(ev);
          });
        }
        function moveHere(token) {
          if (busy || over || state.phase !== 'move' || !mine(current()) ||
            !BellatrixLudo.moves(state).some(function (x) { return x.token === token; })) return;
          var si = current(), from = state.seats[si].tokens[token];
          if (role === 'guest') { busy = true; redraw(); send(ip, room, { type: 'move', from: me, seat: si, token: token, step: state.step }).catch(lost); return; }
          busy = true;
          var ev = apply(function (s) { return BellatrixLudo.move(s, token); }), to = state.seats[si].tokens[token];
          hop(si, token, from, to >= 0 ? to : from, function () { busy = false; after(ev); });
        }
        function finishGame(line) {
          over = true; busy = false;
          var w = state.winner, winnerHere = w !== null && mine(w);
          var title = w === null ? T('The game is over.') : botSeat(w) ? T('Bellatrix wins with {color}!', { color: T(COLOR_NAME[state.seats[w].color]) }) :
            T('{player} wins!', { player: T(COLOR_NAME[state.seats[w].color]) });
          L.stat('ludoWinner', w === null ? 'none' : (botSeat(w) ? 'Bellatrix' : mine(w) ? 'a player here' : 'a player at another robot') + ' (' + state.seats[w].color + ')');
          L.stat('ludoTurns', state.step);
          L.stat('ludoTokens', state.seats[0].tokens.length);
          L.log('Ludo over: ' + (w === null ? 'no winner' : state.seats[w].color + (botSeat(w) ? ' (Bellatrix)' : '')), 'result');
          st.title = title; st.lead = line || ''; st.hint = ''; st.choices = null;
          st.pic = boardSvg(state, {});
          st.actions = [{ label: T('Finish'), primary: true, gesture: 'open', words: ['finish', 'done', 'yes', 'ok'], noLabelWords: true, run: function () { stopNet(); L.finish(); } }];
          if (role === 'here') st.actions.unshift({ label: T('Another game'), gesture: 'thumb', words: ['again', 'another'], noLabelWords: true, run: function () { L.go(local(), { clear: true }); } });
          L.refresh();
          L.say((winnerHere ? T('Well done!') + ' ' : '') + title + ' ' + T('Thank you for the game!'));
        }
        /* ---- the robot holding the game: tells everyone, and plays what guests ask ---- */
        function broadcast(events) {
          send('127.0.0.1', room, { type: 'state', state: state, owner: owner, events: events || [] }).catch(function () { /* the next state carries everything */ });
        }
        function hostListen() {
          if (!sessionAlive() || over) return;
          poll('127.0.0.1', room, since, 15).then(function (r) {
            since = r.seq || since;
            (r.messages || []).forEach(function (m) { onGuestMessage(m.body || {}); });
            hostListen();
          }, function () { setTimeout(hostListen, 1500); });
        }
        function onGuestMessage(m) {
          if (!m || m.from === undefined || !sessionAlive()) return;
          if (m.type === 'ping') { if (guests[m.from]) guests[m.from].seen = Date.now(); return; }
          if (m.type === 'join') { send('127.0.0.1', room, { type: 'full', to: m.from }); return; }
          if (owner[state.turn] !== m.from || over) return;
          /* A tap sent for an older position of the game (already played) is ignored. */
          if (m.step !== undefined && m.step !== state.step) return;
          /* The other robot may tap while a token here is still moving: keep the tap, play it after. */
          if (busy) { setTimeout(function () { onGuestMessage(m); }, 300); return; }
          if (guests[m.from]) guests[m.from].seen = Date.now();
          if (m.type === 'roll' && state.phase === 'roll') {
            var n = rollDie(), si = state.turn; busy = true;
            animateRoll(n, si, function () { var ev = apply(function (s) { return BellatrixLudo.roll(s, n); }); busy = false; after(ev); });
          } else if (m.type === 'move' && state.phase === 'move' && BellatrixLudo.moves(state).some(function (x) { return x.token === m.token; })) {
            var sj = state.turn, from = state.seats[sj].tokens[m.token]; busy = true;
            var ev = apply(function (s) { return BellatrixLudo.move(s, m.token); }), to = state.seats[sj].tokens[m.token];
            hop(sj, m.token, from, to >= 0 ? to : from, function () { busy = false; after(ev); });
          }
        }
        /* A guest robot that stops answering: Bellatrix takes over its places. */
        function watchGuests() {
          if (!sessionAlive() || over) return;
          Object.keys(guests).forEach(function (g) {
            if (Date.now() - guests[g].seen > 40000 && !guests[g].gone) {
              guests[g].gone = true;
              owner.forEach(function (o, si) { if (o === g) { owner[si] = 'bellatrix'; state.seats[si].kind = 'robot'; } });
              L.log('A robot left the game; Bellatrix plays its places', 'result');
              note = T('A robot left the game. Bellatrix plays its places.');
              broadcast([]);
              redraw();
              if (botSeat(state.turn) && !busy) next();
            }
          });
          setTimeout(watchGuests, 5000);
        }
        /* ---- a guest robot: shows what the host sends, and sends its own choices ---- */
        function guestListen() {
          if (!sessionAlive() || over) return;
          poll(ip, room, since, 15).then(function (r) {
            since = r.seq || since;
            var lastState = null;
            (r.messages || []).forEach(function (m) { var b = m.body || {}; if (b.type === 'state' && (!lastState || b.state.step >= lastState.state.step)) lastState = b; });
            if (lastState && lastState.state.step >= state.step) {
              var prev = state; state = lastState.state; owner = lastState.owner; busy = false;
              var ev = lastState.events || [], moved = ev.filter(function (e) { return e.type === 'move'; })[0];
              if (moved && prev.step !== state.step) hop(moved.seat, moved.token, moved.from, moved.to, function () { after(ev); });
              else after(ev);
            }
            guestListen();
          }, function () { setTimeout(guestListen, 1500); });
        }
        function lost() { note = T('The connection to the other robot is slow. Trying again…'); busy = false; redraw(); }
        function ping() { if (!sessionAlive() || over) return; send(ip, room, { type: 'ping', from: me }).catch(function () {}); setTimeout(ping, 10000); }
        function stopNet() { over = true; var app = bridge(); if (role === 'host' && app && app.netAnnounce) try { app.netAnnounce(''); } catch (e) { /* no network */ } }
        cur.stop = stopNet;

        setView();
        st.say = role === 'guest' ? T('The game begins.') : T('The game begins. {player} starts.', { player: seatName(state, state.turn) });
        /* The network loops start now, not after the opening sentence: a tap on "Roll the die" cuts
           the sentence short, and then nothing that waits for its end would ever run. */
        if (role === 'host') { hostListen(); watchGuests(); }
        if (role === 'guest') { guestListen(); ping(); }
        st.afterSay = next;
        st.leave = function () { /* the network loops end by themselves when the session ends */ };
        return st;
      }

      /* ---------- on this robot only ---------- */
      function makeState(owner) {
        var seats = ARM_OF.map(function (arm, i) {
          var o = owner[i];
          return { id: 'S' + i, arm: arm, color: ORDER[ARMS === 4 ? arm : i], kind: o === 'bellatrix' ? 'robot' : 'human', name: '' };
        });
        return BellatrixLudo.create({ arms: ARMS, seats: seats, rules: RULES, tokens: TOK });
      }
      function local() {
        var owner = ARM_OF.map(function (a, i) { return i < HUM ? 'here' : 'bellatrix'; });
        return game('here', { state: makeState(owner), owner: owner });
      }
      function intro() {
        var people = HUM === 1 ? T('one person') : T('{n} people', { n: HUM }), bots = N - HUM;
        var lead = WHERE === 'join' ? T('You join a game that another robot has created.') :
          T('{n} players: {people} here', { n: N, people: people }) + (WHERE === 'host' ? T(', the others at other robots or Bellatrix.') : bots ? T(', and Bellatrix plays the other {m}.', { m: bots }) : '.');
        return {
          id: 'ludo-intro', eyebrow: T('Ludo'), title: T('A game of Ludo'), lead: lead,
          pic: ludoArt(), back: false, airPointer: true, say: T('Let us play Ludo.'),
          actions: [{ label: T('Let’s start'), primary: true, gesture: 'open', words: ['start', 'begin', 'yes', 'ready', 'ok', 'okay', 'go'], noLabelWords: true,
            run: function () { L.go(WHERE === 'host' ? hostLobby() : WHERE === 'join' ? joinList() : local(), { clear: true }); } }]
        };
      }

      /* ---------- this robot creates the game: a waiting room until the care team or patient starts ---------- */
      function hostLobby() {
        var room = 'ludo-' + Math.random().toString(36).slice(2, 8), name = '', guests = {}, since = 0, owner = ARM_OF.map(function (a, i) { return i < HUM ? 'here' : null; }), started = false;
        var app = bridge() || {};
        try { name = app.netRobotName ? app.netRobotName() : ''; } catch (e) { name = ''; }
        var st = { id: 'ludo-lobby', eyebrow: T('Ludo · waiting room'), title: T('Waiting for the other robots'), back: false, airPointer: true, noReprompt: true, style: 'opts' };
        function free() { return owner.filter(function (o) { return o === null; }).length; }
        function announce() {
          if (started || !sessionAlive()) return;
          var info = { game: 'ludo', room: room, robot: name, players: N, free: free(), open: free() > 0, lang: L.lang() };
          try { app.netAnnounce(JSON.stringify(info)); } catch (e) { /* no network */ }
          send('127.0.0.1', 'ludo-games', info).catch(function () {});
          setTimeout(announce, 5000);
        }
        function view() {
          st.lead = T('{free} of {n} places are free. Other robots on this Wi-Fi can join now. When you start, Bellatrix plays the free places.', { free: free(), n: N });
          st.choices = owner.map(function (o, i) {
            var c = ORDER[ARMS === 4 ? ARM_OF[i] : i];
            return { label: T(COLOR_NAME[c]) + ': ' + (o === 'here' ? T('here') : o === null ? T('free') : (guests[o] && guests[o].robot ? guests[o].robot : T('another robot'))), icon: tokenIcon(c, i + 1), disabled: true, run: function () {} };
          });
          st.actions = [{ label: T('Start the game'), primary: true, gesture: 'open', words: ['start', 'begin', 'go'], noLabelWords: true, run: begin }];
        }
        function listen() {
          if (started || !sessionAlive()) return;
          poll('127.0.0.1', room, since, 15).then(function (r) {
            since = r.seq || since;
            (r.messages || []).forEach(function (m) {
              var b = m.body || {};
              if (started) return; /* the game answers from now on */
              if (b.type === 'ping' && guests[b.from]) { guests[b.from].seen = Date.now(); return; }
              if (b.type !== 'join' || guests[b.from]) return;
              var want = Math.max(1, Math.min(6, b.humans || 1)), got = [];
              owner.forEach(function (o, i) { if (o === null && got.length < want) { owner[i] = b.from; got.push(i); } });
              guests[b.from] = { robot: b.robot || '', seen: Date.now(), seats: got };
              send('127.0.0.1', room, { type: 'welcome', to: b.from, seats: got, players: N });
              L.log('A robot joined: ' + (b.robot || 'unknown') + ', ' + got.length + ' place(s)', 'result');
              L.say(T('Another robot joined the game.'));
            });
            /* A robot that left the waiting room (no news for 40 s) gives its places back. */
            Object.keys(guests).forEach(function (g) {
              if (Date.now() - guests[g].seen > 40000) {
                owner = owner.map(function (o) { return o === g ? null : o; });
                delete guests[g];
                L.log('A robot left the waiting room', 'result');
              }
            });
            if (!started) { view(); L.refresh(); }
            listen();
          }, function () { setTimeout(listen, 1500); });
        }
        function begin() {
          if (started) return;
          started = true;
          /* Everyone in the waiting room counts as present when the game starts. */
          Object.keys(guests).forEach(function (g) { guests[g].seen = Date.now(); });
          owner = owner.map(function (o) { return o === null ? 'bellatrix' : o; });
          try { app.netAnnounce(''); } catch (e) { /* no network */ }
          send('127.0.0.1', 'ludo-games', { game: 'ludo', room: room, open: false }).catch(function () {});
          var state = makeState(owner);
          L.stat('ludoGuests', Object.keys(guests).length);
          var g = game('host', { state: state, owner: owner, room: room, guests: guests, since: since });
          send('127.0.0.1', room, { type: 'state', state: state, owner: owner, events: [] }).catch(function () {});
          L.go(g, { clear: true });
        }
        view();
        st.say = T('I am waiting for the other robots. Start the game when everyone is ready.');
        announce(); listen();
        return st;
      }

      /* ---------- this robot joins a game created by another robot ---------- */
      function joinList() {
        var st = { id: 'ludo-join', eyebrow: T('Ludo · join a game'), title: T('Looking for games on this Wi-Fi…'), back: false, airPointer: true, noReprompt: true, style: 'opts' };
        var found = [], timer = null, joined = null;
        function view() {
          st.title = found.length ? T('Choose the game to join.') : T('Looking for games on this Wi-Fi…');
          st.lead = found.length ? '' : T('No game yet. Ask the care team at the other robot to create one.');
          st.choices = found.map(function (g) {
            var where = g.info.robot || g.ip;
            return { label: g.info.free === 1 ? T('Game at {robot}: 1 free place', { robot: where }) : T('Game at {robot}: {free} free places', { robot: where, free: g.info.free }), icon: tokenIcon('green', '+'), run: function () { join(g); } };
          });
          st.actions = [];
        }
        function scan() {
          if (joined || !sessionAlive()) return;
          manualGames().then(function (more) {
            var list = games().concat(more), seen = {};
            found = list.filter(function (g) { var k = g.ip + g.info.room; if (seen[k]) return false; seen[k] = 1; return true; });
            if (L.step() === st) { view(); L.refresh(); }
            timer = setTimeout(scan, 2000);
          });
        }
        function join(g) {
          if (joined) return;
          joined = g;
          var ip = g.ip, room = g.info.room, since = 0, pinging = false, began = false;
          /* A laptop has no robot name: the host then shows "another robot". */
          var app = bridge(), robot = ''; try { robot = app && app.netRobotName ? app.netRobotName() : ''; } catch (e) { robot = ''; }
          st.title = T('Joining the game…'); st.lead = ''; st.choices = []; L.refresh();
          send(ip, room, { type: 'join', from: me, robot: robot, humans: HUM, lang: L.lang() }).catch(function () {
            joined = null; st.title = T('That robot did not answer.'); L.refresh(); scan();
          });
          (function wait() {
            if (!sessionAlive()) return;
            poll(ip, room, since, 15).then(function (r) {
              since = r.seq || since;
              var start = null, welcome = null, full = false;
              (r.messages || []).forEach(function (m) {
                var b = m.body || {};
                if (b.type === 'welcome' && b.to === me) welcome = b;
                if (b.type === 'full' && b.to === me) full = true;
                if (b.type === 'state') start = b;
              });
              if (full) { st.title = T('That game is full.'); joined = null; L.refresh(); scan(); return; }
              if (welcome && !pinging) {
                pinging = true;
                (function lobbyPing() {
                  if (!sessionAlive() || began) return;
                  send(ip, room, { type: 'ping', from: me }).catch(function () {});
                  setTimeout(lobbyPing, 10000);
                })();
              }
              if (welcome) {
                st.title = T('You have joined. Waiting for the game to start…');
                st.lead = T('Your colour: {colors}.', { colors: welcome.seats.map(function (si) { return T(COLOR_NAME[ORDER[welcome.players === 6 ? si : (welcome.players === 2 ? [0, 2][si] : si)]]); }).join(', ') });
                L.refresh(); L.say(st.title + ' ' + st.lead);
              }
              if (start && start.owner.indexOf(me) >= 0) {
                began = true;
                L.go(game('guest', { state: start.state, owner: start.owner, ip: ip, room: room, since: since }), { clear: true });
                return;
              }
              wait();
            }, function () { setTimeout(wait, 1500); });
          })();
        }
        view();
        st.say = T('I am looking for a Ludo game on this Wi-Fi.');
        scan();
        st.leave = function () { clearTimeout(timer); };
        return st;
      }
      return intro();
    }
  });
})();
