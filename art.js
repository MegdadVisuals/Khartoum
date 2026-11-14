/* Rebuild Khartoum — the artwork.
   Two illustrations of the same view: the city in ruins and the city rebuilt.
   The rebuilt picture is revealed over the ruined one, district by district as milestones are
   reached, and landmark by landmark as each savings goal fills up. */
(function () {
  'use strict';
  var AR = 2376 / 1008;                 // picture width / height
  var MW = 198, MH = 84;                // the reveal mask is worked out on a small grid, then softened

  // one spot per milestone, in the same order as the app's list (x, y as fractions of the picture)
  var SEEDS = [
    [[.53, .43]],                         // 0  Tuti Island
    [[.40, .50]],                         // 1  Al-Mogran
    [[.45, .74]],                         // 2  Downtown and Souq al-Arabi
    [[.50, .57], [.62, .63]],             // 3  Nile Street
    [[.14, .40]],                         // 4  Al-Mulazimin
    [[.44, .40], [.60, .48], [.90, .56], [.50, .27]], // 5  boats return: the river itself
    [[.05, .36]],                         // 6  Abu Rof
    [[.66, .39]],                         // 7  Burri
    [[.12, .52]],                         // 8  Souq Omdurman
    [[.62, .82]],                         // 9  Khartoum 2
    [[.38, .29]],                         // 10 Shambat
    [[.80, .80]],                         // 11 Al-Amarat
    [[.24, .28]],                         // 12 Wad Nubawi
    [[.60, .27]],                         // 13 Kober
    [[.94, .82]],                         // 14 Riyadh
    [[.07, .25]],                         // 15 Al-Thawra
    [[.82, .44]],                         // 16 Kafouri
    [[.30, .92]],                         // 17 Al-Sahafa
    [[.04, .62]],                         // 18 Umbadda
    [[.74, .25]],                         // 19 Halfaya
    [[.08, .88]],                         // 20 Jabra
    [[.50, .19], [.20, .19], [.85, .19], [.98, .45], [.02, .47]] // 21 the horizon and everything left
  ];
  var TOTAL = SEEDS.length;
  // where the three landmarks sit in the picture: [x0, y0, x1, y1], and where their tag goes
  var MARKS = {
    library: { box: [.200, .545, .380, .800], tag: [.290, .560], name: 'Library' },
    bridge: { box: [.630, .440, .880, .615], tag: [.740, .470], name: 'Bridge' },
    airport: { box: [.715, .215, 1.00, .370], tag: [.880, .250], name: 'Airport' },
    garden: { box: [.360, .420, .440, .560], tag: [.400, .440], name: 'Garden' }
  };

  var imgs = { ruined: new Image(), rebuilt: new Image() }, ready = 0, waiting = [];
  function loaded() {
    if (++ready < 2) return;
    var w = waiting; waiting = [];
    w.forEach(function (j) { if (j.cv.isConnected) paint(j.cv, j.o); });
  }
  imgs.ruined.onload = loaded; imgs.rebuilt.onload = loaded;
  imgs.ruined.src = 'city-ruined.jpg'; imgs.rebuilt.src = 'city-rebuilt.jpg';

  // which milestone owns each cell of the small grid (worked out once)
  var OWNER = null;
  function owners() {
    if (OWNER) return OWNER;
    OWNER = new Uint8Array(MW * MH);
    for (var y = 0; y < MH; y++) for (var x = 0; x < MW; x++) {
      var fx = (x + .5) / MW, fy = (y + .5) / MH;
      // a gentle wobble so district edges are not straight lines
      var wx = fx + .012 * Math.sin(fy * 37 + fx * 11), wy = fy + .02 * Math.sin(fx * 29 + fy * 7);
      var best = 0, bd = 1e9;
      for (var i = 0; i < TOTAL; i++) for (var k = 0; k < SEEDS[i].length; k++) {
        var dx = (wx - SEEDS[i][k][0]) * AR, dy = wy - SEEDS[i][k][1], d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      OWNER[y * MW + x] = best;
    }
    return OWNER;
  }
  // how much of a landmark is rebuilt at this spot, for goal progress f
  function markReveal(kind, f, u, v) {
    if (f >= 1) return 1;
    if (f <= 0) return 0;
    if (kind === 'bridge') return Math.abs(u - .5) > .5 * (1 - f) ? 1 : 0;   // grows from both banks
    if (kind === 'airport') return u < f ? 1 : 0;                              // left to right
    return 1 - v < f ? 1 : 0;                                                  // library, garden: from the ground up
  }

  var maskCv = document.createElement('canvas'); maskCv.width = MW; maskCv.height = MH;
  var layer = document.createElement('canvas');

  function pill(ctx, x, y, text, f, has, maxW, hits, hit) {
    ctx.font = '700 11px -apple-system, "Segoe UI", Roboto, sans-serif';
    var w = Math.ceil(ctx.measureText(text).width) + 18, h = has ? 27 : 21;
    var x0 = Math.round(Math.max(4, Math.min(maxW - w - 4, x - w / 2))), y0 = Math.round(Math.max(4, y - h));
    ctx.fillStyle = has ? '#fffaf1' : 'rgba(255,250,241,.9)'; ctx.strokeStyle = '#16302f'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, 9); else ctx.rect(x0, y0, w, h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#16302f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + w / 2, y0 + 10.5);
    if (has) {
      ctx.fillStyle = 'rgba(22,48,47,.18)'; ctx.fillRect(x0 + 8, y0 + 19, w - 16, 3);
      ctx.fillStyle = '#2fa37a'; ctx.fillRect(x0 + 8, y0 + 19, (w - 16) * f, 3);
    }
    hits.push({ x: x0 - 4, y: y0 - 4, w: w + 8, h: h + 8, act: hit.act, id: hit.id, kind: hit.kind });
  }

  // o = { cam: 'strip' | 'map', n, from, goals: {bridge|airport|library|garden: {id,name,f}|null} | null }
  function paint(cv, o) {
    var wrap = cv.parentNode, cssW, cssH;
    if (o.cam === 'strip') { cssH = wrap.clientHeight || 300; cssW = Math.round(cssH * AR); }
    else { cssW = wrap.clientWidth || 343; cssH = Math.round(cssW / AR); }
    var dpr = Math.min(3, window.devicePixelRatio || 1), W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
    cv.width = W; cv.height = H; cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    var ctx = cv.getContext('2d'), out = { focusX: cssW * .5, w: cssW };
    if (ready < 2) {
      ctx.fillStyle = '#d9d5e0'; ctx.fillRect(0, 0, W, H);
      waiting.push({ cv: cv, o: o });
      return out;
    }
    var n = o.n, from = o.from === undefined ? n : o.from, goals = o.goals || {}, own = owners();
    // 1. work out the reveal on the small grid
    var mctx = maskCv.getContext('2d'), md = mctx.createImageData(MW, MH), p = n / TOTAL, x, y, k;
    for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) {
      var fx = (x + .5) / MW, fy = (y + .5) / MH, a = own[y * MW + x] < n ? 1 : 0;
      if (fy < .16) a = p;                                   // the sky clears little by little
      for (k in MARKS) {
        var b = MARKS[k].box;
        if (fx >= b[0] && fx <= b[2] && fy >= b[1] && fy <= b[3] && (k !== 'garden' || goals.garden)) {
          a = markReveal(k, goals[k] ? goals[k].f : 0, (fx - b[0]) / (b[2] - b[0]), (fy - b[1]) / (b[3] - b[1]));
        }
      }
      md.data[(y * MW + x) * 4 + 3] = Math.round(a * 255);
    }
    mctx.putImageData(md, 0, 0);
    // 2. ruined picture, then the rebuilt one through the softened mask
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(imgs.ruined, 0, 0, W, H);
    layer.width = W; layer.height = H;
    var lctx = layer.getContext('2d');
    lctx.imageSmoothingEnabled = true; lctx.imageSmoothingQuality = 'high';
    lctx.drawImage(maskCv, 0, 0, W, H);
    lctx.globalCompositeOperation = 'source-in';
    lctx.drawImage(imgs.rebuilt, 0, 0, W, H);
    lctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(layer, 0, 0);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 3. a ring around whatever was just rebuilt
    for (var i = from; i < n; i++) {
      var sd = SEEDS[i][0], rad = (i === TOTAL - 1 ? .3 : .085) * cssW / AR * 1.6;
      ctx.shadowColor = '#ff3f86'; ctx.shadowBlur = 8; ctx.strokeStyle = '#ff3f86'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(sd[0] * cssW, sd[1] * cssH, rad, rad * .55, 0, 0, 7); ctx.stroke(); ctx.shadowBlur = 0;
    }
    // 4. goal tags, and tap areas on the landmarks themselves
    var hits = [];
    if (o.goals) for (k in MARKS) {
      if (k === 'garden' && !goals.garden) continue;
      var m = MARKS[k], gl = goals[k], hit = gl ? { act: 'goal', id: gl.id } : { act: 'goaledit', kind: k };
      pill(ctx, m.tag[0] * cssW, m.tag[1] * cssH, gl ? gl.name + ' ' + Math.floor(gl.f * 100) + '%' : '+ ' + m.name, gl ? gl.f : 0, !!gl, cssW, hits, hit);
      hits.push({ x: m.box[0] * cssW, y: m.box[1] * cssH, w: (m.box[2] - m.box[0]) * cssW, h: (m.box[3] - m.box[1]) * cssH, act: hit.act, id: hit.id, kind: hit.kind });
    }
    cv._hits = hits;
    return out;
  }

  window.RKArt = { paint: paint };
})();
