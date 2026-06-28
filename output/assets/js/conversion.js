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

    var BASE      = 5310;
    var BASE_MS   = new Date('2026-05-31T00:00:00Z').getTime();
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
      total += Math.floor(seeded(i) * 16) + 25;  /* 25–40 new orders per day */
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
      '#vp-ticker-card{background:#0d0d0d;border:1px solid #1f2937;border-left:3px solid #16d6a6;',
      'border-radius:8px;padding:12px 14px;display:flex;align-items:center;gap:10px;',
      'box-shadow:0 4px 24px rgba(0,0,0,.55);opacity:0;transform:translateY(8px);',
      'transition:opacity .4s ease,transform .4s ease;}',
      '#vp-ticker-card.vp-show{opacity:1;transform:translateY(0);}',
      '.vp-tk-logo{width:30px;height:30px;background:#16d6a6;border-radius:5px;flex-shrink:0;',
      'display:flex;align-items:center;justify-content:center;',
      'font-weight:900;font-size:10px;color:#030407;letter-spacing:-.5px;font-family:sans-serif;}',
      '.vp-tk-body{flex:1;min-width:0;}',
      '.vp-tk-name{font-size:12px;font-weight:600;color:#E5E7EB;line-height:1.35;white-space:normal;',
      'word-break:break-word;}',
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
   *  3. STOCK URGENCY — per-variation, detail page indicator
   * ───────────────────────────────────────────────────────────────── */
  function initUrgency() {

    /* ── Date-seeded RNG: same result for everyone on the same day, changes daily ──
     *  Seed = date (YYYYMMDD) + slug + size → unique per product+variant per day   */
    function stockRng(slug, size) {
      var d  = new Date();
      var dn = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
      var str = dn + '|' + slug + '|' + size;
      var h = 0;
      for (var i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
      var x = Math.sin(Math.abs(h)) * 43758.5453;
      return x - Math.floor(x);
    }

    /* Returns today's fluctuating stock count for a given slug + size */
    function getStockCount(slug, size) {
      var r = stockRng(slug, size);
      if (slug === 'retatrutide') {
        if (size === '10mg')     return Math.floor(r * 3) + 2;  /* 2–4  */
        if (size === '15mg')     return Math.floor(r * 4) + 6;  /* 6–9  */
        if (size === '20mg')     return Math.floor(r * 3) + 3;  /* 3–5  */
        if (size === '40mg Pen') return Math.floor(r * 3) + 2;  /* 2–4  */
      }
      return Math.floor(r * 9) + 6;                             /* 6–14 */
    }

    /* Slugs that show a stock indicator on their detail page */
    var trackedSlugs = {
      'bpc-157': 1, 'tb-500': 1, 'semax': 1, 'selank': 1, 'dsip': 1,
      'retatrutide': 1, 'tesamorelin': 1, 'mots-c': 1, 'nad-plus': 1,
      'glutathione': 1, 'ghk-cu': 1, 'melanotan-ii': 1, 'cjc-1295': 1,
      'kpv': 1, 'bpc157-tb500-mix': 1,
    };

    /*
     * Colour thresholds:
     *   ≤4  → red   #FF4444   "Only X left"
     *   5–8 → amber #FF6B00   "Only X left"
     *   9+  → grey  #6B7280   "X in stock"
     */
    function stockColor(count) {
      if (count <= 4) return '#FF4444';
      if (count <= 8) return '#FF6B00';
      return '#6B7280';
    }
    function stockText(count) {
      if (count <= 8) return 'Only ' + count + ' left';
      return count + ' in stock';
    }

    /* ── A. Product cards — stock numbers removed; LOW STOCK badge on Retatrutide
            is handled separately by animations.js (vp-popular-badge) ── */

    /* ── B. Product detail page — dynamic per-variation indicator above ADD TO ORDER ── */
    var form = document.querySelector('form[data-compound]');
    if (!form) return;
    var slug = form.getAttribute('data-compound');
    var hasRealData = !!form.querySelector('input[name="size"][data-stock]');
    if (!trackedSlugs[slug] && !hasRealData) return;

    /* Create the status element and insert after .cp-sizes */
    var cpSizes = form.querySelector('.cp-sizes');
    if (!cpSizes) return;

    var statusEl = document.createElement('div');
    statusEl.id = 'vp-size-stock';
    statusEl.style.cssText = 'font-size:12px;font-weight:600;margin-top:8px;' +
      'margin-bottom:4px;letter-spacing:.02em;min-height:16px;';
    cpSizes.parentNode.insertBefore(statusEl, cpSizes.nextSibling);

    function updateStatus() {
      var checked = form.querySelector('input[name="size"]:checked');
      var val = checked ? checked.value : null;
      if (!val) { statusEl.textContent = ''; return; }
      var stockAttr   = checked.getAttribute('data-stock');
      var inStockAttr = checked.getAttribute('data-in-stock');
      var btn = form.querySelector('.cp-order-btn');
      if (inStockAttr === 'false') {
        statusEl.style.color = '#FF4444';
        statusEl.textContent = 'Out of stock';
        if (btn) btn.disabled = true;
        return;
      }
      if (btn) btn.disabled = false;
      var count = (stockAttr !== null) ? Number(stockAttr) : getStockCount(slug, val);
      statusEl.style.color = stockColor(count);
      statusEl.textContent = stockText(count);
    }

    /* Initial render + listen for changes */
    updateStatus();
    form.querySelectorAll('input[name="size"]').forEach(function (radio) {
      radio.addEventListener('change', updateStatus);
    });

    /* Remove any old flat badge below the button */
    var oldBadge = form.querySelector('.vp-stock-badge');
    if (oldBadge) oldBadge.parentNode.removeChild(oldBadge);

    /* Remove any per-row stock counts that may have been injected previously */
    form.querySelectorAll('.vp-size-stock-count').forEach(function (el) {
      el.parentNode.removeChild(el);
    });
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
    /* Weighted toward 6–10 (65%), tails at 4–5 (15%) and 11–14 (20%) */
    function getCount() {
      var s   = slug.split('').reduce(function (a, c) { return a + c.charCodeAt(0); }, 0);
      var win = Math.floor(Date.now() / 90000);
      var r   = rng(s * 100 + win);
      if (r < 0.15) return Math.floor(r / 0.15 * 2) + 4;           /* 4–5  */
      if (r < 0.80) return Math.floor((r - 0.15) / 0.65 * 5) + 6;  /* 6–10 */
      return Math.floor((r - 0.80) / 0.20 * 4) + 11;               /* 11–14 */
    }

    /* Inject CSS once */
    if (!document.getElementById('vp-viewing-css')) {
      var sc = document.createElement('style');
      sc.id = 'vp-viewing-css';
      sc.textContent = [
        '@keyframes vp-pulse{0%,100%{opacity:1}50%{opacity:.15}}',
        '@keyframes vp-fadein{from{opacity:0}to{opacity:1}}',
        '#vp-viewing{',
          'display:flex;align-items:center;gap:10px;',
          'width:100%;box-sizing:border-box;',
          'background:rgba(22,214,166,0.08);',
          'border-left:3px solid #16d6a6;',
          'padding:10px 16px;',
          'margin:10px 0 18px;',
          'font-family:inherit;',
        '}',
        '#vp-viewing.vp-fade{animation:vp-fadein .35s ease;}',
        '#vp-viewing-dot{',
          'display:inline-block;width:8px;height:8px;',
          'background:#16d6a6;border-radius:50%;',
          'animation:vp-pulse 1.5s ease-in-out infinite;',
          'flex-shrink:0;',
        '}',
        '#vp-viewing-count{',
          'color:#fff;font-weight:600;font-size:0.95rem;',
          'flex:1;line-height:1.3;',
        '}',
        '#vp-viewing-live{',
          'font-size:0.75rem;color:#6B7280;',
          'white-space:nowrap;flex-shrink:0;',
        '}',
        '@media(max-width:600px){',
          '#vp-viewing{padding:9px 14px;}',
          '#vp-viewing-count{font-size:0.875rem;}',
        '}',
      ].join('');
      document.head.appendChild(sc);
    }

    var h1 = document.querySelector('.cp-h1');
    if (!h1) return;

    var el = document.createElement('div');
    el.id = 'vp-viewing';
    el.innerHTML =
      '<span id="vp-viewing-dot"></span>' +
      '<span id="vp-viewing-count">' + getCount() + ' people viewing this now</span>' +
      '<span id="vp-viewing-live">updated live</span>';

    /* Insert directly after h1 */
    h1.parentNode.insertBefore(el, h1.nextSibling);

    setInterval(function () {
      var c = document.getElementById('vp-viewing-count');
      if (!c) return;
      c.textContent = getCount() + ' people viewing this now';
      /* Fade transition on update */
      el.classList.remove('vp-fade');
      void el.offsetWidth;
      el.classList.add('vp-fade');
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
        { slug:'retatrutide', name:'Retatrutide',   img:'/assets/images/retatrutide.webp', price:'£59.99' },
      ],
      'mots-c': [
        { slug:'nad-plus',    name:'NAD+',          img:'/assets/images/nadplus.png',     price:'£54.99' },
        { slug:'retatrutide', name:'Retatrutide',   img:'/assets/images/retatrutide.webp', price:'£59.99' },
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
        { slug:'retatrutide', name:'Retatrutide',   img:'/assets/images/retatrutide.webp', price:'£59.99' },
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
        '.vp-frt-name:hover{color:#16d6a6;}',
        '.vp-frt-price{font-size:12px;color:#9CA3AF;}',
        '.vp-frt-view{font-size:12px;color:#16d6a6;text-decoration:none;',
        'font-weight:600;white-space:nowrap;flex-shrink:0;}',
        '.vp-frt-view:hover{text-decoration:underline;}',
        '.vp-frt-add-btn{display:inline-flex;align-items:center;gap:6px;',
        'background:rgba(22,214,166,.08);color:#16d6a6;',
        'border:1px solid rgba(22,214,166,.28);border-radius:6px;',
        'padding:10px 20px;font-size:13px;font-weight:600;cursor:pointer;',
        'font-family:inherit;letter-spacing:.03em;transition:background .2s,color .2s;}',
        '.vp-frt-add-btn:hover{background:rgba(22,214,166,.18);}',
        '.vp-frt-add-btn.vp-added{background:rgba(22,214,166,.2);cursor:pointer;}',
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
   *  LOW STOCK URGENCY BANNER — detail pages for the 5 popular products
   * ───────────────────────────────────────────────────────────────── */
  function initUrgencyBanner() {
    var LOW_STOCK_SLUGS = ['retatrutide'];
    var m = window.location.pathname.match(/\/compounds\/([^/]+)\//);
    if (!m || LOW_STOCK_SLUGS.indexOf(m[1]) === -1) return;

    var h1 = document.querySelector('.cp-h1');
    if (!h1) return;

    var banner = document.createElement('div');
    banner.className = 'vp-urgency-banner';
    banner.innerHTML = '&#9888;&#65039; Low stock &mdash; order soon to avoid disappointment';
    h1.parentNode.insertBefore(banner, h1.nextSibling);
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
    initUrgencyBanner();
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

(function () {
  var els = document.querySelectorAll('.vp-pdp-dispatch');
  if (!els.length) return;
  function parts() {
    var f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    var p = {}; f.formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return p;
  }
  function render() {
    var p = parts();
    var weekend = (p.weekday === 'Sat' || p.weekday === 'Sun');
    var secs = parseInt(p.hour, 10) * 3600 + parseInt(p.minute, 10) * 60 + parseInt(p.second, 10);
    var cutoff = 14 * 3600;
    var html;
    if (!weekend && secs < cutoff) {
      var left = cutoff - secs, hh = Math.floor(left / 3600), mm = Math.floor((left % 3600) / 60);
      html = 'Order within <strong style="color:#16d6a6">' + hh + 'h ' + mm + 'm</strong> for same-day dispatch';
    } else {
      html = 'Order now — <strong style="color:#16d6a6">dispatched next working day</strong>';
    }
    els.forEach(function (el) {
      var t = el.querySelector('.vp-pdp-dispatch-txt');
      if (t) t.innerHTML = html;
      el.hidden = false;
      el.style.display = 'flex';
    });
  }
  render();
  setInterval(render, 30000);
}());
