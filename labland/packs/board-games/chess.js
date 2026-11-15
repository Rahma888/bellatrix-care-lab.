/*
 * chess.js - BellatrixChess
 * Small, self-contained chess rules engine with a computer opponent for the
 * Bellatrix Care Lab app. Plain ES5 browser script, no DOM access.
 *
 * Public API (squares are 'a1'..'h8'):
 *   var g = BellatrixChess.create(fen)  // fen optional (start position); throws Error on an invalid FEN
 *   g.fen() g.turn() g.pieceAt(sq) g.board() g.moves(from) g.move({from, to, promotion})
 *   g.undo() g.history() g.lastMove() g.inCheck() g.kingSquare(color) g.status() g.clone()
 *   BellatrixChess.perft(g, depth)
 *   BellatrixChess.bestMove(g, 'easy' | 'medium' | 'hard')   // move object, or null when there is none
 *   BellatrixChess.think(g, level)    // { move, score, depth, nodes, ms, level }; a forced move
 *                                     // (the only legal or only safe one) has depth 0 and score 0
 *   BellatrixChess.matingMoves(g)     // every move that checkmates at once
 *
 * Every level plays a mate in one, never allows a mate in one that can be avoided and never
 * leaves a queen or rook hanging or a free one untaken (it searches at least 2 plies plus
 * captures). Easy sometimes picks a slightly weaker move, medium searches 4 plies, hard
 * searches as deep as it can in about half a second (wall-clock limits, see LEVELS).
 *
 * Internal board: 0x88 array, index = row * 16 + file, row 0 = rank 8 (a8 = 0, h1 = 119).
 * Pieces: type 1..6 (p n b r q k), +8 for black, 0 = empty.
 * Internal moves are integers: from | to << 7 | promotion << 14 | flags << 17.
 */
