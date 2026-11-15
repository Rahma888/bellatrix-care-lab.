/* A small QR code encoder (version 1.15), no library: byte mode (UTF-8), error correction level M
   (15 % of the code may be damaged), versions 1 to 40, the mask with the lowest penalty. Used by
   the Care Team's Family tab to show the call link as a QR code that a phone camera opens.
   The steps follow the QR standard (ISO/IEC 18004): data bits, Reed-Solomon blocks, interleaving,
   function patterns, zigzag placement, masking and format/version bits.

   BellatrixQR.matrix(text) -> array of rows of booleans (true = dark), or null if too long.
   BellatrixQR.svg(text, { quiet: 4 }) -> an SVG string (dark on white, 4 modules of quiet zone). */
var BellatrixQR = (function () {
  'use strict';
  /* Level M: error correction codewords per block, and number of blocks, per version (index 0 unused). */
  var ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
  var BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
  var FORMAT_M = 0;   /* the two error-correction bits of level M in the format information */

  function rawModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) { var n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
    return r;
  }
  function dataCodewords(ver) { return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * BLOCKS[ver]; }
  function utf8(text) {
    var s = unescape(encodeURIComponent(String(text))), out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  /* ---------- Reed-Solomon over GF(256), polynomial 0x11D ---------- */
  function gmul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z;
  }
  function rsDivisor(degree) {
    var r = [], i, j, root = 1;
    for (i = 0; i < degree - 1; i++) r.push(0);
    r.push(1);
    for (i = 0; i < degree; i++) {
      for (j = 0; j < r.length; j++) { r[j] = gmul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      root = gmul(root, 0x02);
    }
    return r;
  }
  function rsRemainder(data, div) {
    var r = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ r.shift();
      r.push(0);
      div.forEach(function (c, i) { r[i] ^= gmul(c, f); });
    });
    return r;
  }

  function encode(text) {
    var bytes = utf8(text), ver, cap;
    for (ver = 1; ver <= 40; ver++) {
      cap = dataCodewords(ver) * 8;
      if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= cap) break;
    }
    if (ver > 40) return null;
    /* Data bits: mode "byte" (0100), the length, the bytes, a terminator, then padding. */
    var bits = [];
    function put(v, n) { for (var i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); }
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) { var v = 0; for (var k = 0; k < 8; k++) v = (v << 1) | bits[i + k]; data.push(v); }

    /* Blocks with their error correction, then interleaved. */
    var nb = BLOCKS[ver], ecLen = ECC_PER_BLOCK[ver], raw = Math.floor(rawModules(ver) / 8);
    var shortN = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(ecLen), blocks = [], pos = 0;
    for (i = 0; i < nb; i++) {
      var dat = data.slice(pos, pos + shortLen - ecLen + (i < shortN ? 0 : 1));
      pos += dat.length;
      var ecc = rsRemainder(dat, div);
      if (i < shortN) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var words = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (var j = 0; j < blocks.length; j++) if (i !== shortLen - ecLen || j >= shortN) words.push(blocks[j][i]);
    }

    /* The grid: function patterns first, then the data in the zigzag, then the best mask. */
    var size = ver * 4 + 17, mod = [], fn = [];
    for (i = 0; i < size; i++) { mod.push([]); fn.push([]); for (j = 0; j < size; j++) { mod[i].push(false); fn[i].push(false); } }
    function set(x, y, dark) { mod[y][x] = dark; fn[y][x] = true; }
    for (i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var al = [];
    if (ver > 1) {
      var na = Math.floor(ver / 7) + 2, step = Math.floor((ver * 8 + na * 3 + 5) / (na * 4 - 4)) * 2;
      for (var p = size - 7; al.length < na - 1; p -= step) al.unshift(p);
      al.unshift(6);
    }
    al.forEach(function (ay, ia) {
      al.forEach(function (ax, ja) {
        if ((ia === 0 && ja === 0) || (ia === 0 && ja === al.length - 1) || (ia === al.length - 1 && ja === 0)) return;
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      });
    });
    function format(mask) {
      var d = (FORMAT_M << 3) | mask, rem = d;
      for (var n = 0; n < 10; n++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var b = ((d << 10) | rem) ^ 0x5412, q;
      for (q = 0; q <= 5; q++) set(8, q, ((b >>> q) & 1) === 1);
      set(8, 7, ((b >>> 6) & 1) === 1); set(8, 8, ((b >>> 7) & 1) === 1); set(7, 8, ((b >>> 8) & 1) === 1);
      for (q = 9; q < 15; q++) set(14 - q, 8, ((b >>> q) & 1) === 1);
      for (q = 0; q < 8; q++) set(size - 1 - q, 8, ((b >>> q) & 1) === 1);
      for (q = 8; q < 15; q++) set(8, size - 15 + q, ((b >>> q) & 1) === 1);
      set(8, size - 8, true);
    }
    format(0);   /* reserves the format areas */
    if (ver >= 7) {
      var rv = ver;
      for (i = 0; i < 12; i++) rv = (rv << 1) ^ ((rv >>> 11) * 0x1F25);
      var vb = (ver << 12) | rv;
      for (i = 0; i < 18; i++) { var bit = ((vb >>> i) & 1) === 1, a = size - 11 + i % 3, b2 = Math.floor(i / 3); set(a, b2, bit); set(b2, a, bit); }
    }
    var n = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var jj = 0; jj < 2; jj++) {
          var x = right - jj, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
          if (!fn[y][x] && n < words.length * 8) { mod[y][x] = ((words[n >>> 3] >>> (7 - (n & 7))) & 1) === 1; n++; }
        }
      }
    }
    function maskOn(m, x, y) {
      switch (m) {
        case 0: return (x + y) % 2 === 0;
        case 1: return y % 2 === 0;
        case 2: return x % 3 === 0;
        case 3: return (x + y) % 3 === 0;
        case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
        case 5: return (x * y) % 2 + (x * y) % 3 === 0;
        case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
        default: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
      }
    }
    function applyMask(m) { for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) if (!fn[yy][xx] && maskOn(m, xx, yy)) mod[yy][xx] = !mod[yy][xx]; }
    var best = 0, bestScore = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m); format(m);
      var sc = penalty(mod, size);
      if (sc < bestScore) { bestScore = sc; best = m; }
      applyMask(m);   /* undo */
    }
    applyMask(best); format(best);
    return mod;
  }
  /* The standard's four penalty rules (runs, 2x2 blocks, finder-like patterns, dark balance). */
  function penalty(mod, size) {
    var score = 0, x, y, dark = 0;
    function runs(get) {
      for (var a = 0; a < size; a++) {
        var run = 1, line = [];
        for (var b = 0; b < size; b++) line.push(get(a, b));
        for (b = 1; b <= size; b++) {
          if (b < size && line[b] === line[b - 1]) run++;
          else { if (run >= 5) score += 3 + (run - 5); run = 1; }
        }
        var s = line.map(function (v) { return v ? '1' : '0'; }).join('');
        var re = /(?=(10111010000|00001011101))/g;
        while (re.exec(s)) { score += 40; re.lastIndex++; }
      }
    }
    runs(function (a, b) { return mod[a][b]; });
    runs(function (a, b) { return mod[b][a]; });
    for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) {
      var c = mod[y][x];
      if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) score += 3;
    }
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (mod[y][x]) dark++;
    var total = size * size, k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    return score + Math.max(0, k) * 10;
  }

  function svg(text, o) {
    o = o || {};
    var m = encode(text);
    if (!m) return '';
    var q = o.quiet === undefined ? 4 : o.quiet, n = m.length + 2 * q, d = [];
    m.forEach(function (row, y) { row.forEach(function (on, x) { if (on) d.push('M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z'); }); });
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
      '<rect width="' + n + '" height="' + n + '" fill="#FFFFFF"/><path fill="#000000" d="' + d.join('') + '"/></svg>';
  }
  return { matrix: encode, svg: svg };
})();
if (typeof module !== 'undefined') module.exports = BellatrixQR;
