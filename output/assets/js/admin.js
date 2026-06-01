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
      email:    'support@veloxpeps.com',
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
    loadPricing();
    loadBundlesAdmin();
    loadReviews();
    loadCampaign();
    loadSubscribers();
    loadAffiliates();
    loadActions();
    loadXeroStatus();
    loadClickDropStatus();
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
        renderOrders(ordersCache);
        renderRecentOrders(ordersCache.slice(0, 5));
        updateStats(ordersCache);
      });
    var cb = document.getElementById('ord-create');
    if (cb && !cb._wired) { cb._wired = true; cb.addEventListener('click', createOrder); }
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

    // Recovered = orders that received a recovery email (recovery_stage > 0)
    // and then went on to be paid/dispatched. Shows what the recovery flows earn.
    var recovered = paid.filter(function (o) { return Number(o.recovery_stage || 0) > 0; });
    var recoveredRev = recovered.reduce(function (s, o) { return s + parseFloat(o.total || 0); }, 0);
    var recEl = document.getElementById('stat-recovered');
    var recSub = document.getElementById('stat-recovered-sub');
    if (recEl)  recEl.textContent  = '£' + recoveredRev.toFixed(0);
    if (recSub) recSub.textContent = recovered.length + (recovered.length === 1 ? ' order' : ' orders');
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
      '<th>Disc.</th><th>Deal</th><th>Stock</th><th>Low</th><th>Sells at</th><th></th>' +
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
    window._sb.from('product_variants').update({
      base_price: base, sale_price: sale, compare_at: num('compare'),
      discountable: chk('disc'), deal_flag: chk('deal'),
      in_stock: chk('stock'), low_stock: chk('low')
    }).eq('id', id).then(function (r) {
      if (r.error) { if (msg) { msg.style.color = '#f87171'; msg.textContent = r.error.message; } return; }
      var sellsEl = document.getElementById('pv-' + id + '-sells');
      if (sellsEl) sellsEl.textContent = '£' + Number(sale != null ? sale : base).toFixed(2);
      if (msg) { msg.style.color = '#01D3A0'; msg.textContent = '✓ Saved'; }
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
