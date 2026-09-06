(function () {
  'use strict';

  // ── Entry gate ──────────────────────────────────────────────────────────────
  function getCookie(name) {
    var m = document.cookie.match('(?:^|; )' + name + '=([^;]*)');
    return m ? decodeURIComponent(m[1]) : null;
  }

  var gate = document.getElementById('entry-gate');
  if (gate) {
    if (!getCookie('vp_entry')) {
      gate.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    } else {
      gate.style.display = 'none';
    }

    // Checkbox validation — all four must be checked to confirm
    var acceptBtn = document.getElementById('eg-accept');
    var checkboxes = gate.querySelectorAll('.eg-cb');

    function syncBtn() {
      if (!acceptBtn) return;
      var allChecked = true;
      for (var i = 0; i < checkboxes.length; i++) {
        if (!checkboxes[i].checked) { allChecked = false; break; }
      }
      acceptBtn.disabled = !allChecked;
    }

    for (var i = 0; i < checkboxes.length; i++) {
      checkboxes[i].addEventListener('change', syncBtn);
    }
    syncBtn(); // set initial state

    if (acceptBtn) {
      acceptBtn.addEventListener('click', function () {
        document.cookie = 'vp_entry=1; Path=/; Max-Age=2592000; SameSite=Lax';
        gate.style.display = 'none';
        document.body.style.overflow = '';
      });
    }
  }

  // ── Mobile nav ───────────────────────────────────────────────────────────────
  var hamburger = document.getElementById('hamburger');
  var mobMenu = document.getElementById('mob-menu');

  function closeMobMenu() {
    if (!hamburger || !mobMenu) return;
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.classList.remove('open');
    mobMenu.setAttribute('aria-hidden', 'true');
    mobMenu.style.display = 'none';
    var cb = document.querySelector('.vcw-btn');
    if (cb) cb.style.display = '';
  }

  if (hamburger && mobMenu) {
    hamburger.addEventListener('click', function () {
      var expanded = hamburger.getAttribute('aria-expanded') === 'true';
      hamburger.setAttribute('aria-expanded', String(!expanded));
      hamburger.classList.toggle('open');
      mobMenu.setAttribute('aria-hidden', String(expanded));
      mobMenu.style.display = expanded ? 'none' : 'flex';
      var cb = document.querySelector('.vcw-btn');
      if (cb) cb.style.display = expanded ? '' : 'none';
    });

    // Close menu when tapping outside
    document.addEventListener('click', function (e) {
      if (mobMenu.style.display === 'flex' &&
          !mobMenu.contains(e.target) &&
          !hamburger.contains(e.target)) {
        closeMobMenu();
      }
    });

    // Close menu when a nav link is followed
    mobMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMobMenu);
    });
  }

  // ── Cart count ───────────────────────────────────────────────────────────────
  function updateCartCount() {
    var el = document.getElementById('nav-cart-count');
    if (!el) return;
    try {
      var cart = JSON.parse(localStorage.getItem('vp_cart') || '[]');
      var total = cart.reduce(function (sum, item) { return sum + (item.qty || 1); }, 0);
      el.textContent = String(total);
      el.style.display = total > 0 ? '' : '';
    } catch (e) {
      el.textContent = '0';
    }
  }

  updateCartCount();

  window.addEventListener('storage', function (e) {
    if (e.key === 'vp_cart') updateCartCount();
  });

  // ── Toast ────────────────────────────────────────────────────────────────────
  var toastTimer;
  window.toast = function (msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('show');
    }, 3000);
  };

  // ── Card Add-to-Cart ─────────────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.cc-atc');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    var slug  = btn.getAttribute('data-slug')  || '';
    var name  = btn.getAttribute('data-name')  || '';
    var url   = btn.getAttribute('data-url')   || '';
    var size  = btn.getAttribute('data-size')  || 'default';
    var price = parseFloat(btn.getAttribute('data-price')) || 0;

    var cart = [];
    try { cart = JSON.parse(localStorage.getItem('vp_cart') || '[]'); } catch (err) { cart = []; }

    var existing = null;
    for (var j = 0; j < cart.length; j++) {
      if (cart[j].slug === slug && cart[j].size === size) { existing = cart[j]; break; }
    }
    if (existing) {
      existing.qty = (existing.qty || 1) + 1;
    } else {
      cart.push({ slug: slug, name: name, url: url, size: size, price: price, qty: 1 });
    }

    localStorage.setItem('vp_cart', JSON.stringify(cart));
    updateCartCount();
    if (window.vpTrack) window.vpTrack('add_to_cart');
    if (window.vpGA) window.vpGA('add_to_cart', {
      currency: 'GBP', value: price,
      items: [{ item_id: slug, item_name: name, item_variant: size, price: price, quantity: 1 }],
    });
    if (window.toast) window.toast('Added to order \u2014 ' + name);
  });

  // ── Newsletter subscribe ──────────────────────────────────────────────────────
  var nlBtn = document.querySelector('.nl-btn');
  var nlInp = document.querySelector('.nl-inp');

  if (nlBtn && nlInp) {
    nlBtn.addEventListener('click', function () {
      var email = nlInp.value.trim();
      if (!email || !email.includes('@')) {
        if (window.toast) window.toast('Please enter a valid email address.');
        return;
      }

      // Issue (or re-send) the handbook + 10%-off welcome code via the signup API —
      // same path as the popup, so the inline form's promise is real.
      nlBtn.disabled = true;
      nlBtn.textContent = 'Sending…';
      fetch('/api/newsletter/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email }),
      }).then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, d: d }; });
      }).then(function (res) {
        if (res.ok && res.d && res.d.success) {
          try { localStorage.setItem('velox_subscribed', '1'); } catch (e) {}
          if (!res.d.already) {
            try { if (window.vpGA) window.vpGA('generate_lead', { currency: 'GBP', value: 0, method: 'newsletter_footer' }); } catch (e) {}
          }
          nlInp.value = '';
          nlBtn.textContent = res.d.already ? 'Already sent ✓' : 'Code sent ✓';
          if (window.toast) window.toast(res.d.already
            ? "You're already subscribed — check your inbox for your handbook and code."
            : 'Your handbook and 10% off code are on the way — check your inbox.');
        } else {
          nlBtn.disabled = false;
          nlBtn.textContent = 'Send my code';
          if (window.toast) window.toast((res.d && res.d.error) || 'Something went wrong. Please try again.');
        }
      }).catch(function () {
        nlBtn.disabled = false;
        nlBtn.textContent = 'Send my code';
        if (window.toast) window.toast('Something went wrong. Please try again.');
      });
    });

    nlInp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') nlBtn.click();
    });
  }

  // ── FAQ accordion ────────────────────────────────────────────────────────────
  // Native <details> handles this — no JS needed.

}());

