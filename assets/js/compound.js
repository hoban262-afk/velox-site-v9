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

    if (window.toast) window.toast('Added to order');
  });

}());
