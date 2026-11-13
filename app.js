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
    return S.tx.reduce(function (a, t) { return t.src === src ? a + t.amt : a; }, 0);
  }
  function bal(src) { return S.start[src] - spentFrom(src); }
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

  /* ---------- city banner (placeholder until the city is built in step 2) ---------- */
  function banner(caption, right) {
    return '<div class="banner">' +
      '<svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#27425c"/><stop offset=".55" stop-color="#c9805a"/><stop offset="1" stop-color="#f0b860"/></linearGradient></defs>' +
      '<rect width="400" height="150" fill="url(#sky)"/>' +
      '<circle cx="300" cy="104" r="26" fill="#ffd98a" opacity=".95"/>' +
      '<g fill="#3b3340">' +
      '<path d="M0 112h28v-30l10 6v-14h16v10l8-4v32h20v-22h14l4-8 6 8h10v22h24v-40h8v-8h10v14l10-6v40h22v-18h18v18h26v-34l12 8v-16h14v42h24v-26h16l6-10v36h28v-20h16v20h50v38H0z"/>' +
      '</g>' +
      '<rect y="118" width="400" height="32" fill="#1d5a66"/>' +
      '<path d="M0 124c40-5 70 5 110 0s80 5 130 0 90 5 160 0v26H0z" fill="#237683" opacity=".8"/>' +
      '<path d="M120 118c20-22 60-22 80 0M200 118c20-22 60-22 80 0" stroke="#3b3340" stroke-width="5" fill="none"/>' +
      '</svg>' +
      '<div class="cap"><div><b>' + esc(caption) + '</b>' + esc(right || '') + '</div></div>' +
      (S ? '<button class="gear" data-act="settings" aria-label="Settings">⚙︎</button>' : '') +
      '</div>';
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
    var b = bridge(), t = today();
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

    app.innerHTML = banner('Bridge to Payday', b.days + (b.days === 1 ? ' day' : ' days') + ' to go · ' + money(b.total) + ' SAR left') +
      hero + stats + nothing + renderList() +
      '<button class="fab" data-act="log"><i>+</i> Log a purchase</button>';
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
    draft = { amt: '', src: S.lastSrc || 'cash', note: '', needNote: false };
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
    var tx = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: t, ts: Date.now(), amt: amt, cat: catId, src: draft.src, note: note };
    S.tx.push(tx);
    S.lastSrc = draft.src;
    S.checkins[t] = true;
    save();
    closeSheet();
    renderHome();
    var b = bridge();
    var msg = b.isPayday ? 'Logged ✓' : (b.left >= 0 ? 'Logged ✓  ' + money(Math.floor(b.left)) + ' left today' : 'Logged ✓  tomorrow adjusts');
    toast(msg, function () {
      S.tx = S.tx.filter(function (x) { return x.id !== tx.id; });
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
        v: 1, payday: pay, tx: [], checkins: {}, lastSrc: 'cash',
        start: { bank: num(document.getElementById('f-bank').value), cash: num(document.getElementById('f-cash').value) }
      };
      S.checkins[today()] = true;
      save(); renderHome();
      return;
    }
    if (act === 'log') return openLog();
    if (act === 'nothing') { S.checkins[today()] = true; save(); renderHome(); toast('Showed up ✓ That counts.'); return; }
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
      S.start.bank = num(document.getElementById('s-bank').value) + spentFrom('bank');
      S.start.cash = num(document.getElementById('s-cash').value) + spentFrom('cash');
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

  // refresh the number when the app is reopened on a new day
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && S && !draft && !sheetRoot.innerHTML) renderHome();
  });

  /* ---------- start ---------- */
  if (S && S.start && S.tx) renderHome(); else { S = null; renderSetup(); }

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
