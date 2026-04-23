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

  function saveCart(cart) {
    localStorage.setItem('vp_cart', JSON.stringify(cart));
  }

  function fmt(n) {
    return '£' + n.toFixed(2);
  }

  function render() {
    var cart = getCart();
    var itemsEl  = document.getElementById('cart-items');
    var emptyEl  = document.getElementById('cart-empty');
    var summaryEl = document.getElementById('cart-summary');
    var subtotalEl = document.getElementById('cart-subtotal');
    var shippingEl = document.getElementById('cart-shipping');
    var totalEl    = document.getElementById('cart-total');

    if (!itemsEl) return;

    if (!cart.length) {
      if (emptyEl) emptyEl.style.display = '';
      if (summaryEl) summaryEl.style.display = 'none';
      itemsEl.innerHTML = '';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (summaryEl) summaryEl.style.display = '';

    // Render rows
    itemsEl.innerHTML = '';
    cart.forEach(function (item, idx) {
      var row = document.createElement('div');
      row.className = 'cart-item';
      row.innerHTML = '<div class="cart-item-info">' +
        '<a class="cart-item-name" href="' + (item.url || '#') + '">' + escHtml(item.name) + '</a>' +
        '<div class="cart-item-size">' + escHtml(item.size) + '</div>' +
        '</div>' +
        '<div class="cart-item-price">' + fmt(item.price) + '</div>' +
        '<div class="cart-item-qty">' +
        '<button class="cart-qty-btn" data-idx="' + idx + '" data-delta="-1">−</button>' +
        '<span class="cart-qty-val">' + (item.qty || 1) + '</span>' +
        '<button class="cart-qty-btn" data-idx="' + idx + '" data-delta="1">+</button>' +
        '</div>' +
        '<button class="cart-remove" data-idx="' + idx + '" aria-label="Remove">✕</button>';
      itemsEl.appendChild(row);
    });

    // Qty / remove handlers
    itemsEl.querySelectorAll('.cart-qty-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.getAttribute('data-idx'), 10);
        var d = parseInt(btn.getAttribute('data-delta'), 10);
        var c = getCart();
        c[i].qty = Math.max(1, (c[i].qty || 1) + d);
        saveCart(c);
        render();
      });
    });
    itemsEl.querySelectorAll('.cart-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.getAttribute('data-idx'), 10);
        var c = getCart();
        c.splice(i, 1);
        saveCart(c);
        render();
      });
    });

    // Totals
    var subtotal = cart.reduce(function (s, i) { return s + i.price * (i.qty || 1); }, 0);
    var shipping = subtotal >= FREE_THRESHOLD ? 0 : SHIPPING_FLAT;
    var total = subtotal + shipping;

    if (subtotalEl) subtotalEl.textContent = fmt(subtotal);
    if (shippingEl) shippingEl.textContent = shipping === 0 ? 'Free' : fmt(shipping);
    if (totalEl)    totalEl.textContent = fmt(total);

    // Update nav count
    var countEl = document.getElementById('nav-cart-count');
    if (countEl) {
      var qty = cart.reduce(function (s, i) { return s + (i.qty || 1); }, 0);
      countEl.textContent = String(qty);
    }
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  render();

}());
