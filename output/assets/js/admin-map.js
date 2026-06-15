/* admin-map.js — "command center" card grid as the Velox admin landing nav.
 * Renders category-grouped boxes inside #panel-map; each box calls the EXISTING
 * switchTab() to open that real panel. No changes to admin.js. The map is the
 * landing view; the topbar "Map" button returns here from any panel. */
(function () {
  'use strict';

  try { localStorage.setItem('vx_admin_tab', 'map'); } catch (e) {}

  // Grouped to mirror the sidebar sections. id MUST match switchTab() / panel-<id>.
  var SECTIONS = [
    { label:'Main', color:'#01D3A0', tabs:[
      { id:'overview', label:'Overview',  desc:'KPIs & today at a glance' },
      { id:'stats',    label:'Stats',     desc:'Deeper sales & traffic stats' }
    ]},
    { label:'Orders', color:'#38BDF8', tabs:[
      { id:'orders',   label:'Orders',    desc:'Every order & its status' },
      { id:'actions',  label:'Approvals', desc:'Items waiting on you' }
    ]},
    { label:'Marketing', color:'#F59E0B', tabs:[
      { id:'marketing',   label:'Analytics',   desc:'Channel & campaign analytics' },
      { id:'campaign',    label:'Campaigns',   desc:'Email campaigns' },
      { id:'reviews',     label:'Reviews',     desc:'Customer reviews' },
      { id:'subscribers', label:'Subscribers', desc:'Newsletter list' },
      { id:'interest',    label:'Interest',    desc:'Back-in-stock interest' }
    ]},
    { label:'Catalogue', color:'#A78BFA', tabs:[
      { id:'pricing', label:'Pricing & stock',  desc:'Prices, variants & stock' },
      { id:'deal',    label:'Deal of the Week',  desc:'Set the weekly deal' }
    ]},
    { label:'Insights', color:'#F472B6', tabs:[
      { id:'margins',    label:'Margins',      desc:'Cost & margin analysis' },
      { id:'traffic',    label:'Traffic',      desc:'Site traffic' },
      { id:'journeys',   label:'Journeys',     desc:'Customer journeys' },
      { id:'seo',        label:'Search (SEO)', desc:'Search Console & SEO' },
      { id:'design-lab', label:'Design Lab',   desc:'Design Lab admin' }
    ]},
    { label:'People', color:'#34D399', tabs:[
      { id:'customers',  label:'Customers',  desc:'Profiles & Pro members' },
      { id:'affiliates', label:'Affiliates', desc:'Affiliate programme' }
    ]},
    { label:'Account', color:'#94A3B8', tabs:[
      { id:'settings', label:'Settings', desc:'Store settings' }
    ]}
  ];

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  window.showMap = function () {
    if (window.switchTab) window.switchTab('map');
    var st = document.getElementById('screen-title'); if (st) st.textContent = 'Command map';
  };

  function build() {
    var host = document.getElementById('vx-map-graph');
    if (!host || host.__built) return;
    host.__built = true;
    var html = '<div class="vxm-wrap">';
    SECTIONS.forEach(function (sec) {
      html += '<div class="vxm-sech">' + esc(sec.label) + '</div><div class="vxm-grid">';
      sec.tabs.forEach(function (t) {
        html += '<button class="vxm-card" data-tab="' + esc(t.id) + '" style="--ac:' + sec.color + '">' +
                  '<span class="vxm-ac"></span>' +
                  '<span class="vxm-t">' + esc(t.label) + '</span>' +
                  '<span class="vxm-d">' + esc(t.desc) + '</span>' +
                '</button>';
      });
      html += '</div>';
    });
    html += '</div>';
    host.innerHTML = html;

    host.addEventListener('click', function (e) {
      var b = e.target.closest('.vxm-card'); if (!b) return;
      var id = b.getAttribute('data-tab');
      if (window.switchTab) {
        window.switchTab(id);
        if (id === 'journeys' && window.veloxLoadJourneys) window.veloxLoadJourneys();
      }
    });
  }
  window.__vxBuildMap = build;

  function init() { build(); window.showMap(); }
  if (document.readyState !== 'loading') setTimeout(init, 60);
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 60); });
  window.addEventListener('load', function () { setTimeout(function () { build(); window.showMap(); }, 150); });
}());
