/* admin-charts.js — "Visual overview" charts on /admin (Chart.js).
 * Self-contained: pulls /api/admin/stats and draws revenue+orders, traffic,
 * top products and a conversion funnel. Does not touch admin-plus.js internals. */
(function () {
  'use strict';
  var GREEN = '#01D3A0', GREEN2 = '#6cf7d6', VIO = '#7b8cff', AMBER = '#f0b03b', GRID = 'rgba(255,255,255,.06)', MUT = '#8aa0a0';
  var charts = {}, period = 30, booted = false;

  function $(id) { return document.getElementById(id); }
  function gbp(n) { return '£' + (Math.round(n) || 0).toLocaleString('en-GB'); }
  function gbp2(n) { return '£' + (Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

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

  function grad(ctx, color, alpha) {
    var h = (ctx.canvas && ctx.canvas.clientHeight) || 150;
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, color + (alpha || '55')); g.addColorStop(1, color + '05');
    return g;
  }
  function destroy(k) { if (charts[k]) { charts[k].destroy(); charts[k] = null; } }
  function baseOpts(extra) {
    return Object.assign({
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0e141b', borderColor: '#1a2230', borderWidth: 1, titleColor: '#fff', bodyColor: '#cdd6d4', padding: 9 } },
      animation: { duration: 700 },
    }, extra || {});
  }
  function axis(opts) {
    return Object.assign({ grid: { color: GRID, drawBorder: false }, ticks: { color: MUT, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } }, opts || {});
  }

  function render(d) {
    if (!d || !window.Chart) return;
    // ── Revenue & orders (bars + line) ──
    var rev = d.revenueSeries || [];
    var rc = $('ch-rev');
    if (rc) {
      destroy('rev');
      charts.rev = new Chart(rc.getContext('2d'), {
        data: {
          labels: rev.map(function (x) { return x.date; }),
          datasets: [
            { type: 'bar', label: 'Revenue', data: rev.map(function (x) { return x.revenue; }), backgroundColor: GREEN + 'cc', borderRadius: 4, yAxisID: 'y', order: 2 },
            { type: 'line', label: 'Orders', data: rev.map(function (x) { return x.orders; }), borderColor: VIO, backgroundColor: VIO, tension: 0.35, pointRadius: 0, borderWidth: 2, yAxisID: 'y1', order: 1 },
          ],
        },
        options: baseOpts({
          plugins: { legend: { display: true, labels: { color: MUT, boxWidth: 10, font: { size: 10 } } }, tooltip: { callbacks: { label: function (c) { return c.dataset.label === 'Revenue' ? 'Revenue ' + gbp2(c.parsed.y) : 'Orders ' + c.parsed.y; } }, backgroundColor: '#0e141b', borderColor: '#1a2230', borderWidth: 1, titleColor: '#fff', bodyColor: '#cdd6d4', padding: 9 } },
          scales: { x: axis(), y: axis({ position: 'left', ticks: { color: MUT, font: { size: 10 }, callback: function (v) { return '£' + v; } } }), y1: axis({ position: 'right', grid: { drawOnChartArea: false }, ticks: { color: MUT, font: { size: 10 }, precision: 0 } }) },
        }),
      });
      var t = d.totals || {};
      $('vk-rev').innerHTML = gbp(t.revenue) + ' <small>· ' + (t.orders || 0) + ' orders · ' + gbp2(t.aov) + ' avg</small>';
    }
    // ── Traffic (area line) ──
    var tr = d.trafficSeries || [];
    var tc = $('ch-traffic');
    if (tc) {
      destroy('traffic');
      var ctx = tc.getContext('2d');
      charts.traffic = new Chart(ctx, {
        type: 'line',
        data: { labels: tr.map(function (x) { return x.date; }), datasets: [{ label: 'Visitors', data: tr.map(function (x) { return x.visitors; }), borderColor: GREEN, backgroundColor: grad(ctx, GREEN), fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2 }] },
        options: baseOpts({ scales: { x: axis(), y: axis({ beginAtZero: true, ticks: { color: MUT, font: { size: 10 }, precision: 0 } }) } }),
      });
      var totalVis = tr.reduce(function (s, x) { return s + x.visitors; }, 0);
      $('vk-vis').innerHTML = totalVis.toLocaleString('en-GB') + ' <small>· unique visitors</small>' + (d.tracked ? '' : ' <small>(no data yet)</small>');
    }
    // ── Top products (horizontal bars) ──
    var tp = d.topProducts || [];
    var pc = $('ch-prod');
    if (pc) {
      destroy('prod');
      charts.prod = new Chart(pc.getContext('2d'), {
        type: 'bar',
        data: { labels: tp.map(function (x) { return x.name; }), datasets: [{ label: 'Revenue', data: tp.map(function (x) { return x.revenue; }), backgroundColor: GREEN + 'cc', borderRadius: 4 }] },
        options: baseOpts({
          indexAxis: 'y',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { var p = tp[c.dataIndex] || {}; return gbp2(c.parsed.x) + ' · ' + (p.units || 0) + ' units'; } }, backgroundColor: '#0e141b', borderColor: '#1a2230', borderWidth: 1, titleColor: '#fff', bodyColor: '#cdd6d4', padding: 9 } },
          scales: { x: axis({ beginAtZero: true, ticks: { color: MUT, font: { size: 10 }, callback: function (v) { return '£' + v; } } }), y: axis({ grid: { display: false }, ticks: { color: '#cdd6d4', font: { size: 11 } } }) },
        }),
      });
      $('vk-prod').innerHTML = tp.length ? esc(tp[0].name) + ' <small>· best seller</small>' : '<small>No sales yet</small>';
    }
    // ── Conversion funnel (horizontal bars) ──
    var f = d.funnel || {};
    var fc = $('ch-funnel');
    if (fc) {
      destroy('funnel');
      charts.funnel = new Chart(fc.getContext('2d'), {
        type: 'bar',
        data: { labels: ['Visited site', 'Reached cart', 'Ordered'], datasets: [{ data: [f.visitors || 0, f.reachedCart || 0, f.orders || 0], backgroundColor: [GREEN + 'cc', GREEN2 + 'cc', VIO + 'cc'], borderRadius: 4 }] },
        options: baseOpts({
          indexAxis: 'y',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return c.parsed.x.toLocaleString('en-GB') + ' people'; } }, backgroundColor: '#0e141b', borderColor: '#1a2230', borderWidth: 1, titleColor: '#fff', bodyColor: '#cdd6d4', padding: 9 } },
          scales: { x: axis({ beginAtZero: true, ticks: { color: MUT, font: { size: 10 }, precision: 0 } }), y: axis({ grid: { display: false }, ticks: { color: '#cdd6d4', font: { size: 11 } } }) },
        }),
      });
      $('vk-cvr').innerHTML = (f.rate || 0) + '% <small>· visitor → order</small>';
    }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  async function refresh() {
    var sec = $('vstats-section'); if (!sec) return;
    var d = await fetchStats(period);
    if (!d) { return; }
    render(d);
  }
  window.veloxStatsRefresh = refresh;

  function bindPeriods() {
    var btns = document.querySelectorAll('.vstats-per');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        period = parseInt(this.getAttribute('data-days'), 10) || 30;
        document.querySelectorAll('.vstats-per').forEach(function (b) { b.classList.remove('is-on'); });
        this.classList.add('is-on');
        refresh();
      });
    }
  }

  function waitAndBoot() {
    if (booted) return;
    if (!$('vstats-section') || !window.Chart || !window._sb) { return setTimeout(waitAndBoot, 250); }
    booted = true;
    if (window.Chart && Chart.defaults) { Chart.defaults.font.family = "Inter, system-ui, sans-serif"; Chart.defaults.color = MUT; }
    bindPeriods();
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitAndBoot);
  else waitAndBoot();
})();
