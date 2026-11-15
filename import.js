/* Reads an Alinma "Brief Statement of Account" PDF on this device.
   The file is never uploaded: only the PDF-reading library itself is fetched. */
(function () {
  'use strict';
  var LIB = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  var loading = null;

  function loadLib() {
    if (window.pdfjsLib) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = LIB + 'pdf.min.js';
      s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIB + 'pdf.worker.min.js'; ok(); };
      s.onerror = function () { loading = null; fail(new Error('offline')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  var DATE = /^(\d{2})\/(\d{2})\/(\d{4})/;
  var NUM = /-?\d[\d,]*\.\d{2}/g;
  function n(s) { return parseFloat(s.replace(/,/g, '')); }
  function near(a, b) { return Math.abs(a - b) < 0.006; }

  function items(pdf) {
    var out = [], chain = Promise.resolve();
    for (var p = 1; p <= pdf.numPages; p++) (function (p) {
      chain = chain.then(function () { return pdf.getPage(p); })
        .then(function (page) { return page.getTextContent(); })
        .then(function (tc) {
          tc.items.forEach(function (it) {
            var s = (it.str || '').normalize('NFKC').trim();
            if (s) out.push({ p: p, x: it.transform[4], s: s });
          });
        });
    })(p);
    return chain.then(function () { return out; });
  }

  // which kind of bank line is it, and who is on the other side
  function describe(desc) {
    var type = 'card';
    if (/تحويل|حوال|لاوح|ليوحت/.test(desc)) type = 'transfer';
    else if (/إيداع نقدي|ايداع نقدي|يدقن عاديإ|يدقن عاديا/.test(desc)) type = 'deposit';
    else if (/السحب النقدي|يدقنلا بحسلا/.test(desc)) type = 'atm';
    else if (/الإنترنت|الانترنت|تنرتنلإا|تنرتنلاا/.test(desc)) type = 'online';
    var latin = desc
      .replace(/IBAN:?\s*SA\w+/gi, ' ').replace(/SA\d{10,}/g, ' ').replace(/FT\w{8,}/g, ' ').replace(/ATM\d+/g, ' ')
      .replace(/Apple Pay App|Apple Pay|Mada Card|SPAN|Alinma|\bSAR\b|\bIB\b|\bfor\b/gi, ' ')
      .replace(/[^A-Za-z&' ]+/g, ' ').replace(/\s+/g, ' ').trim();
    var arabic = desc.replace(/[^؀-ۿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
    return { type: type, who: latin.length >= 3 ? latin : '', arabic: arabic };
  }

  function parse(buf) {
    return loadLib().then(function () {
      return window.pdfjsLib.getDocument({ data: buf }).promise;
    }).then(items).then(function (its) {
      // the transaction-date column is where most date-only items sit
      var tally = {}, x0 = null, best = 0;
      its.forEach(function (it) {
        if (DATE.test(it.s)) { var k = Math.round(it.x / 4); tally[k] = (tally[k] || 0) + 1; if (tally[k] > best) { best = tally[k]; x0 = k; } }
      });
      var blocks = [], cur = null, skip = false;
      its.forEach(function (it) {
        var m = DATE.exec(it.s);
        if (m && Math.abs(Math.round(it.x / 4) - x0) <= 1) {
          cur = { date: m[3] + '-' + m[2] + '-' + m[1], text: it.s.slice(10) };
          blocks.push(cur); skip = false;
          return;
        }
        if (/regulated by|Brief Statement/.test(it.s)) skip = true;
        if (cur && !skip) cur.text += ' ' + it.s;
      });

      var rows = [], prev = null, unsure = 0;
      blocks.forEach(function (b) {
        var nums = (b.text.match(NUM) || []), amt = null, bal = null, i, j;
        if (prev !== null) {
          for (i = 0; i < nums.length && amt === null; i++) for (j = 0; j < nums.length; j++) {
            if (i === j) continue;
            var a = Math.abs(n(nums[i])), c = n(nums[j]);
            if (near(prev - a, c)) { amt = -a; bal = c; break; }
            if (near(prev + a, c)) { amt = a; bal = c; break; }
          }
        }
        if (amt === null) {
          // fall back on the layout: "-debit balance" or "balance credit"
          for (i = 0; i < nums.length - 1; i++) if (nums[i].charAt(0) === '-') { amt = n(nums[i]); bal = n(nums[i + 1]); break; }
          if (amt === null && nums.length >= 2) { bal = n(nums[nums.length - 2]); amt = n(nums[nums.length - 1]); }
          if (prev !== null) unsure++;
        }
        if (amt === null || !amt) return;
        prev = bal;
        var desc = b.text.replace(NUM, ' ').replace(/\s+/g, ' ').trim(), d = describe(desc);
        rows.push({ key: b.date + '|' + amt.toFixed(2) + '|' + bal.toFixed(2), date: b.date, amt: amt, bal: bal, desc: desc, type: d.type, who: d.who, arabic: d.arabic });
      });
      if (!rows.length) throw new Error('empty');
      return { rows: rows, unsure: unsure, closing: rows[rows.length - 1].bal, last: rows[rows.length - 1].date };
    });
  }

  // Alinma purchase texts, saved one after another into a text file by an iPhone Shortcut:
  //   شراء عبر نقاط بيع SAR 39.42 / بطاقة 9*** مدى- ApplePay / من MOHAMMED R* / في 23:51 26-11-15
  // The date is YY-MM-DD. The texts carry no balance, so the key is date + time + amount.
  var SMS = /شراء([^\n]*?)SAR\s*([\d,]+(?:\.\d+)?)([\s\S]*?)في\s*(\d{1,2}):(\d{2})\s+(\d{2})-(\d{2})-(\d{2})/g;
  function parseSms(text) {
    text = String(text || '').replace(/\r/g, '');
    var rows = [], m;
    SMS.lastIndex = 0;
    while ((m = SMS.exec(text))) {
      var amt = n(m[2]);
      if (!amt) continue;
      var date = '20' + m[6] + '-' + m[7] + '-' + m[8], time = ('0' + m[4]).slice(-2) + ':' + m[5];
      var from = /من\s+([^\n]+)/.exec(m[3]), shop = from ? from[1].replace(/\*+\s*$/, '').trim() : '';
      var d = describe(shop);
      rows.push({
        key: 'sms|' + date + '|' + time + '|' + amt.toFixed(2), date: date, time: time, amt: -amt, bal: null,
        desc: shop, type: /الإنترنت|الانترنت/.test(m[1]) ? 'online' : 'card', who: d.who, arabic: d.arabic, sms: true
      });
    }
    // texts that mention SAR but aren't a purchase in the format above (transfers, refunds, a new layout)
    var sar = (text.match(/SAR/g) || []).length;
    return { rows: rows, other: Math.max(0, sar - rows.length) };
  }

  window.RKImport = { parse: parse, parseSms: parseSms };
})();
