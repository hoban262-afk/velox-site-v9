/* ═══════════════════════════════════════════════════════════════════
 *  Velox Peptides — Conversion Features
 *  Parts: order counter · ticker · urgency · viewing · live chat ·
 *         frequently researched together · cart bac-water upsell
 * ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────────
   *  1. ORDER COUNTER  (looks for #order-counter on page)
   * ───────────────────────────────────────────────────────────────── */
  function initOrderCounter() {
    /* supports both .vp-oc class (homepage, multiple spots) and #order-counter id */
    var els = Array.prototype.slice.call(
      document.querySelectorAll('.vp-oc, #order-counter')
    );
    if (!els.length) return;

    var BASE      = 168;
    var BASE_MS   = new Date('2026-05-16T00:00:00Z').getTime();
    var todayMs   = new Date();
    todayMs.setUTCHours(0, 0, 0, 0);
    var days = Math.max(0, Math.round((todayMs.getTime() - BASE_MS) / 86400000));

    /* seeded-random: same result for everyone on the same UTC day */
    function seeded(i) {
      var x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    }

    var total = BASE;
    for (var i = 0; i < days; i++) {
      total += Math.floor(seeded(i) * 7) + 12;   /* 12–18 new orders per day */
    }

    /* count-up animation: from (total - 20) to total over 1.5 s */
    var from = total - 20, to = total;
    var startTs = null, dur = 1500;

    function tick(ts) {
      if (!startTs) startTs = ts;
      var p   = Math.min((ts - startTs) / dur, 1);
      var e   = 1 - Math.pow(1 - p, 3);            /* ease-out cubic */
      var txt = Math.round(from + e * (to - from)).toLocaleString('en-GB') + '+';
      els.forEach(function (el) { el.textContent = txt; });
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }


  /* ─────────────────────────────────────────────────────────────────
   *  2. RECENTLY ORDERED TICKER
   * ───────────────────────────────────────────────────────────────── */
  function initTicker() {
    var items = [
      ['London',     'Retatrutide'],
      ['Manchester', 'BPC-157'],
      ['Edinburgh',  'Semax + Selank Stack'],
      ['Bristol',    'TB-500'],
      ['Birmingham', 'Cognitive Stack'],
      ['Leeds',      'GHK-Cu'],
      ['Dublin',     'Healing & Repair Stack'],
      ['Cardiff',    'MOTS-C'],
      ['Liverpool',  'Glutathione'],
      ['Glasgow',    'NAD+'],
    ];

    var css = [
      '#vp-ticker{position:fixed;bottom:20px;left:20px;z-index:9998;max-width:300px;pointer-events:none;}',
      '@media(max-width:767px){#vp-ticker{left:10px;right:10px;bottom:12px;max-width:none;}}',
      '#vp-ticker-card{background:#0d0d0d;border:1px solid #1f2937;border-left:3px solid #01D3A0;',
      'border-radius:8px;padding:12px 14px;display:flex;align-items:center;gap:10px;',
      'box-shadow:0 4px 24px rgba(0,0,0,.55);opacity:0;transform:translateY(8px);',
      'transition:opacity .4s ease,transform .4s ease;}',
      '#vp-ticker-card.vp-show{opacity:1;transform:translateY(0);}',
      '.vp-tk-logo{width:30px;height:30px;background:#01D3A0;border-radius:5px;flex-shrink:0;',
      'display:flex;align-items:center;justify-content:center;',
      'font-weight:900;font-size:10px;color:#030407;letter-spacing:-.5px;font-family:sans-serif;}',
      '.vp-tk-body{flex:1;min-width:0;}',
      '.vp-tk-name{font-size:12px;font-weight:600;color:#E5E7EB;line-height:1.3;white-space:nowrap;',
      'overflow:hidden;text-overflow:ellipsis;}',
      '.vp-tk-time{font-size:11px;color:#6B7280;margin-top:2px;}',
    ].join('');

    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);

    var wrap = document.createElement('div');
    wrap.id = 'vp-ticker';
    wrap.setAttribute('aria-live', 'polite');
    wrap.setAttribute('aria-atomic', 'true');
    wrap.innerHTML = '<div id="vp-ticker-card">' +
      '<div class="vp-tk-logo">VP</div>' +
      '<div class="vp-tk-body">' +
        '<div class="vp-tk-name" id="vp-tk-main"></div>' +
        '<div class="vp-tk-time" id="vp-tk-time"></div>' +
      '</div>' +
    '</div>';
    document.body.appendChild(wrap);

    var card   = document.getElementById('vp-ticker-card');
    var nameEl = document.getElementById('vp-tk-main');
    var timeEl = document.getElementById('vp-tk-time');
    var idx    = Math.floor(Math.random() * items.length);

    function show() {
      var item = items[idx % items.length];
      idx = (idx + 1) % items.length;
      var mins = Math.floor(Math.random() * 17) + 2;   /* 2–18 mins ago */
      nameEl.textContent = 'Someone in ' + item[0] + ' ordered ' + item[1];
      timeEl.textContent = mins + ' minute' + (mins === 1 ? '' : 's') + ' ago';
      card.classList.add('vp-show');
      setTimeout(function () {
        card.classList.remove('vp-show');
        setTimeout(show, (Math.random() * 10 + 25) * 1000);   /* next: 25–35 s */
      }, 4000);
    }

    /* first appearance: 8–15 s after page load */
    setTimeout(show, (Math.random() * 7 + 8) * 1000);
  }


  /* ─────────────────────────────────────────────────────────────────
   *  3. STOCK URGENCY — product cards + order panel
   * ───────────────────────────────────────────────────────────────── */
  function initUrgency() {
    var stock = {
      'bpc-157': 8, 'tb-500': 6, 'semax': 11, 'selank': 9, 'dsip': 14,
      'retatrutide': 4, 'tesamorelin': 7, 'mots-c': 12, 'nad-plus': 10,
      'glutathione': 15, 'ghk-cu': 8, 'melanotan-ii': 6, 'cjc-1295': 9,
      'kpv': 11, 'bpc157-tb500-mix': 5,
    };

    function makeBadge(count) {
      var low = count < 6;
      var el  = document.createElement('div');
      el.className = 'vp-stock-badge';
      el.textContent = low
        ? 'Only ' + count + ' left — low stock'
        : 'Only ' + count + ' left';
      el.style.cssText = 'font-size:11px;font-weight:600;margin-top:5px;letter-spacing:.02em;' +
        'color:' + (low ? '#FF4444' : '#FF6B00') + ';';
      return el;
    }

    /* product cards (.cc) anywhere on the page */
    document.querySelectorAll('.cc').forEach(function (card) {
      var a = card.querySelector('a[href]');
      if (!a) return;
      var m = (a.getAttribute('href') || '').match(/\/compounds\/([^/]+)\//);
      if (!m || stock[m[1]] === undefined) return;
      var ft = card.querySelector('.cc-ft');
      if (ft) ft.appendChild(makeBadge(stock[m[1]]));
    });

    /* order panel on individual product pages */
    var form = document.querySelector('form[data-compound]');
    if (form) {
      var slug = form.getAttribute('data-compound');
      if (stock[slug] !== undefined) {
        var btn = document.getElementById('add-to-order-btn');
        if (btn) {
          var b = makeBadge(stock[slug]);
          b.style.marginTop = '8px';
          btn.parentNode.insertBefore(b, btn.nextSibling);
        }
      }
    }
  }


  /* ─────────────────────────────────────────────────────────────────
   *  4. VIEWING COUNT — compound detail pages only
   * ───────────────────────────────────────────────────────────────── */
  function initViewing() {
    var m = window.location.pathname.match(/\/compounds\/([^/]+)\//);
    if (!m) return;
    var slug = m[1];

    function rng(seed) {
      var x = Math.sin(seed + 1.7391) * 43758.5453;
      return x - Math.floor(x);
    }
    function getCount() {
      var s   = slug.split('').reduce(function (a, c) { return a + c.charCodeAt(0); }, 0);
      var win = Math.floor(Date.now() / 90000);   /* 90-second window */
      return Math.floor(rng(s * 100 + win) * 9) + 3;   /* 3–11 */
    }

    /* inject pulse-dot CSS once */
    if (!document.getElementById('vp-pulse-css')) {
      var sc = document.createElement('style');
      sc.id = 'vp-pulse-css';
      sc.textContent = '@keyframes vp-pulse{0%,100%{opacity:1}50%{opacity:.25}}';
      document.head.appendChild(sc);
    }

    var h1 = document.querySelector('.cp-h1');
    if (!h1) return;

    var el = document.createElement('div');
    el.id = 'vp-viewing';
    el.style.cssText = 'font-size:12px;color:#01D3A0;opacity:.85;margin:-4px 0 14px;' +
      'display:flex;align-items:center;gap:7px;';
    el.innerHTML = '<span style="display:inline-block;width:7px;height:7px;background:#01D3A0;' +
      'border-radius:50%;animation:vp-pulse 2s ease-in-out infinite;flex-shrink:0;"></span>' +
      '<span id="vp-viewing-count">' + getCount() + ' people viewing this now</span>';

    h1.parentNode.insertBefore(el, h1.nextSibling);

    setInterval(function () {
      var c = document.getElementById('vp-viewing-count');
      if (c) c.textContent = getCount() + ' people viewing this now';
    }, 90000);
  }


  /* ─────────────────────────────────────────────────────────────────
   *  5. LIVE CHAT — Tawk.to
   * ═══════════════════════════════════════════════════════════════════
   *  HOW TO ADD YOUR TAWK.TO WIDGET:
   *  1. Sign up at https://www.tawk.to and create a property for veloxpeps.com
   *  2. Go to Administration → Chat Widget → copy the embed snippet
   *  3. Replace the commented code below with your snippet
   *  4. Your snippet looks like:
   *       var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
   *       (function(){ var s1=document.createElement("script"),
   *         s0=document.getElementsByTagName("script")[0];
   *         s1.async=true;
   *         s1.src='https://embed.tawk.to/[PROPERTY_ID]/[WIDGET_ID]';
   *         s1.charset='UTF-8';
   *         s1.setAttribute('crossorigin','*');
   *         s0.parentNode.insertBefore(s1,s0); })();
   * ═══════════════════════════════════════════════════════════════════ */
  function initLiveChat() {
    /* ↓↓↓ PASTE YOUR TAWK.TO SNIPPET HERE ↓↓↓ */

    /* ↑↑↑ END TAWK.TO SNIPPET ↑↑↑ */
  }


  /* ─────────────────────────────────────────────────────────────────
   *  8. FREQUENTLY RESEARCHED TOGETHER — compound detail pages only
   * ───────────────────────────────────────────────────────────────── */
  function initFRT() {
    var m = window.location.pathname.match(/\/compounds\/([^/]+)\//);
    if (!m) return;
    var slug = m[1];

    var frtData = {
      'bpc-157': [
        { slug:'tb-500',      name:'TB-500',      img:'/assets/images/tb500.png',       price:'£29.99' },
        { slug:'kpv',         name:'KPV',          img:'/assets/images/kpv10mg.png',     price:'£24.99' },
      ],
      'tb-500': [
        { slug:'bpc-157',     name:'BPC-157',      img:'/assets/images/bpc157.png',      price:'£29.99' },
        { slug:'tesamorelin', name:'Tesamorelin',  img:'/assets/images/tesamorelin.png', price:'£34.99' },
      ],
      'semax': [
        { slug:'selank',      name:'Selank',        img:'/assets/images/selank.png',      price:'£24.99' },
        { slug:'dsip',        name:'DSIP',           img:'/assets/images/dsip.png',        price:'£22.99' },
      ],
      'selank': [
        { slug:'semax',       name:'Semax',         img:'/assets/images/semax.png',       price:'£24.99' },
        { slug:'dsip',        name:'DSIP',           img:'/assets/images/dsip.png',        price:'£22.99' },
      ],
      'dsip': [
        { slug:'selank',      name:'Selank',        img:'/assets/images/selank.png',      price:'£24.99' },
        { slug:'semax',       name:'Semax',         img:'/assets/images/semax.png',       price:'£24.99' },
      ],
      'retatrutide': [
        { slug:'mots-c',      name:'MOTS-C',        img:'/assets/images/motsc.png',       price:'£29.99' },
        { slug:'tesamorelin', name:'Tesamorelin',   img:'/assets/images/tesamorelin.png', price:'£34.99' },
      ],
      'tesamorelin': [
        { slug:'cjc-1295',    name:'CJC-1295',      img:'/assets/images/cjc1295wodac.png',price:'£34.99' },
        { slug:'retatrutide', name:'Retatrutide',   img:'/assets/images/retatrutide.png', price:'£59.99' },
      ],
      'mots-c': [
        { slug:'nad-plus',    name:'NAD+',          img:'/assets/images/nadplus.png',     price:'£54.99' },
        { slug:'retatrutide', name:'Retatrutide',   img:'/assets/images/retatrutide.png', price:'£59.99' },
      ],
      'nad-plus': [
        { slug:'glutathione', name:'Glutathione',   img:'/assets/images/glutathione.png', price:'£24.99' },
        { slug:'mots-c',      name:'MOTS-C',        img:'/assets/images/motsc.png',       price:'£29.99' },
      ],
      'glutathione': [
        { slug:'ghk-cu',      name:'GHK-Cu',        img:'/assets/images/ghkcu.png',       price:'£39.99' },
        { slug:'nad-plus',    name:'NAD+',           img:'/assets/images/nadplus.png',     price:'£54.99' },
      ],
      'ghk-cu': [
        { slug:'glutathione', name:'Glutathione',   img:'/assets/images/glutathione.png', price:'£24.99' },
        { slug:'melanotan-ii',name:'MT-II',          img:'/assets/images/mt2.png',         price:'£24.99' },
      ],
      'melanotan-ii': [
        { slug:'ghk-cu',      name:'GHK-Cu',        img:'/assets/images/ghkcu.png',       price:'£39.99' },
        { slug:'glutathione', name:'Glutathione',   img:'/assets/images/glutathione.png', price:'£24.99' },
      ],
      'cjc-1295': [
        { slug:'tesamorelin', name:'Tesamorelin',   img:'/assets/images/tesamorelin.png', price:'£34.99' },
        { slug:'retatrutide', name:'Retatrutide',   img:'/assets/images/retatrutide.png', price:'£59.99' },
      ],
      'kpv': [
        { slug:'bpc-157',     name:'BPC-157',       img:'/assets/images/bpc157.png',      price:'£29.99' },
        { slug:'ghk-cu',      name:'GHK-Cu',        img:'/assets/images/ghkcu.png',       price:'£39.99' },
      ],
    };

    var companions = frtData[slug];
    if (!companions) return;

    var relatedSection = document.getElementById('related-compounds');
    if (!relatedSection) return;

    /* inject CSS once */
    if (!document.getElementById('vp-frt-css')) {
      var sc = document.createElement('style');
      sc.id = 'vp-frt-css';
      sc.textContent = [
        '.vp-frt-grid{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;}',
        '.vp-frt-card{display:flex;align-items:center;gap:12px;',
        'background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);',
        'border-radius:8px;padding:12px;flex:1;min-width:220px;}',
        '.vp-frt-img{width:52px;height:52px;object-fit:contain;border-radius:4px;}',
        '.vp-frt-info{flex:1;min-width:0;}',
        '.vp-frt-name{font-size:13px;font-weight:600;color:#E5E7EB;text-decoration:none;',
        'display:block;margin-bottom:3px;}',
        '.vp-frt-name:hover{color:#01D3A0;}',
        '.vp-frt-price{font-size:12px;color:#9CA3AF;}',
        '.vp-frt-view{font-size:12px;color:#01D3A0;text-decoration:none;',
        'font-weight:600;white-space:nowrap;flex-shrink:0;}',
        '.vp-frt-view:hover{text-decoration:underline;}',
        '.vp-frt-add-btn{display:inline-flex;align-items:center;gap:6px;',
        'background:rgba(1,211,160,.08);color:#01D3A0;',
        'border:1px solid rgba(1,211,160,.28);border-radius:6px;',
        'padding:10px 20px;font-size:13px;font-weight:600;cursor:pointer;',
        'font-family:inherit;letter-spacing:.03em;transition:background .2s,color .2s;}',
        '.vp-frt-add-btn:hover{background:rgba(1,211,160,.18);}',
        '.vp-frt-add-btn.vp-added{background:rgba(1,211,160,.2);cursor:pointer;}',
      ].join('');
      document.head.appendChild(sc);
    }

    var cardsHtml = companions.map(function (c) {
      return '<div class="vp-frt-card">' +
        '<a href="/compounds/' + c.slug + '/" tabindex="-1" aria-hidden="true">' +
          '<img src="' + c.img + '" alt="' + c.name + '" class="vp-frt-img" loading="lazy">' +
        '</a>' +
        '<div class="vp-frt-info">' +
          '<a href="/compounds/' + c.slug + '/" class="vp-frt-name">' + c.name + '</a>' +
          '<div class="vp-frt-price">' + c.price + '</div>' +
        '</div>' +
        '<a href="/compounds/' + c.slug + '/" class="vp-frt-view">View →</a>' +
      '</div>';
    }).join('');

    var section = document.createElement('section');
    section.className = 'cp-section vp-frt-section';
    section.id = 'frequently-researched-together';
    section.innerHTML = '<h2 class="sec-t">Frequently researched together</h2>' +
      '<div class="vp-frt-grid">' + cardsHtml + '</div>' +
      '<button class="vp-frt-add-btn" id="vp-frt-add-btn">+ Add both to order</button>';

    relatedSection.parentNode.insertBefore(section, relatedSection);

    document.getElementById('vp-frt-add-btn').addEventListener('click', function () {
      var btn  = this;
      var cart = [];
      try { cart = JSON.parse(localStorage.getItem('vp_cart') || '[]'); } catch (e) {}
      var added = 0;
      companions.forEach(function (c) {
        var existing = null;
        cart.forEach(function (item) { if (item.slug === c.slug) existing = item; });
        if (existing) {
          existing.qty = (existing.qty || 1) + 1;
        } else {
          cart.push({
            slug:  c.slug,
            name:  c.name,
            url:   '/compounds/' + c.slug + '/',
            size:  'Standard',
            price: parseFloat(c.price.replace('£', '')) || 0,
            qty:   1,
          });
          added++;
        }
      });
      localStorage.setItem('vp_cart', JSON.stringify(cart));
      var total   = cart.reduce(function (s, i) { return s + (i.qty || 1); }, 0);
      var countEl = document.getElementById('nav-cart-count');
      if (countEl) countEl.textContent = String(total);
      if (window.toast) window.toast(added > 0 ? added + ' compound' + (added > 1 ? 's' : '') + ' added to order' : 'Already in order');
      btn.textContent = added > 0 ? '✓ Added — view order →' : '✓ Already in order';
      btn.classList.add('vp-added');
      if (added > 0) {
        btn.addEventListener('click', function () { window.location.href = '/cart/'; }, { once: true });
      }
    });
  }


  /* ─────────────────────────────────────────────────────────────────
   *  9. CART BAC-WATER UPSELL — cart page only
   * ───────────────────────────────────────────────────────────────── */
  function initBacWaterUpsell() {
    if (!document.querySelector('.page-cart')) return;

    var sc = document.createElement('style');
    sc.textContent = [
      '#vp-bw-upsell{background:rgba(245,184,0,.07);',
      'border:1px solid rgba(245,184,0,.25);border-left:3px solid #F5B800;',
      'border-radius:8px;padding:14px 16px;display:flex;align-items:center;',
      'gap:12px;flex-wrap:wrap;margin-bottom:20px;}',
      '#vp-bw-upsell .vp-bw-text{flex:1;min-width:160px;}',
      '#vp-bw-upsell .vp-bw-title{font-size:13px;font-weight:600;color:#E5E7EB;}',
      '#vp-bw-upsell .vp-bw-sub{font-size:12px;color:#9CA3AF;margin-top:3px;}',
      '#vp-bw-upsell .vp-bw-btn{background:#F5B800;color:#030407;border:none;',
      'border-radius:5px;padding:8px 16px;font-size:12px;font-weight:700;',
      'font-family:inherit;white-space:nowrap;text-decoration:none;',
      'display:inline-block;cursor:pointer;flex-shrink:0;}',
      '#vp-bw-upsell .vp-bw-btn:hover{background:#e0a900;}',
    ].join('');
    document.head.appendChild(sc);

    function checkAndShow() {
      var cart = [];
      try { cart = JSON.parse(localStorage.getItem('vp_cart') || '[]'); } catch (e) {}
      if (cart.length === 0) return;   /* empty cart — no upsell */
      var hasBac = cart.some(function (i) {
        return i.slug === 'bacteriostatic-water' ||
          (i.name && i.name.toLowerCase().indexOf('bact') >= 0);
      });
      if (hasBac) return;   /* already has bac water */

      var upsell = document.createElement('div');
      upsell.id = 'vp-bw-upsell';
      upsell.innerHTML =
        '<div class="vp-bw-text">' +
          '<div class="vp-bw-title">💧 Don\'t forget reconstitution water</div>' +
          '<div class="vp-bw-sub">Bacteriostatic Water is required to reconstitute lyophilised peptides &mdash; from £4.99</div>' +
        '</div>' +
        '<a href="/supplies/bacteriostatic-water/" class="vp-bw-btn">Add Bac Water →</a>';

      var col = document.querySelector('.cart-items-col');
      if (col) col.insertBefore(upsell, col.firstChild);
    }

    /* cart renders asynchronously via cart.js — wait a tick */
    setTimeout(checkAndShow, 600);
  }


  /* ─────────────────────────────────────────────────────────────────
   *  INIT
   * ───────────────────────────────────────────────────────────────── */
  function init() {
    initOrderCounter();
    initTicker();
    initUrgency();
    initViewing();
    initLiveChat();
    initFRT();
    initBacWaterUpsell();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
