/* Velox Peptides — affiliate portal: auth, status gating, dashboard.
   Affiliates read ONLY their own rows (enforced by RLS). All dashboard data
   comes from commissions/payouts/notifications — never the orders table. */
(function () {
  'use strict';
  var sb = window._sb;
  function $(id) { return document.getElementById(id); }
  function show(id) { var e = $(id); if (e) e.style.display = ''; }
  function hide(id) { var e = $(id); if (e) e.style.display = 'none'; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function money(n) { return '£' + Number(n || 0).toFixed(2); }
  function fmtDate(d) { try { return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); } catch(e){ return d; } }
  function fmtWhen(d) { try { return new Date(d).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); } catch(e){ return d; } }
  function msg(id, text, ok) { var e = $(id); if (!e) return; e.textContent = text; e.className = 'auth-msg ' + (ok ? 'ok' : 'err'); }

  if (!sb) { var l = $('acc-loading'); if (l) l.textContent = 'Could not load — please refresh.'; return; }

  var affiliate = null;
  var commissions = [];
  var ordFilter = 'all';

  // ── Auth tab switching ──
  window.authTab = function (f) {
    ['login','register','reset','newpw'].forEach(function (n) {
      var el = $('form-' + n); if (el) el.classList.toggle('active', n === f);
    });
    document.querySelectorAll('.auth-tab').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-f') === f); });
  };
  window.affTab = function (t) {
    document.querySelectorAll('.acc-tab').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-t') === t); });
    document.querySelectorAll('.acc-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'panel-' + t); });
    if (t === 'notifications') markNotificationsRead();
  };

  sb.auth.onAuthStateChange(function (event) {
    if (event === 'PASSWORD_RECOVERY') { hide('acc-loading'); hide('dash-view'); hide('status-view'); show('auth-view'); window.authTab('newpw'); }
  });

  // ── Boot ──
  (async function boot() {
    if (window.location.hash.indexOf('type=recovery') !== -1) { hide('acc-loading'); show('auth-view'); window.authTab('newpw'); return; }
    var r = await sb.auth.getSession();
    if (r.data && r.data.session) { await loadAffiliate(); }
    else { hide('acc-loading'); show('auth-view'); }
  })();

  // ── Login ──
  $('li-btn').addEventListener('click', async function () {
    var email = $('li-email').value.trim(), pw = $('li-pw').value;
    if (!email || !pw) { msg('auth-msg-login','Enter your email and password.',false); return; }
    msg('auth-msg-login','Signing in…',true); $('li-btn').disabled = true;
    var r = await sb.auth.signInWithPassword({ email: email, password: pw });
    $('li-btn').disabled = false;
    if (r.error) { msg('auth-msg-login', r.error.message || 'Sign in failed.', false); return; }
    msg('auth-msg-login','',true); hide('auth-view'); show('acc-loading'); await loadAffiliate();
  });

  // ── Register (apply) ──
  $('rg-btn').addEventListener('click', async function () {
    var name = $('rg-name').value.trim(), email = $('rg-email').value.trim(), pw = $('rg-pw').value;
    var payout = $('rg-payout').value.trim(), promo = $('rg-promo').value.trim();
    if (!name || !email || !pw) { msg('auth-msg-register','Name, email and password are required.',false); return; }
    if (pw.length < 8) { msg('auth-msg-register','Password must be at least 8 characters.',false); return; }
    if (!payout) { msg('auth-msg-register','Please add payout details so we can pay your commission.',false); return; }
    msg('auth-msg-register','Submitting…',true); $('rg-btn').disabled = true;
    try {
      var resp = await fetch('/api/affiliate/signup', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name:name, email:email, password:pw, payout_details:payout, promo_method:promo })
      });
      var d = await resp.json().catch(function(){ return {}; });
      if (!resp.ok) { msg('auth-msg-register', d.error || 'Could not submit application.', false); $('rg-btn').disabled = false; return; }
      // auto sign-in so they land on the "awaiting approval" screen
      var si = await sb.auth.signInWithPassword({ email: email, password: pw });
      $('rg-btn').disabled = false;
      if (si.error) { msg('auth-msg-register','Application submitted — please sign in.', true); window.authTab('login'); return; }
      msg('auth-msg-register','',true); hide('auth-view'); show('acc-loading'); await loadAffiliate();
    } catch (e) { msg('auth-msg-register','Could not submit — please try again.',false); $('rg-btn').disabled = false; }
  });

  // ── Reset / new password ──
  $('rs-btn').addEventListener('click', async function () {
    var email = $('rs-email').value.trim();
    if (!email) { msg('auth-msg-reset','Enter your email.',false); return; }
    await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/affiliate/' });
    msg('auth-msg-reset','If that email exists, a reset link is on its way.',true);
  });
  $('np-btn').addEventListener('click', async function () {
    var pw = $('np-pw').value;
    if (!pw || pw.length < 8) { msg('auth-msg-newpw','Password must be at least 8 characters.',false); return; }
    var r = await sb.auth.updateUser({ password: pw });
    if (r.error) { msg('auth-msg-newpw', r.error.message || 'Update failed.', false); return; }
    msg('auth-msg-newpw','Password updated — loading…',true); hide('auth-view'); show('acc-loading'); await loadAffiliate();
  });

  // ── Sign out ──
  function wireSignout(id) { var b = $(id); if (b) b.addEventListener('click', async function(){ await sb.auth.signOut(); window.location.reload(); }); }
  wireSignout('dash-signout'); wireSignout('status-signout');

  // ── Load affiliate + branch on status ──
  async function loadAffiliate() {
    var u = await sb.auth.getUser();
    var uid = u.data && u.data.user && u.data.user.id;
    if (!uid) { hide('acc-loading'); show('auth-view'); return; }
    var r = await sb.from('affiliates').select('*').eq('user_id', uid).maybeSingle();
    affiliate = r.data || null;
    hide('acc-loading');
    var st = affiliate ? affiliate.status : 'pending_approval';
    if (st === 'active') { show('dash-view'); await renderDashboard(); return; }
    // gated states
    show('status-view');
    if (st === 'rejected') {
      $('status-ico').textContent = '✕';
      $('status-title').textContent = 'Application not approved';
      $('status-msg').textContent = 'Unfortunately your affiliate application was not approved at this time. If you think this is a mistake, reply to your application email.';
    } else if (st === 'disabled') {
      $('status-ico').textContent = '⏸';
      $('status-title').textContent = 'Account paused';
      $('status-msg').textContent = 'Your affiliate account is currently disabled. Please get in touch if you have questions.';
    } else {
      $('status-ico').textContent = '⏳';
      $('status-title').textContent = 'Application received';
      $('status-msg').textContent = 'Thanks for applying! Your affiliate application is being reviewed. You’ll get access to your dashboard and a unique code once it’s approved.';
    }
  }

  // ── Dashboard ──
  async function renderDashboard() {
    $('aff-code').textContent = affiliate.ref_code || affiliate.code || '—';
    var copyBtn = $('aff-code-copy');
    if (copyBtn) copyBtn.onclick = function () {
      var code = affiliate.ref_code || affiliate.code || '';
      if (navigator.clipboard) navigator.clipboard.writeText(code);
      copyBtn.textContent = 'Copied!'; setTimeout(function(){ copyBtn.textContent = 'Copy code'; }, 1500);
    };

    var cr = await sb.from('commissions').select('*').eq('affiliate_id', affiliate.id).order('created_at',{ascending:false});
    commissions = cr.data || [];
    renderTotals(); renderOrders();

    var pr = await sb.from('payouts').select('*').eq('affiliate_id', affiliate.id).order('created_at',{ascending:false});
    renderPayouts(pr.data || []);

    var nr = await sb.from('notifications').select('*').eq('affiliate_id', affiliate.id).order('created_at',{ascending:false});
    renderNotifications(nr.data || []);

    // filter buttons
    var flt = $('ord-filter');
    if (flt && !flt._wired) {
      flt._wired = true;
      flt.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        ordFilter = b.getAttribute('data-s');
        flt.querySelectorAll('button').forEach(function (x){ x.classList.toggle('active', x === b); });
        renderOrders();
      });
    }
  }

  function sumBy(status) {
    return commissions.filter(function(c){ return c.status === status; })
      .reduce(function(s,c){ return s + Number(c.amount || 0); }, 0);
  }
  function renderTotals() {
    $('t-paid').textContent     = money(sumBy('paid'));
    $('t-payable').textContent  = money(sumBy('payable'));
    $('t-pending').textContent  = money(sumBy('pending'));
    $('t-reversed').textContent = money(sumBy('reversed') + sumBy('clawback'));
  }
  function renderOrders() {
    var list = commissions.filter(function (c) {
      if (ordFilter === 'all') return true;
      if (ordFilter === 'reversed') return c.status === 'reversed' || c.status === 'clawback';
      return c.status === ordFilter;
    });
    var wrap = $('orders-wrap');
    if (!list.length) { wrap.innerHTML = '<p class="empty">No orders in this view.</p>'; return; }
    wrap.innerHTML = '<table class="acc-tbl"><thead><tr>' +
      '<th>Order</th><th>Date</th><th>Order value</th><th>Commission</th><th>Order</th><th>Commission</th>' +
      '</tr></thead><tbody>' + list.map(function (c) {
        return '<tr>' +
          '<td style="color:#fff;font-family:\'DM Mono\',monospace;font-size:12px">' + esc(c.order_reference || '') + '</td>' +
          '<td>' + fmtDate(c.created_at) + '</td>' +
          '<td>' + money(c.subtotal_snapshot) + '</td>' +
          '<td style="color:#fff;font-weight:600">' + money(c.amount) + '</td>' +
          '<td><span class="badge b-' + esc(c.order_status) + '">' + esc(c.order_status || '—') + '</span></td>' +
          '<td><span class="badge b-' + esc(c.status) + '">' + esc(c.status) + '</span></td>' +
        '</tr>';
      }).join('') + '</tbody></table>';
  }
  function renderPayouts(list) {
    var wrap = $('payouts-wrap');
    if (!list.length) { wrap.innerHTML = '<p class="empty">No payouts yet. Confirmed commission is paid out manually by the team.</p>'; return; }
    wrap.innerHTML = '<table class="acc-tbl"><thead><tr><th>Date paid</th><th>Amount</th><th>Reference</th></tr></thead><tbody>' +
      list.map(function (p) {
        return '<tr><td>' + fmtDate(p.paid_at || p.created_at) + '</td><td style="color:#fff;font-weight:600">' + money(p.amount) + '</td><td>' + esc(p.reference || '—') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  var unreadIds = [];
  function renderNotifications(list) {
    unreadIds = list.filter(function(n){ return !n.read; }).map(function(n){ return n.id; });
    var pill = $('notif-pill');
    if (pill) { pill.textContent = unreadIds.length; pill.style.display = unreadIds.length ? 'inline-block' : 'none'; }
    var wrap = $('notif-wrap');
    if (!list.length) { wrap.innerHTML = '<p class="empty">No notifications yet.</p>'; return; }
    wrap.innerHTML = list.map(function (n) {
      return '<div class="notif ' + (n.read ? 'read' : '') + '"><div class="dot"></div><div><div class="msg">' +
        esc(n.message) + '</div><div class="when">' + fmtWhen(n.created_at) + '</div></div></div>';
    }).join('');
  }
  async function markNotificationsRead() {
    if (!unreadIds.length) return;
    var ids = unreadIds.slice(); unreadIds = [];
    var pill = $('notif-pill'); if (pill) pill.style.display = 'none';
    document.querySelectorAll('.notif:not(.read)').forEach(function(el){ el.classList.add('read'); });
    await sb.from('notifications').update({ read: true }).in('id', ids);
  }
}());
