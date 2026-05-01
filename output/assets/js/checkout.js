(function () {
  'use strict';

  var SHIPPING_FLAT = 4.99;
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
    var discountedTotal = Math.max(0, t.total - saving);

    var subEl    = document.getElementById('co-subtotal');
    var shipEl   = document.getElementById('co-shipping');
    var totEl    = document.getElementById('co-total');
    var discLine = document.getElementById('co-discount-line');
    var discLbl  = document.getElementById('co-discount-label');
    var discAmt  = document.getElementById('co-discount-amount');

    if (subEl)  subEl.textContent  = fmt(t.subtotal);
    if (shipEl) shipEl.textContent = t.shipping === 0 ? 'Free' : fmt(t.shipping);

    if (discount && saving > 0) {
      if (discLine) discLine.style.display = '';
      if (discLbl)  discLbl.textContent  = discount.code;
      if (discAmt)  discAmt.textContent  = '−' + fmt(saving);
      if (totEl)    totEl.textContent    = fmt(discountedTotal);
    } else {
      if (discLine) discLine.style.display = 'none';
      if (totEl)    totEl.textContent = fmt(t.total);
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
    if (shipEl) shipEl.textContent = t.shipping === 0 ? 'Free' : fmt(t.shipping);
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

    paymentForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = document.getElementById('co-err');
      var terms = paymentForm.querySelector('input[name="terms"]');
      if (!terms || !terms.checked) {
        if (errEl) errEl.textContent = 'Please accept the Terms & Conditions and Research Use Policy.';
        return;
      }
      if (errEl) errEl.textContent = '';

      var ref = 'VP-' + todayStr() + '-' + randChars(4);
      var t = cartTotals(cart);
      var saving = (appliedDiscount && appliedDiscount.saving) ? appliedDiscount.saving : 0;
      var finalTotal = Math.max(0, t.total - saving);

      try {
        var existing = JSON.parse(sessionStorage.getItem('vp_checkout') || '{}');
        existing.orderRef       = ref;
        existing.subtotal       = t.subtotal;
        existing.shipping       = t.shipping;
        existing.discount_code  = appliedDiscount ? appliedDiscount.code : '';
        existing.discount_saving = saving;
        existing.total          = finalTotal;
        sessionStorage.setItem('vp_checkout', JSON.stringify(existing));
      } catch (ex) {}

      window.location.href = '/checkout/confirmation/';
    });
  }

  // ── CONFIRMATION PAGE ─────────────────────────────────────────────────────
  var confirmSummary = document.getElementById('confirm-summary');
  if (confirmSummary) {
    // Snapshot cart before clearing — needed for the order email
    var confirmedCart = cart.slice();

    // Clear cart — order is placed
    localStorage.removeItem('vp_cart');
    var countEl = document.getElementById('nav-cart-count');
    if (countEl) countEl.textContent = '0';

    // Parse sessionStorage — isolated so a parse failure doesn't block the fetch
    var chk = {};
    try { chk = JSON.parse(sessionStorage.getItem('vp_checkout') || '{}'); } catch (ex) {}

    // Update DOM with order reference and total — isolated so a DOM error can't kill the fetch
    try {
      var refEl  = document.getElementById('confirm-ref');
      var ref2El = document.getElementById('confirm-ref-2');
      var amtEl  = document.getElementById('confirm-amount');
      if (refEl  && chk.orderRef) refEl.textContent  = chk.orderRef;
      if (ref2El && chk.orderRef) ref2El.textContent = chk.orderRef;
      if (amtEl  && chk.total)    amtEl.textContent  = fmt(Number(chk.total));

      // Show discount row in bank details if a code was used
      if (chk.discount_code) {
        var discRow  = document.getElementById('confirm-discount-row');
        var discInfo = document.getElementById('confirm-discount-info');
        if (discRow)  discRow.style.display = '';
        if (discInfo) discInfo.textContent = chk.discount_code +
          ' (−' + fmt(Number(chk.discount_saving || 0)) + ')';
      }
    } catch (ex) {}

    // Send order notification emails (fire-and-forget) — runs outside any try/catch
    if (chk.orderRef && chk.email) {
      var itemLines = confirmedCart.map(function (item) {
        return item.name + ' (' + item.size + ') x' + (item.qty || 1) +
               ' — ' + fmt(item.price * (item.qty || 1));
      }).join('\n');

      var shippingAddr = [chk.addr1, chk.addr2, chk.city, chk.postcode, chk.country]
        .filter(Boolean).join(', ');

      fetch('/api/send-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_number:     chk.orderRef,
          customer_name:    (chk.fname || '') + ' ' + (chk.lname || ''),
          customer_email:   chk.email,
          customer_phone:   chk.phone || '',
          addr1:            chk.addr1    || '',
          addr2:            chk.addr2    || '',
          city:             chk.city     || '',
          postcode:         chk.postcode || '',
          country:          chk.country  || 'United Kingdom',
          shipping_address: shippingAddr,
          shipping_method:  'Royal Mail Tracked 48',
          order_items:      itemLines,
          order_subtotal:   (Number(chk.subtotal)        || 0).toFixed(2),
          shipping_cost:    (Number(chk.shipping)         || 0).toFixed(2),
          discount_code:    chk.discount_code              || '',
          discount_saving:  (Number(chk.discount_saving)  || 0).toFixed(2),
          order_total:      (Number(chk.total)            || 0).toFixed(2),
        })
      }).catch(function () { /* silent — don't block the confirmation page */ });
    }

    // Render order summary
    renderCartSummary(confirmedCart.length ? confirmedCart : []);
  }

}());