// ── Affiliate ?ref= capture (30-day attribution window) ───────────────────────
// Any page reached via an affiliate link (e.g. /design-lab/?ref=CODE) stores the
// code so checkout can auto-apply it. Without this, affiliate links attribute
// nothing. First-touch wins (don't overwrite an existing, unexpired ref).
(function () {
  try {
    var m = location.search.match(/[?&]ref=([A-Za-z0-9_-]{2,32})/);
    if (!m) return;
    var code = m[1].toUpperCase();
    var existing = null;
    try { existing = JSON.parse(localStorage.getItem('vp_ref') || 'null'); } catch (e) {}
    var THIRTY_DAYS = 30 * 864e5;
    if (existing && existing.code && existing.ts && (Date.now() - existing.ts) < THIRTY_DAYS) return; // keep first touch
    try { localStorage.setItem('vp_ref', JSON.stringify({ code: code, ts: Date.now() })); } catch (e) {}
  } catch (e) {}
})();

// ── Campaign attribution (utm_* + ad-platform click IDs) ─────────────────────
// Without this we cannot tell which advert produced which order — the single
// hard prerequisite for spending anything on paid acquisition.
//
// Two touches are kept, because they answer different questions:
//   first — what originally introduced this person to us (90-day window)
//   last  — what brought them back on the visit that converted
// Ad platforms report against last click, so `last` is the one to reconcile
// with Meta/Google. `first` stops long consideration cycles being miscredited
// to a final branded search.
//
// Direct/organic visits never overwrite a stored touch: a landing page with no
// campaign params leaves both untouched, so the attribution survives the
// visitor wandering the site before buying.
(function () {
  var KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var CLICK_IDS = ['gclid', 'fbclid', 'ttclid', 'msclkid'];
  var NINETY_DAYS = 90 * 864e5;

  function clean(v) { return String(v || '').replace(/[^\w .:/+-]/g, '').slice(0, 120); }

  // Read the campaign params off the current URL, or null if there are none.
  function fromUrl() {
    var q, out = {}, i, v;
    try { q = new URLSearchParams(location.search); } catch (e) { return null; }
    for (i = 0; i < KEYS.length; i++) {
      v = clean(q.get(KEYS[i]));
      if (v) out[KEYS[i].slice(4)] = v;          // utm_source -> source
    }
    for (i = 0; i < CLICK_IDS.length; i++) {
      v = clean(q.get(CLICK_IDS[i]));
      if (v) out[CLICK_IDS[i]] = v;
    }
    if (!Object.keys(out).length) return null;
    // A bare gclid/fbclid with no utm_source still tells us the platform.
    if (!out.source) {
      if (out.gclid)       out.source = 'google';
      else if (out.fbclid) out.source = 'facebook';
      else if (out.ttclid) out.source = 'tiktok';
      else if (out.msclkid) out.source = 'bing';
    }
    if (!out.medium && (out.gclid || out.fbclid || out.ttclid || out.msclkid)) out.medium = 'cpc';
    out.ts = Date.now();
    out.landing = location.pathname.slice(0, 200);
    return out;
  }

  // window.vpAttr() — the attribution snapshot to attach to an order.
  // Returns null when there is nothing to attribute (direct/organic).
  window.vpAttr = function () {
    var s = null, ref = null;
    try { s = JSON.parse(localStorage.getItem('vp_attr') || 'null'); } catch (e) {}
    try { var r = JSON.parse(localStorage.getItem('vp_ref') || 'null'); if (r && r.code) ref = r.code; } catch (e) {}
    if (!s && !ref) return null;
    var out = {};
    if (s && s.first) out.first = s.first;
    if (s && s.last)  out.last  = s.last;
    if (ref) out.ref = ref;
    return Object.keys(out).length ? out : null;
  };

  try {
    var hit = fromUrl();
    window.vpAttrHit = hit;                        // this page view's params, for the beacon
    if (!hit) return;                              // direct/organic — keep what we have
    var store = null;
    try { store = JSON.parse(localStorage.getItem('vp_attr') || 'null'); } catch (e) {}
    if (!store || typeof store !== 'object') store = {};
    if (!store.first || !store.first.ts || (Date.now() - store.first.ts) > NINETY_DAYS) store.first = hit;
    store.last = hit;
    try { localStorage.setItem('vp_attr', JSON.stringify(store)); } catch (e) {}
  } catch (e) {}
})();

