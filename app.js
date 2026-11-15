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
    if (!S.weekly) S.weekly = {};
    if (!S.under) S.under = {};
    if (!S.treats) S.treats = [];
    if (!S.treatKeys) S.treatKeys = {};
    if (S.treatPot === undefined) S.treatPot = 50; // the pot starts with one month's worth
    if (!S.treatReady) S.treatReady = 0;
    if (!S.rituals) S.rituals = 0;
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
    // the salary can land a day or two early or late: if the expected day has come, plan for two more days
    var gap = daysBetween(t, S.payday), days = gap >= 1 ? gap : 2;
    var total = bal('cash') + bal('bank');
    var spent = spentOn(t);
    var allowance = Math.max(0, (total + spent) / days);
    return {
      days: days, total: total, spent: spent, allowance: allowance,
      left: allowance - spent,
      tomorrow: days > 1 ? Math.max(0, total) / (days - 1) : null,
      isPayday: false, near: gap <= 2, late: gap < 0, gap: gap
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
    { at: 10, e: '🌿', t: 'Tuti Island’s farms turn green' },
    { at: 25, e: '🏙️', t: 'Lights return to Al-Mogran' },
    { at: 45, e: '🏬', t: 'Downtown and Souq al-Arabi rebuilt' },
    { at: 70, e: '🛣️', t: 'Nile Street is lit again' },
    { at: 100, e: '🏘️', t: 'Al-Mulazimin rebuilt in Omdurman' },
    { at: 135, e: '⛵', t: 'Boats return to the Nile' },
    { at: 175, e: '🏘️', t: 'Abu Rof rebuilt' },
    { at: 220, e: '🏘️', t: 'Burri rebuilt' },
    { at: 270, e: '🧺', t: 'Souq Omdurman reopens' },
    { at: 325, e: '🏘️', t: 'Khartoum 2 rebuilt' },
    { at: 385, e: '🌴', t: 'Shambat rebuilt in Bahri' },
    { at: 450, e: '🏘️', t: 'Al-Amarat rebuilt' },
    { at: 520, e: '🏘️', t: 'Wad Nubawi rebuilt' },
    { at: 600, e: '🏘️', t: 'Kober rebuilt' },
    { at: 690, e: '🏘️', t: 'Riyadh rebuilt' },
    { at: 790, e: '🏘️', t: 'Al-Thawra rebuilt' },
    { at: 900, e: '🏘️', t: 'Kafouri rebuilt' },
    { at: 1020, e: '🏘️', t: 'Al-Sahafa rebuilt' },
    { at: 1150, e: '🏘️', t: 'Umbadda rebuilt' },
    { at: 1300, e: '🏘️', t: 'Halfaya rebuilt' },
    { at: 1460, e: '🏘️', t: 'Jabra rebuilt' },
    { at: 1640, e: '✨', t: 'The whole city shines again' }
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
        if (spentOn(d) <= S.allow[d]) { S.bricks += B_UNDER; S.under[d] = true; won++; }
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

  /* ---------- the city (painted by art.js) ---------- */
  var stripX = null;
  function city(n, from) {
    return '<div class="strip"><canvas data-city="strip" data-n="' + n + '" data-from="' + (from === undefined ? n : from) + '"></canvas></div>' +
      '<div class="swipe">‹ swipe to look around ›</div>';
  }
  function cityMap(n, from) {
    return '<canvas data-city="map" data-n="' + n + '" data-from="' + (from === undefined ? n : from) + '"></canvas>';
  }
  function paintAll() {
    if (!window.RKArt) return;
    var gs = null;
    if (S) {
      gs = {};
      Object.keys(KINDS).forEach(function (k) {
        var gl = goalByKind(k);
        gs[k] = gl ? { id: gl.id, name: gl.name.length > 14 ? gl.name.slice(0, 13) + '…' : gl.name, f: frac(k) } : null;
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll('canvas[data-city]'), function (cv) {
      if (cv._done) return;
      cv._done = true;
      var r = window.RKArt.paint(cv, { cam: cv.dataset.city, n: +cv.dataset.n, from: +cv.dataset.from, goals: gs });
      if (cv.dataset.city === 'strip') {
        var sc = cv.parentNode;
        sc.scrollLeft = stripX === null ? r.focusX - sc.clientWidth / 2 : stripX;
        sc.onscroll = function () { stripX = sc.scrollLeft; };
      }
    });
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
      '<div class="banner" style="margin-top:12px">' + cityMap(n, from) + '</div>' +
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
      '<p class="keep">The whole of Khartoum, where the two Niles meet. Each district lights up as you rebuild it. Tap a landmark to open its goal.</p>' +
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
    var won = settle(), chalWon = checkChallenge(), treatWon = treatUnlocks();
    var b = bridge(), t = today();
    if (!b.isPayday) S.allow[t] = b.allowance;
    save();
    var checked = !!S.checkins[t];
    var over = b.left < 0;
    var pct = b.allowance > 0 ? Math.min(100, (b.spent / b.allowance) * 100) : (b.spent > 0 ? 100 : 0);

    var hero;
    if (b.isPayday) {
      hero = '<div class="card hero"><div class="label">Payday</div>' +
        '<div class="num" style="font-size:40px;letter-spacing:-1px">You made it 🌅</div>' +
        '<div class="sub">A new month begins in Khartoum. Split your salary, set your budgets and start construction.</div>' +
        '<button class="primary" data-act="rit" data-do="open">Start the payday ritual</button></div>';
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

    var payAsk = !b.near ? '' : '<div class="card paycard"><b>🌅 Has your salary arrived?</b>' +
      '<p>' + (b.late ? 'It was expected ' + niceDate(S.payday) + '. Running late is fine: your daily number keeps stretching what you have.' :
        'It’s expected ' + niceDate(S.payday).toLowerCase() + ', but it can land a day or two early or late.') + ' Start the ritual on the day the money is actually in your hand.</p>' +
      '<button class="primary" data-act="rit" data-do="open">My salary arrived: start the ritual</button></div>';
    var stats = payAsk + '<div class="row3">' +
      '<div class="stat"><b>' + (b.gap >= 1 ? b.gap : b.gap === 0 ? 'today' : 'late') + '</b><span>' + (b.gap >= 1 ? (b.gap === 1 ? 'day' : 'days') + ' to payday' : 'payday due') + '</span></div>' +
      '<div class="stat"><b>' + money(bal('cash')) + '</b><span>cash</span></div>' +
      '<div class="stat"><b>' + money(bal('bank')) + '</b><span>bank</span></div></div>';

    var nothing = checked
      ? '<button class="nothing done" disabled>✓ You showed up today</button>'
      : '<button class="nothing" data-act="nothing">Nothing to log today</button>';

    app.innerHTML = cityCard() + hero + stats + nothing + roughCard() + treatCard() + weeklyCard() + budgetsCard() + goalsCard() + iouCard() + bankCard() + renderList() +
      '<button class="fab" data-act="log"><i>+</i> Log a purchase</button>';
    if (won) toast((won === 1 ? 'You stayed under your number' : won + ' days under your number') + ': +' + won * B_UNDER + ' 🧱');
    if (chalWon) toast('🏆 Challenge complete: +' + chalWon + ' 🧱');
    if (treatWon) toast('🎁 You unlocked a treat');
    celebrate();
    paintAll();
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
    if (S.rough) { S.rough.n++; if (S.rough.n % 3 === 0) { S.bricks += B_ROUGH; got += B_ROUGH; } }
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
      '<div class="field"><label for="s-pay">Expected payday</label><input id="s-pay" type="date" value="' + S.payday + '"></div>' +
      '<button class="primary" data-act="savesettings">Save</button>' +
      '<div class="step" style="margin-top:22px">More</div>' +
      '<button class="ghost" data-act="backup">💾 Save a backup' + (S.lastBackup ? ' (last: ' + niceDate(S.lastBackup).toLowerCase() + ')' : '') + '</button>' +
      '<label class="ghost filebtn">Restore from a backup file<input type="file" id="restore-in" accept="application/json,.json" hidden></label>' +
      '<button class="ghost" data-act="ask">💬 Ask Claude about my budget</button>' +
      '<button class="ghost" data-act="treats">🎁 My treats</button>' +
      '<button class="ghost" data-act="rough">' + (S.rough ? '🌤️ Turn off rough month mode' : '🌧️ This is a rough month') + '</button>' +
      '<button class="ghost" data-act="rit" data-do="open">🌅 Start the payday ritual now</button>' +
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
    return (r.type === 'transfer' || r.sms) && r.arabic ? 'a:' + (r.amt > 0 ? '+' : '-') + r.arabic : '';
  }
  function guess(r) {
    if (r.type === 'deposit' || r.type === 'atm') return { t: 'kind', v: 'own' };
    var k = ruleKey(r);
    if (k && S.rules[k]) return S.rules[k];
    // bank texts cut shop names short ("MOHAMMED R"), so a rule for the full name counts too, and the other way round
    if (k && k.indexOf('w:') === 0) {
      for (var rk in S.rules) {
        if (rk.indexOf('w:') !== 0) continue;
        var a = k.length < rk.length ? k : rk, b = a === k ? rk : k;
        if (a.length >= 7 && b.indexOf(a) === 0) return S.rules[rk];
      }
    }
    if (r.amt < 0 && r.type === 'card' && r.who) {
      for (var i = 0; i < AUTO.length; i++) if (AUTO[i][0].test(r.who)) return { t: 'cat', v: AUTO[i][1] };
    }
    return null;
  }
  function rowTitle(r) {
    return r.who || (r.sms && r.arabic) || (r.type === 'online' ? 'Online purchase' : r.type === 'transfer' ? (r.amt > 0 ? 'Transfer in' : 'Transfer out') : r.type === 'deposit' ? 'Cash deposit' : r.type === 'atm' ? 'Cash withdrawal' : 'Bank transaction');
  }
  // put one bank line where it belongs
  function place(r, dec) {
    if (r.sms) {
      // a bank text is not in any statement yet: it lowers the bank wallet like a purchase logged by hand,
      // until a statement import finds the same purchase and takes over (see finishImport)
      var hm = r.time.split(':'), ts = parse(r.date).getTime() + (+hm[0] * 60 + +hm[1]) * 6e4;
      if (dec.t === 'cat') {
        S.tx.push({ id: uid(), date: r.date, ts: ts, amt: Math.abs(r.amt), cat: dec.v, src: 'bank', note: rowTitle(r), sms: true, key: r.key });
      } else {
        S.inc.push({ id: uid(), date: r.date, amt: r.amt, kind: dec.v, who: rowTitle(r), key: r.key, sms: true });
        S.moves.push({ id: uid(), date: r.date, src: 'bank', amt: r.amt, why: 'sms', key: r.key });
      }
      return;
    }
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
      // purchases that came in from a bank text may sit a day off the statement date (late-night card payments)
      var mine = r.amt < 0 && (S.tx.filter(function (t) { return t.src === 'bank' && !t.bank && t.date === r.date && near(t.amt, -r.amt); })[0] ||
        S.tx.filter(function (t) { return t.sms && !t.bank && nextTo(t.date, r.date) && near(t.amt, -r.amt); })[0]);
      if (mine) { mine.bank = true; mine.key = r.key; auto++; return; }
      var smsInc = r.amt < 0 && S.inc.filter(function (x) { return x.sms && !x.bank && nextTo(x.date, r.date) && near(x.amt, r.amt); })[0];
      if (smsInc) { smsInc.bank = true; auto++; return; }
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
  function nextTo(a, b) { return Math.abs(parse(a) - parse(b)) < 1.5 * 864e5; }

  /* ---------- bank texts (saved into a .txt file by an iPhone Shortcut) ---------- */
  function importSms(file) {
    if (!window.RKImport || !window.RKImport.parseSms) { toast('Import is still loading. Try again in a moment.'); return; }
    var fr = new FileReader();
    fr.onerror = function () { toast('Could not open that file.'); };
    fr.onload = function () { finishSms(window.RKImport.parseSms(fr.result)); };
    fr.readAsText(file, 'utf-8');
  }
  function finishSms(res) {
    var fresh = res.rows.filter(function (r) { return !S.seenBank[r.key]; });
    var added = 0, auto = 0, old = 0, joined = 0;
    fresh.forEach(function (r) {
      S.seenBank[r.key] = 1;
      if (r.date < S.created) { old++; return; }
      // already inside a statement you imported
      if (S.lastBank && r.date <= S.lastBank) {
        var inStmt = r.date < S.lastBank ||
          S.tx.some(function (t) { return t.bank && nextTo(t.date, r.date) && near(t.amt, -r.amt); }) ||
          S.pending.some(function (p) { return !p.sms && nextTo(p.date, r.date) && near(p.amt, r.amt); });
        if (inStmt) { old++; return; }
      }
      // you already logged it by hand from the bank: keep yours
      var mine = S.tx.filter(function (t) { return t.src === 'bank' && !t.bank && !t.sms && t.date === r.date && near(t.amt, -r.amt); })[0];
      if (mine) { mine.sms = true; mine.key = r.key; joined++; return; }
      added++;
      var g = guess(r);
      if (g) { place(r, g); auto++; } else S.pending.push(r);
    });
    var last = res.rows.reduce(function (a, r) { var k = r.date + ' ' + r.time; return k > a ? k : a; }, S.lastSms || '');
    if (last) S.lastSms = last;
    toastEl.classList.remove('show');
    var got = 0;
    if (added) { got = 20 + checkin(); S.bricks += 20; }
    save(); renderHome();
    if (!res.rows.length) {
      sheet('No bank texts found', '<p class="keep" style="text-align:left">This file has no Alinma purchase texts in it. Is it <b>khartoum-bank-texts.txt</b> from your Shortcuts folder?</p><button class="primary" data-act="close">OK</button>');
      return;
    }
    sheet('Bank texts read ✓',
      '<div class="how"><div><b>' + added + '</b>new</div><div><b>' + auto + '</b>sorted for you</div><div><b>' + S.pending.length + '</b>need you</div></div>' +
      (joined ? '<p class="keep" style="text-align:left">' + joined + ' you had already logged yourself. I kept yours.</p>' : '') +
      (old ? '<p class="keep" style="text-align:left">' + old + ' were already in a statement you imported, or from before you started.</p>' : '') +
      (res.other ? '<p class="keep" style="text-align:left">⚠️ ' + res.other + ' texts weren’t card purchases (transfers, refunds…), so I left them out. The weekly statement still catches them.</p>' : '') +
      (got ? '<p class="keep">+' + got + ' 🧱 for syncing</p>' : '<p class="keep">Nothing new. You’re up to date.</p>') +
      (S.pending.length ? '<button class="primary" data-act="sort">Sort ' + S.pending.length + ' now</button><button class="ghost" data-act="close">Later</button>' : '<button class="primary" data-act="close">Done</button>'));
  }

  function bankCard() {
    return '<div class="card list"><h3>Bank statement</h3>' +
      (S.pending.length
        ? '<button class="primary" style="margin-top:10px" data-act="sort">Sort ' + S.pending.length + ' bank transaction' + (S.pending.length > 1 ? 's' : '') + '</button>'
        : '<div class="empty">' + (S.lastBank ? 'Imported up to ' + niceDate(S.lastBank) + '. ' : '') + 'Tap <b>Sync bank texts</b> whenever you like to bring in today’s card purchases. Import the statement PDF once a week to catch everything else.</div>') +
      '<label class="primary filebtn">Sync bank texts<input type="file" id="sms-in" accept="text/plain,.txt" hidden></label>' +
      (S.lastSms ? '<div class="private" style="margin-top:6px">Last bank text: ' + niceDate(S.lastSms.slice(0, 10)) + ' at ' + S.lastSms.slice(11) + '</div>' : '') +
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

  function closeSheet() { sheetRoot.innerHTML = ''; draft = null; rit = null; }

  /* ---------- monthly budgets ---------- */
  function cycleStart() { return (S.cycle && S.cycle.start) || S.created; }
  function spentSince(d, cat) {
    return S.tx.reduce(function (a, t) { return t.date >= d && (!cat || t.cat === cat) ? a + t.amt : a; }, 0);
  }
  // the average of the last three months we have data for, rounded up to a tidy number
  function suggestBudget(cat) {
    var by = {};
    S.tx.forEach(function (t) { if (t.cat === cat) { var m = t.date.slice(0, 7); by[m] = (by[m] || 0) + t.amt; } });
    var months = Object.keys(by).sort().slice(-3);
    if (!months.length) return 0;
    var avg = months.reduce(function (a, m) { return a + by[m]; }, 0) / months.length;
    var step = avg < 100 ? 10 : avg < 500 ? 25 : 50;
    return Math.ceil(avg / step) * step;
  }
  function budgetsCard() {
    if (!S.budgets) return '';
    var start = cycleStart(), t = today();
    var total = Math.max(1, daysBetween(start, S.payday)), day = Math.min(total, daysBetween(start, t) + 1);
    var h = '<div class="card list"><div class="ghead"><h3>This month’s budgets</h3><span>day ' + day + ' of ' + total + '</span></div>', warn = '';
    CATS.forEach(function (c) {
      var b = S.budgets[c.id] || 0, sp = r2(spentSince(start, c.id));
      if (!b && !sp) return;
      var pct = b ? Math.min(100, sp / b * 100) : 100, cls = b && sp > b ? ' over' : (b && sp >= b * .85 ? ' warn' : '');
      h += '<div class="tx"><span class="em">' + c.e + '</span><span class="mid"><b>' + c.n + '</b>' +
        '<span class="bar thin" style="display:block"><i class="' + cls + '" style="width:' + pct + '%"></i></span>' +
        '<span>' + money(sp) + ' of ' + money(b) + (b ? ' · ' + money(Math.max(0, r2(b - sp))) + ' left' : '') + '</span></span></div>';
      // early warning: spending faster than the month is passing
      if (b && day >= 5 && day < total && sp < b && sp / b > day / total + .15) {
        warn += '<div class="empty">⚠️ ' + c.n + ' is running ahead. At this pace it ends about ' + money(Math.round(sp / day * total - b)) + ' over by payday.</div>';
      }
    });
    return h + warn + '</div>';
  }

  /* ---------- the payday ritual ---------- */
  var rit = null;
  function nextPayday() {
    // count from the payday that was expected, so an early or late salary doesn't shift the next one by a month
    var d = S.payday && Math.abs(daysBetween(today(), S.payday)) <= 10 ? parse(S.payday) : new Date(), day = S.payday ? parse(S.payday).getDate() : 29;
    var last = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate();
    // paid about a day before the month ends: follow the month's real length
    var use = day >= 28 ? last - 1 : Math.min(day, last);
    return ymd(new Date(d.getFullYear(), d.getMonth() + 1, use));
  }
  function openRitual() {
    rit = { step: 0, salary: S.salary ? String(S.salary) : '', extra: '', next: nextPayday(), alloc: {}, pay: {}, bud: {}, sug: {} };
    S.goals.forEach(function (g) {
      var left = S.rough ? 0 : Math.max(0, r2(g.target - saved(g.id)));
      var months = g.due && g.due > today() ? Math.max(1, Math.ceil(daysBetween(today(), g.due) / 30.4)) : 6;
      rit.alloc[g.id] = left ? String(Math.min(left, Math.ceil(left / months / 50) * 50)) : '';
    });
    openIous().forEach(function (x) { if (x.dir === 'owe') rit.pay[x.id] = !x.due || x.due <= rit.next; });
    CATS.forEach(function (c) {
      rit.sug[c.id] = suggestBudget(c.id);
      rit.bud[c.id] = String(S.budgets && S.budgets[c.id] !== undefined ? S.budgets[c.id] : rit.sug[c.id] || '');
    });
    drawRitual();
  }
  function ritIncome() { return num(rit.salary) + num(rit.extra); }
  function ritOut() {
    var a = 0;
    S.goals.forEach(function (g) { a += num(rit.alloc[g.id] || 0); });
    openIous().forEach(function (x) { if (rit.pay[x.id]) a += x.amt; });
    return a;
  }
  function ritLeft() {
    var b = 0;
    CATS.forEach(function (c) { b += num(rit.bud[c.id] || 0); });
    return r2(ritIncome() - ritOut() - b);
  }
  function getR(k) { return k === 'sal' ? rit.salary : k === 'extra' ? rit.extra : k === 'next' ? rit.next : k.charAt(0) === 'a' ? rit.alloc[k.slice(2)] : rit.bud[k.slice(2)]; }
  function setR(k, v) {
    if (k === 'sal') rit.salary = v; else if (k === 'extra') rit.extra = v; else if (k === 'next') rit.next = v;
    else if (k.charAt(0) === 'a') rit.alloc[k.slice(2)] = v; else rit.bud[k.slice(2)] = v;
  }
  function rrow(label, key, step, hint) {
    return '<div class="rrow"><div class="rl">' + label + (hint ? '<small>' + hint + '</small>' : '') + '</div>' +
      '<button data-act="rit" data-do="minus" data-k="' + key + '" data-s="' + step + '" aria-label="Less">−</button>' +
      '<input inputmode="decimal" data-r="' + key + '" value="' + esc(getR(key) || '') + '" placeholder="0">' +
      '<button data-act="rit" data-do="plus" data-k="' + key + '" data-s="' + step + '" aria-label="More">+</button></div>';
  }
  function leftBar() {
    var l = ritLeft();
    return '<div id="r-left" class="rleft' + (Math.abs(l) < .5 ? ' zero' : l < 0 ? ' neg' : '') + '"><span>' +
      (Math.abs(l) < .5 ? 'Every riyal has a job ✓' : l < 0 ? 'Over by' : 'Left to give a job') + '</span><b>' + (Math.abs(l) < .5 ? '0' : money(Math.abs(l))) + '</b></div>';
  }
  function ritReview() {
    var start = cycleStart(), b0 = S.cycle ? S.cycle.bricks0 : 0, s0 = S.cycle ? S.cycle.steps0 : 0, st = streak();
    // 1. the money
    var rows = CATS.map(function (c) { return { c: c, sp: r2(spentSince(start, c.id)), b: S.budgets ? (S.budgets[c.id] || 0) : 0 }; }).filter(function (x) { return x.sp > 0; })
      .sort(function (a, b) { return b.sp - a.sp; });
    var total = rows.reduce(function (a, x) { return a + x.sp; }, 0);
    var h = '<div class="step">Where the money went since ' + niceDate(start) + '</div>';
    if (!rows.length) h += '<p class="keep" style="text-align:left">Nothing logged yet. This month is your fresh start.</p>';
    else {
      h += '<div class="amount" style="text-align:left;font-size:40px">' + money(total) + '<small>SAR spent</small></div>';
      rows.slice(0, 6).forEach(function (x) {
        h += '<div class="jr"><span>' + x.c.e + '</span>' + x.c.n + '<i>' + money(x.sp) + (x.b ? ' of ' + money(x.b) : '') + '</i></div>';
      });
      if (S.budgets) {
        var under = rows.filter(function (x) { return x.b && x.sp <= x.b; }).length, over = rows.filter(function (x) { return x.b && x.sp > x.b; });
        h += '<p class="keep" style="text-align:left;margin-top:12px">✓ You stayed inside <b>' + under + '</b> budget' + (under === 1 ? '' : 's') + '.' +
          (over.length ? ' What we learned: ' + over.map(function (x) { return x.c.n + ' needed about ' + money(x.sp - x.b) + ' more'; }).join(', ') + '. You can adjust it in a moment.' : '') + '</p>';
      }
    }
    // 2. the goals
    h += '<div class="step" style="margin-top:22px">Your savings goals</div>';
    if (!S.goals.length) h += '<p class="keep" style="text-align:left">No goals yet.</p>';
    S.goals.forEach(function (g) {
      var pc = Math.min(100, saved(g.id) / g.target * 100);
      h += '<div class="tx"><span class="em">' + KINDS[g.kind].e + '</span><span class="mid"><b>' + esc(g.name) + '</b><span class="bar thin" style="display:block"><i style="width:' + pc + '%"></i></span><span>' + money(saved(g.id)) + ' of ' + money(g.target) + ' · ' + Math.floor(pc) + '%</span></span></div>';
    });
    // 3. the city
    h += '<div class="step" style="margin-top:22px">The city</div>' +
      '<div class="how"><div><b>' + money(Math.max(0, S.bricks - b0)) + '</b>bricks earned</div><div><b>' + Math.max(0, stepsDone() - s0) + '</b>districts lit</div><div><b>' + st.n + '</b>week streak</div></div>';
    return h;
  }
  function drawRitual() {
    var titles = [['🌅 Payday', 'A new month begins in Khartoum.'], ['🏙️ Last month', 'Your money first, then the city.'], ['✉️ The envelope', 'Pay your future self first.'], ['🎯 This month’s budgets', 'Give every riyal a job.'], ['🔨 Construction begins', 'The city is waiting.']];
    var st = rit.step, body = '', foot = '';
    if (st === 0) {
      body = '<div class="field"><label>Your salary this month (SAR)</label><input inputmode="decimal" data-r="sal" placeholder="0" value="' + esc(rit.salary) + '"></div>' +
        '<div class="field"><label>Any extra income? (freelance, bonus)</label><input inputmode="decimal" data-r="extra" placeholder="0" value="' + esc(rit.extra) + '"><div class="hint">Extra income is the fastest way to finish a goal early.</div></div>' +
        '<div class="field"><label>When do you expect the next one?</label><input type="date" data-r="next" value="' + rit.next + '"><div class="hint">A best guess is enough. You start the next ritual whenever the money actually arrives, early or late.</div></div>';
      foot = '<button class="primary" data-act="rit" data-do="next">Next</button>';
    } else if (st === 1) {
      body = ritReview();
      foot = '<button class="ghost" data-act="rit" data-do="back">Back</button><button class="primary" data-act="rit" data-do="next">Next</button>';
    } else if (st === 2) {
      body = '<p class="keep" style="text-align:left">You have <b>' + money(ritIncome()) + ' SAR</b> in your hands. Count these amounts into the envelope before anything else.</p>';
      if (!S.goals.length) body += '<p class="keep" style="text-align:left">No savings goals yet. You can add them from the home screen later.</p>';
      S.goals.forEach(function (g) {
        var left = Math.max(0, r2(g.target - saved(g.id)));
        body += rrow(KINDS[g.kind].e + ' ' + esc(g.name), 'a:' + g.id, 100, money(left) + ' still to go');
      });
      var owes = openIous().filter(function (x) { return x.dir === 'owe'; });
      if (owes.length) body += '<div class="step" style="margin-top:18px">Debts to clear</div>';
      owes.forEach(function (x) {
        body += '<button class="rtog' + (rit.pay[x.id] ? ' on' : '') + '" data-act="rit" data-do="toggle" data-k="' + x.id + '"><span>' + (rit.pay[x.id] ? '✓' : '') + '</span>Pay ' + esc(x.who) + ' back now<b>' + money(x.amt) + '</b></button>';
      });
      body += '<div id="r-keep" class="rkeep"></div>';
      foot = '<button class="ghost" data-act="rit" data-do="back">Back</button><button class="primary" data-act="rit" data-do="next">Next</button>';
    } else if (st === 3) {
      body = leftBar() + '<button class="ghost" style="margin:0 0 6px" data-act="rit" data-do="accept">Use the suggested amounts</button>';
      CATS.forEach(function (c) {
        body += rrow(c.e + ' ' + c.n, 'b:' + c.id, 25, rit.sug[c.id] ? 'you usually spend about ' + money(rit.sug[c.id]) : '');
      });
      body += '<div id="r-help"></div>';
      foot = '<button class="ghost" data-act="rit" data-do="back">Back</button><button class="primary" id="r-go" data-act="rit" data-do="finish">Begin construction 🔨</button>';
    } else {
      body = '<div class="banner">' + cityMap(stepsDone(), S.seen) + '</div>' +
        '<div class="won">' + rit.done.map(function (d) { return '<div><span>' + d[0] + '</span>' + d[1] + '</div>'; }).join('') + '</div>' +
        '<p class="keep">Your next payday is ' + parse(S.payday).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + '.</p>';
      foot = '<button class="primary" data-act="rit" data-do="close">Enter the city</button>';
    }
    sheetRoot.innerHTML = '<div class="ritual"><div class="rhead"><div class="rdots">' + [0, 1, 2, 3, 4].map(function (k) { return '<i class="' + (k <= st ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
      '<h1>' + titles[st][0] + '</h1><p>' + titles[st][1] + '</p>' + (st < 4 ? '<button class="x rx" data-act="rit" data-do="close" aria-label="Close">✕</button>' : '') + '</div>' +
      '<div class="rbody">' + body + '</div><div class="rfoot">' + foot + '</div></div>';
    ritLive();
    sheetRoot.firstChild.scrollTop = 0;
  }
  // the parts that change as you type
  function ritLive() {
    if (!rit) return;
    var keep = document.getElementById('r-keep'), bar = document.getElementById('r-left'), help = document.getElementById('r-help'), go = document.getElementById('r-go');
    if (keep) {
      var k = r2(ritIncome() - ritOut());
      keep.innerHTML = '<span>Into the envelope and debts</span><b>' + money(ritOut()) + '</b><span>Left to live on this month</span><b class="' + (k < 0 ? 'neg' : '') + '">' + money(k) + '</b>';
    }
    if (bar) bar.outerHTML = leftBar();
    if (help) {
      var l = ritLeft(), g = S.goals.filter(function (x) { return saved(x.id) + num(rit.alloc[x.id] || 0) < x.target; })[0];
      help.innerHTML = l >= .5
        ? (g ? '<button class="ghost" data-act="rit" data-do="restsave" data-k="' + g.id + '">Send the last ' + money(l) + ' to ' + esc(g.name) + '</button>' : '') +
          '<button class="ghost" data-act="rit" data-do="restbuf">Keep the last ' + money(l) + ' as a buffer</button>'
        : l < -.5 ? '<p class="keep">Trim ' + money(-l) + ' from the budgets above, or go back and lower the envelope amounts.</p>' : '';
      if (go) go.disabled = Math.abs(l) >= .5;
    }
  }
  function payIou(x, src) {
    var t = today();
    if (x.cat) { S.tx.push({ id: uid(), date: t, ts: Date.now(), amt: x.amt, cat: x.cat, src: src, note: 'My share, paid to ' + x.who }); }
    else S.moves.push({ id: uid(), date: t, src: src, amt: -x.amt, why: 'debt' });
    x.done = true;
  }
  function finishRitual() {
    var t = today(), sal = num(rit.salary), extra = num(rit.extra), done = [], put = 0;
    // the salary arrives as cash
    S.moves.push({ id: uid(), date: t, src: 'cash', amt: sal + extra, why: 'salary' });
    if (sal) S.inc.push({ id: uid(), date: t, amt: sal, kind: 'salary', who: 'Salary' });
    if (extra) S.inc.push({ id: uid(), date: t, amt: extra, kind: 'freelance', who: 'Extra income' });
    S.salary = sal;
    S.goals.forEach(function (g) {
      var a = r2(num(rit.alloc[g.id] || 0));
      if (!(a > 0)) return;
      S.vault.push({ id: uid(), date: t, goal: g.id, amt: a });
      S.moves.push({ id: uid(), date: t, src: 'cash', amt: -a, why: 'envelope' });
      g.peak = Math.max(g.peak || 0, saved(g.id) + (g.used || 0));
      put += a;
      done.push([KINDS[g.kind].e, money(a) + ' into ' + esc(g.name)]);
    });
    openIous().forEach(function (x) { if (rit.pay[x.id]) { payIou(x, 'cash'); done.push(['🤝', esc(x.who) + ' paid back: ' + money(x.amt)]); } });
    S.budgets = {};
    CATS.forEach(function (c) { S.budgets[c.id] = r2(num(rit.bud[c.id] || 0)); });
    var gain = Math.floor(put / B_PER_SAVED) + 50;
    S.bricks += gain;
    checkin();
    S.payday = rit.next && rit.next > t ? rit.next : nextPayday();
    S.cycle = { start: t, bricks0: S.bricks, steps0: stepsDone() };
    S.treatPot = r2(S.treatPot + TREAT_MONTHLY); S.rituals++; S.rough = null;
    done.push(['🎯', 'Budgets set for the month']);
    done.push(['🧱', '+' + money(gain) + ' bricks']);
    rit.done = done; rit.step = 4;
    save();
    drawRitual();
  }
  function ritAct(el) {
    var d = el.dataset.do, k = el.dataset.k;
    if (d === 'open') { closeSheet(); return openRitual(); }
    if (!rit) return;
    if (d === 'close') { closeSheet(); renderHome(); return; }
    if (d === 'back') { rit.step--; return drawRitual(); }
    if (d === 'next') {
      if (rit.step === 0) {
        if (!(ritIncome() > 0)) { toast('Type your salary first'); return; }
        if (!rit.next || rit.next <= today()) { toast('Pick a next payday after today'); return; }
      }
      if (rit.step === 2 && ritOut() > ritIncome()) { toast('That is more than you were paid'); return; }
      rit.step++; return drawRitual();
    }
    if (d === 'plus' || d === 'minus') {
      var v = Math.max(0, num(getR(k) || 0) + (d === 'plus' ? 1 : -1) * num(el.dataset.s));
      setR(k, v ? String(v) : '');
      var inp = document.querySelector('[data-r="' + k + '"]');
      if (inp) inp.value = v || '';
      return ritLive();
    }
    if (d === 'toggle') { rit.pay[k] = !rit.pay[k]; return drawRitual(); }
    if (d === 'accept') { CATS.forEach(function (c) { rit.bud[c.id] = rit.sug[c.id] ? String(rit.sug[c.id]) : ''; }); return drawRitual(); }
    if (d === 'restsave') { rit.alloc[k] = String(r2(num(rit.alloc[k] || 0) + ritLeft())); return drawRitual(); }
    if (d === 'restbuf') { rit.bud.other = String(r2(num(rit.bud.other || 0) + ritLeft())); return drawRitual(); }
    if (d === 'finish') { if (Math.abs(ritLeft()) >= .5) return; return finishRitual(); }
  }
  document.addEventListener('input', function (ev) {
    var k = ev.target.dataset && ev.target.dataset.r;
    if (k && rit) { setR(k, ev.target.value); ritLive(); }
  });

  /* ---------- weekly check-in and challenges ---------- */
  var B_WEEKLY = 30, B_BACKUP = 15, B_COMEBACK = 20, B_ROUGH = 15;
  function weekDays() {
    var out = [], d = parse(weekKey(today())), t = today();
    while (ymd(d) <= t) { out.push(ymd(d)); d.setDate(d.getDate() + 1); }
    return out;
  }
  var CHALS = {
    log5: { t: 'Show up on 5 days this week', goal: 5, r: 40, prog: function () { return weekDays().filter(function (d) { return S.checkins[d]; }).length; } },
    under4: { t: 'Stay under your number on 4 days', goal: 4, r: 50, prog: function () { return weekDays().filter(function (d) { return S.under[d]; }).length; } },
    // runs for 7 full days from the day it is picked; one eating-out purchase ends it
    noeat7: { t: 'A whole week with no eating out or delivery', goal: 7, r: 80, whole: true, prog: function () { return Math.min(7, daysBetween(S.challenge.start, today())); } },
    nospend: { t: 'One whole day with no spending', goal: 1, r: 30, prog: function () {
      var t = today(); return weekDays().filter(function (d) { return d < t && S.checkins[d] && spentOn(d) === 0; }).length; } }
  };
  // pays out a finished challenge; returns the bricks won
  function checkChallenge() {
    var c = S.challenge;
    if (!c) return 0;
    if (!CHALS[c.id]) { S.challenge = null; return 0; }
    if (CHALS[c.id].whole) {
      var age = daysBetween(c.start, today());
      if (c.done || c.failed) { if (age >= 8) S.challenge = null; return 0; }
      if (S.tx.some(function (t) { return t.cat === 'eat' && t.date >= c.start; })) { c.failed = true; return 0; }
      if (age >= 7) { c.done = true; S.bricks += CHALS[c.id].r; return CHALS[c.id].r; }
      return 0;
    }
    if (c.week !== weekKey(today())) { S.challenge = null; return 0; }
    if (!c.done && CHALS[c.id] && CHALS[c.id].prog() >= CHALS[c.id].goal) { c.done = true; S.bricks += CHALS[c.id].r; return CHALS[c.id].r; }
    return 0;
  }
  function backupDue() { return !S.lastBackup || daysBetween(S.lastBackup, today()) >= 7; }
  function weeklyCard() {
    var done = S.weekly[weekKey(today())], c = S.challenge && CHALS[S.challenge.id] ? S.challenge : null;
    var h = '<div class="card list"><div class="ghead"><h3>This week</h3>' + (backupDue() ? '<span>backup due</span>' : '') + '</div>';
    if (c) {
      var d = CHALS[c.id], pr = Math.min(d.goal, d.prog());
      h += '<div class="tx"><span class="em">🏆</span><span class="mid"><b>' + d.t + '</b><span class="bar thin" style="display:block"><i style="width:' + (pr / d.goal * 100) + '%"></i></span>' +
        '<span>' + (c.done ? 'Done ✓ +' + d.r + ' 🧱' : c.failed ? 'You ate out, so this one is off. No penalty: pick it again any time.'
          : d.whole ? pr + ' of 7 days clean · +' + d.r + ' 🧱 at the end' : pr + ' of ' + d.goal + ' · +' + d.r + ' 🧱 when you finish') +
        '</span></span></div>' + (c.failed ? '<button class="ghost" data-act="chal">Pick a challenge</button>' : '');
    }
    h += done ? '<div class="empty">✓ Weekly check-in done.' + (c ? '' : ' <button class="link" data-act="chal">Pick a challenge</button>') + '</div>'
      : '<button class="primary" style="margin-top:12px" data-act="weekly">Weekly check-in · 5 min · +' + B_WEEKLY + ' 🧱</button>';
    return h + '</div>';
  }
  function chalOpts(picked) {
    return opts('w-ch', [['', 'No challenge this week']].concat(Object.keys(CHALS).map(function (k) { return [k, '🏆 ' + CHALS[k].t + ' · +' + CHALS[k].r + ' 🧱']; })), picked || '');
  }
  function openWeekly() {
    var days = weekDays(), from = days[0], total = r2(spentSince(from));
    var rows = CATS.map(function (c) { return { c: c, sp: r2(spentSince(from, c.id)) }; }).filter(function (x) { return x.sp > 0; }).sort(function (a, b) { return b.sp - a.sp; });
    sheet('Weekly check-in',
      '<div class="how"><div><b>' + money(total) + '</b>spent this week</div><div><b>' + days.filter(function (d) { return S.checkins[d]; }).length + '</b>days you showed up</div><div><b>' +
      days.filter(function (d) { return S.under[d]; }).length + '</b>days under your number</div></div>' +
      rows.slice(0, 4).map(function (x) { return '<div class="jr"><span>' + x.c.e + '</span>' + x.c.n + '<i>' + money(x.sp) + '</i></div>'; }).join('') +
      '<div class="field"><label for="w-cash">Any cash you spent but didn’t log?</label><input id="w-cash" inputmode="decimal" placeholder="0"><div class="hint">A rough number is fine. It keeps your wallet honest.</div></div>' +
      '<div class="field"><label>Back up your data</label><button class="ghost" style="margin-top:0" data-act="backup">' + (backupDue() ? 'Save a backup now · +' + B_BACKUP + ' 🧱' : '✓ Backed up ' + niceDate(S.lastBackup).toLowerCase()) + '</button>' +
      '<div class="hint">Choose “Save to Files” and pick iCloud Drive. If you lose your phone, this file brings everything back.</div></div>' +
      '<div class="field"><label>A challenge for the week (optional)</label>' + chalOpts(S.challenge ? S.challenge.id : '') + '</div>' +
      '<p class="keep" style="text-align:left">Card purchases: import your Alinma statement from the home screen after this.</p>' +
      '<button class="primary" data-act="weeklydone">Finish check-in</button>');
  }
  function setChallenge(id) {
    if (!id) { if (S.challenge && !S.challenge.done) S.challenge = null; return; }
    var c = S.challenge;
    if (c && c.id === id && !c.failed && (CHALS[id].whole ? !c.done : c.week === weekKey(today()))) return;
    S.challenge = { id: id, week: weekKey(today()), start: today(), done: false };
  }
  function finishWeekly() {
    var cash = r2(num(val('w-cash'))), t = today(), wk = weekKey(t), got = 0;
    if (cash > 0) S.tx.push({ id: uid(), date: t, ts: Date.now(), amt: cash, cat: 'other', src: 'cash', note: 'Cash I didn’t log (estimate)' });
    setChallenge(radio('w-ch'));
    if (!S.weekly[wk]) { S.weekly[wk] = true; S.bricks += B_WEEKLY; got = B_WEEKLY; }
    got += checkin();
    save(); closeSheet(); renderHome();
    if (!sheetRoot.innerHTML) toast('Check-in done ✓' + (got ? ' +' + got + ' 🧱' : ''));
  }
  function openChal() {
    sheet('Pick a challenge', '<p class="keep" style="text-align:left">Optional. Most run until the end of this week. The no-eating-out one runs for 7 days from today. There is no penalty for missing one.</p>' +
      chalOpts(S.challenge ? S.challenge.id : '') + '<button class="primary" data-act="chalset">Save</button>');
  }

  /* ---------- backup and restore ---------- */
  function backedUp() {
    var wk = weekKey(today()), got = 0;
    if (S.backupWeek !== wk) { S.backupWeek = wk; S.bricks += B_BACKUP; got = B_BACKUP; }
    S.lastBackup = today();
    save(); closeSheet(); renderHome();
    if (!sheetRoot.innerHTML) toast('Backup saved ✓' + (got ? ' +' + got + ' 🧱' : ''));
  }
  function doBackup() {
    var name = 'khartoum-backup-' + today() + '.json', text = JSON.stringify(S);
    var file;
    try { file = new File([text], name, { type: 'application/json' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] }).then(backedUp).catch(function () { toast('Backup cancelled'); });
      return;
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    backedUp();
  }
  function restoreFrom(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var o = null;
      try { o = JSON.parse(fr.result); } catch (e) {}
      if (!o || !o.start || !o.tx || !o.checkins) { toast('That file is not a Khartoum backup'); return; }
      pendingRestore = o;
      var last = Object.keys(o.checkins).sort().pop();
      sheet('Restore this backup?', '<p class="keep" style="text-align:left">This backup has <b>' + o.tx.length + ' purchases</b> and <b>' + money(o.bricks || 0) + ' bricks</b>' +
        (last ? ', last used ' + niceDate(last).toLowerCase() : '') + '.</p><p class="keep" style="text-align:left">It will <b>replace everything</b> that is on this phone now.</p>' +
        '<button class="primary" data-act="restoreyes">Replace with this backup</button><button class="ghost" data-act="close">Cancel</button>');
    };
    fr.readAsText(file);
  }
  var pendingRestore = null;

  /* ---------- Ask Claude: a disguised summary you copy yourself ---------- */
  function rough(v) { v = Math.abs(v); return v < 100 ? Math.round(v / 5) * 5 : v < 1000 ? Math.round(v / 10) * 10 : Math.round(v / 100) * 100; }
  function buildSummary() {
    var start = cycleStart(), t = today(), total = Math.max(1, daysBetween(start, S.payday)), day = Math.max(1, Math.min(total, daysBetween(start, t) + 1));
    var L = ['Here is a summary of my personal budget. Amounts are in SAR and rounded. It has no names, shops or dates.', ''];
    if (S.salary) L.push('Monthly salary: about ' + money(rough(S.salary)));
    L.push('I am on day ' + day + ' of a ' + total + '-day budget month.', '', 'Spending so far this month, by category (spent / budget):');
    CATS.forEach(function (c) {
      var sp = spentSince(start, c.id), b = S.budgets ? (S.budgets[c.id] || 0) : 0;
      if (sp || b) L.push('- ' + c.n + ': ' + money(rough(sp)) + ' / ' + (b ? money(rough(b)) : 'no budget'));
    });
    L.push('', 'My usual monthly spending (average of recent months):');
    CATS.forEach(function (c) { var s = suggestBudget(c.id); if (s) L.push('- ' + c.n + ': ' + money(rough(s))); });
    if (S.goals.length) {
      L.push('', 'Savings goals:');
      S.goals.forEach(function (g, i) {
        var months = g.due && g.due > t ? Math.max(1, Math.ceil(daysBetween(t, g.due) / 30.4)) : 0;
        L.push('- Goal ' + (i + 1) + ': target ' + money(rough(g.target)) + ', saved ' + money(rough(saved(g.id))) + (months ? ', ' + months + ' month' + (months > 1 ? 's' : '') + ' left' : ', no deadline'));
      });
    }
    var owe = 0, owed = 0;
    openIous().forEach(function (x) { if (x.dir === 'owe') owe += x.amt; else owed += x.amt; });
    if (owe || owed) L.push('', 'Debts: I owe about ' + money(rough(owe)) + '; I am owed about ' + money(rough(owed)) + '.');
    L.push('', 'Please help me plan next month: where could I cut back, and is my savings plan realistic?');
    return L.join('\n');
  }
  function openAsk() {
    sheet('Ask Claude', '<p class="keep" style="text-align:left">This is <b>everything</b> that would be shared: rounded amounts and category names only. Nothing is sent by the app. You copy it and paste it into Claude yourself.</p>' +
      '<textarea id="ask-text" class="asktext" readonly>' + esc(buildSummary()) + '</textarea>' +
      '<button class="primary" data-act="copysum">Copy the summary</button>');
  }
  function copySummary() {
    var el = document.getElementById('ask-text'), text = el.value;
    function ok() { toast('Copied ✓ Now paste it into Claude'); }
    function old() { el.focus(); el.select(); try { document.execCommand('copy'); ok(); } catch (e) { toast('Press and hold the text to copy it'); } }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, old); else old();
  }

  /* ---------- treats ---------- */
  var TREAT_MONTHLY = 50;
  // real-life rewards unlock at milestones; returns how many were just unlocked
  function treatUnlocks() {
    var keys = [], st = streak(), n = 0;
    if (st.n >= 4) keys.push('s' + Math.floor(st.n / 4));
    S.goals.forEach(function (g) { if (saved(g.id) + (g.used || 0) >= g.target) keys.push('g' + g.id); });
    if (S.rituals >= 2) keys.push('m' + S.rituals);
    keys.forEach(function (k) { if (!S.treatKeys[k]) { S.treatKeys[k] = 1; S.treatReady++; n++; } });
    return n;
  }
  function treatCard() {
    if (!S.treatReady) return '';
    var h = '<div class="card list treat"><h3>🎁 You earned a treat</h3>';
    if (!S.treats.length) return h + '<div class="empty">Choose a few small things you’d look forward to, and pick one now.</div><button class="ghost" data-act="treats">Choose my treats</button></div>';
    h += '<div class="empty">Treats pot: <b>' + money(S.treatPot) + ' SAR</b>. Pick one, enjoy it, and log it when you pay.</div>';
    S.treats.forEach(function (x) {
      var can = x.cost <= S.treatPot;
      h += '<button class="ghost pick" ' + (can ? 'data-act="treat" data-id="' + x.id + '"' : 'disabled style="opacity:.5"') + '>' + esc(x.name) + ' · ' + money(x.cost) +
        (can ? '' : ' (the pot needs ' + money(r2(x.cost - S.treatPot)) + ' more)') + '</button>';
    });
    return h + '</div>';
  }
  function openTreats() {
    sheet('My treats', '<p class="keep" style="text-align:left">Small real rewards for sticking with it. The pot grows by ' + TREAT_MONTHLY + ' SAR every payday, and a treat unlocks when you finish a goal, keep a 4-week streak, or complete a month. Pot now: <b>' + money(S.treatPot) + ' SAR</b>.</p>' +
      S.treats.map(function (x) { return '<div class="jr done"><span>🎁</span>' + esc(x.name) + '<i>' + money(x.cost) + ' <button class="link danger" data-act="treatdel" data-id="' + x.id + '">remove</button></i></div>'; }).join('') +
      '<div class="field"><label for="t-name">Add a treat</label><input id="t-name" maxlength="30" placeholder="e.g. Shawarma night"></div>' +
      '<div class="field"><label for="t-cost">About how much? (SAR)</label><input id="t-cost" inputmode="decimal" placeholder="0"></div>' +
      '<button class="primary" data-act="treatadd">Add it</button>');
  }

  /* ---------- rough month, welcome back ---------- */
  function roughCard() {
    if (!S.rough) return '';
    return '<div class="card paycard"><b>🌧️ Rough month mode</b><p>Goals are paused and nothing breaks. Your city stays exactly as it is. Small steps only: every 3 purchases you log repairs a little more (' +
      (S.rough.n % 3) + ' of 3).</p><button class="ghost" data-act="rough">Things are better: turn it off</button></div>';
  }
  function openWelcome(days) {
    sheet('Welcome back 👋', '<p class="keep" style="text-align:left">It’s been ' + days + ' days. Nothing is lost: your city is exactly as you left it, and your streak counts weeks, not days.</p>' +
      '<div class="field"><label for="wb-cash">Roughly how much cash did you spend while you were away?</label><input id="wb-cash" inputmode="decimal" placeholder="0"><div class="hint">One number is enough. A guess is fine.</div></div>' +
      '<button class="primary" data-act="wbsave">Catch me up · +' + B_COMEBACK + ' 🧱</button><button class="ghost" data-act="wbsave">Skip, I’ll just carry on</button>');
  }
  function saveWelcome() {
    var cash = r2(num(val('wb-cash'))), d = new Date(); d.setDate(d.getDate() - 1);
    if (cash > 0) { S.tx.push({ id: uid(), date: ymd(d), ts: Date.now() - 864e5, amt: cash, cat: 'other', src: 'cash', note: 'While I was away (estimate)' }); S.bricks += B_COMEBACK; }
    var got = checkin() + (cash > 0 ? B_COMEBACK : 0);
    save(); closeSheet(); renderHome();
    if (!sheetRoot.innerHTML) toast('You’re caught up ✓ +' + got + ' 🧱');
  }

  function extraAct(act, el) {
    if (act === 'weekly') return openWeekly();
    if (act === 'weeklydone') return finishWeekly();
    if (act === 'chal') return openChal();
    if (act === 'chalset') { setChallenge(radio('w-ch')); save(); closeSheet(); renderHome(); return; }
    if (act === 'backup') return doBackup();
    if (act === 'restoreyes') {
      if (!pendingRestore) return;
      S = pendingRestore; pendingRestore = null; ensure(); save(); closeSheet(); stripX = null; renderHome(); toast('Backup restored ✓'); return;
    }
    if (act === 'ask') return openAsk();
    if (act === 'copysum') return copySummary();
    if (act === 'treats') return openTreats();
    if (act === 'treatadd') {
      var nm = val('t-name').trim(), cost = r2(num(val('t-cost')));
      if (!nm || !(cost > 0)) { toast('Type a name and a cost'); return; }
      S.treats.push({ id: uid(), name: nm, cost: cost }); save(); renderHome(); return openTreats();
    }
    if (act === 'treatdel') { S.treats = S.treats.filter(function (x) { return x.id !== el.dataset.id; }); save(); renderHome(); return openTreats(); }
    if (act === 'treat') {
      var tr = S.treats.filter(function (x) { return x.id === el.dataset.id; })[0];
      if (!tr || tr.cost > S.treatPot) return;
      S.treatPot = r2(S.treatPot - tr.cost); S.treatReady = Math.max(0, S.treatReady - 1);
      save(); renderHome(); toast('Enjoy your ' + tr.name + ' 🎉 Log it when you pay.'); return;
    }
    if (act === 'rough') {
      S.rough = S.rough ? null : { n: 0 };
      save(); closeSheet(); renderHome(); toast(S.rough ? 'Rough month mode is on. Nothing breaks.' : 'Rough month mode is off'); return;
    }
    if (act === 'wbsave') return saveWelcome();
    return false;
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function () { setTimeout(paintAll, 0); });
  document.addEventListener('click', function (ev) {
    var cv = ev.target.closest('canvas[data-city]');
    if (cv) {
      var box = cv.getBoundingClientRect(), cx = ev.clientX - box.left, cy = ev.clientY - box.top;
      var hit = (cv._hits || []).filter(function (h) { return cx >= h.x && cx <= h.x + h.w && cy >= h.y && cy <= h.y + h.h; })[0];
      if (hit && S) return hit.act === 'goal' ? openGoal(hit.id) : openGoalEdit('', hit.kind);
      if (cv.dataset.city === 'strip' && S && !rit) openJournal();
      return;
    }
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
    if (act === 'rit') return ritAct(el);
    if (extraAct(act, el) !== false) return;
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
    if (ev.target.id === 'sms-in' && ev.target.files && ev.target.files[0]) { importSms(ev.target.files[0]); ev.target.value = ''; }
    if (ev.target.id === 'restore-in' && ev.target.files && ev.target.files[0]) { restoreFrom(ev.target.files[0]); ev.target.value = ''; }
  });

  // refresh the number when the app is reopened on a new day
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && S && !draft && !sheetRoot.innerHTML) renderHome();
  });

  /* ---------- start ---------- */
  setTimeout(paintAll, 0);
  if (S && S.start && S.tx) {
    // older saves: award bricks for what was already done, so nothing is lost
    if (S.bricks === undefined) {
      S.bricks = B_LOG * S.tx.length + B_SHOW * Object.keys(S.checkins).length;
      S.seen = 0; S.allow = {}; S.settled = {}; S.v = 2;
    }
    ensure();
    renderHome();
    var lastSeen = Object.keys(S.checkins).sort().pop();
    if (lastSeen && daysBetween(lastSeen, today()) >= 4 && !sheetRoot.innerHTML) openWelcome(daysBetween(lastSeen, today()));
  } else { S = null; renderSetup(); }

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
