/**
 * Velox embeddable comparison widget.
 * Drop <div class="vlx-compare" data-ids="bpc-157,tb-500"></div> into any page,
 * then include /assets/js/peptide-data.js and this file before </body>.
 * Renders a compact interactive comparison + a link to the full tool.
 */
(function () {
  function init() {
    var nodes = document.querySelectorAll('.vlx-compare:not([data-vlx-done])');
    if (!nodes.length) return;
    var BY = window.VELOX_PEPTIDE_BY_ID;
    if (!BY) return; // peptide-data.js not loaded yet
    injectCSS();
    nodes.forEach(buildOne);
  }

  var TABS = [
    { k: 'mechanism', label: 'Mechanism' },
    { k: 'receptors', label: 'Receptors' },
    { k: 'properties', label: 'Properties' },
    { k: 'pricing', label: 'Pricing' },
  ];
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function facet(p, tab) {
    if (tab === 'mechanism') return esc(p.mechanism);
    if (tab === 'receptors') return esc(p.receptors);
    if (tab === 'properties') return '<b>MW:</b> ' + (p.mw != null ? esc(p.mw) + ' g/mol' : '—') + ' &nbsp;·&nbsp; <b>Solubility:</b> ' + esc(p.solubility);
    if (tab === 'pricing') {
      if (p.buyUrl) return '<span class="vlxc-price">£' + (p.price % 1 === 0 ? p.price : p.price.toFixed(2)) + '</span> <a class="vlxc-buy" href="' + p.buyUrl + '">Order →</a>';
      return '<span class="vlxc-ns">Not stocked — <a href="/design-lab/order/?name=' + encodeURIComponent(p.name) + '">commission</a> or <a href="/design-lab/">design an alternative</a></span>';
    }
    return '';
  }

  function thumb(p) {
    if (p.imgUrl) return '<img class="vlxc-th" src="' + p.imgUrl + '" alt="' + esc(p.name) + '" loading="lazy">';
    return '<span class="vlxc-th vlxc-letter" style="color:' + p.catColor + '">' + esc(p.name.charAt(0)) + '</span>';
  }

  function buildOne(el) {
    var BY = window.VELOX_PEPTIDE_BY_ID;
    var ids = (el.getAttribute('data-ids') || '').split(',').map(function (x) { return x.trim(); }).filter(function (x) { return BY[x]; });
    if (ids.length < 2) { el.setAttribute('data-vlx-done', '1'); return; }
    el.setAttribute('data-vlx-done', '1');
    var tab = 'mechanism';
    var fullUrl = '/compare/' + ids.join('-vs-') + '/';

    function render() {
      var rows = ids.map(function (id) {
        var p = BY[id];
        return '<div class="vlxc-row">' +
          '<div class="vlxc-id">' + thumb(p) +
          '<div><div class="vlxc-n">' + esc(p.name) + '</div>' +
          '<span class="vlxc-tag" style="background:' + p.catColor + '22;color:' + p.catColor + '">' + esc(p.catLabel) + '</span></div></div>' +
          '<div class="vlxc-c">' + facet(p, tab) + '</div>' +
          '</div>';
      }).join('');
      var tabs = TABS.map(function (t) {
        return '<button class="vlxc-tab' + (t.k === tab ? ' on' : '') + '" data-t="' + t.k + '">' + t.label + '</button>';
      }).join('');
      el.innerHTML =
        '<div class="vlxc-box">' +
          '<div class="vlxc-head"><span class="vlxc-ttl">⚖ Compare side by side</span>' +
          '<a class="vlxc-full" href="' + fullUrl + '">Open full tool →</a></div>' +
          '<div class="vlxc-tabs">' + tabs + '</div>' +
          '<div class="vlxc-rows">' + rows + '</div>' +
          '<div class="vlxc-foot">Computational / research-framed summary · for in vitro research use only</div>' +
        '</div>';
      el.querySelectorAll('[data-t]').forEach(function (b) {
        b.addEventListener('click', function () { tab = b.getAttribute('data-t'); render(); });
      });
    }
    render();
  }

  function injectCSS() {
    if (document.getElementById('vlxc-css')) return;
    var s = document.createElement('style'); s.id = 'vlxc-css';
    s.textContent = [
      '.vlxc-box{background:#0a0e13;border:1px solid #1a2230;border-radius:16px;padding:16px 16px 12px;margin:22px 0;font-family:Inter,system-ui,sans-serif;color:#fff;}',
      '.vlxc-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;}',
      '.vlxc-ttl{font-family:"Barlow Condensed",sans-serif;font-weight:800;text-transform:uppercase;font-size:18px;letter-spacing:.01em;}',
      '.vlxc-full{font-size:12.5px;font-weight:700;color:#01D3A0;text-decoration:none;white-space:nowrap;}',
      '.vlxc-full:hover{text-decoration:underline;}',
      '.vlxc-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;}',
      '.vlxc-tab{background:#0e141b;border:1px solid #1a2230;color:#8aa0a0;font:600 12px Inter,sans-serif;padding:7px 12px;border-radius:8px;cursor:pointer;transition:.13s;}',
      '.vlxc-tab.on{background:#fff;color:#04140f;border-color:#fff;}',
      '.vlxc-tab:not(.on):hover{color:#fff;}',
      '.vlxc-rows{display:flex;flex-direction:column;gap:8px;}',
      '.vlxc-row{display:grid;grid-template-columns:minmax(120px,170px) 1fr;gap:12px;align-items:center;background:#0e141b;border:1px solid #1a2230;border-radius:12px;padding:11px 13px;}',
      '.vlxc-id{display:flex;gap:10px;align-items:center;min-width:0;}',
      '.vlxc-th{width:42px;height:42px;border-radius:9px;object-fit:cover;background:#05070a;border:1px solid #1a2230;flex-shrink:0;}',
      '.vlxc-letter{display:flex;align-items:center;justify-content:center;font-family:"Barlow Condensed",sans-serif;font-weight:900;font-size:20px;}',
      '.vlxc-n{font-weight:800;font-size:14.5px;line-height:1.1;}',
      '.vlxc-tag{display:inline-block;font-family:"DM Mono",monospace;font-size:8.5px;letter-spacing:.04em;text-transform:uppercase;padding:2px 7px;border-radius:999px;margin-top:4px;}',
      '.vlxc-c{font-size:13.5px;line-height:1.5;color:#dfe6ea;min-width:0;}',
      '.vlxc-price{font-family:"Barlow Condensed",sans-serif;font-weight:900;font-size:20px;color:#01D3A0;}',
      '.vlxc-buy{font-weight:700;font-size:12px;color:#01D3A0;text-decoration:none;margin-left:6px;}',
      '.vlxc-ns{color:#8aa0a0;}.vlxc-ns a{color:#01D3A0;text-decoration:none;}',
      '.vlxc-foot{font-family:"DM Mono",monospace;font-size:9.5px;color:#4b5563;margin-top:11px;}',
      '@media(max-width:560px){.vlxc-row{grid-template-columns:1fr;gap:8px;}}',
    ].join('');
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
