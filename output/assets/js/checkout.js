(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────
  var SHIPPING_FLAT     = 3.80;   // Royal Mail Tracked 48 (UK standard)
  var EXPRESS_FLAT      = 5.99;   // Royal Mail Tracked 24 (UK express)
  var FREE_THRESHOLD    = 100;    // UK: both options free at £100+
  var EU_SHIPPING_FLAT  = 9.99;
  var EU_FREE_THRESHOLD = 100;
  var EU_FX_RATE        = 1.18; // fixed GBP → EUR conversion rate

  // ── Core helpers ──────────────────────────────────────────────────────────
  function getCart() {
    try { return JSON.parse(localStorage.getItem('vp_cart') || '[]'); } catch (e) { return []; }
  }

  function currentRegion() {
    try {
      var s = JSON.parse(sessionStorage.getItem('vp_checkout') || '{}');
      return s.region === 'EU' ? 'EU' : 'UK';
    } catch (e) { return 'UK'; }
  }

  function fmt(n, region) {
    var r = (region !== undefined) ? region : currentRegion();
    return (r === 'EU' ? '€' : '£') + Number(n).toFixed(2);
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Selected UK shipping method ('48' default | '24' express). Falls back to the
  // value stored at the shipping step so it carries through to the payment page.
  function shipMethod() {
    var r = document.querySelector('input[name="shipping"]:checked');
    if (r && r.value && r.value !== 'intl') return r.value;
    try { var st = JSON.parse(sessionStorage.getItem('vp_checkout') || '{}'); if (st.ship_method) return st.ship_method; } catch (e) {}
    return '48';
  }
  function memberFreeShip() { return (window.VELOX_MEMBER_PCT || 0) > 0; }

  function cartTotals(cart, region) {
    var r = (region !== undefined) ? region : currentRegion();
    var subtotalGBP = cart.reduce(function (s, i) { return s + i.price * (i.qty || 1); }, 0);
    if (r === 'EU') {
      var sub = Math.round(subtotalGBP * EU_FX_RATE * 100) / 100;
      var sh  = sub >= EU_FREE_THRESHOLD ? 0 : EU_SHIPPING_FLAT;
      return { subtotal: sub, shipping: sh, total: Math.round((sub + sh) * 100) / 100, currency: 'EUR', subtotalGBP: subtotalGBP };
    }
    // UK: Pro members ship free (their 24h perk), and both options are free at £100+.
    var m = shipMethod();
    var base = (m === '24') ? EXPRESS_FLAT : SHIPPING_FLAT;
    var sh = (memberFreeShip() || subtotalGBP >= FREE_THRESHOLD) ? 0 : base;
    return { subtotal: subtotalGBP, shipping: sh, total: Math.round((subtotalGBP + sh) * 100) / 100, currency: 'GBP', subtotalGBP: subtotalGBP, method: m };
  }

  // ── Discount helpers ──────────────────────────────────────────────────────
  function calcDiscount(subtotal, rawCode) {
    if (typeof DISCOUNT_CODES === 'undefined' || !rawCode) return null;
    var upper = rawCode.trim().toUpperCase();
    var match = null;
    for (var i = 0; i < DISCOUNT_CODES.length; i++) {
      if (DISCOUNT_CODES[i].active && DISCOUNT_CODES[i].code.toUpperCase() === upper) {
        match = DISCOUNT_CODES[i];
        break;
      }
    }
    if (!match) return null;
    var saving = match.type === 'percentage'
      ? Math.round(subtotal * match.value) / 100
      : Math.min(match.value, subtotal);
    saving = Math.round(saving * 100) / 100;
    return { code: match.code, type: match.type, value: match.value, saving: saving };
  }

  // Convert GBP discount saving to customer's currency
  function savingInCurrency(savingGBP, region) {
    if (region === 'EU') return Math.round(savingGBP * EU_FX_RATE * 100) / 100;
    return savingGBP;
  }

  // Volume discount (single vials): SPEND-based on the DISCOUNTABLE vial subtotal —
  //   £75 → 5%, £150 → 10%, £200 → 15%, £250 → 20%.
  // Pens, BAC water and 10-packs are EXCLUDED — never discounted on this track and never
  // count toward the spend threshold. (Replaces the old per-vial-quantity tiers.)
  function isPen(i) { return /pen/i.test(i.size || ''); }
  function is10pack(i) { return /10-?pack/i.test(i.size || ''); }
  function isBacW(i) { return i.slug === 'bacteriostatic-water'; }
  function vialExcluded(i) { return isPen(i) || isBacW(i) || is10pack(i); }
  function discountableGBP(cart) { return cart.reduce(function (s, i) { return s + (vialExcluded(i) ? 0 : i.price * (i.qty || 1)); }, 0); }
  function discountableQty(cart) { return cart.reduce(function (s, i) { return s + (vialExcluded(i) ? 0 : (i.qty || 1)); }, 0); }
  // SPEND ladder — input is the discountable vial subtotal in GBP, not a unit count.
  function vpVolumeRate(spend) { return spend >= 250 ? 0.20 : (spend >= 200 ? 0.15 : (spend >= 150 ? 0.10 : (spend >= 75 ? 0.05 : 0))); }
  var MAX_VIAL_PCT = 0.25; // stacking cap: vial-side discount (volume OR code) never exceeds this share of the vial base

  // 10-PACK volume discount — a SEPARATE system that applies ONLY to 10-packs and stacks
  // 10-packs together (total count of 10-pack units across the basket):
  //   2 = 10%, 3 = 17.5%, 4 = 25%, 5+ = 30%.
  // Independent of the vial tier and of discount codes: 10-packs never receive a code or
  // vial-volume discount, only this one.
  function packGBP(cart) { return cart.reduce(function (s, i) { return s + (is10pack(i) ? i.price * (i.qty || 1) : 0); }, 0); }
  function packQty(cart) { return cart.reduce(function (s, i) { return s + (is10pack(i) ? (i.qty || 1) : 0); }, 0); }
  function packVolumeRate(q) { return q >= 5 ? 0.30 : (q === 4 ? 0.25 : (q === 3 ? 0.175 : (q === 2 ? 0.10 : 0))); }
  function packVolumeGBP(cart) { return Math.round(packGBP(cart) * packVolumeRate(packQty(cart)) * 100) / 100; }

  // Promotional saving (GBP) = [larger of (code, vial-volume) on the vial subtotal]
  //   PLUS the 10-pack volume saving (separate track, on the 10-pack subtotal).
  // Code + vial-volume never stack; the 10-pack tier is its own track and never touches vials.
  function bestPromoGBP(cart, codeDiscount) {
    var base = discountableGBP(cart);
    var codeSaving = (codeDiscount && codeDiscount.saving) || 0;
    var rate = vpVolumeRate(base);
    var volSaving = Math.round(base * rate * 100) / 100;

    var vialPromo, vialLabel, vialCode;
    if (volSaving > codeSaving) {
      vialPromo = volSaving; vialLabel = 'Volume discount −' + Math.round(rate * 100) + '%'; vialCode = 'VOLUME-' + Math.round(rate * 100);
    } else {
      vialPromo = codeSaving; vialLabel = codeDiscount ? codeDiscount.code : ''; vialCode = codeDiscount ? codeDiscount.code : '';
    }
    // Stacking cap — never let the vial-side discount exceed MAX_VIAL_PCT of the vial base.
    var vialCapGBP = Math.round(base * MAX_VIAL_PCT * 100) / 100;
    if (vialPromo > vialCapGBP) vialPromo = vialCapGBP;

    var packRate = packVolumeRate(packQty(cart));
    var packSaving = packVolumeGBP(cart);

    var totalSaving = Math.round((vialPromo + packSaving) * 100) / 100;
    var labels = [], codes = [];
    if (vialPromo > 0 && vialLabel) { labels.push(vialLabel); codes.push(vialCode); }
    if (packSaving > 0) { labels.push('10-Pack volume −' + (packRate * 100) + '%'); codes.push('PACKVOL-' + Math.round(packRate * 1000)); }
    return { saving: totalSaving, label: labels.join(' + '), code: codes.join('+') };
  }

  // Kept for existing callers — just re-renders the summary (which now applies discounts).
  function renderTotalsWithDiscount(cart, discount, region) {
    renderCartSummary(cart, region);
  }

  function renderCartSummary(cart, region) {
    var r = (region !== undefined) ? region : currentRegion();
    var el = document.getElementById('co-cart-items');
    if (el) {
      if (!cart.length) {
        el.innerHTML = '<p style="color:#9CA3AF;font-size:13px;">No items in order.</p>';
      } else {
        var html = '<ul class="co-cart-list">';
        cart.forEach(function (item) {
          var priceInCurrency = r === 'EU'
            ? Math.round(item.price * EU_FX_RATE * (item.qty || 1) * 100) / 100
            : item.price * (item.qty || 1);
          html += '<li class="co-cart-row"><span class="co-cart-name">' + escHtml(item.name) +
            ' <span class="co-cart-size">' + escHtml(item.size) + '</span></span>' +
            '<span class="co-cart-price">' + fmt(priceInCurrency, r) + '</span></li>';
        });
        html += '</ul>';
        el.innerHTML = html;
      }
    }

    // Totals — apply the active promotion (volume or code, whichever is larger) + points,
    // so EVERY checkout stage shows the discounted total, not just the Pay Now button.
    var t = cartTotals(cart, r);
    var promo = bestPromoGBP(cart, appliedDiscount);
    var saving = savingInCurrency(promo.saving, r);
    var ptsSaving = savingInCurrency(appliedPointsSavingGBP, r);
    var discountedSubtotal = Math.max(0, t.subtotal - saving - ptsSaving);
    var freeThresh = r === 'EU' ? EU_FREE_THRESHOLD : FREE_THRESHOLD;
    var flatRate   = r === 'EU' ? EU_SHIPPING_FLAT  : SHIPPING_FLAT;
    // Free shipping is earned on the pre-discount product subtotal (the '£80' promise);
    // the volume/code discount then applies on top. Keeps the delivery card + summary in sync.
    var shipping = t.subtotal >= freeThresh ? 0 : flatRate;
    var total = Math.round((discountedSubtotal + shipping) * 100) / 100;

    var subEl  = document.getElementById('co-subtotal');
    var shipEl = document.getElementById('co-shipping');
    var totEl  = document.getElementById('co-total');
    var shpLbl = document.getElementById('co-shipping-label');
    var discLine = document.getElementById('co-discount-line');
    var discLbl  = document.getElementById('co-discount-label');
    var discAmt  = document.getElementById('co-discount-amount');
    if (subEl)  subEl.textContent  = fmt(t.subtotal, r);
    if (shipEl) shipEl.textContent = shipping === 0 ? 'FREE' : fmt(shipping, r);
    if (totEl)  totEl.textContent  = fmt(total, r);
    if (shpLbl) shpLbl.textContent = r === 'EU' ? 'Royal Mail International Tracked' : (shipMethod() === '24' ? 'Royal Mail Tracked 24' : 'Royal Mail Tracked 48');
    if (saving > 0) {
      if (discLine) discLine.style.display = '';
      if (discLbl)  discLbl.textContent = promo.label;
      if (discAmt)  discAmt.textContent = '−' + fmt(saving, r);
    } else if (discLine) {
      discLine.style.display = 'none';
    }
  }

  function randChars(n) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < n; i++) { out += chars.charAt(Math.floor(Math.random() * chars.length)); }
    return out;
  }

  function todayStr() {
    var d = new Date();
    return '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }

  var cart = getCart();
  // When pricing.js re-prices stored lines from the live source, refresh our
  // in-memory cart (used by both the summary AND the submit handler that builds
  // the charged total) and re-render, so checkout never charges a stale price.
  try {
    document.addEventListener('vp:cart-repriced', function () {
      cart = getCart();
      try { renderCartSummary(cart, currentRegion()); } catch (e) {}
    });
  } catch (e) {}
  var appliedDiscount = null;
  var appliedPoints = 0;            // loyalty points being redeemed this order
  var appliedPointsSavingGBP = 0;   // their £ value (100 points = £1)
  var welcomeCodeApplied = null;    // VELOX-XXXXXX newsletter code applied (server-validated)
  var affiliateApplied = null;      // { id, code, discount_pct } — affiliate ref code applied

  // ── SHIPPING PAGE ─────────────────────────────────────────────────────────
  var shippingForm = document.getElementById('shipping-form');
  if (shippingForm) {

    // Restore region from sessionStorage if returning to this page
    var savedChk = {};
    try { savedChk = JSON.parse(sessionStorage.getItem('vp_checkout') || '{}'); } catch (ex) {}
    var activeRegion = savedChk.region === 'EU' ? 'EU' : 'UK';

    var regionUkBtn      = document.getElementById('region-uk');
    var regionEuBtn      = document.getElementById('region-eu');
    var ukCountryWrap    = document.getElementById('uk-country-wrap');
    var euCountryWrap    = document.getElementById('eu-country-wrap');
    var euComplianceWrap = document.getElementById('eu-compliance-wrap');
    var euRegionNote     = document.getElementById('eu-region-note');
    var shipOptName      = document.getElementById('ship-opt-name');
    var shipOptSub       = document.getElementById('ship-opt-sub');
    var shipPrice        = document.getElementById('ship-price');

    function applyRegion(r) {
      activeRegion = r;
      if (regionUkBtn) regionUkBtn.classList.toggle('region-btn-active', r === 'UK');
      if (regionEuBtn) regionEuBtn.classList.toggle('region-btn-active', r === 'EU');
      if (ukCountryWrap)    ukCountryWrap.style.display    = r === 'UK' ? '' : 'none';
      if (euCountryWrap)    euCountryWrap.style.display    = r === 'EU' ? '' : 'none';
      if (euComplianceWrap) euComplianceWrap.style.display = r === 'EU' ? '' : 'none';
      if (euRegionNote)     euRegionNote.style.display     = r === 'EU' ? '' : 'none';
      updateShipping(r);
      renderCartSummary(cart, r);
    }

    if (regionUkBtn) regionUkBtn.addEventListener('click', function () { applyRegion('UK'); });
    if (regionEuBtn) regionEuBtn.addEventListener('click', function () { applyRegion('EU'); });

    function updateShipping(r) {
      var ukG = document.getElementById('ship-uk'), euG = document.getElementById('ship-eu');
      if (ukG) ukG.style.display = (r === 'EU') ? 'none' : '';
      if (euG) euG.style.display = (r === 'EU') ? '' : 'none';
      var chk = document.querySelector('input[name="shipping"]:checked');
      if (r === 'EU') { var intl = document.querySelector('input[name="shipping"][value="intl"]'); if (intl) intl.checked = true; }
      else if (!chk || chk.value === 'intl') { var d = document.querySelector('input[name="shipping"][value="48"]'); if (d) d.checked = true; }
      var subGBP = cart.reduce(function (s2, i) { return s2 + i.price * (i.qty || 1); }, 0);
      if (r === 'EU') {
        var te = cartTotals(cart, 'EU');
        var pe = document.getElementById('ship-price-eu'); if (pe) pe.textContent = te.shipping === 0 ? 'FREE' : fmt(te.shipping, 'EU');
      } else {
        var freeUK = memberFreeShip() || subGBP >= FREE_THRESHOLD;
        var p48 = document.getElementById('ship-price-48'); if (p48) p48.textContent = freeUK ? 'FREE' : fmt(SHIPPING_FLAT, 'UK');
        var p24 = document.getElementById('ship-price-24'); if (p24) p24.textContent = freeUK ? 'FREE' : fmt(EXPRESS_FLAT, 'UK');
      }
    }
    document.querySelectorAll('input[name="shipping"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        try { var st = JSON.parse(sessionStorage.getItem('vp_checkout') || '{}'); st.ship_method = radio.value; sessionStorage.setItem('vp_checkout', JSON.stringify(st)); } catch (e) {}
        var rr = currentRegion(); updateShipping(rr); renderCartSummary(cart, rr);
      });
    });

    // Set initial state
    applyRegion(activeRegion);

    // Pre-fill from the signed-in user's profile (optional — guests unaffected)
    if (window._sb) {
      (async function () {
        try {
          var sess = await window._sb.auth.getSession();
          if (!sess.data || !sess.data.session) return;
          var uid = sess.data.session.user.id;
          var pr = await window._sb.from('profiles')
            .select('name,email,saved_addresses,default_address_id').eq('id', uid).single();
          var p = pr.data; if (!p) return;
          var nm = (p.name || '').trim().split(' ');
          function setIfEmpty(id, val) { var el = document.getElementById(id); if (el && !el.value && val) el.value = val; }
          setIfEmpty('sh-fname', nm[0] || '');
          setIfEmpty('sh-lname', nm.slice(1).join(' ') || '');
          setIfEmpty('sh-email', sess.data.session.user.email || '');
          var addrs = p.saved_addresses || [];
          var def = addrs.filter(function (a) { return a.id === p.default_address_id; })[0] || addrs[0];
          if (def) {
            setIfEmpty('sh-addr1', def.line1);
            setIfEmpty('sh-addr2', def.line2);
            setIfEmpty('sh-city',  def.city);
            setIfEmpty('sh-post',  def.postcode);
          }
        } catch (e) { /* silent — never block guest checkout */ }
      })();
    }

    shippingForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = document.getElementById('co-err');

      var required = ['sh-fname', 'sh-lname', 'sh-email', 'sh-phone', 'sh-addr1', 'sh-city', 'sh-post'];
      var missing = required.filter(function (id) {
        var el = document.getElementById(id);
        return !el || !el.value.trim();
      });

      var ack = shippingForm.querySelector('input[name="ack"]');
      if (ack && !ack.checked) missing.push('ack');

      // EU-specific validation
      if (activeRegion === 'EU') {
        var euCountryEl = document.getElementById('sh-eu-country');
        if (!euCountryEl || !euCountryEl.value) missing.push('eu-country');
        var euComp = shippingForm.querySelector('input[name="eu-compliance"]');
        if (euComp && !euComp.checked) missing.push('eu-compliance');
      }

      if (missing.length) {
        if (errEl) errEl.textContent = activeRegion === 'EU'
          ? 'Please fill in all required fields, select your country, and tick both acknowledgements.'
          : 'Please fill in all required fields and tick the acknowledgement.';
        return;
      }
      if (errEl) errEl.textContent = '';

      var country = activeRegion === 'EU'
        ? (document.getElementById('sh-eu-country') || {}).value || ''
        : 'United Kingdom';

      var data = {
        fname:    document.getElementById('sh-fname').value.trim(),
        lname:    document.getElementById('sh-lname').value.trim(),
        email:    document.getElementById('sh-email').value.trim(),
        phone:    document.getElementById('sh-phone').value.trim(),
        addr1:    document.getElementById('sh-addr1').value.trim(),
        addr2:    (document.getElementById('sh-addr2') || {}).value || '',
        city:     document.getElementById('sh-city').value.trim(),
        postcode: document.getElementById('sh-post').value.trim(),
        country:  country,
        region:   activeRegion,
        currency: activeRegion === 'EU' ? 'EUR' : 'GBP',
      };

      try { sessionStorage.setItem('vp_checkout', JSON.stringify(data)); } catch (ex) {}

      window.location.href = '/checkout/payment/';
    });
  }

  // ── PAYMENT PAGE ──────────────────────────────────────────────────────────
  var paymentForm = document.getElementById('payment-form');
  if (paymentForm) {
    var payRegion = currentRegion();
    renderCartSummary(cart, payRegion);

    // EU: show IBAN/BIC details instead of UK sort code / account number
    if (payRegion === 'EU') {
      var ukBankDetails   = document.getElementById('uk-bank-details');
      var euBankDetails   = document.getElementById('eu-bank-details');
      var bankMethodTitle = document.getElementById('bank-method-title');
      if (ukBankDetails)   ukBankDetails.style.display  = 'none';
      if (euBankDetails)   euBankDetails.style.display  = '';
      if (bankMethodTitle) bankMethodTitle.textContent  = 'INTERNATIONAL BANK TRANSFER';
    }

    // Show delivery address in sidebar
    var deliverEl = document.getElementById('co-deliver-to');
    if (deliverEl) {
      try {
        var chkDelivery = JSON.parse(sessionStorage.getItem('vp_checkout') || '{}');
        if (chkDelivery.fname) {
          deliverEl.innerHTML = '<div class="co-deliver-hdr">Delivering to</div>' +
            '<div class="co-deliver-addr">' +
            escHtml(chkDelivery.fname + ' ' + chkDelivery.lname) + '<br>' +
            escHtml(chkDelivery.addr1) + '<br>' +
            (chkDelivery.addr2 ? escHtml(chkDelivery.addr2) + '<br>' : '') +
            escHtml(chkDelivery.city) + '<br>' +
            escHtml(chkDelivery.postcode) + '<br>' +
            escHtml(chkDelivery.country) +
            '</div>';
        }
      } catch (ex) {}
    }

    // Billing same-as-delivery toggle
    var billSame   = document.getElementById('bill-same');
    var billFields = document.getElementById('bill-fields');
    if (billSame && billFields) {
      billSame.addEventListener('change', function () {
        billFields.style.display = billSame.checked ? 'none' : '';
      });
    }

    // ── Discount code ─────────────────────────────────────────────────────
    var discountInput = document.getElementById('discount-input');
    var discountApply = document.getElementById('discount-apply');
    var discountMsg   = document.getElementById('discount-msg');

    function applyDiscountResult(result) {
      appliedDiscount = result;
      var displaySaving = savingInCurrency(result.saving, payRegion);
      discountMsg.innerHTML = '<span class="dc-ok">✓ Code applied — saving ' + fmt(displaySaving, payRegion) + '</span>';
      discountInput.disabled = true;
      if (discountApply) { discountApply.textContent = 'Applied'; discountApply.disabled = true; }
      renderTotalsWithDiscount(cart, appliedDiscount, payRegion);
    }

    function handleApply() {
      if (!discountInput || !discountMsg) return;
      var code = discountInput.value.trim();
      if (!code) {
        discountMsg.innerHTML = '<span class="dc-err">Please enter a discount code.</span>';
        return;
      }
      // Don't stack codes on top of Pro member pricing (it's already a discount).
      if ((window.VELOX_MEMBER_PCT || 0) > 0) {
        discountMsg.innerHTML = '<span class="dc-err">Your Velox Pro member pricing is already applied — codes can’t be combined with it.</span>';
        return;
      }
      // calcDiscount always works in GBP; convert saving to display currency
      var tGBP   = cartTotals(cart, 'UK');
      var result = calcDiscount(discountableGBP(cart), code);
      if (result) { applyDiscountResult(result); return; }

      // Unique newsletter welcome code (VELOX-XXXXXX) — validate server-side
      if (/^VELOX-/i.test(code)) {
        var chkEmail = '';
        try { chkEmail = (JSON.parse(sessionStorage.getItem('vp_checkout') || '{}').email) || ''; } catch (e) {}
        discountMsg.innerHTML = '<span class="dc-ok">Checking…</span>';
        fetch('/api/newsletter/validate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code, email: chkEmail }),
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (d && d.valid) {
            welcomeCodeApplied = code.toUpperCase();
            var pct = Number(d.value) || 10;                       // % from server (single source of truth)
            var saving = Math.round(tGBP.subtotal * pct) / 100;   // welcome code % off, GBP
            applyDiscountResult({ code: code.toUpperCase(), type: 'percentage', value: pct, saving: saving });
          } else {
            welcomeCodeApplied = null; appliedDiscount = null;
            var reasons = {
              expired: 'This code has expired.', already_used: 'This code has already been used.',
              email_mismatch: 'This code was issued to a different email address.',
              not_found: 'Invalid discount code.', inactive: 'This code is no longer active.',
            };
            discountMsg.innerHTML = '<span class="dc-err">' + (reasons[d && d.reason] || 'Invalid discount code.') + '</span>';
            renderTotalsWithDiscount(cart, null, payRegion);
          }
        }).catch(function () {
          discountMsg.innerHTML = '<span class="dc-err">Could not validate code. Please try again.</span>';
        });
        return;
      }

      // Design Lab first-order code — validated per customer (no prior paid order).
      if (code.toUpperCase() === 'DESIGN10') {
        var foEmail = '';
        try { foEmail = (JSON.parse(sessionStorage.getItem('vp_checkout') || '{}').email) || ''; } catch (e) {}
        if (!foEmail) { discountMsg.innerHTML = '<span class="dc-err">Enter your email above first, then apply the code.</span>'; return; }
        discountMsg.innerHTML = '<span class="dc-ok">Checking…</span>';
        fetch('/api/first-order/validate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code, email: foEmail }),
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (d && d.valid) {
            var pct = Number(d.value) || 10;
            var saving = Math.round(tGBP.subtotal * pct) / 100;
            applyDiscountResult({ code: code.toUpperCase(), type: 'percentage', value: pct, saving: saving });
          } else {
            appliedDiscount = null;
            var reasons = {
              not_first_order: 'This code is for first orders only — it looks like you’ve ordered with us before.',
              email_required: 'Enter your email above first, then apply the code.',
              not_found: 'Invalid discount code.',
            };
            discountMsg.innerHTML = '<span class="dc-err">' + (reasons[d && d.reason] || 'Invalid discount code.') + '</span>';
            renderTotalsWithDiscount(cart, null, payRegion);
          }
        }).catch(function () { discountMsg.innerHTML = '<span class="dc-err">Could not validate code. Please try again.</span>'; });
        return;
      }

      // Try affiliate ref code — validate server-side (last fallback)
      discountMsg.innerHTML = '<span class="dc-ok">Checking…</span>';
      fetch('/api/affiliate/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code }),
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.valid) {
          affiliateApplied = { id: d.affiliate_id, code: code.toUpperCase(), discount_pct: d.discount_pct };
          var saving = Math.round(discountableGBP(cart) * d.discount_pct) / 100;
          applyDiscountResult({ code: code.toUpperCase(), type: 'percentage', value: d.discount_pct, saving: saving });
        } else {
          affiliateApplied = null; appliedDiscount = null;
          discountMsg.innerHTML = '<span class="dc-err">Invalid or inactive discount code.</span>';
          renderTotalsWithDiscount(cart, null, payRegion);
        }
      }).catch(function () {
        discountMsg.innerHTML = '<span class="dc-err">Could not validate code. Please try again.</span>';
      });
    }

    if (discountApply) discountApply.addEventListener('click', handleApply);
    if (discountInput) {
      discountInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); handleApply(); }
      });
    }

    // ── Auto-apply a captured affiliate ?ref= code (set in core.js) ───────────
    // If the customer arrived via an affiliate link and hasn't already applied a
    // code, prefill + validate it so the discount applies AND attribution attaches
    // to the order (orders.affiliate_code_used). Customer can still override it.
    (function autoApplyRef() {
      try {
        if (!discountInput || appliedDiscount || affiliateApplied || welcomeCodeApplied) return;
        if ((window.VELOX_MEMBER_PCT || 0) > 0) return; // member pricing already applied — don't stack
        if (discountInput.value.trim()) return;
        var stored = JSON.parse(localStorage.getItem('vp_ref') || 'null');
        if (!stored || !stored.code || !stored.ts) return;
        if (Date.now() - stored.ts > 30 * 864e5) return; // expired
        discountInput.value = stored.code;
        handleApply();
      } catch (e) {}
    })();

    // ── Loyalty points redemption (signed-in users with balance >= 500) ──────
    if (window._sb) {
      (async function () {
        try {
          var sess = await window._sb.auth.getSession();
          if (!sess.data || !sess.data.session) return;
          var pr = await window._sb.from('profiles').select('loyalty_points')
            .eq('id', sess.data.session.user.id).single();
          var balance = (pr.data && pr.data.loyalty_points) || 0;
          if (balance < 500) return;

          var anchor = document.getElementById('discount-msg') || document.getElementById('discount-input');
          if (!anchor) return;
          var box = document.createElement('div');
          box.style.cssText = 'margin-top:14px;padding:14px;border:1px solid #1a1a1a;border-radius:8px;background:#0d0d0d';
          box.innerHTML =
            '<div style="font-size:11px;color:#01D3A0;font-weight:700;letter-spacing:.08em;margin-bottom:8px">LOYALTY POINTS</div>' +
            '<div style="font-size:13px;color:#9ca3af;margin-bottom:10px">You have <strong style="color:#fff">' + balance + '</strong> points (worth £' + (balance / 100).toFixed(2) + '). Redeem in multiples of 100, minimum 500.</div>' +
            '<div style="display:flex;gap:8px"><input id="pts-input" type="number" step="100" min="500" max="' + balance + '" placeholder="500" style="flex:1;background:#111;border:1px solid #1a1a1a;color:#fff;padding:9px 10px;border-radius:6px;font-size:14px">' +
            '<button id="pts-apply" type="button" style="background:#01D3A0;color:#021;border:none;border-radius:6px;padding:9px 16px;font-weight:700;cursor:pointer">Redeem</button></div>' +
            '<div id="pts-msg" style="font-size:12px;margin-top:8px"></div>';
          anchor.parentNode.insertBefore(box, anchor.nextSibling);

          document.getElementById('pts-apply').addEventListener('click', function () {
            var m = document.getElementById('pts-msg');
            var pts = parseInt(document.getElementById('pts-input').value, 10);
            if (!pts || pts < 500) { m.style.color = '#f87171'; m.textContent = 'Minimum redemption is 500 points.'; return; }
            if (pts % 100 !== 0)   { m.style.color = '#f87171'; m.textContent = 'Points must be a multiple of 100.'; return; }
            if (pts > balance)     { m.style.color = '#f87171'; m.textContent = 'You only have ' + balance + ' points.'; return; }
            appliedPoints = pts;
            appliedPointsSavingGBP = pts / 100;   // 100 points = £1
            m.style.color = '#01D3A0';
            m.textContent = '✓ Redeeming ' + pts + ' points (−' + fmt(savingInCurrency(appliedPointsSavingGBP, payRegion), payRegion) + ')';
            document.getElementById('pts-input').disabled = true;
            document.getElementById('pts-apply').disabled = true;
            renderTotalsWithDiscount(cart, appliedDiscount, payRegion);
          });
        } catch (e) { /* silent — never block checkout */ }
      })();
    }


    // ── Bank transfer form submit (UK + EU) ───────────────────────────────
    paymentForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = document.getElementById('co-err');
      var terms = paymentForm.querySelector('input[name="terms"]');
      if (!terms || !terms.checked) {
        if (errEl) errEl.textContent = 'Please accept the Terms & Conditions and Research Use Policy.';
        return;
      }
      if (errEl) errEl.textContent = '';

      var submitBtn = paymentForm.querySelector('button[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Processing…'; }

      var ref        = 'VP-' + todayStr() + '-' + randChars(4);
      var t          = cartTotals(cart, payRegion);
      var promo      = bestPromoGBP(cart, appliedDiscount);
      var saving     = savingInCurrency(promo.saving, payRegion);
      var ptsSaving  = savingInCurrency(appliedPointsSavingGBP, payRegion);
      var discountedSubtotal = Math.max(0, t.subtotal - saving - ptsSaving);
      var freeThresh = payRegion === 'EU' ? EU_FREE_THRESHOLD : FREE_THRESHOLD;
      var flatRate   = payRegion === 'EU' ? EU_SHIPPING_FLAT  : SHIPPING_FLAT;
      var finalShipping = t.subtotal >= freeThresh ? 0 : flatRate;
      var finalTotal    = Math.round((discountedSubtotal + finalShipping) * 100) / 100;

      try {
        var existing = JSON.parse(sessionStorage.getItem('vp_checkout') || '{}');
        existing.orderRef        = ref;
        existing.subtotal        = t.subtotal;
        existing.shipping        = finalShipping;
        existing.ship_method     = t.method || shipMethod();
        existing.discount_code   = promo.code;
        existing.discount_saving = saving;
        existing.points_redeemed      = appliedPoints;
        existing.welcome_code         = welcomeCodeApplied;
        existing.total                = finalTotal;
        existing.cart_snapshot        = JSON.stringify(cart);
        existing.currency             = payRegion === 'EU' ? 'EUR' : 'GBP';
        existing.region               = payRegion;
        existing.payment_method       = 'bank';
        existing.affiliate_id         = affiliateApplied ? affiliateApplied.id   : null;
        existing.affiliate_code_used  = affiliateApplied ? affiliateApplied.code : null;
        sessionStorage.setItem('vp_checkout', JSON.stringify(existing));
      } catch (ex) {}

      try { sessionStorage.removeItem('vp_order_fired'); } catch (ex) {}
      window.location.href = '/checkout/confirmation/';
    });
  }

  // ── CONFIRMATION PAGE (bank transfer) ────────────────────────────────────
  var confirmSummary = document.getElementById('confirm-summary');
  if (confirmSummary) {
    var chk = {};
    try { chk = JSON.parse(sessionStorage.getItem('vp_checkout') || '{}'); } catch (ex) {}
    var confRegion = chk.region === 'EU' ? 'EU' : 'UK'; // bank transfer always UK, but defensive

    var confirmedCart = cart.slice();
    if (!confirmedCart.length && chk.cart_snapshot) {
      try { confirmedCart = JSON.parse(chk.cart_snapshot); } catch (ex) {}
    }

    localStorage.removeItem('vp_cart');
    var countEl = document.getElementById('nav-cart-count');
    if (countEl) countEl.textContent = '0';

    var currSym = confRegion === 'EU' ? '€' : '£';
    var shippingMethod = confRegion === 'EU' ? 'Royal Mail International Tracked' : 'Royal Mail Tracked 24';

    var productsList = confirmedCart.map(function (item) {
      var priceInCurrency = confRegion === 'EU'
        ? Math.round(item.price * EU_FX_RATE * (item.qty || 1) * 100) / 100
        : item.price * (item.qty || 1);
      return item.name + ' ' + item.size + ' x' + (item.qty || 1) +
             ' — ' + currSym + priceInCurrency.toFixed(2);
    }).join('\n');

    try {
      var refEl   = document.getElementById('confirm-ref');
      var ref2El  = document.getElementById('confirm-ref-2');
      var amtEl   = document.getElementById('confirm-amount');
      var subEl2  = document.getElementById('confirm-subtotal');
      var shipEl2 = document.getElementById('confirm-shipping');
      if (refEl   && chk.orderRef)           refEl.textContent   = chk.orderRef;
      if (ref2El  && chk.orderRef)           ref2El.textContent  = chk.orderRef;
      if (amtEl   && chk.total)              amtEl.textContent   = fmt(Number(chk.total), confRegion);
      if (subEl2  && chk.subtotal != null)   subEl2.textContent  = fmt(Number(chk.subtotal), confRegion);
      if (shipEl2 && chk.shipping != null)   shipEl2.textContent = Number(chk.shipping) === 0 ? 'FREE' : fmt(Number(chk.shipping), confRegion);
      var amt2El = document.getElementById('confirm-amount-2');
      var ref3El = document.getElementById('confirm-ref-3');
      if (amt2El && chk.total)    amt2El.textContent = Number(chk.total).toFixed(2);
      if (ref3El && chk.orderRef) ref3El.textContent = chk.orderRef;

      if (chk.discount_code) {
        var discRow  = document.getElementById('confirm-discount-row');
        var discInfo = document.getElementById('confirm-discount-info');
        if (discRow)  discRow.style.display = '';
        if (discInfo) discInfo.textContent = chk.discount_code +
          ' (−' + fmt(Number(chk.discount_saving || 0), confRegion) + ')';
      }
    } catch (ex) {}

    var alreadyFired = sessionStorage.getItem('vp_order_fired') === '1';
    if (!alreadyFired && chk.orderRef && chk.email) {
      try { sessionStorage.setItem('vp_order_fired', '1'); } catch (ex) {}

      var shippingAddr = [chk.addr1, chk.addr2, chk.city, chk.postcode, chk.country]
        .filter(Boolean).join(', ');

      fetch('/api/send-order', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_number:    chk.orderRef,
          customer_name:   ((chk.fname || '') + ' ' + (chk.lname || '')).trim(),
          customer_email:  chk.email,
          customer_phone:  chk.phone    || '',
          addr1:           chk.addr1    || '',
          addr2:           chk.addr2    || '',
          city:            chk.city     || '',
          postcode:        chk.postcode || '',
          country:         chk.country  || 'United Kingdom',
          shipping_address: shippingAddr,
          shipping_method: shippingMethod,
          order_items:     productsList,
          order_subtotal:  (Number(chk.subtotal)        || 0).toFixed(2),
          shipping_cost:   (Number(chk.shipping)         || 0).toFixed(2),
          discount_code:   chk.discount_code              || '',
          discount_saving: (Number(chk.discount_saving)  || 0).toFixed(2),
          order_total:     (Number(chk.total)             || 0).toFixed(2),
          currency:        chk.currency || 'GBP',
          region:          confRegion,
          payment_method:  'bank',
        })
      }).catch(function () {});

      try {
        fetch(
          'https://script.google.com/macros/s/AKfycbwC6RyBK2pMsU7crR7TXpbUtgKNN6305hNvePzFmkMtz3kpXWZShIgdFkT68AhHAb1ZOg/exec',
          {
            method:  'POST',
            mode:    'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body:    JSON.stringify({
              orderId:       chk.orderRef,
              date:          new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }),
              name:          ((chk.fname || '') + ' ' + (chk.lname || '')).trim(),
              email:         chk.email  || '',
              phone:         chk.phone  || '',
              address:       shippingAddr,
              products:      productsList,
              total:         currSym + (Number(chk.total) || 0).toFixed(2),
              discountCode:  chk.discount_code || 'None',
              region:        confRegion,
              currency:      chk.currency || 'GBP',
              paymentMethod: 'Bank Transfer',
            })
          }
        ).catch(function () {});
      } catch (ex) {}

      // ── Save order to Supabase (so it appears in /admin/ + the user's account)
      // Silent — never blocks the confirmation page. Links to the user's account
      // when signed in (so loyalty points award once the order is marked paid).
      if (window._sb) {
        (async function () {
          try {
            var sbItems = confirmedCart.map(function (item) {
              return { name: item.name, slug: item.slug, size: item.size,
                       qty: item.qty || 1, price: item.price };
            });
            var uid = null;
            try { var s = await window._sb.auth.getSession(); if (s.data && s.data.session) uid = s.data.session.user.id; } catch (e) {}
            var r = await window._sb.from('orders').insert([{
              customer_name:   ((chk.fname || '') + ' ' + (chk.lname || '')).trim() || 'Customer',
              customer_email:  chk.email || '',
              items:           sbItems,
              subtotal:        Number(chk.subtotal) || Number(chk.total) || 0,  // pre-discount, drives points
              total:           Number(chk.total) || 0,
              discount:        Number(chk.discount_saving) || 0,
              shipping:        Number(chk.shipping) || 0,
              payment_method:  chk.payment_method || 'bank',
              notes:           chk.orderRef || '',
              user_id:         uid,
              points_redeemed:     Number(chk.points_redeemed) || 0,
              welcome_code:        chk.welcome_code || null,
              affiliate_id:        chk.affiliate_id || null,
              affiliate_code_used: chk.affiliate_code_used || null,
              // Shipping address — needed for dispatch emails + Royal Mail Click & Drop
              ship_name:       ((chk.fname || '') + ' ' + (chk.lname || '')).trim() || null,
              ship_line1:      chk.addr1 || null,
              ship_line2:      chk.addr2 || null,
              ship_city:       chk.city || null,
              ship_postcode:   chk.postcode || null,
              ship_country:    chk.country || 'GB',
              ship_phone:      chk.phone || null,
              sid:             (function () { try { return localStorage.getItem('vp_sid') || null; } catch (e) { return null; } })(),
            }]);
            if (r.error) console.error('[checkout] Supabase order save failed:', r.error.message);
          } catch (sbErr) {
            console.error('[checkout] Supabase save threw:', sbErr);
          }
        })();
      }

      // ── Post-order: prompt guests to save their details (non-blocking) ────
      if (window._sb) {
        (async function () {
          try {
            var s = await window._sb.auth.getSession();
            if (s.data && s.data.session) return;   // already signed in
            var host = document.getElementById('confirm-summary');
            if (!host) return;
            var card = document.createElement('div');
            card.style.cssText = 'margin-top:24px;background:#0d0d0d;border:1px solid #1a1a1a;border-radius:10px;padding:20px 22px;text-align:left';
            card.innerHTML =
              '<div style="color:#fff;font-size:15px;font-weight:700;margin-bottom:6px">Save your details &amp; earn points</div>' +
              '<p style="color:#9ca3af;font-size:13px;margin:0 0 14px">Create a free account to track this order, reorder in one click, and earn loyalty points on future purchases. This order will link to your account automatically.</p>' +
              '<a href="/account/" style="display:inline-block;text-decoration:none;background:#01D3A0;color:#021;padding:10px 20px;border-radius:7px;font-weight:700;font-size:13px">Create account</a>';
            host.parentNode.insertBefore(card, host.nextSibling);
          } catch (e) {}
        })();
      }
    }

    renderCartSummary(confirmedCart.length ? confirmedCart : [], confRegion);
  }

}());
