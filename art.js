/* Rebuild Khartoum — the artwork: the corniche street view and the map from above. */
(function () {
  'use strict';

  function f1(n) { return (Math.round(n * 10) / 10).toString(); }
  function mix(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    var o = [1, 3, 5].map(function (i) {
      var x = parseInt(a.substr(i, 2), 16), y = parseInt(b.substr(i, 2), 16);
      return Math.round(x + (y - x) * t);
    });
    return 'rgb(' + o.join(',') + ')';
  }
  function R(x, y, w, h, fill, extra) {
    return '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(w) + '" height="' + f1(h) + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function C(x, y, r, fill, extra) { return '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + f1(r) + '" fill="' + fill + '"' + (extra || '') + '/>'; }
  function E(x, y, rx, ry, fill, extra) { return '<ellipse cx="' + f1(x) + '" cy="' + f1(y) + '" rx="' + f1(rx) + '" ry="' + f1(ry) + '" fill="' + fill + '"' + (extra || '') + '/>'; }
  function P(d, fill, extra) { return '<path d="' + d + '" fill="' + (fill || 'none') + '"' + (extra || '') + '/>'; }
  function arch(x, y, w, h, fill, extra) {
    return P('M' + f1(x) + ' ' + f1(y + h) + 'V' + f1(y + w / 2) + 'a' + f1(w / 2) + ' ' + f1(w / 2) + ' 0 0 1 ' + f1(w) + ' 0V' + f1(y + h) + 'z', fill, extra);
  }
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* =====================================================================
     STREET VIEW — the corniche, looking across the Nile
     ===================================================================== */
  var G = 170; // ground line

  function ruin(x, w, h, v) {
    var shape = v ? [[0, 0], [0, .52], [.12, .7], [.26, .62], [.4, .9], [.52, .7], [.68, .78], [.8, .5], [1, .6], [1, 0]]
      : [[0, 0], [0, .7], [.16, .82], [.3, .55], [.46, .62], [.6, .92], [.74, .66], [.9, .74], [1, .48], [1, 0]];
    var d = shape.map(function (q, i) { return (i ? 'L' : 'M') + f1(x + q[0] * w) + ' ' + f1(G - q[1] * h); }).join('') + 'z';
    var s = P(d, 'url(#rk-ruin)') + P(d, 'none', ' stroke="#4d4447" stroke-width="1"');
    var cols = Math.max(2, Math.round(w / 20)), rows = Math.max(1, Math.round(h * .5 / 20));
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      s += R(x + (c + .5) * w / cols - 4, G - 14 - r * 20 - 8, 8, 11, '#3a3336', ' rx="1"');
    }
    s += P('M' + f1(x + w * .3) + ' ' + f1(G - h * .55) + 'l5 12l-4 9l6 14', 'none', ' stroke="#3a3336" stroke-width="1.2"') +
      P('M' + f1(x + w * .6) + ' ' + f1(G - h * (v ? .7 : .92)) + 'v-9M' + f1(x + w * .64) + ' ' + f1(G - h * (v ? .7 : .9)) + 'l3-8', 'none', ' stroke="#3a3336" stroke-width="1"') +
      E(x + w * .2, G, w * .22, 4, '#6a5f5c') + E(x + w * .75, G + 1, w * .28, 5, '#5f5553') + E(x + w * .5, G - 1, w * .14, 3, '#7b6f6a');
    return s;
  }
  function house(x, w, h, o) {
    var y = G - h, s = R(x, y, w, h, o.wall) + R(x + w * .8, y, w * .2, h, '#000', ' opacity=".07"') +
      R(x - 2, y - 5, w + 4, 6, o.trim || '#d2ad77', ' rx="1.5"') + R(x, G - 4, w, 4, '#000', ' opacity=".1"');
    var dw = Math.min(13, w * .2);
    s += arch(x + w / 2 - dw / 2, G - 24, dw, 24, o.door) + C(x + w / 2 + dw / 2 - 3, G - 11, 0.9, '#ffe08a');
    var ww = Math.min(11, w * .17), wy = o.two ? G - 30 : G - 34;
    [x + w * .16, x + w * .84 - ww].forEach(function (wx) {
      s += arch(wx, wy, ww, 16, '#ffe7a0', ' stroke="#b98d55" stroke-width="1"') + P('M' + f1(wx + ww / 2) + ' ' + f1(wy + 2) + 'v14', 'none', ' stroke="#b98d55" stroke-width=".8"');
    });
    if (o.two) {
      [x + w * .16, x + w / 2 - ww / 2, x + w * .84 - ww].forEach(function (wx, i) {
        s += arch(wx, y + 8, ww, 15, i === 1 ? '#8fc0d6' : '#ffe7a0', ' stroke="#b98d55" stroke-width="1"');
      });
      s += R(x + w * .1, y + 24, w * .8, 2.5, o.trim || '#d2ad77') + P('M' + f1(x + w * .1) + ' ' + f1(y + 24) + 'v-5h' + f1(w * .8) + 'v5', 'none', ' stroke="#8a6a45" stroke-width="1"');
    }
    return s;
  }
  function tower(x, w, h, wall) {
    var y = G - h, s = R(x, y, w, h, wall) + R(x + w * .8, y, w * .2, h, '#000', ' opacity=".08"') + R(x - 2, y - 4, w + 4, 5, '#bfa67c', ' rx="1"');
    var cols = 3, cw = w * .18, k = 0;
    for (var yy = y + 9; yy < G - 16; yy += 15) {
      for (var c = 0; c < cols; c++, k++) {
        s += R(x + w * (.14 + c * .27), yy, cw, 8, (k * 7 + c) % 3 ? '#ffe7a0' : '#8fc0d6', ' rx="1"');
      }
      s += R(x, yy + 11, w, 1, '#000', ' opacity=".07"');
    }
    s += R(x + w * .15, y - 13, w * .22, 9, '#9fb3bd', ' rx="2"') + P('M' + f1(x + w * .7) + ' ' + f1(y - 4) + 'v-7', 'none', ' stroke="#6b6163" stroke-width="1.2"') +
      P('M' + f1(x + w * .7 - 5) + ' ' + f1(y - 13) + 'a5 5 0 0 0 10 0z', '#d9d4c8');
    return s;
  }
  function lamp(x, lit) {
    if (!lit) return P('M' + x + ' 199v-13l5-4', 'none', ' stroke="#55494d" stroke-width="2.2" stroke-linecap="round"');
    return P('M' + x + ' 199V158q0-7 8-7', 'none', ' stroke="#3f3a40" stroke-width="2.2" stroke-linecap="round"') +
      C(x + 9, 153, 13, 'url(#rk-glow)') + C(x + 9, 153, 3.6, '#fff3c4');
  }
  function palm(x, k) {
    k = k || 1;
    var top = 199 - 46 * k, s = P('M' + x + ' 199q' + f1(5 * k) + ' ' + f1(-24 * k) + ' ' + f1(-2 * k) + ' ' + f1(-46 * k), 'none', ' stroke="#8c6a43" stroke-width="' + f1(5 * k) + '" stroke-linecap="round"');
    var tx = x - 2 * k, leaves = [[-26, 6], [26, 6], [-22, -8], [22, -8], [-10, -20], [10, -20], [0, -24]];
    leaves.forEach(function (l, i) {
      var dx = l[0] * k, dy = l[1] * k;
      s += P('M' + f1(tx) + ' ' + f1(top) + 'q' + f1(dx * .5) + ' ' + f1(dy - 12 * k) + ' ' + f1(dx) + ' ' + f1(dy) + 'q' + f1(-dx * .45) + ' ' + f1(-dy * .2 - 3 * k) + ' ' + f1(-dx) + ' ' + f1(-dy) + 'z', i % 2 ? '#3f9150' : '#2f7a43');
    });
    return s + C(tx - 2 * k, top + 3 * k, 2 * k, '#d98a2b') + C(tx + 2 * k, top + 4 * k, 2 * k, '#c9741f');
  }
  function person(x, kind, color, k) {
    k = k || 1;
    var b = 199, hY = b - 17 * k, s = E(x, b, 5 * k, 1.5 * k, '#000', ' opacity=".18"');
    s += P('M' + f1(x - 4.5 * k) + ' ' + b + 'q' + f1(.5 * k) + ' ' + f1(-11 * k) + ' ' + f1(4.5 * k) + ' ' + f1(-13 * k) + 'q' + f1(4 * k) + ' ' + f1(2 * k) + ' ' + f1(4.5 * k) + ' ' + f1(13 * k) + 'z', color);
    s += C(x, hY, 3 * k, '#6b452e');
    if (kind === 'w') s += P('M' + f1(x - 3.6 * k) + ' ' + f1(hY + 1.5 * k) + 'a' + f1(3.6 * k) + ' ' + f1(3.8 * k) + ' 0 0 1 ' + f1(7.2 * k) + ' 0l' + f1(1 * k) + ' ' + f1(6 * k) + 'h' + f1(-9.2 * k) + 'z', color) + C(x, hY + .6 * k, 2.2 * k, '#6b452e');
    else s += P('M' + f1(x - 3.2 * k) + ' ' + f1(hY - .8 * k) + 'a' + f1(3.2 * k) + ' ' + f1(3 * k) + ' 0 0 1 ' + f1(6.4 * k) + ' 0z', '#fbf7ee');
    return s;
  }
  function boat(x, y) {
    return '<g opacity=".22">' + P('M' + (x + 2) + ' ' + (y + 8) + 'l14 16h-14z', '#fff') + '</g>' +
      P('M' + (x - 20) + ' ' + y + 'q20 6 42 0l-7 8h-28z', '#7a5230') + P('M' + (x - 20) + ' ' + y + 'q20 6 42 0', 'none', ' stroke="#4f3520" stroke-width="1.2"') +
      P('M' + x + ' ' + (y + 2) + 'V' + (y - 34), 'none', ' stroke="#4f3520" stroke-width="1.6"') +
      P('M' + (x + 2) + ' ' + (y - 34) + 'q14 12 16 31h-16z', '#fffaf0') + P('M' + (x - 2) + ' ' + (y - 30) + 'q-9 12-10 26h10z', '#f1e6cf');
  }

  function street(o) {
    var n = o.n, from = o.from === undefined ? n : o.from, p = n / o.total, bf = o.bridge || 0, i;
    function on(k) { return k < n; }
    function g(k, s) { return '<g' + (k >= from && k < n ? ' class="pop"' : '') + '>' + s + '</g>'; }
    function swap(k, built, broken) { return on(k) ? g(k, built) : broken; }

    var h = '<svg viewBox="0 0 400 262" aria-hidden="true"><defs>' +
      '<linearGradient id="rk-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + mix('#39374a', '#3f8fd4', p) + '"/><stop offset=".6" stop-color="' + mix('#8b6f6e', '#a8d8f0', p) + '"/><stop offset="1" stop-color="' + mix('#dba06c', '#ffecc0', p) + '"/></linearGradient>' +
      '<radialGradient id="rk-glow"><stop offset="0" stop-color="#ffe9a0" stop-opacity=".85"/><stop offset="1" stop-color="#ffe9a0" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="rk-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + mix('#5c747b', '#3aa3b8', p) + '"/><stop offset="1" stop-color="' + mix('#36484f', '#1c6f88', p) + '"/></linearGradient>' +
      '<linearGradient id="rk-ruin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8f817b"/><stop offset="1" stop-color="#655a58"/></linearGradient>' +
      '<filter id="rk-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>' +
      '</defs>' + R(0, 0, 400, 200, 'url(#rk-sky)');

    // sun, clouds
    var sy = 150 - 78 * p;
    h += C(312, sy, 50, 'url(#rk-glow)') + C(312, sy, 19, mix('#f0b36e', '#fff0a8', p));
    if (p > .25) h += '<g opacity="' + f1(Math.min(.9, (p - .25) * 1.6)) + '" fill="#fff">' + E(70, 44, 30, 9) + E(92, 38, 22, 9) + E(52, 40, 16, 7) + E(222, 66, 26, 7) + E(240, 61, 18, 7) + '</g>';
    // smoke while the city is still hurt
    if (p < .35) h += '<g opacity="' + f1((.35 - p) * 1.1) + '" fill="#2f2a30" filter="url(#rk-blur)">' +
      P('M246 128q-10-22 4-40q-14-20 6-42q8-18 30-22q-6 26-14 40q10 20-4 38q6 14-4 26z') + P('M52 130q-8-18 4-32q-10-16 4-34q4-12 18-16q-2 20-8 30q8 16-2 30q4 12-2 22z') + '</g>';

    // far skyline, two layers for depth
    h += P('M0 170V132h16v-9h12v-13h9v13h13v20h11v-31h7v-7h10v7h7v17h17v-10h13v23h15v-18h9v-12h11v30h13v-22h17v10h11v-30h5v-9h9v9h5v19h15v12h13v-26h15v8h11v-18h13v36h17v-14h11v-20h13v34h15v-10H400v40z', mix('#74676f', '#c3d6df', p)) +
      P('M0 170v-22h22v-12h18v12h26v-20h14v20h30v-9h20v-16h12v25h34v-14h22v14h28v-24h16v24h30v-10h24v10h26v-18h14v18h40v-8h24v30z', mix('#5f555d', '#a9c0cb', p));

    // corniche pavement
    h += R(0, G, 400, 31, mix('#93837a', '#e6d3ab', p)) + R(0, G, 400, 2, '#fff', ' opacity=".18"');
    for (i = 0; i < 9; i++) h += P('M' + (i * 50 - 10) + ' 200l22-30', 'none', ' stroke="#000" stroke-opacity=".05"');

    // back row
    h += swap(11,
      R(80, 136, 44, 34, '#f7eed8') + R(116, 136, 8, 34, '#000', ' opacity=".07"') + P('M84 136a18 18 0 0 1 36 0z', '#1f8a8a') + P('M90 132a13 13 0 0 1 12-12', 'none', ' stroke="#7fd0cc" stroke-width="2" stroke-linecap="round"') +
      P('M102 118v-7', 'none', ' stroke="#d9a53a" stroke-width="1.5"') + C(102, 109, 2.2, '#e8b545') + arch(96, 150, 12, 20, '#7a5a3a') + arch(84, 146, 6, 10, '#3b6d7f') + arch(112, 146, 6, 10, '#3b6d7f') +
      R(126, 72, 10, 98, '#f7eed8') + R(133, 72, 3, 98, '#000', ' opacity=".08"') + R(123, 98, 16, 4, '#d2ad77', ' rx="1"') + R(124, 124, 14, 3, '#d2ad77', ' rx="1"') +
      P('M124 72h14l-7-16z', '#1f8a8a') + P('M131 56v-6', 'none', ' stroke="#d9a53a" stroke-width="1.4"') + P('M129 47a3 3 0 1 0 4 3a2.4 2.4 0 1 1-4-3z', '#e8b545') + arch(128.5, 80, 5, 9, '#3b6d7f'),
      ruin(80, 46, 30, 1) + R(127, 138, 9, 32, '#7b6f6a') + P('M127 138l4-7l5 7z', '#6a5f5c'));
    h += swap(15, tower(190, 52, 108, '#eadab8'), ruin(188, 56, 72, 0));
    h += swap(20, tower(298, 48, 124, '#f0e3c6'), ruin(296, 52, 84, 1));

    // front row
    h += swap(3, house(8, 66, 50, { wall: '#f2dcae', door: '#1f7fa0' }), ruin(6, 70, 40, 0));
    h += swap(7, house(134, 60, 66, { wall: '#f7ead0', door: '#3f8f5a', two: true }), ruin(132, 64, 46, 1));
    h += swap(13,
      R(240, 124, 66, 46, '#f6e4b8') + R(294, 124, 12, 46, '#000', ' opacity=".07"') + R(238, 118, 70, 8, '#2f78a8', ' rx="1.5"') + R(240, 166, 66, 4, '#000', ' opacity=".1"') +
      [0, 1, 2, 3].map(function (k) { return arch(246 + k * 15, 133, 9, 14, '#bfe3f2', ' stroke="#2f78a8" stroke-width="1"'); }).join('') + arch(267, 150, 12, 20, '#8a5f38') +
      P('M300 118V84', 'none', ' stroke="#4a4144" stroke-width="1.6"') + R(300, 84, 20, 4.4, '#d21034') + R(300, 88.4, 20, 4.4, '#fff') + R(300, 92.8, 20, 4.4, '#1c1c1c') + P('M300 84l8 6.6l-8 6.6z', '#007229'),
      ruin(238, 70, 38, 0));
    h += swap(18,
      house(336, 60, 46, { wall: '#efd3a4', door: '#b8623f' }) + [0, 1, 2, 3, 4, 5].map(function (k) { return P('M' + (334 + k * 10.7) + ' 136h10.7l-2 9h-10.7z', k % 2 ? '#fff7e6' : '#c4553b'); }).join(''),
      ruin(334, 64, 36, 1));

    // street lamps
    h += on(1) ? g(1, lamp(104, true)) : lamp(104, false);
    h += on(5) ? g(5, lamp(214, true)) : lamp(214, false);
    h += on(14) ? g(14, lamp(318, true) + lamp(26, true)) : lamp(318, false) + lamp(26, false);

    // river edge
    h += R(0, 199, 400, 4, mix('#6f625c', '#bfa878', p));
    if (on(12)) h += g(12, P('M0 201v-5q25-5 50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0v5z', '#7fb35c') +
      [18, 66, 122, 176, 236, 290, 344, 386].map(function (x, k) { return C(x, 195.5, 1.6, k % 2 ? '#ffd24a' : '#ff8fa3'); }).join(''));
    if (!on(0)) h += E(44, 197, 20, 6, '#5f5553') + E(60, 193, 10, 4, '#74686a') + E(160, 198, 16, 5, '#6a5f5c') + E(246, 196, 22, 7, '#5f5553') + E(262, 191, 9, 4, '#74686a') + E(366, 197, 18, 6, '#6a5f5c') +
      P('M150 196l10-9l4 8zM350 195l8-10l6 9z', '#74686a');

    // life on the corniche
    if (on(2)) h += g(2, palm(64));
    if (on(9)) h += g(9, palm(228, .9));
    if (on(19)) h += g(19, palm(372, 1.05));
    if (on(4)) h += g(4, P('M150 172a21 12 0 0 1 42 0z', '#c4553b') + P('M157 172a21 12 0 0 1 7-9.5v9.5zM171 160v12h7v-10.5a21 12 0 0 0-7-1.5zM185 172v-6a21 12 0 0 0-7-4.5V172z', '#fff3df') +
      P('M171 172v27', 'none', ' stroke="#4a4144" stroke-width="1.8"') + R(176, 187, 18, 2.5, '#8a6a45') + R(177.5, 189, 2, 10, '#8a6a45') + R(190.5, 189, 2, 10, '#8a6a45') +
      R(179, 181, 6, 6, '#6b6163', ' rx="1.5"') + P('M185 183l3-1', 'none', ' stroke="#6b6163" stroke-width="1.2"') + R(187.5, 183.5, 2.4, 3.5, '#d98a2b') + R(190.5, 183.5, 2.4, 3.5, '#d98a2b') +
      person(162, 'w', '#e2558f') + R(198, 194, 6, 5, '#8a6a45', ' rx="1"'));
    if (on(10)) h += g(10, R(272, 168, 2, 31, '#6b4a2f') + R(304, 168, 2, 31, '#6b4a2f') +
      [0, 1, 2, 3, 4, 5].map(function (k) { return P('M' + (270 + k * 6.4) + ' 164h6.4l-1 8h-6.4z', k % 2 ? '#fff7e6' : '#2f8f8a'); }).join('') +
      R(275, 187, 28, 12, '#9c7446', ' rx="1"') + P('M275 191h28M284 187v12M294 187v12', 'none', ' stroke="#6b4a2f" stroke-width=".8"') +
      [[279, '#e8a23a'], [284, '#d2452f'], [289, '#3f9150'], [294, '#e8a23a'], [299, '#d2452f']].map(function (q) { return C(q[0], 185.5, 2.6, q[1]); }).join(''));
    if (on(8)) h += g(8, person(24, 'm', '#f7f3ea') + person(34, 'w', '#e08a2e') + person(42, 'w', '#7a4fb0', .68));
    if (on(17)) h += g(17, person(120, 'w', '#2f8f8a') + person(252, 'm', '#f7f3ea') + person(316, 'w', '#d2452f') + person(326, 'm', '#dfe9f2', .7) + person(392, 'w', '#e8a23a'));

    // the Nile
    h += R(0, 203, 400, 59, 'url(#rk-water)') +
      P('M400 203H236q52 22 96 59h68z', mix('#6d7d73', '#8ed0b8', p), ' opacity=".45"');
    for (i = 0; i < 6; i++) h += R(312 - 16 + i * 2.5, 207 + i * 8, 32 - i * 5, 2.2, '#fff3c4', ' rx="1" opacity="' + f1(.12 + .5 * p - i * .03) + '"');
    h += P('M0 214q25-4 50 0t50 0t50 0t50 0', 'none', ' stroke="#fff" stroke-opacity=".16" stroke-width="1.6"') +
      P('M180 232q25-4 50 0t50 0t50 0t50 0t50 0', 'none', ' stroke="#fff" stroke-opacity=".13" stroke-width="1.6"') +
      P('M-20 250q25-4 50 0t50 0t50 0t50 0t50 0', 'none', ' stroke="#fff" stroke-opacity=".1" stroke-width="1.6"');

    // the bridge, heading out across the water toward us
    var Lb = bf >= 1 ? 1 : bf >= .67 ? .72 : bf >= .34 ? .46 : .2, built = bf >= 1;
    var yb = 201 + 61 * Lb, xl = 118 + (60 - 118) * Lb, xr = 142 + (132 - 142) * Lb, deck = built ? '#d8ccb2' : '#8b7f7a';
    [0.3, 0.62, 0.9].forEach(function (t) {
      if (t > Lb + .05 && !built) { h += R(118 - 58 * t + 4, 201 + 61 * t - 2, 9, 30, '#5d5356', ' rx="1.5" opacity=".8"'); return; }
      h += R((118 - 58 * t + 142 - 10 * t) / 2 - 5, 201 + 61 * t - 2, 10, 40, '#6b6163', ' rx="1.5"');
    });
    h += P('M118 201h24L' + f1(xr) + ' ' + f1(yb) + (built ? '' : 'l-7 4l-6-5l-8 6l-5-4') + 'L' + f1(xl) + ' ' + f1(yb) + 'z', deck) +
      P('M118 201L' + f1(xl) + ' ' + f1(yb) + 'M142 201L' + f1(xr) + ' ' + f1(yb), 'none', ' stroke="' + (built ? '#8a7a5c' : '#5d5356') + '" stroke-width="2"');
    if (built) {
      h += P('M130 203L' + f1((xl + xr) / 2) + ' ' + f1(yb), 'none', ' stroke="#fff" stroke-width="1.2" stroke-dasharray="5 5" opacity=".8"');
      [0.25, 0.6].forEach(function (t) { h += C(118 - 58 * t - 1, 201 + 61 * t - 12, 6, 'url(#rk-glow)') + P('M' + f1(118 - 58 * t) + ' ' + f1(201 + 61 * t) + 'v-12', 'none', ' stroke="#4a4144" stroke-width="1.4"') + C(118 - 58 * t, 201 + 61 * t - 12, 2, '#fff3c4'); });
    }

    if (on(6)) h += g(6, boat(250, 226));
    if (on(16)) h += g(16, boat(350, 244));
    if (on(21)) h += g(21, [[150, 40], [172, 56], [196, 34], [84, 70]].map(function (q) {
      return P('M' + q[0] + ' ' + q[1] + 'q5-5 10 0q5-5 10 0', 'none', ' stroke="#3b3340" stroke-width="1.7" stroke-linecap="round"');
    }).join(''));

    return h + R(0, 0, 400, 262, '#4a3d44', ' opacity="' + f1(.24 * (1 - p)) + '" pointer-events="none"') + '</svg>';
  }

  /* =====================================================================
     MAP — Khartoum from above, where the White Nile and Blue Nile meet
     ===================================================================== */
  var WN = [[66, 452], [90, 386], [120, 322], [152, 252]];
  var BN1 = [[412, 150], [352, 150], [334, 220], [272, 208]];
  var BN2 = [[272, 208], [228, 200], [192, 208], [156, 248]];
  var MN = [[154, 250], [146, 184], [190, 112], [176, -12]];
  function bez(c, t) {
    var u = 1 - t, a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
    return [a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0], a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1]];
  }
  function dPath(c) { return 'M' + c[0].join(' ') + 'C' + c[1].join(' ') + ' ' + c[2].join(' ') + ' ' + c[3].join(' '); }
  function samples(c) { var a = []; for (var i = 0; i <= 26; i++) a.push(bez(c, i / 26)); return a; }
  var RIV = [[samples(WN), 21], [samples(BN1), 15], [samples(BN2), 16], [samples(MN), 19]];
  function riverGap(x, y) { // distance to the nearest river bank
    var best = 1e9;
    RIV.forEach(function (r) {
      r[0].forEach(function (q) { var d = Math.sqrt((q[0] - x) * (q[0] - x) + (q[1] - y) * (q[1] - y)) - r[1]; if (d < best) best = d; });
    });
    return best;
  }
  var ZONES = [[292, 268, 104, 140], [184, 262, 78, 78], [28, 300, 70, 66], [176, 196, 62, 34]];
  var LOTS = null;
  function lots() {
    if (LOTS) return LOTS;
    var rnd = rng(7), out = [];
    for (var ix = 0, x = 6; x < 392; x += 15, ix++) for (var iy = 0, y = 6; y < 434; y += 15, iy++) {
      if (ix % 5 === 4 || iy % 5 === 4) { rnd(); continue; } // leave streets
      var w = 9 + rnd() * 4, hh = 9 + rnd() * 4, cx = x + 6, cy = y + 6;
      var gap = riverGap(cx, cy);
      if (gap < 11) continue;
      if (ZONES.some(function (z) { return cx > z[0] && cx < z[0] + z[2] && cy > z[1] && cy < z[1] + z[3]; })) continue;
      out.push({ x: x + rnd() * 1.5, y: y + rnd() * 1.5, w: w, h: hh, d: Math.pow(cx - 154, 2) + Math.pow(cy - 250, 2), c: Math.floor(rnd() * 5), t: rnd(), gap: gap });
    }
    out.sort(function (a, b) { return a.d - b.d; });
    return (LOTS = out);
  }

  function pill(x, y, text, f, has) {
    var w = Math.max(44, text.length * 5.3 + 16);
    var s = R(x - w / 2 + 1, y - 9, w, has ? 21 : 16, '#000', ' rx="8" opacity=".18"') + R(x - w / 2, y - 10, w, has ? 21 : 16, has ? '#fffaf1' : '#2a2118', ' rx="8"') +
      '<text x="' + x + '" y="' + (y + 1.5) + '" font-size="8.5" font-weight="700" text-anchor="middle" fill="' + (has ? '#2a2118' : '#fff') + '">' + text + '</text>';
    if (has) s += R(x - w / 2 + 7, y + 5, w - 14, 3, '#e4d8c4', ' rx="1.5"') + R(x - w / 2 + 7, y + 5, (w - 14) * f, 3, '#0f7c82', ' rx="1.5"');
    return s;
  }

  function map(o) {
    var p = o.n / o.total, i, L = lots(), built = Math.round(L.length * p);
    var roofs = ['#edd3a0', '#dba56c', '#f4e3bb', '#cf9468', '#e6bd84'];
    var h = '<svg viewBox="0 0 400 440"><defs>' +
      '<radialGradient id="rk-land" cx=".4" cy=".55" r=".8"><stop offset="0" stop-color="' + mix('#aa9c8e', '#f1e2bd', p) + '"/><stop offset="1" stop-color="' + mix('#93867b', '#dcc898', p) + '"/></radialGradient></defs>' +
      R(0, 0, 400, 440, 'url(#rk-land)');

    // green farmland hugging the rivers, the way the Nile looks from the air
    var bank = mix('#8c8a74', '#8fbf62', p), bank2 = mix('#84806e', '#b5d47f', p);
    [[WN, 62], [BN1, 46], [BN2, 50], [MN, 58]].forEach(function (r) { h += P(dPath(r[0]), 'none', ' stroke="' + bank2 + '" stroke-width="' + r[1] + '" stroke-linecap="round" opacity=".55"'); });
    [[WN, 52], [BN1, 38], [BN2, 42], [MN, 48]].forEach(function (r) { h += P(dPath(r[0]), 'none', ' stroke="' + bank + '" stroke-width="' + r[1] + '" stroke-linecap="round" opacity=".8"'); });

    // main roads
    var road = mix('#877a70', '#fbf3df', p);
    h += P('M300 0Q290 90 286 180M286 236Q282 300 300 440M400 250Q330 262 262 262T172 330Q150 380 150 440M0 60Q70 80 120 150M0 250Q60 244 104 262M214 0Q260 60 400 70', 'none', ' stroke="' + road + '" stroke-width="3.2" stroke-linecap="round" opacity=".85"');

    // neighbourhoods: rebuilt outward from the meeting point
    L.forEach(function (b, k) {
      if (k < built) {
        h += R(b.x + 1.4, b.y + 1.6, b.w, b.h, '#000', ' rx="2" opacity=".2"') + R(b.x, b.y, b.w, b.h, roofs[b.c], ' rx="2" stroke="#a8824f" stroke-width=".5"');
        if (b.t > .72) h += R(b.x + b.w * .3, b.y + b.h * .3, b.w * .4, b.h * .4, '#86b35f', ' rx="1"');
        if (b.t < .16) h += C(b.x + b.w + 1.5, b.y + b.h + 1.5, 2.6, '#4f9a4a');
      } else {
        h += P('M' + f1(b.x) + ' ' + f1(b.y + 2) + 'l3-2h' + f1(b.w - 5) + 'l2 3v' + f1(b.h - 6) + 'l-3 3h' + f1(-(b.w - 6)) + 'l-2-2z', '#7d726d', ' opacity=".8"') +
          R(b.x + b.w * .3, b.y + b.h * .35, b.w * .35, b.h * .3, '#554c4b');
        if (b.t > .8) h += C(b.x + b.w, b.y + b.h, 1.6, '#6a5f5c');
      }
    });
    // trees along the banks come back with the city
    L.forEach(function (b, k) { if (k < built && b.gap < 22 && b.t > .35) h += C(b.x - 3, b.y - 2, 2.4, '#4f9a4a'); });

    // the three rivers
    var white = mix('#84908a', '#a9dccb', p), blue = mix('#56707c', '#2c8fb0', p), main = mix('#67797c', '#4fa9b4', p);
    h += P(dPath(WN), 'none', ' stroke="' + white + '" stroke-width="42" stroke-linecap="round"') +
      P(dPath(BN1), 'none', ' stroke="' + blue + '" stroke-width="30" stroke-linecap="round"') +
      E(207, 213, 44, 24, blue, ' transform="rotate(-12 207 213)"') +
      P(dPath(BN2), 'none', ' stroke="' + blue + '" stroke-width="32" stroke-linecap="round"') +
      P(dPath(MN), 'none', ' stroke="' + main + '" stroke-width="38" stroke-linecap="round"') +
      P(dPath(WN), 'none', ' stroke="#fff" stroke-opacity=".16" stroke-width="3" stroke-dasharray="10 14" stroke-linecap="round"') +
      P(dPath(BN1), 'none', ' stroke="#fff" stroke-opacity=".16" stroke-width="2.5" stroke-dasharray="10 14" stroke-linecap="round"') +
      P(dPath(MN), 'none', ' stroke="#fff" stroke-opacity=".16" stroke-width="3" stroke-dasharray="10 14" stroke-linecap="round"');
    // Tuti Island
    h += '<g transform="rotate(-12 207 213)">' + E(207, 213, 29, 12.5, mix('#8d8a78', '#f1e2bd', p)) + E(207, 213, 26, 10, mix('#85836f', '#8cc063', p)) +
      [-16, -8, 0, 8, 16].map(function (dx) { return P('M' + (207 + dx) + ' 205v16', 'none', ' stroke="#000" stroke-opacity=".08"'); }).join('') + '</g>';

    function label(x, y, s, size) {
      return '<text x="' + x + '" y="' + y + '" font-size="' + (size || 10) + '" font-weight="800" letter-spacing="2.5" text-anchor="middle" fill="#3a2e22" fill-opacity=".62" stroke="#fff" stroke-opacity=".5" stroke-width="2.5" paint-order="stroke">' + s + '</text>';
    }
    h += label(62, 150, 'OMDURMAN') + label(286, 104, 'BAHRI') + label(238, 420, 'KHARTOUM') + label(207, 215.5, 'TUTI', 6) +
      '<text x="96" y="405" font-size="6.5" font-style="italic" fill="#fff" fill-opacity=".8" transform="rotate(-66 96 405)">White Nile</text>' +
      '<text x="330" y="176" font-size="6.5" font-style="italic" fill="#fff" fill-opacity=".85" transform="rotate(36 330 176)">Blue Nile</text>' +
      '<text x="166" y="60" font-size="6.5" font-style="italic" fill="#fff" fill-opacity=".85" transform="rotate(-80 166 60)">The Nile</text>';
    // compass
    h += C(26, 26, 13, '#fffaf1', ' opacity=".9"') + P('M26 16l4 11h-8z', '#c4553b') + P('M26 36l4-9h-8z', '#b7ab98') + '<text x="26" y="14" font-size="7" font-weight="800" text-anchor="middle" fill="#2a2118">N</text>';

    function mark(kind, hit, art, px, py, emptyName) {
      var gl = o.goals[kind], txt = gl ? gl.name + ' ' + Math.floor(gl.f * 100) + '%' : '+ ' + emptyName;
      return '<g data-act="' + (gl ? 'goal' : 'goaledit') + '"' + (gl ? ' data-id="' + gl.id + '"' : ' data-kind="' + kind + '"') + ' style="cursor:pointer">' +
        R(hit[0], hit[1], hit[2], hit[3], '#000', ' opacity="0"') + art + pill(px, py, txt, gl ? gl.f : 0, !!gl) + '</g>';
    }
    function F(kind) { return o.goals[kind] ? o.goals[kind].f : 0; }

    // --- the bridge over the Blue Nile: grows from both banks until it meets
    var f = F('bridge'), bp = bez(BN1, .86), b2 = bez(BN1, .9), ang = Math.atan2(b2[1] - bp[1], b2[0] - bp[0]) * 180 / Math.PI, half = 25;
    var a = '<g transform="translate(' + f1(bp[0]) + ' ' + f1(bp[1]) + ') rotate(' + f1(ang) + ')">';
    a += R(-7, -half - 5, 14, 7, '#6b6163', ' rx="1.5"') + R(-7, half - 2, 14, 7, '#6b6163', ' rx="1.5"') + E(0, -8, 4.5, 3, '#4a4144', ' opacity=".55"') + E(0, 8, 4.5, 3, '#4a4144', ' opacity=".55"') +
      '<rect x="-5.5" y="' + (-half) + '" width="11" height="' + (half * 2) + '" fill="#fff" fill-opacity=".12" stroke="#fff" stroke-opacity=".75" stroke-dasharray="3 3" rx="1"/>';
    if (f > 0) {
      var len = half * f;
      [[-half, len], [half - len, len]].forEach(function (q) {
        a += R(-4.2, q[0] + 1.6, 11, q[1], '#000', ' opacity=".22"') + R(-5.5, q[0], 11, q[1], '#f3e6c6', ' stroke="#8a6a45" stroke-width=".9"') +
          P('M0 ' + f1(q[0] + 1) + 'v' + f1(q[1] - 2), 'none', ' stroke="#b89a66" stroke-width="1" stroke-dasharray="3 3"');
      });
    }
    if (f >= 1) for (i = -2; i <= 2; i++) a += C(-5.5, i * 9, 1.5, '#ffe08a') + C(5.5, i * 9, 1.5, '#ffe08a');
    a += '</g>';
    h += mark('bridge', [bp[0] - 24, bp[1] - 52, 48, 86], a, bp[0], bp[1] - 42, 'Bridge');

    // --- the airport
    f = F('airport');
    a = R(294, 270, 100, 136, '#000', ' rx="10" opacity=".08"') + R(296, 272, 96, 132, mix('#8f8378', '#e9dcc0', Math.max(p, f)), ' rx="9"');
    if (f < .25) a += R(366, 282, 17, 114, '#6f6566', ' rx="2"') + C(374, 306, 6, '#463e41') + C(371, 344, 5, '#463e41') + C(377, 376, 5.5, '#463e41') + P('M368 322l12 6M369 360l10-3', 'none', ' stroke="#463e41"');
    else {
      a += R(366, 282, 17, 114, '#555a60', ' rx="2"');
      for (i = 0; i < 7; i++) a += R(373.8, 292 + i * 14, 1.6, 8, '#fff');
      a += [0, 1, 2, 3].map(function (k) { return R(368.5 + k * 3.4, 284, 1.6, 5, '#fff') + R(368.5 + k * 3.4, 389, 1.6, 5, '#fff'); }).join('');
    }
    if (f < .5) a += P('M304 304l6-4h34l8 5v16l-6 4h-38l-4-3z', '#7d726d') + R(316, 308, 16, 9, '#554c4b') + E(338, 330, 8, 3, '#6a5f5c');
    else a += R(350, 314, 16, 6, '#555a60') + R(350, 344, 16, 6, '#555a60') + R(304, 334, 46, 30, '#6b7076', ' rx="3"') +
      R(305.5, 303.5, 46, 26, '#000', ' rx="5" opacity=".2"') + R(304, 302, 46, 26, '#f5f2ea', ' rx="5"') + R(304, 311, 46, 7, '#3d86b8') + P('M304 311q23-8 46 0', 'none', ' stroke="#fff" stroke-width="1.5"');
    if (f >= .75) a += C(313.5, 383.5, 8.5, '#000', ' opacity=".2"') + C(312, 382, 8.5, '#f5f2ea', ' stroke="#3d86b8" stroke-width="2.2"') + C(312, 382, 3, '#3d86b8') +
      P('M322 340l5 3M322 350l5 3M322 360l5 3', 'none', ' stroke="#ffd24a" stroke-width="1.2"');
    function plane(x, y, r) { return '<g transform="translate(' + x + ' ' + y + ') rotate(' + r + ')">' + P('M0-10l2.4 8l10 6.5v3l-10-3l-.9 7l3.4 3v2l-4.9-1.2l-4.9 1.2v-2l3.4-3l-.9-7l-10 3v-3l10-6.5z', '#fff', ' stroke="#3d86b8" stroke-width=".8"') + '</g>'; }
    if (f >= 1) a += plane(374.5, 330, 0) + plane(332, 349, 90);
    h += mark('airport', [294, 270, 100, 136], a, 330, 286, 'Airport');

    // --- the public library, drawn standing up like a landmark on a tourist map
    f = F('library');
    a = E(222, 322, 36, 9, '#000', ' opacity=".14"');
    if (f < .25) a += '<rect x="194" y="290" width="56" height="30" fill="#fff" fill-opacity=".1" stroke="#fff" stroke-opacity=".75" stroke-dasharray="3 3" rx="2"/>' + E(210, 314, 9, 4, '#6a5f5c') + E(232, 310, 7, 3.4, '#74686a') + P('M224 314l6-8l5 8z', '#6a5f5c');
    else {
      a += R(192, 316, 60, 5, '#cfc3ab', ' rx="1"') + R(196, 312, 52, 4, '#ded3bd') + R(200, 308.5, 44, 3.5, '#ebe2cf');
      if (f >= .5) {
        a += R(201, 286, 42, 23, '#e2d0a8') + arch(217.5, 294, 9, 15, '#7a5a3a');
        for (i = 0; i < 5; i++) if (i !== 2) a += R(201.5 + i * 9.2, 286, 4.6, 23, '#fbf5e6') + R(204.6 + i * 9.2, 286, 1.5, 23, '#000', ' opacity=".08"');
      }
      if (f >= .75) a += R(197, 282, 50, 5, '#fbf5e6') + P('M195 282l27-17l27 17z', '#c4553b') + P('M195 282l27-17l27 17', 'none', ' stroke="#fbf5e6" stroke-width="1.6"');
      if (f >= 1) a += C(222, 275, 3.2, '#ffe08a') + C(186, 308, 7, '#4f9a4a') + R(185, 312, 2, 8, '#8a6a45') + C(258, 308, 7, '#4f9a4a') + R(257, 312, 2, 8, '#8a6a45') + C(182, 316, 4.5, '#6bb05f') + C(262, 316, 4.5, '#6bb05f');
    }
    h += mark('library', [184, 262, 78, 78], a, 222, 337, 'Library');

    // --- the Nile garden (only when that goal exists)
    if (o.goals.garden) {
      f = F('garden');
      a = E(62, 334, 34, 28, mix('#8c8a74', '#b5d47f', Math.max(p, f)));
      var spots = [[46, 320], [62, 314], [78, 320], [42, 338], [62, 334], [82, 338], [50, 352], [66, 354], [78, 350]];
      for (i = 0; i < Math.round(f * 9); i++) a += C(spots[i][0] + 1, spots[i][1] + 1.5, 7, '#000', ' opacity=".18"') + C(spots[i][0], spots[i][1], 7, i % 2 ? '#4f9a4a' : '#6bb05f');
      h += mark('garden', [28, 300, 70, 66], a, 62, 306, 'Garden');
    }
    return h + R(0, 0, 400, 440, '#4a3d44', ' opacity="' + f1(.2 * (1 - p)) + '" pointer-events="none"') + '</svg>';
  }

  window.RKArt = { street: street, map: map };
})();