var BellatrixChess = (function () {
  'use strict';

  // ---------------------------------------------------------------- constants
  var WHITE = 0, BLACK = 1;
  var PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  var TYPE_CHARS = '.pnbrqk';

  // Internal flag bits, in the same order as the public flag letters 'ncbepkq'.
  var F_NORMAL = 1, F_CAPTURE = 2, F_BIG_PAWN = 4, F_EP = 8, F_PROMO = 16, F_KSIDE = 32, F_QSIDE = 64;
  var FLAG_CHARS = 'ncbepkq';

  var DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  var KNIGHT_OFFSETS = [-33, -31, -18, -14, 14, 18, 31, 33];
  var KING_OFFSETS = [-17, -16, -15, -1, 1, 15, 16, 17];
  var BISHOP_DIRS = [-17, -15, 15, 17];
  var ROOK_DIRS = [-16, -1, 1, 16];

  // Castling rights bits.
  var C_WK = 1, C_WQ = 2, C_BK = 4, C_BQ = 8;
  var A8 = 0, B8 = 1, C8 = 2, D8 = 3, E8 = 4, F8 = 5, G8 = 6, H8 = 7;
  var A1 = 112, B1 = 113, C1 = 114, D1 = 115, E1 = 116, F1 = 117, G1 = 118, H1 = 119;

  // rights &= CASTLE_MASK[from] & CASTLE_MASK[to] after every move.
  var CASTLE_MASK = [];
  (function () {
    for (var i = 0; i < 128; i++) CASTLE_MASK[i] = 15;
    CASTLE_MASK[E1] = 15 & ~(C_WK | C_WQ);
    CASTLE_MASK[H1] = 15 & ~C_WK;
    CASTLE_MASK[A1] = 15 & ~C_WQ;
    CASTLE_MASK[E8] = 15 & ~(C_BK | C_BQ);
    CASTLE_MASK[H8] = 15 & ~C_BK;
    CASTLE_MASK[A8] = 15 & ~C_BQ;
  })();

  // ------------------------------------------------------------ zobrist keys
  // Two 32-bit halves per key (deterministic xorshift32 generator).
  var zState = 0x6d2b79f5 | 0;
  function zRand() {
    zState ^= zState << 13;
    zState ^= zState >>> 17;
    zState ^= zState << 5;
    return zState | 0;
  }
  var ZP_LO = new Int32Array(16 * 128), ZP_HI = new Int32Array(16 * 128); // [piece << 7 | square]
  var ZC_LO = new Int32Array(16), ZC_HI = new Int32Array(16);             // castling rights
  var ZE_LO = new Int32Array(8), ZE_HI = new Int32Array(8);               // en-passant file
  var ZS_LO, ZS_HI;                                                       // black to move
  (function () {
    var i;
    for (i = 0; i < 16 * 128; i++) { ZP_LO[i] = zRand(); ZP_HI[i] = zRand(); }
    for (i = 0; i < 16; i++) { ZC_LO[i] = zRand(); ZC_HI[i] = zRand(); }
    for (i = 0; i < 8; i++) { ZE_LO[i] = zRand(); ZE_HI[i] = zRand(); }
    ZS_LO = zRand(); ZS_HI = zRand();
  })();

  // ----------------------------------------------------------------- helpers
  function sqName(sq) {
    return 'abcdefgh'.charAt(sq & 7) + (8 - (sq >> 4));
  }

  function parseSq(s) {
    if (typeof s !== 'string' || s.length !== 2) return -1;
    var f = s.charCodeAt(0) - 97, r = s.charCodeAt(1) - 49;
    if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
    return ((7 - r) << 4) | f;
  }

  function pieceObj(pc) {
    return { color: pc & 8 ? 'b' : 'w', type: TYPE_CHARS.charAt(pc & 7) };
  }

  function copyObj(o) {
    var c = {}, k;
    for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k];
    return c;
  }

  // ---------------------------------------------------------------- position
  function Pos() {
    this.b = new Int8Array(128);
    this.turn = WHITE;
    this.castle = 0;
    this.ep = -1;          // en-passant target square or -1
    this.half = 0;         // halfmove clock
    this.full = 1;         // fullmove number
    this.kings = [-1, -1];
    this.hLo = 0;          // zobrist hash of placement + side + castling (no en passant)
    this.hHi = 0;
    this.stack = [];       // undo records
    this.keyLo = [];       // repetition keys, one per position (index 0 = start position)
    this.keyHi = [];
  }

  function Undo(m, cap, castle, ep, half, full, lo, hi) {
    this.m = m; this.cap = cap; this.castle = castle; this.ep = ep;
    this.half = half; this.full = full; this.lo = lo; this.hi = hi;
  }

  function clonePos(p) {
    var q = new Pos();
    q.b = new Int8Array(p.b);
    q.turn = p.turn; q.castle = p.castle; q.ep = p.ep; q.half = p.half; q.full = p.full;
    q.kings = p.kings.slice();
    q.hLo = p.hLo; q.hHi = p.hHi;
    q.stack = p.stack.slice();   // undo records are never mutated, sharing them is safe
    q.keyLo = p.keyLo.slice();
    q.keyHi = p.keyHi.slice();
    return q;
  }

  function computeHash(p) {
    var lo = 0, hi = 0, sq, pc, k;
    for (sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      pc = p.b[sq];
      if (pc !== 0) { k = (pc << 7) | sq; lo ^= ZP_LO[k]; hi ^= ZP_HI[k]; }
    }
    lo ^= ZC_LO[p.castle]; hi ^= ZC_HI[p.castle];
    if (p.turn === BLACK) { lo ^= ZS_LO; hi ^= ZS_HI; }
    p.hLo = lo; p.hHi = hi;
  }

  // Is square sq attacked by any piece of colour `by`?
  function attacked(b, sq, by) {
    var s, d, i, pc, bits = by << 3;
    if (by === WHITE) {
      s = sq + 15; if (!(s & 0x88) && b[s] === PAWN) return true;
      s = sq + 17; if (!(s & 0x88) && b[s] === PAWN) return true;
    } else {
      s = sq - 15; if (!(s & 0x88) && b[s] === (PAWN | 8)) return true;
      s = sq - 17; if (!(s & 0x88) && b[s] === (PAWN | 8)) return true;
    }
    var kn = KNIGHT | bits, kg = KING | bits;
    for (i = 0; i < 8; i++) {
      s = sq + KNIGHT_OFFSETS[i];
      if (!(s & 0x88) && b[s] === kn) return true;
      s = sq + KING_OFFSETS[i];
      if (!(s & 0x88) && b[s] === kg) return true;
    }
    var bi = BISHOP | bits, rk = ROOK | bits, qn = QUEEN | bits;
    for (i = 0; i < 4; i++) {
      d = BISHOP_DIRS[i]; s = sq + d;
      while (!(s & 0x88)) {
        pc = b[s];
        if (pc !== 0) { if (pc === bi || pc === qn) return true; break; }
        s += d;
      }
      d = ROOK_DIRS[i]; s = sq + d;
      while (!(s & 0x88)) {
        pc = b[s];
        if (pc !== 0) { if (pc === rk || pc === qn) return true; break; }
        s += d;
      }
    }
    return false;
  }

  function inCheck(p) {
    return attacked(p.b, p.kings[p.turn], p.turn ^ 1);
  }

  // The en-passant square only counts for repetition when a pawn could capture there.
  function epCapturable(p) {
    var ep = p.ep, b = p.b, s;
    if (ep < 0) return false;
    if (p.turn === WHITE) {
      s = ep + 15; if (!(s & 0x88) && b[s] === PAWN) return true;
      s = ep + 17; if (!(s & 0x88) && b[s] === PAWN) return true;
    } else {
      s = ep - 15; if (!(s & 0x88) && b[s] === (PAWN | 8)) return true;
      s = ep - 17; if (!(s & 0x88) && b[s] === (PAWN | 8)) return true;
    }
    return false;
  }

  function pushKey(p) {
    var lo = p.hLo, hi = p.hHi;
    if (epCapturable(p)) { lo ^= ZE_LO[p.ep & 7]; hi ^= ZE_HI[p.ep & 7]; }
    p.keyLo.push(lo);
    p.keyHi.push(hi);
  }

  // ---------------------------------------------------------- move generation
  function addPromos(out, from, to, flags) {
    var base = from | (to << 7) | ((flags | F_PROMO) << 17);
    out.push(base | (QUEEN << 14), base | (ROOK << 14), base | (BISHOP << 14), base | (KNIGHT << 14));
  }

  // Pseudo-legal moves (may leave own king in check). capsOnly: captures and
  // promotions, to a queen only, used by the quiescence search.
  function genPseudo(p, out, capsOnly) {
    var b = p.b, us = p.turn, them = us ^ 1;
    var fwd = us === WHITE ? -16 : 16;
    var startRow = us === WHITE ? 6 : 1;
    var lastRow = us === WHITE ? 0 : 7;
    var sq, pc, t, j, d, to, tp, offs, dirs;
    for (sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      pc = b[sq];
      if (pc === 0 || (pc >> 3) !== us) continue;
      t = pc & 7;
      if (t === PAWN) {
        to = sq + fwd;
        if (capsOnly) {
          if ((to >> 4) === lastRow && b[to] === 0) out.push(sq | (to << 7) | (QUEEN << 14) | ((F_NORMAL | F_PROMO) << 17));
        } else if (!(to & 0x88) && b[to] === 0) {
          if ((to >> 4) === lastRow) {
            addPromos(out, sq, to, F_NORMAL);
          } else {
            out.push(sq | (to << 7) | (F_NORMAL << 17));
            if ((sq >> 4) === startRow && b[to + fwd] === 0) {
              out.push(sq | ((to + fwd) << 7) | (F_BIG_PAWN << 17));
            }
          }
        }
        for (j = -1; j <= 1; j += 2) {
          to = sq + fwd + j;
          if (to & 0x88) continue;
          tp = b[to];
          if (tp !== 0) {
            if ((tp >> 3) === them) {
              if ((to >> 4) === lastRow) {
                if (capsOnly) out.push(sq | (to << 7) | (QUEEN << 14) | ((F_CAPTURE | F_PROMO) << 17));
                else addPromos(out, sq, to, F_CAPTURE);
              } else {
                out.push(sq | (to << 7) | (F_CAPTURE << 17));
              }
            }
          } else if (to === p.ep) {
            out.push(sq | (to << 7) | (F_EP << 17));
          }
        }
      } else if (t === KNIGHT || t === KING) {
        offs = t === KNIGHT ? KNIGHT_OFFSETS : KING_OFFSETS;
        for (j = 0; j < 8; j++) {
          to = sq + offs[j];
          if (to & 0x88) continue;
          tp = b[to];
          if (tp === 0) {
            if (!capsOnly) out.push(sq | (to << 7) | (F_NORMAL << 17));
          } else if ((tp >> 3) === them) {
            out.push(sq | (to << 7) | (F_CAPTURE << 17));
          }
        }
        if (t === KING && !capsOnly && p.castle !== 0) genCastles(p, sq, out);
      } else {
        dirs = t === BISHOP ? BISHOP_DIRS : (t === ROOK ? ROOK_DIRS : KING_OFFSETS);
        for (j = 0; j < dirs.length; j++) {
          d = dirs[j];
          to = sq + d;
          while (!(to & 0x88)) {
            tp = b[to];
            if (tp === 0) {
              if (!capsOnly) out.push(sq | (to << 7) | (F_NORMAL << 17));
            } else {
              if ((tp >> 3) === them) out.push(sq | (to << 7) | (F_CAPTURE << 17));
              break;
            }
            to += d;
          }
        }
      }
    }
  }

  // Castling: rights, king and rook on their squares, empty squares between,
  // king not in check and not passing through an attacked square. The
  // destination square is checked by the normal legality test.
  function genCastles(p, sq, out) {
    var b = p.b, us = p.turn, them = us ^ 1;
    if (us === WHITE) {
      if (sq !== E1) return;
      if ((p.castle & C_WK) && b[F1] === 0 && b[G1] === 0 && b[H1] === ROOK &&
          !attacked(b, E1, them) && !attacked(b, F1, them)) {
        out.push(E1 | (G1 << 7) | (F_KSIDE << 17));
      }
      if ((p.castle & C_WQ) && b[D1] === 0 && b[C1] === 0 && b[B1] === 0 && b[A1] === ROOK &&
          !attacked(b, E1, them) && !attacked(b, D1, them)) {
        out.push(E1 | (C1 << 7) | (F_QSIDE << 17));
      }
    } else {
      if (sq !== E8) return;
      if ((p.castle & C_BK) && b[F8] === 0 && b[G8] === 0 && b[H8] === (ROOK | 8) &&
          !attacked(b, E8, them) && !attacked(b, F8, them)) {
        out.push(E8 | (G8 << 7) | (F_KSIDE << 17));
      }
      if ((p.castle & C_BQ) && b[D8] === 0 && b[C8] === 0 && b[B8] === 0 && b[A8] === (ROOK | 8) &&
          !attacked(b, E8, them) && !attacked(b, D8, them)) {
        out.push(E8 | (C8 << 7) | (F_QSIDE << 17));
      }
    }
  }

  function makeMove(p, m) {
    var b = p.b;
    var from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flags = (m >> 17) & 127;
    var us = p.turn, pc = b[from], capSq = to, cap, placed, k, rf, rt, rook, nc;
    var lo = p.hLo, hi = p.hHi;
    if (flags & F_EP) capSq = us === WHITE ? to + 16 : to - 16;
    cap = b[capSq];
    p.stack.push(new Undo(m, cap, p.castle, p.ep, p.half, p.full, lo, hi));
    if (cap !== 0) {
      k = (cap << 7) | capSq; lo ^= ZP_LO[k]; hi ^= ZP_HI[k];
      b[capSq] = 0;
    }
    k = (pc << 7) | from; lo ^= ZP_LO[k]; hi ^= ZP_HI[k];
    b[from] = 0;
    placed = promo !== 0 ? (promo | (us << 3)) : pc;
    b[to] = placed;
    k = (placed << 7) | to; lo ^= ZP_LO[k]; hi ^= ZP_HI[k];
    if ((pc & 7) === KING) {
      p.kings[us] = to;
      if (flags & (F_KSIDE | F_QSIDE)) {
        if (flags & F_KSIDE) { rf = to + 1; rt = to - 1; } else { rf = to - 2; rt = to + 1; }
        rook = b[rf];
        b[rf] = 0;
        b[rt] = rook;
        k = (rook << 7) | rf; lo ^= ZP_LO[k]; hi ^= ZP_HI[k];
        k = (rook << 7) | rt; lo ^= ZP_LO[k]; hi ^= ZP_HI[k];
      }
    }
    nc = p.castle & CASTLE_MASK[from] & CASTLE_MASK[to];
    if (nc !== p.castle) {
      lo ^= ZC_LO[p.castle] ^ ZC_LO[nc];
      hi ^= ZC_HI[p.castle] ^ ZC_HI[nc];
      p.castle = nc;
    }
    p.ep = (flags & F_BIG_PAWN) ? ((from + to) >> 1) : -1;
    if ((pc & 7) === PAWN || cap !== 0) p.half = 0; else p.half++;
    if (us === BLACK) p.full++;
    p.turn = us ^ 1;
    lo ^= ZS_LO; hi ^= ZS_HI;
    p.hLo = lo; p.hHi = hi;
    pushKey(p);
  }

  function unmakeMove(p) {
    var u = p.stack.pop();
    p.keyLo.pop();
    p.keyHi.pop();
    var b = p.b, m = u.m;
    var from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flags = (m >> 17) & 127;
    var us = p.turn ^ 1;
    p.turn = us;
    var pc = promo !== 0 ? (PAWN | (us << 3)) : b[to];
    b[from] = pc;
    b[to] = 0;
    if (u.cap !== 0) {
      if (flags & F_EP) b[us === WHITE ? to + 16 : to - 16] = u.cap;
      else b[to] = u.cap;
    }
    if ((pc & 7) === KING) {
      p.kings[us] = from;
      if (flags & F_KSIDE) { b[to + 1] = b[to - 1]; b[to - 1] = 0; }
      else if (flags & F_QSIDE) { b[to - 2] = b[to + 1]; b[to + 1] = 0; }
    }
    p.castle = u.castle; p.ep = u.ep; p.half = u.half; p.full = u.full;
    p.hLo = u.lo; p.hHi = u.hi;
  }

  function genLegal(p, out) {
    var pseudo = [], us = p.turn, i, m;
    genPseudo(p, pseudo, false);
    for (i = 0; i < pseudo.length; i++) {
      m = pseudo[i];
      makeMove(p, m);
      if (!attacked(p.b, p.kings[us], us ^ 1)) out.push(m);
      unmakeMove(p);
    }
    return out;
  }

  function hasLegalMove(p) {
    var pseudo = [], us = p.turn, i, ok;
    genPseudo(p, pseudo, false);
    for (i = 0; i < pseudo.length; i++) {
      makeMove(p, pseudo[i]);
      ok = !attacked(p.b, p.kings[us], us ^ 1);
      unmakeMove(p);
      if (ok) return true;
    }
    return false;
  }

  // ------------------------------------------------------------- game rules
  function insufficientMaterial(p) {
    var b = p.b, sq, pc, t, knights = 0, bishops = [0, 0];
    for (sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      pc = b[sq];
      if (pc === 0) continue;
      t = pc & 7;
      if (t === KING) continue;
      if (t === KNIGHT) knights++;
      else if (t === BISHOP) bishops[((sq >> 4) + (sq & 7)) & 1]++;
      else return false; // pawn, rook or queen
    }
    if (knights === 0 && (bishops[0] === 0 || bishops[1] === 0)) return true; // K v K, K+B(s) v K(+B) same colour
    if (knights === 1 && bishops[0] + bishops[1] === 0) return true;          // K+N v K
    return false;
  }

  function repetitionCount(p) {
    var n = p.keyLo.length - 1, lo = p.keyLo[n], hi = p.keyHi[n], count = 1, i;
    var limit = n - p.half;
    if (limit < 0) limit = 0;
    for (i = n - 2; i >= limit; i -= 2) {
      if (p.keyLo[i] === lo && p.keyHi[i] === hi) count++;
    }
    return count;
  }

  // Used inside the search: a single earlier occurrence counts as a draw.
  function isRepetition(p) {
    var n = p.keyLo.length - 1, lo = p.keyLo[n], hi = p.keyHi[n], i;
    var limit = n - p.half;
    if (limit < 0) limit = 0;
    for (i = n - 4; i >= limit; i -= 2) {
      if (p.keyLo[i] === lo && p.keyHi[i] === hi) return true;
    }
    return false;
  }

  function gameStatus(p) {
    if (!hasLegalMove(p)) return inCheck(p) ? 'checkmate' : 'stalemate';
    if (p.half >= 100) return 'draw-50';
    if (insufficientMaterial(p)) return 'draw-material';
    if (repetitionCount(p) >= 3) return 'draw-repetition';
    return 'playing';
  }

  // --------------------------------------------------------------------- FEN
  function loadFen(fen) {
    var bad = function (why) { return new Error('Invalid FEN (' + why + '): ' + fen); };
    if (typeof fen !== 'string') throw bad('not a string');
    var parts = fen.replace(/^\s+|\s+$/g, '').split(/\s+/);
    if (parts.length < 4 || parts.length > 6) throw bad('expected 6 fields');
    var p = new Pos(), rows = parts[0].split('/'), r, f, i, ch, idx, n, sq;
    if (rows.length !== 8) throw bad('expected 8 ranks');
    for (r = 0; r < 8; r++) {
      f = 0;
      for (i = 0; i < rows[r].length; i++) {
        ch = rows[r].charAt(i);
        if (ch >= '1' && ch <= '8') {
          f += ch.charCodeAt(0) - 48;
        } else {
          idx = 'pnbrqkPNBRQK'.indexOf(ch);
          if (idx < 0) throw bad('bad piece "' + ch + '"');
          if (f > 7) throw bad('rank too long');
          sq = (r << 4) | f;
          p.b[sq] = idx < 6 ? (idx + 1) | 8 : idx - 5;
          if ((idx % 6) === 0 && (r === 0 || r === 7)) throw bad('pawn on first/last rank');
          if ((idx % 6) === 5) {
            n = idx < 6 ? BLACK : WHITE;
            if (p.kings[n] !== -1) throw bad('two kings of one colour');
            p.kings[n] = sq;
          }
          f++;
        }
      }
      if (f !== 8) throw bad('rank ' + (8 - r) + ' does not have 8 squares');
    }
    if (p.kings[WHITE] < 0 || p.kings[BLACK] < 0) throw bad('missing king');

    if (parts[1] === 'w') p.turn = WHITE;
    else if (parts[1] === 'b') p.turn = BLACK;
    else throw bad('side to move');

    if (parts[2] !== '-') {
      if (!/^[KQkq]{1,4}$/.test(parts[2])) throw bad('castling field');
      if (parts[2].indexOf('K') >= 0) p.castle |= C_WK;
      if (parts[2].indexOf('Q') >= 0) p.castle |= C_WQ;
      if (parts[2].indexOf('k') >= 0) p.castle |= C_BK;
      if (parts[2].indexOf('q') >= 0) p.castle |= C_BQ;
    }
    // Drop rights that the piece placement makes impossible.
    if (p.b[E1] !== KING) p.castle &= ~(C_WK | C_WQ);
    if (p.b[H1] !== ROOK) p.castle &= ~C_WK;
    if (p.b[A1] !== ROOK) p.castle &= ~C_WQ;
    if (p.b[E8] !== (KING | 8)) p.castle &= ~(C_BK | C_BQ);
    if (p.b[H8] !== (ROOK | 8)) p.castle &= ~C_BK;
    if (p.b[A8] !== (ROOK | 8)) p.castle &= ~C_BQ;

    if (parts[3] !== '-') {
      sq = parseSq(parts[3]);
      if (sq < 0) throw bad('en-passant square');
      var wantRow = p.turn === WHITE ? 2 : 5;  // rank 6 / rank 3
      if ((sq >> 4) !== wantRow) throw bad('en-passant square');
      var pawnSq = p.turn === WHITE ? sq + 16 : sq - 16;
      var origin = p.turn === WHITE ? sq - 16 : sq + 16;
      var theirPawn = p.turn === WHITE ? (PAWN | 8) : PAWN;
      // Ignore an en-passant square that is not consistent with a double step.
      if (p.b[sq] === 0 && p.b[origin] === 0 && p.b[pawnSq] === theirPawn) p.ep = sq;
    }

    p.half = 0;
    p.full = 1;
    if (parts.length > 4) {
      if (!/^\d+$/.test(parts[4])) throw bad('halfmove clock');
      p.half = parseInt(parts[4], 10);
    }
    if (parts.length > 5) {
      if (!/^\d+$/.test(parts[5])) throw bad('fullmove number');
      p.full = Math.max(1, parseInt(parts[5], 10));
    }
    if (attacked(p.b, p.kings[p.turn ^ 1], p.turn)) throw bad('side not to move is in check');
    computeHash(p);
    pushKey(p);
    return p;
  }

  function toFen(p) {
    var rows = [], r, f, empty, s, pc, ch;
    for (r = 0; r < 8; r++) {
      s = ''; empty = 0;
      for (f = 0; f < 8; f++) {
        pc = p.b[(r << 4) | f];
        if (pc === 0) { empty++; continue; }
        if (empty) { s += empty; empty = 0; }
        ch = TYPE_CHARS.charAt(pc & 7);
        s += pc & 8 ? ch : ch.toUpperCase();
      }
      if (empty) s += empty;
      rows.push(s);
    }
    var c = '';
    if (p.castle & C_WK) c += 'K';
    if (p.castle & C_WQ) c += 'Q';
    if (p.castle & C_BK) c += 'k';
    if (p.castle & C_BQ) c += 'q';
    return rows.join('/') + ' ' + (p.turn === WHITE ? 'w' : 'b') + ' ' + (c || '-') + ' ' +
      (p.ep >= 0 ? sqName(p.ep) : '-') + ' ' + p.half + ' ' + p.full;
  }

  // Public move object, built from the position before the move is played.
  function moveObj(p, m) {
    var from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flags = (m >> 17) & 127;
    var pc = p.b[from], tp = p.b[to], f = '', i;
    for (i = 0; i < 7; i++) if (flags & (1 << i)) f += FLAG_CHARS.charAt(i);
    var o = {
      from: sqName(from),
      to: sqName(to),
      color: pc & 8 ? 'b' : 'w',
      piece: TYPE_CHARS.charAt(pc & 7),
      flags: f
    };
    if (flags & F_EP) o.captured = 'p';
    else if (tp !== 0) o.captured = TYPE_CHARS.charAt(tp & 7);
    if (promo !== 0) o.promotion = TYPE_CHARS.charAt(promo);
    if (flags & F_KSIDE) { o.rookFrom = sqName(to + 1); o.rookTo = sqName(to - 1); }
    else if (flags & F_QSIDE) { o.rookFrom = sqName(to - 2); o.rookTo = sqName(to + 1); }
    return o;
  }

  // -------------------------------------------------------------- game object
  function Game(p, hist) {
    this._p = p;
    this._hist = hist || [];
  }

  Game.prototype.fen = function () { return toFen(this._p); };

  Game.prototype.turn = function () { return this._p.turn === WHITE ? 'w' : 'b'; };

  Game.prototype.pieceAt = function (square) {
    var sq = parseSq(square);
    if (sq < 0) return null;
    var pc = this._p.b[sq];
    return pc === 0 ? null : pieceObj(pc);
  };

  Game.prototype.board = function () {
    var out = [], r, f, pc;
    for (r = 0; r < 8; r++) {
      for (f = 0; f < 8; f++) {
        pc = this._p.b[(r << 4) | f];
        out.push(pc === 0 ? null : pieceObj(pc));
      }
    }
    return out;
  };

  Game.prototype.moves = function (from) {
    var p = this._p, list = [], out = [], fsq = -1, i;
    if (from !== undefined && from !== null) {
      fsq = parseSq(from);
      if (fsq < 0) return [];
    }
    genLegal(p, list);
    for (i = 0; i < list.length; i++) {
      if (fsq < 0 || (list[i] & 127) === fsq) out.push(moveObj(p, list[i]));
    }
    return out;
  };

  Game.prototype.move = function (m) {
    if (!m || typeof m !== 'object') return null;
    var p = this._p, from = parseSq(m.from), to = parseSq(m.to), want = QUEEN, i, mm, mp, found = 0;
    if (from < 0 || to < 0) return null;
    if (m.promotion) {
      i = 'nbrq'.indexOf(String(m.promotion).toLowerCase());
      if (i < 0) return null;
      want = i + KNIGHT;
    }
    var list = genLegal(p, []);
    for (i = 0; i < list.length; i++) {
      mm = list[i];
      if ((mm & 127) !== from || ((mm >> 7) & 127) !== to) continue;
      mp = (mm >> 14) & 7;
      if (mp === 0 || mp === want) { found = mm; break; }
    }
    if (!found) return null;
    var obj = moveObj(p, found);
    makeMove(p, found);
    this._hist.push(obj);
    return copyObj(obj);
  };

  Game.prototype.undo = function () {
    if (this._hist.length === 0) return null;
    unmakeMove(this._p);
    return copyObj(this._hist.pop());
  };

  Game.prototype.history = function () {
    var out = [], i;
    for (i = 0; i < this._hist.length; i++) out.push(copyObj(this._hist[i]));
    return out;
  };

  Game.prototype.lastMove = function () {
    var n = this._hist.length;
    return n ? copyObj(this._hist[n - 1]) : null;
  };

  Game.prototype.inCheck = function () { return inCheck(this._p); };

  Game.prototype.kingSquare = function (color) {
    var c = color === 'b' ? BLACK : (color === 'w' ? WHITE : -1);
    if (c < 0 || this._p.kings[c] < 0) return null;
    return sqName(this._p.kings[c]);
  };

  Game.prototype.status = function () { return gameStatus(this._p); };

  Game.prototype.clone = function () {
    var h = [], i;
    for (i = 0; i < this._hist.length; i++) h.push(copyObj(this._hist[i]));
    return new Game(clonePos(this._p), h);
  };

  function create(fen) {
    return new Game(loadFen(fen === undefined || fen === null || fen === '' ? DEFAULT_FEN : fen));
  }

  // ------------------------------------------------------------------- perft
  function perftPos(p, depth) {
    if (depth === 0) return 1;
    var moves = [], us = p.turn, n = 0, i;
    genPseudo(p, moves, false);
    for (i = 0; i < moves.length; i++) {
      makeMove(p, moves[i]);
      if (!attacked(p.b, p.kings[us], us ^ 1)) n += depth === 1 ? 1 : perftPos(p, depth - 1);
      unmakeMove(p);
    }
    return n;
  }

  function perft(g, depth) {
    return perftPos(clonePos(g._p), depth | 0);
  }

  // -------------------------------------------------------------- evaluation
  var VALUE = [0, 100, 320, 330, 500, 900, 0];        // move ordering, delta pruning
  var SEE_VAL = [0, 100, 320, 330, 500, 900, 20000];  // static exchange evaluation
  var MAT_MG = [0, 100, 320, 335, 490, 940, 0];
  var MAT_EG = [0, 125, 300, 320, 530, 960, 0];
  var PHASE_W = [0, 0, 1, 1, 2, 4, 0];   // 24 = full middlegame material

  // Piece-square tables from White's point of view, index 0 = a8 ... 63 = h1.
  var PST_P = [
      0,   0,   0,   0,   0,   0,   0,   0,
     60,  60,  60,  60,  60,  60,  60,  60,
     20,  20,  30,  40,  40,  30,  20,  20,
      8,   8,  12,  26,  26,  12,   8,   8,
      2,   2,   5,  20,  20,   5,   2,   2,
      4,  -2,  -6,   4,   4,  -6,  -2,   4,
      5,  10,  10, -20, -20,  10,  10,   5,
      0,   0,   0,   0,   0,   0,   0,   0];
  var PST_P_EG = [
      0,   0,   0,   0,   0,   0,   0,   0,
     40,  40,  40,  40,  40,  40,  40,  40,
     25,  25,  25,  25,  25,  25,  25,  25,
     14,  14,  14,  14,  14,  14,  14,  14,
      7,   7,   7,   7,   7,   7,   7,   7,
      2,   2,   2,   2,   2,   2,   2,   2,
      0,   0,   0,   0,   0,   0,   0,   0,
      0,   0,   0,   0,   0,   0,   0,   0];
  var PST_N = [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20,   0,   0,   0,   0, -20, -40,
    -30,   0,  10,  15,  15,  10,   0, -30,
    -30,   5,  15,  20,  20,  15,   5, -30,
    -30,   0,  15,  20,  20,  15,   0, -30,
    -30,   5,  10,  15,  15,  10,   5, -30,
    -40, -20,   0,   5,   5,   0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50];
  var PST_B = [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10,   0,   5,  10,  10,   5,   0, -10,
    -10,   5,   5,  10,  10,   5,   5, -10,
    -10,   0,  10,  10,  10,  10,   0, -10,
    -10,  10,  10,  10,  10,  10,  10, -10,
    -10,   5,   0,   0,   0,   0,   5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20];
  var PST_R = [
      0,   0,   0,   0,   0,   0,   0,   0,
      5,  10,  10,  10,  10,  10,  10,   5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
      0,   0,   0,   5,   5,   0,   0,   0];
  var PST_Q = [
    -20, -10, -10,  -5,  -5, -10, -10, -20,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10,   0,   5,   5,   5,   5,   0, -10,
     -5,   0,   5,   5,   5,   5,   0,  -5,
      0,   0,   5,   5,   5,   5,   0,  -5,
    -10,   5,   5,   5,   5,   5,   0, -10,
    -10,   0,   5,   0,   0,   0,   0, -10,
    -20, -10, -10,  -5,  -5, -10, -10, -20];
  var PST_K_MG = [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
     20,  20,   0,   0,   0,   0,  20,  20,
     20,  30,  10,   0,   0,  10,  30,  20];
  var PST_K_EG = [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10,   0,   0, -10, -20, -30,
    -30, -10,  20,  30,  30,  20, -10, -30,
    -30, -10,  30,  40,  40,  30, -10, -30,
    -30, -10,  30,  40,  40,  30, -10, -30,
    -30, -10,  20,  30,  30,  20, -10, -30,
    -30, -30,   0,   0,   0,   0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50];
  var PST_MG = [null, PST_P, PST_N, PST_B, PST_R, PST_Q, null];
  var PST_EG = [null, PST_P_EG, PST_N, PST_B, PST_R, PST_Q, null];
  // Passed pawn bonus by how far the pawn has come (1 = still at home ... 6 = one step from queening).
  var PASSED_MG = [0, 5, 10, 15, 25, 40, 60, 0];
  var PASSED_EG = [0, 10, 15, 30, 50, 80, 120, 0];
  var KS_W = [0, 0, 2, 2, 3, 5, 0];    // king danger units of a piece close to the enemy king
  var EV_WPF = new Int8Array(8), EV_BPF = new Int8Array(8), EV_WMAX = new Int8Array(8), EV_BMIN = new Int8Array(8);

  // Pawn shield of a king that is still on its first two ranks (middlegame only).
  function shelter(b, ksq, color) {
    var kr = ksq >> 4, kf = ksq & 7, dir = color === WHITE ? -16 : 16, own = color === WHITE ? PAWN : (PAWN | 8);
    var s = 0, f, s1, s2;
    if (color === WHITE ? kr < 6 : kr > 1) return 0;
    for (f = kf - 1; f <= kf + 1; f++) {
      if (f < 0 || f > 7) continue;
      s1 = ksq + dir + (f - kf);
      s2 = s1 + dir;
      if (b[s1] === own) s += 12;
      else if (b[s2] === own) s += 6;
      else s -= 12;
    }
    return s;
  }

  // Static evaluation in centipawns from the side to move's point of view: material and
  // piece-square tables (tapered between middlegame and endgame), pawn structure, mobility,
  // rooks on open files, bishop pair, king shelter and pieces close to the enemy king.
  function evaluate(p) {
    var b = p.b, sq, pc, t, r, f, c, idx, to, tp, d, j, mob, sgn, vmg, veg, dirs, ek, own, opp;
    var mg = 0, eg = 0, phase = 0;
    var wpf = EV_WPF, bpf = EV_BPF, wmax = EV_WMAX, bmin = EV_BMIN;
    var npW = 0, npB = 0, pawnsW = 0, pawnsB = 0, bishW = 0, bishB = 0, unitsW = 0, unitsB = 0, queenW = 0, queenB = 0;
    var wk = p.kings[WHITE], bk = p.kings[BLACK];
    for (f = 0; f < 8; f++) { wpf[f] = 0; bpf[f] = 0; wmax[f] = -1; bmin[f] = 8; }
    for (sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      pc = b[sq];
      if (pc === PAWN) { f = sq & 7; wpf[f]++; r = sq >> 4; if (r > wmax[f]) wmax[f] = r; }
      else if (pc === (PAWN | 8)) { f = sq & 7; bpf[f]++; r = sq >> 4; if (r < bmin[f]) bmin[f] = r; }
    }
    for (sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      pc = b[sq];
      if (pc === 0) continue;
      t = pc & 7;
      if (t === KING) continue;
      r = sq >> 4; f = sq & 7;
      if (pc < 8) { c = WHITE; idx = (r << 3) | f; sgn = 1; } else { c = BLACK; idx = ((7 - r) << 3) | f; sgn = -1; }
      vmg = MAT_MG[t] + PST_MG[t][idx];
      veg = MAT_EG[t] + PST_EG[t][idx];
      phase += PHASE_W[t];
      if (t === PAWN) {
        if (c === WHITE) {
          pawnsW++;
          if (wpf[f] > 1) { vmg -= 6; veg -= 12; }
          if ((f === 0 || wpf[f - 1] === 0) && (f === 7 || wpf[f + 1] === 0)) { vmg -= 10; veg -= 14; }
          if (bmin[f] >= r && (f === 0 || bmin[f - 1] >= r) && (f === 7 || bmin[f + 1] >= r)) { vmg += PASSED_MG[7 - r]; veg += PASSED_EG[7 - r]; }
        } else {
          pawnsB++;
          if (bpf[f] > 1) { vmg -= 6; veg -= 12; }
          if ((f === 0 || bpf[f - 1] === 0) && (f === 7 || bpf[f + 1] === 0)) { vmg -= 10; veg -= 14; }
          if (wmax[f] <= r && (f === 0 || wmax[f - 1] <= r) && (f === 7 || wmax[f + 1] <= r)) { vmg += PASSED_MG[r]; veg += PASSED_EG[r]; }
        }
      } else {
        if (c === WHITE) npW += MAT_MG[t]; else npB += MAT_MG[t];
        ek = c === WHITE ? bk : wk;
        if (Math.abs(r - (ek >> 4)) <= 2 && Math.abs(f - (ek & 7)) <= 2) {
          if (c === WHITE) unitsW += KS_W[t]; else unitsB += KS_W[t];
        }
        mob = 0;
        if (t === KNIGHT) {
          for (j = 0; j < 8; j++) {
            to = sq + KNIGHT_OFFSETS[j];
            if (!(to & 0x88)) { tp = b[to]; if (tp === 0 || (tp >> 3) !== c) mob++; }
          }
          vmg += (mob - 4) * 4; veg += (mob - 4) * 4;
        } else {
          dirs = t === BISHOP ? BISHOP_DIRS : (t === ROOK ? ROOK_DIRS : KING_OFFSETS);
          for (j = 0; j < dirs.length; j++) {
            d = dirs[j]; to = sq + d;
            while (!(to & 0x88)) {
              tp = b[to];
              if (tp === 0) mob++;
              else { if ((tp >> 3) !== c) mob++; break; }
              to += d;
            }
          }
          if (t === BISHOP) {
            vmg += (mob - 6) * 5; veg += (mob - 6) * 5;
            if (c === WHITE) bishW++; else bishB++;
          } else if (t === ROOK) {
            vmg += (mob - 7) * 2; veg += (mob - 7) * 4;
            own = c === WHITE ? wpf[f] : bpf[f];
            opp = c === WHITE ? bpf[f] : wpf[f];
            if (own === 0) { if (opp === 0) { vmg += 25; veg += 10; } else { vmg += 12; veg += 6; } }
            if (r === (c === WHITE ? 1 : 6)) { vmg += 10; veg += 20; }
          } else {
            vmg += mob - 13; veg += (mob - 13) * 2;
            if (c === WHITE) queenW++; else queenB++;
          }
        }
      }
      mg += sgn * vmg;
      eg += sgn * veg;
    }
    if (bishW >= 2) { mg += 30; eg += 50; }
    if (bishB >= 2) { mg -= 30; eg -= 50; }
    var wki = ((wk >> 4) << 3) | (wk & 7), bki = ((7 - (bk >> 4)) << 3) | (bk & 7);
    mg += PST_K_MG[wki] - PST_K_MG[bki];
    eg += PST_K_EG[wki] - PST_K_EG[bki];
    mg += shelter(b, wk, WHITE) - shelter(b, bk, BLACK);
    if (queenW) mg += Math.min(400, unitsW * unitsW * 2);
    if (queenB) mg -= Math.min(400, unitsB * unitsB * 2);
    if (phase > 24) phase = 24;
    var score = ((mg * phase + eg * (24 - phase)) / 24) | 0;

    // Mop-up: in a clearly won ending, drive the lone king to the edge and
    // bring the own king closer, so the computer actually finishes the game.
    var matW = npW + 100 * pawnsW, matB = npB + 100 * pawnsB, diff = matW - matB;
    if (phase <= 6 && (diff >= 400 || diff <= -400)) {
      var strong = diff > 0 ? wk : bk, weak = diff > 0 ? bk : wk;
      var wr = weak >> 4, wf = weak & 7, sr = strong >> 4, sf = strong & 7;
      var centre = Math.max(3 - wr, wr - 4) + Math.max(3 - wf, wf - 4);
      var dist = Math.abs(wr - sr) + Math.abs(wf - sf);
      var bonus = 10 * centre + 4 * (14 - dist);
      score += diff > 0 ? bonus : -bonus;
    }
    // Without pawns, a lone minor piece more (or a rook against a minor piece) rarely wins.
    if (score > 0 && pawnsW === 0 && npW - npB < 400) score = (score / 4) | 0;
    else if (score < 0 && pawnsB === 0 && npB - npW < 400) score = (score / 4) | 0;
    return (p.turn === WHITE ? score : -score) + 10;
  }

  // ------------------------------------------------- static exchange evaluation
  // Least valuable piece of colour `side` attacking square sq, or -1.
  function leastAttacker(b, sq, side) {
    var s, i, d, pc, bits = side << 3, queen = -1, king = -1;
    if (side === WHITE) {
      s = sq + 15; if (!(s & 0x88) && b[s] === PAWN) return s;
      s = sq + 17; if (!(s & 0x88) && b[s] === PAWN) return s;
    } else {
      s = sq - 15; if (!(s & 0x88) && b[s] === (PAWN | 8)) return s;
      s = sq - 17; if (!(s & 0x88) && b[s] === (PAWN | 8)) return s;
    }
    for (i = 0; i < 8; i++) {
      s = sq + KNIGHT_OFFSETS[i];
      if (!(s & 0x88) && b[s] === (KNIGHT | bits)) return s;
    }
    for (i = 0; i < 4; i++) {
      d = BISHOP_DIRS[i]; s = sq + d;
      while (!(s & 0x88)) {
        pc = b[s];
        if (pc !== 0) {
          if (pc === (BISHOP | bits)) return s;
          if (pc === (QUEEN | bits) && queen < 0) queen = s;
          break;
        }
        s += d;
      }
    }
    for (i = 0; i < 4; i++) {
      d = ROOK_DIRS[i]; s = sq + d;
      while (!(s & 0x88)) {
        pc = b[s];
        if (pc !== 0) {
          if (pc === (ROOK | bits)) return s;
          if (pc === (QUEEN | bits) && queen < 0) queen = s;
          break;
        }
        s += d;
      }
    }
    if (queen >= 0) return queen;
    for (i = 0; i < 8; i++) {
      s = sq + KING_OFFSETS[i];
      if (!(s & 0x88) && b[s] === (KING | bits)) { king = s; break; }
    }
    return king;
  }

  var SEE_GAIN = new Int32Array(40), SEE_SQ = new Int32Array(40), SEE_PC = new Int32Array(40);
  // Material won (centipawns) by the capture m when both sides keep recapturing on its
  // square with their least valuable piece, each side free to stop. Pins are ignored.
  function see(p, m) {
    var b = p.b, from = m & 127, to = (m >> 7) & 127, flags = (m >> 17) & 127;
    var gain = SEE_GAIN, nr = 0, d = 0, side = p.turn, aType = b[from] & 7, a, victim;
    if (flags & F_EP) {
      victim = PAWN;
      a = side === WHITE ? to + 16 : to - 16;
      SEE_SQ[nr] = a; SEE_PC[nr++] = b[a]; b[a] = 0;
    } else {
      victim = b[to] & 7;
    }
    SEE_SQ[nr] = from; SEE_PC[nr++] = b[from]; b[from] = 0;
    gain[0] = SEE_VAL[victim];
    side ^= 1;
    while (d < 38) {
      d++;
      gain[d] = SEE_VAL[aType] - gain[d - 1];
      if (Math.max(-gain[d - 1], gain[d]) < 0) break;
      a = leastAttacker(b, to, side);
      if (a < 0) break;
      aType = b[a] & 7;
      SEE_SQ[nr] = a; SEE_PC[nr++] = b[a]; b[a] = 0;
      side ^= 1;
    }
    while (--d) gain[d - 1] = -Math.max(-gain[d - 1], gain[d]);
    while (nr > 0) { nr--; b[SEE_SQ[nr]] = SEE_PC[nr]; }
    return gain[0];
  }

  // ------------------------------------------------------------------ search
  // Iterative deepening principal variation search with a transposition table, null-move
  // pruning, late move reductions, check extensions, killer and history move ordering and a
  // quiescence search on captures (MVV-LVA order, losing captures skipped by SEE).
  var MATE = 100000;
  var MATE_BOUND = MATE - 1000;   // |score| above this means "mate found"
  var INF = 1000000;
  var MAX_PLY = 64;
  var QS_MAX = 12;                // quiescence plies
  var QS_CHECKS = 6;              // quiescence plies in which a check is answered by every evasion
  var EXACT = 1, LOWER = 2, UPPER = 3;

  // Transposition table (about 5 MB), created on the first search and kept between moves
  // (for move ordering; scores are only trusted within one search).
  var TT_SIZE = 1 << 18, TT_MASK = TT_SIZE - 1;
  var ttLo = null, ttHi, ttMove, ttScore, ttDepth, ttFlag, ttGen, ttGeneration = 0;
  function ttInit() {
    if (ttLo) return;
    ttLo = new Int32Array(TT_SIZE); ttHi = new Int32Array(TT_SIZE); ttMove = new Int32Array(TT_SIZE);
    ttScore = new Int32Array(TT_SIZE); ttDepth = new Int8Array(TT_SIZE); ttFlag = new Int8Array(TT_SIZE);
    ttGen = new Uint8Array(TT_SIZE);
  }
  function ttStore(lo, hi, depth, flag, score, move, ply) {
    var i = lo & TT_MASK, same = ttLo[i] === lo && ttHi[i] === hi;
    if (!same && ttFlag[i] !== 0 && ttGen[i] === ttGeneration && ttDepth[i] > depth) return;
    if (same && move === 0) move = ttMove[i];
    if (score >= MATE_BOUND) score += ply; else if (score <= -MATE_BOUND) score -= ply;
    ttLo[i] = lo; ttHi[i] = hi; ttMove[i] = move; ttScore[i] = score;
    ttDepth[i] = depth > 120 ? 120 : depth; ttFlag[i] = flag; ttGen[i] = ttGeneration;
  }

  var HIST = new Int32Array(16 * 128);   // history heuristic, [piece << 7 | to]
  function ageHistory() { for (var i = 0; i < HIST.length; i++) HIST[i] >>= 2; }
  function histAdd(p, m, depth) {
    var k = (p.b[m & 127] << 7) | ((m >> 7) & 127);
    HIST[k] += depth * depth;
    if (HIST[k] > 800000) for (var i = 0; i < HIST.length; i++) HIST[i] >>= 1;
  }

  function Search(p, cfg) {
    this.p = p;
    this.nodes = 0;
    this.aborted = false;
    this.t0 = Date.now();
    this.hardMs = cfg.hard;                  // stop the search after this (once minDepth is done)
    this.panicMs = cfg.panic || 3000;        // stop in any case (very slow device)
    this.minDepth = cfg.minDepth || 2;
    this.depth = 0;
    this.k1 = new Int32Array(MAX_PLY + 2);
    this.k2 = new Int32Array(MAX_PLY + 2);
  }

  function checkTime(s) {
    var el = Date.now() - s.t0;
    if ((s.depth > s.minDepth && el > s.hardMs) || el > s.panicMs) s.aborted = true;
  }

  function makeNull(p) {
    p.stack.push(new Undo(0, 0, p.castle, p.ep, p.half, p.full, p.hLo, p.hHi));
    p.ep = -1;
    p.half = 0;   // repetitions never reach back past a null move
    p.turn ^= 1;
    p.hLo ^= ZS_LO; p.hHi ^= ZS_HI;
    pushKey(p);
  }
  function unmakeNull(p) {
    var u = p.stack.pop();
    p.keyLo.pop(); p.keyHi.pop();
    p.turn ^= 1;
    p.ep = u.ep; p.half = u.half; p.hLo = u.lo; p.hHi = u.hi;
  }

  // Has the side `us` a piece other than pawns and the king (null move is unsafe without one)?
  function hasPieces(p, us) {
    var b = p.b, sq, pc;
    for (sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      pc = b[sq];
      if (pc !== 0 && (pc >> 3) === us && (pc & 7) !== PAWN && (pc & 7) !== KING) return true;
    }
    return false;
  }

  // Ordering: hash move, winning and equal captures (MVV-LVA), queen promotions, killer
  // moves, quiet moves by history, losing captures, under-promotions.
  function scoreMove(p, m, ttm, k1, k2) {
    if (m === ttm) return 4000000;
    var b = p.b, flags = (m >> 17) & 127, from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, victim, att, base;
    if (flags & (F_CAPTURE | F_EP)) {
      victim = (flags & F_EP) ? PAWN : (b[to] & 7);
      att = b[from] & 7;
      base = victim * 16 - att + (promo === QUEEN ? 100 : 0);
      if (promo !== 0 && promo !== QUEEN) return -300000 + base;
      if (SEE_VAL[victim] >= SEE_VAL[att] || see(p, m) >= 0) return 3000000 + base;
      return -100000 + base;
    }
    if (promo !== 0) return promo === QUEEN ? 2900000 : -300000;
    if (m === k1) return 2000000;
    if (m === k2) return 1900000;
    return HIST[(b[from] << 7) | to];
  }

  // Selection sort step: bring the best remaining move to index i.
  function pickNext(moves, scores, i, n) {
    var bi = i, bs = scores[i], j, tmp;
    for (j = i + 1; j < n; j++) if (scores[j] > bs) { bs = scores[j]; bi = j; }
    if (bi !== i) {
      tmp = moves[i]; moves[i] = moves[bi]; moves[bi] = tmp;
      tmp = scores[i]; scores[i] = scores[bi]; scores[bi] = tmp;
    }
  }

  function quiesce(s, alpha, beta, ply, qd) {
    if ((++s.nodes & 1023) === 0) checkTime(s);
    if (s.aborted) return 0;
    var p = s.p, b = p.b, us = p.turn;
    if (ply >= MAX_PLY - 1) return evaluate(p);
    var moves = [], scores = [], n, i, m, v, best, stand, legal = 0, flags, victim;
    if (qd < QS_CHECKS && attacked(b, p.kings[us], us ^ 1)) {
      // In check: every evasion, so that a mate at the end of a capture sequence is seen.
      best = -MATE + ply;
      genPseudo(p, moves, false);
      n = moves.length;
      for (i = 0; i < n; i++) scores.push(scoreMove(p, moves[i], 0, 0, 0));
      for (i = 0; i < n; i++) {
        pickNext(moves, scores, i, n);
        m = moves[i];
        makeMove(p, m);
        if (attacked(p.b, p.kings[us], us ^ 1)) { unmakeMove(p); continue; }
        legal++;
        v = -quiesce(s, -beta, -alpha, ply + 1, qd + 1);
        unmakeMove(p);
        if (s.aborted) return 0;
        if (v > best) {
          best = v;
          if (v > alpha) { alpha = v; if (v >= beta) break; }
        }
      }
      return best;
    }
    stand = evaluate(p);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (qd >= QS_MAX) return stand;
    best = stand;
    genPseudo(p, moves, true);
    n = moves.length;
    for (i = 0; i < n; i++) {
      m = moves[i]; flags = (m >> 17) & 127;
      victim = (flags & F_EP) ? PAWN : (b[(m >> 7) & 127] & 7);
      scores.push(victim * 16 - (b[m & 127] & 7) + ((flags & F_PROMO) ? 200 : 0));
    }
    for (i = 0; i < n; i++) {
      pickNext(moves, scores, i, n);
      m = moves[i];
      flags = (m >> 17) & 127;
      if (!(flags & F_PROMO)) {
        victim = (flags & F_EP) ? PAWN : (b[(m >> 7) & 127] & 7);
        if (stand + VALUE[victim] + 200 <= alpha) continue;                     // delta pruning
        if (SEE_VAL[victim] < SEE_VAL[b[m & 127] & 7] && see(p, m) < 0) continue; // losing capture
      }
      makeMove(p, m);
      if (attacked(p.b, p.kings[us], us ^ 1)) { unmakeMove(p); continue; }
      v = -quiesce(s, -beta, -alpha, ply + 1, qd + 1);
      unmakeMove(p);
      if (s.aborted) return 0;
      if (v > best) {
        best = v;
        if (v > alpha) { alpha = v; if (v >= beta) break; }
      }
    }
    return best;
  }

  function search(s, depth, alpha, beta, ply, nullOk) {
    if ((++s.nodes & 1023) === 0) checkTime(s);
    if (s.aborted) return 0;
    var p = s.p, us = p.turn;
    if (p.half >= 100 || isRepetition(p)) return 0;
    // Mate distance pruning: a mate found nearer the root is always better.
    if (alpha < -MATE + ply) alpha = -MATE + ply;
    if (beta > MATE - ply - 1) beta = MATE - ply - 1;
    if (alpha >= beta) return alpha;
    var chk = attacked(p.b, p.kings[us], us ^ 1);
    if (chk && ply < MAX_PLY / 2) depth++;          // check extension
    if (depth <= 0) return quiesce(s, alpha, beta, ply, 0);
    if (ply >= MAX_PLY - 1) return evaluate(p);
    var pv = beta - alpha > 1;
    var kn = p.keyLo.length - 1, lo = p.keyLo[kn], hi = p.keyHi[kn], ti = lo & TT_MASK, ttm = 0, ts, tf;
    if (ttLo[ti] === lo && ttHi[ti] === hi && ttFlag[ti] !== 0) {
      ttm = ttMove[ti];
      // Scores only from this search (moves from older ones still order the search): an old
      // entry may hold a draw by repetition reached along another game path.
      if (!pv && ttDepth[ti] >= depth && ttGen[ti] === ttGeneration) {
        ts = ttScore[ti];
        if (ts >= MATE_BOUND) ts -= ply; else if (ts <= -MATE_BOUND) ts += ply;
        tf = ttFlag[ti];
        if (tf === EXACT || (tf === LOWER && ts >= beta) || (tf === UPPER && ts <= alpha)) return ts;
      }
    }
    var stat = 0, futile = false;
    if (!chk && !pv) {
      stat = evaluate(p);
      // Reverse futility: far above beta at low depth, the opponent will not get back.
      if (depth <= 3 && beta < MATE_BOUND && beta > -MATE_BOUND && stat - 110 * depth >= beta) return stat;
      // Null move: even passing would keep the score above beta.
      if (nullOk && depth >= 3 && stat >= beta && hasPieces(p, us)) {
        makeNull(p);
        var ns = -search(s, depth - (depth >= 7 ? 4 : 3), -beta, -beta + 1, ply + 1, false);
        unmakeNull(p);
        if (s.aborted) return 0;
        if (ns >= beta) return ns >= MATE_BOUND ? beta : ns;
      }
      futile = depth <= 2 && alpha > -MATE_BOUND && stat + (depth === 1 ? 150 : 350) <= alpha;
    }
    var moves = [], scores = [], n, i, m, v, flags, quiet, gives, red;
    var legal = 0, best = -INF, bestM = 0, a0 = alpha, k1 = s.k1[ply], k2 = s.k2[ply];
    genPseudo(p, moves, false);
    n = moves.length;
    for (i = 0; i < n; i++) scores.push(scoreMove(p, moves[i], ttm, k1, k2));
    for (i = 0; i < n; i++) {
      pickNext(moves, scores, i, n);
      m = moves[i];
      flags = (m >> 17) & 127;
      makeMove(p, m);
      if (attacked(p.b, p.kings[us], us ^ 1)) { unmakeMove(p); continue; }
      legal++;
      quiet = !(flags & (F_CAPTURE | F_EP | F_PROMO));
      gives = attacked(p.b, p.kings[us ^ 1], us);
      if (futile && quiet && !gives && legal > 1) { unmakeMove(p); continue; }
      if (legal === 1) {
        v = -search(s, depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        red = 0;
        if (depth >= 3 && quiet && !chk && !gives && legal > 3 && m !== k1 && m !== k2) {
          red = legal > 10 ? 2 : 1;
          if (pv) red--;
          if (red > depth - 2) red = depth - 2;
        }
        v = -search(s, depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
        if (v > alpha && red > 0 && !s.aborted) v = -search(s, depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (v > alpha && v < beta && !s.aborted) v = -search(s, depth - 1, -beta, -alpha, ply + 1, true);
      }
      unmakeMove(p);
      if (s.aborted) return 0;
      if (v > best) {
        best = v; bestM = m;
        if (v > alpha) {
          alpha = v;
          if (v >= beta) {
            if (quiet) {
              if (s.k1[ply] !== m) { s.k2[ply] = s.k1[ply]; s.k1[ply] = m; }
              histAdd(p, m, depth);
            }
            break;
          }
        }
      }
    }
    if (legal === 0) return chk ? -MATE + ply : 0;
    ttStore(lo, hi, depth, best >= beta ? LOWER : (best > a0 ? EXACT : UPPER), best, bestM, ply);
    return best;
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i];
      a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Is the side to move checkmated?
  function isMated(p) {
    return attacked(p.b, p.kings[p.turn], p.turn ^ 1) && !hasLegalMove(p);
  }

  // After our move m, can the opponent checkmate at once?
  function allowsMate(p, m) {
    var replies = [], i, them, mated = false;
    makeMove(p, m);
    them = p.turn;
    genPseudo(p, replies, false);
    for (i = 0; i < replies.length && !mated; i++) {
      makeMove(p, replies[i]);
      if (!attacked(p.b, p.kings[them], them ^ 1) && isMated(p)) mated = true;
      unmakeMove(p);
    }
    unmakeMove(p);
    return mated;
  }

  // Root moves with the safety rules every level keeps: a mate in one is played at once,
  // and a move that lets the opponent mate at once is dropped whenever another move exists.
  // The rest is ordered (hash move, captures, ...) after a shuffle, for a random tie-break.
  function prepareRoot(p) {
    var legal = shuffle(genLegal(p, [])), mates = [], safe = [], i, m, sc = [], j, v;
    if (legal.length === 0) return null;
    for (i = 0; i < legal.length; i++) {
      makeMove(p, legal[i]);
      if (isMated(p)) mates.push(legal[i]);
      unmakeMove(p);
    }
    if (mates.length) return { mate: mates[0], list: mates };
    for (i = 0; i < legal.length; i++) if (!allowsMate(p, legal[i])) safe.push(legal[i]);
    var list = safe.length ? safe : legal;
    var kn = p.keyLo.length - 1, ti = p.keyLo[kn] & TT_MASK, ttm = 0;
    if (ttLo[ti] === p.keyLo[kn] && ttHi[ti] === p.keyHi[kn]) ttm = ttMove[ti];
    for (i = 0; i < list.length; i++) sc.push(scoreMove(p, list[i], ttm, 0, 0));
    for (i = 1; i < list.length; i++) {           // insertion sort, stable
      m = list[i]; v = sc[i]; j = i - 1;
      while (j >= 0 && sc[j] < v) { list[j + 1] = list[j]; sc[j + 1] = sc[j]; j--; }
      list[j + 1] = m; sc[j + 1] = v;
    }
    return { mate: 0, list: list };
  }

  // Easy: a short search (2 plies + captures) gives an exact score to every root move. She
  // plays the best one, or sometimes (cfg.weaker) another move within EASY_MARGIN of it. A
  // queen or rook left hanging, a free piece not taken or a mate allowed costs far more than
  // the margin, so those are never chosen when something better exists.
  var EASY_MARGIN = 60;   // 120 made it play g4, h3 or Na3 too often; 60 still makes human-like slips

  // A capture that wins a queen or a rook (taken for free, or by a smaller piece) and a new queen
  // that cannot be taken get a small bonus at the root: Bellatrix takes what is given, and
  // promotes when she safely can, unless another move is clearly better.
  var GRAB_BONUS = 80;
  function grabBonus(p, m) {
    var to = (m >> 7) & 127, victim;
    if (((m >> 14) & 7) === QUEEN && !attacked(p.b, to, p.turn ^ 1)) return GRAB_BONUS;
    if (!(((m >> 17) & 127) & F_CAPTURE)) return 0;
    victim = p.b[to] & 7;
    return (victim === ROOK || victim === QUEEN) && see(p, m) >= 150 ? GRAB_BONUS : 0;
  }

  function searchEasy(p, cfg, list) {
    var s = new Search(p, cfg), scores = [], i, v, best = -INF, floor, bonus;
    s.depth = cfg.depth;
    s.minDepth = cfg.depth;
    for (i = 0; i < list.length; i++) {
      bonus = grabBonus(p, list[i]);
      floor = best === -INF ? -INF : best - cfg.margin - 1 - bonus;
      makeMove(p, list[i]);
      v = -search(s, cfg.depth - 1, -INF, -floor, 1, true);
      unmakeMove(p);
      if (s.aborted) break;
      if (v < MATE_BOUND && v > -MATE_BOUND) v += bonus;
      scores.push(v);
      if (v > best) best = v;
    }
    var top = [], near = [];
    for (i = 0; i < scores.length; i++) {
      if (scores[i] >= best - 3) top.push(list[i]);
      else if (best < MATE_BOUND && scores[i] > -MATE_BOUND && scores[i] >= best - cfg.margin) near.push(list[i]);
    }
    if (top.length === 0) top.push(list[0]);
    var pool = near.length && Math.random() < cfg.weaker ? near : top;
    return { move: pool[Math.floor(Math.random() * pool.length)], score: best, depth: scores.length === list.length ? cfg.depth : 0, nodes: s.nodes };
  }

  // Medium / hard: iterative deepening with PVS at the root. A small random bonus per root
  // move (cfg.jitter, non-mate scores only) varies the games; hard only uses it in the opening.
  // The grab bonus is added the same way.
  function searchDeep(p, cfg, list) {
    var s = new Search(p, cfg), n = list.length, jit = [], i, d, j, m, v, a, tot;
    var bestMove = list[0], bestScore = 0, done = 0, curIdx, curBest;
    var useJit = cfg.jitter > 0 && (!cfg.jitterPlies || p.stack.length < cfg.jitterPlies);
    for (i = 0; i < n; i++) jit.push((useJit ? Math.floor(Math.random() * (cfg.jitter + 1)) : 0) + grabBonus(p, list[i]));
    for (d = 1; d <= cfg.maxDepth; d++) {
      s.depth = d;
      curIdx = -1; curBest = -INF;
      for (i = 0; i < n; i++) {
        m = list[i]; j = jit[i];
        makeMove(p, m);
        if (curIdx < 0) {
          v = -search(s, d - 1, -INF, INF, 1, true);
        } else {
          a = curBest > MATE_BOUND || curBest < -MATE_BOUND ? curBest : curBest - j;
          v = -search(s, d - 1, -a - 1, -a, 1, true);
          if (v > a && !s.aborted) v = -search(s, d - 1, -INF, -a, 1, true);
        }
        unmakeMove(p);
        if (s.aborted) break;
        tot = v >= MATE_BOUND || v <= -MATE_BOUND ? v : v + j;
        if (curIdx < 0 || tot > curBest) { curBest = tot; curIdx = i; }
      }
      if (s.aborted) {
        // A move searched to the end that beat the previous best (searched first) is kept.
        if (curIdx > 0) { bestMove = list[curIdx]; bestScore = curBest; }
        break;
      }
      bestMove = list[curIdx];
      bestScore = curBest;
      done = d;
      m = list[curIdx]; j = jit[curIdx];            // best move first in the next iteration
      for (i = curIdx; i > 0; i--) { list[i] = list[i - 1]; jit[i] = jit[i - 1]; }
      list[0] = m; jit[0] = j;
      if (bestScore >= MATE_BOUND) break;             // forced mate found
      if (Date.now() - s.t0 > cfg.soft) break;        // the next iteration would take too long
    }
    return { move: bestMove, score: bestScore, depth: done, nodes: s.nodes };
  }

  // Levels. Times are wall-clock milliseconds, so a slower screen searches less deep but
  // never waits longer: soft = no new iteration after this, hard = stop the search
  // (after minDepth plies), panic = stop in any case.
  var LEVELS = {
    easy:   { easy: true, depth: 2, margin: EASY_MARGIN, weaker: 0.35, hard: 2000, panic: 2500 },
    medium: { maxDepth: 4, soft: 200, hard: 600, panic: 1500, minDepth: 2, jitter: 10 },
    hard:   { maxDepth: 40, soft: 160, hard: 450, panic: 1500, minDepth: 2, jitter: 6, jitterPlies: 16 }
  };

  // Full search result: { move, score (centipawns, side to move), depth, nodes, ms, level }.
  function think(g, level, opts) {
    var p = clonePos(g._p), cfg = LEVELS[level] || LEVELS.medium, t0 = Date.now(), k, r;
    if (opts) { var c = {}; for (k in cfg) c[k] = cfg[k]; for (k in opts) c[k] = opts[k]; cfg = c; }
    ttInit();
    ttGeneration = (ttGeneration + 1) & 255;
    ageHistory();
    var root = prepareRoot(p);
    if (!root) return null;
    if (root.mate) r = { move: root.mate, score: MATE - 1, depth: 1, nodes: 0 };
    else if (root.list.length === 1) r = { move: root.list[0], score: 0, depth: 0, nodes: 0 };
    else r = cfg.easy ? searchEasy(p, cfg, root.list) : searchDeep(p, cfg, root.list);
    return { move: moveObj(g._p, r.move), score: r.score, depth: r.depth, nodes: r.nodes, ms: Date.now() - t0, level: LEVELS[level] ? level : 'medium' };
  }

  function bestMove(g, level, opts) {
    var r = think(g, level, opts);
    return r ? r.move : null;
  }

  // Every move that checkmates at once (used by the puzzles and their hints).
  function matingMoves(g) {
    var p = clonePos(g._p), list = genLegal(p, []), out = [], i;
    for (i = 0; i < list.length; i++) {
      makeMove(p, list[i]);
      if (isMated(p)) { unmakeMove(p); out.push(moveObj(p, list[i])); } else unmakeMove(p);
    }
    return out;
  }

  return {
    create: create,
    perft: perft,
    bestMove: bestMove,
    think: think,
    matingMoves: matingMoves,
    evaluate: function (g) { return evaluate(g._p); },
    LEVELS: LEVELS,
    MATE: MATE,
    DEFAULT_FEN: DEFAULT_FEN
  };
})();

if (typeof module !== 'undefined') module.exports = BellatrixChess;
