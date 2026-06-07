/**
 * pricing.js — single-source-of-truth price hydration
 *
 * Reads the product_variants table (the ONLY place prices live) and fills in
 * every price on the page: product-page buy boxes and product cards. The
 * hardcoded HTML prices stay as a fallback — if this fetch fails for any
 * reason, the page still shows sensible prices and nothing breaks.
 *
 * Self-contained: talks to Supabase's public REST endpoint directly (the anon
 * key is read-only via RLS), so it works on every storefront page without
 * depending on the Supabase JS client being loaded.
 */
(function () {
  'use strict';

  var SB_URL  = 'https://stkjdtyhaxejxqmbzyua.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0a2pkdHloYXhlanhxbWJ6eXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTUxMTgsImV4cCI6MjA5NTM5MTExOH0.QtkaubtNsJkFruoJ-hsxfd5qTlgX5Hs-9wTqJRQC4S0';

  function money(n) { var v = Math.round(Number(n) * 100) / 100; return '£' + (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)); }
  // Velox Peps Pro member discount (0 unless a signed-in member). Applied to the
  // effective price so it flows to BOTH the displayed price and the data-price
  // attribute the cart reads — i.e. the member rate is what actually gets charged.
  var MEMBER_PCT = 0;
  function eff(v) {
    var base = (v.sale_price != null) ? Number(v.sale_price) : Number(v.base_price);
    return MEMBER_PCT > 0 ? Math.round(base * (1 - MEMBER_PCT / 100) * 100) / 100 : base;
  }
  // "was" strikethrough: on a deal -> base_price; standing markdown -> compare_at; else none.
  function wasOf(v) { return (v.sale_price != null) ? Number(v.base_price) : (v.compare_at != null ? Number(v.compare_at) : null); }
  function pct(from, to) { return Math.round((1 - to / from) * 100); }

  // Cache variants in sessionStorage (5-min TTL) to skip a Supabase round-trip
  // on every page navigation. Raw rows are cached; member discount is applied at
  // render time, so caching is safe.
  function cachedVariants() {
    try {
      var c = sessionStorage.getItem('vp_variants');
      if (c) { var o = JSON.parse(c); if (o && o.t && (Date.now() - o.t) < 300000 && o.d) return Promise.resolve(o.d); }
    } catch (e) {}
    return fetch(SB_URL + '/rest/v1/product_variants?select=*', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) { try { if (rows) sessionStorage.setItem('vp_variants', JSON.stringify({ t: Date.now(), d: rows })); } catch (e) {} return rows; });
  }

  function hydrateAll() {
    cachedVariants()
      .then(function (rows) {
        if (!rows || !rows.length) return;          // keep hardcoded fallback
        var bySlug = {};
        rows.forEach(function (v) { (bySlug[v.slug] = bySlug[v.slug] || []).push(v); });
        try { hydratePDP(bySlug); } catch (e) {}
        try { hydrateCards(bySlug); } catch (e) {}
        try { hydrateBundles(rows); } catch (e) {}
      })
      .catch(function () { /* network/RLS issue — hardcoded prices remain */ });
  }

  // Resolve the signed-in member's tier discount FIRST, then hydrate, so every
  // price (and the cart-read data-price) reflects the Pro rate. Fails open to 0%.
  function getMemberPct() {
    return new Promise(function (resolve) {
      try {
        var raw = localStorage.getItem('sb-stkjdtyhaxejxqmbzyua-auth-token');
        var tok = raw ? (JSON.parse(raw) || {}).access_token : null;
        if (!tok) return resolve(0);
        fetch(SB_URL + '/rest/v1/profiles?select=is_pro,pro_tier,pro_until', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + tok } })
          .then(function (r) { return r.ok ? r.json() : []; })
          .then(function (rows) {
            var p = Array.isArray(rows) ? rows[0] : null;
            if (!p || !p.is_pro || !p.pro_tier) return resolve(0);
            if (p.pro_until && new Date(p.pro_until) < new Date()) return resolve(0);
            fetch(SB_URL + '/rest/v1/membership_tiers?key=eq.' + encodeURIComponent(p.pro_tier) + '&select=discount_pct', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON } })
              .then(function (r) { return r.ok ? r.json() : []; })
              .then(function (t) { var row = Array.isArray(t) ? t[0] : null; resolve(row ? Number(row.discount_pct) : 0); })
              .catch(function () { resolve(0); });
          })
          .catch(function () { resolve(0); });
      } catch (e) { resolve(0); }
    });
  }

  function showMemberBanner(p) {
    try {
      if (document.getElementById('vp-pro-banner')) return;
      var b = document.createElement('div');
      b.id = 'vp-pro-banner';
      b.style.cssText = 'background:#01D3A0;color:#021;font:600 13px/1.4 Arial,Helvetica,sans-serif;text-align:center;padding:7px 12px';
      b.textContent = '✓ Pro pricing active — ' + p + '% off applied across the site';
      // Place it directly BELOW the site header, not above it.
      var hdr = document.querySelector('header.site-header') || document.querySelector('header');
      if (hdr && hdr.insertAdjacentElement) hdr.insertAdjacentElement('afterend', b);
      else if (document.body) document.body.insertBefore(b, document.body.firstChild);
    } catch (e) {}
  }

  getMemberPct().then(function (p) {
    MEMBER_PCT = Number(p) || 0;
    // Expose for the cart (free shipping) + let it re-render once we know.
    try { window.VELOX_MEMBER_PCT = MEMBER_PCT; window.dispatchEvent(new Event('velox:member')); } catch (e) {}
    if (MEMBER_PCT > 0) showMemberBanner(MEMBER_PCT);
    hydrateAll();
  });

  // ── Bundles (stacks) — price auto-computes from component base prices ───────
  function hydrateBundles(variantRows) {
    var baseBy = {};   // 'slug|size' -> base_price
    var slugByName = {}; // lowercased product name -> slug (to read component pills)
    variantRows.forEach(function (v) {
      baseBy[v.slug + '|' + v.size] = Number(v.base_price);
      if (!slugByName[(v.name || '').toLowerCase()]) slugByName[(v.name || '').toLowerCase()] = v.slug;
    });
    PRICING_NAME_TO_SLUG = slugByName;

    Promise.all([
      fetch(SB_URL + '/rest/v1/bundles?select=*', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON } }).then(function (r) { return r.ok ? r.json() : []; }),
      fetch(SB_URL + '/rest/v1/bundle_components?select=*&order=sort_order', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON } }).then(function (r) { return r.ok ? r.json() : []; })
    ]).then(function (res) {
      var bundles = res[0], comps = res[1];
      if (!bundles.length) return;
      var bundleMap = {};
      bundles.forEach(function (b) { bundleMap[b.slug] = { discount: Number(b.discount_pct), comps: [] }; });
      comps.forEach(function (c) { if (bundleMap[c.bundle_slug]) bundleMap[c.bundle_slug].comps.push(c); });
      Object.keys(bundleMap).forEach(function (slug) {
        var b = bundleMap[slug];
        var sum = 0;
        b.comps.forEach(function (c) { var bp = baseBy[c.product_slug + '|' + c.size]; if (bp != null) sum += bp * (c.qty || 1); });
        b.was = Math.round(sum * 100) / 100;
        b.price = Math.round(sum * (1 - b.discount / 100) * 100) / 100;
        b.save = sum > 0 ? Math.round((1 - b.price / sum) * 100) : 0;
      });

      try { hydrateBundleBuyBox(bundleMap, baseBy); } catch (e) {}
      try { hydrateBundleCards(bundleMap, baseBy, slugByName); } catch (e) {}
    }).catch(function () { /* keep fallback */ });
  }

  // Stack page buy box + component pills.
  function hydrateBundleBuyBox(bundleMap, baseBy) {
    var form = document.querySelector('.cp-order-form[data-compound]');
    if (!form) return;
    var b = bundleMap[form.getAttribute('data-compound')];
    if (!b) return;                                // not a bundle page
    var opt = form.querySelector('.cp-size-opt');
    if (opt) {
      var input = opt.querySelector('input[name="size"]');
      if (input) input.setAttribute('data-price', b.price.toFixed(2));
      var pEl = opt.querySelector('.cp-size-p'); if (pEl) pEl.innerHTML = money(b.price);
      var wEl = opt.querySelector('.cp-size-was'); if (wEl) { wEl.innerHTML = money(b.was); wEl.style.display = ''; }
      var badge = opt.querySelector('.cp-size-badge'); if (badge) { badge.textContent = 'SAVE ' + b.save + '%'; badge.style.display = ''; }
    }
    // component breakdown pills (csp-*): set each to its base price
    document.querySelectorAll('.csp-pill').forEach(function (pill) {
      var slug = nameToSlugOf(pill, '.csp-name');
      var size = txt(pill, '.csp-size');
      var bp = baseBy[slug + '|' + size];
      var pr = pill.querySelector('.csp-price');
      if (bp != null && pr) pr.innerHTML = money(bp);
    });
  }

  // Bundle cards (sc-card on PDPs + stacks index): bundle price/was + component pills.
  function hydrateBundleCards(bundleMap, baseBy, slugByName) {
    document.querySelectorAll('a[href*="/stacks/"]').forEach(function (link) {
      var m = (link.getAttribute('href') || '').match(/\/stacks\/([^\/?#]+)/);
      if (!m) return;
      var b = bundleMap[m[1]];
      if (!b) return;
      var card = link.closest('.sc-card') || link.closest('article') || link.parentElement;
      if (!card) return;
      var priceEl = card.querySelector('.sc-price');
      var wasEl = card.querySelector('.sc-was');
      if (priceEl) priceEl.innerHTML = money(b.price);
      if (wasEl) { wasEl.innerHTML = money(b.was); wasEl.style.display = ''; }
      card.querySelectorAll('.sc-card-pill').forEach(function (pill) {
        var slug = nameToSlugOf(pill, '.sc-cp-name');
        var size = txt(pill, '.sc-cp-size');
        var bp = baseBy[slug + '|' + size];
        var pr = pill.querySelector('.sc-cp-price');
        if (bp != null && pr) pr.innerHTML = money(bp);
      });
    });
  }

  function txt(parent, sel) { var e = parent.querySelector(sel); return e ? e.textContent.trim() : ''; }
  function nameToSlugOf(parent, nameSel) {
    var name = txt(parent, nameSel).toLowerCase();
    return PRICING_NAME_TO_SLUG[name] || name;
  }
  var PRICING_NAME_TO_SLUG = {};

  // ── Product page buy box ────────────────────────────────────────────────────
  function hydratePDP(bySlug) {
    var form = document.querySelector('.cp-order-form[data-compound]');
    if (!form) return;
    var variants = bySlug[form.getAttribute('data-compound')];
    if (!variants) return;
    var bySize = {};
    variants.forEach(function (v) { bySize[v.size] = v; });

    form.querySelectorAll('.cp-size-opt').forEach(function (label) {
      var input = label.querySelector('input[name="size"]');
      if (!input) return;
      var v = bySize[input.value];
      if (!v) return;                              // unknown size -> leave fallback

      var price = eff(v);
      input.setAttribute('data-price', price.toFixed(2)); // cart reads this on add

      var pEl = label.querySelector('.cp-size-p');
      if (pEl) pEl.innerHTML = money(price);

      var was = wasOf(v);
      var wasEl = label.querySelector('.cp-size-was');
      if (wasEl) {
        if (was != null && was > price) { wasEl.innerHTML = money(was); wasEl.style.display = ''; }
        else { wasEl.style.display = 'none'; }
      }

      var badge = label.querySelector('.cp-size-badge');
      if (badge) {
        if (v.sale_price != null) {
          badge.textContent = 'DEAL · ' + pct(v.base_price, v.sale_price) + '% OFF';
          badge.className = 'cp-size-badge cp-badge-save'; badge.style.display = '';
        } else if (v.compare_at != null && v.compare_at > price) {
          badge.textContent = 'SAVE ' + pct(v.compare_at, price) + '%';
          badge.className = 'cp-size-badge cp-badge-save'; badge.style.display = '';
        } else {
          badge.style.display = 'none';
        }
      }
    });
  }

  // ── Product cards (homepage, shop grid, category, related) ──────────────────
  function hydrateCards(bySlug) {
    document.querySelectorAll('.cc').forEach(function (card) {
      var link = card.querySelector('a[href*="/compounds/"]');
      if (!link) return;
      var m = (link.getAttribute('href') || '').match(/\/compounds\/([^\/?#]+)/);
      if (!m) return;
      var variants = bySlug[m[1]];
      if (!variants || !variants.length) return;

      var effs = variants.map(eff);
      var minEff = Math.min.apply(null, effs);
      var minV = variants[effs.indexOf(minEff)];
      var multi = variants.length > 1;

      var priceEl = card.querySelector('.cc-price');
      if (priceEl) priceEl.innerHTML = (multi ? 'From ' : '') + money(minEff);

      var was = wasOf(minV);
      var wasEl = card.querySelector('.cc-was');
      if (wasEl) {
        if (was != null && was > minEff) { wasEl.innerHTML = money(was); wasEl.style.display = ''; }
        else { wasEl.style.display = 'none'; }
      }
    });
  }
}());
