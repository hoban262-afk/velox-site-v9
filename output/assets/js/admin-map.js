/* admin-map.js — live, operational "command center" landing for the Velox admin.
 * Boxes show LIVE figures from window._sb and open inline editors that WRITE through
 * the SAME guarded paths the panels use:
 *   - Stock & price -> window._sb.from('product_variants').update(...) + /api/admin/redeploy
 *   - Deal of the Week -> POST/DELETE /api/admin/deal (Bearer session token)
 *   - Order dispatch/cancel -> window.updateOrderStatus() (tracking prompt + dispatch email)
 * Navigation calls the existing switchTab(). No changes to admin.js. */
(function () {
  'use strict';

  try { localStorage.setItem('vx_admin_tab', 'map'); } catch (e) {}

  var SECTIONS = [
    { label:'Main', color:'#01D3A0', tabs:[
      { id:'overview', label:'Overview', desc:'KPIs & today at a glance', live:1 },
      { id:'stats',    label:'Stats',    desc:'Deeper sales & traffic stats' }
    ]},
    { label:'Orders', color:'#38BDF8', tabs:[
      { id:'orders',  label:'Orders',    desc:'Every order & its status', live:1, act:'orders', actLabel:'Dispatch / update' },
      { id:'actions', label:'Approvals', desc:'Items waiting on you' }
    ]},
    { label:'Marketing', color:'#F59E0B', tabs:[
      { id:'marketing',   label:'Analytics',   desc:'Channel & campaign analytics' },
      { id:'campaign',    label:'Campaigns',   desc:'Email campaigns' },
      { id:'reviews',     label:'Reviews',     desc:'Customer reviews' },
      { id:'subscribers', label:'Subscribers', desc:'Newsletter list' },
      { id:'interest',    label:'Interest',    desc:'Back-in-stock interest' }
    ]},
    { label:'Catalogue', color:'#A78BFA', tabs:[
      { id:'pricing', label:'Pricing & stock', desc:'Prices, variants & stock', live:1, act:'stock', actLabel:'Manage stock & price' },
      { id:'deal',    label:'Deal of the Week', desc:'Set the weekly deal', live:1, act:'deal', actLabel:'Edit deal' }
    ]},
    { label:'Insights', color:'#F472B6', tabs:[
      { id:'margins',    label:'Margins',      desc:'Cost & margin analysis' },
      { id:'traffic',    label:'Traffic',      desc:'Site traffic' },
      { id:'journeys',   label:'Journeys',     desc:'Customer journeys' },
      { id:'seo',        label:'Search (SEO)', desc:'Search Console & SEO' },
      { id:'design-lab', label:'Design Lab',   desc:'Design Lab admin' }
    ]},
    { label:'People', color:'#34D399', tabs:[
      { id:'customers',  label:'Customers',  desc:'Profiles & Pro members', live:1 },
      { id:'affiliates', label:'Affiliates', desc:'Affiliate programme' }
    ]},
    { label:'Account', color:'#94A3B8', tabs:[
      { id:'settings', label:'Settings', desc:'Store settings' }
    ]}
  ];

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function gbp0(n){ return '£' + Math.round(Number(n)||0).toLocaleString('en-GB'); }
  function gbp2(n){ return '£' + (Math.round((Number(n)||0)*100)/100).toFixed(2); }
  async function token(){ try { var s = await window._sb.auth.getSession(); return s && s.data && s.data.session && s.data.session.access_token; } catch (e) { return null; } }

  function injectCss(){
    if (document.getElementById('vxm-css')) return;
    var st = document.createElement('style'); st.id = 'vxm-css';
    st.textContent =
      '.vxm-stat{display:block;color:#01D3A0;font-size:12px;font-weight:600;margin-top:9px;min-height:14px;}' +
      '.vxm-act{margin-top:10px;}' +
      '.vxm-act-btn{background:rgba(255,255,255,.05);color:#cbd5e1;border:1px solid rgba(255,255,255,.12);border-radius:7px;font-size:11.5px;font-weight:600;padding:5px 11px;cursor:pointer;}' +
      '.vxm-act-btn:hover{border-color:var(--ac,#01D3A0);color:#fff;}' +
      '#vxm-editor{display:none;margin:18px 24px 6px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.09);border-radius:12px;overflow:hidden;}' +
      '.vxm-ed-h{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid rgba(255,255,255,.07);color:#fff;font-size:14px;font-weight:600;}' +
      '.vxm-x{background:none;border:none;color:#9ca3af;font-size:20px;line-height:1;cursor:pointer;}' +
      '.vxm-ed-body{padding:10px 14px 14px;overflow-x:auto;}' +
      '.vxm-st{width:100%;border-collapse:collapse;font-size:12.5px;min-width:520px;}' +
      '.vxm-st th{text-align:left;color:#6b7280;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.07);}' +
      '.vxm-st td{padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04);color:#e5e7eb;vertical-align:middle;}' +
      '.vxm-st input[type=number]{width:74px;background:#0d0d0d;border:1px solid rgba(255,255,255,.15);border-radius:6px;color:#fff;padding:5px 7px;text-align:right;}' +
      '.vxm-fld{display:block;color:#9ca3af;font-size:11px;margin:10px 2px 4px;}' +
      '.vxm-in,.vxm-sel{width:100%;max-width:420px;background:#0d0d0d;border:1px solid rgba(255,255,255,.15);border-radius:7px;color:#fff;padding:8px 10px;font-size:13px;}' +
      '.vxm-save{background:rgba(1,211,160,.14);color:#01D3A0;border:1px solid rgba(1,211,160,.4);border-radius:6px;font-size:11.5px;font-weight:600;padding:6px 13px;cursor:pointer;}' +
      '.vxm-save:hover{background:rgba(1,211,160,.24);}' +
      '.vxm-danger{background:rgba(248,113,113,.12);color:#f87171;border:1px solid rgba(248,113,113,.4);border-radius:6px;font-size:11.5px;font-weight:600;padding:6px 13px;cursor:pointer;}' +
      '.vxm-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:14px;}';
    document.head.appendChild(st);
  }

  window.showMap = function () {
    if (window.switchTab) window.switchTab('map');
    var s = document.getElementById('screen-title'); if (s) s.textContent = 'Command map';
    loadLive();
  };

  function build() {
    var host = document.getElementById('vx-map-graph');
    if (!host || host.__built) return;
    host.__built = true;
    injectCss();
    var html = '<div class="vxm-wrap">';
    SECTIONS.forEach(function (sec) {
      html += '<div class="vxm-sech">' + esc(sec.label) + '</div><div class="vxm-grid">';
      sec.tabs.forEach(function (t) {
        html += '<div class="vxm-card" data-tab="' + esc(t.id) + '" style="--ac:' + sec.color + '">' +
                  '<span class="vxm-ac"></span>' +
                  '<span class="vxm-t">' + esc(t.label) + '</span>' +
                  '<span class="vxm-d">' + esc(t.desc) + '</span>' +
                  (t.live ? '<span class="vxm-stat" id="vxm-stat-' + esc(t.id) + '">…</span>' : '') +
                  (t.act ? '<div class="vxm-act"><button class="vxm-act-btn" data-act="' + esc(t.act) + '">' + esc(t.actLabel) + '</button></div>' : '') +
                '</div>';
      });
      html += '</div>';
    });
    html += '</div><div id="vxm-editor"></div>';
    host.innerHTML = html;

    host.addEventListener('click', function (e) {
      var act = e.target.closest('[data-act]');
      if (act) {
        e.stopPropagation();
        var a = act.getAttribute('data-act');
        if (a === 'stock') openStockEditor();
        else if (a === 'deal') openDealEditor();
        else if (a === 'orders') openOrdersEditor();
        else if (a === 'close-ed') closeEditor();
        else if (a === 'save-stock') saveStockPrice(act.getAttribute('data-id'));
        else if (a === 'save-deal') saveDeal();
        else if (a === 'clear-deal') clearDeal();
        else if (a === 'dispatch') orderAction(act.getAttribute('data-id'), 'dispatched');
        else if (a === 'cancel-order') orderAction(act.getAttribute('data-id'), 'cancelled');
        return;
      }
      var card = e.target.closest('.vxm-card');
      if (card && window.switchTab) {
        var id = card.getAttribute('data-tab');
        window.switchTab(id);
        if (id === 'journeys' && window.veloxLoadJourneys) window.veloxLoadJourneys();
      }
    });
  }
  window.__vxBuildMap = build;

  // ── Live figures ────────────────────────────────────────────────────────────
  function setStat(id, txt){ var el = document.getElementById('vxm-stat-' + id); if (el) el.textContent = txt; }
  function loadLive(){
    if (!window._sb) { setTimeout(loadLive, 400); return; }
    window._sb.from('orders').select('status,total').then(function (r) {
      var rows = r.data || [], disp = 0, pend = 0, rev = 0;
      rows.forEach(function (o) {
        if (o.status === 'dispatched') { disp++; rev += Number(o.total) || 0; }
        else if (o.status === 'pending') pend++;
      });
      setStat('overview', gbp0(rev) + ' · ' + disp + ' orders');
      setStat('orders', pend + ' pending');
    }).catch(function(){});
    window._sb.from('product_variants').select('in_stock,deal_flag').then(function (r) {
      var rows = r.data || [];
      var oos = rows.filter(function (v) { return v.in_stock === false; }).length;
      var deals = rows.filter(function (v) { return v.deal_flag; }).length;
      setStat('pricing', rows.length + ' variants · ' + oos + ' out');
      setStat('deal', deals ? (deals + ' on deal') : 'none set');
    }).catch(function(){});
    window._sb.from('profiles').select('is_pro,deleted_at').then(function (r) {
      var rows = (r.data || []).filter(function (p) { return !p.deleted_at; });
      var pro = rows.filter(function (p) { return p.is_pro; }).length;
      setStat('customers', rows.length + ' profiles · ' + pro + ' Pro');
    }).catch(function(){});
  }

  // ── Editor shell ─────────────────────────────────────────────────────────────
  function openEditor(title){
    var box = document.getElementById('vxm-editor'); if (!box) return null;
    box.innerHTML = '<div class="vxm-ed-h"><span>' + esc(title) + '</span><button class="vxm-x" data-act="close-ed" aria-label="Close">&times;</button></div><div class="vxm-ed-body">Loading…</div>';
    box.style.display = 'block';
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return box.querySelector('.vxm-ed-body');
  }
  function closeEditor(){ var b = document.getElementById('vxm-editor'); if (b) b.style.display = 'none'; }

  var rdTimer = null;
  function scheduleRedeploy(){
    if (rdTimer) clearTimeout(rdTimer);
    rdTimer = setTimeout(async function () {
      rdTimer = null;
      var t = await token(); if (!t) return;
      try {
        var r = await fetch('/api/admin/redeploy', { method: 'POST', headers: { Authorization: 'Bearer ' + t } });
        var d = await r.json().catch(function () { return {}; });
        if (d.queued && window.showToast) showToast('Rebuilding site (~1 min)', 'ok');
      } catch (e) {}
    }, 8000);
  }

  // ── 1) Stock & price editor (product_variants) ───────────────────────────────
  function openStockEditor(){
    if (!window._sb) return;
    var body = openEditor('Stock & price'); if (!body) return;
    window._sb.from('product_variants').select('id,name,size,base_price,in_stock,stock_qty')
      .order('slug', { ascending: true }).order('sort_order', { ascending: true })
      .then(function (r) {
        if (r.error) { body.innerHTML = '<p style="color:#f87171">Could not load: ' + esc(r.error.message) + '</p>'; return; }
        var rows = r.data || [];
        var h = '<table class="vxm-st"><thead><tr><th>Product</th><th>Size</th><th>Base £</th><th>In stock</th><th>Qty (blank = ∞)</th><th></th></tr></thead><tbody>';
        rows.forEach(function (v) {
          h += '<tr>' +
            '<td style="color:#fff">' + esc(v.name) + '</td>' +
            '<td style="color:#9ca3af">' + esc(v.size) + '</td>' +
            '<td><input type="number" step="0.01" min="0" id="vxs-' + v.id + '-base" value="' + (v.base_price == null ? '' : v.base_price) + '" data-orig="' + (v.base_price == null ? '' : v.base_price) + '"></td>' +
            '<td><input type="checkbox" id="vxs-' + v.id + '-in"' + (v.in_stock ? ' checked' : '') + '></td>' +
            '<td><input type="number" step="1" min="0" id="vxs-' + v.id + '-qty" value="' + (v.stock_qty == null ? '' : v.stock_qty) + '" placeholder="∞"></td>' +
            '<td style="white-space:nowrap"><button class="vxm-save" data-act="save-stock" data-id="' + v.id + '" data-name="' + esc(v.name) + ' ' + esc(v.size) + '">Save</button> <span id="vxs-' + v.id + '-msg" style="font-size:11.5px"></span></td>' +
            '</tr>';
        });
        h += '</tbody></table>';
        body.innerHTML = h;
      });
  }

  function saveStockPrice(id){
    var btn = document.querySelector('[data-act="save-stock"][data-id="' + id + '"]');
    var inEl = document.getElementById('vxs-' + id + '-in');
    var qEl  = document.getElementById('vxs-' + id + '-qty');
    var bEl  = document.getElementById('vxs-' + id + '-base');
    var msg  = document.getElementById('vxs-' + id + '-msg');
    if (!inEl || !bEl || !window._sb) return;
    var base = parseFloat(bEl.value);
    if (isNaN(base) || base <= 0) { if (msg) { msg.style.color = '#f87171'; msg.textContent = 'Base price required.'; } return; }
    base = Math.round(base * 100) / 100;
    var orig = parseFloat(bEl.getAttribute('data-orig'));
    if (!isNaN(orig) && base !== orig) {
      if (!window.confirm('Change ' + (btn ? btn.getAttribute('data-name') : 'this item') + ' base price from ' + gbp2(orig) + ' to ' + gbp2(base) + '?\nThis updates the live store.')) return;
    }
    var raw = qEl ? qEl.value : '';
    var qty = (raw == null || String(raw).trim() === '') ? null : parseInt(raw, 10);
    if (qty != null && (isNaN(qty) || qty < 0)) qty = null;
    if (msg) { msg.style.color = '#9ca3af'; msg.textContent = 'Saving…'; }
    window._sb.from('product_variants').update({ base_price: base, in_stock: inEl.checked, stock_qty: qty }).eq('id', id).then(function (r) {
      if (r.error) { if (msg) { msg.style.color = '#f87171'; msg.textContent = r.error.message; } return; }
      if (bEl) bEl.setAttribute('data-orig', base);
      if (msg) { msg.style.color = '#01D3A0'; msg.textContent = '✓'; }
      if (window.showToast) showToast('Saved', 'ok');
      scheduleRedeploy();
      loadLive();
    });
  }

  // ── 2) Deal of the Week (reuses /api/admin/deal) ─────────────────────────────
  function openDealEditor(){
    if (!window._sb) return;
    var body = openEditor('Deal of the Week'); if (!body) return;
    window._sb.from('product_variants').select('slug,size,name,base_price').order('name', { ascending: true }).then(async function (pv) {
      var vars = pv.data || [];
      var current = null;
      try { var t = await token(); var r = await fetch('/api/admin/deal', { headers: { Authorization: 'Bearer ' + t } }); var d = await r.json().catch(function(){return {};}); current = d && d.deal; } catch (e) {}
      var opts = '<option value="">— choose a product —</option>' + vars.map(function (v) {
        return '<option value="' + esc(v.slug) + '|' + esc(v.size) + '"' + (current && current.slug === v.slug && current.size === v.size ? ' selected' : '') + '>' + esc(v.name) + ' · ' + esc(v.size) + ' (' + gbp2(v.base_price) + ')</option>';
      }).join('');
      body.innerHTML =
        '<div style="color:' + (current ? '#01D3A0' : '#9ca3af') + ';font-size:12.5px;margin-bottom:6px">' +
          (current ? ('Live: ' + esc(current.slug) + ' · ' + current.discount_pct + '% off') : 'No deal running') + '</div>' +
        '<label class="vxm-fld">Product</label><select class="vxm-sel" id="vxd-product">' + opts + '</select>' +
        '<label class="vxm-fld">Discount %</label><input class="vxm-in" type="number" min="1" max="95" step="1" id="vxd-pct" value="' + (current ? current.discount_pct : '') + '" style="max-width:140px">' +
        '<label class="vxm-fld">Headline (optional)</label><input class="vxm-in" type="text" id="vxd-headline" value="' + esc(current && current.headline ? current.headline : '') + '">' +
        '<div class="vxm-row"><button class="vxm-save" data-act="save-deal">Save & publish</button>' +
        '<button class="vxm-danger" data-act="clear-deal">Clear deal</button>' +
        '<span id="vxd-msg" style="font-size:12px"></span></div>';
    });
  }

  async function saveDeal(){
    var sel = document.getElementById('vxd-product');
    var msg = document.getElementById('vxd-msg');
    var key = sel ? sel.value : '';
    var pct = parseFloat((document.getElementById('vxd-pct') || {}).value);
    if (!key) { if (msg) { msg.style.color = '#f87171'; msg.textContent = 'Pick a product.'; } return; }
    if (!(pct > 0 && pct <= 95)) { if (msg) { msg.style.color = '#f87171'; msg.textContent = 'Discount must be 1–95%.'; } return; }
    var parts = key.split('|');
    var body = { slug: parts[0], size: parts[1], discount_pct: pct, headline: (document.getElementById('vxd-headline') || {}).value || '', ends_at: null, active: true, apply: true };
    if (msg) { msg.style.color = '#9ca3af'; msg.textContent = 'Saving…'; }
    var t = await token();
    try {
      var r = await fetch('/api/admin/deal', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify(body) });
      var d = await r.json().catch(function(){return {};});
      if (!r.ok) { if (msg) { msg.style.color = '#f87171'; msg.textContent = (d && d.error) || ('HTTP ' + r.status); } return; }
      if (msg) { msg.style.color = '#01D3A0'; msg.textContent = '✓ Live on the homepage.'; }
      if (window.showToast) showToast('Deal of the Week updated', 'ok');
      loadLive();
    } catch (e) { if (msg) { msg.style.color = '#f87171'; msg.textContent = e.message; } }
  }

  async function clearDeal(){
    if (!window.confirm('Remove the Deal of the Week from the homepage?')) return;
    var msg = document.getElementById('vxd-msg');
    var t = await token();
    try {
      var r = await fetch('/api/admin/deal', { method: 'DELETE', headers: { Authorization: 'Bearer ' + t } });
      if (!r.ok) { if (msg) { msg.style.color = '#f87171'; msg.textContent = 'Clear failed'; } return; }
      if (msg) { msg.style.color = '#01D3A0'; msg.textContent = 'Deal cleared.'; }
      if (window.showToast) showToast('Deal cleared', 'ok');
      loadLive();
    } catch (e) { if (msg) { msg.style.color = '#f87171'; msg.textContent = e.message; } }
  }

  // ── 3) Order dispatch / cancel (reuses window.updateOrderStatus) ─────────────
  function openOrdersEditor(){
    if (!window._sb) return;
    var body = openEditor('Pending orders'); if (!body) return;
    window._sb.from('orders').select('id,customer_name,customer_email,total,created_at,status')
      .eq('status', 'pending').order('created_at', { ascending: false })
      .then(function (r) {
        if (r.error) { body.innerHTML = '<p style="color:#f87171">Could not load: ' + esc(r.error.message) + '</p>'; return; }
        var rows = r.data || [];
        if (!rows.length) { body.innerHTML = '<p style="color:#9ca3af">No pending orders. Everything dispatched.</p>'; return; }
        var h = '<table class="vxm-st"><thead><tr><th>Date</th><th>Customer</th><th>Total</th><th>Action</th></tr></thead><tbody>';
        rows.forEach(function (o) {
          h += '<tr>' +
            '<td style="color:#9ca3af">' + esc((o.created_at || '').slice(0, 10)) + '</td>' +
            '<td><div style="color:#fff">' + esc(o.customer_name) + '</div><div style="color:#6b7280;font-size:11px">' + esc(o.customer_email) + '</div></td>' +
            '<td style="color:#01D3A0;font-weight:600">' + gbp2(o.total) + '</td>' +
            '<td style="white-space:nowrap"><button class="vxm-save" data-act="dispatch" data-id="' + o.id + '">Mark dispatched</button> ' +
            '<button class="vxm-danger" data-act="cancel-order" data-id="' + o.id + '">Cancel</button></td>' +
            '</tr>';
        });
        h += '</tbody></table>';
        body.innerHTML = h;
      });
  }

  function orderAction(id, status){
    if (status === 'cancelled' && !window.confirm('Cancel this order?')) return;
    if (typeof window.updateOrderStatus === 'function') {
      window.updateOrderStatus(id, status);            // full path: tracking prompt + dispatch email
      setTimeout(function () { openOrdersEditor(); loadLive(); }, 1400);
      return;
    }
    // Fallback (cache not ready): minimal direct update.
    var patch = { status: status };
    if (status === 'dispatched') {
      var tn = window.prompt('Royal Mail tracking number (blank = none):', '');
      if (tn === null) return;
      patch.tracking_number = tn.trim() || null; patch.carrier = 'Royal Mail Tracked 24'; patch.dispatched_at = new Date().toISOString();
    }
    window._sb.from('orders').update(patch).eq('id', id).then(function (r) {
      if (r.error) { alert('Update failed: ' + r.error.message); return; }
      if (window.showToast) showToast('Order ' + status, 'ok');
      openOrdersEditor(); loadLive();
    });
  }

  function init() { build(); window.showMap(); }
  if (document.readyState !== 'loading') setTimeout(init, 60);
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 60); });
  window.addEventListener('load', function () { setTimeout(function () { build(); window.showMap(); }, 150); });
}());
