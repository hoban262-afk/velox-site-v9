(function () {
  'use strict';

  var SHIPPING_FLAT = 3.80;
  var FREE_THRESHOLD = 80;

  function getCart() {
    try {
      return JSON.parse(localStorage.getItem('vp_cart') || '[]');
    } catch (e) {
      return [];
    }
  }

  function fmt(n) {
    return '£' + n.toFixed(2);
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cartTotals(cart) {
    var subtotal = cart.reduce(function (s, i) { return s + i.price * (i.qty || 1); }, 0);
    var shipping = subtotal >= FREE_THRESHOLD ? 0 : SHIPPING_FLAT;
    return { subtotal: subtotal, shipping: shipping, total: subtotal + shipping };
  }

  // ── Discount code helpers ─────────────────────────────────────────────────

  /**
   * Look up a code in DISCOUNT_CODES (defined in discount-codes.js).
   * Returns { code, type, value, saving } or null if invalid/inactive.
   * Saving is computed against the order subtotal.
   */
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

  /**
   * Update the totals sidebar to reflect an applied discount.
   * Pass null as `discount` to reset to undiscounted totals.
   */
  function renderTotalsWithDiscount(cart, discount) {
    var t = cartTotals(cart);
    var saving = (discount && discount.saving) ? discount.saving : 0;
    // Post-discount subtotal determines whether delivery is free
    var discountedSubtotal = Math.max(0, t.subtotal - saving);
    var shipping = discountedSubtotal >= FREE_THRESHOLD ? 0 : SHIPPING_FLAT;
    var discountedTotal = discountedSubtotal + shipping;

    var subEl    = document.getElementById('co-subtotal');
    var shipEl   = document.getElementById('co-shipping');
    var totEl    = document.getElementById('co-total');
    var discLine = document.getElementById('co-discount-line');
    var discLbl  = document.getElementById('co-discount-label');
    var discAmt  = document.getElementById('co-discount-amount');

    if (subEl)  subEl.textContent  = fmt(t.subtotal);
    if (shipEl) shipEl.textContent = shipping === 0 ? 'FREE' : fmt(shipping);

    if (discount && saving > 0) {
      if (discLine) discLine.style.display = '';
      if (discLbl)  discLbl.textContent  = discount.code;
      if (discAmt)  discAmt.textContent  = '−' + fmt(saving);
      if (totEl)    totEl.textContent    = fmt(discountedTotal);
    } else {
      if (discLine) discLine.style.display = 'none';
      if (totEl)    totEl.textContent = fmt(discountedTotal);
    }
  }

  function renderCartSummary(cart) {
    var el = document.getElementById('co-cart-items');
    if (!el) return;
    if (!cart.length) {
      el.innerHTML = '<p style="color:#9CA3AF;font-size:13px;">No items in order.</p>';
      return;
    }
    var html = '<ul class="co-cart-list">';
    cart.forEach(function (item) {
      html += '<li class="co-cart-row"><span class="co-cart-name">' + escHtml(item.name) +
        ' <span class="co-cart-size">' + escHtml(item.size) + '</span></span>' +
        '<span class="co-cart-price">' + fmt(item.price * (item.qty || 1)) + '</span></li>';
    });
    html += '</ul>';
    el.innerHTML = html;

    var t = cartTotals(cart);
    var subEl = document.getElementById('co-subtotal');
    var shipEl = document.getElementById('co-shipping');
    var totEl  = document.getElementById('co-total');
    if (subEl) subEl.textContent = fmt(t.subtotal);
    if (shipEl) shipEl.textContent = t.shipping === 0 ? 'FREE' : fmt(t.shipping);
    if (totEl) totEl.textContent = fmt(t.total);
  }

  function randChars(n) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < n; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  }

  function todayStr() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return '' + y + m + day;
  }

  var cart = getCart();
  var appliedDiscount = null; // set when a valid code is applied on the payment page

  // ── SHIPPING PAGE ────────────────────────────────────────────────────────
  var shippingForm = document.getElementById('shipping-form');
  if (shippingForm) {
    renderCartSummary(cart);

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

      if (missing.length) {
        if (errEl) errEl.textContent = 'Please fill in all required fields and tick the acknowledgement.';
        return;
      }
      if (errEl) errEl.textContent = '';

      var data = {
        fname:    document.getElementById('sh-fname').value.trim(),
        lname:    document.getElementById('sh-lname').value.trim(),
        email:    document.getElementById('sh-email').value.trim(),
        phone:    document.getElementById('sh-phone').value.trim(),
        addr1:    document.getElementById('sh-addr1').value.trim(),
        addr2:    (document.getElementById('sh-addr2') || {}).value || '',
        city:     document.getElementById('sh-city').value.trim(),
        postcode: document.getElementById('sh-post').value.trim(),
        country:  'United Kingdom',
      };

      try {
        sessionStorage.setItem('vp_checkout', JSON.stringify(data));
      } catch (ex) {}

      window.location.href = '/checkout/payment/';
    });
  }

  // ── PAYMENT PAGE ─────────────────────────────────────────────────────────
  var paymentForm = document.getElementById('payment-form');
  if (paymentForm) {
    renderCartSummary(cart);

    // ── Discount code input ───────────────────────────────────────────────
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
      var t = cartTotals(cart);
      var result = calcDiscount(t.subtotal, code);
      if (result) {
        appliedDiscount = result;
        discountMsg.innerHTML = '<span class="dc-ok">✓ Code applied — saving ' + fmt(result.saving) + '</span>';
        discountInput.disabled = true;
        if (discountApply) { discountApply.textContent = 'Applied'; discountApply.disabled = true; }
        renderTotalsWithDiscount(cart, appliedDiscount);
      } else {
        appliedDiscount = null;
        discountMsg.innerHTML = '<span class="dc-err">Invalid or inactive discount code.</span>';
        renderTotalsWithDiscount(cart, null);
      }
    }

    if (discountApply) discountApply.addEventListener('click', handleApply);
    if (discountInput) {
      discountInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); handleApply(); }
      });
    }
    // ─────────────────────────────────────────────────────────────────────

    // Show delivery address
    var deliverEl = document.getElementById('co-deliver-to');
    if (deliverEl) {
      try {
        var chk = JSON.parse(sessionStorage.getItem('vp_checkout') || '{}');
        if (chk.fname) {
          deliverEl.innerHTML = '<div class="co-deliver-hdr">Delivering to</div>' +
            '<div class="co-deliver-addr">' +
            escHtml(chk.fname + ' ' + chk.lname) + '<br>' +
            escHtml(chk.addr1) + '<br>' +
            (chk.addr2 ? escHtml(chk.addr2) + '<br>' : '') +
            escHtml(chk.city) + '<br>' +
            escHtml(chk.postcode) + '<br>' +
            escHtml(chk.country) +
            '</div>';
        }
      } catch (ex) {}
    }

    // Billing same as delivery toggle
    var billSame = document.getElementById('bill-same');
    var billFields = document.getElementById('bill-fields');
    if (billSame && billFields) {
      billSame.addEventListener('change', function () {
        billFields.style.display = billSame.checked ? 'none' : '';
      });
    }

    // Bank transfer fallback toggle
    var bankToggle = document.getElementById('bank-toggle');
    var bankDetailsPanel = document.getElementById('bank-details-panel');
    if (bankToggle && bankDetailsPanel) {
      bankToggle.addEventListener('click', function () {
        var open = bankDetailsPanel.style.display !== 'none';
        bankDetailsPanel.style.display = open ? 'none' : '';
        bankToggle.textContent = open ? 'Or pay by manual bank transfer ↓' : 'Hide bank transfer option ↑';
      });
    }

    // GoCardless Instant Bank Pay handler
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

        var ref = 'VP-' + todayStr() + '-' + randChars(4);
        var t = cartTotals(cart);
        var saving = (appliedDiscount && appliedDiscount.saving) ? appliedDiscount.saving : 0;
        var discountedSubtotal = Math.max(0, t.subtotal - saving);
        var finalShipping = discountedSubtotal >= FREE_THRESHOLD ? 0 : SHIPPING_FLAT;
        var finalTotal = discountedSubtotal + finalShipping;
        var amountPence = Math.round(finalTotal * 100);

        var gcChk = {};
        try { gcChk = JSON.parse(sessionStorage.getItem('vp_checkout') || '{}'); } catch (ex) {}
        gcChk.orderRef        = ref;
        gcChk.subtotal        = t.subtotal;
        gcChk.shipping        = finalShipping;
        gcChk.discount_code   = appliedDiscount ? appliedDiscount.code : '';
        gcChk.discount_saving = saving;
        gcChk.total           = finalTotal;
        gcChk.cart_snapshot   = JSON.stringify(cart);
        gcChk.payment_method  = 'instant';
        try { sessionStorage.setItem('vp_checkout', JSON.stringify(gcChk)); } catch (ex) {}
        try { sessionStorage.removeItem('vp_order_fired'); } catch (ex) {}

        fetch('/api/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount_pence:  amountPence,
            customer_name: ((gcChk.fname || '') + ' ' + (gcChk.lname || '')).trim(),
            email:         gcChk.email || '',
            description:   'Velox Peptides research compounds',
            order_ref:     ref
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
        .catch(function () {
          if (errEl) errEl.textContent = 'Payment initialisation failed. Please try again or use bank transfer below.';
          gcPayBtn.disabled = false;
          gcPayBtn.textContent = 'Pay Now →';
        });
      });
    }

    paymentForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = document.getElementById('co-err');
      var terms = paymentForm.querySelector('input[name="terms"]');
      if (!terms || !terms.checked) {
        if (errEl) errEl.textContent = 'Please accept the Terms & Conditions and Research Use Policy.';
        return;
      }
      if (errEl) errEl.textContent = '';

      // Disable the submit button immediately — prevents double-click resubmission
      var submitBtn = paymentForm.querySelector('button[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Processing…'; }

      var ref = 'VP-' + todayStr() + '-' + randChars(4);
      var t = cartTotals(cart);
      var saving = (appliedDiscount && appliedDiscount.saving) ? appliedDiscount.saving : 0;
      var discountedSubtotal = Math.max(0, t.subtotal - saving);
      var finalShipping = discountedSubtotal >= FREE_THRESHOLD ? 0 : SHIPPING_FLAT;
      var finalTotal = discountedSubtotal + finalShipping;

      try {
        var existing = JSON.parse(sessionStorage.getItem('vp_checkout') || '{}');
        existing.orderRef        = ref;
        existing.subtotal        = t.subtotal;
        existing.shipping        = finalShipping;
        existing.discount_code   = appliedDiscount ? appliedDiscount.code : '';
        existing.discount_saving = saving;
        existing.total           = finalTotal;
        // Snapshot the cart so the confirmation page can recover it even if
        // localStorage has already been cleared (e.g. page refresh)
        existing.cart_snapshot   = JSON.stringify(cart);
        sessionStorage.setItem('vp_checkout', JSON.stringify(existing));
      } catch (ex) {}

      // Reset the fired flag so the confirmation page treats this as a fresh order
      try { sessionStorage.removeItem('vp_order_fired'); } catch (ex) {}

      window.location.href = '/checkout/confirmation/';
    });
  }

  // ── CONFIRMATION PAGE ─────────────────────────────────────────────────────
  var confirmSummary = document.getElementById('confirm-summary');
  if (confirmSummary) {

    // Parse sessionStorage FIRST — we need cart_snapshot before deciding on confirmedCart
    var chk = {};
    try { chk = JSON.parse(sessionStorage.getItem('vp_checkout') || '{}'); } catch (ex) {}

    // Build confirmedCart from localStorage. If the page was refreshed and
    // localStorage was already cleared on the first visit, fall back to the
    // cart_snapshot saved into sessionStorage at payment-form submit time.
    var confirmedCart = cart.slice();
    if (!confirmedCart.length && chk.cart_snapshot) {
      try { confirmedCart = JSON.parse(chk.cart_snapshot); } catch (ex) {}
    }

    // Clear cart — order is placed
    localStorage.removeItem('vp_cart');
    var countEl = document.getElementById('nav-cart-count');
    if (countEl) countEl.textContent = '0';

    // Build the products string once — used by both email and Sheets
    // Format: "Semax 10mg x1 — £34.99, Selank 10mg x1 — £39.99"
    var productsList = confirmedCart.map(function (item) {
      return item.name + ' ' + item.size + ' x' + (item.qty || 1) +
             ' — ' + fmt(item.price * (item.qty || 1));
    }).join('\n');

    // Update DOM with order reference and total
    try {
      var refEl   = document.getElementById('confirm-ref');
      var ref2El  = document.getElementById('confirm-ref-2');
      var amtEl   = document.getElementById('confirm-amount');
      var subEl2  = document.getElementById('confirm-subtotal');
      var shipEl2 = document.getElementById('confirm-shipping');
      if (refEl   && chk.orderRef)           refEl.textContent   = chk.orderRef;
      if (ref2El  && chk.orderRef)           ref2El.textContent  = chk.orderRef;
      if (amtEl   && chk.total)              amtEl.textContent   = fmt(Number(chk.total));
      if (subEl2  && chk.subtotal != null)   subEl2.textContent  = fmt(Number(chk.subtotal));
      if (shipEl2 && chk.shipping != null)   shipEl2.textContent = Number(chk.shipping) === 0 ? 'FREE' : fmt(Number(chk.shipping));

      // Show discount row in bank details if a code was used
      if (chk.discount_code) {
        var discRow  = document.getElementById('confirm-discount-row');
        var discInfo = document.getElementById('confirm-discount-info');
        if (discRow)  discRow.style.display = '';
        if (discInfo) discInfo.textContent = chk.discount_code +
          ' (−' + fmt(Number(chk.discount_saving || 0)) + ')';
      }
    } catch (ex) {}

    // Send order notification emails + log to Sheets (fire-and-forget)
    // Guard: vp_order_fired is set to '1' the first time this runs.
    // On any subsequent page load or refresh the flag is already present,
    // so we skip the API calls entirely — preventing duplicate emails / sheet rows.
    var alreadyFired = sessionStorage.getItem('vp_order_fired') === '1';
    if (!alreadyFired && chk.orderRef && chk.email) {
      // Mark fired BEFORE the async calls — a refresh during the fetch cannot re-enter
      try { sessionStorage.setItem('vp_order_fired', '1'); } catch (ex) {}

      var shippingAddr = [chk.addr1, chk.addr2, chk.city, chk.postcode, chk.country]
        .filter(Boolean).join(', ');

      // ── Resend order emails ──────────────────────────────────────────────
      fetch('/api/send-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_number:     chk.orderRef,
          customer_name:    ((chk.fname || '') + ' ' + (chk.lname || '')).trim(),
          customer_email:   chk.email,
          customer_phone:   chk.phone || '',
          addr1:            chk.addr1    || '',
          addr2:            chk.addr2    || '',
          city:             chk.city     || '',
          postcode:         chk.postcode || '',
          country:          chk.country  || 'United Kingdom',
          shipping_address: shippingAddr,
          shipping_method:  'Royal Mail Tracked 24',
          order_items:      productsList,
          order_subtotal:   (Number(chk.subtotal)       || 0).toFixed(2),
          shipping_cost:    (Number(chk.shipping)        || 0).toFixed(2),
          discount_code:    chk.discount_code             || '',
          discount_saving:  (Number(chk.discount_saving) || 0).toFixed(2),
          order_total:      (Number(chk.total)           || 0).toFixed(2),
        })
      }).catch(function () { /* silent — don't block the confirmation page */ });

      // ── Google Sheets order logging ──────────────────────────────────────
      // Uses no-cors + text/plain to avoid a CORS preflight on the GAS endpoint.
      // The Apps Script receives e.postData.contents and parses the JSON itself.
      try {
        fetch(
          'https://script.google.com/macros/s/AKfycbwC6RyBK2pMsU7crR7TXpbUtgKNN6305hNvePzFmkMtz3kpXWZShIgdFkT68AhHAb1ZOg/exec',
          {
            method:  'POST',
            mode:    'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body:    JSON.stringify({
              orderId:      chk.orderRef,
              date:         new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }),
              name:         ((chk.fname || '') + ' ' + (chk.lname || '')).trim(),
              email:        chk.email  || '',
              phone:        chk.phone  || '',
              address:      shippingAddr,
              products:     productsList,
              total:        '£' + (Number(chk.total) || 0).toFixed(2),
              discountCode: chk.discount_code || 'None',
            })
          }
        ).catch(function () { /* silent */ });
      } catch (ex) { /* silent — sheet logging must never surface to the customer */ }
      // ────────────────────────────────────────────────────────────────────
    } // end !alreadyFired guard

    // Render order summary on the confirmation page
    renderCartSummary(confirmedCart.length ? confirmedCart : []);
  }

}());