// ── First-party analytics beacon (no cookies, no PII) ─────────────────────────
(function () {
  try {
    if (location.pathname.indexOf('/admin') === 0) return; // never track the admin
    var sid;
    try { sid = localStorage.getItem('vp_sid'); } catch (e) {}
    if (!sid) {
      sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem('vp_sid', sid); } catch (e) {}
    }
    // `utm` is only present on a campaign landing hit, so paid sessions are
    // identifiable in `visits` even if the visitor never reaches checkout.
    var visit = { sid: sid, path: location.pathname, ref: document.referrer || '' };
    if (window.vpAttrHit) visit.utm = window.vpAttrHit;
    var payload = JSON.stringify(visit);
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function () {});
    }

    // Funnel-event beacon (add_to_cart, begin_checkout, payment_method_selected,
    // purchase). Same anonymous sid, no PII. Optional `meta` carries small
    // non-PII context, e.g. vpTrack('payment_method_selected', { method:'fena' }).
    window.vpTrack = function (event, meta) {
      try {
        var obj = { sid: sid, event: event, path: location.pathname };
        if (meta && typeof meta === 'object') obj.meta = meta;
        var p = JSON.stringify(obj);
        if (navigator.sendBeacon) navigator.sendBeacon('/api/track', new Blob([p], { type: 'application/json' }));
        else fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: p, keepalive: true }).catch(function () {});
      } catch (e) {}
    };

    // ── GA4 ecommerce helper (gtag) ───────────────────────────────────────────
    // Thin, always-safe wrapper around gtag so page scripts can fire GA4
    // ecommerce events without repeating the guard. Never throws, never blocks.
    window.vpGA = function (event, params) {
      try {
        if (typeof window.gtag === 'function') window.gtag('event', event, params || {});
      } catch (e) {}
    };
    // Read the current cart as GA4 `items[]` + summed value. Used by
    // begin_checkout / view_cart callers that don't already have line items.
    window.vpGACartItems = function () {
      var out = { items: [], value: 0 };
      try {
        var cart = JSON.parse(localStorage.getItem('vp_cart') || '[]');
        for (var i = 0; i < cart.length; i++) {
          var it = cart[i];
          var qty = it.qty || 1;
          var price = parseFloat(it.price) || 0;
          out.items.push({
            item_id: it.slug || it.name || '',
            item_name: it.name || it.slug || '',
            item_variant: it.size || '',
            price: price,
            quantity: qty,
          });
          out.value += price * qty;
        }
        out.value = Math.round(out.value * 100) / 100;
      } catch (e) {}
      return out;
    };

    // Fire begin_checkout once when the visitor reaches the cart/checkout page.
    if (/^\/(cart|checkout)/.test(location.pathname)) {
      try {
        var seen = sessionStorage.getItem('vp_chk');
        if (!seen) {
          sessionStorage.setItem('vp_chk', '1');
          window.vpTrack('begin_checkout');
          var _bc = window.vpGACartItems();
          window.vpGA('begin_checkout', { currency: 'GBP', value: _bc.value, items: _bc.items });
        }
      } catch (e) { window.vpTrack('begin_checkout'); }
    }

    // ── Live-presence heartbeat (powers the admin "live on site" counter) ──
    function vpPing() {
      if (document.visibilityState === 'hidden') return;
      var p = JSON.stringify({ sid: sid });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/presence', new Blob([p], { type: 'application/json' }));
      } else {
        fetch('/api/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: p, keepalive: true }).catch(function () {});
      }
    }
    vpPing();
    setInterval(vpPing, 60000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') vpPing(); });
  } catch (e) {}
}());

