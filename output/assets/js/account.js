/**
 * account.js — Velox Peptides account + loyalty dashboard
 *
 * One protected page: shows auth (login/register/reset) when logged out,
 * and the dashboard (overview/orders/addresses/settings) when logged in.
 * All data access is via supabase-js + RLS (each user sees only their own rows).
 */
(function () {
  'use strict';

  var sb = window._sb;
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function show(id) { var e = $(id); if (e) e.style.display = ''; }
  function hide(id) { var e = $(id); if (e) e.style.display = 'none'; }
  function fmtDate(d) { try { return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); } catch(e){ return d; } }
  function money(n) { var v = Math.round(Number(n || 0) * 100) / 100; return '£' + (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)); }

  var TIERS = [
    { name:'Bronze', min:0 }, { name:'Silver', min:500 },
    { name:'Gold', min:1500 }, { name:'Platinum', min:5000 }
  ];

  if (!sb) { $('acc-loading').textContent = 'Account service unavailable. Please refresh.'; return; }

  // ── View tabs ───────────────────────────────────────────────────────────────
  window.authTab = function (f) {
    ['login','register','reset','newpw'].forEach(function (n) {
      var form = $('form-' + n); if (form) form.classList.toggle('active', n === f);
    });
    document.querySelectorAll('.auth-tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-f') === f);
    });
  };
  window.accTab = function (t) {
    document.querySelectorAll('.acc-tab').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-t') === t); });
    document.querySelectorAll('.acc-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'panel-' + t); });
    if (t === 'designs') loadDesigns();
  };

  // ── Design Lab: My Designs tab ────────────────────────────────────────────────
  var dlToken = null;
  function dlEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function dlAaCol(a) { return 'KRH'.includes(a) ? '#01D3A0' : 'DE'.includes(a) ? '#f0637e' : 'AILMFWPV'.includes(a) ? '#7b8cff' : '#8aa0a0'; }
  function dlSeqHTML(seq) { return String(seq).split('').map(function (a) { return '<span style="color:' + dlAaCol(a) + '">' + dlEsc(a) + '</span>'; }).join(''); }

  async function loadDesigns() {
    if (!dlToken) return;
    var el = document.getElementById('designs-list'); if (!el) return;
    el.innerHTML = '<div style="color:var(--t3);font-size:13px">Loading your designs…</div>';
    try {
      var r = await fetch('/api/design-lab/runs', { headers: { 'Authorization': 'Bearer ' + dlToken } });
      if (!r.ok) { el.innerHTML = '<div style="color:var(--t3);font-size:13px">Could not load designs.</div>'; return; }
      var runs = await r.json();
      if (!Array.isArray(runs) || !runs.length) {
        el.innerHTML = '<div style="color:var(--t3);font-size:13px">No saved designs yet — run a design and name it to save it here.</div>'; return;
      }
      var html = '';
      runs.forEach(function (run) {
        var cands = Array.isArray(run.candidates) ? run.candidates : [];
        var dt = run.created_at ? new Date(run.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        var topCand = cands.reduce(function (best, c) { return (!best || (c.scores || {}).comp > (best.scores || {}).comp) ? c : best; }, null);
        html += '<div style="background:#0e141b;border:1px solid #1a2230;border-radius:10px;padding:14px 16px;margin-bottom:10px">' +
          '<div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">' +
            '<div style="flex:1;min-width:0">' +
              '<div style="font-size:14px;font-weight:700;color:#dfe6e4;margin-bottom:3px">' + dlEsc(run.name || 'Unnamed design') + '</div>' +
              '<div style="font-size:12px;color:#6b7a86;margin-bottom:4px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">' + dlEsc(run.target || '') + '</div>' +
              (topCand ? '<div style="font-family:DM Mono,monospace;font-size:12px;letter-spacing:2px;margin:6px 0">' + dlSeqHTML(topCand.sequence || '') + '</div>' : '') +
              '<div style="font-family:DM Mono,monospace;font-size:10px;color:#475262">' + cands.length + ' candidates · ' + dt + (run.is_shared ? ' · <span style="color:#01D3A0">shared</span>' : '') + '</div>' +
            '</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;flex-shrink:0">' +
              '<a href="/design-lab/app/" style="font-size:11px;font-family:DM Mono,monospace;border:1px solid #1a2230;color:#8aa0a0;padding:5px 9px;border-radius:6px;text-decoration:none" onclick="sessionStorage.setItem(\'vp_load_run\',\'' + dlEsc(run.id) + '\')">Load →</a>' +
              (run.share_token ? '<a href="/design-lab/run/?r=' + dlEsc(run.share_token) + '" target="_blank" style="font-size:11px;font-family:DM Mono,monospace;border:1px solid #1a2230;color:' + (run.is_shared ? '#01D3A0' : '#8aa0a0') + ';padding:5px 9px;border-radius:6px;text-decoration:none">' + (run.is_shared ? '✓ Shared' : 'View') + '</a>' : '') +
              '<button onclick="deleteDesign(\'' + dlEsc(run.id) + '\',this)" style="font-size:11px;font-family:DM Mono,monospace;border:1px solid #1a2230;color:#8aa0a0;background:none;padding:5px 9px;border-radius:6px;cursor:pointer">Delete</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      });
      el.innerHTML = html;
    } catch (e) { el.innerHTML = '<div style="color:var(--t3);font-size:13px">Error loading designs.</div>'; }
  }

  window.deleteDesign = async function (id, btn) {
    if (!confirm('Delete this design? This cannot be undone.')) return;
    btn.disabled = true; btn.textContent = '…';
    try {
      var r = await fetch('/api/design-lab/run?id=' + encodeURIComponent(id), { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + dlToken } });
      if (r.ok) { loadDesigns(); }
      else { btn.disabled = false; btn.textContent = 'Delete'; }
    } catch (e) { btn.disabled = false; btn.textContent = 'Delete'; }
  };

  function msg(id, text, ok) { var e = $(id); if (!e) return; e.textContent = text; e.className = 'auth-msg ' + (ok ? 'ok' : 'err'); }
  function accMsg(id, text, ok) { var e = $(id); if (!e) return; e.textContent = text; e.className = 'acc-msg ' + (ok ? 'ok' : 'err'); }

  // ── "Remember me" — approximate session vs 30-day persistence ────────────────
  // Supabase persists the session in localStorage. If the user opted out of
  // "remember me", we tag the session and sign them out when the browser is
  // reopened (no sessionStorage marker survives a browser close).
  function enforceSessionOnly() {
    try {
      if (localStorage.getItem('vp_session_only') === '1' && sessionStorage.getItem('vp_session_alive') !== '1') {
        localStorage.removeItem('vp_session_only');
        sb.auth.signOut();
        return true;
      }
      if (localStorage.getItem('vp_session_only') === '1') sessionStorage.setItem('vp_session_alive', '1');
    } catch (e) {}
    return false;
  }

  // ── Boot ─────────────────────────────────────────────────────────────────────
  // Handle password-recovery links (Supabase appends a recovery token to the URL)
  sb.auth.onAuthStateChange(function (event) {
    if (event === 'PASSWORD_RECOVERY') {
      hide('acc-loading'); hide('dash-view'); show('auth-view');
      window.authTab('newpw');
    }
  });

  (async function boot() {
    try {
      if (enforceSessionOnly()) { hide('acc-loading'); show('auth-view'); return; }
      var r = await sb.auth.getSession();
      if (window.location.hash.indexOf('type=recovery') !== -1) {
        hide('acc-loading'); show('auth-view'); window.authTab('newpw'); return;
      }
      if (r.data && r.data.session) { await enterDashboard(); }
      else { hide('acc-loading'); show('auth-view'); }
    } catch (e) {
      console.error('[account] boot error:', e);
      hide('acc-loading'); show('auth-view');
    }
  })();

  // ── Auth: login ───────────────────────────────────────────────────────────────
  $('li-btn').addEventListener('click', async function () {
    var email = $('li-email').value.trim(), pw = $('li-pw').value;
    if (!email || !pw) { msg('auth-msg-login', 'Enter your email and password.'); return; }
    $('li-btn').disabled = true; msg('auth-msg-login', 'Signing in…', true);
    try {
      if (!$('li-remember').checked) { localStorage.setItem('vp_session_only','1'); sessionStorage.setItem('vp_session_alive','1'); }
      else { localStorage.removeItem('vp_session_only'); }
      var r = await sb.auth.signInWithPassword({ email: email, password: pw });
      if (r.error) { msg('auth-msg-login', r.error.message || 'Sign in failed.'); $('li-btn').disabled = false; return; }
      await afterAuth();
    } catch (e) { msg('auth-msg-login', 'Sign in failed.'); $('li-btn').disabled = false; }
  });

  // ── Auth: register ──────────────────────────────────────────────────────────
  $('rg-btn').addEventListener('click', async function () {
    var name = $('rg-name').value.trim(), email = $('rg-email').value.trim(), pw = $('rg-pw').value;
    if (!name || !email) { msg('auth-msg-register', 'Name and email are required.'); return; }
    if (pw.length < 8)   { msg('auth-msg-register', 'Password must be at least 8 characters.'); return; }
    $('rg-btn').disabled = true; msg('auth-msg-register', 'Creating account…', true);
    try {
      var r = await sb.auth.signUp({ email: email, password: pw, options: { data: { name: name } } });
      if (r.error) { msg('auth-msg-register', r.error.message || 'Could not create account.'); $('rg-btn').disabled = false; return; }
      // If email confirmation is required, there's no active session yet
      if (!r.data.session) { msg('auth-msg-register', 'Account created — check your email to confirm, then sign in.', true); $('rg-btn').disabled = false; return; }
      await afterAuth();
    } catch (e) { msg('auth-msg-register', 'Could not create account.'); $('rg-btn').disabled = false; }
  });

  // ── Auth: reset request ───────────────────────────────────────────────────────
  $('rs-btn').addEventListener('click', async function () {
    var email = $('rs-email').value.trim();
    if (!email) { msg('auth-msg-reset', 'Enter your email.'); return; }
    $('rs-btn').disabled = true;
    try {
      await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/account/' });
      msg('auth-msg-reset', 'If that email has an account, a reset link is on its way.', true);
    } catch (e) { msg('auth-msg-reset', 'Could not send reset email.'); }
    $('rs-btn').disabled = false;
  });

  // ── Auth: set new password (recovery) ─────────────────────────────────────────
  $('np-btn').addEventListener('click', async function () {
    var pw = $('np-pw').value;
    if (pw.length < 8) { msg('auth-msg-newpw', 'Password must be at least 8 characters.'); return; }
    $('np-btn').disabled = true;
    try {
      var r = await sb.auth.updateUser({ password: pw });
      if (r.error) { msg('auth-msg-newpw', r.error.message || 'Could not update password.'); $('np-btn').disabled = false; return; }
      msg('auth-msg-newpw', 'Password updated — loading your account…', true);
      await afterAuth();
    } catch (e) { msg('auth-msg-newpw', 'Could not update password.'); $('np-btn').disabled = false; }
  });

  async function afterAuth() {
    try { await sb.rpc('link_my_orders'); } catch (e) {}            // claim prior guest orders
    try { await sb.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', (await sb.auth.getUser()).data.user.id); } catch (e) {}
    await enterDashboard();
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  var profile = null, orders = [];

  async function enterDashboard() {
    hide('acc-loading'); hide('auth-view'); show('dash-view');
    var sessionData = await sb.auth.getSession();
    var sess = sessionData.data && sessionData.data.session;
    if (sess) dlToken = sess.access_token;
    var uid = sess ? sess.user.id : (await sb.auth.getUser()).data.user.id;
    var pr = await sb.from('profiles').select('*').eq('id', uid).single();
    profile = pr.data || {};
    var orr = await sb.from('orders').select('*').eq('user_id', uid).order('created_at', { ascending: false });
    orders = orr.data || [];
    renderHeader(); renderOverview(); renderOrders(); renderAddresses(); renderSettings();
  }

  function renderHeader() {
    var first = (profile.name && profile.name.trim())
      ? profile.name.trim().split(' ')[0]
      : ((profile.email || '').split('@')[0] || '');
    $('dash-hello').textContent = first ? ('Hello, ' + first) : 'Hello';
    var tier = profile.loyalty_tier || 'Bronze';
    var tb = $('tier-badge'); tb.textContent = tier; tb.className = 'tier-badge tier-' + tier;
  }

  function tierBadge(status) {
    var c = { paid:'b-paid', dispatched:'b-dispatched', cancelled:'b-cancelled' }[status] || 'b-pending';
    return '<span class="badge ' + c + '">' + esc(status) + '</span>';
  }

  function renderOverview() {
    $('ov-balance').textContent  = profile.loyalty_points || 0;
    $('ov-lifetime').textContent = profile.lifetime_points || 0;
    $('ov-tier-sub').textContent = (profile.loyalty_tier || 'Bronze') + ' tier';
    var lifetime = profile.lifetime_points || 0;
    var next = TIERS.find(function (t) { return t.min > lifetime; });
    if (next) {
      $('ov-next-label').textContent = 'To ' + next.name;
      $('ov-next').textContent = (next.min - lifetime) + ' pts';
      var prevMin = TIERS[TIERS.indexOf(next) - 1].min;
      var pct = Math.min(100, Math.round(((lifetime - prevMin) / (next.min - prevMin)) * 100));
      $('ov-prog').style.width = pct + '%';
    } else {
      $('ov-next-label').textContent = 'Top tier';
      $('ov-next').textContent = 'Platinum';
      $('ov-prog').style.width = '100%';
    }
    $('ov-orders').innerHTML = orderTable(orders.slice(0, 5));
  }

  function orderTable(list) {
    if (!list.length) return '<p style="color:var(--t3);font-size:13px">No orders yet.</p>';
    return '<table class="acc-tbl"><thead><tr><th>Date</th><th>Reference</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>' +
      list.map(function (o) {
        var ref = o.notes || o.id.slice(0, 8).toUpperCase();
        return '<tr><td>' + fmtDate(o.created_at) + '</td><td style="font-family:monospace;color:#fff">' + esc(ref) + '</td>' +
          '<td style="color:var(--g)">' + money(o.total) + '</td><td>' + tierBadge(o.status) + '</td>' +
          '<td><button class="addr-actions" style="background:none;border:none;color:var(--g);cursor:pointer;font-size:12px" onclick="reorder(\'' + o.id + '\')">Reorder</button></td></tr>';
      }).join('') + '</tbody></table>';
  }

  function renderOrders() { $('all-orders').innerHTML = orderTable(orders); }

  // Reorder: push the saved items back into the cart
  window.reorder = function (orderId) {
    var o = orders.find(function (x) { return x.id === orderId; });
    if (!o || !o.items) return;
    try {
      var items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
      var cart = items.map(function (it) {
        return { slug: it.slug, name: it.name, size: it.size, price: it.price, qty: it.qty || 1, url: '/compounds/' + (it.slug || '') + '/' };
      });
      localStorage.setItem('vp_cart', JSON.stringify(cart));
      window.location.href = '/cart/';
    } catch (e) { if (window.toast) window.toast('Could not rebuild that order.'); }
  };

  // ── Addresses ───────────────────────────────────────────────────────────────
  var editingIdx = -1;
  function addresses() { return (profile.saved_addresses || []).slice(); }

  function renderAddresses() {
    var list = addresses();
    $('addr-list').innerHTML = list.length ? list.map(function (a, i) {
      return '<div class="addr-card"><div class="addr-actions">' +
        '<button onclick="editAddr(' + i + ')">Edit</button>' +
        '<button class="del" onclick="delAddr(' + i + ')">Delete</button></div>' +
        '<strong style="color:#fff">' + esc(a.label || 'Address') + '</strong><br>' +
        esc(a.line1) + (a.line2 ? '<br>' + esc(a.line2) : '') + '<br>' +
        esc(a.city) + ', ' + esc(a.postcode) + '<br>' + esc(a.country) + '</div>';
    }).join('') : '<p style="color:var(--t3);font-size:13px">No saved addresses.</p>';
    $('addr-add-btn').style.display = list.length >= 5 ? 'none' : '';
  }

  $('addr-add-btn').addEventListener('click', function () { editingIdx = -1; clearAddrForm(); show('addr-form'); hide('addr-add-btn'); });
  $('ad-cancel').addEventListener('click', function () { hide('addr-form'); show('addr-add-btn'); });
  function clearAddrForm() { ['ad-label','ad-line1','ad-line2','ad-city','ad-postcode'].forEach(function (id){ $(id).value=''; }); $('ad-country').value='United Kingdom'; }

  window.editAddr = function (i) {
    var a = addresses()[i]; editingIdx = i;
    $('ad-label').value=a.label||''; $('ad-line1').value=a.line1||''; $('ad-line2').value=a.line2||'';
    $('ad-city').value=a.city||''; $('ad-postcode').value=a.postcode||''; $('ad-country').value=a.country||'United Kingdom';
    show('addr-form'); hide('addr-add-btn');
  };
  window.delAddr = async function (i) {
    var list = addresses(); list.splice(i, 1);
    await saveAddresses(list);
  };
  $('ad-save').addEventListener('click', async function () {
    var a = { id: 'a' + Date.now(), label:$('ad-label').value.trim(), line1:$('ad-line1').value.trim(),
      line2:$('ad-line2').value.trim(), city:$('ad-city').value.trim(), postcode:$('ad-postcode').value.trim(),
      country:$('ad-country').value.trim() || 'United Kingdom' };
    if (!a.line1 || !a.city || !a.postcode) { accMsg('addr-msg','Address line 1, city and postcode are required.'); return; }
    var list = addresses();
    if (editingIdx >= 0) { a.id = list[editingIdx].id || a.id; list[editingIdx] = a; } else { list.push(a); }
    await saveAddresses(list);
    hide('addr-form'); show('addr-add-btn');
  });
  async function saveAddresses(list) {
    var r = await sb.from('profiles').update({ saved_addresses: list }).eq('id', profile.id);
    if (r.error) { accMsg('addr-msg', 'Could not save address.'); return; }
    profile.saved_addresses = list; renderAddresses(); accMsg('addr-msg','Saved.', true);
  }

  // ── Settings ─────────────────────────────────────────────────────────────────
  function renderSettings() { $('set-name').value = profile.name || ''; $('set-email').value = profile.email || ''; }

  $('set-save').addEventListener('click', async function () {
    var name = $('set-name').value.trim(), email = $('set-email').value.trim();
    $('set-save').disabled = true;
    try {
      await sb.from('profiles').update({ name: name }).eq('id', profile.id);
      if (email && email !== profile.email) {
        var r = await sb.auth.updateUser({ email: email });
        if (r.error) { accMsg('set-msg', r.error.message); $('set-save').disabled = false; return; }
        await sb.from('profiles').update({ email: email }).eq('id', profile.id);
        accMsg('set-msg', 'Saved. Check your inbox to confirm the new email.', true);
      } else {
        accMsg('set-msg', 'Saved.', true);
      }
      profile.name = name; renderHeader();
    } catch (e) { accMsg('set-msg', 'Could not save.'); }
    $('set-save').disabled = false;
  });

  $('set-pw-btn').addEventListener('click', async function () {
    var pw = $('set-pw').value;
    if (pw.length < 8) { accMsg('set-pw-msg','Password must be at least 8 characters.'); return; }
    $('set-pw-btn').disabled = true;
    var r = await sb.auth.updateUser({ password: pw });
    accMsg('set-pw-msg', r.error ? (r.error.message || 'Could not update password.') : 'Password updated.', !r.error);
    $('set-pw').value = ''; $('set-pw-btn').disabled = false;
  });

  $('del-btn').addEventListener('click', async function () {
    var pw = $('del-pw').value;
    if (!pw) { accMsg('del-msg','Enter your password to confirm.'); return; }
    $('del-btn').disabled = true; accMsg('del-msg','Verifying…', true);
    // Re-authenticate to confirm identity
    var re = await sb.auth.signInWithPassword({ email: profile.email, password: pw });
    if (re.error) { accMsg('del-msg','Incorrect password.'); $('del-btn').disabled = false; return; }
    var r = await sb.rpc('delete_my_account');
    if (r.error) { accMsg('del-msg','Could not delete account.'); $('del-btn').disabled = false; return; }
    try { localStorage.removeItem('vp_session_only'); } catch (e) {}
    await sb.auth.signOut();
    window.location.href = '/?account_deleted=1';
  });

  // ── Sign out ───────────────────────────────────────────────────────────────
  $('dash-signout').addEventListener('click', async function () {
    try { localStorage.removeItem('vp_session_only'); sessionStorage.removeItem('vp_session_alive'); } catch (e) {}
    await sb.auth.signOut();
    window.location.reload();
  });
}());
