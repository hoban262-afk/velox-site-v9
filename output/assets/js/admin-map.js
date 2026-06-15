/* admin-map.js — live, operational "command center" landing for the Velox admin.
 * Boxes show LIVE figures pulled from window._sb (the authenticated client) and
 * the Catalogue box has an inline stock editor that WRITES through the exact same
 * RLS-guarded path + redeploy the pricing panel uses. Navigation calls the existing
 * switchTab(). No changes to admin.js. */
(function () {
  'use strict';

  try { localStorage.setItem('vx_admin_tab', 'map'); } catch (e) {}

  var SECTIONS = [
    { label:'Main', color:'#01D3A0', tabs:[
      { id:'overview', label:'Overview', desc:'KPIs & today at a glance', live:1 },
      { id:'stats',    label:'Stats',    desc:'Deeper sales & traffic stats' }
    ]},
    { label:'Orders', color:'#38BDF8', tabs:[
      { id:'orders',  label:'Orders',    desc:'Every order & its status', live:1 },
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
      { id:'pricing', label:'Pricing & stock', desc:'Prices, variants & stock', live:1, act:'stock' },
      { id:'deal',    label:'Deal of the Week', desc:'Set the weekly deal', live:1 }
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

  // Supplementary styles (card styles live in index.html; these are the new bits).
  function injectCss(){
    if (document.getElementById('vxm-css')) return;
    var st = document.createElement('style'); st.id = 'vxm-css';
    st.textContent =
      '.vxm-stat{display:block;color:#01D3A0;font-size:12px;font-weight:600;margin-top:9px;min-height:14px;}' +
      '.vxm-act{margin-top:10px;}' +
      '.vxm-act-btn{background:rgba(255,255,255,.05);color:#cbd5e1;border:1px solid rgba(255,255,255,.12);border-radius:7px;font-size:11.5px;font-weight:600;padding:5px 11px;cursor:pointer;}' +
      '.vxm-act-btn:hover{border-color:#A78BFA;color:#fff;}' +
      '#vxm-editor{display:none;margin:18px 24px 6px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.09);border-radius:12px;overflow:hidden;}' +
      '.vxm-ed-h{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid rgba(255,255,255,.07);color:#fff;font-size:14px;font-weight:600;}' +
      '.vxm-x{background:none;border:none;color:#9ca3af;font-size:20px;line-height:1;cursor:pointer;}' +
      '.vxm-ed-body{padding:6px 8px 12px;overflow-x:auto;}' +
      '.vxm-st{width:100%;border-collapse:collapse;font-size:12.5px;min-width:480px;}' +
      '.vxm-st th{text-align:left;color:#6b7280;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.07);}' +
      '.vxm-st td{padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04);color:#e5e7eb;vertical-align:middle;}' +
      '.vxm-st input[type=number]{width:62px;background:#0d0d0d;border:1px solid rgba(255,255,255,.15);border-radius:6px;color:#fff;padding:5px 7px;text-align:right;}' +
      '.vxm-save{background:rgba(1,211,160,.14);color:#01D3A0;border:1px solid rgba(1,211,160,.4);border-radius:6px;font-size:11.5px;font-weight:600;padding:5px 12px;cursor:pointer;}' +
      '.vxm-save:hover{background:rgba(1,211,160,.24);}';
    document.head.appendChild(st);
  }

  window.showMap = function () {
    if (window.switchTab) window.switchTab('map');
    var st = document.getElementById('screen-title'); if (st) st.textContent = 'Command map';
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
                  (t.act === 'stock' ? '<div class="vxm-act"><button class="vxm-act-btn" data-act="stock">Manage stock</button></div>' : '') +
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
        else if (a === 'close-ed') closeEditor();
        else if (a === 'save-stock') saveStock(act.getAttribute('data-id'));
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

  // ── Live figures (reads via the authenticated client the panels use) ────────
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

  // ── Inline stock editor (WRITES via the same guarded path as the pricing panel) ──
  function closeEditor(){ var b = document.getElementById('vxm-editor'); if (b) b.style.display = 'none'; }
  function openStockEditor(){
    var box = document.getElementById('vxm-editor'); if (!box || !window._sb) return;
    box.innerHTML = '<div class="vxm-ed-h"><span>Stock control</span><button class="vxm-x" data-act="close-ed" aria-label="Close">&times;</button></div><div class="vxm-ed-body">Loading…</div>';
    box.style.display = 'block';
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window._sb.from('product_variants').select('id,name,size,in_stock,stock_qty')
      .order('slug', { ascending: true }).order('sort_order', { ascending: true })
      .then(function (r) {
        var body = box.querySelector('.vxm-ed-body');
        if (r.error) { body.innerHTML = '<p style="color:#f87171;padding:10px 12px">Could not load: ' + esc(r.error.message) + '</p>'; return; }
        var rows = r.data || [];
        var h = '<table class="vxm-st"><thead><tr><th>Product</th><th>Size</th><th>In stock</th><th>Qty (blank = ∞)</th><th></th></tr></thead><tbody>';
        rows.forEach(function (v) {
          h += '<tr>' +
            '<td style="color:#fff">' + esc(v.name) + '</td>' +
            '<td style="color:#9ca3af">' + esc(v.size) + '</td>' +
            '<td><input type="checkbox" id="vxs-' + v.id + '-in"' + (v.in_stock ? ' checked' : '') + '></td>' +
            '<td><input type="number" step="1" min="0" id="vxs-' + v.id + '-qty" value="' + (v.stock_qty == null ? '' : v.stock_qty) + '" placeholder="∞"></td>' +
            '<td style="white-space:nowrap"><button class="vxm-save" data-act="save-stock" data-id="' + v.id + '">Save</button> <span id="vxs-' + v.id + '-msg" style="font-size:11.5px"></span></td>' +
            '</tr>';
        });
        h += '</tbody></table>';
        body.innerHTML = h;
      });
  }

  var rdTimer = null;
  function scheduleRedeploy(){
    if (rdTimer) clearTimeout(rdTimer);
    rdTimer = setTimeout(async function () {
      rdTimer = null;
      try {
        var s = await window._sb.auth.getSession();
        var t = s && s.data && s.data.session && s.data.session.access_token;
        if (!t) return;
        var r = await fetch('/api/admin/redeploy', { method: 'POST', headers: { Authorization: 'Bearer ' + t } });
        var d = await r.json().catch(function () { return {}; });
        if (d.queued && window.showToast) showToast('Rebuilding site (~1 min)', 'ok');
      } catch (e) {}
    }, 8000);
  }

  function saveStock(id){
    var inEl = document.getElementById('vxs-' + id + '-in');
    var qEl  = document.getElementById('vxs-' + id + '-qty');
    var msg  = document.getElementById('vxs-' + id + '-msg');
    if (!inEl || !window._sb) return;
    var raw = qEl ? qEl.value : '';
    var qty = (raw == null || String(raw).trim() === '') ? null : parseInt(raw, 10);
    if (qty != null && (isNaN(qty) || qty < 0)) qty = null;
    if (msg) { msg.style.color = '#9ca3af'; msg.textContent = 'Saving…'; }
    window._sb.from('product_variants').update({ in_stock: inEl.checked, stock_qty: qty }).eq('id', id).then(function (r) {
      if (r.error) { if (msg) { msg.style.color = '#f87171'; msg.textContent = r.error.message; } return; }
      if (msg) { msg.style.color = '#01D3A0'; msg.textContent = '✓'; }
      if (window.showToast) showToast('Stock updated', 'ok');
      scheduleRedeploy();
      loadLive();
    });
  }

  function init() { build(); window.showMap(); }
  if (document.readyState !== 'loading') setTimeout(init, 60);
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 60); });
  window.addEventListener('load', function () { setTimeout(function () { build(); window.showMap(); }, 150); });
}());