// ── Whole product card clickable ──────────────────────────────────────────────
// The product name and image already link to the PDP; this makes the entire
// card navigate too, while leaving inner links/buttons (add-to-cart) working.
(function () {
  document.addEventListener('click', function (e) {
    if (e.target.closest('a, button, input, label, select, textarea')) return;
    var card = e.target.closest('.cc');
    if (!card) return;
    var link = card.querySelector('.cc-name-link, .cc-img-link, a[href*="/compounds/"]');
    var href = link && link.getAttribute('href');
    if (href) window.location.href = href;
  });
})();

// ── Velox mobile dock: bottom nav (Home / Shop / Order) + discount checkpoint ──
// One global bottom bar on phones so navigation is always one tap away (fixes the
// "how do I get home after adding to basket" problem), with the volume-discount
// checkpoint track sitting directly above it. Basket-based; shows on all pages
// except the cart/checkout flow (where the discount is already itemised).
(function () {
  try {
    if (window.__vpDock) return; window.__vpDock = true;

    var TIERS = [{ min: 75, pct: 5 }, { min: 150, pct: 10 }, { min: 200, pct: 15 }, { min: 250, pct: 20 }];
    var MAXT = 250;
    var path = (location.pathname || '/').replace(/\/+$/, '') || '/';
    var onCheckout = path.indexOf('/cart') === 0 || path.indexOf('/checkout') === 0;

    function readCart() { try { return JSON.parse(localStorage.getItem('vp_cart') || '[]'); } catch (e) { return []; } }
    function cartCount() { return readCart().reduce(function (s, i) { return s + (i.qty || 1); }, 0); }
    function excluded(i) { return /pen/i.test(i.size || '') || /10-?pack/i.test(i.size || '') || i.slug === 'bacteriostatic-water'; }
    function vialSpend() { return readCart().reduce(function (s, i) { return s + (excluded(i) ? 0 : (parseFloat(i.price) || 0) * (i.qty || 1)); }, 0); }
    function money(n) { var v = Math.round(n * 100) / 100; return '£' + (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)); }
    function startsWith(p) { return path === p || path.indexOf(p + '/') === 0; }

    var css = [
      '#vpdock{display:none}',
      'body.page-account #vpdock{display:none!important}',
      '@media(max-width:767px){',
        '#vpdock{display:block;position:fixed;left:0;right:0;bottom:0;z-index:280;background:rgba(8,8,8,.97);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-top:1px solid rgba(255,255,255,.08)}',
        '#vpdock .vpd-disc{padding:9px 14px 5px;border-bottom:1px solid rgba(255,255,255,.06)}',
        '#vpdock .vpd-disc.hide{display:none}',
        '#vpdock .vpd-msg{font-size:11px;color:#9CA3AF;margin:0 2px 8px;line-height:1.3;text-align:center}',
        '#vpdock .vpd-msg b{color:#01D3A0;font-weight:700}',
        '#vpdock .vpd-track{position:relative;height:5px;margin:0 22px 13px;background:rgba(255,255,255,.1);border-radius:99px}',
        '#vpdock .vpd-fill{position:absolute;left:0;top:0;height:100%;background:#01D3A0;border-radius:99px;width:0;transition:width .35s ease}',
        '#vpdock .vpd-cp{position:absolute;top:50%;width:11px;height:11px;margin:-5.5px 0 0 -5.5px;border-radius:50%;background:#0d0d0d;border:2px solid rgba(255,255,255,.3)}',
        '#vpdock .vpd-cp.hit{background:#01D3A0;border-color:#01D3A0;box-shadow:0 0 7px rgba(1,211,160,.6)}',
        '#vpdock .vpd-cplbl{position:absolute;top:11px;left:50%;transform:translateX(-50%);font-family:var(--mono,monospace);font-size:9px;color:#6B7280;white-space:nowrap}',
        '#vpdock .vpd-cp.hit .vpd-cplbl{color:#01D3A0;font-weight:600}',
        '#vpdock .vpd-nav{display:flex;padding-bottom:env(safe-area-inset-bottom)}',
        '#vpdock .vpd-tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 4px 8px;text-decoration:none;color:#9aa3ad;font-family:var(--mono,monospace);font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;position:relative}',
        '#vpdock .vpd-tab.active{color:#01D3A0}',
        '#vpdock .vpd-tab svg{width:22px;height:22px}',
        '#vpdock .vpd-badge{position:absolute;top:2px;left:calc(50% + 7px);min-width:16px;height:16px;padding:0 4px;border-radius:99px;background:#01D3A0;color:#021;font:800 9px/16px Inter,Arial,sans-serif;text-align:center}',
        '.vp-sticky-buy{bottom:var(--vpdock-h,0)!important}',
        '.vp-vol-nudge{display:none!important}',
      '}'
    ].join('');
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

    function boot() {
      // remove the legacy homepage-only shop bar (superseded by the dock)
      var legacy = document.querySelector('.vp-sticky-shop');
      if (legacy && legacy.parentNode) legacy.parentNode.removeChild(legacy);

      var ICON = {
        home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/></svg>',
        shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c4 5 6.5 8 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 11 8 8 12 3Z"/></svg>',
        order: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>'
      };
      var aHome = path === '/';
      var aShop = startsWith('/compounds') || startsWith('/stacks') || startsWith('/supplies');
      var aOrder = onCheckout;

      var dock = document.createElement('div');
      dock.id = 'vpdock';
      dock.setAttribute('aria-label', 'Quick navigation');
      dock.innerHTML =
        '<div class="vpd-disc' + (onCheckout ? ' hide' : '') + '" id="vpd-disc"></div>' +
        '<nav class="vpd-nav" aria-label="Primary mobile navigation">' +
          '<a class="vpd-tab' + (aHome ? ' active' : '') + '" href="/">' + ICON.home + '<span>Home</span></a>' +
          '<a class="vpd-tab' + (aShop ? ' active' : '') + '" href="/compounds/">' + ICON.shop + '<span>Shop</span></a>' +
          '<a class="vpd-tab' + (aOrder ? ' active' : '') + '" href="/cart/"><span style="position:relative;display:inline-block">' + ICON.order + '<span class="vpd-badge" id="vpd-badge" style="display:none">0</span></span><span>Order</span></a>' +
        '</nav>';
      document.body.appendChild(dock);

      var discEl = dock.querySelector('#vpd-disc');
      var badgeEl = dock.querySelector('#vpd-badge');

      function renderDisc() {
        if (onCheckout) return;
        var spend = vialSpend();
        var fill = Math.max(0, Math.min(100, (spend / MAXT) * 100));
        var cur = 0, next = null;
        for (var k = 0; k < TIERS.length; k++) {
          if (spend >= TIERS[k].min) cur = TIERS[k].pct; else if (!next) next = TIERS[k];
        }
        var msg;
        if (spend <= 0) {
          msg = 'Spend <b>£75</b> on vials to unlock <b>5% off</b>';
        } else if (next) {
          msg = (cur > 0 ? 'You’ve unlocked <b>' + cur + '% off</b> · add ' : 'Add ') +
            '<b>' + money(next.min - spend) + '</b> for <b>' + next.pct + '% off</b>';
        } else {
          msg = '<b>✓ Full ' + cur + '% volume discount unlocked</b>';
        }
        var cps = '';
        for (var t = 0; t < TIERS.length; t++) {
          var pos = (TIERS[t].min / MAXT) * 100;
          var hit = spend >= TIERS[t].min;
          cps += '<span class="vpd-cp' + (hit ? ' hit' : '') + '" style="left:' + pos + '%"><span class="vpd-cplbl">' + TIERS[t].pct + '%</span></span>';
        }
        discEl.innerHTML = '<div class="vpd-msg">' + msg + '</div>' +
          '<div class="vpd-track"><span class="vpd-fill" style="width:' + fill + '%"></span>' + cps + '</div>';
      }
      function renderBadge() {
        var c = cartCount();
        badgeEl.textContent = String(c);
        badgeEl.style.display = c > 0 ? '' : 'none';
      }
      function layout() {
        var mobile = window.matchMedia('(max-width:767px)').matches;
        if (!mobile) { document.documentElement.style.setProperty('--vpdock-h', '0px'); document.body.style.paddingBottom = ''; return; }
        var h = dock.offsetHeight || 0;
        document.documentElement.style.setProperty('--vpdock-h', h + 'px');
        var sticky = document.querySelector('.vp-sticky-buy');
        var extra = (sticky && getComputedStyle(sticky).display !== 'none') ? sticky.offsetHeight : 0;
        document.body.style.paddingBottom = (h + extra + 12) + 'px';
      }
      function refresh() { renderDisc(); renderBadge(); layout(); }
      refresh();

      var sig = JSON.stringify(readCart());
      setInterval(function () {
        var s = JSON.stringify(readCart());
        if (s !== sig) { sig = s; refresh(); }
      }, 700);
      window.addEventListener('storage', function (e) { if (e.key === 'vp_cart') refresh(); });
      window.addEventListener('resize', layout);
      window.addEventListener('orientationchange', function () { setTimeout(layout, 200); });
      window.addEventListener('load', function () { setTimeout(layout, 200); });
      setTimeout(layout, 400); setTimeout(layout, 1600); // catch late .vp-sticky-buy injected by pdp-enhance
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  } catch (e) { if (window.console) console.error('[vpdock]', e && e.message); }
})();

