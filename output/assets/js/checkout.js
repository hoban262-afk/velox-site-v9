(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────
  var SHIPPING_FLAT     = 3.80;
  var FREE_THRESHOLD    = 80;
  var EU_SHIPPING_FLAT  = 9.99;
  var EU_FREE_THRESHOLD = 100;
  var EU_FX_RATE        = 1.18; // fixed GBP → EUR conversion rate
  // var GC_EU_COUNTRIES = ['France', 'Germany', 'Ireland']; // GoCardless — disabled

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

  function cartTotals(cart, region) {
    var r = (region !== undefined) ? region : currentRegion();
    var subtotalGBP = cart.reduce(function (s, i) { return s + i.price * (i.qty || 1); }, 0);
    if (r === 'EU') {
      var sub = Math.round(subtotalGBP * EU_FX_RATE * 100) / 100;
      var sh  = sub >= EU_FREE_THRESHOLD ? 0 : EU_SHIPPING_FLAT;
      return { subtotal: sub, shipping: sh, total: Math.round((sub + sh) * 100) / 100, currency: 'EUR', subtotalGBP: subtotalGBP };
    }
    var sh = subtotalGBP >= FREE_THRESHOLD ? 0 : SHIPPING_FLAT;
    return { subtotal: subtotalGBP, shipping: sh, total: subtotalGBP + sh, currency: 'GBP', subtotalGBP: subtotalGBP };
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

  function renderTotalsWithDiscount(cart, discount, region) {
    var r = (region !== undefined) ? region : currentRegion();
    var t = cartTotals(cart, r);
    var savingGBP = (discount && discount.saving) ? discount.saving : 0;
    var saving = savingInCurrency(savingGBP, r);
    var discountedSubtotal = Math.max(0, t.subtotal - saving);
    var freeThresh = r === 'EU' ? EU_FREE_THRESHOLD : FREE_THRESHOLD;
    var flatRate   = r === 'EU' ? EU_SHIPPING_FLAT  : SHIPPING_FLAT;
    var shipping = discountedSubtotal >= freeThresh ? 0 : flatRate;
    var discountedTotal = Math.round((discountedSubtotal + shipping) * 100) / 100;

    var subEl    = document.getElementById('co-subtotal');
    var shipEl   = document.getElementById('co-shipping');
    var totEl    = document.getElementById('co-total');
    var discLine = document.getElementById('co-discount-line');
    var discLbl  = document.getElementById('co-discount-label');
    var discAmt  = document.getElementById('co-discount-amount');

    if (subEl)  subEl.textContent  = fmt(t.subtotal, r);
    if (shipEl) shipEl.textContent = shipping === 0 ? 'FREE' : fmt(shipping, r);

    if (discount && saving > 0) {
      if (discLine) discLine.style.display = '';
      if (discLbl)  discLbl.textContent  = discount.code;
      if (discAmt)  discAmt.textContent  = '−' + fmt(saving, r);
      if (totEl)    totEl.textContent    = fmt(discountedTotal, r);
    } else {
      if (discLine) discLine.style.display = 'none';
      if (totEl)    totEl.textContent = fmt(discountedTotal, r);
    }
  }

  function renderCartSummary(cart, region) {
    var r = (region !== undefined) ? region : currentRegion();
    var el = document.getElementById('co-cart-items');
    if (!el) return;
    if (!cart.length) {
      el.innerHTML = '<p style="color:#9CA3AF;font-size:13px;">No items in order.</p>';
      return;
    }
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

    var t      = cartTotals(cart, r);
    var subEl  = document.getElementById('co-subtotal');
    var shipEl = document.getElementById('co-shipping');
    var totEl  = document.getElementById('co-total');
    var shpLbl = document.getElementById('co-shipping-label');
    if (subEl)  subEl.textContent  = fmt(t.subtotal, r);
    if (shipEl) shipEl.textContent = t.shipping === 0 ? 'FREE' : fmt(t.shipping, r);
    if (totEl)  totEl.textContent  = fmt(t.total, r);
    if (shpLbl) shpLbl.textContent = r === 'EU' ? 'Royal Mail International Tracked' : 'Royal Mail Tracked 24';
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
  var appliedDiscount = null;

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
      if (shipOptName) shipOptName.textContent = r === 'EU' ? 'Royal Mail International Tracked' : 'Royal Mail Tracked 24';
      if (shipOptSub)  shipOptSub.textContent  = r === 'EU' ? '3–5 working days, tracked. EU & Europe.' : '1–2 working days, tracked. UK only.';
      var t = cartTotals(cart, r);
      if (shipPrice) shipPrice.textContent = t.shipping === 0 ? 'FREE' : fmt(t.shipping, r);
      renderCartSummary(cart, r);
    }

    if (regionUkBtn) regionUkBtn.addEventListener('click', function () { applyRegion('UK'); });
    if (regionEuBtn) regionEuBtn.addEventListener('click', function () { applyRegion('EU'); });

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

    function handleApply() {
      if (!discountInput || !discountMsg) return;
      var code = discountInput.value.trim();
      if (!code) {
        discountMsg.innerHTML = '<span class="dc-err">Please enter a discount code.</span>';
        return;
      }
      // calcDiscount always works in GBP; convert saving to display currency
      var tGBP   = cartTotals(cart, 'UK');
      var result = calcDiscount(tGBP.subtotal, code);
      if (result) {
        appliedDiscount = result;
        var displaySaving = savingInCurrency(result.saving, payRegion);
        discountMsg.innerHTML = '<span class="dc-ok">✓ Code applied — saving ' + fmt(displaySaving, payRegion) + '</span>';
        discountInput.disabled = true;
        if (discountApply) { discountApply.textContent = 'Applied'; discountApply.disabled = true; }
        renderTotalsWithDiscount(cart, appliedDiscount, payRegion);
      } else {
        appliedDiscount = null;
        discountMsg.innerHTML = '<span class="dc-err">Invalid or inactive discount code.</span>';
        renderTotalsWithDiscount(cart, null, payRegion);
      }
    }

    if (discountApply) discountApply.addEventListener('click', handleApply);
    if (discountInput) {
      discountInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); handleApply(); }
      });
    }

    // ── GoCardless Instant Bank Pay — DISABLED (kept for re-enable) ─────────
    /* RE-ENABLE: uncomment the block below and restore gc-pay-btn in payment HTML
    var gcPayBtn = document.getElementById('gc-pay-btn');
    if (gcPayBtn) {
      gcPayBtn.addEventListener('click', function () {
        var errEl = document.getElementById('co-err');
        var terms = paymentForm.querySelector('input[name="terms"]');
        if (!terms || !terms.checked) {
          if (errEl) errEl.textContent = 'Please accept the Terms & Conditions and Research Use Policy.';
          return;
        }
        if (errEl) errEl.textContent = '';

        gcPayBtn.disabled = true;
        gcPayBtn.textContent = 'Preparing payment…';

        var ref     = 'VP-' + todayStr() + '-' + randChars(4);
        var t       = cartTotals(cart, payRegion);
        var savingGBP = (appliedDiscount && appliedDiscount.saving) ? appliedDiscount.saving : 0;
        var saving  = savingInCurrency(savingGBP, payRegion);
        var discountedSubtotal = Math.max(0, t.subtotal - saving);
        var freeThresh = payRegion === 'EU' ? EU_FREE_THRESHOLD : FREE_THRESHOLD;
        var flatRate   = payRegion === 'EU' ? EU_SHIPPING_FLAT  : SHIPPING_FLAT;
        var finalShipping = discountedSubtotal >= freeThresh ? 0 : flatRate;
        var finalTotal    = Math.round((discountedSubtotal + finalShipping) * 100) / 100;
        var amountSmallest = Math.round(finalTotal * 100); // pence (GBP) or cents (EUR)
        var currency       = payRegion === 'EU' ? 'EUR' : 'GBP';
        var currSym        = payRegion === 'EU' ? '€' : '£';
        var shippingMethod = payRegion === 'EU' ? 'Royal Mail International Tracked' : 'Royal Mail Tracked 24';

        var gcChk = {};
        try { gcChk = JSON.parse(sessionStorage.getItem('vp_checkout') || '{}'); } catch (ex) {}
        gcChk.orderRef        = ref;
        gcChk.subtotal        = t.subtotal;
        gcChk.shipping        = finalShipping;
        gcChk.discount_code   = appliedDiscount ? appliedDiscount.code   : '';
        gcChk.discount_saving = saving; // stored in customer's currency
        gcChk.total           = finalTotal;
        gcChk.cart_snapshot   = JSON.stringify(cart);
        gcChk.payment_method  = 'instant';
        gcChk.currency        = currency;
        gcChk.region          = payRegion;
        try { sessionStorage.setItem('vp_checkout', JSON.stringify(gcChk)); } catch (ex) {}
        try { sessionStorage.removeItem('vp_order_fired'); } catch (ex) {}

        // Product list in customer's currency
        var gcProductsList = cart.map(function (item) {
          var priceInCurrency = payRegion === 'EU'
            ? Math.round(item.price * EU_FX_RATE * (item.qty || 1) * 100) / 100
            : item.price * (item.qty || 1);
          return item.name + ' ' + item.size + ' x' + (item.qty || 1) +
                 ' — ' + currSym + priceInCurrency.toFixed(2);
        }).join('\n');

        fetch('/api/create-payment', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount_pence:    amountSmallest,
            currency:        currency,
            customer_name:   ((gcChk.fname || '') + ' ' + (gcChk.lname || '')).trim(),
            email:           gcChk.email    || '',
            description:     'Velox Peptides research compounds',
            order_ref:       ref,
            phone:           gcChk.phone    || '',
            addr1:           gcChk.addr1    || '',
            addr2:           gcChk.addr2    || '',
            city:            gcChk.city     || '',
            postcode:        gcChk.postcode || '',
            country:         gcChk.country  || 'United Kingdom',
            order_items:     gcProductsList,
            subtotal:        t.subtotal.toFixed(2),
            shipping:        finalShipping.toFixed(2),
            discount_code:   appliedDiscount ? appliedDiscount.code : '',
            discount_saving: saving.toFixed(2),
            total:           finalTotal.toFixed(2),
            region:          payRegion,
            shipping_method: shippingMethod,
          })
        })
        .then(function (resp) { return resp.json(); })
        .then(function (data) {
          if (data.authorisation_url) {
            try {
              var latestChk = JSON.parse(sessionStorage.getItem('vp_checkout') || '{}');
              latestChk.billing_request_id = data.billing_request_id;
              sessionStorage.setItem('vp_checkout', JSON.stringify(latestChk));
            } catch (ex) {}
            window.location.href = data.authorisation_url;
          } else {
            throw new Error(data.error || 'Failed to create payment');
          }
        })
        .catch(function (err) {
          console.error('[checkout] create-payment error:', err && err.message ? err.message : err);
          var msg = (err && err.message) ? err.message : 'Payment initialisation failed. Please try again or use bank transfer below.';
          if (errEl) errEl.textContent = msg;
          gcPayBtn.disabled = false;
          gcPayBtn.textContent = 'Pay Now →';
        });
      });
    }
    */ // END GoCardless disabled block

    // ── PsiFi Card / Apple Pay / Google Pay — DISABLED (kept for re-enable) ─
    /* RE-ENABLE: uncomment and restore psifi-pay-btn in payment HTML
    var psifiPayBtn = document.getElementById('psifi-pay-btn');
    if (psifiPayBtn) {
      psifiPayBtn.addEventListener('click', function () {
        var errEl = document.getElementById('co-err');
        var terms = paymentForm.querySelector('input[name="terms"]');
        if (!terms || !terms.checked) {
          if (errEl) errEl.textContent = 'Please accept the Terms & Conditions and Research Use Policy.';
          return;
        }
        if (errEl) errEl.textContent = '';

        psifiPayBtn.disabled = true;
        psifiPayBtn.textContent = 'Processing…';

        var ref        = 'VP-' + todayStr() + '-' + randChars(4);
        var t          = cartTotals(cart, payRegion);
        var savingGBP  = (appliedDiscount && appliedDiscount.saving) ? appliedDiscount.saving : 0;
        var saving     = savingInCurrency(savingGBP, payRegion);
        var discountedSubtotal = Math.max(0, t.subtotal - saving);
        var freeThresh = payRegion === 'EU' ? EU_FREE_THRESHOLD : FREE_THRESHOLD;
        var flatRate   = payRegion === 'EU' ? EU_SHIPPING_FLAT  : SHIPPING_FLAT;
        var finalShipping = discountedSubtotal >= freeThresh ? 0 : flatRate;
        var finalTotal    = Math.round((discountedSubtotal + finalShipping) * 100) / 100;
        var currency      = payRegion === 'EU' ? 'EUR' : 'GBP';

        var psChk = {};
        try { psChk = JSON.parse(sessionStorage.getItem('vp_checkout') || '{}'); } catch (ex) {}
        psChk.orderRef        = ref;
        psChk.subtotal        = t.subtotal;
        psChk.shipping        = finalShipping;
        psChk.discount_code   = appliedDiscount ? appliedDiscount.code   : '';
        psChk.discount_saving = saving;
        psChk.total           = finalTotal;
        psChk.cart_snapshot   = JSON.stringify(cart);
        psChk.payment_method  = 'psifi';
        psChk.currency        = currency;
        psChk.region          = payRegion;
        try { sessionStorage.setItem('vp_checkout', JSON.stringify(psChk)); } catch (ex) {}
        try { sessionStorage.removeItem('vp_order_fired'); } catch (ex) {}

        fetch('/api/create-psifi-payment', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            total:     finalTotal,  // full basket total in pounds/euros (e.g. 34.99)
            currency:  currency,
            order_ref: ref,
          }),
        })
        .then(function (resp) {
          return resp.json().then(function (data) {
            return { ok: resp.ok, status: resp.status, data: data };
          });
        })
        .then(function (result) {
          console.log('[checkout] create-psifi-payment response HTTP', result.status, JSON.stringify(result.data));
          if (result.ok && result.data.checkout_url) {
            window.location.href = result.data.checkout_url;
          } else {
            var errField = result.data.error;
            var errMsg = typeof errField === 'string'
              ? errField
              : (errField ? JSON.stringify(errField) : null);
            throw new Error(errMsg || ('PsiFi error HTTP ' + result.status));
          }
        })
        .catch(function (err) {
          var msg = (err && err.message) ? err.message : 'Payment failed — please try again or use bank transfer.';
          console.error('[checkout] create-psifi-payment error:', msg);
          if (errEl) errEl.textContent = msg;
          psifiPayBtn.disabled = false;
          psifiPayBtn.textContent = 'Pay Now →';
        });
      });
    }
    */ // END PsiFi disabled block

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
      var savingGBP  = (appliedDiscount && appliedDiscount.saving) ? appliedDiscount.saving : 0;
      var saving     = savingInCurrency(savingGBP, payRegion);
      var discountedSubtotal = Math.max(0, t.subtotal - saving);
      var freeThresh = payRegion === 'EU' ? EU_FREE_THRESHOLD : FREE_THRESHOLD;
      var flatRate   = payRegion === 'EU' ? EU_SHIPPING_FLAT  : SHIPPING_FLAT;
      var finalShipping = discountedSubtotal >= freeThresh ? 0 : flatRate;
      var finalTotal    = Math.round((discountedSubtotal + finalShipping) * 100) / 100;

      try {
        var existing = JSON.parse(sessionStorage.getItem('vp_checkout') || '{}');
        existing.orderRef        = ref;
        existing.subtotal        = t.subtotal;
        existing.shipping        = finalShipping;
        existing.discount_code   = appliedDiscount ? appliedDiscount.code   : '';
        existing.discount_saving = saving;
        existing.total           = finalTotal;
        existing.cart_snapshot   = JSON.stringify(cart);
        existing.currency        = payRegion === 'EU' ? 'EUR' : 'GBP';
        existing.region          = payRegion;
        existing.payment_method  = 'bank';
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
              payment_method:  chk.payment_method || 'bank',
              notes:           chk.orderRef || '',
              user_id:         uid,
              points_redeemed: Number(chk.points_redeemed) || 0,
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
