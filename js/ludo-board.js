/* The Ludo board and dice as SVG (version 1.11), shared by the Ludo activity of the Board games pack
   (labland/packs/board-games/ludo-ui.js), the game during a family call (js/familycall.js) and the
   family's page (js/famille.js). Pure drawing: no rules (those are in BellatrixLudo, ludo.js of the
   pack), no DOM, no Lab, so it works on any page.

   Board model (shared with ludo.js): arm k owns loop cells k*13 .. k*13+12 in the direction of
   play; on each arm: cells 0-5 go outwards along its left column, 6 is the tip, 7-12 come back
   along its right column. A seat starts on cell 8 of its arm; stars on cells 3 and 8; its home
   column is the middle of its arm (5 cells), then the centre.

   LudoBoard.boardSvg(state, view)  state: a BellatrixLudo state (arms, L, seats[].arm/color/tokens);
                                    view: { hot: { seatIndex: [tokens that can move] }, moving: { seat, token, pos } }
   LudoBoard.dieSvg(n, colour)      LudoBoard.tokenIcon(colourName, label)
   LudoBoard.COLORS, ORDER, COLOR_NAME, CELL, geom(arms), tint(hex, a) */
var LudoBoard = (function () {
  'use strict';
  var COLORS = { red: '#D93B3B', green: '#2E9E5B', yellow: '#E8B923', blue: '#2F6FD1', purple: '#8E4FC2', orange: '#E07B28' };
  var ORDER = ['red', 'green', 'yellow', 'blue', 'purple', 'orange'];
  var COLOR_NAME = { red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue', purple: 'Purple', orange: 'Orange' };

  var CELL = 40;
  function geom(arms) {
    var R = 1.5 / Math.tan(Math.PI / arms);
    function ang(k) { return (k * 360 / arms - 90) * Math.PI / 180; }
    function at(k, u, v) {
      var t = ang(k), dx = Math.cos(t), dy = Math.sin(t);
      return { x: dx * (R + v + 0.5) * CELL - dy * u * CELL, y: dy * (R + v + 0.5) * CELL + dx * u * CELL, rot: k * 360 / arms };
    }
    function loop(abs) {
      var k = Math.floor(abs / 13) % arms, j = abs % 13;
      return j <= 5 ? at(k, -1, j) : j === 6 ? at(k, 0, 5) : at(k, 1, 12 - j);
    }
    function home(k, i) { return at(k, 0, 4 - i); }
    var yd = arms === 4 ? 6.36 : 6.8, yr = arms === 4 ? 2.3 : 1.6;
    function yard(k) { var t = ang(k) + Math.PI / arms; return { x: Math.cos(t) * yd * CELL, y: Math.sin(t) * yd * CELL, r: yr * CELL }; }
    function centre(k) { var t = ang(k); return { x: Math.cos(t) * R * 0.55 * CELL, y: Math.sin(t) * R * 0.55 * CELL }; }
    return { arms: arms, R: R, ext: (R + 6.4) * CELL, at: at, loop: loop, home: home, yard: yard, centre: centre, ang: ang };
  }
  function star(x, y, r, fill) {
    var p = [];
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; p.push((x + Math.cos(a) * rr).toFixed(1) + ',' + (y + Math.sin(a) * rr).toFixed(1)); }
    return '<polygon points="' + p.join(' ') + '" fill="' + fill + '"/>';
  }
  function sq(c, fill, extra) {
    var h = CELL / 2 - 1.5;
    return '<rect x="' + (c.x - h).toFixed(1) + '" y="' + (c.y - h).toFixed(1) + '" width="' + (2 * h) + '" height="' + (2 * h) + '" rx="4" fill="' + fill + '" stroke="#5B6770" stroke-width="1.5"' +
      ' transform="rotate(' + c.rot.toFixed(1) + ' ' + c.x.toFixed(1) + ' ' + c.y.toFixed(1) + ')"/>' + (extra || '');
  }
  function tint(hex, a) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return 'rgb(' + Math.round(r + (255 - r) * a) + ',' + Math.round(g + (255 - g) * a) + ',' + Math.round(b + (255 - b) * a) + ')';
  }
  /* view: { hot: { seatIndex: [tokens that can move] }, moving: { seat, token, pos } } */
  function boardSvg(state, view) {
    view = view || {};
    var G = geom(state.arms), L = state.L, out = [], armColor = {}, i, k;
    state.seats.forEach(function (s) { armColor[s.arm] = COLORS[s.color]; });
    out.push('<svg viewBox="' + (-G.ext) + ' ' + (-G.ext) + ' ' + (2 * G.ext) + ' ' + (2 * G.ext) + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">');
    out.push('<circle cx="0" cy="0" r="' + (G.ext - 4) + '" fill="#F0F0F0" stroke="#BFC9D4" stroke-width="6"/>');
    for (k = 0; k < G.arms; k++) {
      var col = armColor[k], y = G.yard(k);
      var yardSeat = state.seats.filter(function (s) { return s.arm === k; })[0];
      if (yardSeat) {
        out.push('<circle cx="' + y.x.toFixed(1) + '" cy="' + y.y.toFixed(1) + '" r="' + y.r.toFixed(1) + '" fill="' + COLORS[yardSeat.color] + '"/>');
        out.push('<circle cx="' + y.x.toFixed(1) + '" cy="' + y.y.toFixed(1) + '" r="' + (y.r * 0.74).toFixed(1) + '" fill="#FFFFFF"/>');
      }
      for (var j = 0; j < 13; j++) {
        var abs = k * 13 + j, c = G.loop(abs), fill = '#FFFFFF', extra = '';
        if (j === 8 && col) fill = col;
        if (j === 8 || j === 3) extra = star(c.x, c.y, CELL * 0.34, j === 8 && col ? '#FFFFFF' : '#8A96A3');
        out.push(sq(c, fill, extra));
      }
      for (i = 0; i < 5; i++) out.push(sq(G.home(k, i), col ? tint(col, 0.35) : '#E0E0E0'));
    }
    var Rv = G.R / Math.cos(Math.PI / G.arms) * CELL;
    for (k = 0; k < G.arms; k++) {
      var a1 = G.ang(k) - Math.PI / G.arms, a2 = G.ang(k) + Math.PI / G.arms;
      out.push('<polygon points="0,0 ' + (Math.cos(a1) * Rv).toFixed(1) + ',' + (Math.sin(a1) * Rv).toFixed(1) + ' ' + (Math.cos(a2) * Rv).toFixed(1) + ',' + (Math.sin(a2) * Rv).toFixed(1) +
        '" fill="' + (armColor[k] || '#E0E0E0') + '" stroke="#FFFFFF" stroke-width="3"/>');
    }
    /* Tokens: where each one stands, then drawn with a small offset when several share a cell. */
    var spots = {}, list = [];
    state.seats.forEach(function (s, si) {
      s.tokens.forEach(function (pos, ti) {
        if (view.moving && view.moving.seat === si && view.moving.token === ti) pos = view.moving.pos;
        var p, key;
        if (pos < 0) { var yy = G.yard(s.arm), off = yy.r * 0.36; p = { x: yy.x + (ti % 2 ? off : -off), y: yy.y + (ti < 2 ? -off : off) }; key = 'y' + si + ti; }
        else if (pos <= L - 2) { var ab = (s.arm * 13 + 8 + pos) % L; p = G.loop(ab); key = 'l' + ab; }
        else if (pos <= L + 3) { p = G.home(s.arm, pos - (L - 1)); key = 'h' + si + pos; }
        else { p = G.centre(s.arm); key = 'f' + si; }
        spots[key] = (spots[key] || 0) + 1;
        list.push({ si: si, ti: ti, x: p.x, y: p.y, key: key, n: spots[key] - 1 });
      });
    });
    list.forEach(function (t) {
      var s = state.seats[t.si], many = spots[t.key], r = CELL * (many > 1 ? 0.3 : 0.38);
      var ox = many > 1 ? (t.n % 2 ? 1 : -1) * CELL * 0.2 : 0, oy = many > 2 ? (t.n < 2 ? -1 : 1) * CELL * 0.2 : 0;
      var x = t.x + ox, y = t.y + oy, hot = view.hot && view.hot[t.si] && view.hot[t.si].indexOf(t.ti) >= 0;
      if (hot) out.push('<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (r + 9).toFixed(1) + '" fill="none" stroke="#333333" stroke-width="5" stroke-dasharray="6 5"/>');
      out.push('<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + COLORS[s.color] + '" stroke="#FFFFFF" stroke-width="4"/>');
      out.push('<text x="' + x.toFixed(1) + '" y="' + (y + r * 0.42).toFixed(1) + '" text-anchor="middle" font-size="' + (r * 1.15).toFixed(1) + '" font-weight="700" font-family="sans-serif" fill="' + (s.color === 'yellow' ? '#333333' : '#FFFFFF') + '">' + (t.ti + 1) + '</text>');
    });
    out.push('</svg>');
    return out.join('');
  }
  function dieSvg(n, color) {
    var P = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]],
      5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]] };
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="6" y="6" width="88" height="88" rx="18" fill="#FFFFFF" stroke="' + (color || '#333333') + '" stroke-width="7"/>' +
      (P[n] || []).map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="9" fill="#333333"/>'; }).join('') + '</svg>';
  }
  function tokenIcon(color, n) {
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" fill="' + COLORS[color] + '" stroke="#FFFFFF" stroke-width="8"/>' +
      '<text x="50" y="66" text-anchor="middle" font-size="46" font-weight="700" font-family="sans-serif" fill="' + (color === 'yellow' ? '#333333' : '#FFFFFF') + '">' + n + '</text></svg>';
  }

  return { COLORS: COLORS, ORDER: ORDER, COLOR_NAME: COLOR_NAME, CELL: CELL, geom: geom, tint: tint, boardSvg: boardSvg, dieSvg: dieSvg, tokenIcon: tokenIcon };
})();
