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

  // ── Tab switching ─────────────────────────────────────────────────────────

  window.switchTab = function (tab) {
    document.querySelectorAll('.admin-tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.admin-panel').forEach(function (panel) {
      panel.classList.toggle('active', panel.id === 'panel-' + tab);
    });
  };

  // ── Data loaders ──────────────────────────────────────────────────────────

  function loadAllData() {
    loadOrders();
    loadReviews();
    loadCampaign();
    loadSubscribers();
    loadAffiliates();
    loadActions();
    loadXeroStatus();
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
        renderOrders(ordersCache);
        renderRecentOrders(ordersCache.slice(0, 5));
        updateStats(ordersCache);
      });
  }

  function renderOrders(orders) {
    var el = document.getElementById('orders-table-wrap');
    if (!el) return;
    if (!orders.length) {
      el.innerHTML = '<p class="adm-empty">No orders yet.</p>';
      return;
    }
    el.innerHTML = '<table class="adm-table">' +
      '<thead><tr>' +
        '<th>Date</th><th>Reference</th><th>Customer</th>' +
        '<th>Total</th><th>Status</th><th>Action</th>' +
      '</tr></thead>' +
      '<tbody>' + orders.map(function (o) {
        var ref = o.notes || o.id.slice(0, 8).toUpperCase();
        return '<tr>' +
          '<td style="color:var(--t2)">' + fmtDate(o.created_at) + '</td>' +
          '<td><span style="font-family:monospace;font-size:11px;color:var(--t2)">' + esc(ref) + '</span></td>' +
          '<td><div style="color:#fff;font-size:13px;">' + esc(o.customer_name) + '</div>' +
            '<div style="color:var(--t3);font-size:11px;">' + esc(o.customer_email) + '</div></td>' +
          '<td style="color:var(--g);font-weight:600;">£' + parseFloat(o.total || 0).toFixed(2) + '</td>' +
          '<td>' + statusBadge(o.status) + '</td>' +
          '<td>' +
            '<select class="status-select" onchange="updateOrderStatus(\'' + o.id + '\', this.value)">' +
              ['pending','paid','dispatched','cancelled'].map(function (s) {
                return '<option value="' + s + '"' + (o.status === s ? ' selected' : '') + '>' + s + '</option>';
              }).join('') +
            '</select>' +
          '</td>' +
        '</tr>';
      }).join('') + '</tbody></table>';
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
        }
      });
  };

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
  function sendDispatchEmail(order, tracking) {
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

    fetch('/api/send-dispatch', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
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
  }

  // ── SUBSCRIBERS ───────────────────────────────────────────────────────────

  function loadSubscribers() {
    if (!window._sb) return;
    window._sb.from('subscribers')
      .select('*')
      .order('created_at', { ascending: false })
      .then(function (r) {
        var subs = r.data || [];
        var subsEl = document.getElementById('stat-subs');
        if (subsEl) subsEl.textContent = subs.length;
        renderSubscribers(subs);
      });
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

  function renderAffiliates(affs) {
    var el = document.getElementById('affiliates-table-wrap');
    if (!el) return;
    if (!affs.length) { el.innerHTML = '<p class="adm-empty">No affiliate applications yet.</p>'; return; }
    el.innerHTML = '<table class="adm-table">' +
      '<thead><tr><th>Date</th><th>Name</th><th>Email</th><th>Ref Code</th><th>Discount</th><th>Status</th><th>Action</th></tr></thead>' +
      '<tbody>' + affs.map(function (a) {
        return '<tr>' +
          '<td style="color:var(--t2)">' + fmtDate(a.created_at) + '</td>' +
          '<td style="color:#fff">' + esc(a.name) + '</td>' +
          '<td style="color:var(--t2)">' + esc(a.email) + '</td>' +
          '<td><span style="font-family:monospace;color:var(--g)">' + esc(a.ref_code) + '</span></td>' +
          '<td style="color:var(--t2)">' + a.discount_pct + '%</td>' +
          '<td>' + statusBadge(a.status) + '</td>' +
          '<td>' +
            '<select class="status-select" onchange="updateAffiliateStatus(\'' + a.id + '\', this.value)">' +
              ['pending','approved','rejected'].map(function (s) {
                return '<option value="' + s + '"' + (a.status === s ? ' selected' : '') + '>' + s + '</option>';
              }).join('') +
            '</select>' +
          '</td>' +
        '</tr>';
      }).join('') + '</tbody></table>';
  }

  window.updateAffiliateStatus = function (affId, newStatus) {
    if (!window._sb) return;
    window._sb.from('affiliates')
      .update({ status: newStatus })
      .eq('id', affId)
      .then(function (r) {
        if (r.error) console.error('[admin] Affiliate update failed:', r.error.message);
        else loadAffiliates();
      });
  };

}());
