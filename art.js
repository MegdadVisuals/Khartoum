/* Rebuild Khartoum — the artwork.
   One night-time model of the city, laid out like the real Khartoum (the Nile from the north,
   the Blue Nile from the east, the White Nile from the south, Tuti Island where they meet),
   drawn from above at an angle. Two cameras look at the same model:
   "strip" for the swipeable home view, "map" for the whole city. */
(function () {
  'use strict';
  var W = 1000, H = 640;

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  // Catmull-Rom: a smooth line through the given points
  function smooth(p, per) {
    var out = [], n = p.length;
    for (var i = 0; i < n - 1; i++) {
      var a = p[Math.max(0, i - 1)], b = p[i], c = p[i + 1], d = p[Math.min(n - 1, i + 2)];
      for (var k = 0; k < per; k++) {
        var t = k / per, t2 = t * t, t3 = t2 * t;
        out.push([
          .5 * (2 * b[0] + (c[0] - a[0]) * t + (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * t2 + (3 * b[0] - a[0] - 3 * c[0] + d[0]) * t3),
          .5 * (2 * b[1] + (c[1] - a[1]) * t + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * t2 + (3 * b[1] - a[1] - 3 * c[1] + d[1]) * t3)]);
      }
    }
    out.push(p[n - 1]);
    return out;
  }
  // a river: centre line plus a width that can change along the way
  function ribbon(line, h0, h1) {
    var L = [], Rr = [], n = line.length;
    for (var i = 0; i < n; i++) {
      var a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], m = Math.sqrt(dx * dx + dy * dy) || 1;
      var hw = h0 + (h1 - h0) * i / (n - 1);
      L.push([line[i][0] - dy / m * hw, line[i][1] + dx / m * hw]);
      Rr.push([line[i][0] + dy / m * hw, line[i][1] - dx / m * hw]);
    }
    return { line: line, h0: h0, h1: h1, poly: L.concat(Rr.reverse()) };
  }

  /* ---------- the geography ---------- */
  var NILE = ribbon(smooth([[578, -14], [505, 80], [440, 162], [374, 262], [358, 318], [374, 356], [398, 378]], 8), 12, 14);
  var BLUE = ribbon(smooth([[806, 654], [752, 566], [704, 470], [668, 392], [628, 358], [542, 352], [452, 370], [398, 378]], 8), 10, 11);
  var WHITE = ribbon(smooth([[398, 378], [374, 416], [344, 482], [318, 560], [296, 656]], 8), 14, 24);
  var CHANNEL = ribbon(smooth([[372, 286], [412, 300], [456, 326], [476, 362]], 6), 4.5, 4.5);
  var RIVERS = [WHITE, BLUE, NILE, CHANNEL];
  var TUTI = { x: 424, y: 338, rx: 33, ry: 15, rot: .5 };
  var MEET = [398, 378];

  var ROADS = [
    [[410, 394], [462, 386], [540, 368], [632, 374], [690, 432]],            // 0: Nile Street
    [[596, 384], [600, 520], [604, 640]],
    [[420, 402], [520, 418], [700, 474], [860, 520], [1000, 540]],
    [[344, 300], [200, 282], [0, 300]],
    [[304, 210], [262, 100], [240, 0]],
    [[474, 332], [520, 204], [566, 0]],
    [[486, 304], [700, 282], [1000, 300]],
    [[462, 432], [452, 640]],
    [[388, 480], [600, 524], [1000, 600]],
    [[320, 420], [180, 470], [0, 520]],
    [[720, 640], [730, 480], [860, 380], [900, 0]]
  ].map(function (r) { return smooth(r, 6); });

  // landmark plots (kept free of ordinary buildings): [x0, y0, x1, y1]
  var Z_AIR = [522, 382, 590, 506], Z_LIB = [436, 402, 480, 440], Z_GARDEN = [296, 404, 340, 446], Z_BRIDGE = [588, 334, 612, 380];
  var ZONES = [Z_AIR, Z_LIB, Z_GARDEN, Z_BRIDGE];

  // one seed per milestone, in the same order as the app's list (null = a milestone that is not a district)
  var SEEDS = [
    [424, 338], [452, 398], [500, 402], null, [330, 332], null, [338, 268], [628, 404], [288, 300], [482, 452], [452, 238],
    [546, 474], [300, 226], [560, 300], [626, 476], [250, 150], [654, 258], [500, 544], [180, 332], [482, 118], [428, 584]
  ];
  var REST = SEEDS.length; // index 21: everything further out
  var FAR = [[820, 300], [700, 580], [200, 520], [860, 110], [110, 110], [890, 470], [140, 620], [620, 630], [60, 240], [700, 60], [330, 60], [900, 620]];

  function dist2(a, b) { return (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]); }
  function nearLine(pt, line, lim) {
    for (var i = 0; i < line.length; i++) if (dist2(pt, line[i]) < lim * lim) return true;
    return false;
  }
  function riverGap(pt) {
    var best = 1e9;
    RIVERS.forEach(function (r) {
      for (var i = 0; i < r.line.length; i++) {
        var d = Math.sqrt(dist2(pt, r.line[i])) - (r.h0 + (r.h1 - r.h0) * i / (r.line.length - 1));
        if (d < best) best = d;
      }
    });
    return best;
  }
  function inTuti(pt, grow) {
    var c = Math.cos(-TUTI.rot), s = Math.sin(-TUTI.rot), dx = pt[0] - TUTI.x, dy = pt[1] - TUTI.y;
    var u = (dx * c - dy * s) / (TUTI.rx + (grow || 0)), v = (dx * s + dy * c) / (TUTI.ry + (grow || 0));
    return u * u + v * v < 1;
  }

  var LOTS = null;
  function lots() {
    if (LOTS) return LOTS;
    var rnd = rng(11), out = [];
    for (var x = 8; x < W - 8; x += 25) for (var y = 8; y < H - 8; y += 25) {
      var w = 14 + rnd() * 7, d = 14 + rnd() * 7, jx = rnd() * 3, jy = rnd() * 3, t = rnd(), c = [x + jx + w / 2, y + jy + d / 2];
      var onTuti = inTuti(c, -7);
      if (!onTuti && (inTuti(c, 12) || riverGap(c) < 12)) continue;
      if (onTuti && t > .45) continue; // Tuti is mostly farmland
      if (ZONES.some(function (z) { return c[0] > z[0] - 9 && c[0] < z[2] + 9 && c[1] > z[1] - 9 && c[1] < z[3] + 9; })) continue;
      if (ROADS.some(function (r) { return nearLine(c, r, 11); })) continue;
      var best = REST, bd = 1e12, i, q;
      for (i = 0; i < SEEDS.length; i++) if (SEEDS[i]) { q = dist2(c, SEEDS[i]); if (q < bd) { bd = q; best = i; } }
      for (i = 0; i < FAR.length; i++) { q = dist2(c, FAR[i]); if (q < bd) { bd = q; best = REST; } }
      if (onTuti) best = 0;
      var dn = Math.sqrt(dist2(c, [492, 412])), db = Math.sqrt(dist2(c, [500, 286]));
      var h = 7 + rnd() * 11 + 50 * Math.exp(-dn * dn / (2 * 80 * 80)) * (.55 + rnd() * .6) + 15 * Math.exp(-db * db / (2 * 70 * 70)) * rnd();
      if (onTuti) { h = 5 + rnd() * 3; w *= .6; d *= .6; }
      if (rnd() < .04) h *= 1.5;
      out.push({ x: x + jx, y: y + jy, w: w, d: d, h: h, t: t, dist: best, kind: t < .05 ? 2 : t < .2 ? 1 : 0, hue: Math.floor(rnd() * 3) });
    }
    return (LOTS = out);
  }

  /* ---------- camera ---------- */
  function camera(name, cssW, cssH) {
    var c = name === 'strip'
      ? { A: .5, k: .42, zs: 1.1, crop: [40, 20, 960, 630], top: 46 }
      : { A: .2, k: .8, zs: .85, crop: [150, 44, 800, 632], top: 26 };
    c.cos = Math.cos(c.A); c.sin = Math.sin(c.A);
    var xs = [], ys = [];
    [[c.crop[0], c.crop[1]], [c.crop[2], c.crop[1]], [c.crop[2], c.crop[3]], [c.crop[0], c.crop[3]]].forEach(function (p) {
      xs.push(p[0] * c.cos - p[1] * c.sin); ys.push((p[0] * c.sin + p[1] * c.cos) * c.k);
    });
    var minX = Math.min.apply(0, xs), maxX = Math.max.apply(0, xs), minY = Math.min.apply(0, ys), maxY = Math.max.apply(0, ys);
    if (name === 'strip') { c.s = (cssH - c.top - 6) / (maxY - minY); c.w = Math.round((maxX - minX) * c.s); c.h = cssH; }
    else { c.s = cssW / (maxX - minX); c.w = cssW; c.h = Math.round((maxY - minY) * c.s + c.top + 6); }
    c.ox = -minX * c.s; c.oy = c.top - minY * c.s;
    c.P = function (x, y, z) {
      return [c.ox + (x * c.cos - y * c.sin) * c.s, c.oy + ((x * c.sin + y * c.cos) * c.k - (z || 0) * c.zs) * c.s];
    };
    c.depth = function (x, y) { return x * c.sin + y * c.cos; };
    return c;
  }

  /* ---------- drawing helpers ---------- */
  function poly(ctx, pts, fill, stroke, lw) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  function flat(ctx, c, pts, z, fill, stroke, lw) { poly(ctx, pts.map(function (p) { return c.P(p[0], p[1], z); }), fill, stroke, lw); }
  function line(ctx, c, pts, z, stroke, lw, dash) {
    ctx.beginPath();
    pts.forEach(function (p, i) { var q = c.P(p[0], p[1], z); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
    ctx.setLineDash(dash || []); ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); ctx.setLineDash([]);
  }
  function glow(ctx, x, y, r, color, a) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = a === undefined ? 1 : a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  }
  // a block with a roof; col = {top, s, e, line}; lights = colour or null
  function box(ctx, c, x0, y0, x1, y1, z0, z1, col, lights, seed) {
    var east = c.sin > 0, sx = east ? x1 : x0;
    var side = [c.P(sx, y0, z0), c.P(sx, y1, z0), c.P(sx, y1, z1), c.P(sx, y0, z1)];
    var south = [c.P(x0, y1, z0), c.P(x1, y1, z0), c.P(x1, y1, z1), c.P(x0, y1, z1)];
    poly(ctx, side, col.e, col.line, .6);
    poly(ctx, south, col.s, col.line, .6);
    poly(ctx, [c.P(x0, y0, z1), c.P(x1, y0, z1), c.P(x1, y1, z1), c.P(x0, y1, z1)], col.top, col.line, .6);
    if (lights && z1 - z0 > 7) {
      ctx.beginPath();
      for (var z = z0 + 4; z < z1 - 2; z += 6) {
        var a = c.P(x0, y1, z), b = c.P(x1, y1, z), d = c.P(sx, y0, z), e = c.P(sx, y1, z);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(d[0], d[1]); ctx.lineTo(e[0], e[1]);
      }
      var u = Math.max(1.1, 2.1 * c.s);
      ctx.setLineDash([u, u * 1.5]); ctx.lineDashOffset = (seed || 0) * 9;
      ctx.strokeStyle = lights; ctx.lineWidth = Math.max(1, 1.9 * c.s); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  var PAL = [
    { top: '#216e68', s: '#185552', e: '#103f42', line: '#07181c' },   // teal
    { top: '#4b4069', s: '#3a3154', e: '#2a2440', line: '#0b0a16' },   // dusk purple
    { top: '#39d79c', s: '#1fa67b', e: '#178160', line: '#06251c' }    // bright green tower
  ];
  var DEAD = { top: '#303840', s: '#262d34', e: '#1c2228', line: '#0f1317' };
  var LIGHTS = ['#ff6f9c', '#ffb454', '#ffe08a'];

  function pill(ctx, x, y, text, f, has, hits, hit) {
    ctx.font = '700 11px -apple-system, "Segoe UI", Roboto, sans-serif';
    var w = Math.ceil(ctx.measureText(text).width) + 18, h = has ? 27 : 21, x0 = Math.round(x - w / 2), y0 = Math.round(y - h);
    ctx.fillStyle = has ? 'rgba(8,22,28,.88)' : 'rgba(8,22,28,.7)'; ctx.strokeStyle = has ? '#39d79c' : 'rgba(255,255,255,.45)'; ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, 9); else ctx.rect(x0, y0, w, h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y0 + 10.5);
    if (has) {
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x0 + 8, y0 + 19, w - 16, 3);
      ctx.fillStyle = '#39d79c'; ctx.fillRect(x0 + 8, y0 + 19, (w - 16) * f, 3);
    }
    hits.push({ x: x0 - 4, y: y0 - 4, w: w + 8, h: h + 8, act: hit.act, id: hit.id, kind: hit.kind });
  }

  /* ---------- the painter ---------- */
  // o = { cam, n (milestones done), from (first milestone to highlight), goals: {bridge|airport|library|garden: {id,name,f}|null} }
  function paint(cv, o) {
    var wrap = cv.parentNode, cssW = wrap.clientWidth || 343, cssH = o.cam === 'strip' ? (wrap.clientHeight || 300) : 0;
    var c = camera(o.cam, cssW, cssH), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(c.w * dpr); cv.height = Math.round(c.h * dpr);
    cv.style.width = c.w + 'px'; cv.style.height = c.h + 'px';
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = o.n, from = o.from === undefined ? n : o.from, p = n / 22, hits = [], i;
    var goals = o.goals || {};
    function F(k) { return goals[k] ? goals[k].f : 0; }
    function lit(d) { return d < n; }

    // sky and ground
    var sky = ctx.createLinearGradient(0, 0, 0, c.h);
    sky.addColorStop(0, '#060b16'); sky.addColorStop(1, '#0b1b24');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, c.w, c.h);
    flat(ctx, c, [[-200, -200], [W + 200, -200], [W + 200, H + 200], [-200, H + 200]], 0, '#0c2024');
    var L = lots();

    // warm light spilling into the streets of every rebuilt block
    ctx.beginPath();
    L.forEach(function (b) {
      if (!lit(b.dist)) return;
      [[b.x - 6, b.y - 6], [b.x + b.w + 6, b.y - 6], [b.x + b.w + 6, b.y + b.d + 6], [b.x - 6, b.y + b.d + 6]].forEach(function (q, k) {
        var pt = c.P(q[0], q[1], 0); k ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]);
      });
      ctx.closePath();
    });
    ctx.fillStyle = 'rgba(255,170,84,.13)'; ctx.fill();

    // roads
    ROADS.forEach(function (r, k) {
      line(ctx, c, r, 0, '#17383d', Math.max(1.5, 4 * c.s));
      var on = k === 0 ? n > 3 : p > 0;
      if (on) {
        ctx.shadowColor = '#ffae52'; ctx.shadowBlur = k === 0 ? 9 : 4;
        line(ctx, c, r, 0, 'rgba(255,186,104,' + (k === 0 ? .95 : (.18 + .6 * p).toFixed(2)) + ')', Math.max(.8, (k === 0 ? 1.8 : 1.2) * c.s), k === 0 ? [] : [3, 4]);
        ctx.shadowBlur = 0;
      }
    });

    // rivers
    [[WHITE, '#12414f', '#1c6876'], [BLUE, '#0b2c4c', '#16567d'], [NILE, '#0d3552', '#195f7c'], [CHANNEL, '#0c304e', null]].forEach(function (r) {
      flat(ctx, c, r[0].poly, 0, r[1], 'rgba(60,170,190,.35)', 1);
      if (r[2]) line(ctx, c, r[0].line, 0, r[2], Math.max(1, r[0].h0 * .5 * c.s), [10, 16]);
    });
    var mp = c.P(MEET[0], MEET[1], 0);
    glow(ctx, mp[0], mp[1], 60 * c.s, 'rgba(70,200,210,.5)', .25 + .5 * p);

    // Tuti Island
    var tu = [], cr = Math.cos(TUTI.rot), sr = Math.sin(TUTI.rot);
    for (i = 0; i < 24; i++) { var an = i / 24 * 6.283, ex = Math.cos(an) * TUTI.rx, ey = Math.sin(an) * TUTI.ry; tu.push([TUTI.x + ex * cr - ey * sr, TUTI.y + ex * sr + ey * cr]); }
    flat(ctx, c, tu, 0, lit(0) ? '#1d6a45' : '#1b2a2c', lit(0) ? '#39d79c' : '#2a3a3c', 1);
    if (lit(0)) for (i = -3; i <= 3; i++) line(ctx, c, [[TUTI.x + i * 8 * cr + 11 * sr, TUTI.y + i * 8 * sr - 11 * cr], [TUTI.x + i * 8 * cr - 11 * sr, TUTI.y + i * 8 * sr + 11 * cr]], 0, 'rgba(120,230,160,.35)', 1);

    /* everything that stands up, far to near */
    var items = [];
    L.forEach(function (b) {
      items.push({
        d: c.depth(b.x + b.w / 2, b.y + b.d), draw: function () {
          if (lit(b.dist)) box(ctx, c, b.x, b.y, b.x + b.w, b.y + b.d, 0, b.h, PAL[b.kind], LIGHTS[b.hue], b.t);
          else {
            var h = 2 + b.h * .28;
            box(ctx, c, b.x, b.y, b.x + b.w, b.y + b.d, 0, h, DEAD, null);
            if (b.t > .5) flat(ctx, c, [[b.x + b.w * .45, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.d * .6]], h + .2, '#14181c');
          }
        }
      });
    });

    // boats come back to the rivers
    if (n > 5) [[352, 470], [384, 398], [520, 356], [470, 180], [330, 590], [700, 462]].forEach(function (q) {
      items.push({ d: c.depth(q[0], q[1]), draw: function () {
        var a = c.P(q[0] - 5, q[1], 0), b = c.P(q[0] + 5, q[1], 0), t = c.P(q[0], q[1], 13);
        poly(ctx, [a, b, t], '#eaf6f2'); poly(ctx, [a, b, [(a[0] + b[0]) / 2, a[1] + 2.5]], '#7a5230'); glow(ctx, t[0], a[1], 7, 'rgba(255,214,140,.9)', .7);
      } });
    });

    // --- the bridge over the Blue Nile (grows from both banks until it meets)
    (function () {
      var f = F('bridge'), x0 = 594, x1 = 606, yN = 338, yS = 376, half = (yS - yN) / 2, zz = 7;
      items.push({ d: c.depth(600, yS + 4), draw: function () {
        [346, 357, 368].forEach(function (y) { box(ctx, c, 597, y - 2, 603, y + 2, 0, zz - 1, { top: '#3a4750', s: '#2a353d', e: '#1f282e', line: '#0a1014' }, null); });
        var ghost = [[x0, yN], [x1, yN], [x1, yS], [x0, yS]].map(function (q) { return c.P(q[0], q[1], zz); });
        ctx.setLineDash([3, 3]); poly(ctx, ghost, 'rgba(255,255,255,.05)', 'rgba(255,255,255,.55)', 1); ctx.setLineDash([]);
        if (f > 0) {
          var len = half * f, deck = { top: f >= 1 ? '#e9dcbd' : '#b9ad96', s: '#8f8470', e: '#6f6656', line: '#1a1712' };
          box(ctx, c, x0, yN, x1, yN + len, zz - 2, zz, deck, null);
          box(ctx, c, x0, yS - len, x1, yS, zz - 2, zz, deck, null);
        }
        if (f >= 1) for (var y = yN + 3; y < yS; y += 7) { var q = c.P(x1, y, zz + 3); glow(ctx, q[0], q[1], 6, 'rgba(255,196,110,1)', .95); q = c.P(x0, y, zz + 3); glow(ctx, q[0], q[1], 5, 'rgba(255,196,110,1)', .8); }
      } });
    })();

    // --- the airport
    (function () {
      var f = F('airport');
      items.push({ d: c.depth(556, Z_AIR[1]), draw: function () {
        flat(ctx, c, [[Z_AIR[0], Z_AIR[1]], [Z_AIR[2], Z_AIR[1]], [Z_AIR[2], Z_AIR[3]], [Z_AIR[0], Z_AIR[3]]], 0, f >= .25 ? '#12303a' : '#161d22', f >= .25 ? 'rgba(57,215,156,.5)' : '#2a3338', 1);
        var rw = [[566, 388], [580, 388], [580, 500], [566, 500]];
        flat(ctx, c, rw, .3, f >= .25 ? '#27323b' : '#1d2329', '#0a0f13', .8);
        if (f < .25) [[573, 410, 5], [570, 446, 4], [576, 478, 5]].forEach(function (q) { var pt = c.P(q[0], q[1], .4); ctx.fillStyle = '#0d1114'; ctx.beginPath(); ctx.ellipse(pt[0], pt[1], q[2] * c.s * 1.2, q[2] * c.s * .6, 0, 0, 7); ctx.fill(); });
        else {
          line(ctx, c, [[573, 392], [573, 496]], .5, '#f4f7f8', Math.max(1, 1.4 * c.s), [5 * c.s + 1, 5 * c.s + 1]);
          for (var y = 390; y <= 500; y += 11) { var a = c.P(566, y, .5), b = c.P(580, y, .5); glow(ctx, a[0], a[1], 3.5, '#7fe8ff', .9); glow(ctx, b[0], b[1], 3.5, '#7fe8ff', .9); }
        }
      } });
      items.push({ d: c.depth(540, 470), draw: function () {
        if (f < .5) { box(ctx, c, 528, 418, 552, 468, 0, 3, DEAD, null); flat(ctx, c, [[540, 418], [552, 418], [552, 444]], 3.2, '#14181c'); }
        else {
          flat(ctx, c, [[552, 430], [566, 430], [566, 436], [552, 436]], .3, '#27323b');
          flat(ctx, c, [[552, 456], [566, 456], [566, 462], [552, 462]], .3, '#27323b');
          box(ctx, c, 528, 418, 552, 468, 0, 11, { top: '#dfeaee', s: '#2f7fa8', e: '#215f80', line: '#0a1a22' }, '#bff3ff', .3);
        }
      } });
      if (f >= .75) items.push({ d: c.depth(540, 492), draw: function () {
        box(ctx, c, 535, 482, 543, 490, 0, 30, { top: '#dfeaee', s: '#9fb3bd', e: '#7c919b', line: '#0a1a22' }, null);
        box(ctx, c, 532, 479, 546, 493, 30, 36, { top: '#39d79c', s: '#7fe8ff', e: '#4fb9d0', line: '#0a1a22' }, null);
        var q = c.P(539, 486, 40); glow(ctx, q[0], q[1], 12, 'rgba(127,232,255,1)', .8);
      } });
      if (f >= 1) [[573, 424, 0], [545, 448, 1]].forEach(function (pl) {
        items.push({ d: c.depth(pl[0], pl[1] + 12), draw: function () {
          var sh = [[0, -13], [2, -6], [13, 2], [13, 5], [2, 2], [1.5, 9], [5, 12], [5, 14], [0, 12.5], [-5, 14], [-5, 12], [-1.5, 9], [-2, 2], [-13, 5], [-13, 2], [-2, -6]];
          flat(ctx, c, sh.map(function (q) { return pl[2] ? [pl[0] + q[1] * .8, pl[1] + q[0] * .8] : [pl[0] + q[0] * .8, pl[1] + q[1] * .8]; }), 2.5, '#f6fbfc', '#2f7fa8', .8);
        } });
      });
    })();

    // --- the public library
    (function () {
      var f = F('library');
      items.push({ d: c.depth(458, 438), draw: function () {
        if (f < .25) {
          var g = [[440, 406], [476, 406], [476, 436], [440, 436]].map(function (q) { return c.P(q[0], q[1], 0); });
          ctx.setLineDash([3, 3]); poly(ctx, g, 'rgba(255,255,255,.05)', 'rgba(255,255,255,.55)', 1); ctx.setLineDash([]);
          box(ctx, c, 448, 416, 458, 424, 0, 2, DEAD, null); box(ctx, c, 462, 422, 470, 430, 0, 3, DEAD, null);
          return;
        }
        var stone = { top: '#d9c8a2', s: '#b79f74', e: '#8f7a56', line: '#1c160c' };
        box(ctx, c, 440, 406, 476, 436, 0, 3, stone, null);
        if (f >= .5) {
          box(ctx, c, 444, 410, 472, 432, 3, 19, { top: '#e6d7b4', s: '#c9b083', e: '#9c855c', line: '#1c160c' }, f >= 1 ? '#ffd27a' : null, .2);
          for (var x = 447; x <= 470; x += 5.5) { var a = c.P(x, 432.2, 3), b = c.P(x, 432.2, 19); ctx.strokeStyle = '#fbf3df'; ctx.lineWidth = Math.max(1, 1.6 * c.s); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
        }
        if (f >= .75) {
          var r0 = c.P(443, 409, 19), r1 = c.P(473, 409, 19), r2 = c.P(473, 433, 19), r3 = c.P(443, 433, 19), t0 = c.P(443, 421, 28), t1 = c.P(473, 421, 28);
          poly(ctx, [r0, r1, t1, t0], '#8f3d2c', '#1c0c08', .6); poly(ctx, [r3, r2, t1, t0], '#d0593f', '#1c0c08', .6); poly(ctx, [r1, r2, t1], '#b34a34', '#1c0c08', .6);
        }
        if (f >= 1) { var q = c.P(458, 434, 10); glow(ctx, q[0], q[1], 26 * c.s + 8, 'rgba(255,196,110,1)', .45); }
      } });
    })();

    // --- the Nile garden (only once that goal exists)
    if (goals.garden) (function () {
      var f = F('garden'), spots = [[304, 412], [318, 410], [332, 414], [302, 426], [318, 424], [334, 428], [306, 440], [320, 438], [332, 440]];
      items.push({ d: c.depth(318, Z_GARDEN[1]), draw: function () {
        flat(ctx, c, [[Z_GARDEN[0], Z_GARDEN[1]], [Z_GARDEN[2], Z_GARDEN[1]], [Z_GARDEN[2], Z_GARDEN[3]], [Z_GARDEN[0], Z_GARDEN[3]]], 0, '#143a2c', 'rgba(57,215,156,.5)', 1);
      } });
      spots.slice(0, Math.round(f * 9)).forEach(function (q) {
        items.push({ d: c.depth(q[0], q[1]), draw: function () {
          var a = c.P(q[0], q[1], 0), t = c.P(q[0], q[1], 9);
          ctx.strokeStyle = '#3a2a1c'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(t[0], t[1]); ctx.stroke();
          ctx.fillStyle = '#2fbf7f'; ctx.beginPath(); ctx.arc(t[0], t[1], Math.max(3, 6 * c.s), 0, 7); ctx.fill();
        } });
      });
    })();

    items.sort(function (a, b) { return a.d - b.d; });
    items.forEach(function (it) { it.draw(); });

    // a ring around whatever was just rebuilt
    for (i = from; i < n; i++) {
      var sd = SEEDS[i] || (i === 3 ? [540, 368] : i === 5 ? MEET : [500, 320]), q = c.P(sd[0], sd[1], 0), rad = (i >= REST ? 150 : 46) * c.s;
      ctx.shadowColor = '#ffd27a'; ctx.shadowBlur = 14; ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(q[0], q[1], rad, rad * c.k, 0, 0, 7); ctx.stroke(); ctx.shadowBlur = 0;
    }

    // names and goal tags
    if (o.cam === 'map' || o.cam === 'strip') {
      ctx.font = '800 ' + (o.cam === 'map' ? 11 : 12) + 'px -apple-system, "Segoe UI", Roboto, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      [['O M D U R M A N', 236, 300], ['B A H R I', 556, 200], ['K H A R T O U M', 520, 566], ['TUTI', TUTI.x, TUTI.y]].forEach(function (t, k) {
        var q = c.P(t[1], t[2], k === 3 ? 0 : 30);
        ctx.fillStyle = 'rgba(4,12,16,.55)'; ctx.fillText(t[0], q[0] + 1, q[1] + 1);
        ctx.fillStyle = k === 3 ? 'rgba(200,255,225,.85)' : 'rgba(235,245,246,.8)'; ctx.fillText(t[0], q[0], q[1]);
      });
    }
    function tag(kind, x, y, z, empty) {
      var gl = goals[kind], q = c.P(x, y, z);
      pill(ctx, q[0], q[1] - 4, gl ? gl.name + ' ' + Math.floor(gl.f * 100) + '%' : '+ ' + empty, gl ? gl.f : 0, !!gl, hits,
        gl ? { act: 'goal', id: gl.id } : { act: 'goaledit', kind: kind });
    }
    if (o.goals) {
      tag('bridge', 600, 338, 16, 'Bridge');
      tag('airport', 556, 390, F('airport') >= .75 ? 44 : 20, 'Airport');
      tag('library', 458, 408, F('library') >= .75 ? 34 : 14, 'Library');
      if (goals.garden) tag('garden', 318, 406, 16, 'Garden');
      // the landmarks themselves can be tapped too
      [['bridge', Z_BRIDGE], ['airport', Z_AIR], ['library', Z_LIB], ['garden', Z_GARDEN]].forEach(function (zk) {
        if (zk[0] === 'garden' && !goals.garden) return;
        var z = zk[1], a = c.P(z[0], z[1], 0), b = c.P(z[2], z[1], 0), d = c.P(z[2], z[3], 0), e = c.P(z[0], z[3], 0);
        var xs = [a[0], b[0], d[0], e[0]], ys = [a[1], b[1], d[1], e[1]], gl = goals[zk[0]];
        var x0 = Math.min.apply(0, xs), y0 = Math.min.apply(0, ys) - 20 * c.s;
        hits.push({ x: x0, y: y0, w: Math.max.apply(0, xs) - x0, h: Math.max.apply(0, ys) - y0, act: gl ? 'goal' : 'goaledit', id: gl ? gl.id : '', kind: zk[0] });
      });
    }

    // dust and smoke that lifts as the lights come back
    ctx.fillStyle = 'rgba(40,36,44,' + (.3 * (1 - p)).toFixed(2) + ')'; ctx.fillRect(0, 0, c.w, c.h);
    var vg = ctx.createLinearGradient(0, 0, 0, c.h);
    vg.addColorStop(0, 'rgba(4,8,16,.75)'); vg.addColorStop(.22, 'rgba(4,8,16,0)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, c.w, c.h);

    cv._hits = hits;
    return { focusX: mp[0], w: c.w };
  }

  window.RKArt = { paint: paint };
})();
