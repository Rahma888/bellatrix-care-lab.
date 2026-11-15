/* The pictures of the memory game. Simple drawings made for this game (SVG, 200 x 200), nothing downloaded.
   Three themes of six pictures; each picture has its word in German, French and English. */
var MEMORY_PICTURES = (function () {
  'use strict';
  var uid = 0;
  function svg(body) { return '<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">' + body + '</svg>'; }
  function around(n, one, cx, cy) {
    var s = '', k;
    for (k = 0; k < n; k++) s += one.replace('/>', ' transform="rotate(' + (k * 360 / n).toFixed(1) + ' ' + cx + ' ' + cy + ')"/>');
    return s;
  }
  var STEM = '#3F8A3A', LEAF = '#57A548';
  function stem(x1, y1, x2, y2, w) { return '<path d="M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2 + '" stroke="' + STEM + '" stroke-width="' + (w || 9) + '" stroke-linecap="round" fill="none"/>'; }
  var LEAVES = '<path d="M101 168 C 118 146, 146 146, 160 152 C 148 172, 122 178, 101 172 Z" fill="' + LEAF + '"/>' +
    '<path d="M99 156 C 82 136, 56 138, 42 146 C 54 164, 80 168, 99 160 Z" fill="' + LEAF + '"/>';

  /* ---------- garden flowers ---------- */
  function sunflower() {
    return svg(stem(100, 120, 100, 194) + LEAVES +
      around(12, '<ellipse cx="100" cy="44" rx="13" ry="25" fill="#F4B400" stroke="#C98A00" stroke-width="2"/>', 100, 84) +
      '<circle cx="100" cy="84" r="30" fill="#6B3D1E"/><circle cx="100" cy="84" r="19" fill="#83502A"/>' +
      '<circle cx="92" cy="78" r="3" fill="#4A2812"/><circle cx="106" cy="76" r="3" fill="#4A2812"/><circle cx="100" cy="90" r="3" fill="#4A2812"/><circle cx="110" cy="90" r="3" fill="#4A2812"/><circle cx="90" cy="92" r="3" fill="#4A2812"/>');
  }
  function tulip() {
    return svg(stem(100, 118, 100, 194) +
      '<path d="M98 192 C 64 176, 52 140, 60 112 C 78 136, 92 160, 100 184 Z" fill="' + LEAF + '"/>' +
      '<path d="M102 192 C 132 180, 146 154, 144 128 C 128 146, 112 166, 100 184 Z" fill="#4C9A40"/>' +
      '<path d="M60 50 L78 78 L88 38 L100 70 L112 38 L122 78 L140 50 C 146 98, 132 126, 100 126 C 68 126, 54 98, 60 50 Z" fill="#D62839" stroke="#A51D2C" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M88 38 L100 70 L112 38 C 118 74, 112 106, 100 124 C 88 106, 82 74, 88 38 Z" fill="#B81F30"/>');
  }
  function daisy() {
    return svg(stem(100, 118, 100, 194, 7) + LEAVES +
      around(16, '<ellipse cx="100" cy="46" rx="10" ry="26" fill="#FFFFFF" stroke="#7D8B99" stroke-width="2.5"/>', 100, 84) +
      '<circle cx="100" cy="84" r="22" fill="#F6C21C" stroke="#C99200" stroke-width="3"/>');
  }
  function lavender() {
    var s = '', stems = [[[98, 196], [86, 130], [60, 70]], [[100, 196], [100, 130], [100, 56]], [[102, 196], [114, 130], [140, 70]]], i, t, a, b, c, x, y, k;
    for (i = 0; i < 3; i++) {
      a = stems[i][0]; b = stems[i][1]; c = stems[i][2];
      s += '<path d="M' + a[0] + ' ' + a[1] + ' Q ' + b[0] + ' ' + b[1] + ' ' + c[0] + ' ' + c[1] + '" stroke="#5B8A47" stroke-width="5" fill="none" stroke-linecap="round"/>';
    }
    for (i = 0; i < 3; i++) {
      a = stems[i][0]; b = stems[i][1]; c = stems[i][2];
      for (k = 0; k < 8; k++) {
        t = 0.58 + k * 0.07;
        x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0];
        y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1];
        s += '<ellipse cx="' + (x + (k % 2 ? 6 : -6)).toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="8" ry="11" fill="#8159C7" stroke="#5E3F9E" stroke-width="1.5"/>';
      }
    }
    return svg(s);
  }
  function cornflower() {
    return svg(stem(100, 110, 100, 194, 6) +
      '<path d="M100 170 C 84 150, 70 128, 66 112 C 82 126, 94 146, 100 160 Z" fill="#6E9C5A"/><path d="M100 150 C 116 134, 130 118, 136 102 C 122 112, 108 128, 100 140 Z" fill="#6E9C5A"/>' +
      around(10, '<path d="M93 82 L82 34 L90 40 L95 28 L100 38 L105 28 L110 40 L118 34 L107 82 Z" fill="#2D6CDF" stroke="#1E4FAE" stroke-width="2" stroke-linejoin="round"/>', 100, 84) +
      '<circle cx="100" cy="84" r="15" fill="#1D3C8F"/><circle cx="95" cy="80" r="3" fill="#6F93E8"/><circle cx="106" cy="82" r="3" fill="#6F93E8"/><circle cx="99" cy="91" r="3" fill="#6F93E8"/>');
  }
  function rose() {
    return svg(stem(100, 120, 100, 194, 8) +
      '<ellipse cx="126" cy="160" rx="22" ry="10" fill="' + LEAF + '" transform="rotate(-30 126 160)"/><ellipse cx="76" cy="146" rx="22" ry="10" fill="' + LEAF + '" transform="rotate(30 76 146)"/>' +
      '<circle cx="100" cy="80" r="46" fill="#E1557C" stroke="#A72C52" stroke-width="3"/>' +
      '<path d="M58 86 C 62 116, 90 128, 100 126 C 110 128, 138 116, 142 86" fill="none" stroke="#A72C52" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M66 64 C 78 42, 122 42, 134 64" fill="none" stroke="#A72C52" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M70 92 C 78 108, 122 108, 130 92" fill="none" stroke="#A72C52" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M101 64 C 86 62, 80 76, 86 86 C 92 96, 110 96, 115 86 C 120 76, 112 66, 102 72 C 96 76, 98 84, 104 84" fill="none" stroke="#A72C52" stroke-width="4" stroke-linecap="round"/>');
  }

  /* ---------- animals ---------- */
  var DARK = '#2B2B2B';
  function eyes(x1, x2, y, r) { return '<circle cx="' + x1 + '" cy="' + y + '" r="' + r + '" fill="' + DARK + '"/><circle cx="' + x2 + '" cy="' + y + '" r="' + r + '" fill="' + DARK + '"/>' +
    '<circle cx="' + (x1 + 3) + '" cy="' + (y - 3) + '" r="2.5" fill="#FFFFFF"/><circle cx="' + (x2 + 3) + '" cy="' + (y - 3) + '" r="2.5" fill="#FFFFFF"/>'; }
  function cat() {
    return svg('<path d="M48 92 L56 28 L98 62 Z" fill="#E08A30" stroke="#9C5A16" stroke-width="4" stroke-linejoin="round"/><path d="M152 92 L144 28 L102 62 Z" fill="#E08A30" stroke="#9C5A16" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M60 76 L64 44 L86 62 Z" fill="#F5B7A6"/><path d="M140 76 L136 44 L114 62 Z" fill="#F5B7A6"/>' +
      '<ellipse cx="100" cy="112" rx="64" ry="56" fill="#E08A30" stroke="#9C5A16" stroke-width="4"/>' +
      '<path d="M100 60 V78 M85 62 L89 76 M115 62 L111 76" stroke="#B5661C" stroke-width="5" stroke-linecap="round"/>' +
      '<ellipse cx="100" cy="136" rx="32" ry="20" fill="#FBE3C8"/>' +
      '<ellipse cx="78" cy="106" rx="10" ry="13" fill="' + DARK + '"/><ellipse cx="122" cy="106" rx="10" ry="13" fill="' + DARK + '"/><circle cx="81" cy="101" r="3.5" fill="#FFFFFF"/><circle cx="125" cy="101" r="3.5" fill="#FFFFFF"/>' +
      '<path d="M92 124 L108 124 L100 133 Z" fill="#D9707F"/>' +
      '<path d="M100 133 Q 100 143 89 142 M100 133 Q 100 143 111 142" stroke="' + DARK + '" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M70 130 L32 122 M70 137 L32 142 M130 130 L168 122 M130 137 L168 142" stroke="#5A3A1A" stroke-width="3" stroke-linecap="round"/>');
  }
  function dog() {
    return svg('<ellipse cx="100" cy="106" rx="52" ry="58" fill="#C08A55" stroke="#7A4E26" stroke-width="4"/>' +
      '<ellipse cx="50" cy="100" rx="20" ry="46" fill="#7A4E26" transform="rotate(16 50 100)"/><ellipse cx="150" cy="100" rx="20" ry="46" fill="#7A4E26" transform="rotate(-16 150 100)"/>' +
      '<ellipse cx="122" cy="94" rx="18" ry="16" fill="#8E5C30"/>' +
      eyes(80, 122, 96, 8) +
      '<ellipse cx="100" cy="140" rx="32" ry="24" fill="#F0DCC0" stroke="#7A4E26" stroke-width="3"/>' +
      '<path d="M94 150 Q 100 168 106 150 Z" fill="#E8667A"/>' +
      '<path d="M100 134 V146 M100 146 Q 90 154 82 146 M100 146 Q 110 154 118 146" stroke="' + DARK + '" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="100" cy="127" rx="14" ry="10" fill="' + DARK + '"/>');
  }
  function cow() {
    return svg('<path d="M66 54 C 50 50, 40 36, 44 22 C 54 34, 66 38, 80 44 Z" fill="#EADFB8" stroke="#8C7A4A" stroke-width="3" stroke-linejoin="round"/><path d="M134 54 C 150 50, 160 36, 156 22 C 146 34, 134 38, 120 44 Z" fill="#EADFB8" stroke="#8C7A4A" stroke-width="3" stroke-linejoin="round"/>' +
      '<ellipse cx="40" cy="80" rx="25" ry="12" fill="#F2F2F2" stroke="' + DARK + '" stroke-width="3" transform="rotate(-14 40 80)"/><ellipse cx="160" cy="80" rx="25" ry="12" fill="#F2F2F2" stroke="' + DARK + '" stroke-width="3" transform="rotate(14 160 80)"/>' +
      '<path d="M60 58 C 60 38, 140 38, 140 58 L 146 128 C 146 160, 54 160, 54 128 Z" fill="#FFFFFF" stroke="' + DARK + '" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M64 62 C 78 54, 92 64, 88 80 C 84 94, 64 92, 61 78 Z" fill="' + DARK + '"/><path d="M118 54 C 130 48, 140 56, 139 70 C 136 82, 122 78, 117 66 Z" fill="' + DARK + '"/>' +
      eyes(82, 118, 100, 7) +
      '<ellipse cx="100" cy="146" rx="40" ry="26" fill="#F4AFBE" stroke="' + DARK + '" stroke-width="3"/>' +
      '<ellipse cx="85" cy="146" rx="6" ry="8" fill="#8C3A4E"/><ellipse cx="115" cy="146" rx="6" ry="8" fill="#8C3A4E"/>');
  }
  function pig() {
    return svg('<path d="M52 72 L48 24 L90 50 Z" fill="#E77C9A" stroke="#B9516F" stroke-width="3" stroke-linejoin="round"/><path d="M148 72 L152 24 L110 50 Z" fill="#E77C9A" stroke="#B9516F" stroke-width="3" stroke-linejoin="round"/>' +
      '<circle cx="100" cy="106" r="62" fill="#F4A6BA" stroke="#B9516F" stroke-width="4"/>' +
      eyes(76, 124, 90, 7) +
      '<ellipse cx="100" cy="126" rx="31" ry="22" fill="#EA8AA4" stroke="#B9516F" stroke-width="3"/>' +
      '<ellipse cx="89" cy="126" rx="6" ry="9" fill="#8C2F4C"/><ellipse cx="111" cy="126" rx="6" ry="9" fill="#8C2F4C"/>');
  }
  function bird() {
    return svg('<path d="M18 162 L184 150" stroke="#7A4E26" stroke-width="8" stroke-linecap="round"/>' +
      '<path d="M88 146 L84 158 M108 146 L110 158" stroke="#E07A1F" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M56 110 L16 90 L22 128 Z" fill="#1F5A94" stroke-linejoin="round"/>' +
      '<ellipse cx="98" cy="112" rx="50" ry="38" fill="#2F7CC4"/>' +
      '<ellipse cx="110" cy="124" rx="34" ry="22" fill="#F5C542"/>' +
      '<path d="M60 102 C 80 86, 110 92, 120 112 C 100 122, 74 122, 60 102 Z" fill="#1F5A94"/>' +
      '<circle cx="140" cy="78" r="28" fill="#2F7CC4"/><ellipse cx="146" cy="88" rx="14" ry="10" fill="#FFFFFF"/>' +
      '<circle cx="146" cy="72" r="6" fill="#1B1B1B"/><circle cx="148" cy="70" r="2" fill="#FFFFFF"/>' +
      '<path d="M164 72 L186 80 L164 87 Z" fill="#E07A1F" stroke-linejoin="round"/>');
  }
  function fish() {
    return svg('<circle cx="160" cy="40" r="8" fill="none" stroke="#5AA9E6" stroke-width="3"/><circle cx="176" cy="22" r="5" fill="none" stroke="#5AA9E6" stroke-width="3"/><circle cx="146" cy="20" r="4" fill="none" stroke="#5AA9E6" stroke-width="3"/>' +
      '<path d="M90 62 C 104 40, 126 42, 134 60 Z" fill="#147A80"/><path d="M96 138 C 106 156, 122 156, 128 140 Z" fill="#147A80"/>' +
      '<path d="M52 100 L14 64 L24 100 L14 136 Z" fill="#147A80" stroke="#0E5A5E" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M40 100 C 68 50, 140 48, 178 100 C 140 152, 68 150, 40 100 Z" fill="#1F9AA0" stroke="#0E5A5E" stroke-width="4"/>' +
      '<path d="M88 66 C 80 86, 80 114, 88 134 M112 62 C 104 86, 104 114, 112 138" stroke="#7FD1D4" stroke-width="6" fill="none" stroke-linecap="round"/>' +
      '<circle cx="148" cy="92" r="10" fill="#FFFFFF" stroke="#0E5A5E" stroke-width="2"/><circle cx="150" cy="92" r="5" fill="#1B1B1B"/>' +
      '<path d="M170 106 Q 162 111 155 106" stroke="#0E5A5E" stroke-width="3" fill="none" stroke-linecap="round"/>');
  }

  /* ---------- Bavarian things ---------- */
  function pretzel() {
    var d = 'M54 150 C 72 128, 112 96, 128 68 C 146 36, 186 52, 178 104 C 172 148, 132 172, 100 172 C 68 172, 28 148, 22 104 C 14 52, 54 36, 72 68 C 88 96, 128 128, 146 150';
    return svg('<path d="' + d + '" fill="none" stroke="#7E4519" stroke-width="27" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + d + '" fill="none" stroke="#B26A2C" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<rect x="62" y="163" width="7" height="5" rx="1.5" fill="#FFFFFF"/><rect x="98" y="168" width="7" height="5" rx="1.5" fill="#FFFFFF"/><rect x="134" y="161" width="7" height="5" rx="1.5" fill="#FFFFFF"/>' +
      '<rect x="20" y="96" width="7" height="5" rx="1.5" fill="#FFFFFF"/><rect x="172" y="98" width="7" height="5" rx="1.5" fill="#FFFFFF"/><rect x="150" y="48" width="7" height="5" rx="1.5" fill="#FFFFFF"/><rect x="44" y="50" width="7" height="5" rx="1.5" fill="#FFFFFF"/>');
  }
  function heart() {
    var h = 'M100 182 C 46 140, 20 108, 24 74 C 28 44, 70 32, 100 64 C 130 32, 172 44, 176 74 C 180 108, 154 140, 100 182 Z';
    return svg('<path d="M62 50 L100 14 L138 50" stroke="#2E7D4F" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + h + '" fill="#B4482F" stroke="#7A2B1A" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="' + h + '" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-dasharray="1 13" stroke-linecap="round" transform="translate(100 104) scale(0.8) translate(-100 -104)"/>' +
      around(5, '<circle cx="100" cy="90" r="8" fill="#FFFFFF"/>', 100, 103) +
      '<circle cx="100" cy="103" r="7" fill="#F5C400"/>' +
      '<ellipse cx="80" cy="130" rx="12" ry="6" fill="#57A548" transform="rotate(-25 80 130)"/><ellipse cx="120" cy="130" rx="12" ry="6" fill="#57A548" transform="rotate(25 120 130)"/>');
  }
  function church() {
    return svg('<path d="M10 186 H190" stroke="#5FA04E" stroke-width="8" stroke-linecap="round"/>' +
      '<path d="M28 130 L100 98 L172 130 Z" fill="#B5452F" stroke="#7A2B1A" stroke-width="3" stroke-linejoin="round"/>' +
      '<rect x="36" y="130" width="128" height="54" fill="#F6F0E2" stroke="#8C7E66" stroke-width="3"/>' +
      '<path d="M48 166 V150 A7 7 0 0 1 62 150 V166 Z M138 166 V150 A7 7 0 0 1 152 150 V166 Z" fill="#5A6E85"/>' +
      '<rect x="78" y="78" width="44" height="106" fill="#F6F0E2" stroke="#8C7E66" stroke-width="3"/>' +
      '<circle cx="100" cy="100" r="10" fill="#FFFFFF" stroke="' + DARK + '" stroke-width="3"/><path d="M100 100 V93 M100 100 H106" stroke="' + DARK + '" stroke-width="2.5" stroke-linecap="round"/>' +
      '<path d="M92 148 V132 A8 8 0 0 1 108 132 V148 Z" fill="#5A6E85"/><path d="M90 184 V168 A10 10 0 0 1 110 168 V184 Z" fill="#7A4E26"/>' +
      '<path d="M76 80 C 68 64, 84 52, 100 36 C 116 52, 132 64, 124 80 Z" fill="#3E8E6A" stroke="#256B4C" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M93 38 C 90 30, 96 26, 100 19 C 104 26, 110 30, 107 38 Z" fill="#3E8E6A" stroke="#256B4C" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M100 19 V4 M94 9 H106" stroke="#C99A2E" stroke-width="3.5" stroke-linecap="round"/>');
  }
  function mountains() {
    return svg('<circle cx="160" cy="40" r="18" fill="#F5C400"/>' +
      '<path d="M64 176 L128 62 L196 176 Z" fill="#8FA4B6" stroke="#5E7487" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M128 62 L114.5 86 L122 82 L128 90 L135 82 L142.3 86 Z" fill="#FFFFFF" stroke="#5E7487" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M4 176 L76 44 L148 176 Z" fill="#6E8597" stroke="#4C6172" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M76 44 L59.6 74 L68 70 L76 80 L84 70 L92.4 74 Z" fill="#FFFFFF" stroke="#4C6172" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M0 172 Q 100 154 200 172 V 196 H 0 Z" fill="#5FA04E"/>');
  }
  function flag() {
    var id = 'mflag' + (++uid), s = '', i, j, x, y;
    for (j = 0; j < 10; j++) {
      if (j % 2) continue;
      for (i = -1; i < 6; i++) {
        x = 44 + i * 34; y = 26 + j * 12;
        s += 'M' + x + ' ' + (y - 12) + ' L' + (x + 17) + ' ' + y + ' L' + x + ' ' + (y + 12) + ' L' + (x - 17) + ' ' + y + ' Z ';
      }
    }
    return svg('<path d="M40 16 V190" stroke="#7A4E26" stroke-width="7" stroke-linecap="round"/><circle cx="40" cy="13" r="7" fill="#C99A2E"/>' +
      '<clipPath id="' + id + '"><rect x="44" y="26" width="138" height="98"/></clipPath>' +
      '<rect x="44" y="26" width="138" height="98" fill="#FFFFFF"/>' +
      '<path d="' + s + '" fill="#2B8BDA" clip-path="url(#' + id + ')"/>' +
      '<rect x="44" y="26" width="138" height="98" fill="none" stroke="#1F5F96" stroke-width="3"/>');
  }
  function hat() {
    return svg('<ellipse cx="100" cy="142" rx="86" ry="20" fill="#365F32" stroke="#22401F" stroke-width="3"/>' +
      '<path d="M52 142 C 52 100, 64 70, 100 66 C 136 70, 148 100, 148 142 Z" fill="#4D7F45" stroke="#22401F" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M80 75 C 92 86, 108 86, 120 75" stroke="#22401F" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M53 122 C 80 132, 120 132, 147 122 L 148 140 C 120 150, 80 150, 52 140 Z" fill="#6B3E1F"/>' +
      '<path d="M128 124 C 140 92, 160 68, 182 44" stroke="#5B4A3A" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<path d="M134 104 C 146 74, 166 54, 186 40 C 180 64, 162 88, 140 110 Z" fill="#9C8466" stroke="#5B4A3A" stroke-width="2" stroke-linejoin="round"/>' +
      '<circle cx="74" cy="135" r="5" fill="#FFFFFF"/><circle cx="66" cy="133" r="4" fill="#FFFFFF"/><circle cx="82" cy="136" r="4" fill="#FFFFFF"/>');
  }

  return {
    flowers: [
      { id: 'sunflower', de: 'Sonnenblume', fr: 'Tournesol', en: 'Sunflower', draw: sunflower },
      { id: 'tulip', de: 'Tulpe', fr: 'Tulipe', en: 'Tulip', draw: tulip },
      { id: 'daisy', de: 'Margerite', fr: 'Marguerite', en: 'Daisy', draw: daisy },
      { id: 'lavender', de: 'Lavendel', fr: 'Lavande', en: 'Lavender', draw: lavender },
      { id: 'cornflower', de: 'Kornblume', fr: 'Bleuet', en: 'Cornflower', draw: cornflower },
      { id: 'rose', de: 'Rose', fr: 'Rose', en: 'Rose', draw: rose }
    ],
    animals: [
      { id: 'cat', de: 'Katze', fr: 'Chat', en: 'Cat', draw: cat },
      { id: 'dog', de: 'Hund', fr: 'Chien', en: 'Dog', draw: dog },
      { id: 'cow', de: 'Kuh', fr: 'Vache', en: 'Cow', draw: cow },
      { id: 'pig', de: 'Schwein', fr: 'Cochon', en: 'Pig', draw: pig },
      { id: 'bird', de: 'Vogel', fr: 'Oiseau', en: 'Bird', draw: bird },
      { id: 'fish', de: 'Fisch', fr: 'Poisson', en: 'Fish', draw: fish }
    ],
    bavaria: [
      { id: 'pretzel', de: 'Brezel', fr: 'Bretzel', en: 'Pretzel', draw: pretzel },
      { id: 'heart', de: 'Lebkuchenherz', fr: 'Pain d’épices', en: 'Gingerbread', draw: heart },
      { id: 'church', de: 'Kirche', fr: 'Église', en: 'Church', draw: church },
      { id: 'mountains', de: 'Berge', fr: 'Montagnes', en: 'Mountains', draw: mountains },
      { id: 'flag', de: 'Fahne', fr: 'Drapeau', en: 'Flag', draw: flag },
      { id: 'hat', de: 'Trachtenhut', fr: 'Chapeau', en: 'Hat', draw: hat }
    ]
  };
})();
