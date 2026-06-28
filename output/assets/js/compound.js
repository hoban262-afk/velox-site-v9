(function () {
  'use strict';

  var form = document.getElementById('order-form');
  if (!form) return;

  // ── Price display update when size changes ────────────────────────────────
  var priceEls = document.querySelectorAll('.cp-size-p');
  var activePrice = { value: 0 };

  function readSelectedPrice() {
    var checked = form.querySelector('input[name="size"]:checked');
    if (checked) {
      activePrice.value = parseFloat(checked.getAttribute('data-price')) || 0;
    }
  }

  readSelectedPrice();

  // GA4 ecommerce: product view
  if (typeof gtag === 'function') {
    var _vi = form.querySelector('input[name="size"]:checked');
    gtag('event', 'view_item', {
      currency: 'GBP', value: activePrice.value,
      items: [{ item_id: form.getAttribute('data-compound') || '', item_name: form.getAttribute('data-name') || '', item_variant: _vi ? _vi.value : '', price: activePrice.value, quantity: 1 }]
    });
  }

  // First-party funnel beacon: product page viewed (once per page load).
  if (window.vpTrack) window.vpTrack('product_view');

  var sizeInputs = form.querySelectorAll('input[name="size"]');
  sizeInputs.forEach(function (input) {
    input.addEventListener('change', function () {
      readSelectedPrice();
    });
  });

  // ── Add to order ──────────────────────────────────────────────────────────
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var ack = form.querySelector('input[name="ack"]');
    if (ack && !ack.checked) {
      if (window.toast) window.toast('Please tick the research-use acknowledgement.');
      ack.focus();
      return;
    }

    var sizeInput = form.querySelector('input[name="size"]:checked');
    if (!sizeInput) {
      if (window.toast) window.toast('Please select a vial size.');
      return;
    }

    var slug = form.getAttribute('data-compound') || '';
    var name = form.getAttribute('data-name') || '';
    var url  = form.getAttribute('data-url') || '';
    var size  = sizeInput.value;
    var price = parseFloat(sizeInput.getAttribute('data-price')) || 0;

    // Read existing cart
    var cart = [];
    try {
      cart = JSON.parse(localStorage.getItem('vp_cart') || '[]');
    } catch (e) {
      cart = [];
    }

    // Find existing matching item
    var existing = null;
    cart.forEach(function (item) {
      if (item.slug === slug && item.size === size) existing = item;
    });

    if (existing) {
      existing.qty = (existing.qty || 1) + 1;
    } else {
      cart.push({ slug: slug, name: name, url: url, size: size, price: price, qty: 1 });
    }

    localStorage.setItem('vp_cart', JSON.stringify(cart));

    // Update nav count
    var countEl = document.getElementById('nav-cart-count');
    if (countEl) {
      var total = cart.reduce(function (s, i) { return s + (i.qty || 1); }, 0);
      countEl.textContent = String(total);
    }

    // GA4 ecommerce: add to cart
    if (typeof gtag === 'function') {
      gtag('event', 'add_to_cart', {
        currency: 'GBP', value: price,
        items: [{ item_id: slug, item_name: name, item_variant: size, price: price, quantity: 1 }]
      });
    }

    // First-party funnel beacon: item added to cart.
    if (window.vpTrack) window.vpTrack('add_to_cart');

    if (window.toast) window.toast('Added to order');
  });

}());

/* Velox Peps subscribe-&-save — adds a monthly auto-reorder button to the PDP buy box. */
(function () {
  function init() {
    var form = document.querySelector('form.cp-order-form[data-compound]');
    var addBtn = document.getElementById('add-to-order-btn');
    if (!form || !addBtn || document.getElementById('vp-subscribe-btn')) return;
    var slug = form.getAttribute('data-compound');
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'vp-subscribe-btn';
    b.className = 'cp-order-btn';
    b.style.cssText = 'margin-top:10px;background:transparent;border:1px solid #16d6a6;color:#16d6a6';
    b.textContent = 'Subscribe & save — deliver monthly';
    addBtn.insertAdjacentElement('afterend', b);
    b.addEventListener('click', async function () {
      var ack = form.querySelector('input[name="ack"]');
      if (ack && !ack.checked) { b.textContent = 'Please confirm research use above'; return; }
      var sizeEl = form.querySelector('input[name="size"]:checked');
      if (!sizeEl) { b.textContent = 'Select a size first'; return; }
      b.disabled = true; b.textContent = 'Setting up subscription…';
      var tok = null;
      try { var r = localStorage.getItem('sb-stkjdtyhaxejxqmbzyua-auth-token'); tok = r ? (JSON.parse(r) || {}).access_token : null; } catch (e) {}
      if (!tok) { location.href = '/account/?next=' + encodeURIComponent(location.pathname); return; }
      try {
        var resp = await fetch('/api/create-fena-recurring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
          body: JSON.stringify({ kind: 'reorder', items: [{ slug: slug, size: sizeEl.value, qty: 1 }] })
        });
        var d = await resp.json();
        if (resp.ok && d.paymentUrl) { location.href = d.paymentUrl; return; }
        b.disabled = false; b.textContent = 'Could not subscribe — ' + (d.error || 'try again');
      } catch (e) { b.disabled = false; b.textContent = 'Network error — try again'; }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
