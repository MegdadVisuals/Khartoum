/* Rebuild Khartoum — step 1: Bridge to Payday + quick logging.
   All data lives in this device's storage. Nothing is sent anywhere. */
(function () {
  'use strict';

  var KEY = 'rk.state.v1';
  var CATS = [
    { id: 'groceries', e: '🛒', n: 'Groceries & home' },
    { id: 'bills', e: '💡', n: 'Home bills' },
    { id: 'eat', e: '🍔', n: 'Eating out & coffee' },
    { id: 'transport', e: '🚕', n: 'Transport' },
    { id: 'subs', e: '📱', n: 'Subscriptions' },
    { id: 'shop', e: '🛍️', n: 'Shopping' },
    { id: 'gear', e: '📷', n: 'Camera & gear' },
    { id: 'care', e: '🌿', n: 'Self-care, health & fun' },
    { id: 'family', e: '🤲', n: 'Family support' },
    { id: 'other', e: '❔', n: 'Other' }
  ];
  var CAT = {};
  CATS.forEach(function (c) { CAT[c.id] = c; });

  var S = load();
  var app = document.getElementById('app');
  var sheetRoot = document.getElementById('sheet-root');
  var toastEl = document.getElementById('toast');
  var toastTimer = null;

  /* ---------- storage ---------- */
  function load() {
    try { var r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch (e) {}
    return null;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  }

  /* ---------- helpers ---------- */
  function z(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
  function today() { return ymd(new Date()); }
  function parse(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) {
    var r = Math.round(n * 100) / 100;
    return (r % 1 === 0 ? r.toFixed(0) : r.toFixed(2)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function num(v) { var n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) && n >= 0 ? n : 0; }
  function niceDate(s) {
    var t = today();
    if (s === t) return 'Today';
    if (daysBetween(s, t) === 1) return 'Yesterday';
    return parse(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function defaultPayday() {
    var d = new Date(), p = new Date(d.getFullYear(), d.getMonth(), 29);
    if (p.getMonth() !== d.getMonth()) p = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    if (ymd(p) <= ymd(d)) {
      p = new Date(d.getFullYear(), d.getMonth() + 1, 29);
      if (p.getMonth() !== (d.getMonth() + 1) % 12) p = new Date(d.getFullYear(), d.getMonth() + 2, 0);
    }
    return ymd(p);
  }

  /* ---------- money math ---------- */
  function spentFrom(src) {
    // imported bank lines are already inside the statement's closing balance
    return S.tx.reduce(function (a, t) { return t.src === src && !t.bank ? a + t.amt : a; }, 0);
  }
  // money moved in or out of a wallet that is not spending (envelope, debts, roommate)
  function moved(src) {
    return S.moves.reduce(function (a, m) { return m.src === src ? a + m.amt : a; }, 0);
  }
  function bal(src) { return S.start[src] - spentFrom(src) + moved(src); }
  function ensure() {
    if (!S.goals) S.goals = [];
    if (!S.vault) S.vault = [];
    if (!S.moves) S.moves = [];
    if (!S.iou) S.iou = [];
    if (!S.rules) S.rules = {};
    if (!S.seenBank) S.seenBank = {};
    if (!S.pending) S.pending = [];
    if (!S.inc) S.inc = [];
    if (!S.created) S.created = Object.keys(S.checkins).sort()[0] || today();
  }
  function r2(n) { return Math.round(n * 100) / 100; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function val(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function radio(name) { var e = document.querySelector('input[name="' + name + '"]:checked'); return e ? e.value : ''; }
  function spentOn(day) {
    return S.tx.reduce(function (a, t) { return t.date === day ? a + t.amt : a; }, 0);
  }
  function bridge() {
    var t = today();
    var days = Math.max(1, daysBetween(t, S.payday));
    var total = bal('cash') + bal('bank');
    var spent = spentOn(t);
    var allowance = Math.max(0, (total + spent) / days);
    return {
      days: days, total: total, spent: spent, allowance: allowance,
      left: allowance - spent,
      tomorrow: days > 1 ? Math.max(0, total) / (days - 1) : null,
      isPayday: daysBetween(t, S.payday) <= 0
    };
  }

  /* ---------- toast ---------- */
  function toast(msg, undo) {
    clearTimeout(toastTimer);
    toastEl.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button>Undo</button>' : '');
    if (undo) toastEl.querySelector('button').onclick = function () { undo(); toastEl.classList.remove('show'); };
    toastEl.classList.add('show');
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, undo ? 5000 : 2500);
  }

  /* ---------- bricks, streak ---------- */
  var STEPS = [
    { at: 10, e: '🧹', t: 'Rubble cleared from the riverbank' },
    { at: 25, e: '💡', t: 'First street lamp lit' },
    { at: 45, e: '🌴', t: 'A palm planted on the corniche' },
    { at: 70, e: '🏠', t: 'First house repaired' },
    { at: 100, e: '☕', t: 'The tea lady’s stall reopens' },
    { at: 135, e: '💡', t: 'Second street lamp lit' },
    { at: 175, e: '⛵', t: 'A fishing boat returns to the Nile' },
    { at: 220, e: '🏠', t: 'Second house repaired' },
    { at: 270, e: '👨‍👩‍👧', t: 'A family comes home' },
    { at: 325, e: '🌴', t: 'Second palm planted' },
    { at: 385, e: '🧺', t: 'A market stall opens' },
    { at: 450, e: '🕌', t: 'The mosque and minaret rebuilt' },
    { at: 520, e: '🌿', t: 'Grass returns to the riverbank' },
    { at: 600, e: '🏫', t: 'The school reopens' },
    { at: 690, e: '💡', t: 'The whole street is lit' },
    { at: 790, e: '🏢', t: 'An apartment block repaired' },
    { at: 900, e: '⛵', t: 'A second boat on the water' },
    { at: 1020, e: '🧑‍🤝‍🧑', t: 'More neighbours return' },
    { at: 1150, e: '🏪', t: 'The corner shop reopens' },
    { at: 1300, e: '🌴', t: 'Third palm planted' },
    { at: 1460, e: '🏢', t: 'The tall building restored' },
    { at: 1640, e: '🕊️', t: 'Birds return over the Nile' }
  ];
  var B_SHOW = 10, B_LOG = 5, B_UNDER = 20;

  function stepsDone() {
    var n = 0;
    while (n < STEPS.length && S.bricks >= STEPS[n].at) n++;
    return n;
  }
  function checkin() {
    var t = today();
    if (S.checkins[t]) return 0;
    S.checkins[t] = true;
    S.bricks += B_SHOW;
    return B_SHOW;
  }
  // reward past days where spending stayed under that day's number
  function settle() {
    var t = today(), won = 0;
    Object.keys(S.allow).forEach(function (d) {
      if (d < t && !S.settled[d]) {
        S.settled[d] = true;
        if (spentOn(d) <= S.allow[d]) { S.bricks += B_UNDER; won++; }
      }
    });
    return won;
  }
  function weekKey(s) { var d = parse(s); d.setDate(d.getDate() - d.getDay()); return ymd(d); }
  function streak() {
    var has = {}, first = null;
    Object.keys(S.checkins).forEach(function (d) { var k = weekKey(d); has[k] = true; if (!first || k < first) first = k; });
    var cur = weekKey(today()), n = 0, fz = 0;
    if (!first) return { n: 0, fz: 0, thisWeek: false };
    function hit() { n++; if (n % 4 === 0 && fz < 2) fz++; }
    for (var w = first; w < cur;) {
      if (has[w]) hit(); else if (fz > 0) fz--; else n = 0;
      var d = parse(w); d.setDate(d.getDate() + 7); w = ymd(d);
    }
    if (has[cur]) hit();
    return { n: n, fz: fz, thisWeek: !!has[cur] };
  }

  /* ---------- the city ---------- */
  function mix(a, b, t) {
    var out = [1, 3, 5].map(function (i) {
      var x = parseInt(a.substr(i, 2), 16), y = parseInt(b.substr(i, 2), 16);
      return Math.round(x + (y - x) * t);
    });
    return 'rgb(' + out.join(',') + ')';
  }
  function R(x, y, w, h, fill, extra) {
    return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function ruin(x, w, h) {
    var pts = [[0, 0], [0, .6], [.2, .78], [.35, .5], [.55, .82], [.75, .55], [1, .72], [1, 0]].map(function (q) {
      return (x + q[0] * w).toFixed(1) + ',' + (150 - q[1] * h).toFixed(1);
    }).join(' ');
    return '<polygon points="' + pts + '" fill="#7a6c68"/>' +
      R(x + w * .2, 150 - h * .35, w * .18, h * .2, '#4a4144') + R(x + w * .6, 150 - h * .38, w * .18, h * .2, '#4a4144');
  }
  function house(x, w, h, door) {
    return R(x, 150 - h, w, h, '#efd6a6') + R(x - 2, 150 - h - 3, w + 4, 4, '#c79f68') +
      R(x + w * .4, 150 - h * .55, w * .2, h * .55, door) +
      R(x + w * .1, 150 - h * .72, w * .2, h * .25, '#ffe7a0', ' stroke="#b98d55"') +
      R(x + w * .7, 150 - h * .72, w * .2, h * .25, '#ffe7a0', ' stroke="#b98d55"');
  }
  function tall(x, w, h) {
    var s = R(x, 150 - h, w, h, '#e6d2b0') + R(x - 1.5, 150 - h - 3, w + 3, 4, '#bfa67c');
    for (var y = 150 - h + 8, r = 0; y < 138; y += 12, r++) {
      s += R(x + w * .16, y, w * .26, 6, r % 2 ? '#8fb6c9' : '#ffe7a0') + R(x + w * .58, y, w * .26, 6, r % 2 ? '#ffe7a0' : '#8fb6c9');
    }
    return s;
  }
  function lamp(x, lit) {
    return lit
      ? '<line x1="' + x + '" y1="150" x2="' + x + '" y2="126" stroke="#4a4144" stroke-width="2"/><circle cx="' + x + '" cy="124" r="9" fill="#ffe08a" opacity=".35"/><circle cx="' + x + '" cy="124" r="3.5" fill="#ffe08a"/>'
      : '<line x1="' + x + '" y1="150" x2="' + (x + 7) + '" y2="133" stroke="#5b5154" stroke-width="2"/>';
  }
  function palm(x) {
    var tx = x - 1, ty = 141, f = ['q-10-8-18 2', 'q10-8 18 2', 'q-6-12-14-9', 'q6-12 14-9', 'q0-10 2-14'];
    return '<path d="M' + x + ' 171q3-16-1-30" stroke="#8a6a45" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
      f.map(function (q) { return '<path d="M' + tx + ' ' + ty + q + '" stroke="#3f8f4f" stroke-width="3" fill="none" stroke-linecap="round"/>'; }).join('');
  }
  function person(x, c, k) {
    k = k || 1;
    return '<path d="M' + (x - 3 * k) + ' 173l' + 3 * k + ' ' + -10 * k + 'l' + 3 * k + ' ' + 10 * k + 'z" fill="' + c + '"/><circle cx="' + x + '" cy="' + (173 - 12 * k) + '" r="' + 2.4 * k + '" fill="#5a3b2a"/>';
  }
  function boat(x, y) {
    return '<path d="M' + (x - 14) + ' ' + y + 'h28l-5 6h-18z" fill="#6b4a2f"/><line x1="' + x + '" y1="' + y + '" x2="' + x + '" y2="' + (y - 22) + '" stroke="#4a3a2a" stroke-width="1.5"/>' +
      '<path d="M' + (x + 1) + ' ' + (y - 21) + 'l12 17h-12z" fill="#fff7e6"/>';
  }

  // n = how many steps are rebuilt; steps from index `from` up to n appear with a pop
  function city(n, from) {
    if (from === undefined) from = n;
    if (window.RKArt) return window.RKArt.street({ n: n, from: from, total: STEPS.length, bridge: S ? frac('bridge') : 0 });
    var p = n / STEPS.length, id = 'sky' + n + '_' + from;
    function on(i) { return i < n; }
    function g(i, s) { return '<g' + (i >= from && i < n ? ' class="pop"' : '') + '>' + s + '</g>'; }
    function swap(i, built, broken) { return on(i) ? g(i, built) : (broken || ''); }

    var h = '<svg viewBox="0 0 400 230" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + mix('#4a4654', '#58a6d8', p) + '"/><stop offset="1" stop-color="' + mix('#c4906a', '#ffe6b0', p) + '"/></linearGradient></defs>' +
      '<rect width="400" height="150" fill="url(#' + id + ')"/>' +
      '<circle cx="318" cy="' + (128 - 52 * p).toFixed(0) + '" r="22" fill="' + mix('#e9b377', '#ffe08a', p) + '"/>' +
      '<path d="M0 150V124l14-6v-10h12v14l10 4v-18l8-5 9 7v16h16v-12h10v-9l7 4v17h18v-22l12-4v-12h9v38h14v-14h12v14h20v-26l10 5v-13h12v34h16v-16l9-5v21h20v-30h8v-7h9v37h16v-12h14v12h18v-20l11 6v14H400v26z" fill="' + mix('#6e6064', '#a9bcc6', p) + '" opacity=".75"/>';

    // ground
    h += R(0, 150, 400, 28, mix('#a8937a', '#dcc394', p));
    // buildings
    h += swap(3, house(20, 46, 36, '#2f7f9f'), ruin(18, 50, 30));
    h += swap(11, R(82, 128, 26, 22, '#f3e6c8') + '<path d="M84 128a11 11 0 0 1 22 0z" fill="#2e8b84"/>' + R(108, 96, 6, 54, '#f3e6c8') +
      '<path d="M107 96h8l-4-9z" fill="#2e8b84"/><circle cx="111" cy="84" r="2" fill="#e8a23a"/>' + R(92, 138, 6, 12, '#7a5a3a'), ruin(80, 34, 22));
    h += swap(7, house(122, 42, 32, '#3f8f5a'), ruin(120, 46, 27));
    h += swap(15, tall(176, 34, 76), ruin(174, 38, 58));
    h += swap(13, R(222, 116, 58, 34, '#f0dcae') + R(220, 113, 62, 5, '#3d7ea6') +
      [0, 1, 2, 3].map(function (i) { return R(228 + i * 13, 125, 8, 9, '#bfe0ee'); }).join('') + R(246, 137, 9, 13, '#7a5a3a') +
      '<line x1="274" y1="113" x2="274" y2="92" stroke="#4a4144" stroke-width="1.5"/>' + R(274, 92, 14, 3, '#d21034') + R(274, 95, 14, 3, '#ffffff') + R(274, 98, 14, 3, '#1c1c1c') +
      '<polygon points="274,92 279.5,96.5 274,101" fill="#007229"/>', ruin(220, 62, 28));
    h += swap(20, tall(290, 32, 92), ruin(288, 36, 66));
    h += swap(18, house(332, 54, 34, '#b8623f') + R(330, 126, 58, 5, '#c4553b'), ruin(330, 58, 28));
    // lamps
    h += on(1) ? g(1, lamp(72, true)) : lamp(72, false);
    h += on(5) ? g(5, lamp(170, true)) : lamp(170, false);
    h += on(14) ? g(14, lamp(286, true) + lamp(388, true)) : lamp(286, false) + lamp(388, false);
    // riverbank
    if (on(12)) h += g(12, '<path d="M0 178v-9c40-4 70 3 110 0s80 3 130 0 90 3 160 0v9z" fill="#86b35f"/>');
    if (!on(0)) h += [[40, 170, 13], [135, 172, 10], [240, 169, 14], [355, 171, 11], [300, 173, 7], [95, 173, 6]].map(function (q) {
      return '<ellipse cx="' + q[0] + '" cy="' + q[1] + '" rx="' + q[2] + '" ry="' + (q[2] * .42).toFixed(1) + '" fill="#6f6462"/>';
    }).join('');
    if (on(2)) h += g(2, palm(108));
    if (on(9)) h += g(9, palm(214));
    if (on(19)) h += g(19, palm(322));
    if (on(4)) h += g(4, '<path d="M134 159a12 9 0 0 1 24 0z" fill="#c4553b"/><line x1="146" y1="159" x2="146" y2="173" stroke="#4a4144" stroke-width="1.5"/>' +
      R(150, 166, 11, 2, '#8a6a45') + R(151, 168, 1.5, 5, '#8a6a45') + R(158.5, 168, 1.5, 5, '#8a6a45') + '<circle cx="155" cy="164" r="2" fill="#555"/>' + person(140, '#e85d9a'));
    if (on(10)) h += g(10, R(244, 156, 1.5, 17, '#4a4144') + R(270.5, 156, 1.5, 17, '#4a4144') +
      [0, 1, 2, 3, 4].map(function (i) { return R(243 + i * 6, 153, 6, 5, i % 2 ? '#fff7e6' : '#c4553b'); }).join('') +
      R(247, 166, 22, 7, '#8a6a45') + '<circle cx="251" cy="165" r="2.2" fill="#e8a23a"/><circle cx="256" cy="165" r="2.2" fill="#3f8f4f"/><circle cx="261" cy="165" r="2.2" fill="#c4553b"/><circle cx="266" cy="165" r="2.2" fill="#e8a23a"/>');
    if (on(8)) h += g(8, person(40, '#2f6f9f') + person(47, '#d4783a') + person(53, '#8a4fa3', .7));
    if (on(17)) h += g(17, person(196, '#3f8f5a') + person(203, '#e8a23a') + person(302, '#2f6f9f') + person(350, '#e85d9a') + person(357, '#d4783a', .7));
    // the Nile, where the two rivers meet
    h += R(0, 178, 400, 52, mix('#4f6b73', '#2f8fa3', p)) +
      '<path d="M400 178H215c30 14 70 36 95 52h90z" fill="' + mix('#66776c', '#7fc0a8', p) + '" opacity=".55"/>' +
      '<path d="M0 186c40-4 70 4 110 0s80 4 130 0 90 4 160 0" stroke="#fff" stroke-opacity=".18" stroke-width="2" fill="none"/>' +
      '<path d="M0 212c50-4 80 4 130 0s90 4 140 0 80 4 130 0" stroke="#fff" stroke-opacity=".12" stroke-width="2" fill="none"/>';
    // the broken bridge (rebuilt with a savings goal later)
    var bf = S ? frac('bridge') : 0, bc = bf >= 1 ? '#d9c7a3' : '#5f5558';
    h += R(18, 195, 6, 35, '#5f5558') + R(126, 195, 6, 35, '#5f5558');
    if (bf >= .67) {
      h += R(0, 190, 154, 5, bc) + R(72, 195, 6, 35, '#5f5558');
      if (bf >= 1) h += '<path d="M0 190c26-20 52-20 77 0c26-20 52-20 77 0" stroke="#d9c7a3" stroke-width="2.5" fill="none"/>' +
        [20, 58, 96, 134].map(function (x) { return '<circle cx="' + x + '" cy="187" r="1.8" fill="#ffe08a"/>'; }).join('');
    } else {
      h += R(0, 190, bf >= .34 ? 82 : 58, 5, '#5f5558') + R(104, 190, 50, 5, '#5f5558');
      if (bf < .34) h += '<polygon points="58,190 76,203 74,207 58,195" fill="#5f5558"/>';
    }
    if (on(6)) h += g(6, boat(222, 200));
    if (on(16)) h += g(16, boat(335, 214));
    if (on(21)) h += g(21, [[120, 40], [142, 54], [250, 34]].map(function (q) {
      return '<path d="M' + q[0] + ' ' + q[1] + 'q4-4 8 0q4-4 8 0" stroke="#3b3340" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
    }).join(''));
    // smoke haze that lifts as the city comes back
    h += '<rect width="400" height="230" fill="#5d5050" opacity="' + (0.22 * (1 - p)).toFixed(2) + '"/>';
    return h + '</svg>';
  }

  function banner(caption, right) {
    return '<div class="banner">' + city(0) +
      '<div class="cap"><div><b>' + esc(caption) + '</b>' + esc(right || '') + '</div></div></div>';
  }

  function cityCard() {
    var n = stepsDone(), st = streak(), next = STEPS[n];
    var prev = n ? STEPS[n - 1].at : 0;
    var pct = next ? Math.min(100, ((S.bricks - prev) / (next.at - prev)) * 100) : 100;
    return '<div class="banner" data-act="journal">' + city(n) +
      '<button class="gear" data-act="settings" aria-label="Settings">⚙︎</button></div>' +
      '<button class="prog" data-act="journal">' +
      '<div class="prow"><span>🧱 <b>' + money(S.bricks) + '</b> bricks</span>' +
      '<span class="chip' + (st.thisWeek ? '' : ' dim') + '">🔥 ' + st.n + (st.n === 1 ? ' week' : ' weeks') + (st.fz ? ' · ❄️ ' + st.fz : '') + '</span></div>' +
      '<div class="bar thin"><i style="width:' + pct + '%"></i></div>' +
      '<div class="next">' + (next ? 'Next: ' + next.e + ' ' + esc(next.t) + ' · ' + money(next.at - S.bricks) + ' more' : 'Every piece so far is rebuilt. More is coming.') + '</div>' +
      '</button>';
  }

  // show what was just rebuilt (never while another sheet is open)
  function celebrate() {
    var n = stepsDone();
    if (n <= S.seen || sheetRoot.innerHTML) return;
    var from = S.seen, list = STEPS.slice(from, n);
    S.seen = n; save();
    sheetRoot.innerHTML = '<div class="scrim" data-act="close"><div class="sheet" data-stop="1">' +
      '<div class="top"><h2>🔨 Rebuilt!</h2><button class="x" data-act="close" aria-label="Close">✕</button></div>' +
      '<div class="banner" style="margin-top:12px">' + city(n, from) + '</div>' +
      '<div class="won">' + list.map(function (s) { return '<div><span>' + s.e + '</span>' + esc(s.t) + '</div>'; }).join('') + '</div>' +
      '<p class="keep">Nothing you rebuild is ever lost.</p>' +
      '<button class="primary" data-act="close">Keep building</button></div></div>';
  }

  function openJournal() {
    var n = stepsDone(), st = streak();
    var rows = STEPS.map(function (s, i) {
      if (i < n) return '<div class="jr done"><span>' + s.e + '</span>' + esc(s.t) + '<i>✓</i></div>';
      if (i === n) return '<div class="jr next"><span>' + s.e + '</span>' + esc(s.t) + '<i>' + money(s.at - S.bricks) + ' 🧱</i></div>';
      return '';
    }).join('');
    var later = STEPS.length - n - 1;
    sheetRoot.innerHTML = '<div class="scrim" data-act="close"><div class="sheet" data-stop="1">' +
      '<div class="top"><h2>Your city</h2><button class="x" data-act="close" aria-label="Close">✕</button></div>' +
      '<div class="banner" style="margin-top:12px">' + cityMap(n) + '</div>' +
      '<p class="keep">Khartoum from above, where the two Niles meet. Tap a landmark to open its goal.</p>' +
      '<p class="keep" style="text-align:left;margin-top:14px">You have <b>' + money(S.bricks) + ' bricks</b> and a <b>' + st.n + '-week streak</b>' +
      (st.fz ? ', with ' + st.fz + ' freeze pass' + (st.fz > 1 ? 'es' : '') : '') + '.</p>' +
      '<div class="how"><div><b>+' + B_SHOW + '</b>showing up each day</div><div><b>+' + B_LOG + '</b>each purchase you log</div><div><b>+' + B_UNDER + '</b>each day under your number</div></div>' +
      '<p class="keep" style="text-align:left">🔥 Your streak counts weeks. Log a purchase or tap “Nothing to log today” at least once in a week and it grows. Every 4 weeks you earn a ❄️ freeze pass that protects it if you miss a week.</p>' +
      rows + (later > 0 ? '<div class="jr">…and ' + later + ' more to discover</div>' : '') +
      '</div></div>';
  }

  /* ---------- setup screen ---------- */
  function renderSetup() {
    app.innerHTML =
      banner('Rebuild Khartoum', 'First, let’s get you to payday.') +
      '<div class="setup">' +
      '<h1>Bridge to Payday</h1>' +
      '<p>Three numbers, then you get one simple answer every day: how much you can spend today.</p>' +
      '<div class="field"><label for="f-bank">Money in your bank account</label>' +
      '<input id="f-bank" inputmode="decimal" placeholder="0" autocomplete="off"></div>' +
      '<div class="field"><label for="f-cash">Cash in your wallet</label>' +
      '<input id="f-cash" inputmode="decimal" placeholder="0" autocomplete="off"></div>' +
      '<div class="field"><label for="f-pay">Next payday</label>' +
      '<input id="f-pay" type="date" value="' + defaultPayday() + '">' +
      '<div class="hint">The day your salary arrives.</div></div>' +
      '<button class="primary" data-act="start">Show me my number</button>' +
      '<div class="private">🔒 Everything stays on this phone. Nothing is sent anywhere.</div>' +
      '</div>';
  }

  /* ---------- home ---------- */
  function renderHome() {
    var won = settle();
    var b = bridge(), t = today();
    if (!b.isPayday) S.allow[t] = b.allowance;
    save();
    var checked = !!S.checkins[t];
    var over = b.left < 0;
    var pct = b.allowance > 0 ? Math.min(100, (b.spent / b.allowance) * 100) : (b.spent > 0 ? 100 : 0);

    var hero;
    if (b.isPayday) {
      hero = '<div class="card hero"><div class="label">Payday</div>' +
        '<div class="num" style="font-size:44px;letter-spacing:-1px">You made it 🎉</div>' +
        '<div class="sub">The payday ritual arrives in an upcoming update. For now, open ⚙︎ to enter your new amounts and next payday.</div></div>';
    } else {
      var tom = '';
      if (b.tomorrow !== null) {
        tom = over
          ? '<div class="tomorrow">That’s okay. Tomorrow’s number adjusts to <b>' + money(Math.floor(b.tomorrow)) + '</b>.</div>'
          : '<div class="tomorrow">Spend nothing more today and tomorrow becomes <b>' + money(Math.floor(b.tomorrow)) + '</b>.</div>';
      }
      hero = '<div class="card hero">' +
        '<div class="label">' + (over ? 'Over today by' : 'You can spend today') + '</div>' +
        '<div class="num' + (over ? ' over' : '') + '">' + money(Math.floor(Math.abs(b.left))) + '<small>SAR</small></div>' +
        '<div class="sub">' + money(b.spent) + ' spent of ' + money(Math.floor(b.allowance)) + ' for today</div>' +
        '<div class="bar"><i class="' + (over ? 'over' : '') + '" style="width:' + pct + '%"></i></div>' +
        tom + '</div>';
    }

    var stats = '<div class="row3">' +
      '<div class="stat"><b>' + b.days + '</b><span>' + (b.days === 1 ? 'day' : 'days') + ' to payday</span></div>' +
      '<div class="stat"><b>' + money(bal('cash')) + '</b><span>cash</span></div>' +
      '<div class="stat"><b>' + money(bal('bank')) + '</b><span>bank</span></div></div>';

    var nothing = checked
      ? '<button class="nothing done" disabled>✓ You showed up today</button>'
      : '<button class="nothing" data-act="nothing">Nothing to log today</button>';

    app.innerHTML = cityCard() + hero + stats + nothing + goalsCard() + iouCard() + bankCard() + renderList() +
      '<button class="fab" data-act="log"><i>+</i> Log a purchase</button>';
    if (won) toast((won === 1 ? 'You stayed under your number' : won + ' days under your number') + ': +' + won * B_UNDER + ' 🧱');
    celebrate();
  }

  function renderList() {
    if (!S.tx.length) {
      return '<div class="card list"><h3>Your purchases</h3><div class="empty">Nothing yet. Tap “Log a purchase” whenever you pay for something.</div></div>';
    }
    var byDay = {}, days = [];
    S.tx.slice().sort(function (a, b) { return b.ts - a.ts; }).forEach(function (t) {
      if (!byDay[t.date]) { byDay[t.date] = []; days.push(t.date); }
      byDay[t.date].push(t);
    });
    days.sort().reverse();
    var h = '<div class="card list"><h3>Your purchases</h3>';
    days.slice(0, 14).forEach(function (d) {
      h += '<div class="daygroup"><div class="d"><span>' + niceDate(d) + '</span><span>' + money(spentOn(d)) + ' SAR</span></div>';
      byDay[d].forEach(function (t) {
        var c = CAT[t.cat] || CAT.other;
        h += '<button class="tx" data-act="tx" data-id="' + t.id + '">' +
          '<span class="em">' + c.e + '</span>' +
          '<span class="mid"><b>' + esc(t.note || c.n) + '</b><span>' + (t.note ? esc(c.n) + ' · ' : '') + (t.src === 'cash' ? 'Cash' : 'Card') + '</span></span>' +
          '<span class="amt">' + money(t.amt) + '</span></button>';
      });
      h += '</div>';
    });
    return h + '</div>';
  }

  /* ---------- log sheet ---------- */
  var draft = null;

  function openLog() {
    draft = { amt: '', src: S.lastSrc || 'cash', note: '', needNote: false, split: false };
    drawLog();
  }
  function drawLog() {
    var has = num(draft.amt) > 0;
    var h = '<div class="scrim" data-act="close"><div class="sheet" data-stop="1">' +
      '<div class="top"><h2>Log a purchase</h2><button class="x" data-act="close" aria-label="Close">✕</button></div>' +
      '<div class="amount' + (has ? '' : ' zero') + '">' + (draft.amt || '0') + '<small>SAR</small></div>' +
      '<div class="seg"><button data-src="cash" class="' + (draft.src === 'cash' ? 'on' : '') + '">💵 Cash</button>' +
      '<button data-src="bank" class="' + (draft.src === 'bank' ? 'on' : '') + '">💳 Card</button></div>' +
      '<input class="note' + (draft.needNote ? ' need' : '') + '" id="note" maxlength="60" placeholder="' +
      (draft.needNote ? 'What was it? Then tap Other again' : 'Add a note (optional)') + '" value="' + esc(draft.note) + '">' +
      '<button class="splitbtn' + (draft.split ? ' on' : '') + '" data-act="split">' + (draft.split ? '✓ ' : '') + '👥 I paid it all, split it in 2 with my roommate' +
      (draft.split && has ? ' · my share ' + money(r2(num(draft.amt) / 2)) : '') + '</button>' +
      '<div class="step">' + (has ? 'Tap a category to save' : 'Type the amount') + '</div>' +
      '<div class="cats' + (has ? '' : ' off') + '">' +
      CATS.map(function (c) { return '<button class="cat" data-cat="' + c.id + '"><span class="e">' + c.e + '</span><span class="n">' + c.n + '</span></button>'; }).join('') +
      '</div>' +
      '<div class="pad">' +
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(function (k) { return '<button data-key="' + k + '">' + k + '</button>'; }).join('') +
      '</div></div></div>';
    sheetRoot.innerHTML = h;
    var noteEl = document.getElementById('note');
    noteEl.oninput = function () { draft.note = noteEl.value; };
    if (draft.needNote) noteEl.focus();
  }
  function pressKey(k) {
    var a = draft.amt;
    if (k === '⌫') a = a.slice(0, -1);
    else if (k === '.') { if (a.indexOf('.') < 0) a = (a || '0') + '.'; }
    else {
      var dot = a.indexOf('.');
      if (dot >= 0 && a.length - dot > 2) return;
      if (dot < 0 && a.length >= 6) return;
      a = a === '0' ? k : a + k;
    }
    draft.amt = a;
    drawLog();
  }
  function saveTx(catId) {
    var amt = num(draft.amt);
    if (!(amt > 0)) return;
    var note = draft.note.trim();
    if (catId === 'other' && !note) { draft.needNote = true; drawLog(); return; }
    var t = today();
    var tx = { id: uid(), date: t, ts: Date.now(), amt: amt, cat: catId, src: draft.src, note: note };
    var extra = null;
    if (draft.split) {
      // only my half is my spending; the other half left my wallet and is owed back
      var theirs = r2(amt / 2);
      tx.amt = r2(amt - theirs);
      extra = { move: { id: uid(), date: t, src: draft.src, amt: -theirs, why: 'split' }, iou: { id: uid(), date: t, who: 'Roommate', amt: theirs, dir: 'owed', note: note || CAT[catId].n } };
      S.moves.push(extra.move); S.iou.push(extra.iou);
    }
    S.tx.push(tx);
    S.lastSrc = draft.src;
    var got = B_LOG + checkin();
    S.bricks += B_LOG;
    save();
    closeSheet();
    renderHome();
    var b = bridge();
    var msg = 'Logged ✓ +' + got + ' 🧱' + (b.isPayday ? '' : (b.left >= 0 ? ' · ' + money(Math.floor(b.left)) + ' left today' : ' · tomorrow adjusts'));
    toast(msg, function () {
      S.tx = S.tx.filter(function (x) { return x.id !== tx.id; });
      if (extra) {
        S.moves = S.moves.filter(function (x) { return x.id !== extra.move.id; });
        S.iou = S.iou.filter(function (x) { return x.id !== extra.iou.id; });
      }
      S.bricks = Math.max(S.seen ? STEPS[S.seen - 1].at : 0, S.bricks - B_LOG);
      save(); renderHome();
    });
  }

  /* ---------- entry detail sheet ---------- */
  function openTx(id) {
    var t = S.tx.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    var c = CAT[t.cat] || CAT.other;
    sheetRoot.innerHTML = '<div class="scrim" data-act="close"><div class="sheet" data-stop="1">' +
      '<div class="top"><h2>' + c.e + ' ' + esc(t.note || c.n) + '</h2><button class="x" data-act="close" aria-label="Close">✕</button></div>' +
      '<div class="amount">' + money(t.amt) + '<small>SAR</small></div>' +
      '<p style="text-align:center;color:var(--muted);margin:0">' + esc(c.n) + ' · ' + (t.src === 'cash' ? 'Cash' : 'Card') + ' · ' + niceDate(t.date) + '</p>' +
      '<button class="ghost danger" data-act="del" data-id="' + t.id + '">Delete this purchase</button>' +
      '<button class="ghost" data-act="close">Keep it</button>' +
      '</div></div>';
  }

  /* ---------- settings sheet ---------- */
  function openSettings() {
    sheetRoot.innerHTML = '<div class="scrim" data-act="close"><div class="sheet" data-stop="1">' +
      '<div class="top"><h2>Fix my numbers</h2><button class="x" data-act="close" aria-label="Close">✕</button></div>' +
      '<p style="color:var(--muted);margin:8px 0 0">If the app and real life don’t match, type what you actually have right now.</p>' +
      '<div class="field"><label for="s-bank">Money in your bank account</label><input id="s-bank" inputmode="decimal" value="' + money(bal('bank')).replace(/,/g, '') + '"></div>' +
      '<div class="field"><label for="s-cash">Cash in your wallet</label><input id="s-cash" inputmode="decimal" value="' + money(bal('cash')).replace(/,/g, '') + '"></div>' +
      '<div class="field"><label for="s-pay">Next payday</label><input id="s-pay" type="date" value="' + S.payday + '"></div>' +
      '<button class="primary" data-act="savesettings">Save</button>' +
      '<button class="ghost danger" data-act="reset">Erase everything and start over</button>' +
      '<div class="private">🔒 Everything stays on this phone.</div>' +
      '</div></div>';
  }

  /* ---------- savings goals and the envelope ---------- */
  var KINDS = {
    bridge: { e: '🌉', n: 'Bridge', hint: 'e.g. Emergency fund' },
    airport: { e: '✈️', n: 'Airport', hint: 'e.g. Visa or travel' },
    library: { e: '📚', n: 'Public library', hint: 'e.g. Rent' },
    garden: { e: '🌳', n: 'Nile garden', hint: 'Anything else' }
  };
  var B_PER_SAVED = 10; // 1 brick for every 10 SAR put in the envelope

  function goalById(id) { return S.goals.filter(function (g) { return g.id === id; })[0]; }
  function goalByKind(k) { return S.goals.filter(function (g) { return g.kind === k; })[0]; }
  function saved(id) { return r2(S.vault.reduce(function (a, v) { return v.goal === id ? a + v.amt : a; }, 0)); }
  function envelope() { return r2(S.vault.reduce(function (a, v) { return a + v.amt; }, 0)); }
  // how far a landmark is built: uses the most ever saved, so borrowing never knocks it down
  function frac(kind) {
    var g = goalByKind(kind);
    return g && g.target > 0 ? Math.min(1, (g.peak || 0) / g.target) : 0;
  }
  function borrowed(g) { return Math.max(0, r2((g.peak || 0) - saved(g.id) - (g.used || 0))); }
  function sheet(title, body) {
    sheetRoot.innerHTML = '<div class="scrim" data-act="close"><div class="sheet" data-stop="1">' +
      '<div class="top"><h2>' + title + '</h2><button class="x" data-act="close" aria-label="Close">✕</button></div>' + body + '</div></div>';
  }
  function opts(name, list, picked) {
    return '<div class="opts">' + list.map(function (o) {
      return '<label><input type="radio" name="' + name + '" value="' + o[0] + '"' + (o[0] === picked ? ' checked' : '') + (o[2] ? ' disabled' : '') + '><span>' + o[1] + '</span></label>';
    }).join('') + '</div>';
  }

  function goalsCard() {
    var h = '<div class="card list"><div class="ghead"><h3>Savings goals</h3>' +
      (S.goals.length ? '<span>✉️ ' + money(envelope()) + ' in the envelope</span>' : '') + '</div>';
    if (!S.goals.length) {
      h += '<div class="empty">Each goal rebuilds a landmark in Khartoum: the bridge, the airport, the public library.</div>';
    }
    S.goals.forEach(function (g) {
      var s = saved(g.id), pct = g.target > 0 ? Math.min(100, (s / g.target) * 100) : 0;
      h += '<button class="tx" data-act="goal" data-id="' + g.id + '"><span class="em">' + KINDS[g.kind].e + '</span>' +
        '<span class="mid"><b>' + esc(g.name) + '</b><span class="bar thin" style="display:block"><i style="width:' + pct + '%"></i></span>' +
        '<span>' + money(s) + ' of ' + money(g.target) + ' · ' + Math.floor(pct) + '%</span></span></button>';
    });
    if (S.goals.length < 4) h += '<button class="ghost" data-act="goaledit">+ Add a goal</button>';
    return h + '</div>';
  }

  function openGoalEdit(id, kind) {
    var g = id ? goalById(id) : null;
    var taken = {};
    S.goals.forEach(function (x) { if (!g || x.id !== g.id) taken[x.kind] = true; });
    var pick = g ? g.kind : (kind && !taken[kind] ? kind : Object.keys(KINDS).filter(function (k) { return !taken[k]; })[0]);
    sheet(g ? 'Edit goal' : 'New goal',
      '<div class="field"><label>Which landmark does it rebuild?</label>' +
      opts('gk', Object.keys(KINDS).map(function (k) { return [k, KINDS[k].e + ' ' + KINDS[k].n + (taken[k] ? ' (used)' : ''), taken[k]]; }), pick) + '</div>' +
      '<div class="field"><label for="g-name">What are you saving for?</label><input id="g-name" maxlength="30" placeholder="' + KINDS[pick].hint + '" value="' + esc(g ? g.name : '') + '"></div>' +
      '<div class="field"><label for="g-target">How much? (SAR)</label><input id="g-target" inputmode="decimal" placeholder="0" value="' + (g ? g.target : '') + '"></div>' +
      '<div class="field"><label for="g-due">By when? (optional)</label><input id="g-due" type="date" value="' + (g && g.due ? g.due : '') + '"></div>' +
      '<button class="primary" data-act="goalsave" data-id="' + (g ? g.id : '') + '">Save goal</button>' +
      (g ? '<button class="ghost danger" data-act="goaldel" data-id="' + g.id + '">Delete this goal</button>' : ''));
  }
  function saveGoal(id) {
    var name = val('g-name').trim(), target = num(val('g-target')), kind = radio('gk'), due = val('g-due');
    if (!kind) { toast('Pick a landmark'); return; }
    if (!name) { toast('Give the goal a name'); return; }
    if (!(target > 0)) { toast('Type how much you need'); return; }
    var g = id ? goalById(id) : null;
    if (g) { g.name = name; g.target = target; g.kind = kind; g.due = due; }
    else S.goals.push({ id: uid(), name: name, target: target, kind: kind, due: due, peak: 0, used: 0 });
    save(); closeSheet(); renderHome(); toast('Goal saved ✓');
  }

  function openGoal(id) {
    var g = goalById(id);
    if (!g) return;
    var s = saved(id), left = Math.max(0, r2(g.target - s)), pct = Math.min(100, (s / g.target) * 100), bor = borrowed(g);
    var plan = '';
    if (left > 0 && g.due && g.due > today()) {
      var months = Math.max(1, Math.ceil(daysBetween(today(), g.due) / 30.4));
      plan = '<p class="keep">About <b>' + money(Math.ceil(left / months)) + ' SAR a month</b> gets you there by ' +
        parse(g.due).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + '.</p>';
    } else if (left <= 0) plan = '<p class="keep"><b>Goal reached 🎉</b> The ' + KINDS[g.kind].n.toLowerCase() + ' is fully rebuilt.</p>';
    var hist = S.vault.filter(function (v) { return v.goal === id; }).slice(-6).reverse().map(function (v) {
      return '<div class="jr"><span>' + (v.amt > 0 ? '➕' : '➖') + '</span>' + niceDate(v.date) +
        (v.why === 'borrow' ? ' · borrowed' : v.why === 'used' ? ' · used for the goal' : '') + '<i>' + money(Math.abs(v.amt)) + '</i></div>';
    }).join('');
    sheet(KINDS[g.kind].e + ' ' + esc(g.name),
      '<div class="amount">' + money(s) + '<small>of ' + money(g.target) + '</small></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' + plan +
      (bor > 0 ? '<p class="keep">You borrowed <b>' + money(bor) + '</b> from this goal. Put it back when you can. The ' + KINDS[g.kind].n.toLowerCase() + ' stays standing.</p>' : '') +
      '<button class="primary" data-act="dep" data-id="' + id + '">✉️ Put money in the envelope</button>' +
      (s > 0 ? '<button class="ghost" data-act="wd" data-id="' + id + '">Take money out</button>' : '') +
      '<button class="ghost" data-act="goaledit" data-id="' + id + '">Edit goal</button>' + hist);
  }
  function openMove(id, dep) {
    var g = goalById(id);
    if (!g) return;
    sheet((dep ? 'Add to ' : 'Take from ') + esc(g.name),
      '<div class="field"><label for="m-amt">How much? (SAR)</label><input id="m-amt" inputmode="decimal" placeholder="0"></div>' +
      (dep
        ? '<div class="field"><label>Where is it coming from?</label>' + opts('m-src', [['cash', '💵 My cash (' + money(bal('cash')) + ')'], ['bank', '💳 My bank (' + money(bal('bank')) + ')']], 'cash') + '</div>'
        : '<div class="field"><label>Why?</label>' + opts('m-why', [['used', '🎯 I’m using it for this goal'], ['borrow', '🤝 I need it for something else (goes back to my cash)']], 'used') + '</div>') +
      '<button class="primary" data-act="movesave" data-id="' + id + '" data-dep="' + (dep ? 1 : 0) + '">' + (dep ? 'Put it in the envelope' : 'Take it out') + '</button>');
  }
  function saveMove(id, dep) {
    var g = goalById(id), amt = r2(num(val('m-amt'))), t = today();
    if (!g || !(amt > 0)) { toast('Type an amount'); return; }
    if (dep) {
      var src = radio('m-src') || 'cash', before = frac(g.kind);
      if (amt > bal(src)) { toast('You only have ' + money(Math.max(0, bal(src))) + ' in your ' + (src === 'cash' ? 'cash' : 'bank') + '. Fix it in ⚙︎ if that’s wrong.'); return; }
      S.vault.push({ id: uid(), date: t, goal: id, amt: amt });
      S.moves.push({ id: uid(), date: t, src: src, amt: -amt, why: 'envelope' });
      g.peak = Math.max(g.peak || 0, saved(id) + (g.used || 0));
      var got = Math.floor(amt / B_PER_SAVED) + checkin();
      S.bricks += Math.floor(amt / B_PER_SAVED);
      save(); closeSheet(); renderHome();
      if (!sheetRoot.innerHTML) toast(before < 1 && frac(g.kind) >= 1 ? '🎉 ' + g.name + ' is fully funded! +' + got + ' 🧱' : 'In the envelope ✓ +' + got + ' 🧱');
    } else {
      if (amt > saved(id)) { toast('There is only ' + money(saved(id)) + ' in this goal'); return; }
      var why = radio('m-why') || 'used';
      S.vault.push({ id: uid(), date: t, goal: id, amt: -amt, why: why });
      if (why === 'borrow') S.moves.push({ id: uid(), date: t, src: 'cash', amt: amt, why: 'borrow' });
      else g.used = r2((g.used || 0) + amt);
      save(); closeSheet(); renderHome();
      toast(why === 'borrow' ? 'Moved to your cash. Nothing in the city is lost.' : 'Used for ' + g.name + ' ✓');
    }
  }

  /* ---------- debts and the roommate list ---------- */
  function openIous() { return S.iou.filter(function (x) { return !x.done; }); }
  function iouCard() {
    var list = openIous();
    var h = '<div class="card list"><h3>Debts & roommate</h3>';
    if (!list.length) h += '<div class="empty">Nobody owes anybody right now.</div>';
    list.forEach(function (x) {
      h += '<button class="tx" data-act="iou" data-id="' + x.id + '"><span class="em">' + (x.dir === 'owe' ? '↗️' : '↙️') + '</span>' +
        '<span class="mid"><b>' + esc(x.who) + '</b><span>' + (x.dir === 'owe' ? 'You owe' : 'Owes you') +
        (x.note ? ' · ' + esc(x.note) : '') + (x.due ? ' · by ' + niceDate(x.due) : '') + '</span></span>' +
        '<span class="amt">' + money(x.amt) + '</span></button>';
    });
    return h + '<button class="ghost" data-act="iouadd">+ Add a debt or IOU</button></div>';
  }
  function openIouAdd() {
    sheet('Add a debt or IOU',
      '<div class="field">' + opts('i-dir', [['owe', '↗️ I owe someone'], ['owed', '↙️ Someone owes me']], 'owe') + '</div>' +
      '<div class="field"><label for="i-who">Who?</label><input id="i-who" maxlength="30" placeholder="Roommate"></div>' +
      '<div class="field"><label for="i-amt">How much? (SAR)</label><input id="i-amt" inputmode="decimal" placeholder="0"></div>' +
      '<div class="field"><label for="i-due">Due by (optional)</label><input id="i-due" type="date"></div>' +
      '<div class="field"><label for="i-cat">If you owe it: what is it for?</label><select id="i-cat"><option value="">A loan (not spending)</option>' +
      CATS.map(function (c) { return '<option value="' + c.id + '">My share of: ' + c.n + '</option>'; }).join('') + '</select>' +
      '<div class="hint">Pick a category when a roommate paid a bill and you owe your half. It counts as your spending when you pay it.</div></div>' +
      '<button class="primary" data-act="iousave">Save</button>');
  }
  function saveIou() {
    var amt = r2(num(val('i-amt'))), dir = radio('i-dir') || 'owe';
    if (!(amt > 0)) { toast('Type an amount'); return; }
    S.iou.push({ id: uid(), date: today(), who: val('i-who').trim() || 'Roommate', amt: amt, dir: dir, due: val('i-due'), cat: dir === 'owe' ? val('i-cat') : '' });
    save(); closeSheet(); renderHome(); toast('Saved ✓');
  }
  function openIou(id) {
    var x = S.iou.filter(function (i) { return i.id === id; })[0];
    if (!x) return;
    var owe = x.dir === 'owe';
    sheet(esc(x.who),
      '<div class="amount">' + money(x.amt) + '<small>SAR</small></div>' +
      '<p class="keep">' + (owe ? 'You owe this' : 'They owe you this') + (x.note ? ' · ' + esc(x.note) : '') + (x.due ? ' · by ' + niceDate(x.due) : '') + '</p>' +
      '<button class="primary" data-act="iousettle" data-id="' + id + '" data-w="cash">' + (owe ? 'I paid it back in cash' : 'They paid me in cash') + '</button>' +
      '<button class="ghost" data-act="iousettle" data-id="' + id + '" data-w="bank">' + (owe ? 'I paid it back by card or transfer' : 'They sent it to my bank') + '</button>' +
      '<button class="ghost danger" data-act="ioudel" data-id="' + id + '">Remove without changing my money</button>');
  }
  function settleIou(id, src) {
    var x = S.iou.filter(function (i) { return i.id === id; })[0], t = today();
    if (!x) return;
    if (x.dir === 'owed') S.moves.push({ id: uid(), date: t, src: src, amt: x.amt, why: 'paid back' });
    else if (x.cat) { S.tx.push({ id: uid(), date: t, ts: Date.now(), amt: x.amt, cat: x.cat, src: src, note: 'My share, paid to ' + x.who }); S.bricks += B_LOG; }
    else S.moves.push({ id: uid(), date: t, src: src, amt: -x.amt, why: 'debt' });
    x.done = true;
    checkin();
    save(); closeSheet(); renderHome();
    if (!sheetRoot.innerHTML) toast(x.dir === 'owe' ? 'Debt cleared ✓' : 'Paid back ✓');
  }

  /* ---------- Khartoum from above ---------- */
  function cityMap(n) {
    if (window.RKArt) {
      var gs = {};
      Object.keys(KINDS).forEach(function (k) {
        var gl = goalByKind(k);
        gs[k] = gl ? { id: gl.id, name: esc(gl.name.length > 14 ? gl.name.slice(0, 13) + '…' : gl.name), f: frac(k) } : null;
      });
      return window.RKArt.map({ n: n, total: STEPS.length, goals: gs });
    }
    var p = n / STEPS.length, i;
    function nileX(y) { return y <= 205 ? 175 - 25 * y / 205 : 150 - 55 * (y - 205) / 215; }
    var BP = [[150, 205], [200, 180], [260, 190], [320, 160], [400, 150]];
    function blueY(x) {
      if (x <= 150) return 205;
      for (var k = 1; k < BP.length; k++) if (x <= BP[k][0]) return BP[k - 1][1] + (BP[k][1] - BP[k - 1][1]) * (x - BP[k - 1][0]) / (BP[k][0] - BP[k - 1][0]);
      return 150;
    }
    // city blocks on the three banks, rebuilt outward from where the rivers meet
    var blocks = [];
    for (var x = 12; x < 390; x += 21) for (var y = 12; y < 400; y += 21) {
      var cx = x + 7.5, cy = y + 7.5, ok = false;
      if (cx < nileX(cy) - 27) ok = !(cx < 100 && cy > 282 && cy < 352);               // Omdurman (minus the garden)
      else if (cx > nileX(cy) + 27) {
        if (cy < blueY(cx) - 25) ok = true;                                              // Bahri
        else if (cy > blueY(cx) + 25) ok = !(cx > 284 && cy > 258) && !(cx > 176 && cx < 240 && cy > 234 && cy < 292); // Khartoum
      }
      if (ok) blocks.push([x, y, Math.pow(cx - 150, 2) + Math.pow(cy - 205, 2)]);
    }
    blocks.sort(function (a, b) { return a[2] - b[2]; });
    var built = Math.round(blocks.length * p), roofs = ['#e8c98f', '#d9a66b', '#f0dcae', '#cf9a6a'];

    var h = '<svg viewBox="0 0 400 412">' + R(0, 0, 400, 412, mix('#a39587', '#ecdcb6', p));
    blocks.forEach(function (b, k) {
      h += k < built
        ? R(b[0], b[1], 15, 15, roofs[(b[0] * 3 + b[1] * 7) % 4], ' rx="3"') + ((b[0] + b[1]) % 5 === 0 ? '<circle cx="' + (b[0] + 16) + '" cy="' + (b[1] + 16) + '" r="3" fill="#5fa052"/>' : '')
        : R(b[0] + 1, b[1] + 1, 13, 13, '#857a74', ' rx="1.5" opacity=".75"') + R(b[0] + 5, b[1] + 6, 5, 4, '#5d5452');
    });
    // the rivers: White Nile from the south, Blue Nile from the east, one Nile going north
    var white = mix('#7f8b86', '#a5d3c2', p), blue = mix('#5b7079', '#2f8fa3', p), main = mix('#687a7c', '#55a9ae', p);
    h += '<path d="M95 420L150 205" stroke="' + white + '" stroke-width="38" stroke-linecap="round" fill="none"/>' +
      '<path d="M150 205L200 180L260 190L320 160L405 150" stroke="' + blue + '" stroke-width="28" stroke-linejoin="round" stroke-linecap="round" fill="none"/>' +
      '<ellipse cx="197" cy="181" rx="34" ry="19" fill="' + blue + '"/>' +
      '<path d="M150 205L176 -8" stroke="' + main + '" stroke-width="34" stroke-linecap="round" fill="none"/>' +
      '<ellipse cx="197" cy="181" rx="21" ry="8.5" fill="' + mix('#8d8a78', '#9cc474', p) + '" transform="rotate(-10 197 181)"/>';
    function label(x, y, s) { return '<text x="' + x + '" y="' + y + '" font-size="9" font-weight="700" letter-spacing="2" fill="#2a2118" fill-opacity=".45" text-anchor="middle">' + s + '</text>'; }
    h += label(52, 108, 'OMDURMAN') + label(300, 60, 'BAHRI') + label(228, 398, 'KHARTOUM') +
      '<text x="197" y="183.5" font-size="6" font-weight="700" letter-spacing="1" fill="#2a2118" fill-opacity=".5" text-anchor="middle">TUTI</text>';

    function pill(x, y, kind) {
      var g = goalByKind(kind), s = g ? (g.name.length > 14 ? g.name.slice(0, 13) + '…' : g.name) + ' ' + Math.floor(frac(kind) * 100) + '%' : '+ ' + KINDS[kind].n;
      var w = s.length * 5.2 + 14;
      return R(x - w / 2, y - 9, w, 14, g ? '#fffaf1' : '#2a2118', ' rx="7" opacity=".92"') +
        '<text x="' + x + '" y="' + (y + 1.2) + '" font-size="8.5" font-weight="700" text-anchor="middle" fill="' + (g ? '#2a2118' : '#fff') + '">' + esc(s) + '</text>';
    }
    function mark(kind, hit, art, px, py) {
      var g = goalByKind(kind);
      return '<g data-act="' + (g ? 'goal' : 'goaledit') + '"' + (g ? ' data-id="' + g.id + '"' : ' data-kind="' + kind + '"') + ' style="cursor:pointer">' +
        R(hit[0], hit[1], hit[2], hit[3], '#000', ' opacity="0"') + art + pill(px, py, kind) + '</g>';
    }
    // bridge over the Blue Nile: the deck grows from both banks
    var f = frac('bridge'), L = 40, a = R(240, 164, 10, 6, '#5f5558') + R(240, 205, 10, 6, '#5f5558') +
      '<rect x="241.5" y="168" width="7" height="' + L + '" fill="none" stroke="#fff" stroke-opacity=".6" stroke-dasharray="3 3"/>';
    if (f > 0) a += R(240.5, 168, 9, L * f / 2, '#f6e7c3', ' stroke="#8a6a45" stroke-width=".8"') + R(240.5, 168 + L - L * f / 2, 9, L * f / 2, '#f6e7c3', ' stroke="#8a6a45" stroke-width=".8"');
    if (f >= 1) for (i = 0; i < 5; i++) a += '<circle cx="245" cy="' + (172 + i * 8) + '" r="1.3" fill="#ffe08a"/>';
    h += mark('bridge', [222, 140, 46, 80], a, 245, 151);
    // airport
    f = frac('airport');
    a = R(290, 264, 100, 130, '#000', ' rx="8" opacity=".07"');
    if (f < .25) a += R(356, 272, 14, 114, '#6b6163') + '<circle cx="363" cy="300" r="5" fill="#4a4144"/><circle cx="360" cy="342" r="4" fill="#4a4144"/><circle cx="366" cy="368" r="4.5" fill="#4a4144"/>';
    else { a += R(356, 272, 14, 114, '#55595e'); for (i = 0; i < 8; i++) a += R(362.3, 279 + i * 14, 1.4, 7, '#fff'); }
    if (f < .5) a += R(300, 300, 40, 24, '#857a74', ' rx="2"') + R(312, 308, 12, 8, '#5d5452');
    else a += R(340, 309, 16, 5, '#55595e') + R(300, 300, 40, 24, '#f4f1ea', ' rx="3"') + R(300, 309, 40, 5, '#3d7ea6');
    if (f >= .75) a += '<circle cx="328" cy="348" r="6.5" fill="#f4f1ea" stroke="#3d7ea6" stroke-width="2"/><circle cx="328" cy="348" r="2" fill="#3d7ea6"/>';
    if (f >= 1) a += '<path d="M363 316l2 8 9 6v3l-9-3-1 7 3 3v2l-4-1-4 1v-2l3-3-1-7-9 3v-3l9-6z" fill="#fff" stroke="#3d7ea6" stroke-width=".7"/>';
    h += mark('airport', [290, 264, 100, 130], a, 322, 284);
    // public library
    f = frac('library');
    if (f < .25) a = '<rect x="188" y="246" width="40" height="32" fill="none" stroke="#fff" stroke-opacity=".6" stroke-dasharray="3 3"/><ellipse cx="200" cy="266" rx="8" ry="4" fill="#6f6462"/><ellipse cx="216" cy="258" rx="6" ry="3" fill="#6f6462"/>';
    else {
      a = R(188, 246, 40, 32, '#b9a184', ' stroke="#c79f68" stroke-width="3"');
      if (f >= .5) a += R(188, 246, f >= .75 ? 40 : 20, 32, '#c4553b');
      if (f >= .75) a += R(202, 256, 12, 12, '#86b35f');
      if (f >= 1) a += '<circle cx="183" cy="250" r="4" fill="#5fa052"/><circle cx="183" cy="274" r="4" fill="#5fa052"/><circle cx="233" cy="262" r="4" fill="#5fa052"/><text x="208" y="265.5" font-size="8" text-anchor="middle">📚</text>';
    }
    h += mark('library', [180, 238, 56, 48], a, 208, 240);
    // Nile garden (only shown once that goal exists)
    if (goalByKind('garden')) {
      f = frac('garden');
      a = '<ellipse cx="60" cy="318" rx="36" ry="30" fill="#000" opacity=".07"/>';
      for (i = 0; i < Math.round(f * 9); i++) a += '<circle cx="' + (38 + (i % 3) * 22) + '" cy="' + (298 + Math.floor(i / 3) * 20) + '" r="7" fill="#5fa052"/>';
      h += mark('garden', [24, 286, 74, 64], a, 60, 290);
    }
    return h + '<rect width="400" height="412" fill="#5d5050" opacity="' + (0.18 * (1 - p)).toFixed(2) + '" pointer-events="none"/></svg>';
  }

  /* ---------- bank statement import ---------- */
  var AUTO = [
    [/metro|\bbus\b|uber|careem|bolt|jeeny|taxi|fuel|petrol|aldrees|sasco/i, 'transport'],
    [/pharm|hospital|clinic|medical|nahdi|dawaa|dental/i, 'care'],
    [/netflix|spotify|adobe|capcut|godaddy|anthropic|claude|openai|apple com|google|youtube|microsoft|minecraft|mojang|icloud|mobily|zain/i, 'subs'],
    [/panda|othaim|tamimi|danube|lulu|carrefour|bakery|supermarket|grocery|baqala|laundry|tawfir/i, 'groceries'],
    [/restaurant|cafe|coffee|kitchen|burger|pizza|shawarma|mcdonald|kfc|albaik|herfy|kudu|starbucks|dunkin|hungerstation|jahez|keeta|broast/i, 'eat'],
    [/jarir|noon|amazon|shein|ikea|zara|centrepoint/i, 'shop']
  ];
  var KIND = {
    salary: '💵 Salary', freelance: '🎨 Freelance', roommate: '🏠 Roommate paid me back',
    own: '🔁 My own money, just moved', notmine: '🚫 Not mine (passing through)', goal: '🎯 Paid for a savings goal (like rent)'
  };
  function near(a, b) { return Math.abs(a - b) < 0.006; }
  function ruleKey(r) {
    if (r.type === 'online') return '';
    if (r.who) return 'w:' + r.who.toLowerCase();
    return r.type === 'transfer' && r.arabic ? 'a:' + (r.amt > 0 ? '+' : '-') + r.arabic : '';
  }
  function guess(r) {
    if (r.type === 'deposit' || r.type === 'atm') return { t: 'kind', v: 'own' };
    var k = ruleKey(r);
    if (k && S.rules[k]) return S.rules[k];
    if (r.amt < 0 && r.type === 'card' && r.who) {
      for (var i = 0; i < AUTO.length; i++) if (AUTO[i][0].test(r.who)) return { t: 'cat', v: AUTO[i][1] };
    }
    return null;
  }
  function rowTitle(r) {
    return r.who || (r.type === 'online' ? 'Online purchase' : r.type === 'transfer' ? (r.amt > 0 ? 'Transfer in' : 'Transfer out') : r.type === 'deposit' ? 'Cash deposit' : r.type === 'atm' ? 'Cash withdrawal' : 'Bank transaction');
  }
  // put one bank line where it belongs
  function place(r, dec) {
    if (dec.t === 'cat') {
      S.tx.push({ id: uid(), date: r.date, ts: parse(r.date).getTime() + 432e5, amt: Math.abs(r.amt), cat: dec.v, src: 'bank', note: rowTitle(r), bank: true, key: r.key });
    } else {
      S.inc.push({ id: uid(), date: r.date, amt: r.amt, kind: dec.v, who: rowTitle(r), key: r.key });
      // cash that went into or came out of the bank changes the wallet too
      if (dec.v === 'own' && r.date >= S.created && (r.type === 'deposit' || r.type === 'atm')) {
        S.moves.push({ id: uid(), date: r.date, src: 'cash', amt: -r.amt, why: r.type });
      }
    }
  }
  function decide(r, dec, byUser) {
    if (!r) return;
    var k = ruleKey(r);
    S.pending = S.pending.filter(function (x) { return x.key !== r.key; });
    place(r, dec);
    if (byUser) {
      S.bricks += 1;
      if (k) {
        S.rules[k] = dec;
        // the same shop or person elsewhere in the pile sorts itself
        S.pending.filter(function (x) { return ruleKey(x) === k; }).forEach(function (x) {
          S.pending = S.pending.filter(function (y) { return y.key !== x.key; });
          place(x, dec);
        });
      }
      save();
      openSort();
    }
  }
  function importPdf(file) {
    if (!window.RKImport) { toast('Import is still loading. Try again in a moment.'); return; }
    toast('Reading your statement…');
    var fr = new FileReader();
    fr.onerror = function () { toast('Could not open that file.'); };
    fr.onload = function () {
      window.RKImport.parse(fr.result).then(function (res) { finishImport(res); }).catch(function (e) {
        toast(e && e.message === 'offline' ? 'You need internet the first time you import.' : 'Could not read this file. Is it the Alinma statement PDF?');
      });
    };
    fr.readAsArrayBuffer(file);
  }
  function finishImport(res) {
    var fresh = res.rows.filter(function (r) { return !S.seenBank[r.key]; });
    var auto = 0;
    toastEl.classList.remove('show');
    fresh.forEach(function (r) {
      S.seenBank[r.key] = 1;
      // a card purchase you already logged by hand: keep yours, don't count it twice
      var mine = r.amt < 0 && S.tx.filter(function (t) { return t.src === 'bank' && !t.bank && t.date === r.date && near(t.amt, -r.amt); })[0];
      if (mine) { mine.bank = true; mine.key = r.key; auto++; return; }
      var g = guess(r);
      if (g) { place(r, g); auto++; } else S.pending.push(r);
    });
    // the statement's closing balance is the truth for the bank wallet
    if (!S.lastBank || res.last >= S.lastBank) {
      S.lastBank = res.last;
      var manualAfter = S.tx.reduce(function (a, t) { return t.src === 'bank' && !t.bank && t.date > res.last ? a + t.amt : a; }, 0);
      var movedAfter = S.moves.reduce(function (a, m) { return m.src === 'bank' && m.date > res.last ? a + m.amt : a; }, 0);
      S.start.bank = res.closing - manualAfter + movedAfter + spentFrom('bank') - moved('bank');
    }
    var got = 0;
    if (fresh.length) { got = 20 + checkin(); S.bricks += 20; }
    save(); renderHome();
    var ins = res.rows.filter(function (r) { return r.amt > 0; }).length;
    sheet('Statement read ✓',
      '<p class="keep" style="text-align:left">Found <b>' + res.rows.length + ' transactions</b> (' + ins + ' in, ' + (res.rows.length - ins) + ' out), ending ' + niceDate(res.last) +
      ' with <b>' + money(res.closing) + ' SAR</b> in the bank. Check that against the first page of your statement.</p>' +
      '<div class="how"><div><b>' + fresh.length + '</b>new</div><div><b>' + auto + '</b>sorted for you</div><div><b>' + S.pending.length + '</b>need you</div></div>' +
      (res.unsure ? '<p class="keep" style="text-align:left">⚠️ ' + res.unsure + ' lines did not add up cleanly. Please double-check them.</p>' : '') +
      (got ? '<p class="keep">+' + got + ' 🧱 for importing</p>' : '<p class="keep">Nothing new in this file. You’re up to date.</p>') +
      (S.pending.length ? '<button class="primary" data-act="sort">Sort ' + S.pending.length + ' now</button><button class="ghost" data-act="close">Later</button>' : '<button class="primary" data-act="close">Done</button>'));
  }
  function bankCard() {
    return '<div class="card list"><h3>Bank statement</h3>' +
      (S.pending.length
        ? '<button class="primary" style="margin-top:10px" data-act="sort">Sort ' + S.pending.length + ' bank transaction' + (S.pending.length > 1 ? 's' : '') + '</button>'
        : '<div class="empty">' + (S.lastBank ? 'Imported up to ' + niceDate(S.lastBank) + '. ' : '') + 'Download your statement PDF from the Alinma app, then import it here once a week. Card purchases sort themselves.</div>') +
      '<label class="ghost filebtn">Import Alinma statement (PDF)<input type="file" id="pdf-in" accept="application/pdf,.pdf" hidden></label>' +
      '<div class="private" style="margin-top:8px">🔒 The file is read on this phone and never uploaded.</div></div>';
  }
  function openSort() {
    var r = S.pending[0];
    if (!r) { closeSheet(); renderHome(); toast('All sorted ✓'); return; }
    var inn = r.amt > 0, body =
      '<div class="amount" style="color:' + (inn ? 'var(--good)' : 'var(--ink)') + '">' + (inn ? '+' : '−') + money(Math.abs(r.amt)) + '<small>SAR</small></div>' +
      '<p class="keep"><b>' + esc(rowTitle(r)) + '</b> · ' + niceDate(r.date) + '</p>' +
      (r.who ? '' : '<p class="keep" dir="auto" style="font-size:12px">' + esc(r.arabic.slice(0, 110)) + '</p>') +
      '<div class="step" style="margin-top:14px">' + (inn ? 'What is this money?' : 'What was it for?') + '</div>';
    if (inn) {
      body += ['salary', 'freelance', 'roommate', 'own', 'notmine'].map(function (k) { return '<button class="ghost pick" data-act="sortkind" data-v="' + k + '">' + KIND[k] + '</button>'; }).join('');
    } else {
      body += '<div class="cats">' + CATS.map(function (c) { return '<button class="cat" data-act="sortcat" data-v="' + c.id + '"><span class="e">' + c.e + '</span><span class="n">' + c.n + '</span></button>'; }).join('') + '</div>' +
        ['notmine', 'own', 'goal'].map(function (k) { return '<button class="ghost pick" data-act="sortkind" data-v="' + k + '">' + KIND[k] + '</button>'; }).join('');
    }
    body += (ruleKey(r) ? '<p class="keep" style="font-size:12px">I’ll remember your answer for next time.</p>' : '') +
      (S.pending.length > 1 ? '<button class="ghost" data-act="sortskip" style="border:0;color:var(--muted)">Skip this one for now</button>' : '');
    sheet('Sort · ' + S.pending.length + ' left', body);
  }

  function closeSheet() { sheetRoot.innerHTML = ''; draft = null; }

  /* ---------- events ---------- */
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-key],[data-cat],[data-src],[data-act]');
    if (!el) return;
    if (el.dataset.key) return pressKey(el.dataset.key);
    if (el.dataset.cat) return saveTx(el.dataset.cat);
    if (el.dataset.src) { draft.src = el.dataset.src; return drawLog(); }

    var act = el.dataset.act;
    if (act === 'close') {
      // tapping inside the sheet must not close it
      if (el.classList.contains('scrim') && ev.target.closest('[data-stop]')) return;
      return closeSheet();
    }
    if (act === 'start') {
      var pay = document.getElementById('f-pay').value;
      if (!pay || pay <= today()) { toast('Pick a payday after today'); return; }
      S = {
        v: 2, payday: pay, tx: [], checkins: {}, lastSrc: 'cash', bricks: 0, seen: 0, allow: {}, settled: {},
        start: { bank: num(document.getElementById('f-bank').value), cash: num(document.getElementById('f-cash').value) }
      };
      ensure();
      checkin();
      save(); renderHome();
      return;
    }
    if (act === 'split') { draft.split = !draft.split; return drawLog(); }
    if (act === 'goal') return openGoal(el.dataset.id);
    if (act === 'goaledit') return openGoalEdit(el.dataset.id, el.dataset.kind);
    if (act === 'goalsave') return saveGoal(el.dataset.id);
    if (act === 'goaldel') {
      if (!el.dataset.sure) { el.dataset.sure = '1'; el.textContent = 'Tap again to delete this goal'; return; }
      S.goals = S.goals.filter(function (g) { return g.id !== el.dataset.id; });
      save(); closeSheet(); renderHome(); return;
    }
    if (act === 'dep') return openMove(el.dataset.id, true);
    if (act === 'wd') return openMove(el.dataset.id, false);
    if (act === 'movesave') return saveMove(el.dataset.id, el.dataset.dep === '1');
    if (act === 'sort') return openSort();
    if (act === 'sortcat') return decide(S.pending[0], { t: 'cat', v: el.dataset.v }, true);
    if (act === 'sortkind') return decide(S.pending[0], { t: 'kind', v: el.dataset.v }, true);
    if (act === 'sortskip') { S.pending.push(S.pending.shift()); save(); return openSort(); }
    if (act === 'iouadd') return openIouAdd();
    if (act === 'iousave') return saveIou();
    if (act === 'iou') return openIou(el.dataset.id);
    if (act === 'iousettle') return settleIou(el.dataset.id, el.dataset.w);
    if (act === 'ioudel') {
      S.iou = S.iou.filter(function (x) { return x.id !== el.dataset.id; });
      save(); closeSheet(); renderHome(); return;
    }
    if (act === 'log') return openLog();
    if (act === 'journal') return openJournal();
    if (act === 'nothing') { var gotN = checkin(); save(); renderHome(); if (!sheetRoot.innerHTML) toast('Showed up ✓ +' + gotN + ' 🧱 That counts.'); return; }
    if (act === 'tx') return openTx(el.dataset.id);
    if (act === 'del') {
      var id = el.dataset.id, old = S.tx.slice();
      S.tx = S.tx.filter(function (x) { return x.id !== id; });
      save(); closeSheet(); renderHome();
      toast('Deleted', function () { S.tx = old; save(); renderHome(); });
      return;
    }
    if (act === 'settings') return openSettings();
    if (act === 'savesettings') {
      var p = document.getElementById('s-pay').value;
      if (!p) { toast('Pick a payday'); return; }
      S.start.bank = num(document.getElementById('s-bank').value) + spentFrom('bank') - moved('bank');
      S.start.cash = num(document.getElementById('s-cash').value) + spentFrom('cash') - moved('cash');
      S.payday = p;
      save(); closeSheet(); renderHome(); toast('Saved ✓');
      return;
    }
    if (act === 'reset') {
      if (el.dataset.sure) {
        try { localStorage.removeItem(KEY); } catch (e) {}
        S = null; closeSheet(); renderSetup();
      } else {
        el.dataset.sure = '1';
        el.textContent = 'Tap again to erase everything';
      }
    }
  });

  document.addEventListener('change', function (ev) {
    if (ev.target.id === 'pdf-in' && ev.target.files && ev.target.files[0]) { importPdf(ev.target.files[0]); ev.target.value = ''; }
  });

  // refresh the number when the app is reopened on a new day
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && S && !draft && !sheetRoot.innerHTML) renderHome();
  });

  /* ---------- start ---------- */
  if (S && S.start && S.tx) {
    // older saves: award bricks for what was already done, so nothing is lost
    if (S.bricks === undefined) {
      S.bricks = B_LOG * S.tx.length + B_SHOW * Object.keys(S.checkins).length;
      S.seen = 0; S.allow = {}; S.settled = {}; S.v = 2;
    }
    ensure();
    renderHome();
  } else { S = null; renderSetup(); }

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
