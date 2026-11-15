/* Original illustrations for the Bellatrix Care Lab.
   Wide pictures use a 1000 x 420 view box and fill their box; icons use 100 x 100.
   Bold shapes and a dark outline keep them readable from a chair at arm's length.
   2026-11-14: the patient screen is dominated by white (clinic identity). The pictures use natural, varied, soft
   colours (pale sky, grass, wood, food, dark music notes, red and black cards) on white or very light grey;
   the brand blue appears only as a small accent. The Picture Pair symbols keep one clear colour each. */
var ART = (function () {
  'use strict';
  var A = {};
  var BG = '#F7F7F7';
  var INK = '#333333';
  function wide(body) { return '<svg viewBox="0 0 1000 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + body + '</svg>'; }
  /* Composed pictures are scaled to fit, never cropped; their background bleeds to the box edges. */
  function scene(bg, body) { return '<svg viewBox="0 0 1000 420" preserveAspectRatio="xMidYMid meet" style="overflow:visible" aria-hidden="true"><rect x="-4000" y="-4000" width="9000" height="9000" fill="' + bg + '"/>' + body + '</svg>'; }
  function icon(body) { return '<svg viewBox="0 0 100 100" aria-hidden="true">' + body + '</svg>'; }

  /* ---------- wide pictures ---------- */
  A.sea = wide(
    '<rect width="1000" height="420" fill="#E3F1FA"/><circle cx="720" cy="196" r="58" fill="#FFC531"/>' +
    '<rect y="232" width="1000" height="188" fill="#6DB3CF"/>' +
    '<rect x="676" y="248" width="88" height="7" rx="3" fill="#FFFFFF"/><rect x="690" y="268" width="60" height="7" rx="3" fill="#FFFFFF"/><rect x="702" y="288" width="36" height="7" rx="3" fill="#FFFFFF"/>' +
    '<path d="M300 306 L388 306 L366 330 L322 330 Z" fill="#8A5A3C"/><rect x="342" y="222" width="4" height="86" fill="#5B3A1E"/>' +
    '<path d="M348 300 L348 226 L396 300 Z" fill="#FFFFFF"/><path d="M338 300 L338 244 L302 300 Z" fill="#E0594D"/>' +
    '<path d="M60 340 q30 -14 60 0 t60 0 t60 0" fill="none" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="5" stroke-linecap="round"/>' +
    '<path d="M520 360 q30 -14 60 0 t60 0 t60 0 t60 0" fill="none" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="5" stroke-linecap="round"/>' +
    '<path d="M0 420 L0 388 Q250 352 520 394 T1000 382 L1000 420 Z" fill="#EBD9AE"/>');

  A.mountain = wide(
    '<rect width="1000" height="420" fill="#E3F1FA"/><circle cx="190" cy="86" r="34" fill="#FFFFFF"/>' +
    '<path d="M0 262 L150 150 L260 222 L420 88 L560 232 L700 140 L860 242 L1000 172 L1000 420 L0 420 Z" fill="#B5C2CE"/>' +
    '<path d="M420 88 L376 152 L406 142 L420 164 L440 140 L468 152 Z" fill="#FFFFFF"/><path d="M700 140 L668 186 L692 178 L704 194 L722 176 L742 186 Z" fill="#FFFFFF"/>' +
    '<path d="M0 332 L180 232 L330 312 L520 202 L700 322 L860 252 L1000 312 L1000 420 L0 420 Z" fill="#7FA283"/>' +
    '<path d="M0 356 Q250 338 500 354 T1000 348 L1000 420 L0 420 Z" fill="#9CC47B"/>' +
    '<rect x="260" y="378" width="140" height="6" rx="3" fill="#FFFFFF" fill-opacity=".5"/><rect x="600" y="392" width="200" height="6" rx="3" fill="#FFFFFF" fill-opacity=".45"/>' +
    '<polygon points="60,330 30,392 90,392" fill="#2F6B3F"/><polygon points="110,318 74,392 146,392" fill="#2F6B3F"/><polygon points="920,324 888,392 952,392" fill="#2F6B3F"/>');

  A.forest = (function () {
    var seed = 11;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    function pine(x, base, h, fill) {
      var w = h * 0.45;
      return '<polygon points="' + x + ',' + (base - h) + ' ' + (x - w / 2) + ',' + (base - h * 0.4) + ' ' + (x + w / 2) + ',' + (base - h * 0.4) + '" fill="' + fill + '"/>' +
        '<polygon points="' + x + ',' + (base - h * 0.72) + ' ' + (x - w * 0.7) + ',' + base + ' ' + (x + w * 0.7) + ',' + base + '" fill="' + fill + '"/>' +
        '<rect x="' + (x - 4) + '" y="' + base + '" width="8" height="' + (h * 0.1) + '" fill="' + fill + '"/>';
    }
    var s = '' +
      '<rect width="1000" height="420" fill="#F3F8EC"/><circle cx="780" cy="92" r="120" fill="#FFF3C4" fill-opacity=".8"/>';
    var x;
    for (x = 10; x < 1020; x += 48) s += pine(x, 268, 120 + rnd() * 40, '#BBD8AE');
    s += '<rect y="268" width="1000" height="152" fill="#BBD8AE"/>';
    for (x = 20; x < 1020; x += 64) s += pine(x, 322, 170 + rnd() * 50, '#5E9C5F');
    s += '<rect y="322" width="1000" height="98" fill="#8DBB6F"/><path d="M430 420 Q480 360 496 322 Q512 360 590 420 Z" fill="#EBD9AE"/>';
    for (x = -10; x < 340; x += 72) s += pine(x, 440, 270 + rnd() * 60, '#2F6B3F');
    for (x = 700; x < 1040; x += 72) s += pine(x, 440, 270 + rnd() * 60, '#2F6B3F');
    return wide(s);
  })();

  A.bubbles = scene(BG,
    '<rect x="90" y="60" width="520" height="170" rx="60" fill="#F6D9A8"/><polygon points="170,226 150,330 260,226" fill="#F6D9A8"/>' +
    '<rect x="400" y="190" width="510" height="170" rx="60" fill="#D5E8D0"/><polygon points="800,356 850,412 760,358" fill="#D5E8D0"/>' +
    '<circle cx="230" cy="145" r="17" fill="#8A5A1E"/><circle cx="310" cy="145" r="17" fill="#8A5A1E"/><circle cx="390" cy="145" r="17" fill="#8A5A1E"/>' +
    '<rect x="480" y="252" width="340" height="20" rx="10" fill="#4F6B4A" fill-opacity=".7"/><rect x="480" y="292" width="220" height="20" rx="10" fill="#4F6B4A" fill-opacity=".7"/>');

  A.garden = wide(
    '<rect width="1000" height="420" fill="#E3F1FA"/><circle cx="830" cy="90" r="52" fill="#FFC531"/>' +
    '<path d="M0 250 Q250 210 520 244 T1000 232 L1000 420 L0 420 Z" fill="#C5DEB0"/>' +
    '<path d="M0 300 Q300 270 600 300 T1000 296 L1000 420 L0 420 Z" fill="#8DBB6F"/>' +
    (function () {
      var s = '', i, x;
      for (i = 0; i < 12; i++) { x = 30 + i * 84; s += '<rect x="' + x + '" y="214" width="14" height="96" rx="4" fill="#C9A27A"/>'; }
      s += '<rect x="0" y="236" width="1000" height="10" fill="#C9A27A"/><rect x="0" y="276" width="1000" height="10" fill="#C9A27A"/>';
      var cols = ['#D64545', '#FFC531', '#B58BD6', '#E8957F', '#C0392B', '#FFFFFF', '#FFC531', '#D64545'];
      for (i = 0; i < 16; i++) {
        x = 40 + i * 62;
        var y = 340 + (i % 3) * 18, c = cols[i % cols.length];
        s += '<rect x="' + (x - 3) + '" y="' + y + '" width="6" height="60" fill="#3F8F4F"/>' +
          '<circle cx="' + (x - 13) + '" cy="' + y + '" r="12" fill="' + c + '"/><circle cx="' + (x + 13) + '" cy="' + y + '" r="12" fill="' + c + '"/>' +
          '<circle cx="' + x + '" cy="' + (y - 13) + '" r="12" fill="' + c + '"/><circle cx="' + x + '" cy="' + (y + 13) + '" r="12" fill="' + c + '"/>' +
          '<circle cx="' + x + '" cy="' + y + '" r="9" fill="#7A4A1E"/>';
      }
      return s;
    })());

  A.music = scene(BG,
    '<g stroke="#333333" stroke-width="5" stroke-opacity=".22">' +
    '<line x1="60" y1="140" x2="940" y2="140"/><line x1="60" y1="180" x2="940" y2="180"/><line x1="60" y1="220" x2="940" y2="220"/><line x1="60" y1="260" x2="940" y2="260"/><line x1="60" y1="300" x2="940" y2="300"/></g>' +
    '<g fill="#333333"><ellipse cx="250" cy="280" rx="30" ry="22" transform="rotate(-20 250 280)"/><rect x="274" y="130" width="10" height="150"/>' +
    '<ellipse cx="420" cy="240" rx="30" ry="22" transform="rotate(-20 420 240)"/><rect x="444" y="90" width="10" height="150"/>' +
    '<ellipse cx="560" cy="260" rx="30" ry="22" transform="rotate(-20 560 260)"/><rect x="584" y="110" width="10" height="150"/>' +
    '<rect x="444" y="90" width="150" height="24"/></g>' +
    '<g fill="#E8841A"><ellipse cx="760" cy="200" rx="30" ry="22" transform="rotate(-20 760 200)"/><rect x="784" y="60" width="10" height="140"/><path d="M794 60 q50 30 20 90 q10 -50 -20 -60 Z"/></g>');

  A.call = scene(BG,
    '<rect x="110" y="60" width="360" height="300" rx="34" fill="#FFFFFF" stroke="#555555" stroke-width="8"/>' +
    '<circle cx="290" cy="170" r="54" fill="#F0C9A0"/><path d="M200 330 q90 -110 180 0 Z" fill="#8FB996"/>' +
    '<rect x="530" y="60" width="360" height="300" rx="34" fill="#FFFFFF" stroke="#555555" stroke-width="8"/>' +
    '<circle cx="710" cy="170" r="54" fill="#E3B58E"/><path d="M620 330 q90 -110 180 0 Z" fill="#E8A87C"/>' +
    '<circle cx="500" cy="380" r="30" fill="#1E8A5A"/><path d="M486 370 q14 22 28 0" stroke="#FFFFFF" stroke-width="6" fill="none" stroke-linecap="round"/>');

  A.dining = scene(BG,
    '<rect y="250" width="1000" height="170" fill="#C9A27A"/><rect y="250" width="1000" height="16" fill="#B38A62"/>' +
    '<ellipse cx="320" cy="290" rx="150" ry="44" fill="#FFFFFF" stroke="#E0E0E0" stroke-width="4"/><ellipse cx="320" cy="282" rx="90" ry="24" fill="#E3A94F"/>' +
    '<ellipse cx="680" cy="290" rx="150" ry="44" fill="#FFFFFF" stroke="#E0E0E0" stroke-width="4"/><ellipse cx="680" cy="282" rx="90" ry="24" fill="#D64545"/>' +
    '<rect x="128" y="246" width="12" height="84" rx="6" fill="#8A96A3"/><rect x="860" y="246" width="12" height="84" rx="6" fill="#8A96A3"/>' +
    '<path d="M300 220 q-14 -30 0 -60 q14 -30 0 -60" stroke="#E0E0E0" stroke-width="8" fill="none" stroke-linecap="round"/>' +
    '<path d="M340 220 q-14 -30 0 -60 q14 -30 0 -60" stroke="#E0E0E0" stroke-width="8" fill="none" stroke-linecap="round"/>');

  A.kind = scene(BG,
    heart(300, 210, 1.5, '#D64545') + heart(520, 170, 1.1, '#EE8FA6') + heart(700, 240, 1.3, '#F2A33A'));
  function heart(cx, cy, k, fill) {
    return '<path transform="translate(' + cx + ' ' + cy + ') scale(' + k + ')" d="M0 60 C-90 0 -60 -70 0 -30 C60 -70 90 0 0 60 Z" fill="' + fill + '"/>';
  }

  A.pairs = scene(BG,
    card(110, '#FFC531', 'sun') + card(400, '#D64545', 'heart') + card(690, '#FFC531', 'sun'));
  function card(x, c, kind) {
    var inner = kind === 'sun'
      ? '<circle cx="' + (x + 100) + '" cy="210" r="60" fill="' + c + '" stroke="' + INK + '" stroke-width="8"/>'
      : '<path transform="translate(' + (x + 100) + ' 200) scale(1.1)" d="M0 60 C-90 0 -60 -70 0 -30 C60 -70 90 0 0 60 Z" fill="' + c + '" stroke="' + INK + '" stroke-width="7"/>';
    return '<rect x="' + x + '" y="60" width="200" height="300" rx="28" fill="#FFFFFF" stroke="#555555" stroke-width="8"/>' + inner;
  }

  /* ---------- seated movement figure, seen from the front, 400 x 400 ----------
     The person on the screen faces the participant like a mirror. Arms are polylines from the
     shoulder over the elbow to the hand; the dashed orange arrow shows the movement. */
  var ARMS = {
    rest: ['152,138 140,198 172,240', '248,138 260,198 228,240'],
    one: ['152,138 140,198 172,240', '248,138 270,84 278,26'],
    both: ['152,138 130,84 122,26', '248,138 270,84 278,26'],
    cross: ['152,138 140,198 172,240', '248,138 214,204 160,146'],
    out: ['152,138 100,140 48,142', '248,138 300,140 352,142']
  };
  var MOTION = {
    one: ['M330 210 Q356 120 330 40'],
    both: ['M330 210 Q356 120 330 40', 'M70 210 Q44 120 70 40'],
    cross: ['M262 250 Q240 196 186 158'],
    out: ['M176 180 L60 180', 'M224 180 L340 180']
  };
  A.figure = function (pose) {
    var arms = ARMS[pose] || ARMS.rest;
    var motion = (MOTION[pose] || []).map(function (d) {
      return '<path d="' + d + '" stroke="#E8841A" stroke-width="8" fill="none" stroke-dasharray="16 12" stroke-linecap="round" marker-end="url(#arr)"/>';
    }).join('');
    var target = pose === 'cross' ? '<circle cx="152" cy="138" r="26" fill="none" stroke="#E8841A" stroke-width="7" stroke-dasharray="10 8"/>' : '';
    return '<svg viewBox="0 0 400 400" aria-hidden="true"><defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#E8841A"/></marker></defs>' +
      '<rect width="400" height="400" fill="#F7F7F7"/>' +
      '<rect x="138" y="96" width="124" height="160" rx="18" fill="#D9C2A0"/>' +
      '<rect x="120" y="244" width="160" height="30" rx="12" fill="#A47E54"/>' +
      '<rect x="130" y="272" width="16" height="104" rx="6" fill="#A47E54"/><rect x="254" y="272" width="16" height="104" rx="6" fill="#A47E54"/>' +
      '<g stroke="#5E6B78" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
      '<polyline points="182,250 176,308 176,372"/><polyline points="218,250 224,308 224,372"/></g>' +
      '<g stroke="#3F7D6B" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
      '<line x1="200" y1="118" x2="200" y2="244"/>' +
      '<line x1="152" y1="138" x2="248" y2="138"/><polyline points="' + arms[0] + '"/><polyline points="' + arms[1] + '"/></g>' +
      '<circle cx="200" cy="78" r="34" fill="#F0C9A0"/><circle cx="187" cy="73" r="4.5" fill="#333333"/><circle cx="213" cy="73" r="4.5" fill="#333333"/>' + target + motion + '</svg>';
  };
  A.move = scene(BG, '<g transform="translate(300 10)">' + A.figure('both').replace(/^<svg[^>]*>/, '').replace('</svg>', '') + '</g>');

  /* ---------- call controls ---------- */
  A.ui = {
    camOn: icon('<rect x="8" y="28" width="58" height="44" rx="10" fill="currentColor"/><path d="M66 44 L92 30 V70 L66 56 Z" fill="currentColor"/>'),
    camOff: icon('<rect x="8" y="28" width="58" height="44" rx="10" fill="currentColor"/><path d="M66 44 L92 30 V70 L66 56 Z" fill="currentColor"/><line x1="10" y1="10" x2="90" y2="90" stroke="#B3261E" stroke-width="10" stroke-linecap="round"/>'),
    hangUp: icon('<path d="M8 58 C30 30 70 30 92 58 L82 72 L64 62 L64 50 C56 46 44 46 36 50 L36 62 L18 72 Z" fill="currentColor"/>')
  };

  /* ---------- 100 x 100 icons ---------- */
  A.icon = {
    calendar: icon('<rect x="14" y="20" width="72" height="66" rx="10" fill="#FFFFFF" stroke="#333333" stroke-width="6"/><rect x="14" y="20" width="72" height="18" rx="8" fill="#C0392B"/>' +
      '<rect x="28" y="10" width="8" height="18" rx="4" fill="#333333"/><rect x="64" y="10" width="8" height="18" rx="4" fill="#333333"/>' +
      '<rect x="26" y="48" width="12" height="10" rx="2" fill="#333333"/><rect x="44" y="48" width="12" height="10" rx="2" fill="#333333"/><rect x="62" y="48" width="12" height="10" rx="2" fill="#E8841A"/>' +
      '<rect x="26" y="66" width="12" height="10" rx="2" fill="#333333"/><rect x="44" y="66" width="12" height="10" rx="2" fill="#333333"/>'),
    picture: icon('<rect x="10" y="18" width="80" height="64" rx="8" fill="#FFFFFF" stroke="#333333" stroke-width="6"/><circle cx="68" cy="38" r="8" fill="#FFC531"/>' +
      '<path d="M16 76 L40 48 L56 64 L66 54 L84 76 Z" fill="#5FA36B"/>'),
    note: icon('<ellipse cx="30" cy="74" rx="14" ry="10" fill="#333333"/><ellipse cx="72" cy="66" rx="14" ry="10" fill="#333333"/>' +
      '<rect x="40" y="18" width="6" height="58" fill="#333333"/><rect x="82" y="10" width="6" height="58" fill="#333333"/><path d="M40 18 L88 10 L88 22 L40 30 Z" fill="#333333"/>'),
    soup: icon('<path d="M12 50 h76 a38 32 0 0 1 -76 0 Z" fill="#E8B04B" stroke="' + INK + '" stroke-width="5"/><rect x="10" y="44" width="80" height="8" rx="4" fill="#FFFFFF" stroke="' + INK + '" stroke-width="4"/>' +
      '<path d="M38 36 q-6 -10 0 -20 M54 36 q-6 -10 0 -20" stroke="#8A96A3" stroke-width="5" fill="none" stroke-linecap="round"/>'),
    pasta: icon('<ellipse cx="50" cy="62" rx="42" ry="22" fill="#FFFFFF" stroke="' + INK + '" stroke-width="5"/>' +
      '<path d="M22 60 q8 -14 16 0 t16 0 t16 0 t10 0" stroke="#F2C46D" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="50" cy="52" r="10" fill="#D64545"/>'),
    fish: icon('<ellipse cx="50" cy="62" rx="42" ry="22" fill="#FFFFFF" stroke="' + INK + '" stroke-width="5"/>' +
      '<path d="M26 60 q20 -18 40 0 q-20 18 -40 0 Z M66 60 l12 -9 v18 Z" fill="#F28C5B" stroke="' + INK + '" stroke-width="3"/><circle cx="36" cy="58" r="3" fill="' + INK + '"/>'),
    walk: icon('<circle cx="50" cy="34" r="22" fill="#5FA36B"/><rect x="46" y="50" width="8" height="22" fill="#7A5A3A"/>' +
      '<path d="M30 96 Q46 74 50 72 Q54 74 70 96 Z" fill="#8DBB6F"/>'),
    musichour: icon('<ellipse cx="32" cy="70" rx="12" ry="9" fill="#333333"/><ellipse cx="70" cy="62" rx="12" ry="9" fill="#333333"/>' +
      '<rect x="40" y="20" width="6" height="52" fill="#333333"/><rect x="78" y="12" width="6" height="52" fill="#333333"/><path d="M40 20 L84 12 L84 24 L40 32 Z" fill="#333333"/>'),
    rest: icon('<rect x="18" y="44" width="64" height="26" rx="8" fill="#B58A5E"/><rect x="24" y="22" width="52" height="30" rx="10" fill="#D9C2A0"/>' +
      '<rect x="12" y="40" width="14" height="34" rx="6" fill="#A47E54"/><rect x="74" y="40" width="14" height="34" rx="6" fill="#A47E54"/><rect x="22" y="70" width="8" height="14" fill="#6E4E2E"/><rect x="70" y="70" width="8" height="14" fill="#6E4E2E"/>'),
    calm: icon('<path d="M60 16 a26 26 0 1 0 22 40 a20 20 0 1 1 -22 -40 Z" fill="#F2C14E"/>' +
      '<path d="M10 76 q10 -8 20 0 t20 0 t20 0 t20 0" stroke="#5FA8C8" stroke-width="6" fill="none" stroke-linecap="round"/>'),
    cheerful: icon('<circle cx="50" cy="50" r="20" fill="#FFC531" stroke="' + INK + '" stroke-width="4"/>' +
      '<g stroke="#E39B00" stroke-width="7" stroke-linecap="round"><line x1="50" y1="8" x2="50" y2="20"/><line x1="50" y1="80" x2="50" y2="92"/><line x1="8" y1="50" x2="20" y2="50"/><line x1="80" y1="50" x2="92" y2="50"/>' +
      '<line x1="20" y1="20" x2="28" y2="28"/><line x1="72" y1="72" x2="80" y2="80"/><line x1="80" y1="20" x2="72" y2="28"/><line x1="20" y1="80" x2="28" y2="72"/></g>'),
    classical: icon('<rect x="12" y="26" width="76" height="52" rx="4" fill="#FFFFFF" stroke="' + INK + '" stroke-width="5"/>' +
      '<g fill="' + INK + '"><rect x="24" y="26" width="8" height="30"/><rect x="40" y="26" width="8" height="30"/><rect x="60" y="26" width="8" height="30"/><rect x="72" y="26" width="8" height="30"/></g>' +
      '<g stroke="' + INK + '" stroke-width="3"><line x1="37" y1="56" x2="37" y2="78"/><line x1="55" y1="56" x2="55" y2="78"/><line x1="70" y1="56" x2="70" y2="78"/></g>'),
    yes: icon('<circle cx="50" cy="50" r="42" fill="#E3F3E8" stroke="#1E8A5A" stroke-width="6"/><circle cx="36" cy="40" r="5" fill="' + INK + '"/><circle cx="64" cy="40" r="5" fill="' + INK + '"/>' +
      '<path d="M30 58 q20 22 40 0" stroke="' + INK + '" stroke-width="6" fill="none" stroke-linecap="round"/>'),
    maybe: icon('<circle cx="50" cy="50" r="42" fill="#FBF0D5" stroke="#B7791F" stroke-width="6"/><circle cx="36" cy="40" r="5" fill="' + INK + '"/><circle cx="64" cy="40" r="5" fill="' + INK + '"/>' +
      '<line x1="32" y1="64" x2="68" y2="64" stroke="' + INK + '" stroke-width="6" stroke-linecap="round"/>'),
    no: icon('<circle cx="50" cy="50" r="42" fill="#FDE7E4" stroke="#B3261E" stroke-width="6"/><circle cx="36" cy="40" r="5" fill="' + INK + '"/><circle cx="64" cy="40" r="5" fill="' + INK + '"/>' +
      '<path d="M30 70 q20 -18 40 0" stroke="' + INK + '" stroke-width="6" fill="none" stroke-linecap="round"/>')
  };

  /* ---------- Picture Pair symbols: one shape and one colour each ---------- */
  var o = ' stroke="' + INK + '" stroke-width="5" stroke-linejoin="round"';
  A.pair = {
    sun: icon('<g stroke="#E39B00" stroke-width="7" stroke-linecap="round"><line x1="50" y1="6" x2="50" y2="20"/><line x1="50" y1="80" x2="50" y2="94"/><line x1="6" y1="50" x2="20" y2="50"/><line x1="80" y1="50" x2="94" y2="50"/></g><circle cx="50" cy="50" r="24" fill="#FFC531"' + o + '/>'),
    heart: icon('<path d="M50 86 C4 56 18 10 50 34 C82 10 96 56 50 86 Z" fill="#E0405F"' + o + '/>'),
    star: icon('<polygon points="50,8 61,38 93,38 67,57 77,89 50,70 23,89 33,57 7,38 39,38" fill="#F2B233"' + o + '/>'),
    tree: icon('<rect x="43" y="62" width="14" height="30" fill="#7A5230"' + o + '/><circle cx="50" cy="40" r="30" fill="#3F9E57"' + o + '/>'),
    house: icon('<rect x="20" y="46" width="60" height="44" fill="#E0B070"' + o + '/><polygon points="12,48 50,12 88,48" fill="#D9643A"' + o + '/><rect x="43" y="64" width="14" height="26" fill="#FFFFFF"' + o + '/>'),
    cup: icon('<path d="M18 30 h52 v34 a20 20 0 0 1 -20 20 h-12 a20 20 0 0 1 -20 -20 Z" fill="#1E8C9E"' + o + '/><path d="M70 40 h8 a10 10 0 0 1 0 20 h-8" fill="none"' + o + '/>'),
    fish: icon('<path d="M10 50 q34 -34 64 0 q-30 34 -64 0 Z M74 50 l18 -16 v32 Z" fill="#F28C5B"' + o + '/><circle cx="28" cy="46" r="5" fill="' + INK + '"/>'),
    moon: icon('<path d="M64 8 a42 42 0 1 0 28 66 a32 32 0 1 1 -28 -66 Z" fill="#3B4F9C"' + o + '/>'),
    apple: icon('<path d="M50 30 C20 14 8 50 22 72 C32 88 44 88 50 82 C56 88 68 88 78 72 C92 50 80 14 50 30 Z" fill="#D93A3A"' + o + '/><path d="M50 30 q4 -14 16 -20" stroke="#5E3A1E" stroke-width="6" fill="none" stroke-linecap="round"/>'),
    boat: icon('<path d="M10 62 h80 l-14 22 h-52 Z" fill="#8A5A3C"' + o + '/><rect x="47" y="12" width="6" height="50" fill="' + INK + '"/><polygon points="53,14 53,56 84,56" fill="#FFFFFF"' + o + '/>'),
    leaf: icon('<path d="M16 84 C16 34 50 12 88 12 C88 54 64 84 16 84 Z" fill="#7CB342"' + o + '/><path d="M16 84 L66 34" stroke="' + INK + '" stroke-width="5"/>'),
    key: icon('<circle cx="30" cy="50" r="18" fill="#C9A227"' + o + '/><rect x="46" y="44" width="44" height="12" fill="#C9A227"' + o + '/><rect x="72" y="56" width="10" height="14" fill="#C9A227"' + o + '/>')
  };

  A.avatar = function (initial, color) {
    return '<svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect x="-400" y="-400" width="1200" height="1200" fill="' + (color || '#A9BFA3') + '"/>' +
      '<circle cx="200" cy="150" r="80" fill="#FFFFFF" fill-opacity=".92"/><path d="M60 400 q140 -230 280 0 Z" fill="#FFFFFF" fill-opacity=".92"/>' +
      '<text x="200" y="178" text-anchor="middle" font-family="Roboto Condensed, Arial Narrow, Arial, sans-serif" font-size="96" fill="#333333">' + initial + '</text></svg>';
  };

  return A;
})();
