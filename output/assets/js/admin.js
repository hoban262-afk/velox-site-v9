(function () {
  'use strict';

  // ── Helpers ───────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
      });
    } catch (e) { return iso; }
  }

  function statusBadge(s) {
    var cls = { paid:'s-paid', dispatched:'s-dispatched', cancelled:'s-cancelled', pending:'s-pending' }[s] || 's-pending';
    return '<span class="status-badge ' + cls + '">' + esc(s) + '</span>';
  }

  function showEl(id) { var el = document.getElementById(id); if (el) el.style.display = ''; }
  function hideEl(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; }

  // ── DOM refs ──────────────────────────────────────────────────────────────

  var loginWrap   = document.getElementById('admin-login');
  var dashWrap    = document.getElementById('admin-dash');
  var pwInput     = document.getElementById('admin-pw');
  var signInBtn   = document.getElementById('admin-signin');
  var errEl       = document.getElementById('admin-err');
  var logoutBtn   = document.getElementById('admin-logout');

  // ── Auth ──────────────────────────────────────────────────────────────────

  function showDash() {
    if (loginWrap) loginWrap.style.display = 'none';
    if (dashWrap)  dashWrap.style.display  = 'block';
    loadAllData();
  }

  function showLogin() {
    if (loginWrap) loginWrap.style.display = 'flex';
    if (dashWrap)  dashWrap.style.display  = 'none';
  }

  // Check for existing session on load
  if (window._sb) {
    window._sb.auth.getSession().then(function (r) {
      if (r.data && r.data.session) {
        showDash();
      } else {
        showLogin();
      }
    });
  } else {
    document.body.innerHTML = '<p style="color:#f87171;padding:40px;font-family:monospace;">Supabase not loaded. Check console.</p>';
  }

  // Sign in
  function doSignIn() {
    if (!window._sb) return;
    var pw = pwInput ? pwInput.value : '';
    if (!pw) { if (errEl) errEl.textContent = 'Please enter your password.'; return; }
    if (errEl) errEl.textContent = 'Signing in…';
    if (signInBtn) signInBtn.disabled = true;

    window._sb.auth.signInWithPassword({
      email:    'veloxpeps@gmail.com',
      password: pw,
    }).then(function (r) {
      if (signInBtn) signInBtn.disabled = false;
      if (r.error) {
        if (errEl) errEl.textContent = 'Incorrect password.';
      } else {
        if (errEl) errEl.textContent = '';
        showDash();
      }
    });
  }

  if (signInBtn) signInBtn.addEventListener('click', doSignIn);
  if (pwInput) {
    pwInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doSignIn();
    });
  }

  // Sign out
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      if (!window._sb) return;
      window._sb.auth.signOut().then(function () { showLogin(); });
    });
  }

  // ── Tab switching + bottom nav + sheet + toasts ─────────────────────────────
  var TAB_TITLES = {
    overview: 'Overview', actions: 'Actions', orders: 'Orders', margins: 'Margins',
    interest: 'Interest', customers: 'Customers', pricing: 'Pricing', reviews: 'Reviews',
    campaign: 'Campaign', subscribers: 'Subscribers', affiliates: 'Affiliates', settings: 'Settings',
    deal: 'Deal of the Day'
  };
  var BN_PRIMARY = { overview: 1, orders: 1, margins: 1, customers: 1 };

  window.switchTab = function (tab) {
    document.querySelectorAll('.admin-tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.admin-panel').forEach(function (panel) {
      panel.classList.toggle('active', panel.id === 'panel-' + tab);
    });
    // bottom nav: highlight the matching item, else "More"
    document.querySelectorAll('.bn-item').forEach(function (b) {
      var on = b.id === 'bn-more' ? !BN_PRIMARY[tab] : b.dataset.tab === tab;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    document.querySelectorAll('.ms-item').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
    var st = document.getElementById('screen-title'); if (st) st.textContent = TAB_TITLES[tab] || 'Velox Admin';
    closeMore();
    if (window.innerWidth <= 640) { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); } }
  };

  window.openMore = function () {
    var s = document.getElementById('more-sheet'), b = document.getElementById('more-backdrop');
    if (b) b.classList.add('open');
    if (s) requestAnimationFrame(function () { s.classList.add('open'); });
  };
  window.closeMore = function () {
    var s = document.getElementById('more-sheet'), b = document.getElementById('more-backdrop');
    if (s) s.classList.remove('open');
    if (b) b.classList.remove('open');
  };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') window.closeMore(); });

  function showToast(msg, type) {
    var w = document.getElementById('toast-wrap'); if (!w) { return; }
    var t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    w.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 260);
    }, 2600);
  }
  window.showToast = showToast;

  // ── Data loaders ──────────────────────────────────────────────────────────

  function loadAllData() {
    loadOrders();
    loadMargins();
    loadInterest();
    loadPricing();
    loadBundlesAdmin();
    loadReviews();
    loadCampaign();
    loadSubscribers();
    loadAffiliates();
    loadActions();
    loadXeroStatus();
    loadClickDropStatus();
    loadAnalytics();
    loadDeal();
    registerSW();
    wirePush();
  }

  // ── MARGINS (profit dashboard) ──────────────────────────────────────────────
  var MLINES = null, MOVERHEADS = [], mBound = false;

  function mGbp(v) { return '£' + (Number(v) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function mPct(v) { return (Number.isFinite(v) ? (v * 100).toFixed(1) : '0.0') + '%'; }
  function mTag(m) {
    var c = m >= 0.45 ? '#01D3A0' : m >= 0.25 ? '#e0a64a' : '#f87171';
    return '<span style="font-weight:700;color:' + c + '">' + mPct(m) + '</span>';
  }
  function mNum(id, d) { var el = document.getElementById(id); var x = el ? parseFloat(el.value) : NaN; return Number.isFinite(x) ? x : d; }

  async function loadMargins() {
    if (!window._sb) return;
    var skuWrap = document.getElementById('margins-sku-wrap');
    try {
      var s = await window._sb.auth.getSession();
      var token = s && s.data && s.data.session && s.data.session.access_token;
      if (!token) { if (skuWrap) skuWrap.innerHTML = '<div class="adm-empty">Sign in to view margins.</div>'; return; }
      var r = await fetch('/api/admin/margins', { headers: { 'Authorization': 'Bearer ' + token } });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) { if (skuWrap) skuWrap.innerHTML = '<div class="adm-empty">Could not load margins: ' + esc((d && d.error) || ('HTTP ' + r.status)) + '</div>'; return; }
      MLINES = Array.isArray(d.lines) ? d.lines : [];
      MOVERHEADS = Array.isArray(d.overheads) ? d.overheads : [];
      var g = document.getElementById('margins-generated');
      if (g && d.generated_at) g.textContent = 'Updated ' + fmtDate(d.generated_at);
      renderInsight(d.insight);
      if (!mBound) {
        ['m_post', 'm_pack', 'm_fena', 'm_bank'].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.addEventListener('input', renderMargins);
        });
        var addBtn = document.getElementById('oh-add');
        if (addBtn) addBtn.addEventListener('click', addOverhead);
        var insBtn = document.getElementById('insight-run');
        if (insBtn) insBtn.addEventListener('click', runInsights);
        mBound = true;
      }
      renderMargins();
    } catch (e) {
      if (skuWrap) skuWrap.innerHTML = '<div class="adm-empty">Could not load margins: ' + esc(e.message) + '</div>';
    }
  }

  function mFee(method, total, fenaPct, bankFix) {
    var m = (method || '').toLowerCase();
    if (m.indexOf('bank') > -1) return bankFix;
    return total * (fenaPct / 100); // fena / instant / card all routed through the card-processor rate
  }

  function renderMargins() {
    if (!MLINES) return;
    var post = mNum('m_post', 3.80), pack = mNum('m_pack', 2.50), fena = mNum('m_fena', 2.5), bank = mNum('m_bank', 0);

    // group lines → orders
    var om = {};
    MLINES.forEach(function (l) {
      if (!om[l.id]) om[l.id] = { id: l.id, created_at: l.created_at, method: l.payment_method, total: l.total, subtotal: l.subtotal, discount: l.discount || 0, shipping: l.shipping || 0, cogs: 0, units: 0 };
      om[l.id].cogs += l.qty * (l.cost_price || 0);
      om[l.id].units += l.qty;
    });
    var orders = Object.keys(om).map(function (k) {
      var o = om[k];
      o.fee = mFee(o.method, o.total, fena, bank);
      o.contrib = o.total - o.cogs - post - pack - o.fee;
      o.cm = o.total ? o.contrib / o.total : 0;
      return o;
    }).sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });

    var T = { rev: 0, cogs: 0, fee: 0, units: 0, gross_merch: 0, disc: 0, ship: 0, n: orders.length };
    orders.forEach(function (o) {
      T.rev += o.total; T.cogs += o.cogs; T.fee += o.fee; T.units += o.units;
      T.gross_merch += (o.subtotal || 0);
      T.disc += (o.discount || 0);
      T.ship += (o.shipping || 0);
    });
    var fixed = T.n * (post + pack);
    var gross = T.rev - T.cogs, contrib = T.rev - T.cogs - fixed - T.fee;
    var gm = T.rev ? gross / T.rev : 0, cm = T.rev ? contrib / T.rev : 0, aov = T.n ? T.rev / T.n : 0;

    document.getElementById('margins-stats').innerHTML =
      card('Revenue', mGbp(T.rev), T.n + ' paid orders') +
      card('Discounts given', mGbp(T.disc), T.gross_merch ? mPct(T.disc / T.gross_merch) + ' of list value' : '—') +
      card('Gross profit', mGbp(gross), mPct(gm) + ' gross margin') +
      card('Contribution', mGbp(contrib), mPct(cm) + ' after all costs') +
      card('Avg order value', mGbp(aov), T.units + ' units sold') +
      card('Product cost', mGbp(T.cogs), 'COGS') +
      card('Postage+pack+fees', mGbp(fixed + T.fee), 'fixed + payment fees');

    // ── Overheads + net profit ───────────────────────────────────────────────
    var ohTotal = (MOVERHEADS || []).reduce(function (s, o) { return s + (Number(o.monthly_cost) || 0); }, 0);
    var avgContrib = T.n ? contrib / T.n : 0;
    var breakeven = avgContrib > 0 ? Math.ceil(ohTotal / avgContrib) : null;

    // contribution from orders dated in the current calendar month
    var now = new Date(), ym = now.getFullYear() + '-' + (now.getMonth() + 1);
    var monthContrib = 0, monthOrders = 0;
    orders.forEach(function (o) {
      var d = new Date(o.created_at);
      if (d.getFullYear() + '-' + (d.getMonth() + 1) === ym) { monthContrib += o.contrib; monthOrders++; }
    });
    var net = monthContrib - ohTotal;

    document.getElementById('margins-net-stats').innerHTML =
      card('Monthly overheads', mGbp(ohTotal), (MOVERHEADS || []).length + ' subscriptions') +
      card('Net this month', mGbp(net), monthOrders + ' orders, contrib ' + mGbp(monthContrib)) +
      card('Break-even', breakeven != null ? (breakeven + ' orders/mo') : '—', avgContrib > 0 ? ('at ' + mGbp(avgContrib) + ' avg contribution') : 'need more data');
    var netNote = document.getElementById('margins-net-note');
    if (netNote) netNote.textContent = 'Net = this calendar month’s contribution minus fixed overheads';

    renderOverheadsList();

    // missing cost warning
    var miss = [];
    MLINES.forEach(function (l) { if (l.cost_price == null) { var t = l.slug + ' ' + (l.size || ''); if (miss.indexOf(t) < 0) miss.push(t); } });
    var warn = miss.length ? '<div class="adm-empty" style="color:#e0a64a">Missing cost for: ' + esc(miss.join(', ')) + ' — treated as £0, so those margins are overstated.</div>' : '';

    // by sku
    var sm = {};
    MLINES.forEach(function (l) {
      var k = l.slug + '|' + (l.size || '');
      if (!sm[k]) sm[k] = { name: l.name, size: l.size, units: 0, rev: 0, cogs: 0 };
      // discount-adjusted realised revenue: scale list price by the order's exact discount factor
      var f = (l.subtotal > 0) ? Math.max(0, (l.subtotal - (l.discount || 0)) / l.subtotal) : 1;
      sm[k].units += l.qty; sm[k].rev += l.qty * l.price * f; sm[k].cogs += l.qty * (l.cost_price || 0);
    });
    var skus = Object.keys(sm).map(function (k) { var x = sm[k]; x.gp = x.rev - x.cogs; x.gmv = x.rev ? x.gp / x.rev : 0; return x; })
      .sort(function (a, b) { return b.gp - a.gp; });
    document.getElementById('margins-sku-wrap').innerHTML = warn +
      '<table class="adm-table"><thead><tr><th>Product</th><th>Units</th><th>Revenue</th><th>Cost</th><th>Gross profit</th><th>Margin</th></tr></thead><tbody>' +
      skus.map(function (x) {
        return '<tr><td>' + esc(x.name) + ' <span style="color:var(--t3,#6b7280)">' + esc(x.size || '') + '</span></td><td>' + x.units + '</td><td>' + mGbp(x.rev) + '</td><td>' + mGbp(x.cogs) + '</td><td>' + mGbp(x.gp) + '</td><td>' + mTag(x.gmv) + '</td></tr>';
      }).join('') + '</tbody></table>';

    // by order
    document.getElementById('margins-order-wrap').innerHTML =
      '<table class="adm-table"><thead><tr><th>Date</th><th>Method</th><th>Units</th><th>Revenue</th><th>COGS</th><th>Fee</th><th>Contribution</th><th>CM%</th></tr></thead><tbody>' +
      orders.map(function (o) {
        return '<tr><td>' + fmtDate(o.created_at) + '</td><td>' + esc(o.method || '') + '</td><td>' + o.units + '</td><td>' + mGbp(o.total) + '</td><td>' + mGbp(o.cogs) + '</td><td>' + mGbp(o.fee) + '</td><td>' + mGbp(o.contrib) + '</td><td>' + mTag(o.cm) + '</td></tr>';
      }).join('') + '</tbody></table>';

    function card(l, v, sub) {
      return '<div class="stat-card"><div class="stat-label">' + l + '</div><div class="stat-value">' + v + '</div><div class="stat-sub">' + (sub || '') + '</div></div>';
    }
  }

  function renderOverheadsList() {
    var wrap = document.getElementById('overheads-wrap');
    if (!wrap) return;
    if (!MOVERHEADS.length) { wrap.innerHTML = '<div class="adm-empty">No overheads yet — add your monthly subscriptions below.</div>'; return; }
    wrap.innerHTML =
      '<table class="adm-table"><thead><tr><th>Subscription</th><th>£/month</th><th></th></tr></thead><tbody>' +
      MOVERHEADS.map(function (o) {
        return '<tr>' +
          '<td>' + esc(o.name) + (o.note ? ' <span style="color:var(--t3,#6b7280)">— ' + esc(o.note) + '</span>' : '') + '</td>' +
          '<td><input class="status-select oh-edit" data-id="' + esc(o.id) + '" type="number" step="0.01" min="0" value="' + (Number(o.monthly_cost) || 0).toFixed(2) + '" style="width:90px"></td>' +
          '<td style="text-align:right"><button class="oh-del" data-id="' + esc(o.id) + '" style="background:none;border:1px solid var(--brd,#1a1a1a);color:#f87171;border-radius:4px;padding:3px 9px;font-size:11px;cursor:pointer">Remove</button></td>' +
          '</tr>';
      }).join('') + '</tbody></table>';
    wrap.querySelectorAll('.oh-edit').forEach(function (el) {
      el.addEventListener('change', function () { saveOverhead({ id: el.dataset.id, monthly_cost: el.value, name: nameForId(el.dataset.id), active: true }); });
    });
    wrap.querySelectorAll('.oh-del').forEach(function (el) {
      el.addEventListener('click', function () { if (confirm('Remove this overhead?')) postOverhead({ action: 'delete', id: el.dataset.id }); });
    });
  }
  function nameForId(id) { var f = MOVERHEADS.filter(function (o) { return String(o.id) === String(id); })[0]; return f ? f.name : 'Overhead'; }

  function addOverhead() {
    var name = (document.getElementById('oh-name').value || '').trim();
    var cost = parseFloat(document.getElementById('oh-cost').value);
    if (!name || !Number.isFinite(cost) || cost < 0) { ohMsg('Enter a name and a £/month amount.'); return; }
    saveOverhead({ name: name, monthly_cost: cost, active: true });
    document.getElementById('oh-name').value = '';
    document.getElementById('oh-cost').value = '';
  }
  function saveOverhead(o) { postOverhead({ action: 'upsert', id: o.id, name: o.name, monthly_cost: o.monthly_cost, active: o.active }); }

  async function postOverhead(body) {
    try {
      ohMsg('Saving…');
      var s = await window._sb.auth.getSession();
      var token = s && s.data && s.data.session && s.data.session.access_token;
      if (!token) { ohMsg('Session expired — sign in again.'); return; }
      var r = await fetch('/api/admin/overheads', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(body),
      });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) { ohMsg('Failed: ' + esc((d && d.error) || ('HTTP ' + r.status))); return; }
      ohMsg('Saved.');
      loadMargins();
    } catch (e) { ohMsg('Failed: ' + esc(e.message)); }
  }
  function ohMsg(t) { var el = document.getElementById('oh-msg'); if (el) el.textContent = t; }

  // ── AI insights ─────────────────────────────────────────────────────────────
  function mdLite(src) {
    var lines = String(src || '').split(/\r?\n/);
    var html = '', inList = false;
    function inline(t) {
      return esc(t).replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#fff">$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
    }
    lines.forEach(function (ln) {
      var t = ln.trim();
      if (/^###?\s+/.test(t)) {
        if (inList) { html += '</ul>'; inList = false; }
        html += '<div style="color:#01D3A0;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.05em;margin:14px 0 6px">' + inline(t.replace(/^#+\s+/, '')) + '</div>';
      } else if (/^[-*]\s+/.test(t)) {
        if (!inList) { html += '<ul style="margin:0 0 8px;padding-left:18px">'; inList = true; }
        html += '<li style="margin:3px 0">' + inline(t.replace(/^[-*]\s+/, '')) + '</li>';
      } else if (!t) {
        if (inList) { html += '</ul>'; inList = false; }
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        html += '<p style="margin:0 0 8px">' + inline(t) + '</p>';
      }
    });
    if (inList) html += '</ul>';
    return html;
  }

  function renderInsight(ins) {
    var body = document.getElementById('insight-body');
    var dt = document.getElementById('insight-date');
    if (!body) return;
    if (ins && ins.content) {
      body.innerHTML = mdLite(ins.content);
      if (dt) dt.textContent = ins.generated_at ? ('Generated ' + fmtDate(ins.generated_at)) : '';
    } else {
      body.innerHTML = '<div class="adm-empty">No analysis yet. It runs automatically every Monday, or click “Analyse now”.</div>';
      if (dt) dt.textContent = '';
    }
  }

  async function runInsights() {
    var btn = document.getElementById('insight-run');
    var msg = document.getElementById('insight-msg');
    if (btn) { btn.disabled = true; btn.textContent = 'Analysing…'; }
    if (msg) msg.textContent = 'Generating a fresh analysis — this takes a few seconds…';
    try {
      var s = await window._sb.auth.getSession();
      var token = s && s.data && s.data.session && s.data.session.access_token;
      if (!token) { if (msg) msg.textContent = 'Session expired — sign in again.'; return; }
      var r = await fetch('/api/admin/insights-run', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) { if (msg) msg.textContent = 'Failed: ' + esc((d && d.error) || ('HTTP ' + r.status)); return; }
      if (msg) msg.textContent = '';
      renderInsight({ content: d.content, generated_at: new Date().toISOString() });
    } catch (e) {
      if (msg) msg.textContent = 'Failed: ' + esc(e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Analyse now'; }
    }
  }

  // ── INTEREST (coming-soon waitlist) ─────────────────────────────────────────
  async function loadInterest() {
    if (!window._sb) return;
    var pw = document.getElementById('interest-products-wrap');
    try {
      var s = await window._sb.auth.getSession();
      var token = s && s.data && s.data.session && s.data.session.access_token;
      if (!token) { if (pw) pw.innerHTML = '<div class="adm-empty">Sign in to view.</div>'; return; }
      var r = await fetch('/api/admin/interest', { headers: { 'Authorization': 'Bearer ' + token } });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) { if (pw) pw.innerHTML = '<div class="adm-empty">Could not load: ' + esc((d && d.error) || ('HTTP ' + r.status)) + '</div>'; return; }
      renderInterest(d);
    } catch (e) {
      if (pw) pw.innerHTML = '<div class="adm-empty">Could not load: ' + esc(e.message) + '</div>';
    }
  }

  function renderInterest(d) {
    var products = (d && d.products) || [];
    var recent = (d && d.recent) || [];
    var g = document.getElementById('interest-generated');
    if (g && d.generated_at) g.textContent = 'Updated ' + fmtDate(d.generated_at);

    var totalAll = products.reduce(function (s, p) { return s + p.total; }, 0);
    var pendingAll = products.reduce(function (s, p) { return s + p.pending; }, 0);
    document.getElementById('interest-stats').innerHTML =
      '<div class="stat-card"><div class="stat-label">Total registrations</div><div class="stat-value">' + totalAll + '</div><div class="stat-sub">' + products.length + ' products</div></div>' +
      '<div class="stat-card"><div class="stat-label">Awaiting notification</div><div class="stat-value">' + pendingAll + '</div><div class="stat-sub">not yet emailed</div></div>';

    if (!products.length) {
      document.getElementById('interest-products-wrap').innerHTML = '<div class="adm-empty">No registrations yet.</div>';
    } else {
      document.getElementById('interest-products-wrap').innerHTML =
        '<table class="adm-table"><thead><tr><th>Product</th><th>Interested</th><th>Pending</th><th>Notified</th><th></th></tr></thead><tbody>' +
        products.map(function (p) {
          return '<tr><td>' + esc(p.name) + ' <span style="color:var(--t3,#6b7280)">' + esc(p.product_slug) + '</span></td>' +
            '<td style="font-weight:700;color:#fff">' + p.total + '</td>' +
            '<td>' + p.pending + '</td><td>' + p.notified + '</td>' +
            '<td style="text-align:right">' + (p.pending > 0
              ? '<button class="btn-p int-notify" data-slug="' + esc(p.product_slug) + '" data-name="' + esc(p.name) + '" style="width:auto;padding:6px 14px;font-size:11px">Notify ' + p.pending + '</button>'
              : '<span style="color:var(--t3,#6b7280);font-size:11px">all notified</span>') + '</td></tr>';
        }).join('') + '</tbody></table>';
      document.querySelectorAll('.int-notify').forEach(function (b) {
        b.addEventListener('click', function () { notifyInterest(b.dataset.slug, b.dataset.name, b); });
      });
    }

    document.getElementById('interest-recent-wrap').innerHTML = recent.length
      ? '<table class="adm-table"><thead><tr><th>Date</th><th>Product</th><th>Email</th><th>Status</th></tr></thead><tbody>' +
        recent.map(function (x) {
          return '<tr><td>' + fmtDate(x.created_at) + '</td><td>' + esc(x.product_slug) + '</td><td>' + esc(x.email) + '</td><td>' +
            (x.notified_at ? '<span class="status-badge s-paid">notified</span>' : '<span class="status-badge s-pending">waiting</span>') + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<div class="adm-empty">No registrations yet.</div>';
  }

  async function notifyInterest(slug, name, btn) {
    if (!confirm('Email everyone waiting for ' + name + ' that it is now available?')) return;
    var msg = document.getElementById('interest-msg');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    if (msg) { msg.style.color = '#9ca3af'; msg.textContent = 'Sending notifications…'; }
    try {
      var s = await window._sb.auth.getSession();
      var token = s && s.data && s.data.session && s.data.session.access_token;
      var r = await fetch('/api/admin/interest', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ product_slug: slug }),
      });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) { if (msg) { msg.style.color = '#f87171'; msg.textContent = 'Failed: ' + esc((d && d.error) || ('HTTP ' + r.status)); } if (btn) { btn.disabled = false; btn.textContent = 'Notify'; } return; }
      if (msg) { msg.style.color = '#01D3A0'; msg.textContent = 'Sent ' + (d.sent || 0) + ' notification(s) for ' + name + '.'; }
      loadInterest();
    } catch (e) {
      if (msg) { msg.style.color = '#f87171'; msg.textContent = 'Failed: ' + esc(e.message); }
      if (btn) { btn.disabled = false; btn.textContent = 'Notify'; }
    }
  }

  // ── PUSH / PWA (order alerts on this device) ────────────────────────────────
  var VAPID_PUBLIC = 'BB2LHMCFOvkgS5qsI8tsrOcHD_4aI8rc5l-GBVduJ5o-SjsI61Ck2iUqtLrVmdRzU1gC9TubyBlEsmedPyL1VFA';
  var pushBound = false;

  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' }).catch(function (e) { console.warn('SW reg failed', e && e.message); });
    }
  }
  function urlB64ToUint8(base64) {
    var pad = '='.repeat((4 - base64.length % 4) % 4);
    var b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(b64); var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }
  function pushStatus(t, color) { var el = document.getElementById('push-status'); if (el) { el.textContent = t; el.style.color = color || 'var(--t3,#6b7280)'; } }

  async function wirePush() {
    if (pushBound) return; pushBound = true;
    var enableBtn = document.getElementById('push-enable');
    var testBtn = document.getElementById('push-test');
    if (enableBtn) enableBtn.addEventListener('click', enablePush);
    if (testBtn) testBtn.addEventListener('click', testPush);
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      pushStatus('This browser doesn’t support push. On iPhone: add to Home Screen first (iOS 16.4+), then open it and try again.');
      if (enableBtn) enableBtn.disabled = true; return;
    }
    try {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (sub && Notification.permission === 'granted') {
        pushStatus('✓ Alerts on for this device.', '#01D3A0');
        if (enableBtn) enableBtn.textContent = 'Re-enable';
        if (testBtn) testBtn.style.display = '';
      }
    } catch (e) {}
  }

  async function enablePush() {
    var btn = document.getElementById('push-enable');
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { pushStatus('Push not supported on this browser/device.'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Enabling…'; }
    try {
      var perm = await Notification.requestPermission();
      if (perm !== 'granted') { pushStatus('Notification permission denied — enable it in browser settings.', '#f87171'); if (btn) { btn.disabled = false; btn.textContent = 'Enable order alerts'; } return; }
      var reg = await navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' });
      await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID_PUBLIC) });
      var s = await window._sb.auth.getSession();
      var token = s && s.data && s.data.session && s.data.session.access_token;
      var r = await fetch('/api/admin/push-subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ subscription: sub.toJSON(), label: navigator.userAgent.slice(0, 60) }),
      });
      if (!r.ok) { var d = await r.json().catch(function () { return {}; }); pushStatus('Could not save: ' + esc((d && d.error) || ('HTTP ' + r.status)), '#f87171'); if (btn) { btn.disabled = false; btn.textContent = 'Enable order alerts'; } return; }
      pushStatus('✓ Alerts on for this device.', '#01D3A0');
      if (btn) { btn.disabled = false; btn.textContent = 'Re-enable'; }
      var testBtn = document.getElementById('push-test'); if (testBtn) testBtn.style.display = '';
    } catch (e) {
      pushStatus('Failed: ' + esc(e.message), '#f87171');
      if (btn) { btn.disabled = false; btn.textContent = 'Enable order alerts'; }
    }
  }

  async function testPush() {
    pushStatus('Sending test…');
    try {
      var s = await window._sb.auth.getSession();
      var token = s && s.data && s.data.session && s.data.session.access_token;
      var r = await fetch('/api/admin/push-test', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
      var d = await r.json().catch(function () { return {}; });
      if (r.ok) pushStatus('Test sent to ' + (d.sent || 0) + ' device(s).', '#01D3A0');
      else pushStatus('Test failed: ' + esc((d && d.error) || ('HTTP ' + r.status)), '#f87171');
    } catch (e) { pushStatus('Test failed: ' + esc(e.message), '#f87171'); }
  }

  // ── DEAL OF THE DAY ─────────────────────────────────────────────────────────
  var DEAL_VARIANTS = [];
  var dealBound = false;

  function toLocalDT(dt) {
    var p = function (n) { return String(n).padStart(2, '0'); };
    return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate()) + 'T' + p(dt.getHours()) + ':' + p(dt.getMinutes());
  }

  async function loadDeal() {
    if (!window._sb) return;
    try {
      var pv = await window._sb.from('product_variants').select('slug,size,name,base_price').order('name', { ascending: true });
      DEAL_VARIANTS = pv.data || [];
    } catch (e) { DEAL_VARIANTS = []; }
    var sel = document.getElementById('deal-product');
    if (sel) {
      sel.innerHTML = '<option value="">— choose a product —</option>' + DEAL_VARIANTS.map(function (v) {
        return '<option value="' + esc(v.slug) + '|' + esc(v.size) + '">' + esc(v.name) + ' · ' + esc(v.size) + ' (£' + Number(v.base_price).toFixed(2) + ')</option>';
      }).join('');
    }
    try {
      var s = await window._sb.auth.getSession();
      var token = s && s.data && s.data.session && s.data.session.access_token;
      var r = await fetch('/api/admin/deal', { headers: { 'Authorization': 'Bearer ' + token } });
      var d = await r.json().catch(function () { return {}; });
      var deal = d && d.deal;
      var st = document.getElementById('deal-status');
      if (deal) {
        if (sel) sel.value = deal.slug + '|' + deal.size;
        var pctEl = document.getElementById('deal-pct'); if (pctEl) pctEl.value = deal.discount_pct;
        var hEl = document.getElementById('deal-headline'); if (hEl) hEl.value = deal.headline || '';
        var aEl = document.getElementById('deal-active'); if (aEl) aEl.checked = deal.active !== false;
        var apEl = document.getElementById('deal-apply'); if (apEl) apEl.checked = deal.applied === true;
        var eEl = document.getElementById('deal-ends'); if (eEl && deal.ends_at) eEl.value = toLocalDT(new Date(deal.ends_at));
        if (st) st.textContent = 'Live: ' + deal.slug + ' · ' + deal.discount_pct + '% off' + (deal.applied ? ' · real price live' : '');
      } else if (st) { st.textContent = 'No deal running'; }
    } catch (e) {}
    if (!dealBound) {
      dealBound = true;
      ['deal-product', 'deal-pct'].forEach(function (id) { var el = document.getElementById(id); if (el) el.addEventListener('input', renderDealPreview); });
      var sv = document.getElementById('deal-save'); if (sv) sv.addEventListener('click', saveDeal);
      var cl = document.getElementById('deal-clear'); if (cl) cl.addEventListener('click', clearDeal);
    }
    renderDealPreview();
  }

  function renderDealPreview() {
    var prev = document.getElementById('deal-preview'); if (!prev) return;
    var sel = document.getElementById('deal-product');
    var pct = parseFloat((document.getElementById('deal-pct') || {}).value);
    var key = sel ? sel.value : '';
    if (!key || !(pct > 0)) { prev.innerHTML = 'Pick a product and a discount to preview the homepage block.'; return; }
    var parts = key.split('|');
    var v = DEAL_VARIANTS.filter(function (x) { return x.slug === parts[0] && x.size === parts[1]; })[0];
    if (!v) { prev.innerHTML = ''; return; }
    var base = Number(v.base_price); var dp = Math.round(base * (1 - pct / 100) * 100) / 100;
    prev.innerHTML = '<div style="background:var(--bg3,#0a0d12);border:1px solid var(--brd,#1a1a1a);border-radius:8px;padding:14px 16px">' +
      '<div style="font-size:12px;color:#01D3A0;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Homepage preview</div>' +
      '<div style="font-size:15px;color:#fff;font-weight:700">' + esc(v.name) + ' · ' + esc(v.size) + '</div>' +
      '<div style="margin-top:4px"><span style="color:var(--t3,#6b7280);text-decoration:line-through">£' + base.toFixed(2) + '</span>' +
      '<span style="color:#01D3A0;font-weight:800;font-size:18px;margin-left:8px">£' + dp.toFixed(2) + '</span>' +
      '<span style="background:#01D3A0;color:#021;font-weight:800;font-size:11px;padding:2px 8px;border-radius:20px;margin-left:8px">' + Math.round(pct) + '% OFF</span></div></div>';
  }

  async function saveDeal() {
    var msg = document.getElementById('deal-msg');
    var sel = document.getElementById('deal-product');
    var key = sel ? sel.value : '';
    var pct = parseFloat((document.getElementById('deal-pct') || {}).value);
    if (!key) { if (msg) { msg.style.color = '#f87171'; msg.textContent = 'Pick a product.'; } return; }
    if (!(pct > 0 && pct <= 95)) { if (msg) { msg.style.color = '#f87171'; msg.textContent = 'Discount must be 1–95%.'; } return; }
    var parts = key.split('|');
    var endsVal = (document.getElementById('deal-ends') || {}).value;
    var body = {
      slug: parts[0], size: parts[1], discount_pct: pct,
      headline: (document.getElementById('deal-headline') || {}).value || '',
      ends_at: endsVal ? new Date(endsVal).toISOString() : null,
      active: !!(document.getElementById('deal-active') || {}).checked,
      apply: !!(document.getElementById('deal-apply') || {}).checked,
    };
    if (msg) { msg.style.color = '#9ca3af'; msg.textContent = 'Saving…'; }
    try {
      var s = await window._sb.auth.getSession();
      var token = s && s.data && s.data.session && s.data.session.access_token;
      var r = await fetch('/api/admin/deal', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) { if (msg) { msg.style.color = '#f87171'; msg.textContent = (d && d.error) || ('HTTP ' + r.status); } return; }
      if (msg) { msg.style.color = '#01D3A0'; msg.textContent = '✓ Deal is live on the homepage.'; }
      if (window.showToast) showToast('Deal of the Day updated', 'ok');
      var st = document.getElementById('deal-status'); if (st) st.textContent = 'Live: ' + parts[0] + ' · ' + pct + '% off';
    } catch (e) { if (msg) { msg.style.color = '#f87171'; msg.textContent = e.message; } }
  }

  async function clearDeal() {
    if (!confirm('Remove the Deal of the Day from the homepage?')) return;
    var msg = document.getElementById('deal-msg');
    try {
      var s = await window._sb.auth.getSession();
      var token = s && s.data && s.data.session && s.data.session.access_token;
      var r = await fetch('/api/admin/deal', { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } });
      if (!r.ok) { if (msg) { msg.style.color = '#f87171'; msg.textContent = 'Clear failed'; } return; }
      if (msg) { msg.style.color = '#01D3A0'; msg.textContent = 'Deal cleared.'; }
      var st = document.getElementById('deal-status'); if (st) st.textContent = 'No deal running';
      if (window.showToast) showToast('Deal cleared', 'ok');
    } catch (e) { if (msg) { msg.style.color = '#f87171'; msg.textContent = e.message; } }
  }

  // ── APPROVAL INBOX (agent_actions) ──────────────────────────────────────────
  function loadActions() {
    if (!window._sb) return;
    window._sb.from('agent_actions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .then(function (r) { renderActions(r.data || []); });
  }

  function actionTypeLabel(t) {
    return ({
      email_reply: 'Email reply', content_draft: 'Content draft', reorder: 'Reorder',
      vat_summary: 'VAT summary', reconciliation: 'Reconciliation', anomaly: 'Anomaly', shipping: 'Shipping'
    })[t] || t;
  }

  function renderActions(actions) {
    var badge = document.getElementById('actions-badge');
    var countEl = document.getElementById('actions-count');
    if (badge) { badge.textContent = actions.length; badge.style.display = actions.length ? 'inline-block' : 'none'; }
    if (countEl) countEl.textContent = actions.length + ' pending';
    var moreDot = document.getElementById('bn-more-dot'); if (moreDot) moreDot.style.display = actions.length ? 'block' : 'none';
    var el = document.getElementById('actions-list');
    if (!el) return;
    if (!actions.length) { el.innerHTML = '<p class="adm-empty">Nothing waiting for approval. 🎉</p>'; return; }
    el.innerHTML = actions.map(function (a) {
      var body = '';
      try {
        var p = a.payload || {};
        body = p.body || p.message || p.text || (typeof p === 'string' ? p : JSON.stringify(p, null, 2));
      } catch (e) { body = ''; }
      return '<div style="border:1px solid var(--brd,#1a1a1a);border-radius:10px;padding:16px 18px;margin-bottom:12px">' +
        '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline">' +
          '<div style="font-size:14px;font-weight:700;color:#fff">' + esc(a.title) + '</div>' +
          '<div style="font-size:11px;color:var(--g,#01D3A0);text-transform:uppercase;letter-spacing:.06em">' + esc(actionTypeLabel(a.type)) + ' · ' + esc(a.agent) + '</div>' +
        '</div>' +
        (a.summary ? '<div style="font-size:12px;color:var(--t3,#6b7280);margin-top:4px">' + esc(a.summary) + '</div>' : '') +
        (body ? '<pre style="white-space:pre-wrap;word-break:break-word;font:inherit;font-size:13px;color:var(--t2,#9ca3af);background:var(--bg3,#111);border:1px solid var(--brd,#1a1a1a);border-radius:7px;padding:12px;margin:10px 0 0;max-height:240px;overflow:auto">' + esc(body) + '</pre>' : '') +
        '<div style="margin-top:12px;display:flex;gap:8px">' +
          '<button class="btn-p" style="width:auto;padding:8px 18px" onclick="actionApprove(\'' + a.id + '\')">Approve</button>' +
          '<button class="status-select" style="cursor:pointer;padding:8px 16px" onclick="actionDismiss(\'' + a.id + '\')">Dismiss</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  window.actionApprove = function (id) {
    if (!window._sb) return;
    window._sb.from('agent_actions')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: 'admin' })
      .eq('id', id)
      .then(function (r) {
        if (r.error) { console.error('[admin] approve failed:', r.error.message); return; }
        loadActions();
      });
  };

  window.actionDismiss = function (id) {
    if (!window._sb) return;
    if (!window.confirm('Dismiss this item? It will be removed from the inbox.')) return;
    window._sb.from('agent_actions')
      .update({ status: 'dismissed', reviewed_at: new Date().toISOString(), reviewed_by: 'admin' })
      .eq('id', id)
      .then(function (r) {
        if (r.error) { console.error('[admin] dismiss failed:', r.error.message); return; }
        loadActions();
      });
  };

  // ── XERO connection (Settings) ──────────────────────────────────────────────
  async function loadXeroStatus() {
    var statusEl = document.getElementById('xero-status');
    var btn = document.getElementById('xero-connect-btn');
    if (btn && !btn._wired) { btn._wired = true; btn.addEventListener('click', connectXero); }
    // Reflect ?xero=connected|failed|invalid|denied from the OAuth redirect
    var qp = new URLSearchParams(window.location.search).get('xero');
    if (qp && statusEl) {
      if (qp === 'connected') statusEl.innerHTML = '<span style="color:#01D3A0">✓ Just connected.</span>';
      else statusEl.innerHTML = '<span style="color:#f87171">Connection ' + esc(qp) + '. Try again.</span>';
    }
    try {
      var s = await window._sb.auth.getSession();
      var token = s.data && s.data.session && s.data.session.access_token;
      var r = await fetch('/api/xero/status', { headers: { 'Authorization': 'Bearer ' + token } });
      var d = await r.json();
      if (!statusEl) return;
      if (d && d.connected) {
        statusEl.innerHTML = '<span style="color:#01D3A0">✓ Connected</span>' + (d.org ? ' · ' + esc(d.org) : '');
        if (btn) btn.textContent = 'Reconnect';
      } else if (!qp) {
        statusEl.textContent = d && d.configured === false ? 'Not configured — add Xero keys in Vercel.' : 'Not connected.';
      }
    } catch (e) { if (statusEl && !qp) statusEl.textContent = 'Status unavailable.'; }
  }

  async function connectXero() {
    var btn = document.getElementById('xero-connect-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Connecting…'; }
    try {
      var s = await window._sb.auth.getSession();
      var token = s.data && s.data.session && s.data.session.access_token;
      var r = await fetch('/api/xero/connect', { headers: { 'Authorization': 'Bearer ' + token } });
      var d = await r.json();
      if (r.ok && d.url) { window.location.href = d.url; return; }
      if (btn) { btn.disabled = false; btn.textContent = 'Connect Xero'; }
      alert(d.error || 'Could not start Xero connection.');
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Connect Xero'; }
      alert('Could not start Xero connection.');
    }
  }

  async function loadClickDropStatus() {
    var el = document.getElementById('clickdrop-status');
    if (!el || !window._sb) return;
    try {
      var s = await window._sb.auth.getSession();
      var token = s.data && s.data.session && s.data.session.access_token;
      var r = await fetch('/api/clickdrop/status', { headers: { 'Authorization': 'Bearer ' + token } });
      var d = await r.json();
      if (!d || d.configured === false) {
        el.textContent = 'Not connected — add your Click & Drop API key in the site environment settings.';
      } else if (d.connected) {
        el.innerHTML = '<span style="color:#01D3A0">✓ Connected</span> · paid orders auto-import.';
      } else {
        el.innerHTML = '<span style="color:#f87171">Key set but not authorising</span> — check the API key value.';
      }
    } catch (e) {
      el.textContent = 'Status unavailable.';
    }
  }

  // ── CAMPAIGN (email broadcast) ──────────────────────────────────────────────
  function loadCampaign() {
    if (!window._sb) return;
    window._sb.from('subscribers').select('id', { count: 'exact', head: true }).is('unsubscribed_at', null)
      .then(function (r) {
        var el = document.getElementById('camp-count');
        if (el) el.textContent = (r.count != null ? r.count : '—') + ' subscriber' + (r.count === 1 ? '' : 's');
      });
    var btn = document.getElementById('camp-send');
    if (btn && !btn._wired) { btn._wired = true; btn.addEventListener('click', sendCampaign); }
  }

  async function sendCampaign() {
    var msg = document.getElementById('camp-msg');
    function setMsg(text, ok) { msg.textContent = text; msg.style.color = ok ? '#01D3A0' : '#f87171'; }
    var subject = document.getElementById('camp-subject').value.trim();
    var message = document.getElementById('camp-message').value.trim();
    if (!subject || !message) { setMsg('Subject and message are required.', false); return; }
    var countEl = document.getElementById('camp-count');
    if (!window.confirm('Send this campaign to ' + (countEl ? countEl.textContent : 'all subscribers') + '?\n\nThis sends real emails and cannot be undone.')) return;

    var btn = document.getElementById('camp-send');
    btn.disabled = true; var orig = btn.textContent; btn.textContent = 'Sending…';
    msg.style.color = '#9ca3af'; msg.textContent = 'Sending…';
    try {
      var s = await window._sb.auth.getSession();
      var token = s.data && s.data.session && s.data.session.access_token;
      var r = await fetch('/api/newsletter/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ subject: subject, message: message }),
      });
      var d = await r.json();
      if (r.ok) setMsg('✓ Sent to ' + d.sent + ' of ' + d.total + ' subscribers.', true);
      else setMsg(d.error || 'Send failed.', false);
    } catch (e) { setMsg('Send failed — please try again.', false); }
    btn.disabled = false; btn.textContent = orig;
  }

  // ── REVIEWS ───────────────────────────────────────────────────────────────

  function loadReviews() {
    if (!window._sb) return;
    window._sb.from('reviews')
      .select('*')
      .order('created_at', { ascending: false })
      .then(function (r) { renderReviews(r.data || []); });
  }

  function reviewStars(n) {
    var out = '';
    for (var i = 1; i <= 5; i++) out += (i <= n ? '★' : '☆');
    return out;
  }

  function renderReviews(reviews) {
    var el = document.getElementById('reviews-table-wrap');
    if (!el) return;
    if (!reviews.length) { el.innerHTML = '<p class="adm-empty">No reviews submitted yet.</p>'; return; }
    el.innerHTML = '<table class="adm-table">' +
      '<thead><tr><th>Date</th><th>Product</th><th>Rating</th><th>Reviewer</th><th>Review</th><th>Status</th><th>Action</th></tr></thead>' +
      '<tbody>' + reviews.map(function (rv) {
        return '<tr>' +
          '<td style="color:var(--t2)">' + fmtDate(rv.created_at) + '</td>' +
          '<td style="color:#fff">' + esc(rv.product_name || rv.product_slug) + '</td>' +
          '<td style="color:#f5b301;white-space:nowrap">' + reviewStars(rv.rating) + '</td>' +
          '<td style="color:var(--t2)">' + esc(rv.author_name) + '</td>' +
          '<td style="color:var(--t2);max-width:280px">' +
            (rv.title ? '<strong style="color:#fff">' + esc(rv.title) + '</strong><br>' : '') +
            esc(rv.body || '') + '</td>' +
          '<td>' + statusBadge(rv.status) + '</td>' +
          '<td>' +
            '<select class="status-select" onchange="updateReviewStatus(\'' + rv.id + '\', this.value)">' +
              ['pending','approved','rejected'].map(function (s) {
                return '<option value="' + s + '"' + (rv.status === s ? ' selected' : '') + '>' + s + '</option>';
              }).join('') +
            '</select>' +
          '</td>' +
        '</tr>';
      }).join('') + '</tbody></table>';
  }

  window.updateReviewStatus = function (id, newStatus) {
    if (!window._sb) return;
    window._sb.from('reviews').update({ status: newStatus }).eq('id', id).then(function (r) {
      if (r.error) console.error('[admin] Review update failed:', r.error.message);
      else loadReviews();
    });
  };

  // ── ORDERS ────────────────────────────────────────────────────────────────

  var ordersCache = [];

  function loadOrders() {
    if (!window._sb) return;
    window._sb.from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .then(function (r) {
        ordersCache = r.data || [];
        applyOrderFilter();
        renderRecentOrders(ordersCache.slice(0, 5));
        updateStats(ordersCache);
        renderDashboard(ordersCache);
        renderCustomers(ordersCache);
        wireAdminExtras();
      });
    var cb = document.getElementById('ord-create');
    if (cb && !cb._wired) { cb._wired = true; cb.addEventListener('click', createOrder); }
    var ex = document.getElementById('orders-export');
    if (ex && !ex._wired) { ex._wired = true; ex.addEventListener('click', exportOrdersCSV); }
  }

  function ordVal(id) { var e = document.getElementById(id); return e ? e.value : ''; }

  async function createOrder() {
    var m = document.getElementById('ord-create-msg');
    function set(t, ok) { if (m) { m.textContent = t; m.style.color = ok ? '#01D3A0' : '#f87171'; } }
    var name = ordVal('ord-name').trim();
    var email = ordVal('ord-email').trim();
    var sub = parseFloat(ordVal('ord-subtotal'));
    var code = ordVal('ord-code').trim().toUpperCase();
    var status = ordVal('ord-status') || 'pending';
    if (!name || isNaN(sub) || sub < 0) { set('Enter a customer name and a valid subtotal.', false); return; }

    var affiliate_id = null;
    if (code) {
      var ar = await window._sb.from('affiliates').select('id,status').eq('ref_code', code).maybeSingle();
      if (!ar.data) { set('No affiliate found with code "' + code + '".', false); return; }
      if (ar.data.status !== 'active') { set('That affiliate isn\'t active, so no commission would be earned.', false); return; }
      affiliate_id = ar.data.id;
    }

    set('Creating…', true);
    var row = {
      customer_name: name, customer_email: email || null, items: [],
      subtotal: sub, total: sub, status: status,
      affiliate_id: affiliate_id, affiliate_code_used: code || null,
    };
    var r = await window._sb.from('orders').insert([row]);
    if (r.error) { set(r.error.message, false); return; }
    set('Order created' + (affiliate_id ? (' — commission generated for ' + code + '.') : '.'), true);
    document.getElementById('ord-name').value = '';
    document.getElementById('ord-email').value = '';
    document.getElementById('ord-subtotal').value = '';
    document.getElementById('ord-code').value = '';
    loadOrders();
  }

  function orderItems(o) {
    var items = o.items;
    if (typeof items === 'string') { try { items = JSON.parse(items); } catch (e) { items = []; } }
    return Array.isArray(items) ? items : [];
  }
  function itemCount(o) { return orderItems(o).reduce(function (s, it) { return s + (Number(it.qty || it.quantity) || 1); }, 0); }

  function orderDetailsHtml(o) {
    var items = orderItems(o);
    var rows = items.length ? items.map(function (it) {
      var qty = Number(it.qty || it.quantity) || 1;
      var price = Number(it.price) || 0;
      return '<tr><td style="padding:5px 10px;color:#e5e7eb">' + esc(it.name || it.slug || 'Item') +
        (it.size ? ' <span style="color:var(--t3,#6b7280)">' + esc(it.size) + '</span>' : '') + '</td>' +
        '<td style="padding:5px 10px;text-align:right;color:var(--t2,#9ca3af)">×' + qty + '</td>' +
        '<td style="padding:5px 10px;text-align:right;color:var(--t2,#9ca3af)">£' + price.toFixed(2) + '</td>' +
        '<td style="padding:5px 10px;text-align:right;color:#fff">£' + (price * qty).toFixed(2) + '</td></tr>';
    }).join('') : '<tr><td colspan="4" style="padding:6px 10px;color:var(--t3,#6b7280)">No line items recorded.</td></tr>';
    var addr = [o.ship_line1, o.ship_line2, o.ship_city, o.ship_postcode, o.ship_country].filter(Boolean).join(', ');
    var money = function (v) { return '£' + (Number(v) || 0).toFixed(2); };
    var meta = '<div style="display:flex;gap:24px;flex-wrap:wrap;font-size:12px;color:var(--t2,#9ca3af);margin-top:10px">' +
      '<div><span style="color:var(--t3,#6b7280)">Subtotal</span> ' + money(o.subtotal) + '</div>' +
      '<div><span style="color:var(--t3,#6b7280)">Discount</span> −' + money(o.discount) + '</div>' +
      '<div><span style="color:var(--t3,#6b7280)">Shipping</span> ' + money(o.shipping) + '</div>' +
      '<div><span style="color:var(--t3,#6b7280)">Total</span> <strong style="color:#01D3A0">' + money(o.total) + '</strong></div>' +
      '<div><span style="color:var(--t3,#6b7280)">Method</span> ' + esc(o.payment_method || '—') + '</div></div>';
    return '<div style="background:var(--bg3,#0a0d12);border:1px solid var(--brd,#1a1a1a);border-radius:8px;padding:14px 16px">' +
      '<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>' +
        '<th style="text-align:left;padding:4px 10px;color:var(--t3,#6b7280);font-weight:500;font-size:11px">Item</th>' +
        '<th style="text-align:right;padding:4px 10px;color:var(--t3,#6b7280);font-weight:500;font-size:11px">Qty</th>' +
        '<th style="text-align:right;padding:4px 10px;color:var(--t3,#6b7280);font-weight:500;font-size:11px">Unit</th>' +
        '<th style="text-align:right;padding:4px 10px;color:var(--t3,#6b7280);font-weight:500;font-size:11px">Line</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' + meta +
      (addr ? '<div style="margin-top:10px;font-size:12px;color:var(--t2,#9ca3af)"><span style="color:var(--t3,#6b7280)">Deliver to:</span> ' + esc(addr) +
              (o.ship_phone ? ' · ' + esc(o.ship_phone) : '') + '</div>' : '') +
      '</div>';
  }

  window.toggleOrderDetails = function (id) {
    var row = document.getElementById('ord-det-' + id);
    if (row) row.style.display = (row.style.display === 'none' || !row.style.display) ? '' : 'none';
  };

  function renderOrders(orders) {
    var el = document.getElementById('orders-table-wrap');
    if (!el) return;
    if (!orders.length) {
      el.innerHTML = '<p class="adm-empty">No orders yet.</p>';
      return;
    }
    el.innerHTML = '<table class="adm-table">' +
      '<thead><tr>' +
        '<th></th><th>Date</th><th>Reference</th><th>Customer</th><th>Items</th>' +
        '<th>Total</th><th>Status</th><th>Action</th>' +
      '</tr></thead>' +
      '<tbody>' + orders.map(function (o) {
        var ref = o.notes || o.id.slice(0, 8).toUpperCase();
        return '<tr style="cursor:pointer" onclick="toggleOrderDetails(\'' + o.id + '\')">' +
          '<td style="color:var(--g,#01D3A0);width:14px">▸</td>' +
          '<td style="color:var(--t2)">' + fmtDate(o.created_at) + '</td>' +
          '<td><span style="font-family:monospace;font-size:11px;color:var(--t2)">' + esc(ref) + '</span></td>' +
          '<td><div style="color:#fff;font-size:13px;">' + esc(o.customer_name) + '</div>' +
            '<div style="color:var(--t3);font-size:11px;">' + esc(o.customer_email) + '</div></td>' +
          '<td style="color:var(--t2);font-size:12px">' + itemCount(o) + '</td>' +
          '<td style="color:var(--g);font-weight:600;">£' + parseFloat(o.total || 0).toFixed(2) + '</td>' +
          '<td>' + statusBadge(o.status) + '</td>' +
          '<td onclick="event.stopPropagation()">' +
            '<select class="status-select" onchange="updateOrderStatus(\'' + o.id + '\', this.value)">' +
              ['pending','paid','dispatched','cancelled'].map(function (s) {
                return '<option value="' + s + '"' + (o.status === s ? ' selected' : '') + '>' + s + '</option>';
              }).join('') +
            '</select>' +
          '</td>' +
        '</tr>' +
        '<tr id="ord-det-' + o.id + '" style="display:none"><td colspan="8" style="padding:0 12px 14px">' + orderDetailsHtml(o) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function exportOrdersCSV() {
    var orders = ordersCache || [];
    if (!orders.length) { alert('No orders to export.'); return; }
    var cols = ['Date','Reference','Customer','Email','Phone','Items','Subtotal','Discount','Shipping','Total','Status','Payment','Address'];
    function q(v) { v = (v == null ? '' : String(v)); return '"' + v.replace(/"/g, '""') + '"'; }
    var lines = [cols.join(',')];
    orders.forEach(function (o) {
      var ref = o.notes || o.id.slice(0, 8).toUpperCase();
      var items = orderItems(o).map(function (it) {
        return (it.name || it.slug || 'Item') + (it.size ? ' ' + it.size : '') + ' x' + (Number(it.qty || it.quantity) || 1);
      }).join('; ');
      var addr = [o.ship_line1, o.ship_line2, o.ship_city, o.ship_postcode, o.ship_country].filter(Boolean).join(', ');
      lines.push([
        q(new Date(o.created_at).toISOString()), q(ref), q(o.customer_name), q(o.customer_email), q(o.ship_phone),
        q(items), q(Number(o.subtotal || 0).toFixed(2)), q(Number(o.discount || 0).toFixed(2)),
        q(Number(o.shipping || 0).toFixed(2)), q(Number(o.total || 0).toFixed(2)),
        q(o.status), q(o.payment_method), q(addr),
      ].join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'velox-orders-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function renderRecentOrders(orders) {
    var el = document.getElementById('recent-orders-list');
    if (!el) return;
    if (!orders.length) { el.innerHTML = '<p class="adm-empty">No orders yet.</p>'; return; }
    el.innerHTML = '<table class="adm-table">' +
      '<thead><tr><th>Date</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead>' +
      '<tbody>' + orders.map(function (o) {
        return '<tr>' +
          '<td style="color:var(--t2)">' + fmtDate(o.created_at) + '</td>' +
          '<td><div style="color:#fff">' + esc(o.customer_name) + '</div>' +
            '<div style="color:var(--t3);font-size:11px;">' + esc(o.customer_email) + '</div></td>' +
          '<td style="color:var(--g);font-weight:600;">£' + parseFloat(o.total || 0).toFixed(2) + '</td>' +
          '<td>' + statusBadge(o.status) + '</td>' +
        '</tr>';
      }).join('') + '</tbody></table>';
  }

  window.updateOrderStatus = function (orderId, newStatus) {
    if (!window._sb) return;

    // Dispatching gets special handling: capture the Royal Mail tracking
    // number and auto-send the dispatch email to the customer.
    if (newStatus === 'dispatched') { dispatchOrder(orderId); return; }

    window._sb.from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)
      .then(function (r) {
        if (r.error) {
          console.error('[admin] Status update failed:', r.error.message);
          alert('Status update failed: ' + r.error.message);
          renderOrders(ordersCache);
        } else {
          // Update local cache
          ordersCache.forEach(function (o) { if (o.id === orderId) o.status = newStatus; });
          renderRecentOrders(ordersCache.slice(0, 5));
          updateStats(ordersCache);
          renderDashboard(ordersCache); renderCustomers(ordersCache);
          if (window.showToast) showToast('Order marked ' + newStatus, 'ok');
          // Marking paid → push the order into Royal Mail Click & Drop so a
          // label is ready to print. Idempotent server-side (won't double-import).
          if (newStatus === 'paid') pushToClickAndDrop(orderId);
        }
      });
  };

  // Send one paid order to Click & Drop via /api/clickdrop/push (admin-authed).
  async function pushToClickAndDrop(orderId) {
    try {
      var s = await window._sb.auth.getSession();
      var token = s && s.data && s.data.session && s.data.session.access_token;
      if (!token) return;
      var resp = await fetch('/api/clickdrop/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ order_id: orderId }),
      });
      var d = await resp.json().catch(function () { return {}; });
      if (!resp.ok || (d && d.ok === false)) {
        console.warn('[admin] Click & Drop push:', (d && d.error) || resp.status);
        // Not configured yet is expected before the API key is set — stay quiet then.
        if (resp.status !== 500) alert('Click & Drop: ' + ((d && d.error) || 'could not create the label order.'));
      } else if (d && d.skipped) {
        console.log('[admin] Click & Drop: order already imported.');
      } else {
        console.log('[admin] Click & Drop: order created (' + (d && d.identifier) + ').');
      }
    } catch (e) {
      console.warn('[admin] Click & Drop push threw:', e.message);
    }
  }

  // Mark an order dispatched: prompt for the Royal Mail tracking number,
  // persist tracking/carrier/dispatched_at, then fire the dispatch email.
  function dispatchOrder(orderId) {
    var order = ordersCache.filter(function (o) { return o.id === orderId; })[0];
    if (!order) return;

    var tracking = window.prompt(
      'Royal Mail tracking number for ' + order.customer_name + '\'s order:\n' +
      '(leave blank to dispatch without tracking)',
      order.tracking_number || ''
    );

    // Cancelled — abort and reset the dropdown to the saved status.
    if (tracking === null) { renderOrders(ordersCache); return; }
    tracking = tracking.trim();

    window._sb.from('orders')
      .update({
        status:          'dispatched',
        tracking_number: tracking || null,
        carrier:         'Royal Mail Tracked 24',
        dispatched_at:   new Date().toISOString()
      })
      .eq('id', orderId)
      .then(function (r) {
        if (r.error) {
          console.error('[admin] Dispatch update failed:', r.error.message);
          alert('Could not mark as dispatched: ' + r.error.message);
          renderOrders(ordersCache);
          return;
        }
        order.status = 'dispatched';
        order.tracking_number = tracking || null;
        renderOrders(ordersCache);
        renderRecentOrders(ordersCache.slice(0, 5));
        updateStats(ordersCache);
        sendDispatchEmail(order, tracking);
      });
  }

  // POST the order details to /api/send-dispatch (Resend dispatch template).
  async function sendDispatchEmail(order, tracking) {
    var address = [order.ship_line1, order.ship_line2, order.ship_city, order.ship_postcode, order.ship_country]
      .filter(function (p) { return p && String(p).trim(); })
      .join(', ');

    var items = (order.items || []).map(function (it) {
      return {
        name:  it.name + (it.size ? ' (' + it.size + ')' : ''),
        qty:   it.qty || 1,
        price: '£' + parseFloat(it.price || 0).toFixed(2)
      };
    });

    var ref = order.notes || order.id.slice(0, 8).toUpperCase();

    // send-dispatch is admin-gated — attach the signed-in admin's access token.
    var s = await window._sb.auth.getSession();
    var token = s && s.data && s.data.session && s.data.session.access_token;
    if (!token) { alert('Your session expired — please sign in again to send the dispatch email.'); return; }

    fetch('/api/send-dispatch', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body:    JSON.stringify({
        orderNumber:    ref,
        customerEmail:  order.customer_email,
        customerName:   order.customer_name,
        trackingNumber: tracking,
        address:        address,
        items:          items,
        total:          '£' + parseFloat(order.total || 0).toFixed(2)
      })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; })
          .then(function (d) { return { ok: res.ok, data: d }; });
      })
      .then(function (out) {
        if (out.ok) {
          alert('Dispatch email sent to ' + order.customer_email + (tracking ? '\nTracking: ' + tracking : ''));
        } else {
          alert('Order marked dispatched, but the email failed: ' + ((out.data && out.data.error) || 'unknown error'));
        }
      })
      .catch(function (e) {
        alert('Order marked dispatched, but the email request failed: ' + e.message);
      });
  }

  function updateStats(orders) {
    var paid = orders.filter(function (o) { return o.status === 'paid' || o.status === 'dispatched'; });
    var revenue = paid.reduce(function (s, o) { return s + parseFloat(o.total || 0); }, 0);
    var ordEl  = document.getElementById('stat-orders');
    var paidEl = document.getElementById('stat-paid');
    var revEl  = document.getElementById('stat-revenue');
    if (ordEl)  ordEl.textContent  = orders.length;
    if (paidEl) paidEl.textContent = paid.length;
    if (revEl)  revEl.textContent  = '£' + revenue.toFixed(0);

    // Recovered = orders that received a recovery email (recovery_stage > 0)
    // and then went on to be paid/dispatched. Shows what the recovery flows earn.
    var recovered = paid.filter(function (o) { return Number(o.recovery_stage || 0) > 0; });
    var recoveredRev = recovered.reduce(function (s, o) { return s + parseFloat(o.total || 0); }, 0);
    var recEl = document.getElementById('stat-recovered');
    var recSub = document.getElementById('stat-recovered-sub');
    if (recEl)  recEl.textContent  = '£' + recoveredRev.toFixed(0);
    if (recSub) recSub.textContent = recovered.length + (recovered.length === 1 ? ' order' : ' orders');
  }

  // ── DASHBOARD (period stats + chart) + CUSTOMERS + ORDER FILTER ──────────────
  var DASH_PERIOD = '7';
  var extrasWired = false;
  var ANALYTICS = [];

  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  var liveWired = false;
  async function loadAnalytics() {
    if (!window._sb) return;
    if (!liveWired) {
      liveWired = true;
      var lc = document.getElementById('live-count');
      if (lc) lc.addEventListener('click', loadLive);
      loadLive();
      setInterval(loadLive, 15000);
    }
    try {
      var s = await window._sb.auth.getSession();
      var token = s && s.data && s.data.session && s.data.session.access_token;
      if (!token) return;
      var r = await fetch('/api/admin/analytics', { headers: { 'Authorization': 'Bearer ' + token } });
      var d = await r.json().catch(function () { return {}; });
      ANALYTICS = (d && d.rows) || [];
      renderDashboard(ordersCache);
    } catch (e) { /* dashboard still works without GA */ }
  }

  // Live "on site now" counter — distinct devices with a heartbeat in the last 90s.
  async function loadLive() {
    var el = document.getElementById('live-count-n');
    if (!el || !window._sb) return;
    try {
      var s = await window._sb.auth.getSession();
      var token = s && s.data && s.data.session && s.data.session.access_token;
      if (!token) return;
      var r = await fetch('/api/admin/live', { headers: { 'Authorization': 'Bearer ' + token } });
      var d = await r.json().catch(function () { return {}; });
      el.textContent = (d && typeof d.live === 'number') ? String(d.live) : '—';
    } catch (e) {}
  }

  function isPaid(o) { return o.status === 'paid' || o.status === 'dispatched'; }
  function ordUnits(o) { return orderItems(o).reduce(function (s, it) { return s + (Number(it.qty || it.quantity) || 1); }, 0); }
  function startOfDay(d) { d = new Date(d); d.setHours(0, 0, 0, 0); return d; }

  function wireAdminExtras() {
    if (extrasWired) return; extrasWired = true;
    document.querySelectorAll('.dash-per').forEach(function (b) {
      b.addEventListener('click', function () { DASH_PERIOD = b.dataset.period; renderDashboard(ordersCache); });
    });
    var os = document.getElementById('ord-search'); if (os) os.addEventListener('input', applyOrderFilter);
    var of = document.getElementById('ord-filter'); if (of) of.addEventListener('change', applyOrderFilter);
    var cs = document.getElementById('cust-search'); if (cs) cs.addEventListener('input', function () { renderCustomers(ordersCache); });
  }

  function renderDashboard(orders) {
    var el = document.getElementById('dash-stats');
    if (!el) return;
    var now = new Date();
    var since;
    if (DASH_PERIOD === 'today') since = startOfDay(now);
    else { since = startOfDay(now); since.setDate(since.getDate() - (Number(DASH_PERIOD) - 1)); }
    var inPeriod = orders.filter(function (o) { return isPaid(o) && new Date(o.created_at) >= since; });
    var rev = inPeriod.reduce(function (s, o) { return s + (parseFloat(o.total) || 0); }, 0);
    var units = inPeriod.reduce(function (s, o) { return s + ordUnits(o); }, 0);
    var n = inPeriod.length;
    var aov = n ? rev / n : 0;
    var label = DASH_PERIOD === 'today' ? 'today' : 'last ' + DASH_PERIOD + ' days';
    // GA visitors + conversion for the same window
    var sinceStr = ymd(since);
    var conn = (ANALYTICS || []).length > 0;
    var sessions = (ANALYTICS || []).filter(function (a) { return a.date >= sinceStr; }).reduce(function (s, a) { return s + (a.sessions || 0); }, 0);
    var convRate = sessions ? (n / sessions * 100) : 0;
    el.innerHTML =
      card2('Revenue', '£' + rev.toFixed(2), label) +
      card2('Orders', String(n), label) +
      card2('Avg order', '£' + aov.toFixed(2), n + ' paid') +
      card2('Units sold', String(units), label) +
      card2('Visitors', conn ? String(sessions) : '—', conn ? label + ' (unique / day)' : 'no visits tracked yet') +
      card2('Conversion', (conn && sessions) ? convRate.toFixed(1) + '%' : '—', conn ? (n + ' orders / ' + sessions + ' visitors') : 'no visit data yet');
    // highlight active period button
    document.querySelectorAll('.dash-per').forEach(function (b) {
      var on = b.dataset.period === DASH_PERIOD;
      b.style.color = on ? '#01D3A0' : ''; b.style.borderColor = on ? '#01D3A0' : '';
    });
    drawDashChart(orders);
  }

  function card2(l, v, sub) {
    return '<div class="stat-card"><div class="stat-label">' + l + '</div><div class="stat-value">' + v + '</div><div class="stat-sub">' + (sub || '') + '</div></div>';
  }

  function drawDashChart(orders) {
    var wrap = document.getElementById('dash-chart'); if (!wrap) return;
    var days = 14, today = startOfDay(new Date());
    var buckets = [];
    for (var i = days - 1; i >= 0; i--) { var d = new Date(today); d.setDate(d.getDate() - i); buckets.push({ d: d, rev: 0 }); }
    orders.forEach(function (o) {
      if (!isPaid(o)) return;
      var od = startOfDay(o.created_at).getTime();
      for (var j = 0; j < buckets.length; j++) { if (buckets[j].d.getTime() === od) { buckets[j].rev += parseFloat(o.total) || 0; break; } }
    });
    var max = Math.max(1, Math.max.apply(null, buckets.map(function (b) { return b.rev; })));
    var bars = buckets.map(function (b) {
      var h = Math.round((b.rev / max) * 90);
      var lbl = b.d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      return '<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px" title="' + lbl + ': £' + b.rev.toFixed(2) + '">' +
        '<div style="width:60%;min-height:2px;height:' + Math.max(2, h) + 'px;background:' + (b.rev ? '#01D3A0' : '#1a1a1a') + ';border-radius:3px 3px 0 0"></div>' +
        '<div style="font-size:8px;color:var(--t3,#6b7280);writing-mode:vertical-rl;transform:rotate(180deg);height:34px;overflow:hidden">' + lbl + '</div>' +
      '</div>';
    }).join('');
    wrap.innerHTML = '<div style="font-size:11px;color:var(--t3,#6b7280);margin-bottom:6px">Daily revenue — last 14 days</div>' +
      '<div style="display:flex;align-items:flex-end;gap:3px;height:130px;border-bottom:1px solid var(--brd,#1a1a1a);padding-bottom:2px">' + bars + '</div>';
  }

  function applyOrderFilter() {
    var q = (document.getElementById('ord-search') || {}).value || '';
    var st = (document.getElementById('ord-filter') || {}).value || '';
    q = q.trim().toLowerCase();
    var filtered = ordersCache.filter(function (o) {
      if (st && o.status !== st) return false;
      if (!q) return true;
      var ref = (o.notes || o.id.slice(0, 8)).toLowerCase();
      return (o.customer_name || '').toLowerCase().indexOf(q) > -1 ||
             (o.customer_email || '').toLowerCase().indexOf(q) > -1 ||
             ref.indexOf(q) > -1;
    });
    renderOrders(filtered);
  }

  function renderCustomers(orders) {
    var wrap = document.getElementById('customers-wrap'); if (!wrap) return;
    var paid = orders.filter(isPaid);
    var m = {};
    paid.forEach(function (o) {
      var key = (o.customer_email || o.customer_name || 'unknown').toLowerCase();
      if (!m[key]) m[key] = { name: o.customer_name || '—', email: o.customer_email || '', orders: 0, spend: 0, last: o.created_at };
      m[key].orders++; m[key].spend += parseFloat(o.total) || 0;
      if (new Date(o.created_at) > new Date(m[key].last)) m[key].last = o.created_at;
      if (!m[key].name || m[key].name === '—') m[key].name = o.customer_name || m[key].name;
    });
    var list = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.spend - a.spend; });
    var repeat = list.filter(function (c) { return c.orders > 1; }).length;
    var statsEl = document.getElementById('cust-stats');
    if (statsEl) statsEl.innerHTML = card2('Customers', String(list.length), 'with a paid order') + card2('Repeat buyers', String(repeat), '2+ orders');

    var q = ((document.getElementById('cust-search') || {}).value || '').trim().toLowerCase();
    if (q) list = list.filter(function (c) { return (c.name || '').toLowerCase().indexOf(q) > -1 || (c.email || '').toLowerCase().indexOf(q) > -1; });
    if (!list.length) { wrap.innerHTML = '<div class="adm-empty">No customers yet.</div>'; return; }
    wrap.innerHTML = '<table class="adm-table"><thead><tr><th>Customer</th><th>Orders</th><th>Total spent</th><th>Last order</th></tr></thead><tbody>' +
      list.map(function (c) {
        return '<tr><td><div style="color:#fff">' + esc(c.name) + (c.orders > 1 ? ' <span style="color:#01D3A0;font-size:10px">★ repeat</span>' : '') + '</div>' +
          '<div style="color:var(--t3,#6b7280);font-size:11px">' + esc(c.email) + '</div></td>' +
          '<td>' + c.orders + '</td><td style="color:var(--g,#01D3A0);font-weight:600">£' + c.spend.toFixed(2) + '</td>' +
          '<td style="color:var(--t2,#9ca3af)">' + fmtDate(c.last) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  // ── SUBSCRIBERS ───────────────────────────────────────────────────────────

  var lastSubs = [];
  var subsExportBound = false;
  function loadSubscribers() {
    if (!window._sb) return;
    if (!subsExportBound) {
      var xbtn = document.getElementById('subs-export');
      if (xbtn) { xbtn.addEventListener('click', exportSubscribersCSV); subsExportBound = true; }
    }
    window._sb.from('subscribers')
      .select('*')
      .order('created_at', { ascending: false })
      .then(function (r) {
        var subs = r.data || [];
        lastSubs = subs;
        var subsEl = document.getElementById('stat-subs');
        if (subsEl) subsEl.textContent = subs.length;
        renderSubscribers(subs);
      });
  }

  function exportSubscribersCSV() {
    if (!lastSubs.length) { if (window.toast) window.toast('No subscribers to export yet.'); return; }
    var rows = [['email', 'subscribed_at', 'source', 'status']];
    lastSubs.forEach(function (s) {
      rows.push([
        s.email || '',
        s.created_at ? new Date(s.created_at).toISOString() : '',
        s.source || 'website',
        s.unsubscribed_at ? 'unsubscribed' : 'active',
      ]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (v) {
        v = String(v == null ? '' : v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\r\n');
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'velox-subscribers-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function renderSubscribers(subs) {
    var el = document.getElementById('subscribers-table-wrap');
    if (!el) return;
    if (!subs.length) { el.innerHTML = '<p class="adm-empty">No subscribers yet.</p>'; return; }
    el.innerHTML = '<table class="adm-table">' +
      '<thead><tr><th>Date</th><th>Email</th><th>Source</th></tr></thead>' +
      '<tbody>' + subs.map(function (s) {
        return '<tr>' +
          '<td style="color:var(--t2)">' + fmtDate(s.created_at) + '</td>' +
          '<td style="color:#fff;">' + esc(s.email) + '</td>' +
          '<td style="color:var(--t3)">' + esc(s.source || 'website') + '</td>' +
        '</tr>';
      }).join('') + '</tbody></table>';
  }

  // ── AFFILIATES ────────────────────────────────────────────────────────────

  function loadAffiliates() {
    if (!window._sb) return;
    window._sb.from('affiliates')
      .select('*')
      .order('created_at', { ascending: false })
      .then(function (r) {
        var affs = r.data || [];
        var affsEl = document.getElementById('stat-affs');
        if (affsEl) affsEl.textContent = affs.length;
        renderAffiliates(affs);
      });
  }

  function affStatusBadge(s) {
    var cls = { pending_approval:'s-pending', active:'s-paid', rejected:'s-cancelled', disabled:'s-cancelled' }[s] || 's-pending';
    var label = { pending_approval:'pending approval', active:'active', rejected:'rejected', disabled:'disabled' }[s] || s;
    return '<span class="status-badge ' + cls + '">' + esc(label) + '</span>';
  }
  function suggestCode(a) {
    var base = (a.name || 'AFF').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    return base || 'AFF';
  }
  function setAffMsg(id, t, ok) { var e = document.getElementById('aff-' + id + '-msg'); if (e) { e.textContent = t; e.style.color = ok ? '#01D3A0' : '#f87171'; } }

  function renderAffiliates(affs) {
    var el = document.getElementById('affiliates-table-wrap');
    if (!el) return;
    if (!affs.length) { el.innerHTML = '<p class="adm-empty">No affiliate applications yet.</p>'; return; }
    el.innerHTML = affs.map(function (a) {
      var rid = 'aff-' + a.id;
      var commission = (a.commission_type === 'flat')
        ? ('£' + Number(a.commission_rate || 0).toFixed(2) + ' flat')
        : (Number(a.commission_rate || 0) + '% of subtotal');
      var head =
        '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline">' +
          '<div><span style="color:#fff;font-weight:700">' + esc(a.name) + '</span> ' + affStatusBadge(a.status) +
            '<div style="color:var(--t3);font-size:12px">' + esc(a.email) +
              (a.payout_details ? (' &middot; payout: ' + esc(a.payout_details)) : '') + '</div>' +
            (a.promo_method ? ('<div style="color:var(--t3);font-size:12px">promo: ' + esc(a.promo_method) + '</div>') : '') +
          '</div>' +
          '<div style="color:var(--t2);font-size:12px;text-align:right">' + fmtDate(a.created_at) +
            (a.ref_code ? ('<div style="font-family:monospace;color:var(--g);font-size:14px">' + esc(a.ref_code) + '</div>') : '') +
            (a.status === 'active' ? ('<div style="color:var(--t2)">' + commission + '</div>') : '') +
          '</div>' +
        '</div>';
      var codeInput = '<input id="' + rid + '-code" class="status-select" style="font-family:monospace;max-width:150px" value="' + esc(a.ref_code || suggestCode(a)) + '" placeholder="CODE">';
      var typeSel = '<select id="' + rid + '-type" class="status-select">' +
        '<option value="percentage"' + (a.commission_type !== 'flat' ? ' selected' : '') + '>% of subtotal</option>' +
        '<option value="flat"' + (a.commission_type === 'flat' ? ' selected' : '') + '>£ flat</option></select>';
      var rateInput = '<input id="' + rid + '-rate" class="status-select" style="max-width:90px" type="number" step="0.01" min="0" value="' + (a.commission_rate != null ? a.commission_rate : 10) + '">';
      var controls = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px">' + codeInput + typeSel + rateInput;
      if (a.status === 'pending_approval') {
        controls += '<button class="btn-p" style="width:auto;padding:8px 16px" onclick="affApprove(\'' + a.id + '\')">Approve</button>' +
                    '<button class="status-select" style="cursor:pointer;color:#f87171" onclick="affSetStatus(\'' + a.id + '\',\'rejected\')">Reject</button>';
      } else if (a.status === 'active') {
        controls += '<button class="btn-p" style="width:auto;padding:8px 16px" onclick="affApprove(\'' + a.id + '\')">Save changes</button>' +
                    '<button class="status-select" style="cursor:pointer" onclick="affSetStatus(\'' + a.id + '\',\'disabled\')">Disable</button>';
      } else {
        controls += '<button class="btn-p" style="width:auto;padding:8px 16px" onclick="affApprove(\'' + a.id + '\')">Re-activate</button>';
      }
      controls += '<span id="' + rid + '-msg" style="font-size:12px;color:#f87171"></span></div>';
      return '<div style="border:1px solid var(--brd,#1a1a1a);border-radius:10px;padding:16px 18px;margin-bottom:12px">' + head + controls + '</div>';
    }).join('');
  }

  // Approve / re-activate / save: assigns code + commission and sets status active.
  window.affApprove = function (id) {
    var code = ((document.getElementById('aff-' + id + '-code') || {}).value || '').trim().toUpperCase();
    var type = (document.getElementById('aff-' + id + '-type') || {}).value || 'percentage';
    var rate = parseFloat((document.getElementById('aff-' + id + '-rate') || {}).value);
    if (!code) { setAffMsg(id, 'Enter a unique code first.'); return; }
    if (isNaN(rate) || rate < 0) { setAffMsg(id, 'Enter a valid commission rate.'); return; }
    setAffMsg(id, 'Saving…', true);
    window._sb.from('affiliates')
      .update({ status: 'active', ref_code: code, commission_type: type, commission_rate: rate })
      .eq('id', id)
      .then(function (r) {
        if (r.error) setAffMsg(id, /duplicate|unique/i.test(r.error.message) ? 'That code is already taken — pick another.' : r.error.message);
        else loadAffiliates();
      });
  };
  window.affSetStatus = function (id, status) {
    if (status === 'rejected' && !window.confirm('Reject this affiliate application?')) return;
    if (status === 'disabled' && !window.confirm('Disable this affiliate? They keep past commissions but earn nothing new and lose dashboard access.')) return;
    window._sb.from('affiliates').update({ status: status }).eq('id', id).then(function (r) {
      if (r.error) setAffMsg(id, r.error.message); else loadAffiliates();
    });
  };

  // ── PRICING (product_variants — single source of truth for every price) ─────
  function loadPricing() {
    if (!window._sb) return;
    window._sb.from('product_variants')
      .select('*')
      .order('slug', { ascending: true })
      .order('sort_order', { ascending: true })
      .then(function (r) { renderPricing(r.data || [], r.error); });
  }

  function pvNumInput(id, field, val) {
    return '<input id="pv-' + id + '-' + field + '" class="status-select" type="number" step="0.01" min="0" value="' +
      (val == null ? '' : val) + '" style="width:72px;text-align:right">';
  }
  function pvCheck(id, field, val) {
    return '<input id="pv-' + id + '-' + field + '" type="checkbox"' + (val ? ' checked' : '') + '>';
  }

  function renderPricing(rows, error) {
    var el = document.getElementById('pricing-table-wrap');
    if (!el) return;
    if (error) { el.innerHTML = '<p class="adm-empty">Could not load prices: ' + esc(error.message) + '</p>'; return; }
    if (!rows.length) { el.innerHTML = '<p class="adm-empty">No products yet — run the product_variants seed.</p>'; return; }
    var html = '<table class="adm-table"><thead><tr>' +
      '<th>Product</th><th>Size</th><th>Base £</th><th>Sale £</th><th>RRP £</th>' +
      '<th>Disc.</th><th>Deal</th><th>Stock</th><th>Low</th><th>Qty</th><th>Sells at</th><th></th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (v) {
      var sells = (v.sale_price != null ? v.sale_price : v.base_price);
      html += '<tr>' +
        '<td style="color:#fff">' + esc(v.name) + '</td>' +
        '<td style="color:var(--t2,#9ca3af)">' + esc(v.size) + '</td>' +
        '<td>' + pvNumInput(v.id, 'base', v.base_price) + '</td>' +
        '<td>' + pvNumInput(v.id, 'sale', v.sale_price) + '</td>' +
        '<td>' + pvNumInput(v.id, 'compare', v.compare_at) + '</td>' +
        '<td align="center">' + pvCheck(v.id, 'disc', v.discountable) + '</td>' +
        '<td align="center">' + pvCheck(v.id, 'deal', v.deal_flag) + '</td>' +
        '<td align="center">' + pvCheck(v.id, 'stock', v.in_stock) + '</td>' +
        '<td align="center">' + pvCheck(v.id, 'low', v.low_stock) + '</td>' +
        '<td align="center"><input id="pv-' + v.id + '-qty" class="status-select" type="number" step="1" min="0" value="' + (v.stock_qty == null ? '' : v.stock_qty) + '" style="width:58px;text-align:right"></td>' +
        '<td id="pv-' + v.id + '-sells" style="color:#01D3A0;font-weight:600;white-space:nowrap">£' + Number(sells).toFixed(2) + '</td>' +
        '<td style="white-space:nowrap"><button class="btn-p" style="width:auto;padding:5px 12px" onclick="savePricing(\'' + v.id + '\')">Save</button> ' +
        '<span id="pv-' + v.id + '-msg" style="font-size:12px"></span></td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  window.savePricing = function (id) {
    function num(field) {
      var raw = (document.getElementById('pv-' + id + '-' + field) || {}).value;
      if (raw == null || String(raw).trim() === '') return null;
      var n = parseFloat(raw);
      return isNaN(n) ? null : Math.round(n * 100) / 100;
    }
    function chk(field) { return !!(document.getElementById('pv-' + id + '-' + field) || {}).checked; }
    var msg = document.getElementById('pv-' + id + '-msg');
    var base = num('base');
    if (base == null || base <= 0) { if (msg) { msg.style.color = '#f87171'; msg.textContent = 'Base price required.'; } return; }
    var sale = num('sale');
    if (msg) { msg.style.color = '#9ca3af'; msg.textContent = 'Saving…'; }
    function qty() {
      var raw = (document.getElementById('pv-' + id + '-qty') || {}).value;
      if (raw == null || String(raw).trim() === '') return null;
      var n = parseInt(raw, 10); return isNaN(n) ? null : Math.max(0, n);
    }
    window._sb.from('product_variants').update({
      base_price: base, sale_price: sale, compare_at: num('compare'),
      discountable: chk('disc'), deal_flag: chk('deal'),
      in_stock: chk('stock'), low_stock: chk('low'), stock_qty: qty()
    }).eq('id', id).then(function (r) {
      if (r.error) { if (msg) { msg.style.color = '#f87171'; msg.textContent = r.error.message; } return; }
      var sellsEl = document.getElementById('pv-' + id + '-sells');
      if (sellsEl) sellsEl.textContent = '£' + Number(sale != null ? sale : base).toFixed(2);
      if (msg) { msg.style.color = '#01D3A0'; msg.textContent = '✓ Saved'; }
      if (window.showToast) showToast('Price updated', 'ok');
    });
  };

  // ── BUNDLES (price auto-computes from components × discount) ─────────────────
  function loadBundlesAdmin() {
    if (!window._sb) return;
    Promise.all([
      window._sb.from('bundles').select('*').order('sort_order', { ascending: true }),
      window._sb.from('bundle_components').select('*').order('sort_order', { ascending: true }),
      window._sb.from('product_variants').select('slug,size,base_price')
    ]).then(function (res) {
      var err = res[0].error || res[1].error || res[2].error;
      renderBundles(res[0].data || [], res[1].data || [], res[2].data || [], err);
    });
  }

  function renderBundles(bundles, comps, variants, error) {
    var el = document.getElementById('bundle-table-wrap');
    if (!el) return;
    if (error) { el.innerHTML = '<p class="adm-empty">Could not load bundles: ' + esc(error.message) + '</p>'; return; }
    if (!bundles.length) { el.innerHTML = '<p class="adm-empty">No bundles yet — run the bundles seed.</p>'; return; }
    var base = {};
    variants.forEach(function (v) { base[v.slug + '|' + v.size] = Number(v.base_price); });
    var byBundle = {};
    comps.forEach(function (c) { (byBundle[c.bundle_slug] = byBundle[c.bundle_slug] || []).push(c); });
    var html = '<table class="adm-table"><thead><tr><th>Bundle</th><th>Components</th><th>Sum £</th><th>Discount %</th><th>Sells at</th><th></th></tr></thead><tbody>';
    bundles.forEach(function (b) {
      var cs = byBundle[b.slug] || [];
      var sum = cs.reduce(function (s, c) { var bp = base[c.product_slug + '|' + c.size]; return s + (bp != null ? bp * (c.qty || 1) : 0); }, 0);
      sum = Math.round(sum * 100) / 100;
      var price = Math.round(sum * (1 - Number(b.discount_pct) / 100) * 100) / 100;
      var compList = cs.map(function (c) { return esc(c.product_slug) + ' ' + esc(c.size); }).join(', ');
      html += '<tr>' +
        '<td style="color:#fff">' + esc(b.name) + '</td>' +
        '<td style="color:var(--t3,#6b7280);font-size:11px">' + compList + '</td>' +
        '<td style="color:var(--t2,#9ca3af)">£' + sum.toFixed(2) + '</td>' +
        '<td><input id="bn-' + b.id + '-disc" class="status-select" type="number" step="0.5" min="0" max="90" value="' + b.discount_pct + '" style="width:70px;text-align:right"></td>' +
        '<td id="bn-' + b.id + '-sells" style="color:#01D3A0;font-weight:600">£' + price.toFixed(2) + '</td>' +
        '<td style="white-space:nowrap"><button class="btn-p" style="width:auto;padding:5px 12px" onclick="saveBundle(\'' + b.id + '\',' + sum + ')">Save</button> ' +
        '<span id="bn-' + b.id + '-msg" style="font-size:12px"></span></td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  window.saveBundle = function (id, sum) {
    var input = document.getElementById('bn-' + id + '-disc');
    var msg = document.getElementById('bn-' + id + '-msg');
    var d = parseFloat(input && input.value);
    if (isNaN(d) || d < 0 || d > 90) { if (msg) { msg.style.color = '#f87171'; msg.textContent = '0–90 only.'; } return; }
    if (msg) { msg.style.color = '#9ca3af'; msg.textContent = 'Saving…'; }
    window._sb.from('bundles').update({ discount_pct: d }).eq('id', id).then(function (r) {
      if (r.error) { if (msg) { msg.style.color = '#f87171'; msg.textContent = r.error.message; } return; }
      var sells = document.getElementById('bn-' + id + '-sells');
      if (sells) sells.textContent = '£' + (Math.round(Number(sum) * (1 - d / 100) * 100) / 100).toFixed(2);
      if (msg) { msg.style.color = '#01D3A0'; msg.textContent = '✓ Saved'; }
    });
  };

}());
