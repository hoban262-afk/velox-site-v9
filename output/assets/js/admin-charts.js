/* admin-charts.js — "Visual overview" charts on /admin (Chart.js).
 * Renders into every .vstats-block on the page (Overview mini + full Stats tab),
 * pulling /api/admin/stats. Self-contained; does not touch admin-plus.js.
 * Blocks in a hidden tab render the moment that tab is opened (IntersectionObserver),
 * so canvases size correctly instead of collapsing to 0. */
(function () {
  'use strict';
  var GREEN = '#01D3A0', GREEN2 = '#6cf7d6', VIO = '#7b8cff', GRID = 'rgba(255,255,255,.06)', MUT = '#8aa0a0';
  var DATA = null, period = 30, booted = false, renderToken = 0, io = null;

  function gbp(n) { return '£' + (Math.round(n) || 0).toLocaleString('en-GB'); }
  function gbp2(n) { return '£' + (Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  async function token() {
    try { var s = await window._sb.auth.getSession(); return s && s.data && s.data.session && s.data.session.access_token; }
    catch (e) { return null; }
  }
  async function fetchStats(days) {
    var t = await token(); if (!t) return null;
    try {
      var r = await fetch('/api/admin/stats?days=' + days, { headers: { Authorization: 'Bearer ' + t } });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }

  function grad(ctx, color) {
    var h = (ctx.canvas && ctx.canvas.clientHeight) || 160;
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, color + '55'); g.addColorStop(1, color + '05');
    return g;
  }
  function baseOpts(extra) {
    return Object.assign({
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0e141b', borderColor: '#1a2230', borderWidth: 1, titleColor: '#fff', bodyColor: '#cdd6d4', padding: 9 } },
      animation: { duration: 650 },
    }, extra || {});
  }
  function axis(opts) {
    return Object.assign({ grid: { color: GRID, drawBorder: false }, ticks: { color: MUT, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } }, opts || {});
  }
  var TT = { backgroundColor: '#0e141b', borderColor: '#1a2230', borderWidth: 1, titleColor: '#fff', bodyColor: '#cdd6d4', padding: 9 };

  function q(el, cls) { return el.querySelector('.' + cls); }
  function setKpi(el, cls, html) { var n = q(el, cls); if (n) n.innerHTML = html; }
  var REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function countKpi(node, to, fmt, suffix, dur) {
    if (!node) return;
    to = Number(to) || 0; suffix = suffix || ''; dur = dur || 750;
    if (REDUCE) { node.innerHTML = fmt(to) + suffix; return; }
    var st = null;
    function fr(ts) {
      if (!st) st = ts;
      var p = Math.min(1, (ts - st) / dur), e = 1 - Math.pow(1 - p, 3);
      node.innerHTML = fmt(to * e) + suffix;
      if (p < 1) requestAnimationFrame(fr); else node.innerHTML = fmt(to) + suffix;
    }
    requestAnimationFrame(fr);
  }
  var fmtInt = function (v) { return Math.round(v).toLocaleString('en-GB'); };
  var fmtPct = function (v) { return (Math.round(v * 10) / 10) + '%'; };

  function renderBlock(el, d) {
    if (!d || !window.Chart) return;
    el._charts = el._charts || {};
    Object.keys(el._charts).forEach(function (k) { if (el._charts[k]) { el._charts[k].destroy(); el._charts[k] = null; } });

    // Revenue & orders (bars + line)
    var rev = d.revenueSeries || [], rc = q(el, 'ch-rev');
    if (rc) {
      el._charts.rev = new Chart(rc.getContext('2d'), {
        data: {
          labels: rev.map(function (x) { return x.date; }),
          datasets: [
            { type: 'bar', label: 'Revenue', data: rev.map(function (x) { return x.revenue; }), backgroundColor: GREEN + 'cc', borderRadius: 4, yAxisID: 'y', order: 2 },
            { type: 'line', label: 'Orders', data: rev.map(function (x) { return x.orders; }), borderColor: VIO, backgroundColor: VIO, tension: 0.35, pointRadius: 0, borderWidth: 2, yAxisID: 'y1', order: 1 },
          ],
        },
        options: baseOpts({
          plugins: { legend: { display: true, labels: { color: MUT, boxWidth: 10, font: { size: 10 } } }, tooltip: Object.assign({ callbacks: { label: function (c) { return c.dataset.label === 'Revenue' ? 'Revenue ' + gbp2(c.parsed.y) : 'Orders ' + c.parsed.y; } } }, TT) },
          scales: { x: axis(), y: axis({ position: 'left', ticks: { color: MUT, font: { size: 10 }, callback: function (v) { return '£' + v; } } }), y1: axis({ position: 'right', grid: { drawOnChartArea: false }, ticks: { color: MUT, font: { size: 10 }, precision: 0 } }) },
        }),
      });
      var t = d.totals || {};
      countKpi(q(el, 'vk-rev'), t.revenue, gbp, ' <small>· ' + (t.orders || 0) + ' orders · ' + gbp2(t.aov) + ' avg</small>');
    }
    // Traffic (area line)
    var tr = d.trafficSeries || [], tc = q(el, 'ch-traffic');
    if (tc) {
      var ctx = tc.getContext('2d');
      el._charts.traffic = new Chart(ctx, {
        type: 'line',
        data: { labels: tr.map(function (x) { return x.date; }), datasets: [{ label: 'Visitors', data: tr.map(function (x) { return x.visitors; }), borderColor: GREEN, backgroundColor: grad(ctx, GREEN), fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2 }] },
        options: baseOpts({ scales: { x: axis(), y: axis({ beginAtZero: true, ticks: { color: MUT, font: { size: 10 }, precision: 0 } }) } }),
      });
      var totalVis = tr.reduce(function (s, x) { return s + x.visitors; }, 0);
      countKpi(q(el, 'vk-vis'), totalVis, fmtInt, ' <small>· unique visitors' + (d.tracked ? '' : ' (no data yet)') + '</small>');
    }
    // Top products (horizontal bars)
    var tp = d.topProducts || [], pc = q(el, 'ch-prod');
    if (pc) {
      el._charts.prod = new Chart(pc.getContext('2d'), {
        type: 'bar',
        data: { labels: tp.map(function (x) { return x.name; }), datasets: [{ label: 'Revenue', data: tp.map(function (x) { return x.revenue; }), backgroundColor: GREEN + 'cc', borderRadius: 4 }] },
        options: baseOpts({
          indexAxis: 'y',
          plugins: { legend: { display: false }, tooltip: Object.assign({ callbacks: { label: function (c) { var p = tp[c.dataIndex] || {}; return gbp2(c.parsed.x) + ' · ' + (p.units || 0) + ' units'; } } }, TT) },
          scales: { x: axis({ beginAtZero: true, ticks: { color: MUT, font: { size: 10 }, callback: function (v) { return '£' + v; } } }), y: axis({ grid: { display: false }, ticks: { color: '#cdd6d4', font: { size: 11 } } }) },
        }),
      });
      setKpi(el, 'vk-prod', tp.length ? esc(tp[0].name) + ' <small>· best seller</small>' : '<small>No sales yet</small>');
    }
    // Conversion funnel (horizontal bars)
    var f = d.funnel || {}, fc = q(el, 'ch-funnel');
    if (fc) {
      el._charts.funnel = new Chart(fc.getContext('2d'), {
        type: 'bar',
        data: { labels: ['Visited site', 'Reached cart', 'Ordered'], datasets: [{ data: [f.visitors || 0, f.reachedCart || 0, f.orders || 0], backgroundColor: [GREEN + 'cc', GREEN2 + 'cc', VIO + 'cc'], borderRadius: 4 }] },
        options: baseOpts({
          indexAxis: 'y',
          plugins: { legend: { display: false }, tooltip: Object.assign({ callbacks: { label: function (c) { return c.parsed.x.toLocaleString('en-GB') + ' people'; } } }, TT) },
          scales: { x: axis({ beginAtZero: true, ticks: { color: MUT, font: { size: 10 }, precision: 0 } }), y: axis({ grid: { display: false }, ticks: { color: '#cdd6d4', font: { size: 11 } } }) },
        }),
      });
      countKpi(q(el, 'vk-cvr'), f.rate || 0, fmtPct, ' <small>· visitor → order</small>');
    }
    el._renderedFor = renderToken;
    if (!el._animated) { el._animated = true; el.classList.add('vstats-in'); }
  }

  function blocks() { return Array.prototype.slice.call(document.querySelectorAll('.vstats-block')); }
  function isVisible(el) { return el.offsetParent !== null; }

  async function refresh() {
    if (!blocks().length) return;
    var d = await fetchStats(period);
    if (!d) return;
    DATA = d; renderToken++;
    blocks().forEach(function (el) { if (isVisible(el)) renderBlock(el, DATA); });
    // hidden blocks render when their tab is opened (IntersectionObserver)
  }
  window.veloxStatsRefresh = refresh;

  function syncPeriodButtons() {
    document.querySelectorAll('.vstats-per').forEach(function (b) {
      b.classList.toggle('is-on', parseInt(b.getAttribute('data-days'), 10) === period);
    });
  }
  function bindPeriods() {
    document.querySelectorAll('.vstats-per').forEach(function (b) {
      b.addEventListener('click', function () {
        period = parseInt(this.getAttribute('data-days'), 10) || 30;
        syncPeriodButtons();
        refresh();
      });
    });
    syncPeriodButtons();
  }

  function setupObserver() {
    if (!('IntersectionObserver' in window)) return;
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && DATA && e.target._renderedFor !== renderToken) renderBlock(e.target, DATA);
      });
    }, { threshold: 0.05 });
    blocks().forEach(function (el) { io.observe(el); });
  }

  function waitAndBoot() {
    if (booted) return;
    if (!blocks().length || !window.Chart || !window._sb) { return setTimeout(waitAndBoot, 250); }
    booted = true;
    if (Chart.defaults) { Chart.defaults.font.family = "Inter, system-ui, sans-serif"; Chart.defaults.color = MUT; }
    bindPeriods();
    setupObserver();
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitAndBoot);
  else waitAndBoot();
})();
