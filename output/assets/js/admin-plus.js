/**
 * admin-plus.js — extended admin dashboards for Velox Peptides
 *
 * Loads AFTER admin.js. Self-contained: detects the signed-in admin session,
 * then fills the extra Overview sections, the Traffic tab, the SEO tab and the
 * Customers retention sections.
 *
 * A shared time-range control (1h / 12h / 1 day / 1 week / 1 month / 3 months /
 * 1 year / All) drives every order- and visit-based section. Order metrics are
 * computed client-side from the `orders` table; traffic/loyalty come from
 * /api/admin/overview (which aggregates the chosen window); search data from
 * /api/admin/seo. Nothing here writes data — read-only dashboards.
 */
(function () {
  'use strict';

  // ── Tiny helpers ────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var gbp2 = function (v) { return '£' + (Number(v) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var pct1 = function (v) { return (Number(v) || 0).toFixed(1) + '%'; };
  var num  = function (v) { return (Number(v) || 0).toLocaleString('en-GB'); };
  function ymd(d) { return new Date(d).toISOString().slice(0, 10); }
  function isPaid(o) { return o.status === 'paid' || o.status === 'dispatched' || o.status === 'delivered'; }
  function items(o) {
    var it = o.items; if (typeof it === 'string') { try { it = JSON.parse(it); } catch (e) { it = []; } }
    return Array.isArray(it) ? it : [];
  }
  function units(o) { return items(o).reduce(function (s, x) { return s + (Number(x.qty || x.quantity) || 1); }, 0); }

  // Δ chip comparing a value to a baseline (up = green by default).
  function delta(curr, base, opts) {
    opts = opts || {};
    if (base === 0 && curr === 0) return '<span style="color:var(--t3,#6b7280)">—</span>';
    var goodUp = opts.goodUp !== false;
    var pctTxt, up;
    if (base === 0 || base == null) { pctTxt = 'new'; up = true; }
    else { var ch = (curr - base) / Math.abs(base) * 100; up = ch >= 0; pctTxt = (ch >= 0 ? '+' : '') + ch.toFixed(0) + '%'; }
    var good = up === goodUp;
    var col = (base === 0 || base == null) ? '#01D3A0' : (good ? '#01D3A0' : '#f87171');
    var arrow = (base === 0 || base == null) ? '★' : (up ? '▲' : '▼');
    return '<span style="color:' + col + ';font-weight:600">' + arrow + ' ' + pctTxt + '</span>';
  }

  function card(label, value, sub, accent) {
    return '<div class="stat-card">' +
      '<div class="stat-label">' + esc(label) + '</div>' +
      '<div class="stat-value"' + (accent ? ' style="color:' + accent + '"' : '') + '>' + value + '</div>' +
      '<div class="stat-sub">' + (sub || '') + '</div></div>';
  }
  function setHTML(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; }

  function barChart(data, fmt, height) {
    height = height || 90;
    var max = Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1]));
    return '<div style="display:flex;align-items:flex-end;gap:3px;height:' + height + 'px;border-bottom:1px solid var(--brd,#1a1a1a);padding-bottom:2px">' +
      data.map(function (d) {
        var h = Math.max(2, Math.round(d.value / max * (height - 18)));
        var col = d.hi ? '#01D3A0' : (d.value ? '#2f6f60' : '#1a1a1a');
        return '<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px" title="' + esc(d.label) + ': ' + fmt(d.value) + '">' +
          '<div style="width:72%;min-height:2px;height:' + h + 'px;background:' + col + ';border-radius:3px 3px 0 0"></div>' +
          '<div style="font-size:7px;color:var(--t3,#6b7280);writing-mode:vertical-rl;transform:rotate(180deg);height:34px;overflow:hidden">' + esc(d.short || '') + '</div>' +
        '</div>';
      }).join('') + '</div>';
  }

  // ── Shared time-range control ─────────────────────────────────────────────
  var PERIODS = [
    { key: '1h',  min: 60,      label: '1 hour' },
    { key: '12h', min: 720,     label: '12 hours' },
    { key: '1d',  min: 1440,    label: '1 day' },
    { key: '1w',  min: 10080,   label: '1 week' },
    { key: '1mo', min: 43200,   label: '1 month' },
    { key: '3mo', min: 129600,  label: '3 months' },
    { key: '1yr', min: 525600,  label: '1 year' },
    { key: 'all', min: null,    label: 'All' },
  ];
  var PERIOD = PERIODS[3]; // default: 1 week
  function periodLabel() { return PERIOD.label; }
  function winBounds() {
    var len = PERIOD.min != null ? PERIOD.min * 60000 : null;
    return { len: len, since: len != null ? Date.now() - len : null };
  }
  function periodBarHtml() {
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:16px">' +
      '<span style="font-size:11px;color:var(--t3,#6b7280);text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-right:2px">Time range</span>' +
      PERIODS.map(function (p) {
        var on = p.key === PERIOD.key;
        return '<button class="status-select" style="cursor:pointer;padding:7px 13px;' +
          (on ? 'color:#01D3A0;border-color:#01D3A0' : '') + '" onclick="veloxSetPeriod(\'' + p.key + '\')">' + p.label + '</button>';
      }).join('') + '</div>';
  }
  function renderPeriodBars() {
    var bars = document.querySelectorAll('.vlx-period-bar');
    for (var i = 0; i < bars.length; i++) bars[i].innerHTML = periodBarHtml();
  }
  window.veloxSetPeriod = function (k) {
    var p = PERIODS.filter(function (x) { return x.key === k; })[0];
    if (!p) return;
    PERIOD = p;
    renderPeriodBars();
    renderOverview();
    renderCustomerDepth();
    refetchTraffic();
  };

  // ── State ───────────────────────────────────────────────────────────────
  var ORDERS = [], VARIANTS = [], AFFILIATES = [], OVERVIEW = null, started = false;

  async function token() {
    try { var s = await window._sb.auth.getSession(); return s && s.data && s.data.session && s.data.session.access_token; }
    catch (e) { return null; }
  }
  async function apiGet(path) {
    var t = await token(); if (!t) return null;
    try { var r = await fetch(path, { headers: { Authorization: 'Bearer ' + t } }); return await r.json(); }
    catch (e) { return null; }
  }
  async function apiPost(path, body) {
    var t = await token(); if (!t) return { ok: false, d: { error: 'Not signed in' } };
    try {
      var r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t }, body: JSON.stringify(body) });
      var d = await r.json().catch(function () { return {}; });
      return { ok: r.ok, d: d };
    } catch (e) { return { ok: false, d: { error: e.message } }; }
  }

  // ── Email-marketing test sends (deliver only to support@veloxpeps.com) ────
  window.veloxSendTest = async function (type, label, stage) {
    var out = document.getElementById('mkt-run-result');
    label = label || type;
    var toEl = document.getElementById('mkt-test-to');
    var to = ((toEl && toEl.value) || '').trim();
    var dest = to || 'the default inbox';
    if (out) { out.style.display = 'block'; out.textContent = 'Sending test “' + label + '” to ' + dest + '…'; }
    var payload = { type: type };
    if (stage) payload.stage = stage;
    if (to) payload.to = to;
    var r = await apiPost('/api/admin/send-test', payload);
    var ok = r && r.ok && r.d && r.d.ok;
    var sentTo = (r && r.d && r.d.to) || dest;
    if (out) out.textContent = ok
      ? '✓ Test “' + label + '” sent to ' + sentTo + ' — check that inbox.'
      : 'Test failed: ' + ((r && r.d && r.d.error) || 'unknown error');
    if (window.showToast) showToast(ok ? ('Test sent to ' + sentTo) : 'Test failed', ok ? 'ok' : 'err');
  };

  window.veloxSendTestCampaign = async function () {
    var subj = ((document.getElementById('camp-subject') || {}).value || '').trim();
    var msg = ((document.getElementById('camp-message') || {}).value || '').trim();
    var seg = (document.getElementById('camp-segment') || {}).value || 'all';
    var m = document.getElementById('camp-msg');
    function set(t, ok) { if (m) { m.style.color = ok ? '#01D3A0' : '#f87171'; m.textContent = t; } }
    if (!subj || !msg) { set('Add a subject and message first.', false); return; }
    set('Sending test to support@veloxpeps.com…', true); if (m) m.style.color = '#9ca3af';
    var r = await apiPost('/api/admin/marketing', { action: 'campaign', test: true, subject: subj, body: msg, segment: seg });
    var ok = r && r.ok && r.d && r.d.sent > 0;
    set(ok ? '✓ Test sent to support@veloxpeps.com — check that inbox.' : ('Test failed: ' + ((r && r.d && r.d.error) || 'unknown error')), ok);
    if (window.showToast) showToast(ok ? 'Test sent to support@veloxpeps.com' : 'Test failed', ok ? 'ok' : 'err');
  };

  async function loadData() {
    if (!window._sb) return;
    var res = await Promise.all([
      window._sb.from('orders').select('*').order('created_at', { ascending: false }),
      window._sb.from('product_variants').select('*').order('slug', { ascending: true }),
      window._sb.from('affiliates').select('*'),
    ]);
    ORDERS     = (res[0] && res[0].data) || [];
    VARIANTS   = (res[1] && res[1].data) || [];
    AFFILIATES = (res[2] && res[2].data) || [];
    renderInventory();
    renderOverview();
    renderCustomerDepth();
    await refetchTraffic();
    loadSEO();
  }

  async function refetchTraffic() {
    var wb = winBounds();
    OVERVIEW = await apiGet('/api/admin/overview' + (wb.len != null ? ('?minutes=' + PERIOD.min) : ''));
    renderOverview();          // visitors/conversion cards depend on traffic totals
    renderTrafficSnapshot();
    renderTraffic();
    renderLoyalty();
  }

  // ── Order-window aggregation ──────────────────────────────────────────────
  function ordersIn(sinceMs, untilMs) {
    var rev = 0, n = 0, u = 0;
    ORDERS.forEach(function (o) {
      if (!isPaid(o)) return;
      var t = new Date(o.created_at).getTime();
      if ((sinceMs == null || t >= sinceMs) && (untilMs == null || t < untilMs)) { rev += Number(o.total) || 0; n++; u += units(o); }
    });
    return { rev: rev, n: n, u: u };
  }

  // ── OVERVIEW: trends, products, channels, traffic snapshot ────────────────
  function renderOverview() {
    var wb = winBounds();
    var cur = ordersIn(wb.since, null);
    var prev = wb.len != null ? ordersIn(wb.since - wb.len, wb.since) : null;
    var aov = cur.n ? cur.rev / cur.n : 0, aovP = prev && prev.n ? prev.rev / prev.n : 0;
    var tot = (OVERVIEW && OVERVIEW.traffic) ? (OVERVIEW.traffic.totals || {}) : {};
    var vis = tot.visitors, visP = tot.visitorsPrev;
    var conv = vis ? cur.n / vis * 100 : null;
    var convP = (visP && prev) ? prev.n / visP * 100 : null;
    var vs = ' vs prev';

    setHTML('ovx-trends',
      card('Revenue', gbp2(cur.rev), prev ? delta(cur.rev, prev.rev) + vs : periodLabel()) +
      card('Orders', num(cur.n), prev ? delta(cur.n, prev.n) + vs : periodLabel()) +
      card('AOV', gbp2(aov), prev ? delta(aov, aovP) + vs : (cur.n + ' orders')) +
      card('Units', num(cur.u), prev ? delta(cur.u, prev.u) + vs : periodLabel()) +
      card('Visitors', vis != null ? num(vis) : '—', (visP != null && prev) ? delta(vis, visP) + vs : 'unique devices') +
      card('Conversion', conv != null ? pct1(conv) : '—', (convP != null) ? delta(conv, convP) + vs : (vis ? (cur.n + ' / ' + num(vis)) : 'no visit data')));

    // Top products (window)
    var prod = {};
    ORDERS.forEach(function (o) {
      if (!isPaid(o)) return;
      var t = new Date(o.created_at).getTime();
      if (wb.since != null && t < wb.since) return;
      items(o).forEach(function (it) {
        var key = it.slug || it.name || 'item';
        var q = Number(it.qty || it.quantity) || 1, rev = q * (Number(it.price) || 0);
        if (!prod[key]) prod[key] = { name: it.name || it.slug || 'Item', units: 0, rev: 0 };
        prod[key].units += q; prod[key].rev += rev;
      });
    });
    var list = Object.keys(prod).map(function (k) { return prod[k]; }).sort(function (a, b) { return b.rev - a.rev; });
    var totalRev = list.reduce(function (s, p) { return s + p.rev; }, 0) || 1;
    if (!list.length) setHTML('ovx-products', '<div class="adm-empty">No paid orders in this period.</div>');
    else setHTML('ovx-products', '<table class="adm-table"><thead><tr><th>Product</th><th>Units</th><th>Revenue</th><th>Share</th></tr></thead><tbody>' +
      list.slice(0, 8).map(function (p) {
        var share = p.rev / totalRev * 100;
        return '<tr><td style="color:#fff">' + esc(p.name) + '</td><td>' + p.units + '</td>' +
          '<td style="color:var(--g,#01D3A0);font-weight:600">' + gbp2(p.rev) + '</td>' +
          '<td><div style="display:flex;align-items:center;gap:7px"><div style="flex:1;max-width:90px;height:6px;background:#15181d;border-radius:3px;overflow:hidden"><div style="width:' + share.toFixed(0) + '%;height:100%;background:#01D3A0"></div></div><span style="color:var(--t3,#6b7280);font-size:11px">' + share.toFixed(0) + '%</span></div></td></tr>';
      }).join('') + '</tbody></table>');

    // Recovery + affiliate contribution (window)
    var rec = { n: 0, rev: 0 }, aff = {};
    ORDERS.forEach(function (o) {
      if (!isPaid(o)) return;
      var t = new Date(o.created_at).getTime();
      if (wb.since != null && t < wb.since) return;
      if (Number(o.recovery_stage || 0) > 0) { rec.n++; rec.rev += Number(o.total) || 0; }
      if (o.affiliate_code_used) { var c = o.affiliate_code_used.toUpperCase(); if (!aff[c]) aff[c] = { n: 0, rev: 0 }; aff[c].n++; aff[c].rev += Number(o.total) || 0; }
    });
    var affCodes = Object.keys(aff).map(function (c) { return { code: c, n: aff[c].n, rev: aff[c].rev }; }).sort(function (a, b) { return b.rev - a.rev; });
    var activeAff = AFFILIATES.filter(function (a) { return a.status === 'active'; }).length;
    var pendAff = AFFILIATES.filter(function (a) { return a.status === 'pending_approval'; }).length;
    var affRev = affCodes.reduce(function (s, a) { return s + a.rev; }, 0);
    setHTML('ovx-channels',
      card('Recovered', gbp2(rec.rev), rec.n + (rec.n === 1 ? ' recovery order' : ' recovery orders'), '#01D3A0') +
      card('Affiliate rev', gbp2(affRev), affCodes.length ? (affCodes[0].code + ' leads') : 'no coded orders') +
      card('Active affiliates', String(activeAff), pendAff + ' pending approval') +
      card('Top code', affCodes.length ? affCodes[0].code : '—', affCodes.length ? (affCodes[0].n + ' orders · ' + gbp2(affCodes[0].rev)) : 'recruit your first'));

    renderTrafficSnapshot();
  }

  function renderTrafficSnapshot() {
    if (!OVERVIEW || !OVERVIEW.traffic) { setHTML('ovx-traffic', '<div class="adm-empty">Traffic data unavailable.</div>'); return; }
    var tr = OVERVIEW.traffic, t = tr.totals || {};
    var topPage = (tr.topPages || [])[0], topRef = (tr.topReferrers || [])[0];
    setHTML('ovx-traffic',
      card('Pageviews', num(t.pageviews), periodLabel()) +
      card('Pages / visitor', t.visitors ? (t.pageviews / t.visitors).toFixed(1) : '—', 'this period') +
      card('Top page', topPage ? esc(topPage.path) : '—', topPage ? (num(topPage.views) + ' views') : '') +
      card('Top source', topRef ? esc(topRef.source) : '—', topRef ? (num(topRef.count) + ' visits') : ''));
  }

  // ── INVENTORY HEALTH (global, not period-bound) ───────────────────────────
  function renderInventory() {
    var out = [], low = [];
    VARIANTS.forEach(function (v) {
      var qty = v.stock_qty;
      if (v.in_stock === false) out.push(v);
      else if (v.low_stock === true || (qty != null && qty <= 5)) low.push(v);
    });
    var chip = function (txt, col) { return '<span style="display:inline-block;font-size:11px;font-weight:700;padding:2px 9px;border-radius:999px;background:' + col + '22;color:' + col + ';margin:0 6px 6px 0">' + esc(txt) + '</span>'; };
    setHTML('ovx-inv-stats',
      card('Out of stock', String(out.length), out.length ? 'needs restocking' : 'all in stock', out.length ? '#f87171' : '#01D3A0') +
      card('Low stock', String(low.length), '≤5 vials or flagged', low.length ? '#fbbf24' : '#01D3A0') +
      card('Live variants', String(VARIANTS.length), 'sizes across catalogue'));

    var rows = VARIANTS.filter(function (v) { return v.stock_qty != null; })
      .sort(function (a, b) { return (a.stock_qty || 0) - (b.stock_qty || 0); }).slice(0, 14);
    var watch = rows.length ? '<table class="adm-table"><thead><tr><th>Product</th><th>Size</th><th>In stock</th><th>Qty</th><th>Status</th></tr></thead><tbody>' +
      rows.map(function (v) {
        var status = v.in_stock === false ? chip('OUT', '#f87171')
          : (v.low_stock || (v.stock_qty != null && v.stock_qty <= 5)) ? chip('LOW', '#fbbf24')
          : chip('OK', '#01D3A0');
        return '<tr><td style="color:#fff">' + esc(v.name) + '</td><td style="color:var(--t2,#9ca3af)">' + esc(v.size) + '</td>' +
          '<td>' + (v.in_stock === false ? '<span style="color:#f87171">no</span>' : '<span style="color:#01D3A0">yes</span>') + '</td>' +
          '<td style="color:var(--t2,#9ca3af)">' + (v.stock_qty == null ? '—' : v.stock_qty) + '</td><td>' + status + '</td></tr>';
      }).join('') + '</tbody></table>' : '<div class="adm-empty">No per-variant stock quantities set yet — add them in the Pricing tab to power this watchlist.</div>';
    var alertHtml = '';
    if (out.length) alertHtml += '<div style="margin-bottom:10px"><span style="color:#f87171;font-weight:700;font-size:12px">OUT OF STOCK &nbsp;</span>' + out.map(function (v) { return chip(v.name + ' ' + v.size, '#f87171'); }).join('') + '</div>';
    if (low.length) alertHtml += '<div style="margin-bottom:10px"><span style="color:#fbbf24;font-weight:700;font-size:12px">RUNNING LOW &nbsp;</span>' + low.map(function (v) { return chip(v.name + ' ' + v.size, '#fbbf24'); }).join('') + '</div>';
    if (!alertHtml) alertHtml = '<div style="color:#01D3A0;font-size:13px;margin-bottom:8px">✓ Everything in stock — no low or out-of-stock variants.</div>';
    setHTML('ovx-inv-alerts', alertHtml);
    setHTML('ovx-inv-watch', watch);
  }

  // ── TRAFFIC TAB ──────────────────────────────────────────────────────────
  function renderTraffic() {
    if (!OVERVIEW || !OVERVIEW.traffic) { setHTML('traffic-body', '<div class="adm-empty">Traffic data unavailable — check /api/admin/overview.</div>'); return; }
    var tr = OVERVIEW.traffic, t = tr.totals || {};
    if (!tr.tracked) { setHTML('traffic-body', '<div class="adm-empty">No visits in this window. The site logs first-party page views to the <code>visits</code> table via /api/track.</div>'); return; }

    var wb = winBounds();
    var cur = ordersIn(wb.since, null);
    var prev = wb.len != null ? ordersIn(wb.since - wb.len, wb.since) : null;
    var conv = t.visitors ? cur.n / t.visitors * 100 : 0;
    var convP = (t.visitorsPrev && prev) ? prev.n / t.visitorsPrev * 100 : null;
    var vs = ' vs prev';

    var stats =
      card('Visitors', num(t.visitors), (t.visitorsPrev != null && prev) ? delta(t.visitors, t.visitorsPrev) + vs : 'unique devices') +
      card('Pageviews', num(t.pageviews), (t.pageviewsPrev != null) ? delta(t.pageviews, t.pageviewsPrev) + vs : periodLabel()) +
      card('Pages / visitor', t.visitors ? (t.pageviews / t.visitors).toFixed(1) : '—', 'this period') +
      card('Orders', num(cur.n), prev ? delta(cur.n, prev.n) + vs : periodLabel()) +
      card('Conversion', t.visitors ? pct1(conv) : '—', convP != null ? delta(conv, convP) + vs : (cur.n + ' / ' + num(t.visitors))) +
      card('Revenue', gbp2(cur.rev), prev ? delta(cur.rev, prev.rev) + vs : periodLabel());

    var chartData = (tr.series || []).map(function (s) { return { label: s.label, short: s.label, value: s.visitors }; });
    var chart = '<div style="font-size:11px;color:var(--t3,#6b7280);margin:0 0 6px">Unique visitors · ' + esc(periodLabel()) + '</div>' + barChart(chartData, num, 110);

    var inWin = ORDERS.filter(function (o) { var t2 = new Date(o.created_at).getTime(); return wb.since == null || t2 >= wb.since; });
    var placed = inWin.length, paidN = inWin.filter(isPaid).length;
    var fSteps = [
      { l: 'Visitors', v: t.visitors, c: '#4a9fe0' },
      { l: 'Orders placed', v: placed, c: '#a78bfa' },
      { l: 'Paid / dispatched', v: paidN, c: '#01D3A0' },
    ];
    var fmax = Math.max(t.visitors, 1);
    var funnel = '<div style="display:flex;flex-direction:column;gap:8px">' + fSteps.map(function (s, i) {
      var w = Math.max(4, s.v / fmax * 100);
      var rate = i === 0 ? '' : (fSteps[0].v ? ' · ' + (s.v / fSteps[0].v * 100).toFixed(1) + '% of visitors' : '');
      return '<div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span style="color:#e5e7eb">' + s.l + '</span><span style="color:var(--t3,#6b7280)">' + num(s.v) + rate + '</span></div>' +
        '<div style="height:14px;background:#15181d;border-radius:4px;overflow:hidden"><div style="width:' + w + '%;height:100%;background:' + s.c + '"></div></div></div>';
    }).join('') + '</div>';

    var pages = (tr.topPages || []).slice(0, 10);
    var pagesT = pages.length ? '<table class="adm-table"><thead><tr><th>Page</th><th>Views</th><th>Visitors</th></tr></thead><tbody>' +
      pages.map(function (p) { return '<tr><td style="color:#fff">' + esc(p.path) + '</td><td style="color:var(--g,#01D3A0);font-weight:600">' + num(p.views) + '</td><td style="color:var(--t2,#9ca3af)">' + num(p.visitors) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="adm-empty">No page data.</div>';

    var refs = (tr.topReferrers || []).slice(0, 10);
    var refsT = refs.length ? '<table class="adm-table"><thead><tr><th>Source</th><th>Visits</th></tr></thead><tbody>' +
      refs.map(function (r) { return '<tr><td style="color:#fff">' + esc(r.source) + '</td><td style="color:var(--g,#01D3A0);font-weight:600">' + num(r.count) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="adm-empty">No referrer data.</div>';

    setHTML('traffic-body',
      '<div class="stat-grid">' + stats + '</div>' +
      '<div style="margin:6px 0 22px">' + chart + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px" class="traffic-cols">' +
        '<div><div style="font-size:12px;color:var(--t2,#9ca3af);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Conversion funnel · ' + esc(periodLabel()) + '</div>' + funnel + '</div>' +
        '<div><div style="font-size:12px;color:var(--t2,#9ca3af);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Top referrers</div>' + refsT + '</div>' +
      '</div>' +
      '<div style="margin-top:22px"><div style="font-size:12px;color:var(--t2,#9ca3af);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Top pages</div>' + pagesT + '</div>');
  }

  function renderLoyalty() {
    if (!OVERVIEW || !OVERVIEW.loyalty) return;
    var l = OVERVIEW.loyalty, t = l.tiers || {};
    setHTML('cust-loyalty',
      card('Members', num(l.members), 'with an account') +
      card('Platinum', String(t.Platinum || 0), '5,000+ pts') +
      card('Gold', String(t.Gold || 0), '1,500+ pts') +
      card('Silver', String(t.Silver || 0), '500+ pts') +
      card('Bronze', String(t.Bronze || 0), 'starter tier') +
      card('Points live', num(l.pointsLive), num(l.pointsLifetime) + ' lifetime'));
  }

  // ── CUSTOMERS: retention depth ───────────────────────────────────────────
  function renderCustomerDepth() {
    var wb = winBounds();
    var paid = ORDERS.filter(isPaid).slice().sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); });
    var byCust = {};
    paid.forEach(function (o) {
      var k = (o.customer_email || o.customer_name || 'unknown').toLowerCase();
      if (!byCust[k]) byCust[k] = { name: o.customer_name, email: o.customer_email, orders: [], spend: 0, first: o.created_at, last: o.created_at };
      var c = byCust[k]; c.orders.push(o); c.spend += Number(o.total) || 0;
      if (new Date(o.created_at) < new Date(c.first)) c.first = o.created_at;
      if (new Date(o.created_at) > new Date(c.last)) c.last = o.created_at;
    });
    var custs = Object.keys(byCust).map(function (k) { return byCust[k]; });
    var total = custs.length;
    var repeat = custs.filter(function (c) { return c.orders.length > 1; }).length;
    var repeatRate = total ? repeat / total * 100 : 0;
    var ltv = total ? custs.reduce(function (s, c) { return s + c.spend; }, 0) / total : 0;

    // window-scoped: orders, revenue, new vs returning
    var winOrders = 0, winRev = 0, newN = 0, retN = 0;
    paid.forEach(function (o) {
      var t = new Date(o.created_at).getTime();
      if (wb.since != null && t < wb.since) return;
      winOrders++; winRev += Number(o.total) || 0;
      var k = (o.customer_email || o.customer_name || 'unknown').toLowerCase();
      var prior = byCust[k].orders.some(function (p) { return new Date(p.created_at).getTime() < t; });
      if (prior) retN++; else newN++;
    });

    setHTML('cust-retention-stats',
      card('Orders', num(winOrders), periodLabel()) +
      card('Revenue', gbp2(winRev), periodLabel()) +
      card('New buyers', num(newN), periodLabel() + ' · first order') +
      card('Returning', num(retN), periodLabel() + ' · repeat order') +
      card('Repeat rate', pct1(repeatRate), repeat + ' of ' + total + ' all-time', repeat ? '#01D3A0' : null) +
      card('Avg LTV', gbp2(ltv), 'all-time per customer'));

    // Cohorts by first-order month (global)
    var coh = {};
    custs.forEach(function (c) {
      var key = ymd(c.first).slice(0, 7);
      if (!coh[key]) coh[key] = { n: 0, repeat: 0, spend: 0 };
      coh[key].n++; coh[key].spend += c.spend;
      if (c.orders.length > 1) coh[key].repeat++;
    });
    var cohKeys = Object.keys(coh).sort();
    setHTML('cust-cohorts', cohKeys.length ? '<table class="adm-table"><thead><tr><th>First ordered</th><th>Customers</th><th>Became repeat</th><th>Cohort revenue</th></tr></thead><tbody>' +
      cohKeys.map(function (k) {
        var c = coh[k]; var rr = c.n ? (c.repeat / c.n * 100).toFixed(0) : 0;
        var label = new Date(k + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        return '<tr><td style="color:#fff">' + label + '</td><td>' + c.n + '</td><td style="color:var(--t2,#9ca3af)">' + c.repeat + ' · ' + rr + '%</td><td style="color:var(--g,#01D3A0);font-weight:600">' + gbp2(c.spend) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<div class="adm-empty">No cohorts yet.</div>');

    // Reorder-due: last order 25–60 days ago (global)
    var nowT = Date.now();
    var due = custs.map(function (c) { return { c: c, days: Math.floor((nowT - new Date(c.last).getTime()) / 86400000) }; })
      .filter(function (x) { return x.days >= 25 && x.days <= 60; }).sort(function (a, b) { return a.days - b.days; });
    var lastProduct = function (c) { var o = c.orders[c.orders.length - 1]; var its = items(o); return its.length ? (its[0].name || its[0].slug || '') : ''; };
    setHTML('cust-reorder', due.length ? '<table class="adm-table"><thead><tr><th>Customer</th><th>Last order</th><th>Days ago</th><th>Last bought</th><th>Spent</th></tr></thead><tbody>' +
      due.slice(0, 20).map(function (x) {
        var c = x.c;
        return '<tr><td><div style="color:#fff">' + esc(c.name || '—') + '</div><div style="color:var(--t3,#6b7280);font-size:11px">' + esc(c.email || '') + '</div></td>' +
          '<td style="color:var(--t2,#9ca3af)">' + new Date(c.last).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + '</td>' +
          '<td style="color:#fbbf24;font-weight:600">' + x.days + 'd</td>' +
          '<td style="color:var(--t2,#9ca3af)">' + esc(lastProduct(c)) + '</td>' +
          '<td style="color:var(--g,#01D3A0)">' + gbp2(c.spend) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<div class="adm-empty">No customers are in the 25–60 day reorder window yet.</div>');
  }

  // ── SEO TAB (day-based; GSC is daily and lags ~3 days) ────────────────────
  var SEO_RANGE = { type: 'rel', key: '1m' };
  function seoMonthsList() {
    var out = [], now = new Date();
    for (var i = 0; i < 16; i++) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ val: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
                 label: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) });
    }
    return out;
  }
  function seoBtn(key, label) {
    var on = SEO_RANGE.type === 'rel' && SEO_RANGE.key === key;
    return '<button class="status-select" style="cursor:pointer;padding:7px 13px;' +
      (on ? 'color:#01D3A0;border-color:#01D3A0' : '') + '" onclick="veloxSeoSetRange(\'' + key + '\')">' + label + '</button>';
  }
  function seoControlsHtml() {
    var monthOn = SEO_RANGE.type === 'month';
    var opts = '<option value="">Pick a month…</option>' + seoMonthsList().map(function (m) {
      return '<option value="' + m.val + '"' + (monthOn && SEO_RANGE.month === m.val ? ' selected' : '') + '>' + m.label + '</option>';
    }).join('');
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px">' +
      '<span style="font-size:11px;color:var(--t3,#6b7280);text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-right:2px">Time range</span>' +
      seoBtn('7d', '1 week') + seoBtn('1m', '1 month') + seoBtn('3m', '3 months') + seoBtn('quarter', 'Quarter') + seoBtn('year', 'Year') +
      '<select class="status-select" style="cursor:pointer;padding:7px 10px;' + (monthOn ? 'color:#01D3A0;border-color:#01D3A0' : '') + '" onchange="veloxSeoSetMonth(this.value)">' + opts + '</select>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--t3,#6b7280);margin-bottom:12px">Search Console data is daily and runs ~3 days behind, so hourly ranges aren\'t available here.</div>';
  }
  window.veloxSeoSetRange = function (k) { SEO_RANGE = { type: 'rel', key: k }; loadSEO(); };
  window.veloxSeoSetMonth = function (m) { if (!m) return; SEO_RANGE = { type: 'month', month: m }; loadSEO(); };

  async function loadSEO() {
    var qs = SEO_RANGE.type === 'month'
      ? ('?range=month&month=' + encodeURIComponent(SEO_RANGE.month))
      : ('?range=' + SEO_RANGE.key);
    setHTML('seo-body', seoControlsHtml() + '<div class="adm-loading">Loading Search Console…</div>');
    var d = await apiGet('/api/admin/seo' + qs);
    if (!d) { setHTML('seo-body', seoControlsHtml() + '<div class="adm-empty">Could not reach the SEO endpoint.</div>'); return; }
    if (d.configured === false) {
      setHTML('seo-body', seoControlsHtml() +
        '<div class="adm-empty" style="line-height:1.6">Google Search Console isn\'t connected yet. Set the GSC OAuth credentials in Vercel and redeploy — then this tab shows live clicks, impressions, queries and pages.</div>');
      return;
    }
    if (d.error) { setHTML('seo-body', seoControlsHtml() + '<div class="adm-empty">Search Console error: ' + esc(d.error) + '</div>'); return; }

    var t = d.totals || {}, p = d.prev || {};
    var stats = card('Clicks', num(t.clicks), delta(t.clicks, p.clicks) + ' vs prev') +
      card('Impressions', num(t.impressions), delta(t.impressions, p.impressions) + ' vs prev') +
      card('CTR', (t.ctr * 100).toFixed(1) + '%', delta(t.ctr, p.ctr) + ' vs prev') +
      card('Avg position', (t.position || 0).toFixed(1), delta(p.position, t.position, { goodUp: true }) + ' vs prev');

    var posCol = function (v) { return v <= 10 ? '#01D3A0' : v <= 25 ? '#fbbf24' : '#f87171'; };
    var qrows = (d.queries || []).slice(0, 15);
    var qT = qrows.length ? '<table class="adm-table"><thead><tr><th>Query</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos</th></tr></thead><tbody>' +
      qrows.map(function (q) {
        return '<tr><td style="color:#fff">' + esc(q.query) + '</td><td>' + num(q.clicks) + '</td><td style="color:var(--t2,#9ca3af)">' + num(q.impressions) + '</td>' +
          '<td style="color:var(--t2,#9ca3af)">' + (q.ctr * 100).toFixed(1) + '%</td><td style="color:' + posCol(q.position) + ';font-weight:600">' + q.position.toFixed(1) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<div class="adm-empty">No query data.</div>';

    var prows = (d.pages || []).slice(0, 15);
    var pT = prows.length ? '<table class="adm-table"><thead><tr><th>Page</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos</th></tr></thead><tbody>' +
      prows.map(function (pg) {
        var path = pg.page.replace(/^https?:\/\/[^/]+/, '');
        return '<tr><td style="color:#fff">' + esc(path) + '</td><td>' + num(pg.clicks) + '</td><td style="color:var(--t2,#9ca3af)">' + num(pg.impressions) + '</td>' +
          '<td style="color:var(--t2,#9ca3af)">' + (pg.ctr * 100).toFixed(1) + '%</td><td style="color:' + posCol(pg.position) + ';font-weight:600">' + pg.position.toFixed(1) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<div class="adm-empty">No page data.</div>';

    var opp = (d.pages || []).filter(function (x) { return x.position > 20; }).sort(function (a, b) { return b.impressions - a.impressions; })[0];
    var oppHtml = opp ? '<div style="background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.3);border-radius:8px;padding:12px 14px;font-size:13px;color:#e5e7eb;margin-bottom:16px">' +
      '<strong style="color:#fbbf24">Priority page:</strong> ' + esc(opp.page.replace(/^https?:\/\/[^/]+/, '')) + ' — ' + num(opp.impressions) + ' impressions but ranking ~' + opp.position.toFixed(0) + '. Strengthen it with internal links + content depth to break onto page 1.</div>' : '';

    setHTML('seo-body',
      seoControlsHtml() +
      '<div style="font-size:11px;color:var(--t3,#6b7280);margin-bottom:12px">' + esc(d.site) + ' · ' + (d.range ? d.range.startDate + ' → ' + d.range.endDate : '') + '</div>' +
      '<div class="stat-grid">' + stats + '</div>' + oppHtml +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px" class="traffic-cols">' +
        '<div><div style="font-size:12px;color:var(--t2,#9ca3af);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Top queries</div>' + qT + '</div>' +
        '<div><div style="font-size:12px;color:var(--t2,#9ca3af);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Top pages</div>' + pT + '</div>' +
      '</div>');
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  function injectBar(anchorId) {
    var a = document.getElementById(anchorId); if (!a) return;
    var sec = (a.closest && a.closest('.adm-section')) || a;
    var prev = sec.previousElementSibling;
    if (prev && prev.className === 'vlx-period-bar') return;
    var bar = document.createElement('div'); bar.className = 'vlx-period-bar';
    sec.parentNode.insertBefore(bar, sec);
  }

  function init() {
    if (started) { loadData(); return; }
    started = true;
    ['ovx-trends', 'traffic-body', 'cust-retention-stats'].forEach(injectBar);
    renderPeriodBars();
    if (typeof window.switchTab === 'function') {
      var orig = window.switchTab;
      window.switchTab = function (tab) {
        orig(tab);
        var titles = { traffic: 'Traffic', seo: 'Search (SEO)' };
        if (titles[tab]) { var st = document.getElementById('screen-title'); if (st) st.textContent = titles[tab]; }
      };
    }
    loadData();
  }

  function boot() {
    if (!window._sb) { setTimeout(boot, 300); return; }
    window._sb.auth.getSession().then(function (r) { if (r && r.data && r.data.session) init(); });
    window._sb.auth.onAuthStateChange(function (_e, sess) { if (sess) init(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.veloxPlusRefresh = loadData;
}());
