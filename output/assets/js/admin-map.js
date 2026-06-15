/* admin-map.js — force-directed "command map" navigation for the Velox admin.
 * Renders a node graph of every admin area inside #panel-map and drives the
 * EXISTING switchTab() on node click. No changes to admin.js. The map is the
 * landing view; the topbar "Map" button returns here from any panel. */
(function () {
  'use strict';

  // Land on the map by default (admin restores last tab from this key).
  try { localStorage.setItem('vx_admin_tab', 'map'); } catch (e) {}

  var CATS = {
    hub:'#01D3A0', main:'#01D3A0', orders:'#38BDF8', marketing:'#F59E0B',
    catalogue:'#A78BFA', insights:'#F472B6', people:'#34D399', account:'#94A3B8'
  };

  // id MUST match the existing switchTab() tab ids / panel-<id>.
  var NODES = [
    { id:'velox',       label:'Velox',           cat:'hub',       r:27 },
    { id:'overview',    label:'Overview',         cat:'main',      r:16 },
    { id:'stats',       label:'Stats',            cat:'main',      r:12 },
    { id:'orders',      label:'Orders',           cat:'orders',    r:17 },
    { id:'actions',     label:'Approvals',        cat:'orders',    r:12 },
    { id:'marketing',   label:'Analytics',        cat:'marketing', r:16 },
    { id:'campaign',    label:'Campaigns',        cat:'marketing', r:12 },
    { id:'reviews',     label:'Reviews',          cat:'marketing', r:12 },
    { id:'subscribers', label:'Subscribers',      cat:'marketing', r:12 },
    { id:'interest',    label:'Interest',         cat:'marketing', r:12 },
    { id:'pricing',     label:'Pricing & stock',  cat:'catalogue', r:16 },
    { id:'deal',        label:'Deal of the Week', cat:'catalogue', r:12 },
    { id:'margins',     label:'Margins',          cat:'insights',  r:16 },
    { id:'traffic',     label:'Traffic',          cat:'insights',  r:12 },
    { id:'journeys',    label:'Journeys',         cat:'insights',  r:12 },
    { id:'seo',         label:'Search (SEO)',     cat:'insights',  r:12 },
    { id:'design-lab',  label:'Design Lab',       cat:'insights',  r:12 },
    { id:'customers',   label:'Customers',        cat:'people',    r:16 },
    { id:'affiliates',  label:'Affiliates',       cat:'people',    r:12 },
    { id:'settings',    label:'Settings',         cat:'account',   r:14 }
  ];

  var LINKS = [
    ['velox','overview'],['velox','orders'],['velox','marketing'],['velox','pricing'],
    ['velox','margins'],['velox','customers'],['velox','settings'],
    ['overview','stats'],['orders','actions'],
    ['marketing','campaign'],['marketing','reviews'],['marketing','subscribers'],['marketing','interest'],
    ['pricing','deal'],
    ['margins','traffic'],['margins','journeys'],['margins','seo'],['margins','design-lab'],
    ['customers','affiliates'],
    ['overview','orders'],['orders','customers'],['orders','pricing'],['pricing','margins'],['customers','interest']
  ].map(function (p) { return { source:p[0], target:p[1] }; });

  window.showMap = function () {
    if (window.switchTab) window.switchTab('map');
    var st = document.getElementById('screen-title'); if (st) st.textContent = 'Command map';
  };

  function build() {
    var host = document.getElementById('vx-map-graph');
    if (!host || !window.d3 || host.__built) return;
    var W = host.clientWidth || (host.parentElement && host.parentElement.clientWidth) || 0;
    if (W < 80) { setTimeout(build, 180); return; }   // panel not visible yet — retry
    host.__built = true;
    var H = Math.max(440, Math.min(700, Math.round(W * 0.6)));
    var d3 = window.d3;

    var svg = d3.select(host).append('svg')
      .attr('viewBox', '0 0 ' + W + ' ' + H).attr('width', '100%')
      .style('height', 'auto').style('display', 'block').style('cursor', 'grab');

    var link = svg.append('g').attr('stroke', 'rgba(255,255,255,.13)').attr('stroke-width', 1.1)
      .selectAll('line').data(LINKS).join('line');

    var node = svg.append('g').selectAll('g').data(NODES).join('g').style('cursor', 'pointer')
      .on('click', function (e, d) {
        if (d.id === 'velox') return;
        if (window.switchTab) {
          window.switchTab(d.id);
          if (d.id === 'journeys' && window.veloxLoadJourneys) window.veloxLoadJourneys();
        }
      });

    node.append('circle').attr('r', function (d) { return d.r; })
      .attr('fill', function (d) { return CATS[d.cat] || '#01D3A0'; })
      .attr('fill-opacity', function (d) { return d.cat === 'hub' ? 1 : 0.92; })
      .attr('stroke', '#0a0a0a').attr('stroke-width', 2);

    node.append('text').text(function (d) { return d.label; })
      .attr('text-anchor', 'middle').attr('y', function (d) { return d.r + 13; })
      .attr('font-size', '11.5px').attr('fill', '#cbd5e1').style('pointer-events', 'none');

    node.append('title').text(function (d) { return d.id === 'velox' ? 'Velox' : ('Open ' + d.label); });

    var sim = d3.forceSimulation(NODES)
      .force('link', d3.forceLink(LINKS).id(function (d) { return d.id; })
        .distance(function (l) { return (l.source.id === 'velox' || l.target.id === 'velox') ? 112 : 62; }).strength(0.45))
      .force('charge', d3.forceManyBody().strength(-340))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide().radius(function (d) { return d.r + 20; }))
      .on('tick', function () {
        NODES.forEach(function (d) {
          d.x = Math.max(d.r + 6, Math.min(W - d.r - 6, d.x));
          d.y = Math.max(d.r + 6, Math.min(H - d.r - 18, d.y));
        });
        link.attr('x1', function (d) { return d.source.x; }).attr('y1', function (d) { return d.source.y; })
            .attr('x2', function (d) { return d.target.x; }).attr('y2', function (d) { return d.target.y; });
        node.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
      });

    node.call(d3.drag()
      .on('start', function (e, d) { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag',  function (e, d) { d.fx = e.x; d.fy = e.y; })
      .on('end',   function (e, d) { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
  }
  window.__vxBuildMap = build;

  function init() { window.showMap(); build(); }
  if (document.readyState !== 'loading') setTimeout(init, 60);
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 60); });
  window.addEventListener('load', function () { setTimeout(function () { window.showMap(); build(); }, 150); });
}());
