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

  function money(n) { return '£' + Number(n).toFixed(2); }
  function eff(v) { return (v.sale_price != null) ? Number(v.sale_price) : Number(v.base_price); }
  // "was" strikethrough: on a deal -> base_price; standing markdown -> compare_at; else none.
  function wasOf(v) { return (v.sale_price != null) ? Number(v.base_price) : (v.compare_at != null ? Number(v.compare_at) : null); }
  function pct(from, to) { return Math.round((1 - to / from) * 100); }

  fetch(SB_URL + '/rest/v1/product_variants?select=*', {
    headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON }
  })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (rows) {
      if (!rows || !rows.length) return;          // keep hardcoded fallback
      var bySlug = {};
      rows.forEach(function (v) { (bySlug[v.slug] = bySlug[v.slug] || []).push(v); });
      try { hydratePDP(bySlug); } catch (e) {}
      try { hydrateCards(bySlug); } catch (e) {}
    })
    .catch(function () { /* network/RLS issue — hardcoded prices remain */ });

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