// ── Worldwide shipping announcement banner ────────────────────────────────────
// We now ship to 60+ countries (UK + international, GBP, tracked). Show a bold
// full-width banner at the very top of every page, above the marquee. Dismissible
// and remembered per browser. Skipped on admin and on the checkout flow (where a
// shipping nudge would just distract). Add ?wwbanner=1 to force it back for testing.
(function () {
  try {
    if (window.__vpWWBanner) return; window.__vpWWBanner = true;
    var path = location.pathname || '';
    if (/^\/admin\b/.test(path) || /^\/checkout\b/.test(path)) return; // owner UI + checkout
    var KEY = 'vp_ww_banner';
    var force = /[?&]wwbanner=1/.test(location.search);
    if (localStorage.getItem(KEY) && !force) return; // already dismissed

    function boot() {
      if (document.getElementById('vpww')) return;
      var bar = document.createElement('div');
      bar.id = 'vpww';
      bar.setAttribute('aria-label', 'Now shipping worldwide, and the Velox Research Assistant on ChatGPT');
      bar.innerHTML =
        '<span class="vpww-in">' +
          '<a class="vpww-main" href="/compounds/">' +
            '<span class="vpww-globe" aria-hidden="true">🌍</span>' +
            '<span class="vpww-lead">NOW SHIPPING WORLDWIDE</span>' +
            '<span class="vpww-sub">60+ countries &middot; tracked &middot; GBP</span>' +
          '</a>' +
          '<a class="vpww-gpt" href="https://chatgpt.com/g/g-6a5e9382b4748191b8beaac2548e8f9f-velox-research-assistant" target="_blank" rel="noopener">&#9733; Now on ChatGPT &rarr;</a>' +
        '</span>';
      // Insert directly below the site header (falls back to top of body).
      var header = document.querySelector('header.site-header') || document.querySelector('.site-header');
      if (header && header.parentNode) header.parentNode.insertBefore(bar, header.nextSibling);
      else if (document.body.firstChild) document.body.insertBefore(bar, document.body.firstChild);
      else document.body.appendChild(bar);

      var close = document.createElement('button');
      close.className = 'vpww-x';
      close.type = 'button';
      close.setAttribute('aria-label', 'Dismiss announcement');
      close.innerHTML = '&times;';
      close.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        try { localStorage.setItem(KEY, '1'); } catch (err) {}
        bar.remove();
      });
      bar.appendChild(close);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  } catch (e) { if (window.console) console.error('[vpww]', e && e.message); }
})();

/* ── Velox on-site assistant — load the chat bubble on every page except admin ── */
(function () {
  try {
    if (/^\/admin\b/.test(location.pathname)) return;   // owner UI: no sales bot
    if (window.__veloxChatLoaded) return;               // already present (e.g. /chat-test/)
    var s = document.createElement('script');
    s.src = '/assets/js/chat-widget.js';
    s.defer = true;
    (document.body || document.head || document.documentElement).appendChild(s);
  } catch (e) { /* ignore */ }
})();
